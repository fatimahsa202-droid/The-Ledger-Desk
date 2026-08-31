import React, { useMemo } from "react";
import { Card, StatCard } from "../primitives.jsx";
import { useAppData } from "../../store/AppDataProvider.jsx";
import { formatHours } from "../../lib/format.js";
import { BarChart } from "../charts.jsx";
import { CategoryTimeDrilldown } from "./CategoryTimeDrilldown.jsx";
import {
  buildAccountingSessions, sessionsInRange, sumSeconds, liveElapsedInRange,
  computeOccurrenceKPIs, computeLegacyReconciliationForMonth, computeLegacyOverdueForMonth,
  buildCategoryTimeTree,
} from "../../lib/dashboardSelectors.js";
import { monthKeyFor } from "../../lib/monthNav.js";

const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function YearPanel({ selectedCategory, year, currentMonthKey, now }) {
  const { monthlyData, occurrences, taskDefinitions, categoryDefs, activeTimer } = useAppData();

  const monthStats = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const monthKey = monthKeyFor(year, i);
      const monthStart = new Date(year, i, 1).getTime();
      const monthEnd = new Date(year, i + 1, 0, 23, 59, 59, 999).getTime();
      const recon = computeLegacyReconciliationForMonth(monthlyData, taskDefinitions, monthKey, selectedCategory);
      const legacyOverdue = computeLegacyOverdueForMonth(monthlyData, taskDefinitions, monthKey, currentMonthKey, selectedCategory);
      const recurring = computeOccurrenceKPIs(occurrences, taskDefinitions, monthlyData, now, monthStart, monthEnd, selectedCategory);
      return { monthKey, monthIndex: i, recon, legacyOverdue, recurring, monthStart, monthEnd };
    });
  }, [year, monthlyData, taskDefinitions, occurrences, selectedCategory, currentMonthKey, now]);

  const yearStart = new Date(year, 0, 1).getTime();
  const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999).getTime();

  const accSessions = useMemo(() => buildAccountingSessions(monthlyData, occurrences, taskDefinitions), [monthlyData, occurrences, taskDefinitions]);
  const inRange = useMemo(() => sessionsInRange(accSessions, yearStart, yearEnd, selectedCategory), [accSessions, yearStart, yearEnd, selectedCategory]);
  const hours = sumSeconds(inRange) + liveElapsedInRange(activeTimer, now, yearStart, yearEnd);

  const totalLegacyCompleted = monthStats.reduce((s, m) => s + m.recon.completed, 0);
  const totalLegacyTotal = monthStats.reduce((s, m) => s + m.recon.total, 0);
  const totalRecurringCompleted = monthStats.reduce((s, m) => s + m.recurring.completed, 0);
  const totalRecurringTotal = monthStats.reduce((s, m) => s + m.recurring.total, 0);
  const totalOverdue = monthStats.reduce((s, m) => s + m.legacyOverdue + m.recurring.overdue, 0);
  const closedMonths = monthStats.filter((m) => m.recon.total > 0 && m.recon.percent === 100);

  const closedWithSeconds = closedMonths.map((m) => ({ ...m, seconds: sumSeconds(sessionsInRange(inRange, m.monthStart, m.monthEnd, selectedCategory)) }));
  const best = closedWithSeconds.length ? closedWithSeconds.reduce((a, b) => (b.seconds < a.seconds ? b : a)) : null;
  const worst = closedWithSeconds.length ? closedWithSeconds.reduce((a, b) => (b.seconds > a.seconds ? b : a)) : null;

  const completionChartData = monthStats.map((m) => ({ label: MONTH_SHORT[m.monthIndex], value: m.recon.total > 0 ? m.recon.percent : 0, faded: m.monthKey > currentMonthKey }));
  const overdueChartData = monthStats.map((m) => ({ label: MONTH_SHORT[m.monthIndex], value: m.legacyOverdue + m.recurring.overdue, faded: m.monthKey > currentMonthKey }));

  const tree = useMemo(() => buildCategoryTimeTree(accSessions, taskDefinitions, categoryDefs, yearStart, yearEnd, selectedCategory), [accSessions, taskDefinitions, categoryDefs, yearStart, yearEnd, selectedCategory]);

  return (
    <div>
      <div className="grid grid-auto-sm mb-6">
        <StatCard icon="gauge" iconTone="accent" label="Reconciliation" value={totalLegacyTotal ? `${Math.round((totalLegacyCompleted / totalLegacyTotal) * 100)}%` : "—"} sub={`${totalLegacyCompleted}/${totalLegacyTotal}`} />
        <StatCard icon="refresh-cw" iconTone="accent" label="Recurring Work" value={totalRecurringTotal ? `${Math.round((totalRecurringCompleted / totalRecurringTotal) * 100)}%` : "—"} sub={`${totalRecurringCompleted}/${totalRecurringTotal}`} />
        <StatCard icon="triangle-alert" iconTone="rust" label="Overdue (year)" value={totalOverdue} />
        <StatCard icon="clock" iconTone="purple" label="Total hours" value={formatHours(hours)} />
        <StatCard icon="calendar-check" iconTone="green" label="Months closed" value={`${closedMonths.length}/12`} />
      </div>

      <div className="grid grid-cols-2 mb-6">
        <Card>
          <div className="eyebrow mb-3">Reconciliation completion by month</div>
          <BarChart color="var(--green)" data={completionChartData} valueFmt={(v) => v + "%"} />
        </Card>
        <Card>
          <div className="eyebrow mb-3">Overdue trend by month</div>
          <BarChart color="var(--rust)" data={overdueChartData} />
        </Card>
      </div>

      {closedMonths.length > 0 && (
        <div className="grid grid-cols-2 mb-6">
          <Card>
            <div className="eyebrow mb-2">Best month (fastest close)</div>
            <div className="text-sm">{best ? `${MONTH_SHORT[best.monthIndex]} ${year} — closed in ${formatHours(best.seconds)}` : "—"}</div>
          </Card>
          <Card>
            <div className="eyebrow mb-2">Slowest month</div>
            <div className="text-sm">{worst ? `${MONTH_SHORT[worst.monthIndex]} ${year} — closed in ${formatHours(worst.seconds)}` : "—"}</div>
          </Card>
        </div>
      )}

      <div className="eyebrow mb-2">Time by category — {formatHours(hours)} total</div>
      <CategoryTimeDrilldown tree={tree} />
    </div>
  );
}
