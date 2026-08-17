/**
 * XP / level / title curve — preserved exactly from the original tracker so
 * existing XP totals map to the same level and title as before. Only new
 * tiers were appended above the previous ceiling (level 15) for prestige.
 */
export function levelInfo(xp) {
  let level = 1, needed = 100, cum = 0;
  while (xp >= cum + needed) {
    cum += needed;
    level++;
    needed = 100 + (level - 1) * 25;
  }
  return { level, xpIntoLevel: xp - cum, xpForLevel: needed, xp };
}

export function levelTitle(level) {
  if (level >= 30) return "Reconciliation Legend";
  if (level >= 25) return "Grandmaster of the Close";
  if (level >= 20) return "Chief Reconciliation Officer, Prestige";
  if (level >= 15) return "Chief Reconciliation Officer";
  if (level >= 11) return "Ledger Master";
  if (level >= 8) return "Senior Reconciler";
  if (level >= 5) return "Balance Keeper";
  if (level >= 3) return "Reconciliation Apprentice";
  return "Ledger Rookie";
}

export function levelRankTier(level) {
  if (level >= 25) return "platinum";
  if (level >= 15) return "gold";
  if (level >= 8) return "silver";
  return "bronze";
}

/**
 * Badge/achievement catalog. The first ten entries (through "level-5") are
 * verbatim from the original tracker — same ids, same unlock rules — so any
 * badges a user has already earned keep showing as earned. Everything after
 * is new, additive content from the redesign brief.
 */
export const BADGES = [
  { id: "first-reconciliation", name: "First Reconciliation", desc: "Mark your very first task as reconciled.", icon: "flag", tier: "bronze" },
  { id: "ten-done", name: "Getting the Hang of It", desc: "Reconcile 10 tasks in total.", icon: "star", tier: "bronze" },
  { id: "fifty-done", name: "Reconciliation Machine", desc: "Reconcile 50 tasks in total.", icon: "trophy", tier: "silver" },
  { id: "perfect-month", name: "Perfect Month", desc: "Hit 100% completion in a single month.", icon: "sparkles", tier: "gold" },
  { id: "streak-3", name: "3-Day Streak", desc: "Work on the tracker 3 days in a row.", icon: "flame", tier: "bronze" },
  { id: "streak-7", name: "Week Warrior", desc: "Work on the tracker 7 days in a row.", icon: "flame", tier: "silver" },
  { id: "migration-quarter", name: "Quarter Way There", desc: "Convert 25% of patient names.", icon: "medal", tier: "bronze" },
  { id: "migration-half", name: "Halfway Hero", desc: "Convert 50% of patient names.", icon: "medal", tier: "silver" },
  { id: "migration-done", name: "Migration Complete", desc: "Convert all patient names to Arabic.", icon: "party-popper", tier: "gold" },
  { id: "level-5", name: "Level 5 Reached", desc: "Reach Level 5 — Balance Keeper.", icon: "award", tier: "silver" },

  // --- Category mastery ---
  { id: "cat-payroll-done", name: "Payroll Closed", desc: "Finish every Payroll task in a month.", icon: "wallet", tier: "silver", categoryId: "payroll" },
  { id: "cat-credit-card-done", name: "Cards Balanced", desc: "Finish every Credit Card task in a month.", icon: "credit-card", tier: "silver", categoryId: "credit-card" },
  { id: "cat-cash-done", name: "Cash Squared Away", desc: "Finish every Cash & Petty Cash task in a month.", icon: "banknote", tier: "silver", categoryId: "cash" },
  { id: "cat-verification-done", name: "Verified & Compliant", desc: "Finish every Verification & Compliance task in a month.", icon: "shield-check", tier: "silver", categoryId: "verification" },
  { id: "all-categories-month", name: "Every Category Closed", desc: "Complete all 13 categories in a single month.", icon: "layers", tier: "gold" },

  // --- Time & effort ---
  { id: "hours-5", name: "Five Hours In", desc: "Log 5 hours of total work time.", icon: "clock", tier: "bronze" },
  { id: "hours-10", name: "Ten Hours In", desc: "Log 10 hours of total work time.", icon: "clock", tier: "silver" },
  { id: "hours-50", name: "Fifty Hours In", desc: "Log 50 hours of total work time.", icon: "hourglass", tier: "gold" },
  { id: "marathon-session", name: "Marathon Session", desc: "Work a single uninterrupted session of 3+ hours.", icon: "gauge", tier: "gold" },
  { id: "fast-reconciliation", name: "Fast Reconciliation", desc: "Reconcile a task in under 5 minutes of tracked time.", icon: "zap", tier: "silver" },
  { id: "early-bird", name: "Early Bird", desc: "Start a work session before 7:00 AM.", icon: "sunrise", tier: "bronze" },
  { id: "night-owl", name: "Night Owl", desc: "Start a work session at or after 10:00 PM.", icon: "moon-star", tier: "bronze" },

  // --- Volume ---
  { id: "hundred-done", name: "Century Club", desc: "Reconcile 100 tasks in total.", icon: "crown", tier: "platinum" },
  { id: "no-overdue", name: "Nothing Left Behind", desc: "Have zero incomplete tasks in any past month.", icon: "square-check", tier: "gold" },
  { id: "closed-before-deadline", name: "Closed Before Deadline", desc: "Reach 100% for a month before your closing deadline day.", icon: "calendar-check", tier: "gold" },

  // --- Streaks ---
  { id: "streak-14", name: "Two-Week Streak", desc: "Work on the tracker 14 days in a row.", icon: "flame", tier: "gold" },
  { id: "streak-30", name: "30-Day Streak", desc: "Work on the tracker 30 days in a row.", icon: "flame", tier: "platinum" },
  { id: "streak-week-4", name: "A Month of Weeks", desc: "Log time in 4 different calendar weeks.", icon: "calendar-days", tier: "silver" },

  // --- Levels / prestige ---
  { id: "level-10", name: "Level 10 Reached", desc: "Reach Level 10 — Ledger Master territory.", icon: "medal", tier: "silver" },
  { id: "level-15", name: "Level 15 Reached", desc: "Reach Level 15 — Chief Reconciliation Officer.", icon: "crown", tier: "gold" },
  { id: "level-25", name: "Level 25 Reached", desc: "Reach Level 25 — Grandmaster of the Close.", icon: "gem", tier: "platinum" },
];

