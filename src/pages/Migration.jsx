import React, { useState } from "react";
import { Icon } from "../lib/Icon.jsx";
import { Card, ProgressBar } from "../components/primitives.jsx";
import { LineChart } from "../components/charts.jsx";
import { MigTaskCard } from "../components/MigTaskCard.jsx";
import { useAppData } from "../store/AppDataProvider.jsx";

function MigrationInput({ onApply }) {
  const [custom, setCustom] = useState("");
  const [note, setNote] = useState("");
  const submitCustom = () => {
    const n = Number(custom);
    if (!n) return;
    onApply(n, note.trim());
    setCustom("");
    setNote("");
  };
  return (
    <div className="flex flex-wrap gap-2">
      <div className="flex gap-1.5">
        {[-10, -1, 1, 5, 10, 25].map((n) => (
          <button key={n} onClick={() => onApply(n, "")} className="btn btn-secondary btn-sm" style={{ color: n < 0 ? "var(--rust)" : "var(--purple)" }}>
            <Icon name={n > 0 ? "plus" : "minus"} size={12} /> {Math.abs(n)}
          </button>
        ))}
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="input flex-1" style={{ minWidth: 140 }} />
      <input value={custom} onChange={(e) => setCustom(e.target.value)} type="number" placeholder="Custom +/-" className="input mono" style={{ width: 120 }} />
      <button onClick={submitCustom} className="btn btn-primary btn-sm">Log</button>
    </div>
  );
}

export function Migration() {
  const {
    migration, migrationDone, migrationRemaining, migrationPercent, applyMigrationChange,
    addMigTask, deleteMigTask, updateMigTask, setMigStatus, activeTimer, liveSecondsMig,
    startTimer, stopActiveTimer, resetTimer, setMigration,
  } = useAppData();
  const [newTaskName, setNewTaskName] = useState("");
  const [expanded, setExpanded] = useState(() => new Set());

  const toggleExpand = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const submitAdd = () => {
    const id = addMigTask(newTaskName);
    if (id) {
      setExpanded((prev) => new Set(prev).add(id));
      setNewTaskName("");
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Workspace</div>
          <h1 className="page-title mt-1">Data Migration</h1>
          <p className="page-sub">Patient name migration — English to Arabic.</p>
        </div>
      </div>

      <Card className="mb-6">
        <div className="eyebrow mb-3" style={{ color: "var(--purple)" }}>Patient Name Migration — English to Arabic</div>
        <div className="flex flex-wrap items-end gap-6 mb-4">
          <div>
            <div className="text-3xl fw-bold mono" style={{ color: "var(--purple)" }}>
              {migrationDone}<span className="muted" style={{ fontSize: "1.1rem" }}> / {migration.total}</span>
            </div>
            <div className="text-xs muted mt-1">names converted</div>
          </div>
          <div>
            <div className="text-xl fw-bold mono">{migrationRemaining}</div>
            <div className="text-xs muted mt-1">remaining</div>
          </div>
          <div>
            <div className="text-xl fw-bold mono">{migrationPercent}%</div>
            <div className="text-xs muted mt-1">complete</div>
          </div>
          <div className="flex items-center gap-2" style={{ marginLeft: "auto" }}>
            <label className="text-xs muted">Total names</label>
            <input
              type="number"
              value={migration.total}
              onChange={(e) => setMigration((prev) => ({ ...prev, total: Math.max(0, Number(e.target.value) || 0) }))}
              className="input mono"
              style={{ width: 96 }}
            />
          </div>
        </div>
        <ProgressBar percent={migrationPercent} tone="purple" className="mb-5" />
        <MigrationInput onApply={applyMigrationChange} />
      </Card>

      <Card className="mb-6">
        <div className="eyebrow mb-3">Progress over time</div>
        <LineChart color="var(--purple)" points={migration.log.map((l) => ({ y: l.totalAfter }))} />
      </Card>

      <Card pad={false} className="mb-6">
        <div className="eyebrow" style={{ padding: 16, borderBottom: "1px solid var(--border)" }}>Activity log</div>
        <div style={{ maxHeight: 280, overflowY: "auto" }}>
          {migration.log.length === 0 && <div className="text-sm muted" style={{ padding: 16 }}>No entries yet — log your first batch above.</div>}
          {[...migration.log].reverse().map((l) => (
            <div key={l.id} className="flex items-center justify-between text-sm gap-2" style={{ padding: "9px 16px", borderBottom: "1px solid var(--border)" }}>
              <span className="mono text-xs muted">{new Date(l.ts).toLocaleString()}</span>
              <span className="mono fw-semibold" style={{ color: l.change >= 0 ? "var(--green)" : "var(--rust)" }}>{l.change >= 0 ? "+" : ""}{l.change}</span>
              <span className="mono text-xs muted">→ {l.totalAfter}/{migration.total}</span>
              <span className="truncate text-xs muted" style={{ flex: 1, textAlign: "right" }}>{l.note}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card pad={false}>
        <div style={{ padding: 16, borderBottom: "1px solid var(--border)" }}>
          <div className="eyebrow mb-2">Other migration tasks — add anything to tackle later</div>
          <div className="flex gap-2">
            <input
              value={newTaskName}
              onChange={(e) => setNewTaskName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitAdd()}
              placeholder="e.g. Fix duplicate patient IDs"
              className="input flex-1"
            />
            <button onClick={submitAdd} className="btn btn-primary shrink-0"><Icon name="plus" size={14} /> Add Task</button>
          </div>
        </div>
        <div className="flex flex-col gap-2" style={{ padding: 16 }}>
          {migration.tasks.length === 0 && (
            <div className="text-sm muted">No extra tasks yet — add one above and it'll get its own status and timer, just like the reconciliation tasks.</div>
          )}
          {migration.tasks.map((task) => {
            const running = activeTimer && activeTimer.kind === "migration" && activeTimer.taskId === task.id;
            return (
              <MigTaskCard
                key={task.id}
                task={task}
                isRunning={running}
                liveSeconds={liveSecondsMig(task)}
                expanded={expanded.has(task.id)}
                onToggleExpand={() => toggleExpand(task.id)}
                onStart={() => startTimer("migration", task.id, null)}
                onStop={stopActiveTimer}
                onReset={() => resetTimer("migration", task.id, null)}
                onStatus={(s) => setMigStatus(task.id, s)}
                onDelete={() => deleteMigTask(task.id)}
                onNote={(v) => updateMigTask(task.id, { notes: v })}
              />
            );
          })}
        </div>
      </Card>
    </div>
  );
}
