import React, { useMemo, useState } from "react";
import { Icon } from "../lib/Icon.jsx";
import { Card, StatCard, Pill } from "../components/primitives.jsx";
import { BarChart } from "../components/charts.jsx";
import { HeatmapCalendar } from "../components/HeatmapCalendar.jsx";
import { useAppData } from "../store/AppDataProvider.jsx";
import { formatDuration, formatSessionRange, dayKey, isoWeekKey, MONTHS } from "../lib/format.js";
import { groupSecondsByDay, groupSecondsByWeek, classifySessions } from "../lib/selectors.js";

export function Timeline() {
  const { sessions, sessionStats, monthStats } = useAppData();
  const [filter, setFilter] = useState("all");

  const dailyMap = useMemo(() => groupSecondsByDay(sessions), [sessions]);
  const weeklyMap = useMemo(() => groupSecondsByWeek(sessions), [sessions]);
  const { focus, deepWork } = useMemo(() => classifySessions(sessions), [sessions]);

  const last14Days = useMemo(() => {
    const out = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const k = dayKey(d.getTime());
      out.push({ label: d.toLocaleDateString(undefined, { day: "2-digit", month: "short" }).replace(" ", " "), value: Number(((dailyMap[k] || 0) / 3600).toFixed(1)) });
    }
    return out;
  }, [dailyMap]);

  const last12Weeks = useMemo(() => {
    const out = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i * 7);
      const k = isoWeekKey(d.getTime());
      out.push({ label: k.split("-W")[1], value: Number(((weeklyMap[k] || 0) / 3600).toFixed(1)) });
    }
    return out;
  }, [weeklyMap]);

  const filteredSessions = useMemo(() => {
    const ordered = [...sessions].reverse();
    if (filter === "focus") return ordered.filter((s) => s.duration >= 25 * 60);
    if (filter === "recon") return ordered.filter((s) => s.kind === "recon");
    if (filter === "migration") return ordered.filter((s) => s.kind === "migration");
    return ordered;
  }, [sessions, filter]);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Overview</div>
          <h1 className="page-title mt-1">Timeline</h1>
          <p className="page-sub">Every work session, focus block, and pause — visualized.</p>
        </div>
      </div>

      <div className="grid grid-auto-sm mb-6">
        <StatCard icon="clock" iconTone="accent" label="Total productive time" value={formatDuration(sessionStats.totalSeconds)} />
        <StatCard icon="gauge" iconTone="green" label="Average session" value={sessionStats.count ? formatDuration(sessionStats.average) : "—"} />
        <StatCard icon="trending-up" iconTone="amber" label="Longest uninterrupted" value={sessionStats.longest ? formatDuration(sessionStats.longest.duration) : "—"} sub={sessionStats.longest?.taskName} />
        <StatCard icon="target" iconTone="purple" label="Focus sessions (25m+)" value={focus.length} />
        <StatCard icon="layers" iconTone="rust" label="Deep work (50m+)" value={deepWork.length} />
        <StatCard icon="history" iconTone="accent" label="Total sessions" value={sessions.length} />
      </div>

      <Card className="mb-6">
        <div className="eyebrow mb-3">Activity heatmap</div>
        <HeatmapCalendar dailySeconds={dailyMap} weeks={20} />
      </Card>

      <div className="grid grid-cols-2 mb-6">
        <Card>
          <div className="eyebrow mb-3">Daily work log — last 14 days</div>
          <BarChart color="var(--accent-1)" data={last14Days} valueFmt={(v) => v + "h"} />
        </Card>
        <Card>
          <div className="eyebrow mb-3">Weekly work log — last 12 weeks</div>
          <BarChart color="var(--purple)" data={last12Weeks} valueFmt={(v) => v + "h"} />
        </Card>
      </div>

      <Card className="mb-6">
        <div className="eyebrow mb-3">Monthly work log</div>
        <BarChart color="var(--amber)" data={MONTHS.map((m) => ({ label: m.label, value: Number((monthStats[m.key].seconds / 3600).toFixed(1)) }))} valueFmt={(v) => v + "h"} />
      </Card>

      <Card pad={false}>
        <div className="flex items-center justify-between flex-wrap gap-2" style={{ padding: 16, borderBottom: "1px solid var(--border)" }}>
          <div className="eyebrow">Session history</div>
          <div className="segmented">
            {[["all", "All"], ["focus", "Focus 25m+"], ["recon", "Reconciliation"], ["migration", "Migration"]].map(([id, label]) => (
              <button key={id} className={filter === id ? "active" : ""} onClick={() => setFilter(id)}>{label}</button>
            ))}
          </div>
        </div>
        <div style={{ maxHeight: 460, overflowY: "auto" }}>
          {filteredSessions.length === 0 && <div className="text-sm muted" style={{ padding: 16 }}>No sessions match this filter.</div>}
          {filteredSessions.slice(0, 200).map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 text-sm" style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
              <div className="min-w-0 flex-1">
                <div className="truncate fw-medium">{s.taskName}</div>
                <div className="text-xs muted truncate">{s.categoryName} · {formatSessionRange(s.start, s.end)}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {s.duration >= 25 * 60 && <Pill tone="purple" icon="target">Focus</Pill>}
                <span className="mono text-sm fw-semibold">{formatDuration(s.duration)}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
