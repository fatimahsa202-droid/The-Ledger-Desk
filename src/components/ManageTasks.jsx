import React, { useState, useMemo, useRef, useEffect } from "react";
import { Icon } from "../lib/Icon.jsx";
import { Card, Pill, IconButton } from "./primitives.jsx";
import { useAppData } from "../store/AppDataProvider.jsx";
import { PRIORITIES, PRIORITY_META, FREQUENCIES, FREQUENCY_LABELS, definitionSafeToDelete, graduationOverlapWarning } from "../data/taskDefinitions.js";
import { WEEKDAY_LABELS, MONTHLY_RULE_LABELS, generateInstances, DEFAULT_WORKING_DAYS } from "../lib/recurrence.js";

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function toDateInputValue(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatShortDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/** A short, human line describing a task's cadence for compact rows — e.g. "Weekly · Sun, Wed", "Monthly", "BD+2 after month-end". */
function scheduleLine(def) {
  if (def.legacyMonthlyStorage && !def.graduatedFrom) return "Monthly";
  if (def.frequency === "weekly") {
    const days = (def.weekdays || []).map((i) => WEEKDAY_LABELS[i]);
    return days.length ? `Weekly · ${days.join(", ")}` : "Weekly";
  }
  if (def.frequency === "monthly") {
    const kind = def.monthlyRule?.kind || "none";
    if (kind === "none") return "Monthly";
    if (kind === "specificDay") return `Monthly · Day ${def.monthlyRule.day || 1}`;
    if (kind === "lastDay") return "Monthly · Last day";
    if (kind === "firstBusinessDay") return "Monthly · First business day";
    if (kind === "lastBusinessDay") return "Monthly · Last business day";
    if (kind === "bdAfterMonthEnd") return `Monthly · BD+${def.monthlyRule.count || 1}`;
    return "Monthly";
  }
  if (def.frequency === "yearly") {
    const { month = 0, day = 1 } = def.yearlyRule || {};
    return `Yearly · ${MONTH_NAMES[month]} ${day}`;
  }
  if (def.frequency === "once") return "One-time";
  if (def.frequency === "custom") {
    const { everyN = 1, unit = "days" } = def.customRule || {};
    return `Every ${everyN} ${unit}`;
  }
  return FREQUENCY_LABELS[def.frequency] || "";
}

/* ---------------------------------------------------------- Overflow menu */

function OverflowMenu({ items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onEsc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative" style={{ display: "inline-block" }}>
      <IconButton name="ellipsis" label="More actions" onClick={() => setOpen((o) => !o)} />
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute", right: 0, top: "calc(100% + 4px)", minWidth: 170, zIndex: 30,
            background: "var(--panel)", border: "1px solid var(--border-strong)", borderRadius: 10,
            boxShadow: "var(--shadow-lg)", overflow: "hidden", padding: 4,
          }}
        >
          {items.filter((it) => !it.hidden).map((it, i) => (
            <button
              key={i}
              role="menuitem"
              disabled={it.disabled}
              data-tip={it.tip}
              onClick={() => { setOpen(false); it.onClick(); }}
              className="text-sm"
              style={{
                display: "block", width: "100%", textAlign: "left", padding: "8px 10px", background: "none",
                border: "none", borderRadius: 6, color: it.danger ? "var(--rust)" : "var(--ink)",
                cursor: it.disabled ? "not-allowed" : "pointer", opacity: it.disabled ? 0.45 : 1,
              }}
              onMouseEnter={(e) => !it.disabled && (e.currentTarget.style.background = "var(--panel-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- Categories */

function CategoryRow({ cat, activeCount, onSave, onArchive, onDelete, onReorder, safeToDelete, isFirst, isLast }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(cat.name);

  const save = () => {
    if (name.trim()) onSave(cat.id, { name: name.trim() });
    setEditing(false);
  };

  return (
    <div className="flex items-center justify-between gap-2" style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Icon name={cat.icon || "layers"} size={16} style={{ color: "var(--accent-3)" }} className="shrink-0" />
        <div className="min-w-0">
          {editing ? (
            <input
              className="input" style={{ maxWidth: 240 }} value={name} autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setName(cat.name); setEditing(false); } }}
            />
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm fw-semibold truncate">{cat.name}</span>
              {cat.archived && <Pill tone="rust" outline>Archived</Pill>}
            </div>
          )}
          {!editing && <div className="text-xs dim">{activeCount} active task{activeCount === 1 ? "" : "s"}</div>}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {editing ? (
          <>
            <button className="btn btn-secondary btn-sm" onClick={save}>Save</button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(false); setName(cat.name); }}>Cancel</button>
          </>
        ) : (
          <>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>Edit</button>
            <OverflowMenu
              items={[
                { label: "Move up", onClick: () => onReorder(cat.id, -1), disabled: isFirst },
                { label: "Move down", onClick: () => onReorder(cat.id, 1), disabled: isLast },
                { label: cat.archived ? "Restore" : "Archive", onClick: () => onArchive(cat.id, !cat.archived) },
                {
                  label: "Delete", danger: true, disabled: !safeToDelete,
                  tip: safeToDelete ? undefined : "Has tasks — archive instead",
                  onClick: () => window.confirm(`Delete category "${cat.name}"? This can't be undone.`) && onDelete(cat.id),
                },
              ]}
            />
          </>
        )}
      </div>
    </div>
  );
}

function CategoriesManager() {
  const { categoryDefs, taskDefinitions, addCategory, updateCategory, archiveCategory, deleteCategory, reorderCategory } = useAppData();
  const [showArchived, setShowArchived] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const sorted = useMemo(() => [...categoryDefs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)), [categoryDefs]);
  const visible = sorted.filter((c) => showArchived || !c.archived);
  const activeTaskCount = (catId) => taskDefinitions.filter((t) => t.categoryId === catId && !t.archived).length;
  const safeToDelete = (id) => !taskDefinitions.some((t) => t.categoryId === id);

  const submitNew = () => {
    if (!newName.trim()) return;
    addCategory({ name: newName.trim() });
    setNewName("");
    setAdding(false);
  };

  return (
    <Card pad={false}>
      <div className="flex items-center justify-between flex-wrap gap-2" style={{ padding: "16px" }}>
        <div>
          <h2 className="text-lg fw-bold">Manage Categories</h2>
          <p className="text-sm dim mt-1">Rename, reorder, or archive your accounting categories.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="checkbox-row" style={{ margin: 0 }}>
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            <span className="text-xs dim">Show archived</span>
          </label>
          <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}><Icon name="plus" size={14} /> Add Category</button>
        </div>
      </div>
      <div>
        {visible.map((cat, i) => (
          <CategoryRow
            key={cat.id}
            cat={cat}
            activeCount={activeTaskCount(cat.id)}
            onSave={updateCategory}
            onArchive={archiveCategory}
            onDelete={deleteCategory}
            onReorder={reorderCategory}
            safeToDelete={safeToDelete(cat.id)}
            isFirst={i === 0}
            isLast={i === visible.length - 1}
          />
        ))}
        {visible.length === 0 && <div className="text-sm dim" style={{ padding: 16 }}>No categories to show.</div>}
      </div>
      {adding && (
        <div className="flex gap-2" style={{ padding: 16, borderTop: "1px solid var(--border)" }}>
          <input
            className="input flex-1" placeholder="New category name" value={newName} autoFocus
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitNew()}
          />
          <button className="btn btn-primary btn-sm" onClick={submitNew}>Add</button>
          <button className="btn btn-ghost btn-sm" onClick={() => { setAdding(false); setNewName(""); }}>Cancel</button>
        </div>
      )}
    </Card>
  );
}

