/**
 * Dashboard V2 (Period Views) — pure aggregation functions over data Phase A
 * already produces (monthlyData, occurrences, taskDefinitions, categoryDefs,
 * sessions). No new storage, no new Supabase tables — everything here is a
 * read/derive layer.
 *
 * Deliberately scoped to accounting work only (reconciliation + occurrences)
 * — Data Migration sessions/tasks are excluded throughout, matching "do not
 * combine unrelated workflow totals into misleading numbers."
 *
 * Category attribution is always taken from the CURRENT taskDefinitions/
 * categoryDefs (Phase A's editable layer), never the static categories.js —
 * so a task the user re-categorized in Manage groups correctly here, unlike
 * the older flattenSessions() in selectors.js (deliberately left reading the
 * static list, out of scope to change for Analytics/Reports/Timeline).
 *
 * Definitions used throughout (documented here once, not scattered):
 *  - "Due" (period-scoped): occurrences with a due date inside [from, to].
 *  - "Overdue" (period-scoped, never future): of those due in-period, still
 *    pending AND dueDate < now. A period entirely in the future can never
 *    have an overdue count > 0, by construction.
 *  - "In Progress" / "High/Critical" (Today only, per the approved scope):
 *    due today, still pending, with time logged / with high|critical
 *    priority respectively.
 *  - Legacy monthly tasks have no day-level due date, so they never appear
 *    in Today/Week due/overdue counts. For Month, a legacy task only counts
 *    as overdue if its month is entirely in the past and it's not done —
 *    the current month is never "overdue" for legacy tasks (matches the
 *    existing, unchanged app behavior: the month isn't over yet).
 */

import { isOverdue, isOccurrenceDrivenForMonth, occurrencesForTaskInMonth, computeBoardRollup } from "./occurrenceEngine.js";

const isRealSession = (s) => s && typeof s.start === "number" && typeof s.duration === "number";

/** Every real work session for accounting tasks (legacy + occurrence-level), current category attribution, migration excluded. */
export function buildAccountingSessions(monthlyData, occurrences, taskDefinitions) {
  const taskById = Object.fromEntries((taskDefinitions || []).map((d) => [d.id, d]));
  const out = [];

  Object.entries(monthlyData || {}).forEach(([monthKey, tasks]) => {
    Object.entries(tasks || {}).forEach(([taskId, entry]) => {
      const def = taskById[taskId];
      (entry.sessions || []).filter(isRealSession).forEach((s) => {
        out.push({ id: s.id, start: s.start, end: s.end, duration: s.duration, taskId, taskName: def?.name || taskId, categoryId: def?.categoryId || null });
      });
    });
  });

  // Occurrence-level sessions: the schema still supports task_occurrences.sessions,
  // but the Timer is now a universal, task+month capability that always writes
  // into monthlyData (see TaskDetailPanel.jsx) — occ.sessions is never written to
  // by any UI and stays permanently empty. Kept here only for forward-compat with
  // the schema; effectively a no-op today, by design (avoids ever double-counting
  // the same tracked time from two ledgers).
  Object.values(occurrences || {}).forEach((occ) => {
    const def = taskById[occ.definitionId];
    (occ.sessions || []).filter(isRealSession).forEach((s) => {
      out.push({ id: s.id, start: s.start, end: s.end, duration: s.duration, taskId: occ.definitionId, taskName: def?.name || occ.name, categoryId: def?.categoryId || occ.categoryId || null });
    });
  });

  return out.sort((a, b) => a.start - b.start);
}

export function sessionsInRange(sessionsList, fromMs, toMs, categoryId) {
  return sessionsList.filter((s) => s.start >= fromMs && s.start <= toMs && (!categoryId || categoryId === "all" || s.categoryId === categoryId));
}

export function sumSeconds(sessionsList) {
  return sessionsList.reduce((sum, s) => sum + (s.duration || 0), 0);
}

/** Elapsed seconds an active reconciliation timer contributes to a range — only nonzero when the range actually contains "now" (i.e. it's the live/current period), capped to the range. */
export function liveElapsedInRange(activeTimer, nowMs, fromMs, toMs) {
  if (!activeTimer || activeTimer.kind !== "recon") return 0;
  if (nowMs < fromMs || nowMs > toMs) return 0;
  const start = Math.max(activeTimer.startedAt, fromMs);
  return Math.max(0, Math.floor((nowMs - start) / 1000));
}

