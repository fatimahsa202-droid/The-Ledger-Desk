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
};

export const ACCENT_UNLOCKS = {
  classic: { label: "Classic Blue", requires: null },
  midnight: { label: "Midnight", requires: { type: "level", value: 5 } },
  royal: { label: "Royal", requires: { type: "level", value: 10 } },
  aurora: { label: "Aurora", requires: { type: "badge", value: "streak-30" } },
};