export const BADGES_BY_ID = Object.fromEntries(BADGES.map((b) => [b.id, b]));

export const XP_RULES = {
  taskReconciled: 10,
  migrationTaskCompleted: 15,
  dailyGoalMet: 20,
  dailyChallengeCompleted: 25,
};

export function xpProgressPercent(xp) {
  const info = levelInfo(xp);
  return Math.min(100, Math.round((info.xpIntoLevel / info.xpForLevel) * 100));
}

const QUOTES = [
  "Every reconciled line is a problem that can never surprise you again.",
  "Close the month like it owes you money.",
  "Small, steady entries beat frantic marathons at deadline.",
  "A clean ledger is a quiet mind.",
  "Discipline today, zero surprises at audit.",
  "The books don't lie — and neither should the process that built them.",
  "Progress, not perfection. Then perfection anyway.",
  "You don't rise to the deadline, you fall to your system. Trust the board.",
  "Reconciled is a feeling. Chase it.",
  "Future-you is grateful for every source link you save today.",
];
export function quoteOfTheDay() {
  const day = Math.floor(Date.now() / 86400000);
  return QUOTES[day % QUOTES.length];
}

const ENCOURAGEMENTS = [
  "Nice work — keep the momentum going.",
  "That's one less thing to think about at close.",
  "Clean entry. The ledger thanks you.",
  "You're on a roll.",
  "Solid pace today.",
  "That's the kind of consistency that adds up fast.",
];
export function randomEncouragement() {
  return ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)];
}

export function greetingForNow(name) {
  const h = new Date().getHours();
  const who = name ? `, ${name}` : "";
  if (h < 5) return `Burning the midnight oil${who}?`;
  if (h < 12) return `Good morning${who}`;
  if (h < 17) return `Good afternoon${who}`;
  if (h < 21) return `Good evening${who}`;
  return `Working late${who}?`;
}