export function occurrencesDueInRange(occurrences, fromMs, toMs, categoryId) {
  return Object.values(occurrences || {}).filter((o) => {
    if (o.dueDate == null || o.dueDate < fromMs || o.dueDate > toMs) return false;
    if (categoryId && categoryId !== "all" && o.categoryId !== categoryId) return false;
    return true;
  });
}

/** The monthKey ("YYYY-MM") an occurrence's tracked time lives under in the universal monthlyData timer ledger — derived from its due date when it has one, or its own periodKey when it doesn't (a monthly "none"-rule occurrence's periodKey already IS its monthKey). */
function monthKeyOfOccurrence(o) {
  if (o.dueDate != null) {
    const d = new Date(o.dueDate);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  return o.periodKey;
}

/** Core occurrence-driven KPI bundle, shared by Today/Week/Month's "Recurring Work Completion". */
export function computeOccurrenceKPIs(occurrences, taskDefinitions, monthlyData, nowMs, fromMs, toMs, categoryId) {
  const due = occurrencesDueInRange(occurrences, fromMs, toMs, categoryId);
  const completed = due.filter((o) => o.status === "done");
  const remaining = due.filter((o) => o.status !== "done");
  const overdue = remaining.filter((o) => isOverdue(o.dueDate, nowMs));
  // "In Progress" reads the universal per-task-per-month timer ledger (monthlyData) —
  // the same ledger the Timer always writes to now, regardless of recurrence — never
  // occ.timeSeconds, which the Timer never writes to (see buildAccountingSessions above).
  const inProgress = remaining.filter((o) => (((monthlyData[monthKeyOfOccurrence(o)] || {})[o.definitionId]?.timeSeconds) || 0) > 0);
  const priorityById = Object.fromEntries((taskDefinitions || []).map((d) => [d.id, d.priority]));
  const highCritical = remaining.filter((o) => {
    const p = priorityById[o.definitionId] || o.priority || "normal";
    return p === "high" || p === "critical";
  });
  return {
    items: due.sort((a, b) => (a.dueDate ?? 0) - (b.dueDate ?? 0)),
    total: due.length,
    completed: completed.length,
    remaining: remaining.length,
    overdue: overdue.length,
    inProgress: inProgress.length,
    highCritical: highCritical.length,
    percent: due.length ? Math.round((completed.length / due.length) * 100) : 0,
  };
}

/** Legacy (original 53, ungraduated-for-this-month) reconciliation progress for one month, optionally category-filtered. Never mixed with occurrence completion — kept as its own number. */
export function computeLegacyReconciliationForMonth(monthlyData, taskDefinitions, monthKey, categoryId) {
  const legacyTasks = (taskDefinitions || []).filter((d) => {
    if (categoryId && categoryId !== "all" && d.categoryId !== categoryId) return false;
    // Only count a definition against legacy monthlyData for months before its graduation
    // (or forever, if never graduated) — matches isOccurrenceDrivenForMonth's own boundary,
    // duplicated here in reverse to avoid a circular import with occurrenceEngine.js.
    if (!d.legacyMonthlyStorage) return false;
    if (!d.graduatedFrom) return true;
    const cutover = new Date(d.graduatedFrom);
    const cutoverMonthKey = `${cutover.getFullYear()}-${String(cutover.getMonth() + 1).padStart(2, "0")}`;
    return monthKey < cutoverMonthKey;
  });
  let completed = 0, seconds = 0;
  legacyTasks.forEach((d) => {
    const e = (monthlyData[monthKey] || {})[d.id];
    if (e?.status === "done") completed++;
    seconds += e?.timeSeconds || 0;
  });
  return { total: legacyTasks.length, completed, seconds, percent: legacyTasks.length ? Math.round((completed / legacyTasks.length) * 100) : 0 };
}

/** Legacy overdue count for a month: only meaningful for a month strictly in the past — the current/a future month is never "overdue" for legacy tasks (no day-level due date, month isn't over). */
export function computeLegacyOverdueForMonth(monthlyData, taskDefinitions, monthKey, currentMonthKey, categoryId) {
  if (monthKey >= currentMonthKey) return 0;
  const stats = computeLegacyReconciliationForMonth(monthlyData, taskDefinitions, monthKey, categoryId);
  return stats.total - stats.completed;
}

/**
 * ============================================================================
 * Unified statistics engine — the ONE true implementation of "how much of
 * this month/category is done, and how many hours" across every task,
 * legacy or occurrence-driven, built-in or user-created, graduated or not.
 * Analytics, Reports, Achievements, and Categories' Monthly Progress all
 * build on this (via selectors.js's thin wrappers) instead of each
 * re-deriving their own version, so the same month can never show two
 * different completion/hour numbers on two different screens.
 *
 * Explicitly, deliberately scoped the same way as the rest of this file:
 *  - "Accounting work" = legacy (monthlyData) + occurrence-driven tasks.
 *    Data Migration is never included (see buildAccountingSessions above) —
 *    it's a separate workflow with its own totals, shown in Timeline only.
 *  - Hours always come from monthlyData, the ONE universal per-task,
 *    per-month timer ledger (see TaskDetailPanel.jsx) — never
 *    occurrence.timeSeconds, which the Timer never writes to. This is what
 *    makes it structurally impossible to double-count the same tracked time
 *    from two ledgers.
 *  - A user-created task only ever counts toward a month on/after the month
 *    it was actually created in — adding a new task today can never change
 *    last year's completion percentage. Built-in tasks (isBuiltIn) always
 *    count, in every month, exactly as they always have.
 * ============================================================================
 */

function definitionAppliesToMonth(def, monthKey) {
  if (def.isBuiltIn || !def.createdAt) return true;
  const c = new Date(def.createdAt);
  const createdMonthKey = `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, "0")}`;
  return monthKey >= createdMonthKey;
}

/** Unified completion + time stats for one month, across every applicable task definition, optionally filtered to one category. Live-timer-aware. */
export function computeUnifiedMonthStats(monthlyData, occurrences, taskDefinitions, monthKey, currentMonthKey, activeTimer, now, categoryId) {
  let completed = 0, total = 0, seconds = 0, overdue = 0, inProgress = 0;
  (taskDefinitions || [])
    .filter((d) => !d.archived)
    .filter((d) => !categoryId || categoryId === "all" || d.categoryId === categoryId)
    .filter((d) => definitionAppliesToMonth(d, monthKey))
    .forEach((def) => {
      const entry = (monthlyData[monthKey] || {})[def.id];
      if (isOccurrenceDrivenForMonth(def, monthKey)) {
        const occs = occurrencesForTaskInMonth(occurrences, def.id, monthKey);
        const rollup = computeBoardRollup(occs, now);
        total += rollup.total;
        completed += rollup.done;
        overdue += rollup.overdue;
        inProgress += occs.filter((o) => o.status !== "done" && (entry?.timeSeconds || 0) > 0).length;
      } else {
        total += 1;
        if (entry?.status === "done") completed += 1;
        else if (entry?.status === "in-progress") inProgress += 1;
        if (entry?.status !== "done" && monthKey < currentMonthKey) overdue += 1;
      }
      seconds += entry?.timeSeconds || 0;
      if (activeTimer && activeTimer.kind === "recon" && activeTimer.taskId === def.id && activeTimer.monthKey === monthKey) {
        seconds += Math.floor((now - activeTimer.startedAt) / 1000);
      }
    });
  return { completed, total, seconds, overdue, inProgress, percent: total ? Math.round((completed / total) * 100) : 0 };
}

/** Unified per-month map for a list of {key} month objects (e.g. the fixed year-to-date MONTHS list) — replaces the old legacy-only computeMonthStats. */
export function computeUnifiedMonthMap(monthlyData, occurrences, taskDefinitions, months, currentMonthKey, activeTimer, now) {
  const map = {};
  (months || []).forEach((m) => {
    map[m.key] = computeUnifiedMonthStats(monthlyData, occurrences, taskDefinitions, m.key, currentMonthKey, activeTimer, now, null);
  });
  return map;
}

/**
 * Resolves one task's status + tracked seconds for a Reports/CSV-style row
 * in one month — used by Reports.jsx's printed Task History and
 * exportCsv.js, so both include every task (not just the original 53) the
 * same way the rest of this file does. Returns null when nothing should be
 * shown at all: an occurrence-driven task with zero occurrences scheduled
 * that month (matches the Task Board's own "nothing scheduled" rule —
 * never a phantom row for a month the task wasn't even due in).
 */
export function resolveTaskReportRow(monthlyData, occurrences, def, monthKey) {
  const entry = (monthlyData[monthKey] || {})[def.id];
  const seconds = entry?.timeSeconds || 0;
  if (isOccurrenceDrivenForMonth(def, monthKey)) {
    const occs = occurrencesForTaskInMonth(occurrences, def.id, monthKey);
    if (occs.length === 0) return null;
    const rollup = computeBoardRollup(occs);
    const status = rollup.total > 0 && rollup.done === rollup.total ? "done" : rollup.done > 0 ? "in-progress" : "pending";
    return { status, seconds };
  }
  return { status: entry?.status || "pending", seconds };
}

/** Unified per-category breakdown for one month — replaces the old legacy-only, static-CATEGORIES-only computeCategoryStatsForMonth. */
export function computeUnifiedCategoryStatsForMonth(monthlyData, occurrences, taskDefinitions, categoryDefs, monthKey, currentMonthKey, activeTimer, now) {
  return (categoryDefs || [])
    .filter((c) => !c.archived)
    .map((cat) => ({
      id: cat.id,
      name: cat.name,
      ...computeUnifiedMonthStats(monthlyData, occurrences, taskDefinitions, monthKey, currentMonthKey, activeTimer, now, cat.id),
    }));
}

/**
 * How many accounting completions (legacy + occurrence) happened within a
 * date range — a flow metric ("what got done in this window"), distinct
 * from computeLegacyReconciliationForMonth's snapshot percent ("how much of
 * the whole month is done as of now"). Used for Today/Week's "Completed".
 */
export function computeCompletedInRange(monthlyData, occurrences, taskDefinitions, fromMs, toMs, categoryId) {
  const taskById = Object.fromEntries((taskDefinitions || []).map((d) => [d.id, d]));
  let count = 0;
  Object.values(monthlyData || {}).forEach((tasks) => {
    Object.entries(tasks || {}).forEach(([taskId, e]) => {
      if (e.status !== "done" || e.completedAt == null) return;
      if (e.completedAt < fromMs || e.completedAt > toMs) return;
      const def = taskById[taskId];
      if (categoryId && categoryId !== "all" && def?.categoryId !== categoryId) return;
      count++;
    });
  });
  Object.values(occurrences || {}).forEach((o) => {
    if (o.status !== "done" || o.completedAt == null) return;
    if (o.completedAt < fromMs || o.completedAt > toMs) return;
    if (categoryId && categoryId !== "all" && o.categoryId !== categoryId) return;
    count++;
  });
  return count;
}

/** Category → Task → Sessions tree for the drill-down, scoped to a period + optional category filter. */
export function buildCategoryTimeTree(sessionsList, taskDefinitions, categoryDefs, fromMs, toMs, categoryId) {
  const inRange = sessionsInRange(sessionsList, fromMs, toMs, categoryId);
  const catById = Object.fromEntries((categoryDefs || []).map((c) => [c.id, c]));
  const taskById = Object.fromEntries((taskDefinitions || []).map((d) => [d.id, d]));

  const byCat = {};
  inRange.forEach((s) => {
    const cid = s.categoryId || "uncategorized";
    if (!byCat[cid]) byCat[cid] = { categoryId: cid, name: catById[cid]?.name || "Uncategorized", seconds: 0, byTask: {} };
    byCat[cid].seconds += s.duration;
    if (!byCat[cid].byTask[s.taskId]) byCat[cid].byTask[s.taskId] = { taskId: s.taskId, name: taskById[s.taskId]?.name || s.taskName, seconds: 0, sessions: [] };
    byCat[cid].byTask[s.taskId].seconds += s.duration;
    byCat[cid].byTask[s.taskId].sessions.push(s);
  });

  return Object.values(byCat)
    .map((c) => ({ ...c, tasks: Object.values(c.byTask).sort((a, b) => b.seconds - a.seconds) }))
    .sort((a, b) => b.seconds - a.seconds);
}

/** Workload-by-weekday (Sun..Sat) for a week, in seconds, for the "Workload by weekday" chart. */
export function workloadByWeekday(sessionsList, weekStartMs, categoryId) {
  const buckets = [0, 0, 0, 0, 0, 0, 0];
  const weekEndMs = weekStartMs + 7 * 24 * 60 * 60 * 1000 - 1;
  sessionsInRange(sessionsList, weekStartMs, weekEndMs, categoryId).forEach((s) => {
    buckets[new Date(s.start).getDay()] += s.duration;
  });
  return buckets;
}
