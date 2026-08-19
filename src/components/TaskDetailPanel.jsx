import React from "react";
import { Icon } from "../lib/Icon.jsx";
import { Card, IconButton } from "./primitives.jsx";
import { StatusPicker } from "./StatusPicker.jsx";
import { TaskTimer } from "./TaskTimer.jsx";
import { SessionLog } from "./SessionLog.jsx";
import { AddSourceForm } from "./AddSourceForm.jsx";
import { NotesField } from "./NotesField.jsx";
import { ReconciledStamp } from "./ReconciledStamp.jsx";
import { STATUS_META } from "../data/categories.js";
import { MONTHS } from "../lib/format.js";
import { useAppData } from "../store/AppDataProvider.jsx";

export function TaskDetailPanel({ task, monthKey }) {
  const {
    monthlyData, updateEntry, addSource, removeSource, setStatus, startTimer, stopActiveTimer, resetTimer,
    liveSecondsRecon, activeTimer, isTaskFavorite, isTaskPinned, toggleFavorite, togglePinned,
  } = useAppData();

  const entry = { status: "pending", timeSeconds: 0, sessions: [], sources: [], notes: "", ...((monthlyData[monthKey] || {})[task.id]) };
  const running = activeTimer && activeTimer.kind === "recon" && activeTimer.taskId === task.id && activeTimer.monthKey === monthKey;
  const monthLabel = MONTHS.find((m) => m.key === monthKey)?.full || monthKey;

  return (
    <Card className="flex-1" hover={false}>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
        <div className="text-xs fw-semibold" style={{ color: "var(--accent-3)" }}>{task.categoryName}</div>
        <div className="flex gap-1">
          <IconButton
            name="star"
            label={isTaskFavorite(task.id) ? "Unfavorite" : "Favorite"}
            onClick={() => toggleFavorite(task.id)}
            style={isTaskFavorite(task.id) ? { color: "var(--gold)" } : undefined}
          />
          <IconButton
            name="pin"
            label={isTaskPinned(task.id) ? "Unpin" : "Pin"}
            onClick={() => togglePinned(task.id)}
            style={isTaskPinned(task.id) ? { color: "var(--accent-3)" } : undefined}
          />
        </div>
      </div>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <h2 className="text-xl fw-bold font-display">{task.name}</h2>
        {entry.status === "done" && <ReconciledStamp date={entry.completedAt} />}
      </div>

      <div className="mb-5">
        <div className="eyebrow mb-2">Status — {monthLabel}</div>
        <StatusPicker statusMeta={STATUS_META} value={entry.status} onChange={(s) => setStatus(task.id, monthKey, s)} />
      </div>

      <div className="mb-5">
        <TaskTimer
          seconds={liveSecondsRecon(task.id, monthKey)}
          running={running}
          onStart={() => startTimer("recon", task.id, monthKey)}
          onStop={stopActiveTimer}
          onReset={() => resetTimer("recon", task.id, monthKey)}
        />
        <div className="text-xs fw-semibold mt-3 mb-2 flex items-center gap-1" style={{ color: "var(--muted)" }}>
          <Icon name="history" size={12} /> WORK SESSIONS — picks up right where you left off, even days later
        </div>
        <SessionLog sessions={entry.sessions} />
      </div>

      <div className="mb-5">
        <div className="eyebrow mb-2">Source Sheets</div>
        {entry.sources.length > 0 && (
          <div className="flex flex-col gap-2 mb-2">
            {entry.sources.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 text-sm" style={{ background: "var(--bg-soft)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px" }}>
                <span className="flex items-center gap-2 truncate">
                  <Icon name="link-2" size={13} className="shrink-0 muted" />
                  <span className="truncate">{s.label}</span>
                  {s.link && (
                    <a href={s.link} target="_blank" rel="noopener noreferrer" className="truncate shrink-0" style={{ color: "var(--purple)", textDecoration: "underline" }}>
                      open
                    </a>
                  )}
                </span>
                <button onClick={() => removeSource(task.id, monthKey, s.id)} aria-label="Remove source">
                  <Icon name="trash-2" size={14} style={{ color: "var(--rust)" }} />
                </button>
              </div>
            ))}
          </div>
        )}
        <AddSourceForm onAdd={(s) => addSource(task.id, monthKey, s)} />
      </div>

      <div>
        <div className="eyebrow mb-2">Notes</div>
        <NotesField id={task.id + monthKey} value={entry.notes} placeholder="Notes for this month's reconciliation..." onCommit={(val) => updateEntry(task.id, monthKey, { notes: val })} />
      </div>
    </Card>
  );
}
