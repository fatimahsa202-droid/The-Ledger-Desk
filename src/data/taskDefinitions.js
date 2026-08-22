/**
 * Task Definitions & Categories — the editable layer on top of the
 * original, verbatim accounting taxonomy in categories.js.
 *
 * categories.js is never modified: it remains the authoritative seed for
 * the "recovered baseline" and the fallback default. This module turns
 * that seed into editable, storable records exactly once (on first load,
 * see DEFAULT_TASK_DEFINITIONS / DEFAULT_CATEGORY_DEFS below), after which
 * the *stored* definitions are what the app actually reads. Existing task
 * IDs are reused unchanged, so every historical monthlyData row (keyed by
 * the same task ID) needs no migration at all — it simply gains a
 * definition to point at.
 */

import { CATEGORIES, CATEGORY_ICONS } from "./categories.js";

export const PRIORITIES = ["low", "normal", "high", "critical"];
export const PRIORITY_META = {
  low: { label: "Low", tone: "muted", rank: 0 },
  normal: { label: "Normal", tone: "accent", rank: 1 },
  high: { label: "High", tone: "gold", rank: 2 },
  critical: { label: "Critical", tone: "rust", rank: 3 },
};

export const FREQUENCIES = ["once", "weekly", "monthly", "yearly", "custom"];
export const FREQUENCY_LABELS = {
  once: "One-time",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
  custom: "Custom",
};

/**
 * Every one of the original 53 tasks becomes a Task Definition with
 * frequency "monthly" and rule "none" (no specific day) — which is exactly
 * today's behavior: due sometime within the month, tracked via the
 * existing monthlyData store. `legacyMonthlyStorage: true` tells the
 * occurrence engine (occurrenceEngine.js) to leave these alone entirely —
 * their "occurrences" already exist, they're the monthlyData rows that
 * already work today. This is what makes the migration truly zero-risk:
 * nothing about how these 53 tasks are stored, timed, or synced changes.
 */
export function buildDefaultTaskDefinitions() {
  const defs = [];
  CATEGORIES.forEach((cat) => {
    cat.tasks.forEach((t) => {
      defs.push({
        id: t.id,
        name: t.name,
        categoryId: cat.id,
        priority: "normal",
        frequency: "monthly",
        monthlyRule: { kind: "none" },
        notes: "",
        timerEligible: true,
        isBuiltIn: true,
        legacyMonthlyStorage: true,
        // Set once, by explicit user choice, when this task is moved onto the
        // new recurrence engine (see ManageTasks.jsx). null = still on the
        // original implicit-monthly system. Historical months before this
        // date stay in monthlyData forever, untouched — see occurrenceEngine.js.
        graduatedFrom: null,
        archived: false,
        createdAt: 0,
        updatedAt: 0,
      });
    });
  });
  return defs;
}

export function buildDefaultCategoryDefs() {
  return CATEGORIES.map((cat, i) => ({
    id: cat.id,
    name: cat.name,
    icon: CATEGORY_ICONS[cat.id] || "layers",
    color: null,
    order: i,
    isBuiltIn: true,
    archived: false,
  }));
}

/**
 * Reconstructs a CATEGORIES-shaped list (id, name, tasks:[{id,name,categoryId,categoryName}])
 * from the *editable* definitions, respecting archive state and category
 * order. This is what the Task Board (CategoryNav, TaskDetailPanel) reads
 * from Phase A onward, so renaming/re-categorizing/archiving a task is
 * immediately visible where the user actually works — while monthlyData
 * itself, and every stat/badge/report computed from the original static
 * categories.js list, are completely untouched.
 */
export function buildEffectiveCategories(categoryDefs, taskDefinitions) {
  const cats = [...(categoryDefs || [])]
    .filter((c) => !c.archived)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return cats.map((cat) => ({
    id: cat.id,
    name: cat.name,
    icon: cat.icon,
    tasks: (taskDefinitions || [])
      .filter((t) => t.categoryId === cat.id && !t.archived)
      .map((t) => ({ id: t.id, name: t.name, categoryId: cat.id, categoryName: cat.name, priority: t.priority || "normal" })),
  }));
}

