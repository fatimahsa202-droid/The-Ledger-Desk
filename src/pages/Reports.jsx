import React, { useState, useMemo } from "react";
import { Icon } from "../lib/Icon.jsx";
import { Card, ProgressBar } from "../components/primitives.jsx";
import { useAppData } from "../store/AppDataProvider.jsx";
import { MONTHS, CURRENT_MONTH_KEY, formatHours } from "../lib/format.js";
import { STATUS_META } from "../data/categories.js";
import { computeUnifiedCategoryStatsForMonth, resolveTaskReportRow } from "../lib/dashboardSelectors.js";
import { buildMonthCsv, downloadTextFile } from "../lib/exportCsv.js";

export function Reports() {
  const { monthlyData, monthStats, game, sessionStats, totalDoneAllTime, occurrences, taskDefinitions, categoryDefs, effectiveCategories, activeTimer } = useAppData();
  const [reportMonth, setReportMonth] = useState(CURRENT_MONTH_KEY);

  const month = MONTHS.find((m) => m.key === reportMonth);
  const stats = monthStats[reportMonth];
  const categoryStats = useMemo(
    () => computeUnifiedCategoryStatsForMonth(monthlyData, occurrences, taskDefinitions, categoryDefs, reportMonth, CURRENT_MONTH_KEY, activeTimer, Date.now()),
    [monthlyData, occurrences, taskDefinitions, categoryDefs, reportMonth, activeTimer]
  );

  const exportCsv = () => {
    const csv = buildMonthCsv(monthlyData, occurrences, effectiveCategories, taskDefinitions, reportMonth, month.full);
    downloadTextFile(`ledger-desk-${reportMonth}.csv`, csv);
  };

  const printReport = () => window.print();

  return (
    <div>
      <div className="page-header no-print">
        <div>
          <div className="eyebrow">Insights</div>
          <h1 className="page-title mt-1">Reports</h1>
          <p className="page-sub">A clean, printable month-end summary — plus data exports.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <select value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} className="select mono" style={{ width: "auto" }}>
            {MONTHS.map((m) => <option key={m.key} value={m.key}>{m.full} {m.year}</option>)}
          </select>
          <button className="btn btn-secondary" onClick={exportCsv}><Icon name="file-down" size={14} /> Export CSV</button>
          <button className="btn btn-primary" onClick={printReport}><Icon name="printer" size={14} /> Print / Save PDF</button>
        </div>
      </div>

      <div id="report-root">
        <Card className="mb-6">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <div>
              <div className="eyebrow">Monthly Summary</div>
              <div className="text-2xl fw-bold font-display mt-1">{month.full} {month.year}</div>
            </div>
            <div className="text-3xl fw-bold mono">{stats.percent}%</div>
          </div>
          <ProgressBar percent={stats.percent} tone="green" className="mb-4" />
          <div className="grid grid-cols-3">
            <ReportStat label="Tasks completed" value={`${stats.completed}/${stats.total}`} />
            <ReportStat label="Hours logged" value={formatHours(stats.seconds)} />
            <ReportStat label="Categories at 100%" value={`${categoryStats.filter((c) => c.percent === 100).length}/${categoryStats.length}`} />
          </div>
        </Card>

        <Card pad={false} className="mb-6">
          <div className="eyebrow" style={{ padding: 16, borderBottom: "1px solid var(--border)" }}>Category Report</div>
          {categoryStats.map((c) => (
            <div key={c.id} className="flex items-center justify-between text-sm" style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
              <span className="truncate">{c.name}</span>
              <span className="flex items-center gap-4">
                <span className="mono text-xs muted">{c.completed}/{c.total}</span>
                <span className="mono text-xs muted" style={{ width: 60, textAlign: "right" }}>{formatHours(c.seconds)}</span>
              </span>
            </div>
          ))}
        </Card>

        <Card pad={false} className="mb-6">
          <div className="eyebrow" style={{ padding: 16, borderBottom: "1px solid var(--border)" }}>Task History — {month.full}</div>
          {effectiveCategories.map((cat) => (
            <div key={cat.id}>
              <div className="text-xs fw-bold" style={{ padding: "8px 16px", background: "var(--bg-soft)" }}>{cat.name}</div>
              {cat.tasks.map((t) => {
                const def = taskDefinitions.find((d) => d.id === t.id);
                const row = def ? resolveTaskReportRow(monthlyData, occurrences, def, reportMonth) : null;
                if (!row) return null;
                const meta = STATUS_META[row.status];
                return (
                  <div key={t.id} className="flex items-center justify-between text-sm" style={{ padding: "8px 16px", borderBottom: "1px solid var(--border)" }}>
                    <span className="truncate">{t.name}</span>
                    <span className="flex items-center gap-3 shrink-0">
                      <span className="pill" style={{ background: `var(--${meta.tone}-bg)`, color: `var(--${meta.tone})` }}>{meta.label}</span>
                      <span className="mono text-xs muted" style={{ width: 56, textAlign: "right" }}>{formatHours(row.seconds)}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </Card>

        <Card className="mb-6 no-print">
          <div className="eyebrow mb-3">Productivity Report — all time</div>
          <div className="grid grid-cols-3">
            <ReportStat label="Tasks reconciled" value={totalDoneAllTime} />
            <ReportStat label="Total sessions" value={sessionStats.count} />
            <ReportStat label="Current level / XP" value={`${game.badges.length} badges · ${game.xp} XP`} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function ReportStat({ label, value }) {
  return (
    <div>
      <div className="text-lg fw-bold mono">{value}</div>
      <div className="text-xs muted mt-1">{label}</div>
    </div>
  );
}
