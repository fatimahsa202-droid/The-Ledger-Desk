import React, { useState, useMemo } from "react";
import { Icon } from "../lib/Icon.jsx";
import { STATUS_META } from "../data/categories.js";
import { PRIORITY_META } from "../data/taskDefinitions.js";
import { getEntry, formatHours } from "../lib/format.js";
import { isOccurrenceDrivenForMonth, occurrencesForTaskInMonth, computeBoardRollup } from "../lib/occurrenceEngine.js";
import { useAppData } from "../store/AppDataProvider.jsx";

const priorityRank = (id, byId) => PRIORITY_META[byId[id]?.priority || "normal"]?.rank ?? 1;

/** Whether a task counts as fully "done" for the given month, across both the legacy and occurrence-driven models. */
function isTaskDoneForMonth(def, monthKey, monthlyData, occurrences) {
  if (isOccurrenceDrivenForMonth(def, monthKey)) {
    const occs = occurrencesForTaskInMonth(occurrences, def.id, monthKey);
    return occs.length > 0 && occs.every((o) => o.status === "done");
  }
  return getEntry(monthlyData, monthKey, def.id).status === "done";
}

export function CategoryNav({ monthKey, selectedTaskId, onSelect, expandedCats, onToggleCat }) {
  const { monthlyData, occurrences, activeTimer, isTaskFavorite, isTaskPinned, effectiveCategories, taskDefinitions } = useAppData();
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const matches = (name) => !q || name.toLowerCase().includes(q);
  const defById = useMemo(() => Object.fromEntries(taskDefinitions.map((d) => [d.id, d])), [taskDefinitions]);

  return (
    <div className="card" style={{ width: "100%" }}>
      <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
        <div className="relative">
          <Icon name="search" size={14} className="muted" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter tasks..."
            className="input"
            style={{ paddingLeft: 30 }}
            aria-label="Filter tasks"
          />
        </div>
      </div>
      <div style={{ maxHeight: 600, overflowY: "auto" }}>
        {effectiveCategories.map((cat) => {
          const open = expandedCats.has(cat.id) || !!q;
          const visibleTasks = [...cat.tasks]
            .filter((t) => matches(t.name))
            // Priority sort within the category — Critical first, Low last.
            // Preserves original relative order for tasks of equal priority.
            .sort((a, b) => priorityRank(b.id, defById) - priorityRank(a.id, defById));
          if (q && visibleTasks.length === 0) return null;
          const doneCount = cat.tasks.filter((t) => isTaskDoneForMonth(defById[t.id] || t, monthKey, monthlyData, occurrences)).length;
          return (
            <div key={cat.id} style={{ borderBottom: "1px solid var(--border)" }}>
              <button
                onClick={() => onToggleCat(cat.id)}
                className="w-full flex items-center justify-between text-sm fw-semibold text-left"
                style={{ padding: "10px 12px", background: "none", border: "none", color: "var(--ink)" }}
              >
                <span className="flex items-center gap-2 truncate">
                  <Icon name={open ? "chevron-down" : "chevron-right"} size={14} className="muted shrink-0" />
                  <Icon name={cat.icon} size={14} style={{ color: "var(--accent-3)" }} className="shrink-0" />
                  <span className="truncate">{cat.name}</span>
                </span>
                <span className="mono text-xs muted shrink-0">{doneCount}/{cat.tasks.length}</span>
              </button>
              {open && (
                <div>
                  {visibleTasks.map((t) => {
                    const def = defById[t.id];
                    const occDriven = isOccurrenceDrivenForMonth(def, monthKey);
                    let tone, timeSeconds, rightLabel, overdue = 0;
                    if (occDriven) {
                      const rollup = computeBoardRollup(occurrencesForTaskInMonth(occurrences, t.id, monthKey));
                      tone = STATUS_META[rollup.tone].tone;
                      timeSeconds = rollup.timeSeconds;
                      overdue = rollup.overdue;
                      rightLabel = rollup.total > 1 ? `${rollup.done}/${rollup.total}` : (timeSeconds > 0 ? formatHours(timeSeconds) : null);
                    } else {
                      const e = getEntry(monthlyData, monthKey, t.id);
                      tone = STATUS_META[e.status].tone;
                      timeSeconds = e.timeSeconds;
                      rightLabel = timeSeconds > 0 ? formatHours(timeSeconds) : null;
                    }
                    const active = selectedTaskId === t.id;
                    const running = activeTimer && (
                      (activeTimer.kind === "recon" && activeTimer.taskId === t.id && activeTimer.monthKey === monthKey) ||
                      (activeTimer.kind === "occurrence" && occurrences[activeTimer.taskId]?.definitionId === t.id)
                    );
                    const priority = def?.priority || "normal";
                    return (
                      <button
                        key={t.id}
                        onClick={() => onSelect(t.id)}
                        className="w-full flex items-center justify-between gap-2 text-sm text-left"
                        style={{ padding: "8px 12px 8px 30px", background: active ? "var(--panel-hover)" : "none", border: "none", color: "var(--ink)" }}
                      >
                        <span className="flex items-center gap-2 truncate">
                          <span className="dot shrink-0" style={{ background: `var(--${tone})` }} />
                          {(priority === "high" || priority === "critical") && (
                            <Icon
                              name="flag"
                              size={10}
                              style={{ color: priority === "critical" ? "var(--rust)" : "var(--gold)" }}
                              className="shrink-0"
                              data-tip={PRIORITY_META[priority].label + " priority"}
                            />
                          )}
                          <span className="truncate">{t.name}</span>
                          {isTaskPinned(t.id) && <Icon name="pin" size={11} style={{ color: "var(--accent-3)" }} className="shrink-0" />}
                          {isTaskFavorite(t.id) && <Icon name="star" size={11} style={{ color: "var(--gold)" }} className="shrink-0" />}
                          {running && <Icon name="clock" size={12} style={{ color: "var(--amber)" }} className="shrink-0" />}
                          {overdue > 0 && <Icon name="triangle-alert" size={11} style={{ color: "var(--rust)" }} className="shrink-0" data-tip={`${overdue} overdue`} />}
                        </span>
                        {rightLabel && <span className="mono text-xs muted shrink-0">{rightLabel}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
