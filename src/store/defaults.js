import { buildDefaultTaskDefinitions, buildDefaultCategoryDefs } from "../data/taskDefinitions.js";
import { DEFAULT_WORKING_DAYS } from "../lib/recurrence.js";

export const DEFAULT_GAME = {
  xp: 0,
  streak: 0,
  lastActiveDate: null,
  badges: [],
  monthClosedAt: {}, // { [monthKey]: timestampFirstReached100 }
  dailyGoalClaimedDate: null,
  dailyChallengeClaimedDate: null,
  showcaseBadge: null,
};

export const DEFAULT_MIGRATION = { total: 720, log: [], tasks: [] };

export const DEFAULT_SETTINGS = {
  theme: "dark", // 'dark' | 'light' | 'system'
  accent: "classic", // 'classic' | 'midnight' | 'royal' | 'aurora'
  soundEnabled: false,
  notificationsEnabled: false,
  closingDeadlineDay: 5,
  dailyGoalTasks: 3,
  reduceMotion: false,
  // Business rule, not a device preference — syncs like closingDeadlineDay.
  // Default for this deployment: Sunday-Thursday working, Friday-Saturday
  // weekend. Configurable in Settings; the recurrence engine has no
  // hard-coded weekend anywhere and only ever reads this array.
  workingDays: DEFAULT_WORKING_DAYS,
};

// Seeded once as the initial value for the taskDefinitions/categoryDefs
// stored state (see AppDataProvider.jsx) — the original 53 tasks / 13
// categories, now as editable records instead of frozen constants. See
// data/taskDefinitions.js for why this requires no separate migration step.
export const DEFAULT_TASK_DEFINITIONS = buildDefaultTaskDefinitions();
export const DEFAULT_CATEGORY_DEFS = buildDefaultCategoryDefs();

export const ACCENT_UNLOCKS = {
  classic: { label: "Classic Blue", requires: null },
  midnight: { label: "Midnight", requires: { type: "level", value: 5 } },
  royal: { label: "Royal", requires: { type: "level", value: 10 } },
  aurora: { label: "Aurora", requires: { type: "badge", value: "streak-30" } },
};
