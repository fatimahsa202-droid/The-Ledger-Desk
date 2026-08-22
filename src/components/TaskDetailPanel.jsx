import React, { useState, useMemo } from "react";
import { Icon } from "../lib/Icon.jsx";
import { Card, IconButton, Pill } from "./primitives.jsx";
import { StatusPicker } from "./StatusPicker.jsx";
import { TaskTimer } from "./TaskTimer.jsx";
import { SessionLog } from "./SessionLog.jsx";
import { AddSourceForm } from "./AddSourceForm.jsx";
import { NotesField } from "./NotesField.jsx";
import { ReconciledStamp } from "./ReconciledStamp.jsx";
import { STATUS_META } from "../data/categories.js";
import { isOccurrenceDrivenForMonth, occurrencesForTaskInMonth, computeBoardRollup } from "../lib/occurrenceEngine.js";
import { monthKeyLabel } from "../lib/monthNav.js";
import { useAppData } from "../store/AppDataProvider.jsx";

const dateLabel = (ts) => (ts ? new Date(ts).toLocaleDateString(undefined, { weekday: "short", day: "2-digit", month: "short" }) : null);

function OccurrenceRow({ occ, onToggleStatus, onNotesCommit }) {
  const [expanded, setExpanded] = useState(false);
  const overdue = occ.status !== "done" && occ.dueDate != null && occ.dueDate < Date.now();
  return (
    <div style={{ borderBottom: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between gap-2" style={{ padding: "8px 10px" }}>
        <button
          className="flex items-center gap-2 text-sm text-left flex-1 min-w-0"
          style={{ background: "none", border: "none", color: "var(--ink)", padding: 0 }}
          onClick={() => setExpanded((s) => !s)}
        >
          <Icon name={expanded ? "chevron-down" : "chevron-right"} size={12} className="muted shrink-0" />
          <span className="mono">{dateLabel(occ.dueDate) || occ.periodKey}</span>
          {overdue && <Pill tone="rust" outline>Overdue</Pill>}
        </button>
        <span className="flex items-center gap-2 shrink-0">
          <Pill tone={occ.status === "done" ? "green" : "rust"} outline={occ.status !== "done"}>{occ.status === "done" ? "Completed" : "Pending"}</Pill>
          <button className="btn btn-ghost btn-sm" onClick={() => onToggleStatus(occ)}>{occ.status === "done" ? "Reopen" : "Complete"}</button>
        </span>
      </div>
      {expanded && (
        <div style={{ padding: "0 10px 10px 28px" }}>
          <NotesField id={occ.id} value={occ.notes} placeholder="Notes for this occurrence..." onCommit={(val) => onNotesCommit(occ.id, val)} />
        </div>
      )}
    </div>
  );
}

/**
 * Task Board detail view for any occurrence-driven task — every new
 * (non-legacy) task, and a graduated legacy task for months on/after its
 * cutover date. Renders as a period roll-up (one card, never one card per
 * occurrence) with the individual occurrences listed underneath, each with
 * its own status and notes. monthlyData is never read or written here.
 */
function OccurrenceDrivenDetailPanel({ task, monthKey }) {
  const { occurrences, setOccurrenceStatus, updateOccurrenceNotes, isTaskFavorite, isTaskPinned, toggleFavorite, togglePinned } = useAppData();
  const occs = useMemo(() => occurrencesForTaskInMonth(occurrences, task.id, monthKey), [occurrences, task.id, monthKey]);
  const rollup = useMemo(() => computeBoardRollup(occs), [occs]);
  const monthLabel = monthKeyLabel(monthKey);
  const percent = rollup.total ? Math.round((rollup.done / rollup.total) * 100) : 0;

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
      </div>

      <div className="mb-5">
        <div className="eyebrow mb-2">
          {monthLabel} — {rollup.total > 0 ? `${rollup.done}/${rollup.total} completed` : "nothing scheduled"}
          {rollup.overdue > 0 && <span style={{ color: "var(--rust)" }}> · {rollup.overdue} overdue</span>}
        </div>
        {rollup.total > 0 && (
          <div className="progress-track thin mb-2"><div className="progress-fill green" style={{ width: `${percent}%` }} /></div>
        )}
        {rollup.next && (
          <div className="text-xs dim">Next: {dateLabel(rollup.next.dueDate) || rollup.next.periodKey}</div>
        )}
      </div>

      <div>
        <div className="eyebrow mb-2">Occurrences this period</div>
        {occs.length === 0 && <div className="text-sm dim" style={{ padding: "8px 0" }}>No occurrences scheduled for {monthLabel}.</div>}
        {occs.map((occ) => (
          <OccurrenceRow
            key={occ.id}
            occ={occ}
            onToggleStatus={(o) => setOccurrenceStatus(o.id, o.status === "done" ? "pending" : "done")}
            onNotesCommit={updateOccurrenceNotes}
          />
        ))}
      </div>
    </Card>
  );
}

/** Task Board detail view for a legacy (original 53) task, for any month before its graduation cutover (or if never graduated) — unchanged from the original monthlyData-driven experience. */
function LegacyDetailPanel({ task, monthKey }) {
  const {
    monthlyData, updateEntry, addSource, removeSource, setStatus, startTimer, stopActiveTimer, resetTimer,
    liveSecondsRecon, activeTimer, isTaskFavorite, isTaskPinned, toggleFavorite, togglePinned,
  } = useAppData();

  const entry = { status: "pending", timeSeconds: 0, sessions: [], sources: [], notes: "", ...((monthlyData[monthKey] || {})[task.id]) };
  const running = activeTimer && activeTimer.kind === "recon" && activeTimer.taskId === task.id && activeTimer.monthKey === monthKey;
  const monthLabel = monthKeyLabel(monthKey);

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

export function TaskDetailPanel({ task, monthKey }) {
  const { taskDefinitions } = useAppData();
  const def = useMemo(() => taskDefinitions.find((d) => d.id === task.id), [taskDefinitions, task.id]);
  if (isOccurrenceDrivenForMonth(def, monthKey)) {
    return <OccurrenceDrivenDetailPanel task={task} monthKey={monthKey} />;
  }
  return <LegacyDetailPanel task={task} monthKey={monthKey} />;
}
