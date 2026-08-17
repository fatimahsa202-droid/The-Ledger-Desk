import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { ALL_TASKS, TASK_BY_ID } from "../data/categories.js";
import { STORAGE_KEYS } from "../lib/storage.js";
import { useStoredState } from "../hooks/useStoredState.js";
import { MONTHS, CURRENT_MONTH_KEY, getEntry, uid, isoWeekKey, dayKey } from "../lib/format.js";
import { levelInfo, levelTitle, BADGES, XP_RULES } from "../lib/gamification.js";
import { todaysChallenge } from "../lib/dailyChallenges.js";
import { DEFAULT_GAME, DEFAULT_MIGRATION, DEFAULT_SETTINGS } from "./defaults.js";
import {
  computeMonthStats,
  computeCategoryStatsForMonth,
  flattenSessions,
  computeSessionStats,
  taskTotals,
  longestAndFastestTasks,
  monthBestWorst,
  categoriesAttentionSplit,
  todayTotals,
  completedTodayCount,
  inProgressCount,
  remainingCount,
  estimatedTimeRemaining,
  averageReconciliationTime,
} from "../lib/selectors.js";

const AppDataContext = createContext(null);

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
  return ctx;
}

export function AppDataProvider({ children }) {
  const [monthlyData, setMonthlyData, l1] = useStoredState(STORAGE_KEYS.monthlyData, {});
  const [activeTimer, setActiveTimer, l2] = useStoredState(STORAGE_KEYS.activeTimer, null);
  const [migration, setMigration, l3] = useStoredState(STORAGE_KEYS.migration, DEFAULT_MIGRATION);
  const [game, setGame, l4] = useStoredState(STORAGE_KEYS.gamification, DEFAULT_GAME);
  const [settings, setSettings, l5] = useStoredState(STORAGE_KEYS.settings, DEFAULT_SETTINGS);
  const [favorites, setFavorites, l6] = useStoredState(STORAGE_KEYS.favorites, []);
  const [pinned, setPinned, l7] = useStoredState(STORAGE_KEYS.pinned, []);
  const [recentTaskIds, setRecentTaskIds, l8] = useStoredState(STORAGE_KEYS.recentTasks, []);
  const [activityLog, setActivityLog, l9] = useStoredState(STORAGE_KEYS.activityLog, []);

  const loaded = l1 && l2 && l3 && l4 && l5 && l6 && l7 && l8 && l9;

  const [tick, setTick] = useState(0);
  const [toasts, setToasts] = useState([]);
  const [celebration, setCelebration] = useState(null);

  /* ---------------- timer tick ---------------- */
  useEffect(() => {
    if (!activeTimer) return;
    const iv = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(iv);
  }, [activeTimer]);

  /* ---------------- toasts ---------------- */
  const pushToast = useCallback((text, tone) => {
    const id = uid();
    setToasts((prev) => [...prev, { id, text, tone: tone || "xp" }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3200);
  }, []);
  const dismissToast = useCallback((id) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

  const logActivity = useCallback(
    (entry) => {
      setActivityLog((prev) => [{ id: uid(), ts: Date.now(), ...entry }, ...prev].slice(0, 200));
    },
    [setActivityLog]
  );

  /* ---------------- daily + weekly + monthly streak ---------------- */
  const recordActivity = useCallback(() => {
    setGame((prev) => {
      const todayStr = new Date().toDateString();
      if (prev.lastActiveDate === todayStr) return prev;
      const y = new Date();
      y.setDate(y.getDate() - 1);
      const continued = prev.lastActiveDate === y.toDateString();
      return { ...prev, streak: continued ? prev.streak + 1 : 1, lastActiveDate: todayStr };
    });
  }, [setGame]);

  /* ---------------- XP ---------------- */
  const awardXP = useCallback(
    (amount, label) => {
      setGame((prev) => {
        const before = levelInfo(prev.xp).level;
        const xp = prev.xp + amount;
        const after = levelInfo(xp).level;
        pushToast(`+${amount} XP${label ? ` · ${label}` : ""}`, "xp");
        if (after > before) {
          setTimeout(() => {
            pushToast(`Level up! You're now Level ${after} — ${levelTitle(after)}`, "level");
            setCelebration({ type: "levelup", level: after, title: levelTitle(after) });
          }, 350);
        }
        return { ...prev, xp };
      });
      recordActivity();
    },
    [pushToast, recordActivity, setGame]
  );

  /* ---------------- reconciliation entry mutators ---------------- */
  const updateEntry = useCallback(
    (taskId, monthKey, patch) => {
      setMonthlyData((prev) => {
        const entry = getEntry(prev, monthKey, taskId);
        return { ...prev, [monthKey]: { ...prev[monthKey], [taskId]: { ...entry, ...patch } } };
      });
    },
    [setMonthlyData]
  );

  const updateMigTask = useCallback(
    (taskId, patch) => {
      setMigration((prev) => ({ ...prev, tasks: prev.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t)) }));
    },
    [setMigration]
  );

  /* ---------------- unified timer control ---------------- */
  const stopActiveTimer = useCallback(() => {
    setActiveTimer((prev) => {
      if (!prev) return null;
      const now = Date.now();
      const elapsed = Math.floor((now - prev.startedAt) / 1000);
      const session = { id: uid(), start: prev.startedAt, end: now, duration: elapsed };
      if (prev.kind === "recon") {
        setMonthlyData((md) => {
          const entry = getEntry(md, prev.monthKey, prev.taskId);
          return {
            ...md,
            [prev.monthKey]: {
              ...md[prev.monthKey],
              [prev.taskId]: { ...entry, timeSeconds: entry.timeSeconds + elapsed, sessions: [...entry.sessions, session] },
            },
          };
        });
        const task = TASK_BY_ID[prev.taskId];
        if (elapsed >= 5) {
          logActivity({ type: "session", taskId: prev.taskId, taskName: task?.name, duration: elapsed, message: `Logged ${Math.round(elapsed / 60)}m on ${task?.name || "a task"}` });
        }
      } else if (prev.kind === "migration") {
        setMigration((mg) => ({
          ...mg,
          tasks: mg.tasks.map((t) => (t.id === prev.taskId ? { ...t, timeSeconds: (t.timeSeconds || 0) + elapsed, sessions: [...(t.sessions || []), session] } : t)),
        }));
      }
      return null;
    });
  }, [setActiveTimer, setMonthlyData, setMigration, logActivity]);

  const startTimer = useCallback(
    (kind, taskId, monthKey) => {
      stopActiveTimer();
      setActiveTimer({ kind, taskId, monthKey: monthKey || null, startedAt: Date.now() });
      if (kind === "recon") setRecentTaskIds((prev) => [taskId, ...prev.filter((id) => id !== taskId)].slice(0, 12));
    },
    [stopActiveTimer, setActiveTimer, setRecentTaskIds]
  );

  const resetTimer = useCallback(
    (kind, taskId, monthKey) => {
      setActiveTimer((prev) => (prev && prev.kind === kind && prev.taskId === taskId && prev.monthKey === (monthKey || null) ? null : prev));
      if (kind === "recon") updateEntry(taskId, monthKey, { timeSeconds: 0, sessions: [] });
      else updateMigTask(taskId, { timeSeconds: 0, sessions: [] });
    },
    [setActiveTimer, updateEntry, updateMigTask]
  );

  const liveSecondsRecon = useCallback(
    (taskId, monthKey) => {
      const base = getEntry(monthlyData, monthKey, taskId).timeSeconds;
      if (activeTimer && activeTimer.kind === "recon" && activeTimer.taskId === taskId && activeTimer.monthKey === monthKey) {
        return base + Math.floor((Date.now() - activeTimer.startedAt) / 1000);
      }
      return base;
      // eslint-disable-next-line
    },
    [monthlyData, activeTimer, tick]
  );

  const liveSecondsMig = useCallback(
    (task) => {
      const base = task.timeSeconds || 0;
      if (activeTimer && activeTimer.kind === "migration" && activeTimer.taskId === task.id) {
        return base + Math.floor((Date.now() - activeTimer.startedAt) / 1000);
      }
      return base;
      // eslint-disable-next-line
    },
    [activeTimer, tick]
  );

  const setStatus = useCallback(
    (taskId, monthKey, status) => {
      const prevStatus = getEntry(monthlyData, monthKey, taskId).status;
      if (status === "done" && activeTimer && activeTimer.kind === "recon" && activeTimer.taskId === taskId && activeTimer.monthKey === monthKey) {
        stopActiveTimer();
      }
      updateEntry(taskId, monthKey, { status, completedAt: status === "done" ? Date.now() : null });
      if (status === "done" && prevStatus !== "done") {
        awardXP(XP_RULES.taskReconciled, `${TASK_BY_ID[taskId] ? TASK_BY_ID[taskId].name : "Task"} reconciled`);
        logActivity({ type: "status", taskId, monthKey, message: `Reconciled ${TASK_BY_ID[taskId]?.name || "a task"}` });
      } else if (status !== prevStatus) {
        logActivity({ type: "status", taskId, monthKey, message: `${TASK_BY_ID[taskId]?.name || "Task"} marked ${status.replace("-", " ")}` });
      }
    },
    [monthlyData, activeTimer, stopActiveTimer, updateEntry, awardXP, logActivity]
  );

  const setMigStatus = useCallback(
    (taskId, status) => {
      const task = migration.tasks.find((t) => t.id === taskId);
      const prevStatus = task ? task.status : "pending";
      if (status === "done" && activeTimer && activeTimer.kind === "migration" && activeTimer.taskId === taskId) {
        stopActiveTimer();
      }
      updateMigTask(taskId, { status, completedAt: status === "done" ? Date.now() : null });
      if (status === "done" && prevStatus !== "done") {
        awardXP(XP_RULES.migrationTaskCompleted, `${task ? task.name : "Task"} completed`);
        logActivity({ type: "migration-status", taskId, message: `Completed migration task "${task?.name || ""}"` });
      }
    },
    [migration.tasks, activeTimer, stopActiveTimer, updateMigTask, awardXP, logActivity]
  );

  /* ---------------- favorites / pinned / recent ---------------- */
  const toggleFavorite = useCallback(
    (taskId) => setFavorites((prev) => (prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId])),
    [setFavorites]
  );
  const togglePinned = useCallback(
    (taskId) => setPinned((prev) => (prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId])),
    [setPinned]
  );
  const touchRecent = useCallback(
    (taskId) => setRecentTaskIds((prev) => [taskId, ...prev.filter((id) => id !== taskId)].slice(0, 12)),
    [setRecentTaskIds]
  );

  /* ---------------- migration name-list actions ---------------- */
  const migrationDone = migration.log.length ? migration.log[migration.log.length - 1].totalAfter : 0;
  const migrationRemaining = Math.max(migration.total - migrationDone, 0);
  const migrationPercent = migration.total ? Math.min(100, Math.round((migrationDone / migration.total) * 100)) : 0;

  const applyMigrationChange = useCallback(
    (delta, note) => {
      setMigration((prev) => {
        const prevDone = prev.log.length ? prev.log[prev.log.length - 1].totalAfter : 0;
        const totalAfter = Math.max(0, Math.min(prev.total, prevDone + delta));
        return { ...prev, log: [...prev.log, { id: uid(), ts: Date.now(), change: totalAfter - prevDone, totalAfter, note: note || "" }] };
      });
      if (delta > 0) {
        awardXP(Math.min(15, Math.max(1, Math.round(delta / 5))), "Names migrated");
        logActivity({ type: "migration", message: `Migrated ${delta} name${delta === 1 ? "" : "s"}${note ? ` — ${note}` : ""}` });
      }
    },
    [setMigration, awardXP, logActivity]
  );

  const addMigTask = useCallback(
    (name) => {
      if (!name.trim()) return;
      const newTask = { id: uid(), name: name.trim(), status: "pending", timeSeconds: 0, sessions: [], notes: "", createdAt: Date.now() };
      setMigration((prev) => ({ ...prev, tasks: [newTask, ...prev.tasks] }));
      logActivity({ type: "migration-add", message: `Added migration task "${newTask.name}"` });
      return newTask.id;
    },
    [setMigration, logActivity]
  );
  const deleteMigTask = useCallback(
    (id) => {
      setActiveTimer((prev) => (prev && prev.kind === "migration" && prev.taskId === id ? null : prev));
      setMigration((prev) => ({ ...prev, tasks: prev.tasks.filter((t) => t.id !== id) }));
    },
    [setActiveTimer, setMigration]
  );

  /* ---------------- derived stats ---------------- */
  const now = Date.now();
  const monthStats = useMemo(() => computeMonthStats(monthlyData, activeTimer, now), [monthlyData, activeTimer, tick]); // eslint-disable-line
  const categoryStatsCurrentMonth = useMemo(() => computeCategoryStatsForMonth(monthlyData, CURRENT_MONTH_KEY), [monthlyData]);
  const sessions = useMemo(() => flattenSessions(monthlyData, migration), [monthlyData, migration]);
  const sessionStats = useMemo(() => computeSessionStats(sessions), [sessions]);
  const totals = useMemo(() => taskTotals(monthlyData), [monthlyData]);
  const { longest: longestTask, fastest: fastestTask } = useMemo(() => longestAndFastestTasks(monthlyData), [monthlyData]);
  const { best: bestMonth, worst: worstMonth } = useMemo(() => monthBestWorst(monthStats), [monthStats]);
  const { finished: categoriesFinished, needsAttention: categoriesNeedingAttention } = useMemo(
    () => categoriesAttentionSplit(categoryStatsCurrentMonth),
    [categoryStatsCurrentMonth]
  );
  const today = useMemo(() => todayTotals(sessions), [sessions, tick]); // eslint-disable-line
  const completedToday = useMemo(() => completedTodayCount(monthlyData, migration.tasks), [monthlyData, migration.tasks]);
  const inProgressThisMonth = useMemo(() => inProgressCount(monthlyData, CURRENT_MONTH_KEY), [monthlyData]);
  const remainingThisMonth = useMemo(() => remainingCount(monthlyData, CURRENT_MONTH_KEY), [monthlyData]);
  const estTimeRemaining = useMemo(() => estimatedTimeRemaining(monthlyData, CURRENT_MONTH_KEY), [monthlyData]);
  const avgReconciliationTime = useMemo(() => averageReconciliationTime(monthlyData), [monthlyData]);

  const totalDoneAllTime = useMemo(() => MONTHS.reduce((sum, m) => sum + monthStats[m.key].completed, 0), [monthStats]);
  const totalWorkedSeconds = useMemo(
    () => MONTHS.reduce((sum, m) => sum + monthStats[m.key].seconds, 0) + (migration.tasks || []).reduce((s, t) => s + (t.timeSeconds || 0), 0),
    [monthStats, migration.tasks]
  );
  const anyPerfectMonth = useMemo(() => MONTHS.some((m) => monthStats[m.key].percent === 100), [monthStats]);
  const currentLevel = levelInfo(game.xp).level;

  const weeklyActiveCount = useMemo(() => new Set(sessions.map((s) => isoWeekKey(s.start))).size, [sessions]);

  const noOverdue = useMemo(() => {
    const past = MONTHS.filter((m) => m.key !== CURRENT_MONTH_KEY);
    return past.length > 0 && past.every((m) => monthStats[m.key].percent === 100);
  }, [monthStats]);

  const categoryEverCompleted = useCallback(
    (categoryId) => MONTHS.some((m) => computeCategoryStatsForMonth(monthlyData, m.key).find((c) => c.id === categoryId)?.percent === 100),
    [monthlyData]
  );

  const fastReconciliationExists = useMemo(() => {
    return Object.values(monthlyData).some((tasks) =>
      Object.values(tasks || {}).some((e) => e.status === "done" && e.timeSeconds > 0 && e.timeSeconds < 300)
    );
  }, [monthlyData]);

  const marathonSessionExists = useMemo(() => sessions.some((s) => s.duration >= 3 * 3600), [sessions]);
  const earlyBirdExists = useMemo(() => sessions.some((s) => new Date(s.start).getHours() < 7), [sessions]);
  const nightOwlExists = useMemo(() => sessions.some((s) => new Date(s.start).getHours() >= 22), [sessions]);
  const closedBeforeDeadline = useMemo(
    () => Object.entries(game.monthClosedAt || {}).some(([, ts]) => new Date(ts).getDate() <= settings.closingDeadlineDay),
    [game.monthClosedAt, settings.closingDeadlineDay]
  );

  const earnedBadgeIds = useMemo(() => {
    const ids = [];
    if (totalDoneAllTime >= 1) ids.push("first-reconciliation");
    if (totalDoneAllTime >= 10) ids.push("ten-done");
    if (totalDoneAllTime >= 50) ids.push("fifty-done");
    if (totalDoneAllTime >= 100) ids.push("hundred-done");
    if (anyPerfectMonth) {
      ids.push("perfect-month");
      ids.push("all-categories-month");
    }
    if (game.streak >= 3) ids.push("streak-3");
    if (game.streak >= 7) ids.push("streak-7");
    if (game.streak >= 14) ids.push("streak-14");
    if (game.streak >= 30) ids.push("streak-30");
    if (weeklyActiveCount >= 4) ids.push("streak-week-4");
    if (migration.total && migrationDone >= migration.total * 0.25) ids.push("migration-quarter");
    if (migration.total && migrationDone >= migration.total * 0.5) ids.push("migration-half");
    if (migration.total && migrationDone >= migration.total) ids.push("migration-done");
    if (currentLevel >= 5) ids.push("level-5");
    if (currentLevel >= 10) ids.push("level-10");
    if (currentLevel >= 15) ids.push("level-15");
    if (currentLevel >= 25) ids.push("level-25");
    if (totalWorkedSeconds >= 5 * 3600) ids.push("hours-5");
    if (totalWorkedSeconds >= 10 * 3600) ids.push("hours-10");
    if (totalWorkedSeconds >= 50 * 3600) ids.push("hours-50");
    if (marathonSessionExists) ids.push("marathon-session");
    if (fastReconciliationExists) ids.push("fast-reconciliation");
    if (earlyBirdExists) ids.push("early-bird");
    if (nightOwlExists) ids.push("night-owl");
    if (noOverdue) ids.push("no-overdue");
    if (closedBeforeDeadline) ids.push("closed-before-deadline");
    if (categoryEverCompleted("payroll")) ids.push("cat-payroll-done");
    if (categoryEverCompleted("credit-card")) ids.push("cat-credit-card-done");
    if (categoryEverCompleted("cash")) ids.push("cat-cash-done");
    if (categoryEverCompleted("verification")) ids.push("cat-verification-done");
    return ids;
  }, [
    totalDoneAllTime, anyPerfectMonth, game.streak, weeklyActiveCount, migrationDone, migration.total,
    currentLevel, totalWorkedSeconds, marathonSessionExists, fastReconciliationExists, earlyBirdExists,
    nightOwlExists, noOverdue, closedBeforeDeadline, categoryEverCompleted,
  ]);

  useEffect(() => {
    const missing = earnedBadgeIds.filter((id) => !game.badges.includes(id));
    if (missing.length === 0) return;
    setGame((prev) => {
      const stillMissing = missing.filter((id) => !prev.badges.includes(id));
      if (stillMissing.length === 0) return prev;
      stillMissing.forEach((id) => {
        const b = BADGES.find((x) => x.id === id);
        if (b) {
          pushToast(`Badge unlocked — ${b.name}`, "badge");
          logActivity({ type: "badge", message: `Unlocked badge "${b.name}"` });
          setTimeout(() => setCelebration({ type: "badge", badge: b }), 250);
        }
      });
      return { ...prev, badges: [...prev.badges, ...stillMissing] };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [earnedBadgeIds]);

  /* ---------------- month-closed tracking (for "closed before deadline") ---------------- */
  useEffect(() => {
    const key = CURRENT_MONTH_KEY;
    if (monthStats[key]?.percent === 100 && !game.monthClosedAt?.[key]) {
      setGame((prev) => ({ ...prev, monthClosedAt: { ...prev.monthClosedAt, [key]: Date.now() } }));
      logActivity({ type: "month-closed", message: `Closed ${MONTHS.find((m) => m.key === key)?.full} at 100%` });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthStats[CURRENT_MONTH_KEY]?.percent]);

  /* ---------------- daily goal + daily challenge ---------------- */
  const dailyGoalMet = completedToday >= settings.dailyGoalTasks;
  const challenge = useMemo(() => todaysChallenge(), []);
  const challengeMet = useMemo(
    () => challenge.check({ completedToday, secondsToday: today.seconds, categoryStats: categoryStatsCurrentMonth }),
    [challenge, completedToday, today.seconds, categoryStatsCurrentMonth]
  );

  useEffect(() => {
    if (!loaded) return;
    const todayStr = new Date().toDateString();
    if (dailyGoalMet && game.dailyGoalClaimedDate !== todayStr) {
      setGame((prev) => ({ ...prev, dailyGoalClaimedDate: todayStr }));
      awardXP(XP_RULES.dailyGoalMet, "Daily goal reached");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailyGoalMet, loaded]);

  useEffect(() => {
    if (!loaded) return;
    const todayStr = new Date().toDateString();
    if (challengeMet && game.dailyChallengeClaimedDate !== todayStr) {
      setGame((prev) => ({ ...prev, dailyChallengeClaimedDate: todayStr }));
      awardXP(XP_RULES.dailyChallengeCompleted, "Daily challenge");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challengeMet, loaded]);

  const isTaskFavorite = useCallback((taskId) => favorites.includes(taskId), [favorites]);
  const isTaskPinned = useCallback((taskId) => pinned.includes(taskId), [pinned]);

  const value = {
    loaded,
    monthlyData, setMonthlyData,
    activeTimer, tick,
    migration, setMigration,
    game, setGame,
    settings, setSettings,
    favorites, pinned, recentTaskIds,
    activityLog,
    toasts, pushToast, dismissToast,
    celebration, setCelebration,

    updateEntry, updateMigTask,
    setStatus, setMigStatus,
    startTimer, stopActiveTimer, resetTimer,
    liveSecondsRecon, liveSecondsMig,
    toggleFavorite, togglePinned, touchRecent, isTaskFavorite, isTaskPinned,
    applyMigrationChange, addMigTask, deleteMigTask,
    migrationDone, migrationRemaining, migrationPercent,
    awardXP, logActivity,

    monthStats, categoryStatsCurrentMonth,
    sessions, sessionStats, totals,
    longestTask, fastestTask, bestMonth, worstMonth,
    categoriesFinished, categoriesNeedingAttention,
    today, completedToday, inProgressThisMonth, remainingThisMonth,
    estTimeRemaining, avgReconciliationTime,
    totalDoneAllTime, totalWorkedSeconds, currentLevel,
    dailyGoalMet, challenge, challengeMet,
  };

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}
