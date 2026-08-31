import { ALL_TASKS, CATEGORIES, TASK_BY_ID } from "../data/categories.js";
import { MONTHS, getEntry, dayKey, isoWeekKey } from "./format.js";

// NOTE: the old legacy-only, static-ALL_TASKS/CATEGORIES-only
// computeStatsForMonthKey / computeMonthStats / computeCategoryStatsForMonth
// that used to live here have been superseded by the unified statistics
// engine in dashboardSelectors.js (computeUnifiedMonthStats /
// computeUnifiedMonthMap / computeUnifiedCategoryStatsForMonth), which
// includes occurrence-driven (custom/graduated/recurring) tasks too — see
// that file's header comment. Every caller has been moved over so
// Analytics/Reports/Achievements/Categories' Monthly Progress and Dashboard
// V2 can never show two different numbers for the same month/category again.

/**
 * Flattened list of every work session across reconciliation + migration
 * tasks. Category attribution is resolved live (taskDefinitions +
 * categoryDefs, falling back to the static original-53 list only for tasks
 * that predate Phase A) so a task's historical sessions follow it if it's
 * later renamed or re-categorized, and a custom task's sessions never show
 * as a raw id under a fake "Other" category.
 */
export function flattenSessions(monthlyData, migration, taskDefinitions, categoryDefs) {
  const taskById = Object.fromEntries((taskDefinitions || []).map((d) => [d.id, d]));
  const catById = Object.fromEntries((categoryDefs || []).map((c) => [c.id, c]));
  const out = [];
  Object.entries(monthlyData).forEach(([monthKey, tasks]) => {
    Object.entries(tasks || {}).forEach(([taskId, entry]) => {
      const task = taskById[taskId] || TASK_BY_ID[taskId];
      (entry.sessions || []).forEach((s) => {
        out.push({
          ...s,
          kind: "recon",
          taskId,
          monthKey,
          taskName: task ? task.name : taskId,
          categoryId: task ? task.categoryId : null,
          categoryName: task ? (catById[task.categoryId]?.name || "Other") : "Other",
        });
      });
    });
  });
  (migration.tasks || []).forEach((t) => {
    (t.sessions || []).forEach((s) => {
      out.push({
        ...s,
        kind: "migration",
        taskId: t.id,
        monthKey: null,
        taskName: t.name,
        categoryId: "migration",
        categoryName: "Data Migration",
      });
    });
  });
  return out.sort((a, b) => a.start - b.start);
}

export function computeSessionStats(sessions) {
  if (sessions.length === 0) {
    return { longest: null, average: 0, count: 0, totalSeconds: 0, uninterrupted: null };
  }
  const totalSeconds = sessions.reduce((s, x) => s + x.duration, 0);
  const longest = sessions.reduce((a, b) => (b.duration > (a?.duration ?? -1) ? b : a), null);
  return {
    longest,
    average: totalSeconds / sessions.length,
    count: sessions.length,
    totalSeconds,
    uninterrupted: longest,
  };
}

/** "Focus sessions" = individual sessions of 25+ minutes; "deep work" = 50+ minutes. */
export function classifySessions(sessions) {
  const focus = sessions.filter((s) => s.duration >= 25 * 60);
  const deepWork = sessions.filter((s) => s.duration >= 50 * 60);
  return { focus, deepWork };
}

export function groupSecondsByDay(sessions) {
  const map = {};
  sessions.forEach((s) => {
    const k = dayKey(s.start);
    map[k] = (map[k] || 0) + s.duration;
  });
  return map;
}

export function groupSecondsByWeek(sessions) {
  const map = {};
  sessions.forEach((s) => {
    const k = isoWeekKey(s.start);
    map[k] = (map[k] || 0) + s.duration;
  });
  return map;
}

export function taskTotals(monthlyData) {
  // Total tracked time per task, summed across all months, plus per-task done count.
  const totals = {};
  Object.values(monthlyData).forEach((tasks) => {
    Object.entries(tasks || {}).forEach(([taskId, entry]) => {
      if (!totals[taskId]) totals[taskId] = { taskId, seconds: 0, doneCount: 0 };
      totals[taskId].seconds += entry.timeSeconds;
      if (entry.status === "done") totals[taskId].doneCount += 1;
    });
  });
  return totals;
}

