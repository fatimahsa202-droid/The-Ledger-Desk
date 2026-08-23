import React, { useMemo } from "react";
import { Pill } from "../primitives.jsx";
import { formatHours } from "../../lib/format.js";

/** Mobile alternative to MonthGrid — one row per day, same tap-to-open-detail behavior. Shown only under the calendar-agenda-view breakpoint (see styles.css). */
export function AgendaList({ year, monthIndex, occByDay, workByDay, todayKey, sourceFilter, onSelectDay, dayKeyOf }) {
  const showTasks = sourceFilter !== "work";
  const showWork = sourceFilter !== "tasks";

  const days = useMemo(() => {
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, i) => new Date(year, monthIndex, i + 1));
  }, [year, monthIndex]);

  return (
    <div className="calendar-agenda-view flex flex-col gap-2">
      {days.map((d) => {
        const k = dayKeyOf(d.getTime());
        const occs = occByDay[k] || [];
        const seconds = workByDay[k] || 0;
        const isToday = k === todayKey;
        if (occs.length === 0 && seconds === 0) {
          return (
            <button key={k} onClick={() => onSelectDay(k)} aria-label={`Open ${k}`} className="flex items-center justify-between text-sm" style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: isToday ? "var(--bg-soft)" : "transparent", opacity: 0.6, textAlign: "left" }}>
              <span className="flex items-center gap-2">
                <span className="mono muted" style={{ width: 26 }}>{d.getDate()}</span>
                <span className="text-xs muted">{d.toLocaleDateString(undefined, { weekday: "short" })}</span>
              </span>
              <span className="text-xs dim">Nothing scheduled</span>
            </button>
          );
        }
        const overdueCount = occs.filter((o) => o.displayStatus === "overdue").length;
        return (
          <button key={k} onClick={() => onSelectDay(k)} aria-label={`Open ${k}`} className="flex items-center justify-between text-sm" style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: isToday ? "var(--bg-soft)" : "transparent", textAlign: "left" }}>
            <span className="flex items-center gap-2">
              <span className="mono fw-semibold" style={{ width: 26 }}>{d.getDate()}</span>
              <span className="text-xs muted">{d.toLocaleDateString(undefined, { weekday: "short" })}</span>
            </span>
            <span className="flex items-center gap-2 shrink-0">
              {showTasks && occs.length > 0 && <Pill tone={overdueCount > 0 ? "rust" : "accent"} outline>{occs.length} due{overdueCount > 0 ? ` · ${overdueCount} overdue` : ""}</Pill>}
              {showWork && seconds > 0 && <span className="mono text-xs muted">{formatHours(seconds)}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
