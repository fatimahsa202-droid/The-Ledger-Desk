import React, { useMemo } from "react";
import { Card, StatCard, RingProgress } from "../components/primitives.jsx";
import { LineChart, BarChart, DonutChart } from "../components/charts.jsx";
import { useAppData } from "../store/AppDataProvider.jsx";
import { MONTHS, CURRENT_MONTH_KEY, formatHours, formatDuration } from "../lib/format.js";
import { computeUnifiedCategoryStatsForMonth } from "../lib/dashboardSelectors.js";
import { CATEGORY_ICONS } from "../data/categories.js";
import { Icon } from "../lib/Icon.jsx";

const SEGMENT_COLORS = ["#3b82f6", "#60a5fa", "#2fd07f", "#f0b73f", "#a78bfa", "#fb6f7f", "#22d3ee", "#f472b6", "#facc15", "#4ade80", "#818cf8", "#fb923c", "#38bdf8"];

export function Analytics() {
  const {
    monthlyData, monthStats, sessions, sessionStats, totals, bestMonth, worstMonth, game, completedToday, settings,
    taskDefinitions, categoryDefs, occurrences, activeTimer,
  } = useAppData();
  const taskDefById = useMemo(() => Object.fromEntries(taskDefinitions.map((d) => [d.id, d])), [taskDefinitions]);

  const thisMonth = monthStats[CURRENT_MONTH_KEY];
  const prevMonthKey = MONTHS[MONTHS.length - 2]?.key;
  const prevMonth = prevMonthKey ? monthStats[prevMonthKey] : null;
  const percentDelta = prevMonth ? thisMonth.percent - prevMonth.percent : null;
  const hoursDelta = prevMonth ? Number(((thisMonth.seconds - prevMonth.seconds) / 3600).toFixed(1)) : null;

  const closedMonths = MONTHS.filter((m) => monthStats[m.key].percent === 100);
  const avgCloseDuration = closedMonths.length ? closedMonths.reduce((s, m) => s + monthStats[m.key].seconds, 0) / closedMonths.length : 0;

  const categoryStats = useMemo(
    () => computeUnifiedCategoryStatsForMonth(monthlyData, occurrences, taskDefinitions, categoryDefs, CURRENT_MONTH_KEY, CURRENT_MONTH_KEY, activeTimer, Date.now()),
    [monthlyData, occurrences, taskDefinitions, categoryDefs, activeTimer]
  );
  const donutSegments = categoryStats.filter((c) => c.seconds > 0).map((c, i) => ({ value: c.seconds, color: SEGMENT_COLORS[i % SEGMENT_COLORS.length], label: c.name }));

  const topTasksByTime = useMemo(
    () => Object.values(totals).filter((t) => t.seconds > 0).sort((a, b) => b.seconds - a.seconds).slice(0, 8),
    [totals]
  );

  const focusScore = sessions.length ? Math.round((sessions.filter((s) => s.duration >= 1500).length / sessions.length) * 100) : 0;
  const consistencyScore = Math.min(100, Math.round((game.streak / 30) * 100));
  const productivityScore = Math.min(100, Math.round((completedToday / Math.max(1, settings.dailyGoalTasks)) * 50 + thisMonth.percent * 0.5));
  const completionRate = thisMonth.percent;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Insights</div>
          <h1 className="page-title mt-1">Analytics</h1>
          <p className="page-sub">Understand — and improve — how your monthly close actually runs.</p>
        </div>
      </div>

      <div className="grid grid-auto-sm mb-6">
        <ScoreTile label="Productivity" value={productivityScore} tone="var(--accent-1)" hint="Daily goal progress + month completion" />
        <ScoreTile label="Consistency" value={consistencyScore} tone="var(--amber)" hint={`Current streak vs. a 30-day benchmark`} />
        <ScoreTile label="Focus" value={focusScore} tone="var(--purple)" hint="Share of sessions 25+ minutes" />
        <ScoreTile label="Completion rate" value={completionRate} tone="var(--green)" hint={`This month: ${thisMonth.completed}/${thisMonth.total}`} />
      </div>

      <div className="grid grid-auto-sm mb-6">
        <StatCard icon="gauge" iconTone="accent" label="Month close %" value={`${thisMonth.percent}%`} />
        <StatCard icon="clock" iconTone="amber" label="Hours spent closing" value={formatHours(thisMonth.seconds)} />
        <StatCard
          icon={percentDelta == null ? "minus" : percentDelta >= 0 ? "trending-up" : "trending-down"}
          iconTone={percentDelta >= 0 ? "green" : "rust"}
          label="Vs. previous month"
          value={percentDelta == null ? "—" : `${percentDelta >= 0 ? "+" : ""}${percentDelta}%`}
          sub={hoursDelta != null ? `${hoursDelta >= 0 ? "+" : ""}${hoursDelta}h` : undefined}
        />
        <StatCard icon="hourglass" iconTone="purple" label="Avg. month-close duration" value={avgCloseDuration ? formatDuration(avgCloseDuration) : "—"} />
        <StatCard icon="trophy" iconTone="gold" label="Personal best month" value={bestMonth ? bestMonth.label + " " + bestMonth.year : "—"} sub={bestMonth ? formatHours(bestMonth.seconds) : undefined} />
        <StatCard icon="hourglass" iconTone="rust" label="Slowest month" value={worstMonth ? worstMonth.label + " " + worstMonth.year : "—"} sub={worstMonth ? formatHours(worstMonth.seconds) : undefined} />
      </div>

      <div className="grid grid-cols-2 mb-6">
        <Card>
          <div className="eyebrow mb-3">Completion % — trend over months</div>
          <LineChart color="var(--accent-1)" points={MONTHS.map((m) => ({ y: monthStats[m.key].percent }))} />
        </Card>
        <Card>
          <div className="eyebrow mb-3">Hours logged — trend over months</div>
          <LineChart color="var(--amber)" points={MONTHS.map((m) => ({ y: Number((monthStats[m.key].seconds / 3600).toFixed(2)) }))} />
        </Card>
      </div>

      <div className="grid split-10-13">
        <Card>
          <div className="eyebrow mb-3">Time per category — this month</div>
          <div className="flex items-center gap-5 flex-wrap">
            <DonutChart segments={donutSegments.length ? donutSegments : [{ value: 1, color: "var(--muted-soft)" }]} size={140} thickness={20} />
            <div className="flex flex-col gap-2 flex-1 min-w-0">
              {categoryStats.filter((c) => c.seconds > 0).sort((a, b) => b.seconds - a.seconds).slice(0, 6).map((c, i) => (
                <div key={c.id} className="flex items-center gap-2 text-xs">
                  <span className="dot shrink-0" style={{ background: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }} />
                  <span className="truncate flex-1">{c.name}</span>
                  <span className="mono muted shrink-0">{formatHours(c.seconds)}</span>
                </div>
              ))}
              {donutSegments.length === 0 && <div className="text-xs muted">No time logged this month yet.</div>}
            </div>
          </div>
        </Card>

        <Card pad={false}>
          <div className="eyebrow" style={{ padding: 16, paddingBottom: 10 }}>Time per task — all-time top 8</div>
          <div>
            {topTasksByTime.length === 0 && <div className="text-sm muted" style={{ padding: "0 16px 16px" }}>No tracked time yet.</div>}
            {topTasksByTime.map((t) => {
              const task = taskDefById[t.taskId];
              return (
                <div key={t.taskId} className="flex items-center justify-between text-sm" style={{ padding: "9px 16px", borderTop: "1px solid var(--border)" }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon name={CATEGORY_ICONS[task?.categoryId] || "clipboard-list"} size={14} className="muted shrink-0" />
                    <span className="truncate">{task?.name || t.taskId}</span>
                  </div>
                  <span className="mono text-xs muted shrink-0">{formatDuration(t.seconds)}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

function ScoreTile({ label, value, tone, hint }) {
  return (
    <Card hover className="flex items-center gap-4">
      <RingProgress percent={value} size={60} tone={tone}>
        <span className="mono fw-bold text-sm">{value}</span>
      </RingProgress>
      <div className="min-w-0 flex-1">
        <div className="text-sm fw-semibold">{label} Score</div>
        <div className="text-xs muted mt-1">{hint}</div>
      </div>
    </Card>
  );
}
