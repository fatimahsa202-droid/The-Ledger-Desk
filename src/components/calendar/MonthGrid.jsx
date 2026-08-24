import React, { useMemo } from "react";
import { Icon } from "../../lib/Icon.jsx";
import { formatHours } from "../../lib/format.js";

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const STATUS_COLOR = { overdue: "var(--rust)", "in-progress": "var(--amber)", pending: "var(--muted)", done: "var(--green)" };
const STATUS_RANK = { overdue: 0, "in-progress": 1, pending: 2, done: 3 };
const MAX_DOTS = 4;

function DayCell({ date, dayKeyStr, occs, names, workSeconds, isToday, showTasks, showNames, showWork, onSelect }) {
  if (!date) return <div />;
  const dots = [...occs].sort((a, b) => STATUS_RANK[a.displayStatus] - STATUS_RANK[b.displayStatus]).slice(0, MAX_DOTS);
  const overflow = occs.length - dots.length;
  const namesOverdue = names.filter((n) => n.displayStatus === "overdue").length;
  return (
    <button
      onClick={() => onSelect(dayKeyStr)}
      aria-label={`Open ${dayKeyStr}`}
      className="flex flex-col items-start"
      style={{
        minHeight: 78, borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-soft)",
        outline: isToday ? "2px solid var(--amber)" : "none", outlineOffset: -2,
        padding: "6px 7px", textAlign: "left", gap: 4,
      }}
    >
      <span className="text-xs fw-semibold">{date.getDate()}</span>
      {showTasks && occs.length > 0 && (
        <span className="flex items-center gap-1 flex-wrap">
          {dots.map((o) => (
            <span key={o.id} style={{ width: 6, height: 6, borderRadius: "50%", background: STATUS_COLOR[o.displayStatus] }} title={o.name} />
          ))}
          {overflow > 0 && <span className="mono" style={{ fontSize: 9, opacity: 0.75 }}>+{overflow}</span>}
        </span>
      )}
      {showNames && names.length > 0 && (
        <span className="flex items-center gap-1" style={{ color: namesOverdue > 0 ? "var(--rust)" : "var(--purple)" }}>
          <Icon name="users" size={10} />
          <span className="mono" style={{ fontSize: 9.5 }}>{names.length}</span>
        </span>
      )}
      {showWork && workSeconds > 0 && (
        <span className="mono muted" style={{ fontSize: 9.5 }}>{formatHours(workSeconds)}</span>
      )}
    </button>
  );
}

/** Compact month grid — status dots, a Scheduled Names count, and a muted hours label per cell, never full session/task/name detail (that lives in DayDetailPanel). */
export function MonthGrid({ year, monthIndex, occByDay, namesByDay, workByDay, todayKey, sourceFilter, onSelectDay, dayKeyOf }) {
  const showTasks = sourceFilter === "all" || sourceFilter === "tasks";
  const showNames = sourceFilter === "all" || sourceFilter === "names";
  const showWork = sourceFilter === "all" || sourceFilter === "work";

  const cells = useMemo(() => {
    const first = new Date(year, monthIndex, 1);
    const startOffset = first.getDay();
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const out = [];
    for (let i = 0; i < startOffset; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(new Date(year, monthIndex, d));
    return out;
  }, [year, monthIndex]);

  return (
    <div className="calendar-grid-view">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 6 }}>
        {WEEKDAY_SHORT.map((d) => (
          <div key={d} className="text-xs muted fw-semibold text-center" style={{ padding: "4px 0" }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const k = dayKeyOf(d.getTime());
          return (
            <DayCell
              key={i} date={d} dayKeyStr={k}
              occs={occByDay[k] || []} names={namesByDay[k] || []} workSeconds={workByDay[k] || 0}
              isToday={k === todayKey} showTasks={showTasks} showNames={showNames} showWork={showWork}
              onSelect={onSelectDay}
            />
          );
        })}
      </div>
    </div>
  );
}
