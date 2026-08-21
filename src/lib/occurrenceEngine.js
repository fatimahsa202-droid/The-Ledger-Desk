/**
 * Occurrence generation — deterministic and idempotent by construction.
 * Every occurrence's id is `${definitionId}::${periodKey}`; generating is
 * always "does this id already exist? if not, create it" — never an
 * overwrite. Running this twice, from two devices, offline or not, can
 * never create a duplicate and can never silently move an occurrence that
 * already exists (the historical-freeze rule from the plan).
 *
 * Legacy definitions (`legacyMonthlyStorage: true` — the original 53) are
 * skipped entirely unless the user has explicitly graduated them
 * (`graduatedFrom` set, via Manage Tasks). Once graduated, this engine only
 * ever generates occurrences dated on/after `graduatedFrom` — everything
 * before that date stays exactly as it is in monthlyData, untouched and
 * never regenerated as an occurrence.
 */

import { generateInstances, computeMonthlyDueDate, periodKeyForMonth } from "./recurrence.js";

/** True if a generated instance falls on/after its definition's graduation cutover (non-legacy/ungraduated definitions have no cutover, so always true). */
function isOnOrAfterCutover(definition, periodKey, dueDate) {
  if (!definition.legacyMonthlyStorage || !definition.graduatedFrom) return true;
  const cutover = new Date(definition.graduatedFrom);
  cutover.setHours(0, 0, 0, 0);
  if (dueDate) {
    const d = new Date(dueDate);
    d.setHours(0, 0, 0, 0);
    return d.getTime() >= cutover.getTime();
  }
  // No concrete due date (monthly rule "none") — compare by calendar month instead.
  const cutoverMonthKey = periodKeyForMonth(cutover.getFullYear(), cutover.getMonth());
  return periodKey >= cutoverMonthKey;
}

export const LOOKAHEAD_MONTHS = 2;
export const LOOKAHEAD_WEEKS = 4;

function windowFor(definition, now) {
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  if (definition.frequency === "monthly" || definition.frequency === "yearly") {
    to.setMonth(to.getMonth() + LOOKAHEAD_MONTHS);
  } else if (definition.frequency === "once") {
    to.setFullYear(to.getFullYear() + 5); // a fixed one-time due date just needs to be in-window whenever it is
  } else {
    to.setDate(to.getDate() + LOOKAHEAD_WEEKS * 7);
  }
  return { from, to };
}

/**
 * Ensures occurrences exist for every active, non-legacy definition across
 * its lookahead window. `occurrences` is a plain map keyed by occurrence
 * id. Returns { occurrences: <merged map>, added: [<new occurrence rows>] }
 * — `added` is what the caller pushes to Cloud Sync; existing rows are
 * never included, never modified.
 */
