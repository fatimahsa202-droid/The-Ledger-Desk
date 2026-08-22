import React, { useMemo } from "react";
import { Card, StatCard, Pill, ProgressBar } from "../primitives.jsx";
import { useAppData } from "../../store/AppDataProvider.jsx";
import { formatHours } from "../../lib/format.js";
import { BarChart } from "../charts.jsx";
import { CategoryTimeDrilldown } from "./CategoryTimeDrilldown.jsx";
import { monthKeyLabel } from "../../lib/monthNav.js";
import {
  buildAccountingSessions, sessionsInRange, sumSeconds, liveElapsedInRange,
  computeOccurrenceKPIs, computeLegacyReconciliationForMonth, computeLegacyOverdueForMonth,
  buildCategoryTimeTree,
} from "../../lib/dashboardSelectors.js";

export function MonthPanel({ selectedCategory, monthKey, currentMonthKey, monthStart, monthEnd, now }) {
  const { monthlyData, occurrences, taskDefinitions, categoryDefs, activeTimer, game } = useAppData();

  const reconciliation = useMemo(
    () => computeLegacyReconciliationForMonth(monthlyData, taskDefinitions, monthKey, selectedCategory),
    [monthlyData, taskDefinitions, monthKey, selectedCategory]
  );
  const legacyOverdue = computeLegacyOverdueForMonth(monthlyData, taskDefinitions, monthKey, currentMonthKey, selectedCategory);

  const recurring = useMemo(
    () => computeOccurrenceKPIs(occurrences, taskDefinitions, now, monthStart, monthEnd, selectedCategory),
    [occurrences, taskDefinitions, now, monthStart, monthEnd, selectedCategory]
  );

  const accSessions = useMemo(() => buildAccountingSessions(monthlyData, occurrences, taskDefinitions), [monthlyData, occurrences, taskDefinitions]);
  const inRange = useMemo(() => sessionsInRange(accSessions, monthStart, monthEnd, selectedCategory), [accSessions, monthStart, monthEnd, selectedCategory]);
  const hours = sumSeconds(inRange) + liveElapsedInRange(activeTimer, now, monthStart, monthEnd);

  const weeksInMonth = Math.ceil(new Date(monthEnd).getDate() / 7);
  const weeklyChartData = useMemo(() => {
    const buckets = new Array(weeksInMonth).fill(0);
    inRange.forEach((s) => {
      const dayOfMonth = new Date(s.start).getDate();
      const idx = Math.min(weeksInMonth - 1, Math.floor((dayOfMonth - 1) / 7));
      buckets[idx] += s.duration;
    });
    return buckets.map((secs, i) => ({ label: `Wk ${i + 1}`, value: Number((secs / 3600).toFixed(1)) }));
  }, [inRange, weeksInMonth]);

  const categoryProgress = useMemo(
    () => (categoryDefs || [])
      .filter((c) => !c.archived)
      .map((c) => ({ ...c, ...computeLegacyReconciliationForMonth(monthlyData, taskDefinitions, monthKey, c.id) }))
      .filter((c) => c.total > 0),
    [categoryDefs, monthlyData, taskDefinitions, monthKey]
  );

  const tree = useMemo(() => buildCategoryTimeTree(accSessions, taskDefinitions, categoryDefs, monthStart, monthEnd, selectedCategory), [accSessions, taskDefinitions, categoryDefs, monthStart, monthEnd, selectedCategory]);

  const isClosed = reconciliation.total > 0 && reconciliation.percent === 100;
  const closedAt = game.monthClosedAt?.[monthKey];

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-lg fw-bold">{monthKeyLabel(monthKey)}</h2>
        {isClosed ? (
          <Pill tone="green" icon="check">Closed{closedAt ? ` ${new Date(closedAt).toLocaleDateString()}` : ""}</Pill>
        ) : (
          <Pill tone="amber" outline>{reconciliation.percent}% to close</Pill>
        )}
      </div>

      <div className="grid grid-cols-2 mb-6">
        <Card>
          <div className="eyebrow mb-2">Reconciliation Progress</div>
          <div className="text-2xl fw-bold mono mb-2">{reconciliation.percent}%</div>
          <ProgressBar percent={reconciliation.percent} tone="green" />
          <div className="text-xs muted mt-2">{reconciliation.completed}/{reconciliation.total} done · {legacyOverdue > 0 && <span style={{ color: "var(--rust)" }}>{legacyOverdue} overdue</span>}</div>
        </Card>
        <Card>
          <div className="eyebrow mb-2">Recurring Work Completion</div>
          <div className="text-2xl fw-bold mono mb-2">{recurring.percent}%</div>
          <ProgressBar percent={recurring.percent} tone="accent" />
          <div className="text-xs muted mt-2">{recurring.completed}/{recurring.total} done{recurring.overdue > 0 && <span style={{ color: "var(--rust)" }}> · {recurring.overdue} overdue</span>}</div>
        </Card>
      </div>

      <div className="grid grid-auto-sm mb-6">
        <StatCard icon="clipboard-list" iconTone="rust" label="Remaining (legacy)" value={reconciliation.total - reconciliation.completed} />
        <StatCard icon="clipboard-list" iconTone="rust" label="Remaining (recurring)" value={recurring.remaining} />
        <StatCard icon="triangle-alert" iconTone="rust" label="Total Overdue" value={legacyOverdue + recurring.overdue} />
        <StatCard icon="clock" iconTone="purple" label="Hours" value={formatHours(hours)} />
      </div>

      <div className="grid grid-cols-2 mb-6">
        <Card>
          <div className="eyebrow mb-3">Category progress</div>
          <div className="flex flex-col gap-2">
            {categoryProgress.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-sm">
                <span className="truncate" style={{ maxWidth: 160 }}>{c.name}</span>
                <span className="flex items-center gap-3">
                  <span style={{ width: 90 }} className="progress-track thin"><span className="progress-fill" style={{ display: "block", width: `${c.percent}%` }} /></span>
                  <span className="mono text-xs muted" style={{ width: 40, textAlign: "right" }}>{c.completed}/{c.total}</span>
                </span>
              </div>
            ))}
            {categoryProgress.length === 0 && <div className="text-sm dim">No legacy tasks in this category selection.</div>}
          </div>
        </Card>
        <Card>
          <div className="eyebrow mb-3">Workload by week</div>
          <BarChart color="var(--amber)" data={weeklyChartData} valueFmt={(v) => v + "h"} />
        </Card>
      </div>

      <div className="eyebrow mb-2">Time by category — {formatHours(hours)} total</div>
      <CategoryTimeDrilldown tree={tree} />
    </div>
  );
}
