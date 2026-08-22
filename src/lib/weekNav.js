/**
 * Dashboard week navigation — Sunday-start, matching the accounting week
 * (Sunday-Thursday working, Friday-Saturday weekend), NOT the ISO
 * Monday-start week used by isoWeekKey() in format.js (that function drives
 * existing streak/gamification behavior in Timeline and must not change —
 * see the Product Cleanup note about eventually reconciling the two).
 */

export function startOfWeekSunday(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d.getTime();
}

export function endOfWeekSunday(weekStartMs) {
  const d = new Date(weekStartMs);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export function shiftWeek(weekStartMs, deltaWeeks) {
  const d = new Date(weekStartMs);
  d.setDate(d.getDate() + deltaWeeks * 7);
  return startOfWeekSunday(d.getTime());
}

/** Stable "YYYY-MM-DD" key for the week's Sunday — safe for React keys/equality checks. */
export function weekKey(weekStartMs) {
  const d = new Date(weekStartMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function weekLabel(weekStartMs) {
  const start = new Date(weekStartMs);
  const end = new Date(endOfWeekSunday(weekStartMs));
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const startStr = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endStr = end.toLocaleDateString("en-US", sameMonth ? { day: "numeric" } : { month: "short", day: "numeric" });
  return `${startStr}–${endStr}, ${end.getFullYear()}`;
}

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
