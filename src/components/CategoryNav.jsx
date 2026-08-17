import React, { useState, useMemo } from "react";
import { Icon } from "../lib/Icon.jsx";
import { CATEGORIES, CATEGORY_ICONS, STATUS_META } from "../data/categories.js";
import { getEntry, formatHours } from "../lib/format.js";
import { useAppData } from "../store/AppDataProvider.jsx";

export function CategoryNav({ monthKey, selectedTaskId, onSelect, expandedCats, onToggleCat }) {
  const { monthlyData, activeTimer, isTaskFavorite, isTaskPinned } = useAppData();
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const matches = (name) => !q || name.toLowerCase().includes(q);

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
        {CATEGORIES.map((cat) => {
          const open = expandedCats.has(cat.id) || !!q;
          const visibleTasks = cat.tasks.filter((t) => matches(t.name));
          if (q && visibleTasks.length === 0) return null;
          const doneCount = cat.tasks.filter((t) => getEntry(monthlyData, monthKey, t.id).status === "done").length;
          return (
            <div key={cat.id} style={{ borderBottom: "1px solid var(--border)" }}>
              <button
                onClick={() => onToggleCat(cat.id)}
                className="w-full flex items-center justify-between text-sm fw-semibold text-left"
                style={{ padding: "10px 12px", background: "none", border: "none", color: "var(--ink)" }}
              >
                <span className="flex items-center gap-2 truncate">
                  <Icon name={open ? "chevron-down" : "chevron-right"} size={14} className="muted shrink-0" />
                  <Icon name={CATEGORY_ICONS[cat.id]} size={14} style={{ color: "var(--accent-3)" }} className="shrink-0" />
                  <span className="truncate">{cat.name}</span>
                </span>
                <span className="mono text-xs muted shrink-0">{doneCount}/{cat.tasks.length}</span>
              </button>
              {open && (
                <div>
                  {visibleTasks.map((t) => {
                    const e = getEntry(monthlyData, monthKey, t.id);
                    const meta = STATUS_META[e.status];
                    const active = selectedTaskId === t.id;
                    const running = activeTimer && activeTimer.kind === "recon" && activeTimer.taskId === t.id && activeTimer.monthKey === monthKey;
                    return (
                      <button
                        key={t.id}
                        onClick={() => onSelect(t.id)}
                        className="w-full flex items-center justify-between gap-2 text-sm text-left"
                        style={{ padding: "8px 12px 8px 30px", background: active ? "var(--panel-hover)" : "none", border: "none", color: "var(--ink)" }}
                      >
                        <span className="flex items-center gap-2 truncate">
                          <span className="dot shrink-0" style={{ background: `var(--${meta.tone})` }} />
                          <span className="truncate">{t.name}</span>
                          {isTaskPinned(t.id) && <Icon name="pin" size={11} style={{ color: "var(--accent-3)" }} className="shrink-0" />}
                          {isTaskFavorite(t.id) && <Icon name="star" size={11} style={{ color: "var(--gold)" }} className="shrink-0" />}
                          {running && <Icon name="clock" size={12} style={{ color: "var(--amber)" }} className="shrink-0" />}
                        </span>
                        {e.timeSeconds > 0 && <span className="mono text-xs muted shrink-0">{formatHours(e.timeSeconds)}</span>}
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
