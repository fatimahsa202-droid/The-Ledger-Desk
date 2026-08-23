/**
 * Calendar V2 — pure aggregation over data Phase A and the existing Work
 * Activity tracking already produce. No new storage, no new Supabase
 * tables — a read/derive layer only, mirroring the approach taken for
 * Dashboard V2's dashboardSelectors.js.
 *
 * Deliberately reuses the EXISTING `sessions` list (flattenSessions —
 * reconciliation + Data Migration, static category/task attribution) for
 * "Work Activity", rather than Dashboard V2's accounting-only
 * buildAccountingSessions — Calendar's Work Activity must keep behaving
 * exactly as it always has, not switch to Dashboard's narrower accounting
 * scope.
 *
 * Occurrence status shown on Calendar reuses the same overdue rule proven
 * in Dashboard V2 (endOfDueDay(dueDate) < now) so a future day can never
 * be marked overdue by construction — no special-casing needed.
 */

import { dayKey } from "./format.js";

/** End of the calendar day a due-date timestamp falls on. See dashboardSelectors.js for the same helper and its rationale. */
function endOfDueDay(dueDateMs) {
  const d = new Date(dueDateMs);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/** "pending" | "in-progress" | "overdue" | "done" — one label per occurrence, in priority order for cell-dot coloring. */
export function occurrenceDisplayStatus(o, nowMs) {
  if (o.status === "done") return "done";
  if (o.dueDate != null && endOfDueDay(o.dueDate) < nowMs) return "overdue";
  if ((o.timeSeconds || 0) > 0) return "in-progress";
  return "pending";
}

/**
 * Only dated/scheduled occurrences belong on Calendar — anything with no
 * dueDate (e.g. a none-rule monthly task with nothing computed yet) is
 * excluded, per spec ("do not dump all 53 task definitions into Calendar").
 * Returns a map of dayKey -> occurrence[] for occurrences whose due date
 * falls within [fromMs, toMs].
 */
export function occurrencesByDay(occurrences, fromMs, toMs, nowMs) {
  const map = {};
  Object.values(occurrences || {}).forEach((o) => {
    if (o.dueDate == null || o.dueDate < fromMs || o.dueDate > toMs) return;
    const k = dayKey(o.dueDate);
    if (!map[k]) map[k] = [];
    map[k].push({ ...o, displayStatus: occurrenceDisplayStatus(o, nowMs) });
  });
  Object.values(map).forEach((list) => list.sort((a, b) => (a.dueDate ?? 0) - (b.dueDate ?? 0)));
  return map;
}

/** Work Activity seconds per day, from the existing (migration-inclusive) sessions list. */
export function workSecondsByDay(sessionsList, fromMs, toMs) {
  const map = {};
  sessionsList.forEach((s) => {
    if (s.start < fromMs || s.start > toMs) return;
    const k = dayKey(s.start);
    map[k] = (map[k] || 0) + s.duration;
  });
  return map;
}

/**
 * Category -> Task -> Sessions tree for one day's Work Activity, built
 * from the existing sessions' own embedded categoryName/taskName fields
 * (flattenSessions already attaches these) rather than looking tasks up
 * via taskDefinitions/categoryDefs — keeps migration sessions (which have
 * no taskDefinitions entry) working the same as they always have.
 */
export function dayWorkActivityTree(sessionsList, dayKeyStr) {
  const daySessions = sessionsList.filter((s) => dayKey(s.start) === dayKeyStr);
  const byCat = {};
  daySessions.forEach((s) => {
    const cid = s.categoryId || "uncategorized";
    if (!byCat[cid]) byCat[cid] = { categoryId: cid, name: s.categoryName || "Uncategorized", seconds: 0, byTask: {} };
    byCat[cid].seconds += s.duration;
    if (!byCat[cid].byTask[s.taskId]) byCat[cid].byTask[s.taskId] = { taskId: s.taskId, name: s.taskName, seconds: 0, sessions: [] };
    byCat[cid].byTask[s.taskId].seconds += s.duration;
    byCat[cid].byTask[s.taskId].sessions.push(s);
  });
  return Object.values(byCat)
    .map((c) => ({ ...c, tasks: Object.values(c.byTask).sort((a, b) => b.seconds - a.seconds) }))
    .sort((a, b) => b.seconds - a.seconds);
}
