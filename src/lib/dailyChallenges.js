export const CHALLENGES = [
  { id: "two-tasks", text: "Complete 2 tasks today", check: (ctx) => ctx.completedToday >= 2 },
  { id: "three-tasks", text: "Complete 3 tasks today", check: (ctx) => ctx.completedToday >= 3 },
  { id: "45-minutes", text: "Log 45 minutes of focused work", check: (ctx) => ctx.secondsToday >= 45 * 60 },
  { id: "one-hour", text: "Log a full hour of tracked time", check: (ctx) => ctx.secondsToday >= 60 * 60 },
  { id: "start-session", text: "Start at least one work session", check: (ctx) => ctx.secondsToday > 0 },
  { id: "finish-category", text: "Finish every remaining task in one category", check: (ctx) => ctx.categoryStats.some((c) => c.percent === 100) },
];

function dayOfYear(d) {
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d - start;
  return Math.floor(diff / 86400000);
}

export function todaysChallenge() {
  const idx = dayOfYear(new Date()) % CHALLENGES.length;
  return CHALLENGES[idx];
}
