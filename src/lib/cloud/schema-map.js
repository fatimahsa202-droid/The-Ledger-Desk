/**
 * Translation layer between the app's existing in-memory/localStorage blob
 * shapes (unchanged — every page/hook still reads these exact shapes) and
 * the granular Supabase tables (see supabase/schema.sql). This is the only
 * place that needs to know both shapes; nothing else in the app does.
 */

const iso = (ms) => (ms ? new Date(ms).toISOString() : null);
const ms = (isoStr) => (isoStr ? new Date(isoStr).getTime() : null);

/* ---------------------------------------------------------------- pull ---- */

export function rowsToMonthlyData(entryRows, sessionRows, sourceRows) {
  const blob = {};
  const ensure = (monthKey, taskId) => {
    if (!blob[monthKey]) blob[monthKey] = {};
    if (!blob[monthKey][taskId]) {
      blob[monthKey][taskId] = { status: "pending", completedAt: null, notes: "", timeSeconds: 0, sessions: [], sources: [] };
    }
    return blob[monthKey][taskId];
  };

  entryRows.forEach((r) => {
    const e = ensure(r.month_key, r.task_id);
    e.status = r.status;
    e.completedAt = ms(r.completed_at);
    e.notes = r.notes || "";
  });

  sessionRows
    .filter((s) => s.source_type === "reconciliation" && s.month_key)
    .forEach((s) => {
      const e = ensure(s.month_key, s.task_id);
      e.sessions.push({ id: s.id, start: ms(s.start_at), end: ms(s.end_at), duration: s.duration_seconds });
      e.timeSeconds += s.duration_seconds;
    });

  sourceRows.forEach((s) => {
    const e = ensure(s.month_key, s.task_id);
    e.sources.push({ id: s.id, label: s.label, link: s.link || "" });
  });

  Object.values(blob).forEach((tasks) =>
    Object.values(tasks).forEach((e) => e.sessions.sort((a, b) => a.start - b.start))
  );
  return blob;
}

export function rowsToMigration(stateRow, logRows, taskRows, sessionRows) {
  const tasks = taskRows.map((t) => ({
    id: t.id,
    name: t.name,
    status: t.status,
    notes: t.notes || "",
    createdAt: ms(t.created_at),
    completedAt: ms(t.completed_at),
    timeSeconds: 0,
    sessions: [],
  }));
  const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));
  sessionRows
    .filter((s) => s.source_type === "migration")
    .forEach((s) => {
      const t = byId[s.task_id];
      if (!t) return;
      t.sessions.push({ id: s.id, start: ms(s.start_at), end: ms(s.end_at), duration: s.duration_seconds });
      t.timeSeconds += s.duration_seconds;
    });
  tasks.forEach((t) => t.sessions.sort((a, b) => a.start - b.start));

  const log = logRows
    .map((l) => ({ id: l.id, ts: ms(l.ts), change: l.change, totalAfter: l.total_after, note: l.note || "" }))
    .sort((a, b) => a.ts - b.ts);

  return { total: stateRow?.total ?? 720, log, tasks };
}

export function rowToGamification(row, badgeRows) {
  if (!row) return null;
  return {
    xp: row.xp,
    streak: row.streak,
    lastActiveDate: row.last_active_date,
    dailyGoalClaimedDate: row.daily_goal_claimed_date,
    dailyChallengeClaimedDate: row.daily_challenge_claimed_date,
    showcaseBadge: row.showcase_badge,
    monthClosedAt: row.month_closed_at || {},
    badges: badgeRows.map((b) => b.badge_id),
  };
}

export function rowToSettingsPatch(row) {
  if (!row) return null;
  return { closingDeadlineDay: row.closing_deadline_day, dailyGoalTasks: row.daily_goal_tasks, workingDays: row.working_days || undefined };
}

/* --------------------------------------------------- Phase A: pull ---- */

export function rowsToTaskDefinitions(rows) {
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    categoryId: r.category_id,
    priority: r.priority,
    frequency: r.frequency,
    monthlyRule: r.monthly_rule || { kind: "none" },
    weekdays: r.weekdays || [],
    everyNWeeks: r.every_n_weeks || 1,
    yearlyRule: r.yearly_rule || { month: 0, day: 1 },
    customRule: r.custom_rule || { everyN: 1, unit: "days" },
    dueDate: ms(r.due_date),
    notes: r.notes || "",
    timerEligible: r.timer_eligible,
    isBuiltIn: r.is_built_in,
    legacyMonthlyStorage: r.legacy_monthly_storage,
    graduatedFrom: ms(r.graduated_from),
    archived: r.archived,
    createdAt: ms(r.created_at) || 0,
    updatedAt: ms(r.updated_at) || 0,
  }));
}

export function rowsToCategories(rows) {
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    icon: r.icon,
    color: r.color,
    order: r.order_index,
    isBuiltIn: r.is_built_in,
    archived: r.archived,
  }));
}

export function rowsToOccurrences(rows) {
  const map = {};
  rows.forEach((r) => {
    map[r.id] = {
      id: r.id,
      definitionId: r.definition_id,
      periodKey: r.period_key,
      name: r.name,
      categoryId: r.category_id,
      priority: r.priority,
      monthlyRuleKind: r.monthly_rule_kind,
      dueDate: ms(r.due_date),
      status: r.status,
      completedAt: ms(r.completed_at),
      notes: r.notes || "",
      timeSeconds: r.time_seconds || 0,
      sessions: r.sessions || [],
      sources: r.sources || [],
      createdAt: ms(r.created_at) || 0,
      updatedAt: ms(r.updated_at) || 0,
    };
  });
  return map;
}

