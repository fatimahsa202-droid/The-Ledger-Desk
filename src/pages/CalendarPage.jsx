import React, { useMemo, useState } from "react";
import { Icon } from "../lib/Icon.jsx";
import { Card, Pill } from "../components/primitives.jsx";
import { useAppData } from "../store/AppDataProvider.jsx";
import { dayKey, formatDuration, formatSessionRange } from "../lib/format.js";
import { groupSecondsByDay } from "../lib/selectors.js";

export function CalendarPage() {
  const { sessions } = useAppData();
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [selectedDay, setSelectedDay] = useState(dayKey(Date.now()));

  const dailyMap = useMemo(() => groupSecondsByDay(sessions), [sessions]);
  const maxSeconds = Math.max(...Object.values(dailyMap), 1);

  const grid = useMemo(() => {
    const first = new Date(cursor);
    const startOffset = first.getDay();
    const cells = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
    return cells;
  }, [cursor]);

  const daySessions = sessions.filter((s) => dayKey(s.start) === selectedDay).reverse();
  const todayKey = dayKey(Date.now());

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Overview</div>
          <h1 className="page-title mt-1">Calendar</h1>
          <p className="page-sub">Every day you touched the ledger, at a glance.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-secondary btn-icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label="Previous month">
            <Icon name="chevron-left" size={15} />
          </button>
          <div className="text-sm fw-semibold" style={{ minWidth: 130, textAlign: "center" }}>
            {cursor.toLocaleString("en-US", { month: "long", year: "numeric" })}
          </div>
          <button className="btn btn-secondary btn-icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label="Next month">
            <Icon name="chevron-right" size={15} />
          </button>
        </div>
      </div>

      <div className="grid split-15-10">
        <Card>
          <div className="grid grid-cols-7 mb-2" style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)" }}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="text-xs muted fw-semibold text-center" style={{ padding: "4px 0" }}>{d}</div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
            {grid.map((d, i) => {
              if (!d) return <div key={i} />;
              const k = dayKey(d.getTime());
              const seconds = dailyMap[k] || 0;
              const intensity = seconds ? Math.min(1, seconds / maxSeconds) : 0;
              const isToday = k === todayKey;
              const isSelected = k === selectedDay;
              return (
                <button
                  key={i}
                  onClick={() => setSelectedDay(k)}
                  className="flex flex-col items-center justify-center"
                  style={{
                    aspectRatio: "1", borderRadius: 10, border: isSelected ? "1.5px solid var(--accent-1)" : "1px solid var(--border)",
                    background: seconds ? `color-mix(in srgb, var(--accent-1) ${10 + intensity * 55}%, var(--bg-soft))` : "var(--bg-soft)",
                    outline: isToday ? "2px solid var(--amber)" : "none", outlineOffset: -2,
                  }}
                >
                  <span className="text-xs fw-semibold">{d.getDate()}</span>
                  {seconds > 0 && <span className="mono" style={{ fontSize: 9, opacity: 0.85 }}>{(seconds / 3600).toFixed(1)}h</span>}
                </button>
              );
            })}
          </div>
        </Card>

        <Card>
          <div className="eyebrow mb-3">{new Date(selectedDay).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</div>
          {daySessions.length === 0 ? (
            <div className="text-sm muted">No sessions logged this day.</div>
          ) : (
            <div className="flex flex-col gap-2">
              {daySessions.map((s) => (
                <div key={s.id} style={{ background: "var(--bg-soft)", border: "1px solid var(--border)", borderRadius: 10, padding: "9px 12px" }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm fw-medium truncate">{s.taskName}</span>
                    <span className="mono text-xs fw-semibold shrink-0">{formatDuration(s.duration)}</span>
                  </div>
                  <div className="text-xs muted mt-1 flex items-center gap-2">
                    <span className="truncate">{s.categoryName}</span>
                    {s.duration >= 1500 && <Pill tone="purple" icon="target">Focus</Pill>}
                  </div>
                  <div className="text-xs muted mt-1">{formatSessionRange(s.start, s.end)}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
