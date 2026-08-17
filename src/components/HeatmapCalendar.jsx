import React from "react";
import { dayKey, formatDuration } from "../lib/format.js";

function levelFor(seconds, max) {
  if (!seconds) return 0;
  const frac = seconds / (max || 1);
  if (frac > 0.75) return 4;
  if (frac > 0.5) return 3;
  if (frac > 0.2) return 2;
  return 1;
}

/** GitHub-style contribution heatmap for the trailing `weeks` weeks. */
export function HeatmapCalendar({ dailySeconds, weeks = 20 }) {
  const days = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const totalDays = weeks * 7;
  // Align end of grid to the upcoming Saturday so columns are full weeks.
  const endPad = 6 - today.getDay();
  for (let i = totalDays + endPad - 1; i >= -endPad; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  const values = days.map((d) => dailySeconds[dayKey(d.getTime())] || 0);
  const max = Math.max(...values, 1);

  return (
    <div>
      <div className="heatmap-grid" style={{ overflowX: "auto" }} role="img" aria-label="Work activity calendar heatmap">
        {days.map((d, i) => {
          const v = values[i];
          const isFuture = d > today;
          return (
            <div
              key={i}
              className="heatmap-cell"
              data-tip={isFuture ? undefined : `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} — ${v ? formatDuration(v) : "no activity"}`}
              data-level={isFuture ? undefined : levelFor(v, max)}
              style={isFuture ? { visibility: "hidden" } : undefined}
            />
          );
        })}
      </div>
      <div className="flex items-center gap-2 mt-2 text-xs muted">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className="heatmap-cell" data-level={l || undefined} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
