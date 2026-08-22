import React, { useState } from "react";
import { Icon } from "../../lib/Icon.jsx";
import { Card } from "../primitives.jsx";
import { SessionLog } from "../SessionLog.jsx";
import { formatHours } from "../../lib/format.js";

function TaskRow({ task }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderTop: "1px solid var(--border)" }}>
      <button
        className="w-full flex items-center justify-between text-sm text-left"
        style={{ padding: "8px 12px 8px 30px", background: "none", border: "none", color: "var(--ink)" }}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex items-center gap-2 truncate">
          <Icon name={open ? "chevron-down" : "chevron-right"} size={12} className="muted shrink-0" />
          <span className="truncate">{task.name}</span>
        </span>
        <span className="mono text-xs muted shrink-0">{formatHours(task.seconds)}</span>
      </button>
      {open && (
        <div style={{ padding: "0 12px 10px 48px" }}>
          <SessionLog sessions={task.sessions} />
        </div>
      )}
    </div>
  );
}

function CategoryRow({ cat }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: "1px solid var(--border)" }}>
      <button
        className="w-full flex items-center justify-between text-sm fw-semibold text-left"
        style={{ padding: "10px 12px", background: "none", border: "none", color: "var(--ink)" }}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex items-center gap-2 truncate">
          <Icon name={open ? "chevron-down" : "chevron-right"} size={14} className="muted shrink-0" />
          <span className="truncate">{cat.name}</span>
        </span>
        <span className="mono text-xs shrink-0">{formatHours(cat.seconds)}</span>
      </button>
      {open && cat.tasks.map((t) => <TaskRow key={t.taskId} task={t} />)}
    </div>
  );
}

/** Period → Category → Task → Sessions, inline expand/collapse — never navigates away from Dashboard. */
export function CategoryTimeDrilldown({ tree }) {
  if (!tree || tree.length === 0) {
    return <div className="text-sm dim" style={{ padding: 16 }}>No time tracked for this period.</div>;
  }
  return (
    <Card pad={false}>
      {tree.map((cat) => (
        <CategoryRow key={cat.categoryId} cat={cat} />
      ))}
    </Card>
  );
}
