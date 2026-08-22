import { ALL_TASKS, CATEGORIES, TASK_BY_ID } from "../data/categories.js";
import { MONTHS, getEntry, dayKey, isoWeekKey } from "./format.js";

/**
 * Completion + time totals for one arbitrary month key, live-timer-aware.
 * Works for any "YYYY-MM" key, not just one of the fixed MONTHS list — this
 * is what lets the Task Board navigate to a month outside that list (see
 * monthNav.js) without needing its own separate stats model.
 */
export function computeStatsForMonthKey(monthlyData, monthKey, activeTimer, now) {
  let completed = 0, seconds = 0;
  ALL_TASKS.forEach((t) => {
    const e = getEntry(monthlyData, monthKey, t.id);
    if (e.status === "done") completed++;
    seconds += e.timeSeconds;
    if (activeTimer && activeTimer.kind === "recon" && activeTimer.taskId === t.id && activeTimer.monthKey === monthKey) {
      seconds += Math.floor((now - activeTimer.startedAt) / 1000);
    }
  });
  return {
    completed,
    total: ALL_TASKS.length,
    seconds,
    percent: ALL_TASKS.length ? Math.round((completed / ALL_TASKS.length) * 100) : 0,
  };
}

/** Per-month completion + time totals, live-timer-aware, for the fixed year-to-date MONTHS list. */
export function computeMonthStats(monthlyData, activeTimer, now) {
  const map = {};
  MONTHS.forEach((m) => {
    map[m.key] = computeStatsForMonthKey(monthlyData, m.key, activeTimer, now);
  });
  return map;
}

export function computeCategoryStatsForMonth(monthlyData, monthKey) {
  return CATEGORIES.map((cat) => {
    let completed = 0, seconds = 0, inProgress = 0;
    cat.tasks.forEach((t) => {
      const e = getEntry(monthlyData, monthKey, t.id);
      if (e.status === "done") completed++;
      if (e.status === "in-progress") inProgress++;
      seconds += e.timeSeconds;
    });
    return {
      id: cat.id,
      name: cat.name,
      completed,
      inProgress,
      total: cat.tasks.length,
      seconds,
      percent: Math.round((completed / cat.tasks.length) * 100),
    };
  });
}

/** Flattened list of every work session across reconciliation + migration tasks. */
export function flattenSessions(monthlyData, migration) {
  const out = [];
  Object.entries(monthlyData).forEach(([monthKey, tasks]) => {
    Object.entries(tasks || {}).forEach(([taskId, entry]) => {
      const task = TASK_BY_ID[taskId];
      (entry.sessions || []).forEach((s) => {
        out.push({
          ...s,
          kind: "recon",
          taskId,
          monthKey,
          taskName: task ? task.name : taskId,
          categoryId: task ? task.categoryId : null,
          categoryName: task ? task.categoryName : "Other",
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

export function longestAndFastestTasks(monthlyData) {
  let longest = null, fastest = null;
  Object.entries(monthlyData).forEach(([monthKey, tasks]) => {
    Object.entries(tasks || {}).forEach(([taskId, entry]) => {
      if (entry.status !== "done" || !entry.timeSeconds) return;
      const task = TASK_BY_ID[taskId];
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
