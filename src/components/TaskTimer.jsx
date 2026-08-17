import React from "react";
import { Icon } from "../lib/Icon.jsx";
import { formatHMS } from "../lib/format.js";

export function TaskTimer({ seconds, running, onStart, onStop, onReset, compact = false }) {
  return (
    <div
      className="flex items-center justify-between flex-wrap gap-3"
      style={{ background: "var(--bg-soft)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: compact ? "10px 14px" : "16px" }}
    >
      <div className={`mono fw-bold ${compact ? "text-xl" : "text-3xl"}`}>{formatHMS(seconds)}</div>
      <div className="flex gap-2">
        {running ? (
          <button onClick={onStop} className="btn btn-warn btn-sm">
            <Icon name="pause" size={13} /> Pause
          </button>
        ) : (
          <button onClick={onStart} className="btn btn-success btn-sm">
            <Icon name="play" size={13} /> Start
          </button>
        )}
        <button onClick={onReset} className="btn btn-secondary btn-sm">
          <Icon name="rotate-ccw" size={13} /> Reset
        </button>
      </div>
    </div>
  );
}
