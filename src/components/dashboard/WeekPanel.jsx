import React, { useMemo } from "react";
import { Card, StatCard } from "../primitives.jsx";
import { useAppData } from "../../store/AppDataProvider.jsx";
import { formatHours } from "../../lib/format.js";
import { BarChart, DonutChart } from "../charts.jsx";
import { CategoryTimeDrilldown } from "./CategoryTimeDrilldown.jsx";
import { WEEKDAY_SHORT, endOfWeekSunday } from "../../lib/weekNav.js";
import {
  buildAccountingSessions, sessionsInRange, sumSeconds, liveElapsedInRange,
  computeOccurrenceKPIs, computeCompletedInRange, buildCategoryTimeTree, workloadByWeekday,
} from "../../lib/dashboardSelectors.js";

const DONUT_COLORS = ["var(--accent-1)", "var(--accent-2)", "var(--accent-3)", "var(--green)", "var(--amber)", "var(--purple)", "var(--rust)", "var(--gold)"];

export function WeekPanel({ selectedCategory, weekStart, now }) {
  const { monthlyData, occurrences, taskDefinitions, categoryDefs, activeTimer } = useAppData();
  const weekEnd = endOfWeekSunday(weekStart);

  const kpis = useMemo(
    () => computeOccurrenceKPIs(occurrences, taskDefinitions, now, weekStart, weekEnd, selectedCategory),
    [occurrences, taskDefinitions, now, weekStart, weekEnd, selectedCategory]
  );
  const completed = computeCompletedInRange(monthlyData, occurrences, taskDefinitions, weekStart, weekEnd, selectedCategory);

  const accSessions = useMemo(() => buildAccountingSessions(monthlyData, occurrences, taskDefinitions), [monthlyData, occurrences, taskDefinitions]);
  const inRange = useMemo(() => sessionsInRange(accSessions, weekStart, weekEnd, selectedCategory), [accSessions, weekStart, weekEnd, selectedCategory]);
  const hours = sumSeconds(inRange) + liveElapsedInRange(activeTimer, now, weekStart, weekEnd);

  const weekdayBuckets = useMemo(() => workloadByWeekday(accSessions, weekStart, selectedCategory), [accSessions, weekStart, selectedCategory]);
  const weekdayChartData = weekdayBuckets.map((secs, i) => ({ label: WEEKDAY_SHORT[i], value: Number((secs / 3600).toFixed(1)) }));

  const tree = useMemo(() => buildCategoryTimeTree(accSessions, taskDefinitions, categoryDefs, weekStart, weekEnd, selectedCategory), [accSessions, taskDefinitions, categoryDefs, weekStart, weekEnd, selectedCategory]);
  const donutSegments = tree.map((c, i) => ({ value: c.seconds, color: DONUT_COLORS[i % DONUT_COLORS.length], label: c.name }));

  return (
    <div>
      <div className="grid grid-auto-sm mb-6">
        <StatCard icon="calendar-days" iconTone="accent" label="Due" value={kpis.total} />
        <StatCard icon="check" iconTone="green" label="Completed" value={completed} />
        <StatCard icon="clipboard-list" iconTone="rust" label="Remaining" value={kpis.remaining} />
        <StatCard icon="triangle-alert" iconTone="rust" label="Overdue" value={kpis.overdue} />
        <StatCard icon="clock" iconTone="purple" label="Hours" value={formatHours(hours)} />
      </div>

      <div className="grid grid-cols-2 mb-6">
        <Card>
          <div className="eyebrow mb-3">Workload by weekday</div>
          <BarChart color="var(--accent-1)" data={weekdayChartData} valueFmt={(v) => v + "h"} />
        </Card>
        <Card>
          <div className="eyebrow mb-3">Category distribution</div>
          {donutSegments.length === 0 ? (
            <div className="text-sm dim">No time tracked this week.</div>
          ) : (
            <div className="flex items-center gap-5">
              <DonutChart segments={donutSegments} />
              <div className="flex flex-col gap-1.5 min-w-0">
                {tree.slice(0, 6).map((c, i) => (
                  <div key={c.categoryId} className="flex items-center gap-2 text-xs">
                    <span className="shrink-0" style={{ width: 8, height: 8, borderRadius: "50%", background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                    <span className="truncate">{c.name}</span>
                    <span className="mono muted shrink-0">{formatHours(c.seconds)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="eyebrow mb-2">Time by category — {formatHours(hours)} total</div>
      <CategoryTimeDrilldown tree={tree} />
    </div>
  );
}
