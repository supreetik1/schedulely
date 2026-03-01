"use client";

import { ChangeEvent, useMemo, useState } from "react";
import { generateSchedule, parseTasksFromCsv } from "@/lib/scheduler";
import { DailyCheckIn, GeneratedSchedule, SleepQuestionnaire, Task } from "@/lib/types";

const TOTAL_QUIZ_STEPS = 8;
const SAVED_TASKS_KEY = "schedulely-saved-tasks-v1";
const SAVED_TASKS_COOKIE_KEY = "schedulely_saved_tasks";
const WELLNESS_DONE_COOKIE_KEY = "schedulely_wellness_done";

type Option<T> = {
  label: string;
  value: T;
};

type TaskRow = {
  id: string;
  title: string;
  preferredDeadline: string;
  estimatedMinutes: string;
};

type AdjustReason = "task_harder" | "focus_drop" | "break_needed" | "external_delay" | "health_need";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const toIsoDate = (date: Date) => {
  const copy = new Date(date);
  const tzOffsetMs = copy.getTimezoneOffset() * 60000;
  return new Date(copy.getTime() - tzOffsetMs).toISOString().slice(0, 10);
};

const createTaskRow = (index = 0): TaskRow => {
  const date = new Date();
  date.setDate(date.getDate() + index + 1);
  return {
    id: `task-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: "",
    preferredDeadline: date.toISOString().slice(0, 10),
    estimatedMinutes: "45",
  };
};

const sleepHoursOptions: Option<number>[] = [
  { label: "Under 6 hours", value: 5 },
  { label: "6 to 7 hours", value: 6.5 },
  { label: "7 to 8 hours", value: 7.5 },
  { label: "8+ hours", value: 8.5 },
];

const bedtimeOptions: Option<string>[] = [
  { label: "Before 10:00 PM", value: "21:45" },
  { label: "10:00 PM - 11:00 PM", value: "22:30" },
  { label: "11:00 PM - 12:00 AM", value: "23:30" },
  { label: "After 12:00 AM", value: "00:30" },
];

const wakeOptions: Option<string>[] = [
  { label: "Before 6:30 AM", value: "06:15" },
  { label: "6:30 AM - 7:30 AM", value: "07:00" },
  { label: "7:30 AM - 8:30 AM", value: "08:00" },
  { label: "After 8:30 AM", value: "09:00" },
];

const fallAsleepOptions: Option<SleepQuestionnaire["difficultyFallingAsleep"]>[] = [
  { label: "Never", value: "never" },
  { label: "Sometimes", value: "sometimes" },
  { label: "Often", value: "often" },
];

const moodOptions: Option<DailyCheckIn["mood"]>[] = [
  { label: "Low", value: "low" },
  { label: "Okay", value: "okay" },
  { label: "Good", value: "good" },
];

const eatingOptions: Option<DailyCheckIn["eating"]>[] = [
  { label: "Irregular", value: "irregular" },
  { label: "Balanced", value: "balanced" },
  { label: "Excellent", value: "excellent" },
];

const sleepQualityOptions: Option<DailyCheckIn["sleepQuality"]>[] = [
  { label: "Poor", value: "poor" },
  { label: "Fair", value: "fair" },
  { label: "Good", value: "good" },
];

const wellnessResponseOptions: Option<DailyCheckIn["wellnessResponse"]>[] = [
  { label: "I feel energized", value: "energized" },
  { label: "I feel steady", value: "steady" },
  { label: "I feel overwhelmed", value: "overwhelmed" },
];

const getCookie = (name: string) => {
  if (typeof document === "undefined") return null;
  const encodedName = `${encodeURIComponent(name)}=`;
  const parts = document.cookie.split(";").map((part) => part.trim());
  const found = parts.find((part) => part.startsWith(encodedName));
  if (!found) return null;
  return decodeURIComponent(found.slice(encodedName.length));
};

const setCookie = (name: string, value: string, days = 30) => {
  if (typeof document === "undefined") return;
  const expires = new Date(Date.now() + days * 86400000).toUTCString();
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
};

export default function Home() {
  const todayIso = toIsoDate(new Date());
  const initialMonth = new Date();
  initialMonth.setDate(1);

  const [taskRows, setTaskRows] = useState<TaskRow[]>(() => {
    if (typeof window !== "undefined") {
      const cookieValue = getCookie(SAVED_TASKS_COOKIE_KEY);
      if (cookieValue) {
        try {
          const parsed = JSON.parse(cookieValue) as TaskRow[];
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        } catch {
          return [createTaskRow(0), createTaskRow(1), createTaskRow(2)];
        }
      }

      const stored = window.localStorage.getItem(SAVED_TASKS_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as TaskRow[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        } catch {
          return [createTaskRow(0), createTaskRow(1), createTaskRow(2)];
        }
      }
    }
    return [createTaskRow(0), createTaskRow(1), createTaskRow(2)];
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedSchedule, setGeneratedSchedule] = useState<GeneratedSchedule | null>(null);
  const [csvStatus, setCsvStatus] = useState("No CSV imported yet.");
  const [saveStatus, setSaveStatus] = useState("");
  const [planStatus, setPlanStatus] = useState("");
  const [activeScreen, setActiveScreen] = useState<"calendar" | "planner">("calendar");
  const [selectedPlanDate, setSelectedPlanDate] = useState(todayIso);
  const [calendarMonth, setCalendarMonth] = useState(initialMonth);
  const [currentQuizStep, setCurrentQuizStep] = useState(0);
  const [isQuizTransitioning, setIsQuizTransitioning] = useState(false);
  const [isWellnessQuizClosed, setIsWellnessQuizClosed] = useState(() => {
    const cookieValue = getCookie(WELLNESS_DONE_COOKIE_KEY);
    return cookieValue === "true";
  });
  const [adjustBlockIndex, setAdjustBlockIndex] = useState<number | null>(null);
  const [adjustTargetEnd, setAdjustTargetEnd] = useState("18:00");
  const [adjustReason, setAdjustReason] = useState<AdjustReason>("task_harder");
  const [adjustmentSuggestions, setAdjustmentSuggestions] = useState<string[]>([]);
  const [removeConfirmIndex, setRemoveConfirmIndex] = useState<number | null>(null);
  const [optimizeStatus, setOptimizeStatus] = useState("");

  const [sleepQuestionnaire, setSleepQuestionnaire] = useState<SleepQuestionnaire>({
    averageHours: 7.5,
    bedtime: "23:30",
    wakeTime: "07:00",
    difficultyFallingAsleep: "sometimes",
  });

  const [dailyCheckIn, setDailyCheckIn] = useState<DailyCheckIn>({
    mood: "okay",
    eating: "balanced",
    sleepQuality: "fair",
    wellnessResponse: "steady",
  });
  const isWellnessComplete = isWellnessQuizClosed;

  const tasks = useMemo<Task[]>(() => {
    return taskRows
      .filter((row) => row.title.trim() && row.preferredDeadline)
      .map((row) => ({
        id: row.id,
        title: row.title.trim(),
        preferredDeadline: row.preferredDeadline,
        estimatedMinutes: Math.max(15, Number.parseInt(row.estimatedMinutes, 10) || 45),
      }));
  }, [taskRows]);

  const tasksForSelectedDay = useMemo(
    () => tasks.filter((task) => task.preferredDeadline === selectedPlanDate),
    [tasks, selectedPlanDate],
  );
  const firstTaskDate = useMemo(() => tasks[0]?.preferredDeadline ?? null, [tasks]);

  const calendarCells = useMemo(() => {
    const monthStart = new Date(calendarMonth);
    monthStart.setDate(1);
    const month = monthStart.getMonth();
    const firstWeekday = (monthStart.getDay() + 6) % 7;
    const gridStart = new Date(monthStart);
    gridStart.setDate(monthStart.getDate() - firstWeekday);

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      return {
        key: toIsoDate(date),
        label: date.getDate(),
        isCurrentMonth: date.getMonth() === month,
      };
    });
  }, [calendarMonth]);

  const handleTaskRowChange = (id: string, field: keyof Omit<TaskRow, "id">, value: string) => {
    setTaskRows((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));
  };

  const addTaskRow = () => {
    setTaskRows((prev) => [
      ...prev,
      {
        ...createTaskRow(prev.length),
        preferredDeadline: selectedPlanDate,
      },
    ]);
  };

  const removeTaskRow = (id: string) => {
    setTaskRows((prev) => (prev.length > 1 ? prev.filter((row) => row.id !== id) : prev));
  };

  const handleCsvUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const raw = await file.text();
    const importedTasks = parseTasksFromCsv(raw);

    if (importedTasks.length === 0) {
      setCsvStatus("CSV parsed with 0 tasks. Check formatting.");
      return;
    }

    setTaskRows(
      importedTasks.map((task) => ({
        id: task.id,
        title: task.title,
        preferredDeadline: task.preferredDeadline,
        estimatedMinutes: String(task.estimatedMinutes),
      })),
    );
    setCsvStatus(`Imported ${importedTasks.length} tasks from ${file.name}.`);
  };

  const handleAutoAdvance = (applySelection: () => void) => {
    if (isQuizTransitioning) return;

    applySelection();

    if (currentQuizStep < TOTAL_QUIZ_STEPS - 1) {
      setIsQuizTransitioning(true);
      window.setTimeout(() => {
        setCurrentQuizStep((prev) => Math.min(TOTAL_QUIZ_STEPS - 1, prev + 1));
        setIsQuizTransitioning(false);
      }, 220);
      return;
    }

    setIsQuizTransitioning(true);
    window.setTimeout(() => {
      setIsWellnessQuizClosed(true);
      setCookie(WELLNESS_DONE_COOKIE_KEY, "true", 30);
      setIsQuizTransitioning(false);
    }, 220);
  };

  const handleGenerateSchedule = async () => {
    if (tasks.length === 0) return;
    if (tasksForSelectedDay.length === 0) {
      setPlanStatus("No tasks on selected day. Add tasks for this date or pick another date.");
      return;
    }

    setIsGenerating(true);
    setGeneratedSchedule(null);
    setPlanStatus("");

    await new Promise((resolve) => setTimeout(resolve, 1800));

    const schedule = generateSchedule(tasksForSelectedDay, sleepQuestionnaire, dailyCheckIn);
    setGeneratedSchedule(schedule);
    setIsGenerating(false);
  };

  const handleSaveTaskRow = (rowId: string) => {
    if (typeof window === "undefined") return;
    const rowToSave = taskRows.find((row) => row.id === rowId);
    if (!rowToSave || !rowToSave.title.trim()) {
      setSaveStatus("Add a task title before saving.");
      return;
    }

    const stored = window.localStorage.getItem(SAVED_TASKS_KEY);
    const existing: TaskRow[] = stored ? (JSON.parse(stored) as TaskRow[]) : [];
    const upserted = [...existing.filter((row) => row.id !== rowId), rowToSave];
    window.localStorage.setItem(SAVED_TASKS_KEY, JSON.stringify(upserted));
    setCookie(SAVED_TASKS_COOKIE_KEY, JSON.stringify(upserted), 30);
    setSaveStatus(`Saved task: ${rowToSave.title}`);
    if (rowToSave.preferredDeadline !== selectedPlanDate) {
      setSelectedPlanDate(rowToSave.preferredDeadline);
      const monthForTask = new Date(rowToSave.preferredDeadline);
      monthForTask.setDate(1);
      setCalendarMonth(monthForTask);
      setPlanStatus(`Switched planning day to ${rowToSave.preferredDeadline} to match saved task.`);
    }
  };

  const shiftTimeRange = (range: string, deltaMinutes: number) => {
    const [start, end] = range.split("-");
    if (!start || !end) return range;

    const toMinutes = (time: string) => {
      const [h, m] = time.split(":").map(Number);
      return h * 60 + m;
    };
    const toTime = (mins: number) => {
      const bounded = ((mins % 1440) + 1440) % 1440;
      const h = String(Math.floor(bounded / 60)).padStart(2, "0");
      const m = String(bounded % 60).padStart(2, "0");
      return `${h}:${m}`;
    };

    return `${toTime(toMinutes(start) + deltaMinutes)}-${toTime(toMinutes(end) + deltaMinutes)}`;
  };

  const getDurationFromRange = (range: string) => {
    const [start, end] = range.split("-");
    if (!start || !end) return 0;
    const toMinutes = (time: string) => {
      const [h, m] = time.split(":").map(Number);
      return h * 60 + m;
    };
    return toMinutes(end) - toMinutes(start);
  };

  const getEndFromRange = (range: string) => {
    const [, end] = range.split("-");
    return end ?? "18:00";
  };

  const timeToMinutes = (time: string) => {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
  };

  const isValidTime = (time: string) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(time);

  const handleOpenAdjustModal = (index: number) => {
    if (!generatedSchedule) return;
    setAdjustBlockIndex(index);
    setAdjustTargetEnd(getEndFromRange(generatedSchedule.blocks[index].time));
    setAdjustReason("task_harder");
  };

  const handleApplyAdjustModal = () => {
    if (!generatedSchedule || adjustBlockIndex === null) return;
    if (!isValidTime(adjustTargetEnd)) return;
    const block = generatedSchedule.blocks[adjustBlockIndex];
    const currentEnd = getEndFromRange(block.time);
    const delta = timeToMinutes(adjustTargetEnd) - timeToMinutes(currentEnd);
    if (delta === 0) {
      setAdjustBlockIndex(null);
      return;
    }

    const targetDuration = getDurationFromRange(block.time) + delta;
    if (targetDuration < 5) return;

    const suggestionByReason: Record<AdjustReason, string[]> = {
      task_harder: [
        "Break this task into two smaller checkpoints before moving to the next block.",
        "Use active recall for 5 minutes at the end of this block to improve retention.",
      ],
      focus_drop: [
        "Use a 20/5 focus cycle for the next two study blocks.",
        "Hide notifications and keep only one study source open.",
      ],
      break_needed: [
        "Insert a short hydration/walk break before the following study block.",
        "Use light movement to regain focus before resuming.",
      ],
      external_delay: [
        "Prioritize deadline-near tasks first after this shift.",
        "Trim low-priority review tasks for today and move them to tomorrow.",
      ],
      health_need: [
        "Protect sleep and recovery blocks; avoid late-night catch-up sessions.",
        "Switch heavy tasks to medium-intensity tasks for the next block if energy is low.",
      ],
    };

    if (!generatedSchedule) return;
    const updatedBlocks = generatedSchedule.blocks.map((block, i) => {
      if (i < adjustBlockIndex) return block;
      if (i === adjustBlockIndex) {
        const [start, end] = block.time.split("-");
        if (!start || !end) return block;
        const newEnd = shiftTimeRange(`${end}-${end}`, delta).split("-")[0];
        return { ...block, time: `${start}-${newEnd}` };
      }
      return { ...block, time: shiftTimeRange(block.time, delta) };
    });

    setGeneratedSchedule({
      ...generatedSchedule,
      blocks: updatedBlocks,
    });
    setAdjustmentSuggestions(suggestionByReason[adjustReason]);
    setAdjustBlockIndex(null);
  };

  const handleConfirmRemoveBlock = () => {
    if (removeConfirmIndex === null || !generatedSchedule) return;
    const index = removeConfirmIndex;
    if (!generatedSchedule) return;
    const blockToRemove = generatedSchedule.blocks[index];
    const removedDuration = getDurationFromRange(blockToRemove.time);

    const updatedBlocks = generatedSchedule.blocks
      .filter((_, i) => i !== index)
      .map((block, i) => (i >= index ? { ...block, time: shiftTimeRange(block.time, -removedDuration) } : block));

    setGeneratedSchedule({
      ...generatedSchedule,
      blocks: updatedBlocks,
    });
    setRemoveConfirmIndex(null);
  };

  const monthLabel = useMemo(
    () => calendarMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
    [calendarMonth],
  );

  const shiftCalendarMonth = (direction: -1 | 1) => {
    setCalendarMonth((prev) => {
      const next = new Date(prev);
      next.setMonth(prev.getMonth() + direction);
      return next;
    });
  };

  const getBlockMeta = (activity: string) => {
    const lower = activity.toLowerCase();
    if (lower.includes("study")) return { label: "Study", tone: "study" };
    if (lower.includes("break")) return { label: "Break", tone: "break" };
    if (lower.includes("wellness")) return { label: "Wellness", tone: "wellness" };
    if (lower.includes("exercise")) return { label: "Exercise", tone: "exercise" };
    if (lower.includes("wind-down") || lower.includes("sleep")) return { label: "Sleep", tone: "sleep" };
    return { label: "Routine", tone: "routine" };
  };

  const splitRange = (range: string) => {
    const [start, end] = range.split("-");
    return { start: start ?? "", end: end ?? "" };
  };

  const setEndInRange = (range: string, end: string) => {
    const { start } = splitRange(range);
    return `${start}-${end}`;
  };

  const getBlockBubbles = (block: GeneratedSchedule["blocks"][number]) => {
    const duration = getDurationFromRange(block.time);
    const lower = block.activity.toLowerCase();
    const bubbles: { tone: "hint" | "warn"; text: string }[] = [];

    if (lower.includes("study") && duration > 90) {
      bubbles.push({ tone: "warn", text: "Overload warning: this block is very long." });
      bubbles.push({ tone: "hint", text: "Maybe you can spend less time here and move part to tomorrow." });
    }

    if (lower.includes("break") && duration < 8) {
      bubbles.push({ tone: "warn", text: "Break may be too short for real recovery." });
    }

    if (lower.includes("wellness") && duration < 8) {
      bubbles.push({ tone: "hint", text: "Consider adding 2-3 more minutes for check-in quality." });
    }

    if (lower.includes("exercise") && duration > 35) {
      bubbles.push({ tone: "hint", text: "Could shorten exercise today to protect study time." });
    }

    if (!lower.includes("break") && !lower.includes("wellness") && !lower.includes("exercise") && duration > 120) {
      bubbles.push({ tone: "warn", text: "Warning: this may cause fatigue and reduce retention." });
    }

    return bubbles;
  };

  const handleOptimizeSchedule = () => {
    if (!generatedSchedule) return;

    let cumulativeShift = 0;
    let longBlocksTrimmed = 0;

    const shifted = generatedSchedule.blocks.map((block) => {
      const shiftedTime = shiftTimeRange(block.time, cumulativeShift);
      const lower = block.activity.toLowerCase();

      if (!lower.includes("study")) {
        return { ...block, time: shiftedTime };
      }

      const duration = getDurationFromRange(shiftedTime);
      if (duration <= 90) {
        return { ...block, time: shiftedTime };
      }

      const trimBy = Math.min(15, duration - 45);
      const newEnd = shiftTimeRange(`${splitRange(shiftedTime).end}-${splitRange(shiftedTime).end}`, -trimBy).split("-")[0];
      cumulativeShift -= trimBy;
      longBlocksTrimmed += 1;
      return {
        ...block,
        time: setEndInRange(shiftedTime, newEnd),
        note: `${block.note} Optimized: trimmed by ${trimBy} min for better pacing.`,
      };
    });

    const optimizedBlocks = [...shifted];
    const hasBreak = optimizedBlocks.some((block) => block.activity.toLowerCase().includes("break"));
    const studyCandidates = optimizedBlocks
      .map((block, index) => ({ index, duration: getDurationFromRange(block.time), block }))
      .filter((entry) => entry.block.activity.toLowerCase().includes("study") && entry.duration >= 35)
      .sort((a, b) => b.duration - a.duration);

    let breakInserted = false;
    if (!hasBreak && studyCandidates.length > 0) {
      const target = studyCandidates[0];
      const targetRange = splitRange(target.block.time);
      const reducedEnd = shiftTimeRange(`${targetRange.end}-${targetRange.end}`, -10).split("-")[0];

      optimizedBlocks[target.index] = {
        ...target.block,
        time: setEndInRange(target.block.time, reducedEnd),
        note: `${target.block.note} Optimized: 10-min break inserted after this block.`,
      };

      optimizedBlocks.splice(target.index + 1, 0, {
        time: `${reducedEnd}-${targetRange.end}`,
        activity: "Break",
        note: "AI optimization inserted this break to reduce overload.",
      });
      breakInserted = true;
    }

    const suggestions: string[] = [];
    if (longBlocksTrimmed > 0) {
      suggestions.push(`Optimized ${longBlocksTrimmed} long study block(s) to reduce fatigue.`);
    }
    if (breakInserted) {
      suggestions.push("Inserted a recovery break because no breaks were present in the schedule.");
    }
    if (suggestions.length === 0) {
      suggestions.push("Schedule already has balanced block lengths and recovery spacing.");
    }

    setGeneratedSchedule({
      ...generatedSchedule,
      blocks: optimizedBlocks,
      wellbeingTips: [...generatedSchedule.wellbeingTips, "Schedule optimization pass completed."],
    });
    setAdjustmentSuggestions((prev) => [...suggestions, ...prev]);
    setOptimizeStatus("Schedule optimized.");
  };

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div>
          <p className="eyebrow">Student Planner + Wellbeing</p>
          <h1>Schedulely</h1>
        </div>
        <div className="screen-switch">
          <button
            type="button"
            className={`btn btn-secondary ${activeScreen === "calendar" ? "is-active" : ""}`}
            onClick={() => setActiveScreen("calendar")}
          >
            Calendar
          </button>
          <button
            type="button"
            className={`btn btn-secondary ${activeScreen === "planner" ? "is-active" : ""}`}
            onClick={() => setActiveScreen("planner")}
          >
            Planner
          </button>
        </div>
      </header>

      {activeScreen === "calendar" ? (
        <main className="calendar-screen">
          <section className="panel calendar-screen-panel">
            <h2>Calendar Planning</h2>
            <p className="muted">Pick a date, then continue to Planner to build and generate that day&apos;s schedule.</p>
            <div className="calendar-card calendar-card-large">
              <div className="calendar-head">
                <button type="button" className="btn btn-secondary" onClick={() => shiftCalendarMonth(-1)}>
                  Prev
                </button>
                <p className="calendar-month">{monthLabel}</p>
                <button type="button" className="btn btn-secondary" onClick={() => shiftCalendarMonth(1)}>
                  Next
                </button>
              </div>
              <div className="calendar-grid calendar-weekdays">
                {WEEKDAY_LABELS.map((weekday) => (
                  <span key={weekday}>{weekday}</span>
                ))}
              </div>
              <div className="calendar-grid">
                {calendarCells.map((cell) => (
                  <button
                    key={cell.key}
                    type="button"
                    className={`calendar-day ${cell.isCurrentMonth ? "" : "muted-day"} ${
                      selectedPlanDate === cell.key ? "selected" : ""
                    }`}
                    onClick={() => setSelectedPlanDate(cell.key)}
                  >
                    {cell.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="status">Selected planning day: {selectedPlanDate}</p>
            <p className="status">Tasks on this day: {tasksForSelectedDay.length}</p>
            <div className="row-actions">
              <button type="button" className="btn btn-primary" onClick={() => setActiveScreen("planner")}>
                Plan This Day
              </button>
            </div>
          </section>
        </main>
      ) : (
        <main className="grid-layout">
        <section className={`panel ${!isWellnessComplete ? "panel-faded" : ""}`}>
          <h2>Task Planner</h2>
          <p className="muted">Enter tasks in columns below. Schedules are unlimited.</p>
          <p className="status">
            Planning day: <strong>{selectedPlanDate}</strong>
          </p>
          <button type="button" className="btn btn-secondary" onClick={() => setActiveScreen("calendar")}>
            Change Day in Calendar
          </button>

          <div className="task-table">
            <div className="task-table-head">
              <span>Task</span>
              <span>Deadline</span>
              <span>Est. Minutes</span>
              <span>Save</span>
              <span>Remove</span>
            </div>

            {taskRows.map((row) => (
              <div key={row.id} className="task-table-row">
                <div className="task-cell">
                  <label className="cell-label">Task</label>
                  <input
                    type="text"
                    placeholder="Task name"
                    value={row.title}
                    onChange={(event) => handleTaskRowChange(row.id, "title", event.target.value)}
                  />
                </div>
                <div className="task-cell">
                  <label className="cell-label">Deadline</label>
                  <input
                    type="date"
                    value={row.preferredDeadline}
                    onChange={(event) => handleTaskRowChange(row.id, "preferredDeadline", event.target.value)}
                  />
                </div>
                <div className="task-cell">
                  <label className="cell-label">Est. Minutes</label>
                  <input
                    className="minutes-input"
                    type="number"
                    min={15}
                    step={5}
                    placeholder="45"
                    value={row.estimatedMinutes}
                    onChange={(event) => handleTaskRowChange(row.id, "estimatedMinutes", event.target.value)}
                  />
                </div>
                <button type="button" className="btn btn-ghost" onClick={() => handleSaveTaskRow(row.id)}>
                  Save
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => removeTaskRow(row.id)}>
                  Remove
                </button>
              </div>
            ))}
          </div>

          <div className="row-actions">
            <button type="button" className="btn btn-secondary" onClick={addTaskRow}>
              Add Row
            </button>
            <label className="csv-label">
              Import CSV
              <input type="file" accept=".csv" onChange={handleCsvUpload} />
            </label>
          </div>

          <p className="status">{csvStatus}</p>
          {saveStatus && <p className="status">{saveStatus}</p>}
          {planStatus && <p className="warning">{planStatus}</p>}
          {tasks.length > 0 && tasksForSelectedDay.length === 0 && firstTaskDate && (
            <div className="row-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setSelectedPlanDate(firstTaskDate);
                  const monthForTask = new Date(firstTaskDate);
                  monthForTask.setDate(1);
                  setCalendarMonth(monthForTask);
                  setPlanStatus("");
                }}
              >
                Use first task date ({firstTaskDate})
              </button>
            </div>
          )}
          <p className="status">
            Ready tasks for selected day: {tasksForSelectedDay.length} (total tasks: {tasks.length})
          </p>

          <div className="usage-card">
            <p className="status">Unlimited schedules available.</p>
            {!isWellnessComplete && <p className="warning">Finish the wellness quiz first to unlock schedule generation.</p>}
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleGenerateSchedule}
              disabled={!isWellnessComplete || tasks.length === 0 || isGenerating}
            >
              {isWellnessComplete ? "Generate AI Schedule" : "Complete Wellness Quiz First"}
            </button>
          </div>
        </section>

        <section className={`panel ${!isWellnessComplete ? "panel-required" : ""}`}>
          <h2>Wellness Quiz</h2>
          {!isWellnessComplete && <p className="warning">Required: complete this quiz before generating a schedule.</p>}
          {isWellnessQuizClosed ? (
            <div className="quiz-closed-card">
              <p className="status">Wellness quiz completed and closed.</p>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setCurrentQuizStep(0);
                  setIsWellnessQuizClosed(false);
                  setCookie(WELLNESS_DONE_COOKIE_KEY, "false", 30);
                }}
              >
                Reopen Wellness Quiz
              </button>
            </div>
          ) : (
            <>
              <p className="quiz-step-label">
                Step {currentQuizStep + 1} of {TOTAL_QUIZ_STEPS}
              </p>
              <div className="quiz-progress" aria-hidden="true">
                <span style={{ width: `${((currentQuizStep + 1) / TOTAL_QUIZ_STEPS) * 100}%` }} />
              </div>

              <div className="quiz-list">
                {currentQuizStep === 0 && (
                  <div key="step-0" className={`quiz-block ${isQuizTransitioning ? "fade-out" : "fade-in"}`}>
                    <p className="quiz-q">How much sleep do you usually get?</p>
                    <div className="quiz-options">
                      {sleepHoursOptions.map((option) => (
                        <button
                          key={option.label}
                          type="button"
                          className={`quiz-option ${sleepQuestionnaire.averageHours === option.value ? "active" : ""}`}
                          onClick={() =>
                            handleAutoAdvance(() =>
                              setSleepQuestionnaire((prev) => ({
                                ...prev,
                                averageHours: option.value,
                              })),
                            )
                          }
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {currentQuizStep === 1 && (
                  <div key="step-1" className={`quiz-block ${isQuizTransitioning ? "fade-out" : "fade-in"}`}>
                    <p className="quiz-q">What is your usual bedtime?</p>
                    <div className="quiz-options">
                      {bedtimeOptions.map((option) => (
                        <button
                          key={option.label}
                          type="button"
                          className={`quiz-option ${sleepQuestionnaire.bedtime === option.value ? "active" : ""}`}
                          onClick={() =>
                            handleAutoAdvance(() =>
                              setSleepQuestionnaire((prev) => ({
                                ...prev,
                                bedtime: option.value,
                              })),
                            )
                          }
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {currentQuizStep === 2 && (
                  <div key="step-2" className={`quiz-block ${isQuizTransitioning ? "fade-out" : "fade-in"}`}>
                    <p className="quiz-q">When do you usually wake up?</p>
                    <div className="quiz-options">
                      {wakeOptions.map((option) => (
                        <button
                          key={option.label}
                          type="button"
                          className={`quiz-option ${sleepQuestionnaire.wakeTime === option.value ? "active" : ""}`}
                          onClick={() =>
                            handleAutoAdvance(() =>
                              setSleepQuestionnaire((prev) => ({
                                ...prev,
                                wakeTime: option.value,
                              })),
                            )
                          }
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {currentQuizStep === 3 && (
                  <div key="step-3" className={`quiz-block ${isQuizTransitioning ? "fade-out" : "fade-in"}`}>
                    <p className="quiz-q">How often is falling asleep difficult?</p>
                    <div className="quiz-options">
                      {fallAsleepOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={`quiz-option ${sleepQuestionnaire.difficultyFallingAsleep === option.value ? "active" : ""}`}
                          onClick={() =>
                            handleAutoAdvance(() =>
                              setSleepQuestionnaire((prev) => ({
                                ...prev,
                                difficultyFallingAsleep: option.value,
                              })),
                            )
                          }
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {currentQuizStep === 4 && (
                  <div key="step-4" className={`quiz-block ${isQuizTransitioning ? "fade-out" : "fade-in"}`}>
                    <p className="quiz-q">How is your mood today?</p>
                    <div className="quiz-options">
                      {moodOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={`quiz-option ${dailyCheckIn.mood === option.value ? "active" : ""}`}
                          onClick={() =>
                            handleAutoAdvance(() =>
                              setDailyCheckIn((prev) => ({
                                ...prev,
                                mood: option.value,
                              })),
                            )
                          }
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {currentQuizStep === 5 && (
                  <div key="step-5" className={`quiz-block ${isQuizTransitioning ? "fade-out" : "fade-in"}`}>
                    <p className="quiz-q">How have your meals been today?</p>
                    <div className="quiz-options">
                      {eatingOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={`quiz-option ${dailyCheckIn.eating === option.value ? "active" : ""}`}
                          onClick={() =>
                            handleAutoAdvance(() =>
                              setDailyCheckIn((prev) => ({
                                ...prev,
                                eating: option.value,
                              })),
                            )
                          }
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {currentQuizStep === 6 && (
                  <div key="step-6" className={`quiz-block ${isQuizTransitioning ? "fade-out" : "fade-in"}`}>
                    <p className="quiz-q">How was last night&apos;s sleep quality?</p>
                    <div className="quiz-options">
                      {sleepQualityOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={`quiz-option ${dailyCheckIn.sleepQuality === option.value ? "active" : ""}`}
                          onClick={() =>
                            handleAutoAdvance(() =>
                              setDailyCheckIn((prev) => ({
                                ...prev,
                                sleepQuality: option.value,
                              })),
                            )
                          }
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {currentQuizStep === 7 && (
                  <div key="step-7" className={`quiz-block ${isQuizTransitioning ? "fade-out" : "fade-in"}`}>
                    <p className="quiz-q">During wellness checks, how do you usually feel while studying?</p>
                    <div className="quiz-options">
                      {wellnessResponseOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={`quiz-option ${dailyCheckIn.wellnessResponse === option.value ? "active" : ""}`}
                          onClick={() =>
                            handleAutoAdvance(() =>
                              setDailyCheckIn((prev) => ({
                                ...prev,
                                wellnessResponse: option.value,
                              })),
                            )
                          }
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="quiz-nav">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setCurrentQuizStep((prev) => Math.max(0, prev - 1))}
                  disabled={currentQuizStep === 0 || isQuizTransitioning}
                >
                  Back
                </button>
                {currentQuizStep === TOTAL_QUIZ_STEPS - 1 && <p className="quiz-done">Quiz complete</p>}
              </div>
            </>
          )}

        </section>

        <section className={`panel schedule-panel ${!isWellnessComplete ? "panel-faded" : ""}`}>
          <h2>Generated Schedule</h2>
          {!generatedSchedule && (
            <p className="muted">Generate a schedule for {selectedPlanDate} to see breaks, wellness checks, and tips.</p>
          )}

          {generatedSchedule && (
            <>
              <p className="status">{generatedSchedule.overview}</p>
              <ul className="schedule-list">
                {generatedSchedule.blocks.map((block, index) => (
                  <li key={`${block.time}-${index}`} className={`schedule-card schedule-card--${getBlockMeta(block.activity).tone}`}>
                    <div className="schedule-card-head">
                      <p className="time">
                        <span>{splitRange(block.time).start}</span>
                        <span className="time-sep">to</span>
                        <span>{splitRange(block.time).end}</span>
                      </p>
                      <span className="schedule-chip">{getBlockMeta(block.activity).label}</span>
                    </div>
                    <div className="schedule-main">
                      <p className="schedule-step">#{index + 1}</p>
                      <p className="activity">{block.activity}</p>
                    </div>
                    <p className="note">{block.note}</p>
                    {getBlockBubbles(block).length > 0 && (
                      <div className="bubble-row">
                        {getBlockBubbles(block).map((bubble, bubbleIndex) => (
                          <p
                            key={`${bubble.text}-${bubbleIndex}`}
                            className={`bubble bubble-${bubble.tone}`}
                          >
                            {bubble.text}
                          </p>
                        ))}
                      </div>
                    )}
                    <div className="block-actions">
                      <button type="button" className="btn btn-ghost" onClick={() => handleOpenAdjustModal(index)}>
                        Adjust time
                      </button>
                      <button type="button" className="btn btn-ghost" onClick={() => setRemoveConfirmIndex(index)}>
                        Remove from schedule
                      </button>
                    </div>
                  </li>
                ))}
              </ul>

              <h3>General Suggestions</h3>
              <ul className="tips">
                {generatedSchedule.wellbeingTips.map((tip, index) => (
                  <li key={`${tip}-${index}`}>{tip}</li>
                ))}
              </ul>
              <button type="button" className="btn btn-primary" onClick={handleOptimizeSchedule}>
                Optimize Schedule?
              </button>
              {optimizeStatus && <p className="status">{optimizeStatus}</p>}

              {adjustmentSuggestions.length > 0 && (
                <>
                  <h3>Adjustment Suggestions</h3>
                  <ul className="tips">
                    {adjustmentSuggestions.map((tip, index) => (
                      <li key={`${tip}-${index}`}>{tip}</li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </section>
        </main>
      )}

      {adjustBlockIndex !== null && generatedSchedule && (
        <div className="action-modal-overlay">
          <div className="action-modal">
            <h3>Adjust Block Time</h3>
            <p className="status">
              {generatedSchedule.blocks[adjustBlockIndex].activity} ({generatedSchedule.blocks[adjustBlockIndex].time})
            </p>
            <div className="field-grid">
              <label>
                Adjust this block to end at
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="HH:MM"
                  value={adjustTargetEnd}
                  onChange={(event) => setAdjustTargetEnd(event.target.value)}
                />
              </label>
              <label>
                Reason for adjustment
                <select value={adjustReason} onChange={(event) => setAdjustReason(event.target.value as AdjustReason)}>
                  <option value="task_harder">Task is harder than expected</option>
                  <option value="focus_drop">Focus dropped</option>
                  <option value="break_needed">Need more break/recovery</option>
                  <option value="external_delay">External interruption/delay</option>
                  <option value="health_need">Sleep/health need</option>
                </select>
              </label>
            </div>
            {!isValidTime(adjustTargetEnd) && <p className="warning">Use 24-hour format: HH:MM (example: 18:30).</p>}
            <div className="row-actions">
              <button type="button" className="btn btn-primary" onClick={handleApplyAdjustModal}>
                Apply
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setAdjustBlockIndex(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {removeConfirmIndex !== null && generatedSchedule && (
        <div className="action-modal-overlay">
          <div className="action-modal">
            <h3>Remove From Schedule?</h3>
            <p className="status">
              Are you sure you want to remove: <strong>{generatedSchedule.blocks[removeConfirmIndex].activity}</strong>?
            </p>
            <div className="row-actions">
              <button type="button" className="btn btn-primary" onClick={handleConfirmRemoveBlock}>
                Yes, Remove
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setRemoveConfirmIndex(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {isGenerating && (
        <div className="loading-overlay" role="status" aria-live="polite">
          <div className="loading-card">
            <p className="spinner" aria-hidden="true" />
            <h2>Generating schedule...</h2>
            <p>Balancing deadlines, breaks, and wellness check-ins.</p>
          </div>
        </div>
      )}
    </div>
  );
}
