/**
 * Pure recurrence / Business Day engine — no I/O, no React, fully testable
 * in isolation. This is the one place in the app that knows what a
 * "business day" means; every rule (First/Last Business Day, BD+X) calls
 * through isWorkingDay() and never re-implements weekend logic itself.
 *
 * Working days are always caller-supplied (from Settings), never assumed —
 * there is no hard-coded Saturday/Sunday weekend anywhere in this file.
 */

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Default working week for a fresh deployment: Sunday-Thursday. */
export const DEFAULT_WORKING_DAYS = [0, 1, 2, 3, 4];

const atMidnight = (d) => {
  const nd = new Date(d);
  nd.setHours(0, 0, 0, 0);
  return nd;
};

/**
 * A day counts as a working day when it falls on a configured working
 * weekday AND is not a holiday. `isHoliday` always returns false today —
 * there is no holiday calendar in Phase A — but every business-day rule
 * already calls through this one function, so plugging in a real holiday
 * source later changes this one clause, not the recurrence architecture.
 */
export function isWorkingDay(date, workingDays, isHoliday = () => false) {
  return workingDays.includes(date.getDay()) && !isHoliday(date);
}

/**
 * Step forward (count > 0) or backward (count < 0) from `date`, landing on
 * the Nth working day strictly after (or before) it. `date` itself is never
 * counted, even if it happens to be a working day — this is what "BD+1
 * after month-end" means: the first working day strictly after month-end.
 */
export function addWorkingDays(date, count, workingDays, isHoliday = () => false) {
  const dir = count > 0 ? 1 : -1;
  let remaining = Math.abs(count);
  const cur = atMidnight(date);
  while (remaining > 0) {
    cur.setDate(cur.getDate() + dir);
    if (isWorkingDay(cur, workingDays, isHoliday)) remaining--;
  }
  return cur;
}

/**
 * Walk from `date` (inclusive) toward `dir` until landing on a working day.
 * Used for First/Last Business Day of month, where the boundary date itself
 * counts if it's already a working day.
 */
export function nearestWorkingDay(date, workingDays, dir = 1, isHoliday = () => false) {
  const cur = atMidnight(date);
  while (!isWorkingDay(cur, workingDays, isHoliday)) {
    cur.setDate(cur.getDate() + dir);
  }
  return cur;
}

export function monthLength(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}
export function firstDayOfMonth(year, monthIndex) {
  return new Date(year, monthIndex, 1);
}
export function lastDayOfMonth(year, monthIndex) {
  return new Date(year, monthIndex, monthLength(year, monthIndex));
}

/**
 * Concrete due date for a Monthly rule. Returns null for "none" (due
 * sometime within the month, no specific date — the migration default for
 * the original 53 tasks, matching today's behavior exactly).
 */
export function computeMonthlyDueDate(year, monthIndex, rule, workingDays, isHoliday = () => false) {
  switch (rule?.kind) {
    case "specificDay":
      return new Date(year, monthIndex, Math.min(Math.max(1, rule.day || 1), monthLength(year, monthIndex)));
    case "lastDay":
      return lastDayOfMonth(year, monthIndex);
    case "firstBusinessDay":
      return nearestWorkingDay(firstDayOfMonth(year, monthIndex), workingDays, 1, isHoliday);
    case "lastBusinessDay":
      return nearestWorkingDay(lastDayOfMonth(year, monthIndex), workingDays, -1, isHoliday);
    case "bdAfterMonthEnd":
      return addWorkingDays(lastDayOfMonth(year, monthIndex), Math.max(1, rule.count || 1), workingDays, isHoliday);
    case "none":
    default:
      return null;
  }
}

export const MONTHLY_RULE_LABELS = {
  none: "No specific day (due within the month)",
  specificDay: "Specific day of month",
  lastDay: "Last day of month",
  firstBusinessDay: "First business day of month",
  lastBusinessDay: "Last business day of month",
  bdAfterMonthEnd: "Business days after month-end (BD+X)",
};