export function ensureOccurrences({ taskDefinitions, occurrences, now = new Date(), workingDays, isHoliday }) {
  const merged = { ...(occurrences || {}) };
  const added = [];
  (taskDefinitions || [])
    .filter((d) => !d.archived && (!d.legacyMonthlyStorage || d.graduatedFrom))
    .forEach((definition) => {
      const { from, to } = windowFor(definition, now);
      const instances = generateInstances(definition, from, to, workingDays, isHoliday)
        .filter(({ periodKey, dueDate }) => isOnOrAfterCutover(definition, periodKey, dueDate));
      instances.forEach(({ periodKey, dueDate }) => {
        const id = `${definition.id}::${periodKey}`;
        if (merged[id]) return; // already exists — never regenerate/overwrite
        const row = {
          id,
          definitionId: definition.id,
          periodKey,
          // Snapshot frozen at generation time — editing the definition
          // later never changes an occurrence that already exists.
          name: definition.name,
          categoryId: definition.categoryId,
          priority: definition.priority || "normal",
          monthlyRuleKind: definition.frequency === "monthly" ? (definition.monthlyRule?.kind || "none") : null,
          dueDate: dueDate ? dueDate.getTime() : null,
          status: "pending",
          completedAt: null,
          notes: "",
          timeSeconds: 0,
          sessions: [],
          sources: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        merged[id] = row;
        added.push(row);
      });
    });
  return { occurrences: merged, added };
}

/**
 * Advanced/Settings action: when Working Days changes, find occurrences
 * that are business-day-rule-derived, still Pending, and not yet due — the
 * only ones it is ever safe to move. Never touches Done, in-progress, or
 * already-overdue occurrences. Returns the candidate rows without applying
 * anything, so the UI can show a precise count before the user opts in.
 */
export function findRecalculableBusinessDayOccurrences(occurrences, now = new Date()) {
  const nowTs = now.getTime();
  return Object.values(occurrences || {}).filter(
    (o) =>
      o.status === "pending" &&
      o.monthlyRuleKind &&
      ["firstBusinessDay", "lastBusinessDay", "bdAfterMonthEnd"].includes(o.monthlyRuleKind) &&
      o.dueDate != null &&
      o.dueDate > nowTs
  );
}

/**
 * Applies the recalculation: recomputes due dates for the given candidate
 * occurrences using the new working-days configuration and their owning
 * definition's current monthly rule. Only called after explicit user
 * opt-in (see findRecalculableBusinessDayOccurrences above).
 */
export function recalculateBusinessDayOccurrences(candidates, taskDefinitions, workingDays, isHoliday) {
  const byId = Object.fromEntries((taskDefinitions || []).map((d) => [d.id, d]));
  const updates = {};
  candidates.forEach((o) => {
    const def = byId[o.definitionId];
    if (!def || !def.monthlyRule) return;
    const [y, m] = o.periodKey.split("-").map(Number);
    const due = computeMonthlyDueDate(y, m - 1, def.monthlyRule, workingDays, isHoliday);
    updates[o.id] = { ...o, dueDate: due ? due.getTime() : null, updatedAt: Date.now() };
  });
  return updates;
}

/* ============================================================================
 * Task Board display — decides, per task and per selected month, whether
 * that task is still shown via its legacy monthlyData entry or via a
 * roll-up of generated occurrences. A graduated legacy task uses monthlyData
 * for every month before its cutover and occurrences for every month at/
 * after it — both sides of that boundary are read-only with respect to each
 * other, so neither can ever be rewritten by the other.
 * ========================================================================= */

/** Whether `monthKey` (a "YYYY-MM" board month) should be rendered from generated occurrences rather than monthlyData, for this definition. */
export function isOccurrenceDrivenForMonth(definition, monthKey) {
  if (!definition) return false;
  if (!definition.legacyMonthlyStorage) return true; // every non-legacy (new) task is occurrence-driven from day one
  if (!definition.graduatedFrom) return false; // not graduated yet — still fully legacy
  const cutover = new Date(definition.graduatedFrom);
  const cutoverMonthKey = periodKeyForMonth(cutover.getFullYear(), cutover.getMonth());
  return monthKey >= cutoverMonthKey;
}

/** All generated occurrences for one definition that fall within one board month. */
export function occurrencesForTaskInMonth(occurrences, definitionId, monthKey) {
  return Object.values(occurrences || {})
    .filter((o) => o.definitionId === definitionId && o.periodKey.startsWith(monthKey))
    .sort((a, b) => (a.dueDate ?? 0) - (b.dueDate ?? 0));
}

/**
 * Rolls a month's worth of occurrences up into one summary — this is what a
 * Task Board card shows for a task with more than one occurrence in the
 * selected period, so the board never grows a duplicate card per occurrence.
 */
export function computeBoardRollup(occsInMonth, now = Date.now()) {
  const total = occsInMonth.length;
  const done = occsInMonth.filter((o) => o.status === "done").length;
  const overdue = occsInMonth.filter((o) => o.status !== "done" && o.dueDate != null && o.dueDate < now).length;
  const upcoming = occsInMonth
    .filter((o) => o.status !== "done" && (o.dueDate == null || o.dueDate >= now))
    .sort((a, b) => (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity));
  const timeSeconds = occsInMonth.reduce((n, o) => n + (o.timeSeconds || 0), 0);
  let tone = "pending";
  if (total > 0 && done === total) tone = "done";
  else if (done > 0) tone = "in-progress";
  return { total, done, overdue, next: upcoming[0] || null, timeSeconds, tone };
}
