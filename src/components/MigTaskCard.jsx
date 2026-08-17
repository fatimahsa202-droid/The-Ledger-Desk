import React from "react";
import { Icon } from "../lib/Icon.jsx";
import { MIG_STATUS_META } from "../data/categories.js";
import { formatHMS } from "../lib/format.js";
import { StatusPicker } from "./StatusPicker.jsx";
import { TaskTimer } from "./TaskTimer.jsx";
import { SessionLog } from "./SessionLog.jsx";
import { NotesField } from "./NotesField.jsx";

export function MigTaskCard({ task, isRunning, liveSeconds, expanded, onToggleExpand, onStart, onStop, onReset, onStatus, onDelete, onNote }) {
  const meta = MIG_STATUS_META[task.status];
  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div className="flex items-center gap-2" style={{ padding: "10px 12px" }}>
        <button onClick={onToggleExpand} className="shrink-0" style={{ background: "none", border: "none" }} aria-label="Toggle details">
          <Icon name={expanded ? "chevron-down" : "chevron-right"} size={14} />
        </button>
        <span className="dot shrink-0" style={{ background: `var(--${meta.tone})` }} />
        <button onClick={onToggleExpand} className="flex-1 text-left text-sm fw-semibold truncate" style={{ background: "none", border: "none" }}>
          {task.name}
        </button>
        {isRunning && <Icon name="clock" size={13} style={{ color: "var(--amber)" }} className="shrink-0" />}
        <span className="mono text-xs muted shrink-0">{formatHMS(liveSeconds)}</span>
        <button onClick={onDelete} className="shrink-0" style={{ background: "none", border: "none" }} aria-label="Delete task">
          <Icon name="trash-2" size={14} style={{ color: "var(--rust)" }} />
        </button>
      </div>
      {expanded && (
        <div style={{ padding: "0 12px 14px", borderTop: "1px solid var(--border)" }}>
          <div className="mt-3 mb-3">
            <StatusPicker statusMeta={MIG_STATUS_META} value={task.status} onChange={onStatus} size="sm" />
          </div>
          <div className="mb-3">
            <TaskTimer seconds={liveSeconds} running={isRunning} onStart={onStart} onStop={onStop} onReset={onReset} compact />
          </div>
          <div className="mb-3">
            <div className="text-xs fw-semibold mb-1 flex items-center gap-1 muted">
              <Icon name="history" size={12} /> WORK SESSIONS
            </div>
            <SessionLog sessions={task.sessions} />
          </div>
          <NotesField id={task.id} value={task.notes || ""} placeholder="Notes about this task..." onCommit={onNote} />
        </div>
      )}
    </div>
  );
}