export function periodKeyForMonth(year, monthIndex) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}
export function periodKeyForDate(date) {
  const d = atMidnight(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Generate occurrence instances for a definition within [from, to]
 * (inclusive Date objects, both at midnight). Pure — never touches storage,
 * never mutates the definition. Returns [{ periodKey, dueDate }], deduped
 * and safe to call repeatedly with overlapping windows (the caller is
 * responsible for the idempotent upsert against periodKey).
 */
export function generateInstances(definition, from, to, workingDays, isHoliday = () => false) {
  const start = atMidnight(from);
  const end = atMidnight(to);
  const out = [];
  const frequency = definition.frequency;

  if (frequency === "once") {
    if (!definition.dueDate) return out;
    const due = atMidnight(new Date(definition.dueDate));
    if (due >= start && due <= end) out.push({ periodKey: periodKeyForDate(due), dueDate: due });
    return out;
  }

  if (frequency === "weekly") {
    const days = definition.weekdays && definition.weekdays.length ? definition.weekdays : [];
    if (days.length === 0) return out;
    const stepWeeks = Math.max(1, definition.everyNWeeks || 1);
    const anchorWeekStart = atMidnight(definition.weeklyAnchor ? new Date(definition.weeklyAnchor) : start);
    anchorWeekStart.setDate(anchorWeekStart.getDate() - anchorWeekStart.getDay());
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (!days.includes(d.getDay())) continue;
      const thisWeekStart = new Date(d);
      thisWeekStart.setDate(d.getDate() - d.getDay());
      const weeksSinceAnchor = Math.round((thisWeekStart - anchorWeekStart) / (7 * 86400000));
      if (((weeksSinceAnchor % stepWeeks) + stepWeeks) % stepWeeks !== 0) continue;
      const due = atMidnight(d);
      out.push({ periodKey: periodKeyForDate(due), dueDate: due });
    }
    return out;
  }

  if (frequency === "monthly") {
    let y = start.getFullYear();
    let m = start.getMonth();
    const endY = end.getFullYear();
    const endM = end.getMonth();
    while (y < endY || (y === endY && m <= endM)) {
      const due = computeMonthlyDueDate(y, m, definition.monthlyRule || { kind: "none" }, workingDays, isHoliday);
      out.push({ periodKey: periodKeyForMonth(y, m), dueDate: due });
      m++;
      if (m > 11) { m = 0; y++; }
    }
    return out;
  }

  if (frequency === "yearly") {
    const { month = 0, day = 1 } = definition.yearlyRule || {};
    for (let y = start.getFullYear(); y <= end.getFullYear(); y++) {
      const dayClamped = Math.min(Math.max(1, day), monthLength(y, month));
      const due = new Date(y, month, dayClamped);
      if (due >= start && due <= end) out.push({ periodKey: `${y}`, dueDate: due });
    }
    return out;
  }

  if (frequency === "custom") {
    const { everyN = 1, unit = "days", weekdays } = definition.customRule || {};
    const step = (d) => {
      const nd = new Date(d);
      if (unit === "weeks") nd.setDate(nd.getDate() + everyN * 7);
      else if (unit === "months") nd.setMonth(nd.getMonth() + everyN);
      else nd.setDate(nd.getDate() + everyN);
      return nd;
    };
    let cursor = atMidnight(definition.customAnchor ? new Date(definition.customAnchor) : start);
    let guard = 0;
    while (cursor < start && guard < 5000) { cursor = step(cursor); guard++; }
    while (cursor <= end && guard < 10000) {
      if (!weekdays || weekdays.length === 0 || weekdays.includes(cursor.getDay())) {
        out.push({ periodKey: periodKeyForDate(cursor), dueDate: new Date(cursor) });
      }
      cursor = step(cursor);
      guard++;
    }
    return out;
  }

  return out;
}