/* --------------------------------------------------------- Recurrence UI */

function WeekdayPicker({ value, onChange }) {
  return (
    <div className="flex gap-1 flex-wrap">
      {WEEKDAY_LABELS.map((label, i) => {
        const on = (value || []).includes(i);
        return (
          <button
            key={i}
            type="button"
            className="tag-chip"
            style={on ? { background: "linear-gradient(120deg,var(--accent-1),var(--accent-2))", color: "#fff", borderColor: "transparent" } : undefined}
            onClick={() => {
              const set = new Set(value || []);
              set.has(i) ? set.delete(i) : set.add(i);
              onChange([...set].sort());
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function RecurrenceFields({ draft, setDraft }) {
  const freq = draft.frequency;
  return (
    <div className="flex flex-col gap-2">
      <div>
        <label className="field-label">Frequency</label>
        <select className="select mono" value={freq} onChange={(e) => setDraft((d) => ({ ...d, frequency: e.target.value }))}>
          {FREQUENCIES.map((f) => <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>)}
        </select>
      </div>

      {freq === "once" && (
        <div>
          <label className="field-label">Due date</label>
          <input type="date" className="input mono" value={toDateInputValue(draft.dueDate)} onChange={(e) => setDraft((d) => ({ ...d, dueDate: e.target.value ? new Date(e.target.value + "T00:00:00").getTime() : null }))} />
        </div>
      )}

      {freq === "weekly" && (
        <div>
          <label className="field-label">Repeat on</label>
          <WeekdayPicker value={draft.weekdays} onChange={(weekdays) => setDraft((d) => ({ ...d, weekdays }))} />
        </div>
      )}

      {freq === "monthly" && (
        <div className="flex flex-col gap-2">
          <div>
            <label className="field-label">Monthly rule</label>
            <select
              className="select mono"
              value={draft.monthlyRule?.kind || "none"}
              onChange={(e) => setDraft((d) => ({ ...d, monthlyRule: { ...d.monthlyRule, kind: e.target.value } }))}
            >
              {Object.entries(MONTHLY_RULE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          {draft.monthlyRule?.kind === "specificDay" && (
            <div>
              <label className="field-label">Day of month</label>
              <input
                type="number" min={1} max={31} className="input mono" style={{ width: 90 }}
                value={draft.monthlyRule.day || 1}
                onChange={(e) => setDraft((d) => ({ ...d, monthlyRule: { ...d.monthlyRule, day: Number(e.target.value) } }))}
              />
            </div>
          )}
          {draft.monthlyRule?.kind === "bdAfterMonthEnd" && (
            <div className="flex items-center gap-2">
              <span className="text-sm dim">Business days after month-end</span>
              <input
                type="number" min={1} max={20} className="input mono" style={{ width: 80 }}
                value={draft.monthlyRule.count || 1}
                onChange={(e) => setDraft((d) => ({ ...d, monthlyRule: { ...d.monthlyRule, count: Number(e.target.value) } }))}
              />
            </div>
          )}
        </div>
      )}

      {freq === "yearly" && (
        <div className="flex items-end gap-2">
          <div>
            <label className="field-label">Month</label>
            <select className="select mono" value={draft.yearlyRule?.month ?? 0} onChange={(e) => setDraft((d) => ({ ...d, yearlyRule: { ...d.yearlyRule, month: Number(e.target.value) } }))}>
              {MONTH_NAMES.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Day</label>
            <input type="number" min={1} max={31} className="input mono" style={{ width: 80 }} value={draft.yearlyRule?.day || 1} onChange={(e) => setDraft((d) => ({ ...d, yearlyRule: { ...d.yearlyRule, day: Number(e.target.value) } }))} />
          </div>
        </div>
      )}

      {freq === "custom" && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm dim">Repeat every</span>
            <input type="number" min={1} className="input mono" style={{ width: 70 }} value={draft.customRule?.everyN || 1} onChange={(e) => setDraft((d) => ({ ...d, customRule: { ...d.customRule, everyN: Number(e.target.value) } }))} />
            <select className="select mono" value={draft.customRule?.unit || "days"} onChange={(e) => setDraft((d) => ({ ...d, customRule: { ...d.customRule, unit: e.target.value } }))}>
              <option value="days">day(s)</option>
              <option value="weeks">week(s)</option>
              <option value="months">month(s)</option>
            </select>
          </div>
          <div>
            <label className="field-label">Optionally, only on</label>
            <WeekdayPicker value={draft.customRule?.weekdays} onChange={(weekdays) => setDraft((d) => ({ ...d, customRule: { ...d.customRule, weekdays } }))} />
          </div>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------- Task defaults */

const blankDraft = (categoryId) => ({
  name: "",
  categoryId,
  priority: "normal",
  frequency: "monthly",
  monthlyRule: { kind: "none" },
  weekdays: [],
  everyNWeeks: 1,
  yearlyRule: { month: 0, day: 1 },
  customRule: { everyN: 1, unit: "days" },
  dueDate: null,
  notes: "",
});

/* -------------------------------------------------------- Edit Task modal */

function OccurrencesPreview({ definitionId }) {
  const { occurrences, setOccurrenceStatus } = useAppData();
  const list = useMemo(
    () => Object.values(occurrences).filter((o) => o.definitionId === definitionId).sort((a, b) => (a.dueDate || 0) - (b.dueDate || 0)),
    [occurrences, definitionId]
  );
  if (list.length === 0) return <div className="text-xs dim" style={{ padding: "8px 0" }}>No occurrences generated yet.</div>;
  return (
    <div className="flex flex-col gap-1" style={{ padding: "8px 0", maxHeight: 220, overflowY: "auto" }}>
      {list.map((o) => (
        <div key={o.id} className="flex items-center justify-between text-xs" style={{ padding: "5px 8px", background: "var(--bg-soft)", borderRadius: 6 }}>
          <span className="mono">{o.dueDate ? formatShortDate(o.dueDate) : o.periodKey}</span>
          <span className="flex items-center gap-2">
            <Pill tone={o.status === "done" ? "green" : "rust"} outline={o.status !== "done"}>{o.status === "done" ? "Completed" : "Pending"}</Pill>
            <button className="btn btn-ghost btn-sm" onClick={() => setOccurrenceStatus(o.id, o.status === "done" ? "pending" : "done")}>
              {o.status === "done" ? "Reopen" : "Complete"}
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}

function TaskEditModal({ def, categories, monthlyData, workingDays, onClose, onSave, onGraduate }) {
  const isNew = !def;
  const [draft, setDraft] = useState(() => (def ? { ...blankDraft(def.categoryId), ...def } : blankDraft(categories[0]?.id)));
  const [graduating, setGraduating] = useState(false);
  const [graduationDate, setGraduationDate] = useState(def?.graduatedFrom ? toDateInputValue(def.graduatedFrom) : "");
  const [overlapConfirm, setOverlapConfirm] = useState(null);
  const [showOccurrences, setShowOccurrences] = useState(false);

  const isGraduated = !isNew && def.legacyMonthlyStorage && !!def.graduatedFrom;
  const isUngraduatedLegacy = !isNew && def.legacyMonthlyStorage && !def.graduatedFrom;
  // New tasks start out exactly like a legacy task: plain monthly cadence,
  // no schedule editor at creation. A recurring schedule can be turned on
  // afterward from Edit, the same "Set a recurring schedule" path any
  // existing legacy task already has (see isUngraduatedLegacy below).
  const hasScheduleEditor = isGraduated || (isUngraduatedLegacy && graduating);

  const quickDate = (ts) => { setGraduationDate(toDateInputValue(ts)); setOverlapConfirm(null); };

  const preview = useMemo(() => {
    if (!hasScheduleEditor) return [];
    const from = graduating && graduationDate ? new Date(graduationDate + "T00:00:00") : new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setMonth(to.getMonth() + 6);
    try {
      return generateInstances(draft, from, to, workingDays || DEFAULT_WORKING_DAYS).slice(0, 5);
    } catch {
      return [];
    }
  }, [hasScheduleEditor, draft, graduating, graduationDate, workingDays]);

  const doSave = () => {
    if (!draft.name.trim()) return;
    if (isNew) {
      onSave(null, draft);
      onClose();
      return;
    }
    const graduatedFromMs = graduationDate ? new Date(graduationDate + "T00:00:00").getTime() : null;
    const wantsGraduation = isUngraduatedLegacy && graduating;
    const wantsCutoverChange = isGraduated && graduatedFromMs && graduatedFromMs !== def.graduatedFrom;

    if (wantsGraduation || wantsCutoverChange) {
      if (!graduatedFromMs) return;
      const { hasOverlap, monthKeys } = graduationOverlapWarning(def, monthlyData, graduatedFromMs);
      if (hasOverlap && !overlapConfirm) {
        setOverlapConfirm({ monthKeys });
        return;
      }
      onGraduate(def.id, { ...draft, graduatedFrom: graduatedFromMs });
      onClose();
      return;
    }
    onSave(def.id, draft);
    onClose();
  };

  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="modal">
        <div className="modal-panel" style={{ maxWidth: 540 }} role="dialog" aria-modal="true" aria-label={isNew ? "Add task" : "Edit task"}>
          <div style={{ padding: 22, maxHeight: "80vh", overflowY: "auto" }}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg fw-bold">{isNew ? "Add Task" : "Edit Task"}</h3>
              <IconButton name="x" label="Close" onClick={onClose} />
            </div>
            {!isNew && def.isBuiltIn && <div className="text-xs dim mb-4">One of your original accounting tasks.</div>}
            {(isNew || !def.isBuiltIn) && <div className="mb-4" />}

            <div className="eyebrow mb-2">Basic</div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className="field-label">Task Name</label>
                <input className="input" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} autoFocus />
              </div>
              <div>
                <label className="field-label">Category</label>
                <select className="select" value={draft.categoryId} onChange={(e) => setDraft((d) => ({ ...d, categoryId: e.target.value }))}>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="mb-4">
              <label className="field-label">Priority</label>
              <div className="segmented">
                {PRIORITIES.map((p) => (
                  <button key={p} type="button" className={draft.priority === p ? "active" : ""} onClick={() => setDraft((d) => ({ ...d, priority: p }))}>{PRIORITY_META[p].label}</button>
                ))}
              </div>
            </div>

            <div className="eyebrow mb-2">Schedule</div>

            {isUngraduatedLegacy && !graduating && (
              <div className="mb-4" style={{ padding: 12, background: "var(--bg-soft)", border: "1px dashed var(--border)", borderRadius: 8 }}>
                <div className="text-sm dim mb-2">This task follows your regular monthly close cycle and doesn't have a recurring schedule set yet.</div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setGraduating(true)}>Set a recurring schedule</button>
              </div>
            )}

            {isNew && (
              <div className="mb-4" style={{ padding: 12, background: "var(--bg-soft)", border: "1px dashed var(--border)", borderRadius: 8 }}>
                <div className="text-sm dim">New tasks start on your regular monthly close cycle, exactly like your existing tasks. You can set a recurring schedule for it later from Edit, once it's saved.</div>
              </div>
            )}

            {hasScheduleEditor && (
              <div className="mb-4">
                <RecurrenceFields draft={draft} setDraft={setDraft} />

                {(isUngraduatedLegacy || isGraduated) && (
                  <div className="mt-3">
                    <label className="field-label">Start new schedule from</label>
                    <div className="flex items-center gap-2 flex-wrap">
                      <input type="date" className="input mono" style={{ width: "auto" }} value={graduationDate} onChange={(e) => { setGraduationDate(e.target.value); setOverlapConfirm(null); }} />
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => quickDate(Date.now())}>Today</button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => { const d = new Date(); d.setMonth(d.getMonth() + 1, 1); quickDate(d.getTime()); }}>Start of next month</button>
                    </div>
                    <div className="text-xs dim mt-2">Your previous task history will remain unchanged.</div>
                    {!graduationDate && isUngraduatedLegacy && (
                      <div className="text-xs mt-1" style={{ color: "var(--rust)" }}>Pick a date to turn on this schedule.</div>
                    )}
                  </div>
                )}

                {preview.length > 0 && (
                  <div className="mt-3" style={{ padding: 10, background: "var(--bg-soft)", borderRadius: 8 }}>
                    <div className="text-xs fw-semibold mb-2" style={{ color: "var(--muted)" }}>Next occurrences</div>
                    <div className="flex flex-col gap-1">
                      {preview.map((p) => (
                        <div key={p.periodKey} className="text-xs mono dim">{p.dueDate ? formatShortDate(p.dueDate) : p.periodKey}</div>
                      ))}
                    </div>
                  </div>
                )}

                {overlapConfirm && (
                  <div className="mt-3 text-xs" style={{ padding: 10, background: "var(--bg-soft)", border: "1px solid var(--gold)", borderRadius: 8 }}>
                    <div className="fw-semibold mb-1" style={{ color: "var(--gold)" }}>Heads up</div>
                    <div className="dim mb-2">
                      {overlapConfirm.monthKeys.join(", ")} already {overlapConfirm.monthKeys.length === 1 ? "has" : "have"} recorded history for this task.
                      Starting the new schedule there means you may see this task listed twice for {overlapConfirm.monthKeys.length === 1 ? "that period" : "those periods"} — nothing will be lost.
                    </div>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={doSave}>Continue anyway</button>
                  </div>
                )}

                {isUngraduatedLegacy && graduating && (
                  <button type="button" className="btn btn-ghost btn-sm mt-3" onClick={() => { setGraduating(false); setGraduationDate(""); setOverlapConfirm(null); }}>
                    Cancel — keep the regular monthly cycle
                  </button>
                )}
              </div>
            )}

            <div className="eyebrow mb-2">Details</div>
            <div className="mb-2">
              <label className="field-label">Notes</label>
              <textarea
                className="input" rows={3} style={{ resize: "vertical" }}
                value={draft.notes || ""}
                onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                placeholder="Optional notes about this task..."
              />
            </div>

            {!isNew && hasScheduleEditor && (
              <div className="mt-2">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowOccurrences((s) => !s)}>
                  <Icon name={showOccurrences ? "chevron-up" : "chevron-down"} size={12} /> {showOccurrences ? "Hide" : "Show"} upcoming occurrences
                </button>
                {showOccurrences && <OccurrencesPreview definitionId={def.id} />}
              </div>
            )}

            <div className="flex gap-2 mt-5">
              <button className="btn btn-primary" onClick={doSave}>Save</button>
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------ Task rows */

function TaskRow({ def, categoryName, safeToDelete, onEdit, onArchive, onDelete }) {
  return (
    <div className="flex items-center justify-between gap-3" style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {(def.priority === "high" || def.priority === "critical") && (
            <Icon name="flag" size={12} style={{ color: def.priority === "critical" ? "var(--rust)" : "var(--gold)" }} className="shrink-0" />
          )}
          <span className="text-sm fw-semibold truncate">{def.name}</span>
          {def.archived && <Pill tone="rust" outline>Archived</Pill>}
        </div>
        <div className="text-xs dim truncate">
          {categoryName} · {scheduleLine(def)} · {PRIORITY_META[def.priority || "normal"].label}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button className="btn btn-ghost btn-sm" onClick={onEdit}>Edit</button>
        <OverflowMenu
          items={[
            { label: def.archived ? "Restore" : "Archive", onClick: () => onArchive(def.id, !def.archived) },
            {
              label: "Delete", danger: true, disabled: !safeToDelete,
              tip: safeToDelete ? undefined : "Has history — archive instead",
              onClick: () => window.confirm(`Delete "${def.name}"? This can't be undone.`) && onDelete(def.id),
            },
          ]}
        />
      </div>
    </div>
  );
}

function TasksManager() {
  const { taskDefinitions, categoryDefs, occurrences, monthlyData, settings, addTaskDefinition, updateTaskDefinition, archiveTaskDefinition, deleteTaskDefinition, graduateTaskDefinition } = useAppData();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("active"); // "all" | "active" | "archived"
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [editing, setEditing] = useState(null); // { def } | { def: null } for "add" | null
  const categories = useMemo(() => [...categoryDefs].filter((c) => !c.archived).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)), [categoryDefs]);
  const categoryNameById = useMemo(() => Object.fromEntries(categoryDefs.map((c) => [c.id, c.name])), [categoryDefs]);

  const q = query.trim().toLowerCase();
  const visible = taskDefinitions
    .filter((t) => statusFilter === "all" || (statusFilter === "archived" ? t.archived : !t.archived))
    .filter((t) => categoryFilter === "all" || t.categoryId === categoryFilter)
    .filter((t) => !q || t.name.toLowerCase().includes(q))
    .sort((a, b) => (categoryNameById[a.categoryId] || "").localeCompare(categoryNameById[b.categoryId] || "") || a.name.localeCompare(b.name));

  const safeToDelete = (def) => definitionSafeToDelete(def, monthlyData, occurrences);

  const handleSave = (id, draft) => {
    if (id) updateTaskDefinition(id, draft);
    else addTaskDefinition(draft);
  };

  return (
    <Card pad={false}>
      <div style={{ padding: 16 }}>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <div>
            <h2 className="text-lg fw-bold">Manage Tasks</h2>
            <p className="text-sm dim mt-1">Rename, re-categorize, or set a schedule for any accounting task.</p>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setEditing({ def: null })}><Icon name="plus" size={14} /> Add Task</button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1" style={{ minWidth: 180 }}>
            <Icon name="search" size={14} className="muted" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tasks..." className="input" style={{ paddingLeft: 30 }} aria-label="Search tasks" />
          </div>
          <div className="segmented">
            {["all", "active", "archived"].map((f) => (
              <button key={f} className={statusFilter === f ? "active" : ""} onClick={() => setStatusFilter(f)}>{f === "all" ? "All" : f === "active" ? "Active" : "Archived"}</button>
            ))}
          </div>
          <select className="select mono" style={{ width: "auto" }} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="all">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>
      <div>
        {visible.map((def) => (
          <TaskRow
            key={def.id}
            def={def}
            categoryName={categoryNameById[def.categoryId] || "—"}
            safeToDelete={safeToDelete(def)}
            onEdit={() => setEditing({ def })}
            onArchive={archiveTaskDefinition}
            onDelete={deleteTaskDefinition}
          />
        ))}
        {visible.length === 0 && <div className="text-sm dim" style={{ padding: 16 }}>No tasks match this filter.</div>}
      </div>

      {editing && (
        <TaskEditModal
          def={editing.def}
          categories={categories}
          monthlyData={monthlyData}
          workingDays={settings.workingDays}
          onClose={() => setEditing(null)}
          onSave={handleSave}
          onGraduate={graduateTaskDefinition}
        />
      )}
    </Card>
  );
}

/* ----------------------------------------------------------------- Root */

export function ManageTasks() {
  const [tab, setTab] = useState("tasks");
  return (
    <div>
      <p className="text-sm dim mb-4">
        Manage the accounting task library — rename, re-categorize, archive, or set a schedule. Your original 53
        monthly tasks and their history keep working exactly as before unless you choose to give one a schedule.
      </p>
      <div className="tabs mb-5">
        <button className={`tab-btn ${tab === "tasks" ? "active" : ""}`} onClick={() => setTab("tasks")}>Tasks</button>
        <button className={`tab-btn ${tab === "categories" ? "active" : ""}`} onClick={() => setTab("categories")}>Categories</button>
      </div>
      {tab === "tasks" ? <TasksManager /> : <CategoriesManager />}
    </div>
  );
}
