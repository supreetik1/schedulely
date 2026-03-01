export type Task = {
  id: string;
  title: string;
  preferredDeadline: string;
  estimatedMinutes: number;
};

export type SleepQuestionnaire = {
  averageHours: number;
  bedtime: string;
  wakeTime: string;
  difficultyFallingAsleep: "never" | "sometimes" | "often";
};

export type DailyCheckIn = {
  mood: "low" | "okay" | "good";
  eating: "irregular" | "balanced" | "excellent";
  sleepQuality: "poor" | "fair" | "good";
  wellnessResponse: "energized" | "steady" | "overwhelmed";
};

export type ScheduleBlock = {
  time: string;
  activity: string;
  note: string;
};

export type GeneratedSchedule = {
  generatedAt: string;
  overview: string;
  blocks: ScheduleBlock[];
  wellbeingTips: string[];
};