export function rowToPreferences(row) {
  if (!row) return { favorites: [], pinned: [], recentTasks: [] };
  return { favorites: row.favorites || [], pinned: row.pinned || [], recentTasks: row.recent_tasks || [] };
}

export function rowsToActivityLog(rows) {
  return rows
    .map((r) => ({ id: r.id, ts: ms(r.ts), type: r.type, taskId: r.task_id || undefined, monthKey: r.month_key || undefined, message: r.message }))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 200);
}

export function rowToActiveTimer(row) {
  if (!row) return null;
  return { kind: row.kind, taskId: row.task_id, monthKey: row.month_key || null, startedAt: ms(row.started_at) };
}

/* ---------------------------------------------------------------- push ---- */

export function buildReconciliationRow(userId, monthKey, taskId, entry) {
  return { user_id: userId, month_key: monthKey, task_id: taskId, status: entry.status, completed_at: iso(entry.completedAt), notes: entry.notes || "" };
}

export function buildSessionRow(userId, session, sourceType, taskId, monthKey) {
  return {
    id: session.id, user_id: userId, source_type: sourceType, task_id: taskId, month_key: monthKey || null,
    start_at: iso(session.start), end_at: iso(session.end), duration_seconds: session.duration,
  };
}

export function buildSourceRow(userId, monthKey, taskId, source) {
  return { id: source.id, user_id: userId, month_key: monthKey, task_id: taskId, label: source.label, link: source.link || "" };
}

export function buildMigrationStateRow(userId, total) {
  return { user_id: userId, total };
}

export function buildMigrationLogRow(userId, entry) {
  return { id: entry.id, user_id: userId, ts: iso(entry.ts), change: entry.change, total_after: entry.totalAfter, note: entry.note || "" };
}

export function buildMigrationTaskRow(userId, task) {
  return { id: task.id, user_id: userId, name: task.name, status: task.status, notes: task.notes || "", completed_at: iso(task.completedAt) };
}

export function buildActivityLogRow(userId, entry) {
  return { id: entry.id, user_id: userId, ts: iso(entry.ts), type: entry.type, task_id: entry.taskId || null, month_key: entry.monthKey || null, message: entry.message };
}

export function buildGamificationRow(userId, game) {
  return {
    user_id: userId, xp: game.xp, streak: game.streak, last_active_date: game.lastActiveDate,
    daily_goal_claimed_date: game.dailyGoalClaimedDate, daily_challenge_claimed_date: game.dailyChallengeClaimedDate,
    showcase_badge: game.showcaseBadge, month_closed_at: game.monthClosedAt || {},
  };
}

export function buildBadgeRow(userId, badgeId) {
  return { user_id: userId, badge_id: badgeId };
}

export function buildActiveTimerRow(userId, timer) {
  return { user_id: userId, kind: timer.kind, task_id: timer.taskId, month_key: timer.monthKey || null, started_at: iso(timer.startedAt) };
}

export function buildSettingsRow(userId, settings) {
  return {
    user_id: userId,
    closing_deadline_day: settings.closingDeadlineDay,
    daily_goal_tasks: settings.dailyGoalTasks,
    working_days: settings.workingDays || [0, 1, 2, 3, 4],
  };
}

export function buildPreferencesRow(userId, prefs) {
  return { user_id: userId, favorites: prefs.favorites || [], pinned: prefs.pinned || [], recent_tasks: prefs.recentTasks || [] };
}

/* --------------------------------------------------- Phase A: push ---- */

export function buildTaskDefinitionRow(userId, def) {
  return {
    id: def.id,
    user_id: userId,
    name: def.name,
    category_id: def.categoryId,
    priority: def.priority,
    frequency: def.frequency,
    monthly_rule: def.monthlyRule || null,
    weekdays: def.weekdays || [],
    every_n_weeks: def.everyNWeeks || 1,
    yearly_rule: def.yearlyRule || null,
    custom_rule: def.customRule || null,
    due_date: iso(def.dueDate),
    notes: def.notes || "",
    timer_eligible: def.timerEligible !== false,
    is_built_in: !!def.isBuiltIn,
    legacy_monthly_storage: !!def.legacyMonthlyStorage,
    graduated_from: iso(def.graduatedFrom),
    archived: !!def.archived,
  };
}

export function buildCategoryRow(userId, cat) {
  return {
    id: cat.id,
    user_id: userId,
    name: cat.name,
    icon: cat.icon || null,
    color: cat.color || null,
    order_index: cat.order ?? 0,
    is_built_in: !!cat.isBuiltIn,
    archived: !!cat.archived,
  };
}

export function buildOccurrenceRow(userId, occ) {
  return {
    id: occ.id,
    user_id: userId,
    definition_id: occ.definitionId,
    period_key: occ.periodKey,
    name: occ.name,
    category_id: occ.categoryId,
    priority: occ.priority,
    monthly_rule_kind: occ.monthlyRuleKind || null,
    due_date: iso(occ.dueDate),
    status: occ.status,
    completed_at: iso(occ.completedAt),
    notes: occ.notes || "",
    time_seconds: occ.timeSeconds || 0,
    sessions: occ.sessions || [],
    sources: occ.sources || [],
  };
}
