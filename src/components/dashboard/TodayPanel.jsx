import React, { useMemo } from "react";
import { Icon } from "../../lib/Icon.jsx";
import { Card, StatCard, Pill, ProgressBar, RingProgress, LevelAvatar, EmptyState } from "../primitives.jsx";
import { useAppData } from "../../store/AppDataProvider.jsx";
import { formatHMS, formatHours, relativeTime } from "../../lib/format.js";
import { TASK_BY_ID } from "../../data/categories.js";
import { levelInfo, levelTitle, levelRankTier, xpProgressPercent, quoteOfTheDay, greetingForNow, randomEncouragement } from "../../lib/gamification.js";
import { BADGES } from "../../lib/gamification.js";
import {
  buildAccountingSessions, sessionsInRange, sumSeconds, liveElapsedInRange,
  computeOccurrenceKPIs, computeCompletedInRange,
} from "../../lib/dashboardSelectors.js";

function iconForActivity(type) {
  switch (type) {
    case "status": return "circle-check";
    case "session": return "clock";
    case "badge": return "medal";
    case "migration": return "languages";
    case "migration-status": return "languages";
    case "migration-add": return "plus-circle";
    case "month-closed": return "calendar-check";
    default: return "activity";
  }
}

export function TodayPanel({ navigate, selectedCategory, dayStart, dayEnd, now }) {
  const {
    game, categoriesFinished, categoriesNeedingAttention,
    activeTimer, liveSecondsRecon, liveSecondsMig, stopActiveTimer,
    activityLog, dailyGoalMet, challenge, challengeMet, settings,
    monthlyData, occurrences, taskDefinitions, migration,
    setOccurrenceStatus,
  } = useAppData();

  const info = levelInfo(game.xp);
  const tier = levelRankTier(info.level);
  const completedToday = computeCompletedInRange(monthlyData, occurrences, taskDefinitions, dayStart, dayEnd, selectedCategory);
  const dailyGoalProgress = Math.min(100, Math.round((completedToday / Math.max(1, settings.dailyGoalTasks)) * 100));

  const todayKpis = useMemo(
    () => computeOccurrenceKPIs(occurrences, taskDefinitions, now, dayStart, dayEnd, selectedCategory),
    [occurrences, taskDefinitions, now, dayStart, dayEnd, selectedCategory]
  );
  const hoursToday = useMemo(() => {
    const accSessions = buildAccountingSessions(monthlyData, occurrences, taskDefinitions);
    const base = sumSeconds(sessionsInRange(accSessions, dayStart, dayEnd, selectedCategory));
    return base + liveElapsedInRange(activeTimer, now, dayStart, dayEnd);
  }, [monthlyData, occurrences, taskDefinitions, dayStart, dayEnd, selectedCategory, activeTimer, now]);

  const nextUpTask = categoriesNeedingAttention.length > 0 ? categoriesNeedingAttention[0].id : null;
  const activeTimerTask = activeTimer
    ? activeTimer.kind === "recon" ? TASK_BY_ID[activeTimer.taskId] : migration.tasks.find((t) => t.id === activeTimer.taskId)
    : null;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</div>
          <h1 className="page-title mt-1">{greetingForNow()}</h1>
          <p className="page-sub" style={{ maxWidth: 520 }}>&ldquo;{quoteOfTheDay()}&rdquo;</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate("categories")}>
          <Icon name="clipboard-list" size={15} /> Go to task board
        </button>
      </div>

      <div className="grid grid-auto-sm mb-6">
        <StatCard icon="calendar-days" iconTone="accent" label="Due Today" value={todayKpis.total} />
        <StatCard icon="triangle-alert" iconTone="rust" label="Overdue" value={todayKpis.overdue} />
        <StatCard icon="circle-dot" iconTone="amber" label="In Progress" value={todayKpis.inProgress} />
        <StatCard icon="flag" iconTone="gold" label="High / Critical Priority" value={todayKpis.highCritical} />
        <StatCard icon="check" iconTone="green" label="Completed Today" value={completedToday} />
        <StatCard icon="clock" iconTone="purple" label="Hours Worked Today" value={formatHours(hoursToday)} />
        <StatCard icon="flame" iconTone="amber" label="Current streak" value={`${game.streak}d`} />
        <StatCard icon="crown" iconTone="gold" label="Level" value={info.level} sub={levelTitle(info.level)} />
        <StatCard icon="sparkles" iconTone="purple" label="XP" value={game.xp} sub={`${info.xpIntoLevel}/${info.xpForLevel} to next`} />
      </div>

      <div className="grid split-16-10">
        <div className="flex flex-col gap-4 min-w-0">
          {todayKpis.items.length > 0 && (
            <Card pad={false}>
              <div className="eyebrow" style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>Today's recurring accounting work</div>
              <div>
                {todayKpis.items.map((o) => {
                  const overdue = o.status !== "done" && o.dueDate != null && (() => { const d = new Date(o.dueDate); d.setHours(23, 59, 59, 999); return d.getTime() < now; })();
                  return (
                    <div key={o.id} className="flex items-center justify-between gap-2 text-sm" style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
                      <span className="flex items-center gap-2 truncate">
                        {(o.priority === "high" || o.priority === "critical") && (
                          <Icon name="flag" size={11} style={{ color: o.priority === "critical" ? "var(--rust)" : "var(--gold)" }} className="shrink-0" />
                        )}
                        <span className="truncate">{o.name}</span>
                        {overdue && <Pill tone="rust" outline>Overdue</Pill>}
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        <Pill tone={o.status === "done" ? "green" : "rust"} outline={o.status !== "done"}>{o.status === "done" ? "Completed" : "Pending"}</Pill>
                        <button className="btn btn-ghost btn-sm" onClick={() => setOccurrenceStatus(o.id, o.status === "done" ? "pending" : "done")}>
                          {o.status === "done" ? "Reopen" : "Complete"}
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          <Card>
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="eyebrow">Right now</div>
                <div className="text-lg fw-bold font-display mt-1">What should I work on?</div>
              </div>
            </div>

            {activeTimer ? (
              <div style={{ background: "var(--bg-soft)", border: "1px solid var(--border)", borderRadius: 14, padding: 16 }}>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <div className="text-xs fw-semibold muted">TIMER RUNNING</div>
                    <div className="text-lg fw-bold mt-1">{activeTimerTask?.name || "Untitled task"}</div>
                  </div>
                  <div className="mono text-2xl fw-bold">{formatHMS(activeTimer.kind === "recon" ? liveSecondsRecon(activeTimer.taskId, activeTimer.monthKey) : liveSecondsMig(activeTimerTask || {}))}</div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button className="btn btn-warn btn-sm" onClick={stopActiveTimer}><Icon name="pause" size={13} /> Pause</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => navigate(activeTimer.kind === "recon" ? "categories" : "migration", activeTimer.kind === "recon" ? activeTimer.taskId : undefined)}>
                    Open task
                  </button>
                </div>
              </div>
            ) : nextUpTask ? (
              <div className="flex flex-col gap-2">
                {categoriesNeedingAttention.slice(0, 4).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => navigate("categories")}
                    className="w-full flex items-center justify-between gap-3 text-left"
                    style={{ background: "var(--bg-soft)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px" }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm fw-semibold truncate">{c.name}</div>
                      <div className="text-xs muted mt-1">{c.completed}/{c.total} done{c.inProgress ? ` · ${c.inProgress} in progress` : ""}</div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div style={{ width: 90 }}><ProgressBar percent={c.percent} tone={c.percent > 50 ? "green" : "amber"} /></div>
                      <Icon name="chevron-right" size={16} className="muted" />
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState icon="party-popper" title="Everything's reconciled" desc="Every category is complete for this month. Nice work." />
            )}
          </Card>

          <div className="grid grid-cols-2">
            <Card className="flex items-center gap-4">
              <RingProgress percent={dailyGoalProgress} size={64} tone="var(--green)">
                <span className="mono fw-bold text-sm">{completedToday}/{settings.dailyGoalTasks}</span>
              </RingProgress>
              <div className="min-w-0 flex-1">
                <div className="eyebrow">Daily goal</div>
                <div className="text-sm fw-semibold mt-1">{dailyGoalMet ? "Goal reached — nice work!" : `${settings.dailyGoalTasks - completedToday} task(s) to go`}</div>
                <div className="text-xs muted mt-1">{randomEncouragement()}</div>
              </div>
            </Card>
            <Card>
              <div className="flex items-center justify-between">
                <div className="eyebrow">Daily challenge</div>
                {challengeMet && <Pill tone="green" icon="check">Done</Pill>}
              </div>
              <div className="text-sm fw-semibold mt-2">{challenge.text}</div>
              <div className="text-xs muted mt-1">+25 XP when completed</div>
            </Card>
          </div>

          <div className="grid grid-cols-2">
            <Card>
              <div className="eyebrow mb-2">Needs attention</div>
              {categoriesNeedingAttention.length === 0 ? (
                <div className="text-sm muted">Nothing outstanding.</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {categoriesNeedingAttention.slice(0, 5).map((c) => (
                    <div key={c.id} className="flex items-center justify-between text-sm">
                      <span className="truncate">{c.name}</span>
                      <span className="mono text-xs muted shrink-0">{c.completed}/{c.total}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Card>
              <div className="eyebrow mb-2">Already finished</div>
              {categoriesFinished.length === 0 ? (
                <div className="text-sm muted">None yet this month.</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {categoriesFinished.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 text-sm">
                      <Icon name="circle-check" size={14} style={{ color: "var(--green)" }} />
                      <span className="truncate">{c.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>

        <div className="flex flex-col gap-4 min-w-0">
          <Card>
            <div className="flex items-center gap-3">
              <LevelAvatar level={info.level} tier={tier} size={54} />
              <div className="min-w-0 flex-1">
                <div className="text-base fw-bold font-display truncate">{levelTitle(info.level)}</div>
                <div className="text-xs muted">Level {info.level}</div>
              </div>
            </div>
            <div className="mt-3">
              <div className="flex justify-between text-xs mono muted mb-1">
                <span>{info.xpIntoLevel} XP</span>
                <span>{info.xpForLevel} XP</span>
              </div>
              <ProgressBar percent={xpProgressPercent(game.xp)} />
            </div>
            <button className="btn btn-secondary btn-sm btn-block mt-3" onClick={() => navigate("achievements")}>
              <Icon name="medal" size={14} /> {game.badges.length}/{BADGES.length} badges
            </button>
          </Card>

          <Card>
            <div className="eyebrow mb-3">Recent activity</div>
            {activityLog.length === 0 ? (
              <div className="text-sm muted">Nothing yet — start a timer or reconcile a task.</div>
            ) : (
              <div className="flex flex-col gap-3">
                {activityLog.slice(0, 8).map((a) => (
                  <div key={a.id} className="flex items-start gap-2.5 text-sm">
                    <Icon name={iconForActivity(a.type)} size={14} className="muted shrink-0" style={{ marginTop: 2 }} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{a.message}</div>
                      <div className="text-xs muted">{relativeTime(a.ts)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {activityLog.length > 8 && (
              <button className="btn btn-ghost btn-sm mt-2" onClick={() => navigate("history")}>View all activity</button>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
