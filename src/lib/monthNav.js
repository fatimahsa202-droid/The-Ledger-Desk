/**
 * Task Board period navigation — deliberately independent of the shared,
 * year-to-date MONTHS/CURRENT_MONTH_KEY list in format.js. Dashboard,
 * Analytics, Reports, and gamification/badge logic all keep reading that
 * list unchanged; this module only lets the Task Board move to any month,
 * past or future, with no artificial limit and correct year rollover in
 * either direction.
 */

export function parseMonthKey(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  return { year: y, monthIndex: m - 1 };
}

/** Normalizes any (year, monthIndex) — including out-of-range values — into a "YYYY-MM" key. JS Date's own overflow/underflow handling is what makes year rollover correct in both directions (e.g. year=2026, monthIndex=12 -> "2027-01"; monthIndex=-1 -> "2025-12"). */
export function monthKeyFor(year, monthIndex) {
  const d = new Date(year, monthIndex, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonthKey(monthKey, delta) {
  const { year, monthIndex } = parseMonthKey(monthKey);
  return monthKeyFor(year, monthIndex + delta);
}

export function monthKeyLabel(monthKey) {
  const { year, monthIndex } = parseMonthKey(monthKey);
  return new Date(year, monthIndex, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
}

/** "past" | "current" | "future", relative to a given "now" month key (string comparison is safe — "YYYY-MM" sorts lexically the same as chronologically). */
export function monthKeyPeriodType(monthKey, currentMonthKey) {
  if (monthKey === currentMonthKey) return "current";
  return monthKey < currentMonthKey ? "past" : "future";
}
