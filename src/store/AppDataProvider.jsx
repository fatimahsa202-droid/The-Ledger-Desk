import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { ALL_TASKS, TASK_BY_ID } from "../data/categories.js";
import { STORAGE_KEYS } from "../lib/storage.js";
import { useStoredState } from "../hooks/useStoredState.js";
import { MONTHS, CURRENT_MONTH_KEY, getEntry, uid, isoWeekKey, dayKey } from "../lib/format.js";
import { levelInfo, levelTitle, BADGES, XP_RULES } from "../lib/gamification.js";
import { todaysChallenge } from "../lib/dailyChallenges.js";
import { DEFAULT_GAME, DEFAULT_MIGRATION, DEFAULT_SETTINGS, DEFAULT_TASK_DEFINITIONS, DEFAULT_CATEGORY_DEFS } from "./defaults.js";
import { cloudSync } from "../lib/cloud/CloudSyncEngine.js";
import { buildEffectiveCategories, definitionSafeToDelete, categorySafeToDelete } from "../data/taskDefinitions.js";
import { ensureOccurrences, findRecalculableBusinessDayOccurrences, recalculateBusinessDayOccurrences } from "../lib/occurrenceEngine.js";
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
  const [taskDefinitions, setTaskDefinitions, l10] = useStoredState(STORAGE_KEYS.taskDefinitions, DEFAULT_TASK_DEFINITIONS);
  const [categoryDefs, setCategoryDefs, l11] = useStoredState(STORAGE_KEYS.categoryDefs, DEFAULT_CATEGORY_DEFS);
  const [occurrences, setOccurrences, l12] = useStoredState(STORAGE_KEYS.occurrences, {});

  const loaded = l1 && l2 && l3 && l4 && l5 && l6 && l7 && l8 && l9 && l10 && l11 && l12;

  const [tick, setTick] = useState(0);
  const [toasts, setToasts] = useState([]);
  const [celebration, setCelebration] = useState(null);

  /* ---------------- cloud sync wiring ----------------
   * Local state (above) remains the fast, offline-capable source pages
   * read from — unchanged. Cloud sync is a purely additive side channel:
   * mutators below also push a precise, granular description of what
   * changed; a separate reconcile/Realtime path (never routed through
   * these mutators) pulls authoritative state and applies it via the
   * setters registered here. `remoteEchoRef` prevents a just-applied
   * remote value from immediately bouncing back out as a redundant push.
   */
  const remoteEchoRef = useRef({});
  const snapshotRef = useRef();
  snapshotRef.current = {
    monthlyData, migration, game, settings, favorites, pinned, recentTaskIds, activityLog, activeTimer,
    taskDefinitions, categoryDefs, occurrences,
  };

  useEffect(() => {
    cloudSync.registerHandlers({
      getLocalSnapshot: () => snapshotRef.current,
      apply: {
        setMonthlyData: (blob) => setMonthlyData(blob),
        setMigration: (blob) => {
          remoteEchoRef.current.migrationTotal = blob.total;
          setMigration(blob);
        },
        setGame: (updater) => {
          setGame((prev) => {
            const next = typeof updater === "function" ? updater(prev) : { ...prev, ...updater };
            remoteEchoRef.current.game = JSON.stringify(next);
            return next;
          });
        },
        setActivityLog: (arr) => setActivityLog(arr),
        setSettings: (updater) => {
          setSettings((prev) => {
            const next = typeof updater === "function" ? updater(prev) : { ...prev, ...updater };
            remoteEchoRef.current.settingsSynced = JSON.stringify({ closingDeadlineDay: next.closingDeadlineDay, dailyGoalTasks: next.dailyGoalTasks, workingDays: next.workingDays });
            return next;
          });
        },
        setFavorites: (arr) => {
          remoteEchoRef.current.prefs = JSON.stringify({ favorites: arr, pinned: snapshotRef.current.pinned, recentTasks: snapshotRef.current.recentTaskIds });
          setFavorites(arr);
        },
        setPinned: (arr) => {
          remoteEchoRef.current.prefs = JSON.stringify({ favorites: snapshotRef.current.favorites, pinned: arr, recentTasks: snapshotRef.current.recentTaskIds });
          setPinned(arr);
        },
        setRecentTaskIds: (arr) => {
          remoteEchoRef.current.prefs = JSON.stringify({ favorites: snapshotRef.current.favorites, pinned: snapshotRef.current.pinned, recentTasks: arr });
          setRecentTaskIds(arr);
        },
        adoptRemoteActiveTimer: (timer) => {
          remoteEchoRef.current.activeTimer = JSON.stringify(timer);
          setActiveTimer(timer);
        },
        setTaskDefinitions: (arr) => {
          remoteEchoRef.current.taskDefinitions = JSON.stringify(arr);
          setTaskDefinitions(arr);
        },
        setCategoryDefs: (arr) => {
          remoteEchoRef.current.categoryDefs = JSON.stringify(arr);
          setCategoryDefs(arr);
        },
        setOccurrences: (obj) => {
          remoteEchoRef.current.occurrences = JSON.stringify(obj);
          setOccurrences(obj);
        },
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const json = JSON.stringify(game);
    if (remoteEchoRef.current.game === json) return;
    cloudSync.pushGamificationState(game);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, loaded]);

  useEffect(() => {
    if (!loaded) return;
    if (remoteEchoRef.current.migrationTotal === migration.total) return;
    cloudSync.pushMigrationState(migration.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [migration.total, loaded]);

  useEffect(() => {
    if (!loaded) return;
    const json = JSON.stringify({ closingDeadlineDay: settings.closingDeadlineDay, dailyGoalTasks: settings.dailyGoalTasks, workingDays: settings.workingDays });
    if (remoteEchoRef.current.settingsSynced === json) return;
    cloudSync.pushSettings(settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.closingDeadlineDay, settings.dailyGoalTasks, settings.workingDays, loaded]);

  useEffect(() => {
    if (!loaded) return;
    const json = JSON.stringify({ favorites, pinned, recentTasks: recentTaskIds });
    if (remoteEchoRef.current.prefs === json) return;
    cloudSync.pushPreferences({ favorites, pinned, recentTasks: recentTaskIds });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favorites, pinned, recentTaskIds, loaded]);

  useEffect(() => {
    if (!loaded) return;
    const json = JSON.stringify(activeTimer);
    if (remoteEchoRef.current.activeTimer === json) return;
    if (activeTimer) cloudSync.pushActiveTimer(activeTimer);
    else cloudSync.clearActiveTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTimer, loaded]);

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
      const full = { id: uid(), ts: Date.now(), ...entry };
      setActivityLog((prev) => [full, ...prev].slice(0, 200));
      cloudSync.pushActivityLogEntry(full);
    },
    [setActivityLog]
  );

  /* ==================================================================
   * Phase A — Task Definitions, Categories, Occurrences.
   * Purely additive: monthlyData and every mutator above this block are
   * completely untouched. See src/data/taskDefinitions.js and
   * src/lib/occurrenceEngine.js for the underlying model.
   * ================================================================== */

  const effectiveCategories = useMemo(
    () => buildEffectiveCategories(categoryDefs, taskDefinitions),
    [categoryDefs, taskDefinitions]
  );

  // Idempotent occurrence generation — safe to run on every load and
  // whenever definitions or the working-days rule change. Never touches
  // legacy (original 53) definitions; those keep working through
  // monthlyData exactly as today.
  useEffect(() => {
    if (!loaded) return;
    const { occurrences: merged, added } = ensureOccurrences({
      taskDefinitions,
      occurrences,
      now: new Date(),
      workingDays: settings.workingDays || DEFAULT_SETTINGS.workingDays,
    });
    if (added.length > 0) {
      added.forEach((o) => cloudSync.pushOccurrence(o));
      setOccurrences(merged);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, taskDefinitions, settings.workingDays]);

  const addTaskDefinition = useCallback(
    (input) => {
      const id = uid();
      const def = {
        id,
        name: (input.name || "").trim(),
        categoryId: input.categoryId,
        priority: input.priority || "normal",
        frequency: input.frequency || "monthly",
        monthlyRule: input.monthlyRule || { kind: "none" },
        weekdays: input.weekdays || [],
        everyNWeeks: input.everyNWeeks || 1,
        yearlyRule: input.yearlyRule || { month: 0, day: 1 },
        customRule: input.customRule || { everyN: 1, unit: "days" },
        dueDate: input.dueDate || null,
        notes: input.notes || "",
        timerEligible: input.timerEligible !== false,
        isBuiltIn: false,
        legacyMonthlyStorage: false,
        archived: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setTaskDefinitions((prev) => [...prev, def]);
      cloudSync.pushTaskDefinition(def);
      logActivity({ type: "task-def-add", message: `Added task "${def.name}"` });
      return id;
    },
    [setTaskDefinitions, logActivity]
  );

  const updateTaskDefinition = useCallback(
    (id, patch) => {
      setTaskDefinitions((prev) => {
        const next = prev.map((d) => (d.id === id ? { ...d, ...patch, updatedAt: Date.now() } : d));
        const updated = next.find((d) => d.id === id);
        if (updated) cloudSync.pushTaskDefinition(updated);
        return next;
      });
    },
    [setTaskDefinitions]
  );

  const archiveTaskDefinition = useCallback(
    (id, archived = true) => {
      const def = taskDefinitions.find((d) => d.id === id);
      updateTaskDefinition(id, { archived });
      logActivity({ type: "task-def-archive", message: `${archived ? "Archived" : "Reactivated"} task "${def?.name || ""}"` });
    },
    [taskDefinitions, updateTaskDefinition, logActivity]
  );

  const deleteTaskDefinition = useCallback(
    (id) => {
      const def = taskDefinitions.find((d) => d.id === id);
      if (!def) return { ok: false, error: "Not found." };
      if (!definitionSafeToDelete(def, monthlyData, occurrences)) {
        return { ok: false, error: "This task has history — archive it instead of deleting." };
      }
      setTaskDefinitions((prev) => prev.filter((d) => d.id !== id));
      cloudSync.deleteTaskDefinition(id);
      return { ok: true };
    },
    [taskDefinitions, monthlyData, occurrences, setTaskDefinitions]
  );

  const addCategory = useCallback(
    (input) => {
      const id = uid();
      const cat = {
        id,
        name: (input.name || "").trim(),
        icon: input.icon || "layers",
        color: input.color || null,
        order: categoryDefs.length,
        isBuiltIn: false,
        archived: false,
      };
      setCategoryDefs((prev) => [...prev, cat]);
      cloudSync.pushCategory(cat);
      logActivity({ type: "category-add", message: `Added category "${cat.name}"` });
      return id;
    },
    [categoryDefs, setCategoryDefs, logActivity]
  );

  const updateCategory = useCallback(
    (id, patch) => {
      setCategoryDefs((prev) => {
        const next = prev.map((c) => (c.id === id ? { ...c, ...patch } : c));
        const updated = next.find((c) => c.id === id);
        if (updated) cloudSync.pushCategory(updated);
        return next;
      });
    },
    [setCategoryDefs]
  );

  const archiveCategory = useCallback(
    (id, archived = true) => {
      updateCategory(id, { archived });
    },
    [updateCategory]
  );

  const deleteCategory = useCallback(
    (id) => {
      if (!categorySafeToDelete(id, taskDefinitions)) {
        return { ok: false, error: "This category has tasks assigned (now or historically) — archive it instead of deleting." };
      }
      setCategoryDefs((prev) => prev.filter((c) => c.id !== id));
      cloudSync.deleteCategory(id);
      return { ok: true };
    },
    [taskDefinitions, setCategoryDefs]
  );

  const reorderCategory = useCallback(
    (id, direction) => {
      setCategoryDefs((prev) => {
        const sorted = [...prev].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const idx = sorted.findIndex((c) => c.id === id);
        const swapIdx = idx + direction;
        if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return prev;
        const a = sorted[idx], b = sorted[swapIdx];
        const aOrder = a.order ?? 0, bOrder = b.order ?? 0;
        const next = prev.map((c) => (c.id === a.id ? { ...c, order: bOrder } : c.id === b.id ? { ...c, order: aOrder } : c));
        cloudSync.pushCategory(next.find((c) => c.id === a.id));
        cloudSync.pushCategory(next.find((c) => c.id === b.id));
        return next;
      });
    },
    [setCategoryDefs]
  );

  const updateOccurrenceNotes = useCallback(
    (occId, notes) => {
      setOccurrences((prev) => {
        const o = prev[occId];
        if (!o) return prev;
        const next = { ...o, notes, updatedAt: Date.now() };
        cloudSync.pushOccurrence(next);
        return { ...prev, [occId]: next };
      });
    },
    [setOccurrences]
  );

  // Graduates a legacy (original 53) task onto the new recurrence engine as
  // of a user-chosen date. Never touches monthlyData — everything before
  // graduatedFrom stays exactly as it is, forever; the occurrence engine
  // (see its useEffect above) only ever generates occurrences on/after it.
  const graduateTaskDefinition = useCallback(
    (id, { graduatedFrom, ...recurrencePatch }) => {
      updateTaskDefinition(id, { ...recurrencePatch, graduatedFrom });
      const def = taskDefinitions.find((d) => d.id === id);
      logActivity({ type: "task-def-graduate", message: `Moved "${def?.name || ""}" onto the new recurrence system, starting ${new Date(graduatedFrom).toLocaleDateString()}` });
    },
    [taskDefinitions, updateTaskDefinition, logActivity]
  );

  // Working Days change: recalculation is always an explicit, separate
  // opt-in — changing the setting alone never moves an existing occurrence.
  const recalculableBusinessDayOccurrences = useCallback(
    () => findRecalculableBusinessDayOccurrences(occurrences, new Date()),
    [occurrences]
  );

  const applyWorkingDaysChange = useCallback(
    (newWorkingDays, { recalcUpcoming = false } = {}) => {
      if (recalcUpcoming) {
        const candidates = findRecalculableBusinessDayOccurrences(occurrences, new Date());
        const updates = recalculateBusinessDayOccurrences(candidates, taskDefinitions, newWorkingDays);
        Object.values(updates).forEach((o) => cloudSync.pushOccurrence(o));
        setOccurrences((prev) => ({ ...prev, ...updates }));
      }
      setSettings((prev) => ({ ...prev, workingDays: newWorkingDays }));
      logActivity({ type: "working-days", message: "Updated Working Days configuration" });
    },
    [occurrences, taskDefinitions, setOccurrences, setSettings, logActivity]
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
        const next = { ...entry, ...patch };
        cloudSync.pushReconciliationEntry(monthKey, taskId, next);
        return { ...prev, [monthKey]: { ...prev[monthKey], [taskId]: next } };
      });
    },
    [setMonthlyData]
  );

  const addSource = useCallback(
    (taskId, monthKey, source) => {
      const full = { id: uid(), ...source };
      updateEntry(taskId, monthKey, { sources: [...getEntry(monthlyData, monthKey, taskId).sources, full] });
      cloudSync.pushSource(monthKey, taskId, full);
      return full.id;
    },
    [monthlyData, updateEntry]
  );

  const removeSource = useCallback(
    (taskId, monthKey, sourceId) => {
      updateEntry(taskId, monthKey, { sources: getEntry(monthlyData, monthKey, taskId).sources.filter((s) => s.id !== sourceId) });
      cloudSync.removeSource(sourceId);
    },
    [monthlyData, updateEntry]
  );

  const updateMigTask = useCallback(
    (taskId, patch) => {
      setMigration((prev) => {
        const next = { ...prev, tasks: prev.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t)) };
        const updated = next.tasks.find((t) => t.id === taskId);
        if (updated) cloudSync.pushMigrationTask(updated);
        return next;
      });
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
        cloudSync.pushSession(session, "reconciliation", prev.taskId, prev.monthKey);
        const task = TASK_BY_ID[prev.taskId];
        if (elapsed >= 5) {
          logActivity({ type: "session", taskId: prev.taskId, taskName: task?.name, duration: elapsed, message: `Logged ${Math.round(elapsed / 60)}m on ${task?.name || "a task"}` });
        }
      } else if (prev.kind === "migration") {
        setMigration((mg) => ({
          ...mg,
          tasks: mg.tasks.map((t) => (t.id === prev.taskId ? { ...t, timeSeconds: (t.timeSeconds || 0) + elapsed, sessions: [...(t.sessions || []), session] } : t)),
        }));
        cloudSync.pushSession(session, "migration", prev.taskId, null);
      } else if (prev.kind === "occurrence") {
        // Occurrence timer sessions live inside the occurrence row itself
        // (task_occurrences.time_seconds / .sessions) rather than the
        // work_sessions table — that table's source_type column is
        // constrained to ('reconciliation','migration'), so pushSession()
        // would fail here; pushOccurrence() already carries this data.
        setOccurrences((occ) => {
          const o = occ[prev.taskId];
          if (!o) return occ;
          const next = { ...o, timeSeconds: (o.timeSeconds || 0) + elapsed, sessions: [...(o.sessions || []), session], updatedAt: Date.now() };
          cloudSync.pushOccurrence(next);
          if (elapsed >= 5) {
            logActivity({ type: "session", taskId: prev.taskId, taskName: o.name, duration: elapsed, message: `Logged ${Math.round(elapsed / 60)}m on ${o.name || "a task"}` });
          }
          return { ...occ, [prev.taskId]: next };
        });
      }
      return null;
    });
  }, [setActiveTimer, setMonthlyData, setMigration, setOccurrences, logActivity]);

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
      if (kind === "recon") {
        updateEntry(taskId, monthKey, { timeSeconds: 0, sessions: [] });
        cloudSync.clearSessionsFor("reconciliation", taskId, monthKey);
      } else if (kind === "migration") {
        updateMigTask(taskId, { timeSeconds: 0, sessions: [] });
        cloudSync.clearSessionsFor("migration", taskId, null);
      } else if (kind === "occurrence") {
        setOccurrences((prev) => {
          const o = prev[taskId];
          if (!o) return prev;
          const next = { ...o, timeSeconds: 0, sessions: [], updatedAt: Date.now() };
          cloudSync.pushOccurrence(next);
          return { ...prev, [taskId]: next };
        });
      }
    },
    [setActiveTimer, updateEntry, updateMigTask, setOccurrences]
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

  const liveSecondsOcc = useCallback(
    (occId) => {
      const base = (occurrences[occId] && occurrences[occId].timeSeconds) || 0;
      if (activeTimer && activeTimer.kind === "occurrence" && activeTimer.taskId === occId) {
        return base + Math.floor((Date.now() - activeTimer.startedAt) / 1000);
      }
      return base;
      // eslint-disable-next-line
    },
    [occurrences, activeTimer, tick]
  );

  const setOccurrenceStatus = useCallback(
    (occId, status) => {
      if (status === "done" && activeTimer && activeTimer.kind === "occurrence" && activeTimer.taskId === occId) {
        stopActiveTimer();
      }
      setOccurrences((prev) => {
        const o = prev[occId];
        if (!o) return prev;
        const next = { ...o, status, completedAt: status === "done" ? Date.now() : null, updatedAt: Date.now() };
        cloudSync.pushOccurrence(next);
        return { ...prev, [occId]: next };
      });
    },
    [setOccurrences, activeTimer, stopActiveTimer]
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
        const logEntry = { id: uid(), ts: Date.now(), change: totalAfter - prevDone, totalAfter, note: note || "" };
        cloudSync.pushMigrationLogEntry(logEntry);
        return { ...prev, log: [...prev.log, logEntry] };
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
      cloudSync.pushMigrationTask(newTask);
      logActivity({ type: "migration-add", message: `Added migration task "${newTask.name}"` });
      return newTask.id;
    },
    [setMigration, logActivity]
  );
  const deleteMigTask = useCallback(
    (id) => {
      setActiveTimer((prev) => (prev && prev.kind === "migration" && prev.taskId === id ? null : prev));
      setMigration((prev) => ({ ...prev, tasks: prev.tasks.filter((t) => t.id !== id) }));
      cloudSync.deleteMigrationTask(id);
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
          cloudSync.pushBadge(id);
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

    taskDefinitions, categoryDefs, occurrences, effectiveCategories,
    addTaskDefinition, updateTaskDefinition, archiveTaskDefinition, deleteTaskDefinition,
    addCategory, updateCategory, archiveCategory, deleteCategory, reorderCategory,
    setOccurrenceStatus, updateOccurrenceNotes, graduateTaskDefinition,
    recalculableBusinessDayOccurrences, applyWorkingDaysChange,

    updateEntry, addSource, removeSource, updateMigTask,
    setStatus, setMigStatus,
    startTimer, stopActiveTimer, resetTimer,
    liveSecondsRecon, liveSecondsMig, liveSecondsOcc,
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
