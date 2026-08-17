import React, { useState } from "react";
import { formatHMS, formatSessionRange } from "../lib/format.js";

export function SessionLog({ sessions }) {
  const [showAll, setShowAll] = useState(false);
  if (!sessions || sessions.length === 0) {
    return <div className="text-xs muted">No work sessions logged yet — press Start to begin timing.</div>;
  }
  const ordered = [...sessions].reverse();
  const visible = showAll ? ordered : ordered.slice(0, 4);
  return (
    <div>
      <div className="flex flex-col gap-1">
        {visible.map((s) => (
          <div key={s.id} className="flex items-center justify-between text-xs" style={{ background: "var(--bg-soft)", borderRadius: 8, padding: "6px 10px" }}>
            <span className="muted">{formatSessionRange(s.start, s.end)}</span>
            <span className="mono fw-semibold">{formatHMS(s.duration)}</span>
          </div>
        ))}
      </div>
      {ordered.length > 4 && (
        <button onClick={() => setShowAll((v) => !v)} className="text-xs mt-2" style={{ color: "var(--purple)", background: "none", border: "none", textDecoration: "underline" }}>
          {showAll ? "Show less" : `Show all ${ordered.length} sessions`}
        </button>
      )}
    </div>
  );
}