export function longestAndFastestTasks(monthlyData, taskDefinitions) {
  const taskById = Object.fromEntries((taskDefinitions || []).map((d) => [d.id, d]));
  let longest = null, fastest = null;
  Object.entries(monthlyData).forEach(([monthKey, tasks]) => {
    Object.entries(tasks || {}).forEach(([taskId, entry]) => {
      if (entry.status !== "done" || !entry.timeSeconds) return;
      const task = taskById[taskId] || TASK_BY_ID[taskId];
      const record = { taskId, monthKey, seconds: entry.timeSeconds, taskName: task ? task.name : taskId };
      if (!longest || record.seconds > longest.seconds) longest = record;
      if (!fastest || record.seconds < fastest.seconds) fastest = record;
    });
  });
  return { longest, fastest };
}

export function monthBestWorst(monthStats) {
  const closedMonths = MONTHS.filter((m) => monthStats[m.key].percent === 100);
  if (closedMonths.length === 0) return { best: null, worst: null };
  const withSeconds = closedMonths.map((m) => ({ ...m, seconds: monthStats[m.key].seconds }));
  const best = withSeconds.reduce((a, b) => (b.seconds < a.seconds ? b : a));
  const worst = withSeconds.reduce((a, b) => (b.seconds > a.seconds ? b : a));
  return { best, worst };
}

export function categoriesAttentionSplit(categoryStats) {
  const finished = categoryStats.filter((c) => c.percent === 100);
  const needsAttention = categoryStats
    .filter((c) => c.percent < 100)
    .sort((a, b) => a.percent - b.percent);
  return { finished, needsAttention };
}

export function todayTotals(sessions) {
  const today = dayKey(Date.now());
  const todaySessions = sessions.filter((s) => dayKey(s.start) === today);
  const seconds = todaySessions.reduce((s, x) => s + x.duration, 0);
  return { seconds, sessionCount: todaySessions.length };
}

export function completedTodayCount(monthlyData, migrationTasks) {
  const today = new Date().toDateString();
  let count = 0;
  Object.values(monthlyData).forEach((tasks) => {
    Object.values(tasks || {}).forEach((entry) => {
      if (entry.status === "done" && entry.completedAt && new Date(entry.completedAt).toDateString() === today) count++;
    });
  });
  (migrationTasks || []).forEach((t) => {
    if (t.status === "done" && t.completedAt && new Date(t.completedAt).toDateString() === today) count++;
  });
  return count;
}

export function inProgressCount(monthlyData, monthKey) {
  return ALL_TASKS.filter((t) => getEntry(monthlyData, monthKey, t.id).status === "in-progress").length;
}

export function remainingCount(monthlyData, monthKey) {
  return ALL_TASKS.filter((t) => getEntry(monthlyData, monthKey, t.id).status !== "done").length;
}

export function estimatedTimeRemaining(monthlyData, monthKey) {
  // Average tracked time per already-completed task this month, extrapolated
  // to the remaining tasks. Falls back to the all-time average if this
  // month doesn't have enough completed tasks yet to estimate from.
  const doneThisMonth = ALL_TASKS
    .map((t) => getEntry(monthlyData, monthKey, t.id))
    .filter((e) => e.status === "done" && e.timeSeconds > 0);
  const remaining = remainingCount(monthlyData, monthKey);
  if (remaining === 0) return 0;
  let avg;
  if (doneThisMonth.length >= 3) {
    avg = doneThisMonth.reduce((s, e) => s + e.timeSeconds, 0) / doneThisMonth.length;
  } else {
    const totals = taskTotals(monthlyData);
    const all = Object.values(totals).filter((t) => t.doneCount > 0);
    avg = all.length ? all.reduce((s, t) => s + t.seconds / t.doneCount, 0) / all.length : 0;
  }
  return Math.round(avg * remaining);
}

export function averageReconciliationTime(monthlyData) {
  const totals = taskTotals(monthlyData);
  const done = Object.values(totals).filter((t) => t.doneCount > 0);
  if (done.length === 0) return 0;
  const totalSeconds = done.reduce((s, t) => s + t.seconds, 0);
  const totalDone = done.reduce((s, t) => s + t.doneCount, 0);
  return totalDone ? totalSeconds / totalDone : 0;
}
