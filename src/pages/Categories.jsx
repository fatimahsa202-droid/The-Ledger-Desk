import React, { useState, useEffect, useMemo } from "react";
import { Icon } from "../lib/Icon.jsx";
import { Card } from "../components/primitives.jsx";
import { CategoryNav } from "../components/CategoryNav.jsx";
import { TaskDetailPanel } from "../components/TaskDetailPanel.jsx";
import { ManageTasks } from "../components/ManageTasks.jsx";
import { BarChart } from "../components/charts.jsx";
import { CATEGORIES, ALL_TASKS, TASK_BY_ID } from "../data/categories.js";
import { MONTHS, CURRENT_MONTH_KEY, formatHours, getEntry } from "../lib/format.js";
import { useAppData } from "../store/AppDataProvider.jsx";
import { computeCategoryStatsForMonth } from "../lib/selectors.js";

export function Categories({ initialTaskId }) {
  const { monthlyData, monthStats, effectiveCategories } = useAppData();
  const [subTab, setSubTab] = useState("board");
  const [selectedMonth, setSelectedMonth] = useState(CURRENT_MONTH_KEY);
  const [progressMonth, setProgressMonth] = useState(CURRENT_MONTH_KEY);
  const [expandedCats, setExpandedCats] = useState(() => new Set([TASK_BY_ID[initialTaskId]?.categoryId || CATEGORIES[0].id]));
  const [selectedTaskId, setSelectedTaskId] = useState(initialTaskId || ALL_TASKS[0].id);

  useEffect(() => {
    if (initialTaskId && TASK_BY_ID[initialTaskId]) {
      setSelectedTaskId(initialTaskId);
      setExpandedCats((prev) => new Set(prev).add(TASK_BY_ID[initialTaskId].categoryId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTaskId]);

  const toggleCat = (id) =>
    setExpandedCats((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Sourced from the editable definitions layer (not the frozen constant)
  // so a rename/re-category shows up immediately here — the same lookup
  // effectiveCategories already builds for the nav (see CategoryNav.jsx).
  const effectiveTaskById = useMemo(
    () => Object.fromEntries(effectiveCategories.flatMap((c) => c.tasks).map((t) => [t.id, t])),
    [effectiveCategories]
  );
  const selectedTask = effectiveTaskById[selectedTaskId];
  const categoryStatsForMonth = computeCategoryStatsForMonth(monthlyData, progressMonth);

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
          <div className="flex gap-2 flex-wrap mb-5">
            {MONTHS.map((m) => (
              <button
                key={m.key}
                onClick={() => setSelectedMonth(m.key)}
                className="tag-chip mono"
                style={selectedMonth === m.key ? { background: "linear-gradient(120deg,var(--accent-1),var(--accent-2))", color: "#fff", borderColor: "transparent" } : undefined}
              >
                {m.label} '{String(m.year).slice(2)}
              </button>
            ))}
          </div>

          <div className="flex gap-3 flex-wrap mb-5">
            <div className="pill pill-outline">Completed this month: <span className="mono fw-bold" style={{ marginLeft: 4 }}>{monthStats[selectedMonth].completed}/{monthStats[selectedMonth].total}</span></div>
            <div className="pill pill-outline">Time logged: <span className="mono fw-bold" style={{ marginLeft: 4 }}>{formatHours(monthStats[selectedMonth].seconds)}</span></div>
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
