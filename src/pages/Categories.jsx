import React, { useState, useEffect, useMemo } from "react";
import { Icon } from "../lib/Icon.jsx";
import { Card } from "../components/primitives.jsx";
import { CategoryNav } from "../components/CategoryNav.jsx";
import { TaskDetailPanel } from "../components/TaskDetailPanel.jsx";
import { ManageTasks } from "../components/ManageTasks.jsx";
import { BarChart } from "../components/charts.jsx";
import { CATEGORIES, ALL_TASKS } from "../data/categories.js";
import { MONTHS, CURRENT_MONTH_KEY, formatHours, getEntry } from "../lib/format.js";
import { useAppData } from "../store/AppDataProvider.jsx";
import { computeUnifiedCategoryStatsForMonth, computeUnifiedMonthStats } from "../lib/dashboardSelectors.js";
import { shiftMonthKey, monthKeyLabel, monthKeyPeriodType } from "../lib/monthNav.js";

export function Categories({ initialTaskId }) {
  const { monthlyData, monthStats, activeTimer, effectiveCategories, occurrences, taskDefinitions, categoryDefs } = useAppData();
  const [subTab, setSubTab] = useState("board");

  // Sourced from the editable definitions layer (not the frozen constant) so
  // a rename/re-category shows up immediately here — including for
  // custom/graduated tasks the static ALL_TASKS/TASK_BY_ID never contained —
  // the same lookup effectiveCategories already builds for the nav (see
  // CategoryNav.jsx). Computed before any state that needs it below.
  const effectiveTaskById = useMemo(
    () => Object.fromEntries(effectiveCategories.flatMap((c) => c.tasks).map((t) => [t.id, t])),
    [effectiveCategories]
  );

  // Task Board period — independent of the shared, year-to-date MONTHS list
  // used everywhere else (Monthly Progress below, Dashboard, Analytics,
  // Reports, gamification). Free navigation, no past/future limit — see
  // src/lib/monthNav.js.
  const [selectedMonth, setSelectedMonth] = useState(CURRENT_MONTH_KEY);
  const [progressMonth, setProgressMonth] = useState(CURRENT_MONTH_KEY);
  const [expandedCats, setExpandedCats] = useState(() => new Set([effectiveTaskById[initialTaskId]?.categoryId || CATEGORIES[0].id]));
  const [selectedTaskId, setSelectedTaskId] = useState(initialTaskId || ALL_TASKS[0].id);

  useEffect(() => {
    if (initialTaskId && effectiveTaskById[initialTaskId]) {
      setSelectedTaskId(initialTaskId);
      setExpandedCats((prev) => new Set(prev).add(effectiveTaskById[initialTaskId].categoryId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTaskId, effectiveTaskById]);

  const toggleCat = (id) =>
    setExpandedCats((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const selectedTask = effectiveTaskById[selectedTaskId];
  const categoryStatsForMonth = computeUnifiedCategoryStatsForMonth(monthlyData, occurrences, taskDefinitions, categoryDefs, progressMonth, CURRENT_MONTH_KEY, activeTimer, Date.now());

  const selectedMonthStats = useMemo(
    () => computeUnifiedMonthStats(monthlyData, occurrences, taskDefinitions, selectedMonth, CURRENT_MONTH_KEY, activeTimer, Date.now(), null),
    [monthlyData, occurrences, taskDefinitions, selectedMonth, activeTimer]
  );
  const selectedPeriodType = monthKeyPeriodType(selectedMonth, CURRENT_MONTH_KEY);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Workspace</div>
          <h1 className="page-title mt-1">Reconciliation Categories</h1>
          <p className="page-sub">The full monthly close checklist — unchanged categories, tasks, and workflow.</p>
        </div>
      </div>

      <div className="tabs mb-5">
        <button className={`tab-btn ${subTab === "board" ? "active" : ""}`} onClick={() => setSubTab("board")}>Task Board</button>
        <button className={`tab-btn ${subTab === "progress" ? "active" : ""}`} onClick={() => setSubTab("progress")}>Monthly Progress</button>
        <button className={`tab-btn ${subTab === "manage" ? "active" : ""}`} onClick={() => setSubTab("manage")}>Manage</button>
      </div>

      {subTab === "board" && (
        <div>
          <div className="flex items-center gap-3 flex-wrap mb-5">
            <div className="flex items-center gap-2" style={{ background: "var(--bg-soft)", border: "1px solid var(--border)", borderRadius: 10, padding: "6px 8px" }}>
              <button className="btn btn-ghost btn-icon" aria-label="Previous month" onClick={() => setSelectedMonth((m) => shiftMonthKey(m, -1))}>
                <Icon name="chevron-left" size={16} />
              </button>
              <span className="text-sm fw-semibold mono" style={{ minWidth: 150, textAlign: "center" }}>{monthKeyLabel(selectedMonth)}</span>
              <button className="btn btn-ghost btn-icon" aria-label="Next month" onClick={() => setSelectedMonth((m) => shiftMonthKey(m, 1))}>
                <Icon name="chevron-right" size={16} />
              </button>
            </div>
            {selectedMonth !== CURRENT_MONTH_KEY && (
              <button className="btn btn-secondary btn-sm" onClick={() => setSelectedMonth(CURRENT_MONTH_KEY)}>Current Period</button>
            )}
            {selectedPeriodType === "past" && <span className="pill pill-outline">Historical</span>}
            {selectedPeriodType === "future" && <span className="pill pill-outline">Upcoming — scheduled workload</span>}
          </div>

          <div className="flex gap-3 flex-wrap mb-5">
            <div className="pill pill-outline">Completed: <span className="mono fw-bold" style={{ marginLeft: 4 }}>{selectedMonthStats.completed}/{selectedMonthStats.total}</span></div>
            <div className="pill pill-outline">Time logged: <span className="mono fw-bold" style={{ marginLeft: 4 }}>{formatHours(selectedMonthStats.seconds)}</span></div>
          </div>

          <div className="board-layout">
            <div className="board-layout-nav">
              <CategoryNav monthKey={selectedMonth} selectedTaskId={selectedTaskId} onSelect={setSelectedTaskId} expandedCats={expandedCats} onToggleCat={toggleCat} />
            </div>
            {selectedTask && <TaskDetailPanel task={selectedTask} monthKey={selectedMonth} />}
          </div>
        </div>
      )}

      {subTab === "progress" && (
        <div>
          <div className="grid grid-auto-sm mb-6">
            {MONTHS.map((m) => {
              const s = monthStats[m.key];
              return (
                <Card key={m.key} hover>
                  <div className="text-xs fw-semibold mono muted mb-1">{m.label} {m.year}</div>
                  <div className="text-xl fw-bold mono mb-2">{s.percent}%</div>
                  <div className="progress-track thin mb-2"><div className="progress-fill green" style={{ width: `${s.percent}%` }} /></div>
                  <div className="text-xs muted">{s.completed}/{s.total} done · {formatHours(s.seconds)}</div>
                </Card>
              );
            })}
          </div>

          <div className="grid grid-cols-2 mb-6">
            <Card>
              <div className="eyebrow mb-3">Completion % by month</div>
              <BarChart color="var(--green)" data={MONTHS.map((m) => ({ label: m.label, value: monthStats[m.key].percent, faded: m.key !== progressMonth }))} valueFmt={(v) => v + "%"} />
            </Card>
            <Card>
              <div className="eyebrow mb-3">Hours logged by month</div>
              <BarChart color="var(--amber)" data={MONTHS.map((m) => ({ label: m.label, value: Number((monthStats[m.key].seconds / 3600).toFixed(1)), faded: m.key !== progressMonth }))} valueFmt={(v) => v + "h"} />
            </Card>
          </div>

          <Card pad={false}>
            <div className="flex items-center justify-between flex-wrap gap-2" style={{ padding: 16, borderBottom: "1px solid var(--border)" }}>
              <div className="eyebrow">Category breakdown</div>
              <select value={progressMonth} onChange={(e) => setProgressMonth(e.target.value)} className="select mono" style={{ width: "auto" }}>
                {MONTHS.map((m) => <option key={m.key} value={m.key}>{m.full} {m.year}</option>)}
              </select>
            </div>
            <div>
              {categoryStatsForMonth.map((c) => (
                <div key={c.id} className="flex items-center justify-between text-sm" style={{ padding: "11px 16px", borderBottom: "1px solid var(--border)" }}>
                  <span className="truncate" style={{ maxWidth: 220 }}>{c.name}</span>
                  <span className="flex items-center gap-4">
                    <span style={{ width: 110 }} className="progress-track thin"><span className="progress-fill" style={{ display: "block", width: `${c.percent}%` }} /></span>
                    <span className="mono text-xs muted" style={{ width: 50, textAlign: "right" }}>{c.completed}/{c.total}</span>
                    <span className="mono text-xs muted" style={{ width: 56, textAlign: "right" }}>{formatHours(c.seconds)}</span>
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {subTab === "manage" && <ManageTasks />}
    </div>
  );
}
