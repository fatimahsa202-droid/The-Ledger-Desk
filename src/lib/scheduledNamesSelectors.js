/**
 * Scheduled Names (Google Sheets) — pure grouping/status helpers, mirroring
 * calendarSelectors.js's approach for occurrences. scheduled_date comes
 * back from Supabase as a plain "YYYY-MM-DD" string (Postgres `date`
 * column), the exact same shape as dayKey() elsewhere in this app, so no
 * timezone-sensitive parsing is needed anywhere here — string equality
 * and lexical comparison both just work.
 *
 * Completion is entirely Ledger-Desk-owned (status/completed_at) and is
 * never derived from, or written back into, the source Sheet — these
 * rows arrive with source fields (name, scheduled_date) already resolved
 * server-side by sheets-sync; this module only adds a display status.
 */

/** "done" | "overdue" | "pending" — Scheduled Names' three states, per the approved spec (no "in progress" — that's occurrence-specific). */
export function scheduledNameDisplayStatus(row, todayKey) {
  if (row.status === "done") return "done";
  if (row.scheduled_date < todayKey) return "overdue";
  return "pending";
}

/** Groups active rows by their scheduled_date (dayKey string), each annotated with displayStatus. */
export function scheduledNamesByDay(rows, todayKey) {
  const map = {};
  (rows || []).forEach((row) => {
    if (row.source_status !== "active") return;
    const k = row.scheduled_date;
    if (!map[k]) map[k] = [];
    map[k].push({ ...row, displayStatus: scheduledNameDisplayStatus(row, todayKey) });
  });
  Object.values(map).forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name)));
  return map;
}
