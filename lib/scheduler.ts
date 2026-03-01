import { DailyCheckIn, GeneratedSchedule, SleepQuestionnaire, Task } from "./types";

const toMinutes = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

const toTime = (minutesInDay: number) => {
  const bounded = ((minutesInDay % 1440) + 1440) % 1440;
  const hours = Math.floor(bounded / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (bounded % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
};

const isExamTask = (title: string) => /(exam|test|quiz|midterm|final)/i.test(title);

const adjustedTaskMinutes = (task: Task, checkIn: DailyCheckIn): number => {
  const examTask = isExamTask(task.title);
  let multiplier = 1;

  if (checkIn.wellnessResponse === "overwhelmed") {
    multiplier = examTask ? 1.2 : 0.8;
  } else if (checkIn.wellnessResponse === "energized") {
    multiplier = examTask ? 1.25 : 1.05;
  }

  if (checkIn.mood === "low" && !examTask) {
    multiplier *= 0.9;
  }

  return Math.max(20, Math.round(task.estimatedMinutes * multiplier));
};

export const parseTasksFromCsv = (csvContent: string): Task[] => {
  const lines = csvContent
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const rows = lines.map((line) => line.split(",").map((item) => item.trim()));

  if (rows.length === 0) return [];

  const firstRow = rows[0].map((cell) => cell.toLowerCase());
  const hasHeader = firstRow.includes("task") || firstRow.includes("title");
  const dataRows = hasHeader ? rows.slice(1) : rows;

  return dataRows.map((row, index) => {
    const title = row[0] || `Imported Task ${index + 1}`;
    const deadline =
      row[1] && !Number.isNaN(Date.parse(row[1]))
        ? row[1]
        : new Date(Date.now() + (index + 1) * 86400000).toISOString().slice(0, 10);
    const estimatedMinutes = Math.max(15, Number.parseInt(row[2] ?? "", 10) || 45);

    return {
      id: `csv-${Date.now()}-${index}`,
      title,
      preferredDeadline: deadline,
      estimatedMinutes,
    };
  });
};

export const generateSchedule = (
  tasks: Task[],
  sleep: SleepQuestionnaire,
  checkIn: DailyCheckIn,
): GeneratedSchedule => {
  const sortedTasks = [...tasks].sort(
    (a, b) => new Date(a.preferredDeadline).getTime() - new Date(b.preferredDeadline).getTime(),
  );

  const wake = toMinutes(sleep.wakeTime);
  const bed = toMinutes(sleep.bedtime);
  const morningStart = wake + 45;
  const breakMinutes = checkIn.sleepQuality === "poor" ? 15 : 10;
  const wellnessCadence = sortedTasks.length <= 2 ? sortedTasks.length : checkIn.mood === "low" ? 3 : 4;

  const blocks: GeneratedSchedule["blocks"] = [
    {
      time: `${sleep.wakeTime}-${toTime(wake + 25)}`,
      activity: "Morning routine",
      note: "Hydrate and start with 5-10 minutes of movement.",
    },
  ];

  let cursor = morningStart;
  let breakCount = 0;
  let wellnessCheckCount = 0;
  let exerciseCount = 0;
  let totalStudyMinutes = 0;

  sortedTasks.forEach((task, index) => {
    const duration = adjustedTaskMinutes(task, checkIn);
    const taskEnd = cursor + duration;
    totalStudyMinutes += duration;

    blocks.push({
      time: `${toTime(cursor)}-${toTime(taskEnd)}`,
      activity: `Study: ${task.title}`,
      note: `Target completion before ${task.preferredDeadline} (${duration} min planned).`,
    });

    cursor = taskEnd;

    const shouldAddWellnessCheck =
      wellnessCadence > 0 && (index + 1) % wellnessCadence === 0 && index + 1 <= sortedTasks.length;

    if (shouldAddWellnessCheck) {
      const checkEnd = cursor + 10;
      blocks.push({
        time: `${toTime(cursor)}-${toTime(checkEnd)}`,
        activity: "Wellness check",
        note: "Quick mood/energy check. If overwhelmed, shorten next non-exam block and use active recall.",
      });
      cursor = checkEnd;
      wellnessCheckCount += 1;
    }

    if (index < sortedTasks.length - 1) {
      const breakEnd = cursor + breakMinutes;
      blocks.push({
        time: `${toTime(cursor)}-${toTime(breakEnd)}`,
        activity: "Break",
        note: "Step away from screens, hydrate, and reset posture.",
      });
      cursor = breakEnd;
      breakCount += 1;
    }

    if (index === 1) {
      const exerciseEnd = cursor + 20;
      blocks.push({
        time: `${toTime(cursor)}-${toTime(exerciseEnd)}`,
        activity: "Exercise",
        note: "Light movement session to restore focus and energy.",
      });
      cursor = exerciseEnd;
      exerciseCount += 1;
    }
  });

  blocks.push({
    time: `${toTime(bed - 45)}-${sleep.bedtime}`,
    activity: "Wind-down",
    note: "Low-screen routine to improve sleep consistency.",
  });

  const wellbeingTips: string[] = [];
  const latestFocusedEnd = bed - 45;
  const workWindowMinutes = Math.max(0, latestFocusedEnd - morningStart);
  const overheadMinutes = breakCount * breakMinutes + wellnessCheckCount * 10 + exerciseCount * 20;
  const overloadedSchedule = totalStudyMinutes + overheadMinutes > workWindowMinutes;

  if (checkIn.wellnessResponse === "overwhelmed") {
    wellbeingTips.push("Shortened non-exam homework blocks and protected exam prep time in this plan.");
    wellbeingTips.push("Use 2 focused passes: 1) core concepts, 2) exam-style questions.");
  }

  if (checkIn.wellnessResponse === "energized") {
    wellbeingTips.push("Extended deep-work windows, especially for exam-heavy tasks.");
  }

  if (sleep.averageHours < 7) {
    wellbeingTips.push("Aim for +30 minutes of sleep tonight before adding extra workload.");
  }

  if (sleep.difficultyFallingAsleep === "often") {
    wellbeingTips.push("Keep caffeine before 2 PM and add a 10-minute pre-bed breathing routine.");
  }

  if (checkIn.eating === "irregular") {
    wellbeingTips.push("Set meal reminders between task blocks to stabilize energy.");
  }

  if (checkIn.sleepQuality === "poor") {
    wellbeingTips.push("Use 20-25 minute focus sprints with short breaks to reduce fatigue.");
  }

  if (breakCount === 0 && overloadedSchedule) {
    wellbeingTips.push(
      "Today is overloaded with no break room. Move 1-2 lower-priority tasks to tomorrow to protect focus and health.",
    );
  }

  if (wellbeingTips.length === 0) {
    wellbeingTips.push("Maintain your routine and review your hardest topic in the first focus block.");
  }

  return {
    generatedAt: new Date().toISOString(),
    overview: `Plan built for ${tasks.length} tasks with breaks and wellness checks every ${wellnessCadence} task(s).`,
    blocks,
    wellbeingTips,
  };
};