const hasRealMonthlyContent = (entry) =>
  !!entry && (entry.status !== "pending" || entry.timeSeconds > 0 || (entry.notes || "").trim() !== "" || (entry.sessions || []).length > 0 || (entry.sources || []).length > 0);

/** True only if a definition can be safely, permanently deleted — never generated a single occurrence. */
export function definitionSafeToDelete(definition, monthlyData, occurrences) {
  const hasOccurrenceHistory = Object.values(occurrences || {}).some((o) => o.definitionId === definition.id);
  if (definition.legacyMonthlyStorage) {
    // Any monthlyData row for this task, in any month, with any real content, counts as history.
    // A graduated legacy task can *also* have real occurrence history from after its cutover date.
    const hasLegacyContent = Object.values(monthlyData || {}).some((tasks) => hasRealMonthlyContent(tasks && tasks[definition.id]));
    return !hasLegacyContent && !hasOccurrenceHistory;
  }
  return !hasOccurrenceHistory;
}

/** True only if a category can be safely, permanently deleted — never had a task definition assigned to it, ever. */
export function categorySafeToDelete(categoryId, taskDefinitions) {
  return !(taskDefinitions || []).some((t) => t.categoryId === categoryId);
}

/**
 * Phase A cloud-migration healing. Given the set of category/task ids that
 * already exist in Supabase for this account, returns only the built-in
 * rows that are completely absent from that set — never one that's already
 * there under any form (renamed, archived, re-prioritized, re-categorized,
 * graduated). `existingIds` must reflect CLOUD state, not local state, so
 * an id that only reached the cloud once (e.g. a single category pushed
 * before the rest were ever uploaded) is never re-added or overwritten —
 * see CloudSyncEngine.js's _phaseAMigrationIfNeeded, which never uploads
 * (or even touches) a row for an id already present in `existingIds`.
 *
 * When a missing id also happens to exist in `localDefs` (this device's own
 * not-yet-synced copy), that local copy is preferred over the pristine seed
 * — so a customization made on this device before it ever reached the
 * cloud is not silently discarded in favor of the default.
 */
export function missingBuiltinCategories(existingIds, localCategoryDefs) {
  const localById = Object.fromEntries((localCategoryDefs || []).map((c) => [c.id, c]));
  return buildDefaultCategoryDefs()
    .filter((c) => !existingIds.has(c.id))
    .map((c) => localById[c.id] || c);
}

export function missingBuiltinTaskDefinitions(existingIds, localTaskDefinitions) {
  const localById = Object.fromEntries((localTaskDefinitions || []).map((d) => [d.id, d]));
  return buildDefaultTaskDefinitions()
    .filter((d) => !existingIds.has(d.id))
    .map((d) => localById[d.id] || d);
}

/**
 * When a legacy task is about to be graduated (or its graduatedFrom date is
 * being changed), check whether the calendar month containing the chosen
 * cutover date — or any month after it — already has real monthlyData
 * content for this task. That's not unsafe (nothing is deleted or
 * rewritten), but it means both the old monthly record and new occurrences
 * could exist side-by-side for that period, so the UI must warn and let the
 * user confirm rather than silently proceeding.
 */
export function graduationOverlapWarning(definition, monthlyData, graduatedFromMs) {
  if (!graduatedFromMs) return { hasOverlap: false, monthKeys: [] };
  const cutover = new Date(graduatedFromMs);
  const cutoverMonthKey = `${cutover.getFullYear()}-${String(cutover.getMonth() + 1).padStart(2, "0")}`;
  const monthKeys = Object.keys(monthlyData || {})
    .filter((monthKey) => monthKey >= cutoverMonthKey)
    .filter((monthKey) => hasRealMonthlyContent((monthlyData[monthKey] || {})[definition.id]))
    .sort();
  return { hasOverlap: monthKeys.length > 0, monthKeys };
}
