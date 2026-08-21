import React, { useState, useMemo } from "react";
import { Icon } from "../lib/Icon.jsx";
import { Card, Pill } from "./primitives.jsx";
import { useAppData } from "../store/AppDataProvider.jsx";
import { PRIORITIES, PRIORITY_META, FREQUENCIES, FREQUENCY_LABELS, definitionSafeToDelete, graduationOverlapWarning } from "../data/taskDefinitions.js";
import { WEEKDAY_LABELS, MONTHLY_RULE_LABELS } from "../lib/recurrence.js";
import { relativeTime } from "../lib/format.js";

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function toDateInputValue(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/* ------------------------------------------------------------- Categories */

function CategoryRow({ cat, onSave, onArchive, onDelete, onReorder, safeToDelete, isFirst, isLast }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(cat.name);

  const save = () => {
    if (name.trim()) onSave(cat.id, { name: name.trim() });
    setEditing(false);
  };

  return (
    <div className="flex items-center justify-between gap-2" style={{ padding: "9px 12px", borderBottom: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <Icon name={cat.icon || "layers"} size={14} style={{ color: "var(--accent-3)" }} className="shrink-0" />
        {editing ? (
          <input className="input" style={{ maxWidth: 220 }} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} autoFocus />
        ) : (
          <span className="text-sm truncate">{cat.name}</span>
        )}
        {cat.isBuiltIn && <span className="text-xs dim">built-in</span>}
        {cat.archived && <Pill tone="rust" outline>Archived</Pill>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {editing ? (
          <>
            <button className="btn btn-secondary btn-sm" onClick={save}>Save</button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(false); setName(cat.name); }}>Cancel</button>
          </>
        ) : (
          <>
            <button className="btn btn-ghost btn-icon" aria-label="Move up" disabled={isFirst} onClick={() => onReorder(cat.id, -1)}><Icon name="chevron-up" size={14} /></button>
            <button className="btn btn-ghost btn-icon" aria-label="Move down" disabled={isLast} onClick={() => onReorder(cat.id, 1)}><Icon name="chevron-down" size={14} /></button>
            <button className="btn btn-ghost btn-icon" aria-label="Rename" onClick={() => setEditing(true)}><Icon name="pencil" size={14} /></button>
            <button className="btn btn-secondary btn-sm" onClick={() => onArchive(cat.id, !cat.archived)}>{cat.archived ? "Reactivate" : "Archive"}</button>
            <button
              className="btn btn-ghost btn-icon"
              aria-label="Delete"
              disabled={!safeToDelete}
              data-tip={safeToDelete ? "Delete" : "Has tasks — archive instead"}
              onClick={() => safeToDelete && window.confirm(`Delete category "${cat.name}"? This can't be undone.`) && onDelete(cat.id)}
            >
              <Icon name="trash-2" size={14} style={{ color: safeToDelete ? "var(--rust)" : "var(--muted)" }} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function CategoriesManager() {
  const { categoryDefs, taskDefinitions, addCategory, updateCategory, archiveCategory, deleteCategory, reorderCategory } = useAppData();
  const [showArchived, setShowArchived] = useState(false);
  const [newName, setNewName] = useState("");

  const sorted = useMemo(() => [...categoryDefs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)), [categoryDefs]);
  const visible = sorted.filter((c) => showArchived || !c.archived);

  const safeToDelete = (id) => !taskDefinitions.some((t) => t.categoryId === id);

  const submitNew = () => {
    if (!newName.trim()) return;
    addCategory({ name: newName.trim() });
    setNewName("");
  };

  return (
    <Card className="mb-5" pad={false}>
      <div className="flex items-center justify-between flex-wrap gap-2" style={{ padding: "13px 16px", borderBottom: "1px solid var(--border)" }}>
        <div className="eyebrow">Categories</div>
        <label className="checkbox-row" style={{ margin: 0 }}>
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          <span className="text-xs dim">Show archived</span>
        </label>
      </div>
      <div>
        {visible.map((cat, i) => (
          <CategoryRow
            key={cat.id}
            cat={cat}
            onSave={updateCategory}
            onArchive={archiveCategory}
            onDelete={deleteCategory}
            onReorder={reorderCategory}
            safeToDelete={safeToDelete(cat.id)}
            isFirst={i === 0}
            isLast={i === visible.length - 1}
          />
        ))}
      </div>
      <div className="flex gap-2" style={{ padding: 12 }}>
        <input className="input flex-1" placeholder="New category name" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitNew()} />
        <button className="btn btn-secondary btn-sm" onClick={submitNew}><Icon name="plus" size={14} /> Add category</button>
      </div>
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
              <span className="text-sm dim">BD+</span>
              <input
                type="number" min={1} max={20} className="input mono" style={{ width: 80 }}
                value={draft.monthlyRule.count || 1}
                onChange={(e) => setDraft((d) => ({ ...d, monthlyRule: { ...d.monthlyRule, count: Number(e.target.value) } }))}
              />
              <span className="text-xs dim">business days after month-end</span>
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
});

/* ------------------------------------------------------------ Task rows */

function OccurrencesPreview({ definitionId }) {
  const { occurrences, setOccurrenceStatus } = useAppData();
  const list = useMemo(
    () => Object.values(occurrences).filter((o) => o.definitionId === definitionId).sort((a, b) => (a.dueDate || 0) - (b.dueDate || 0)),
    [occurrences, definitionId]
  );
  if (list.length === 0) return <div className="text-xs dim" style={{ padding: "8px 0" }}>No occurrences generated yet.</div>;
  return (
    <div className="flex flex-col gap-1" style={{ padding: "8px 0" }}>
      {list.map((o) => (
        <div key={o.id} className="flex items-center justify-between text-xs" style={{ padding: "5px 8px", background: "var(--bg-soft)", borderRadius: 6 }}>
          <span className="mono">{o.dueDate ? new Date(o.dueDate).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : o.periodKey}</span>
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

function TaskRow({ def, categories, monthlyData, safeToDelete, onSave, onArchive, onDelete, onGraduate }) {
  const [editing, setEditing] = useState(false);
  const [showOccurrences, setShowOccurrences] = useState(false);
  const [draft, setDraft] = useState(() => ({ ...blankDraft(def.categoryId), ...def }));
  const [graduating, setGraduating] = useState(false);
  const [graduationDate, setGraduationDate] = useState("");
  const [overlapConfirm, setOverlapConfirm] = useState(null);

  const isGraduated = def.legacyMonthlyStorage && !!def.graduatedFrom;
  const isUngraduatedLegacy = def.legacyMonthlyStorage && !def.graduatedFrom;
  const occurrenceCapable = !def.legacyMonthlyStorage || isGraduated;

  const startEdit = () => {
    setDraft({ ...blankDraft(def.categoryId), ...def });
    setGraduating(false);
    setGraduationDate(isGraduated ? toDateInputValue(def.graduatedFrom) : "");
    setOverlapConfirm(null);
    setEditing(true);
  };

  const doSave = () => {
    if (!draft.name.trim()) return;
    const graduatedFromMs = graduationDate ? new Date(graduationDate + "T00:00:00").getTime() : null;
    const wantsGraduation = isUngraduatedLegacy && graduating;
    const wantsCutoverChange = isGraduated && graduatedFromMs && graduatedFromMs !== def.graduatedFrom;

    if (wantsGraduation || wantsCutoverChange) {
      if (!graduatedFromMs) return; // required
      const { hasOverlap, monthKeys } = graduationOverlapWarning(def, monthlyData, graduatedFromMs);
      if (hasOverlap && !overlapConfirm) {
        setOverlapConfirm({ monthKeys });
        return;
      }
      onGraduate(def.id, { ...draft, graduatedFrom: graduatedFromMs });
      setEditing(false);
      return;
    }
    onSave(def.id, draft);
    setEditing(false);
  };

  const quickDate = (ts) => { setGraduationDate(toDateInputValue(ts)); setOverlapConfirm(null); };

  if (editing) {
    return (
      <div style={{ padding: "12px", borderBottom: "1px solid var(--border)", background: "var(--bg-soft)" }}>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <label className="field-label">Name</label>
            <input className="input" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} autoFocus />
          </div>
          <div>
            <label className="field-label">Category</label>
            <select className="select" value={draft.categoryId} onChange={(e) => setDraft((d) => ({ ...d, categoryId: e.target.value }))}>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
        <div className="mb-2">
          <label className="field-label">Priority</label>
          <div className="segmented">
            {PRIORITIES.map((p) => (
              <button key={p} className={draft.priority === p ? "active" : ""} onClick={() => setDraft((d) => ({ ...d, priority: p }))}>{PRIORITY_META[p].label}</button>
            ))}
          </div>
        </div>

        {!def.legacyMonthlyStorage && (
          <div className="mb-3">
            <RecurrenceFields draft={draft} setDraft={setDraft} />
          </div>
        )}

        {isUngraduatedLegacy && !graduating && (
          <div className="mb-3" style={{ padding: 10, background: "var(--bg)", border: "1px dashed var(--border)", borderRadius: 8 }}>
            <div className="text-xs dim mb-2">
              This is one of the original 53 monthly tasks. It's currently on the legacy monthly system — its history keeps living in your existing reconciliation workflow, untouched.
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setGraduating(true)}>Move to the new recurrence system</button>
          </div>
        )}

        {isUngraduatedLegacy && graduating && (
          <div className="mb-3">
            <div className="text-xs dim mb-2">
              Choose the new recurrence rule, and the exact date it should start from. Everything before that date stays exactly as it already is in your history — nothing is rewritten or deleted.
            </div>
            <RecurrenceFields draft={draft} setDraft={setDraft} />
            <div className="mt-2">
              <label className="field-label">Start new schedule from *</label>
              <div className="flex items-center gap-2 flex-wrap">
                <input type="date" className="input mono" style={{ width: "auto" }} value={graduationDate} onChange={(e) => { setGraduationDate(e.target.value); setOverlapConfirm(null); }} />
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => quickDate(Date.now())}>Today</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { const d = new Date(); d.setMonth(d.getMonth() + 1, 1); quickDate(d.getTime()); }}>Start of next month</button>
              </div>
              {!graduationDate && <div className="text-xs mt-1" style={{ color: "var(--rust)" }}>Required to move this task onto the new recurrence system.</div>}
            </div>
            <button type="button" className="btn btn-ghost btn-sm mt-2" onClick={() => { setGraduating(false); setGraduationDate(""); setOverlapConfirm(null); }}>
              Cancel — keep on the legacy monthly system
            </button>
          </div>
        )}

        {isGraduated && (
          <div className="mb-3">
            <RecurrenceFields draft={draft} setDraft={setDraft} />
            <div className="mt-2">
              <label className="field-label">Schedule start date</label>
              <input type="date" className="input mono" style={{ width: "auto" }} value={graduationDate} onChange={(e) => { setGraduationDate(e.target.value); setOverlapConfirm(null); }} />
              <div className="text-xs dim mt-1">
                Graduated from the legacy monthly system on {new Date(def.graduatedFrom).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}. History before this date is untouched. Changing this date won't remove occurrences already generated.
              </div>
            </div>
          </div>
        )}

        {overlapConfirm && (
          <div className="mb-3 text-xs" style={{ padding: 10, background: "var(--bg-soft)", border: "1px solid var(--gold)", borderRadius: 8 }}>
            <div className="fw-semibold mb-1" style={{ color: "var(--gold)" }}>Heads up — overlapping history</div>
            <div className="dim mb-2">
              {overlapConfirm.monthKeys.join(", ")} already {overlapConfirm.monthKeys.length === 1 ? "has" : "have"} recorded history for this task under the old monthly system.
              Choosing this start date means both the old record and new occurrences could exist for the same period — nothing will be deleted, but you may see this task represented twice for {overlapConfirm.monthKeys.length === 1 ? "that month" : "those months"}.
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={doSave}>Continue anyway</button>
          </div>
        )}

        <div className="flex gap-2">
          <button className="btn btn-primary btn-sm" onClick={doSave}>Save</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ borderBottom: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between gap-2" style={{ padding: "9px 12px" }}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {(def.priority === "high" || def.priority === "critical") && (
            <Icon name="flag" size={11} style={{ color: def.priority === "critical" ? "var(--rust)" : "var(--gold)" }} className="shrink-0" />
          )}
          <span className="text-sm truncate">{def.name}</span>
          <span className="text-xs dim shrink-0">{FREQUENCY_LABELS[def.frequency]}</span>
          {isGraduated && (
            <span className="text-xs dim shrink-0" data-tip="Moved onto the new recurrence system">
              · graduated {new Date(def.graduatedFrom).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}
            </span>
          )}
          {def.archived && <Pill tone="rust" outline>Archived</Pill>}
          {def.isBuiltIn && <span className="text-xs dim">built-in</span>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {occurrenceCapable && (
            <button className="btn btn-ghost btn-sm" onClick={() => setShowOccurrences((s) => !s)}>
              <Icon name={showOccurrences ? "chevron-up" : "chevron-down"} size={12} /> Occurrences
            </button>
          )}
          <button className="btn btn-ghost btn-icon" aria-label="Edit" onClick={startEdit}><Icon name="pencil" size={14} /></button>
          <button className="btn btn-secondary btn-sm" onClick={() => onArchive(def.id, !def.archived)}>{def.archived ? "Reactivate" : "Archive"}</button>
          <button
            className="btn btn-ghost btn-icon"
            aria-label="Delete"
            disabled={!safeToDelete}
            data-tip={safeToDelete ? "Delete" : "Has history — archive instead"}
            onClick={() => safeToDelete && window.confirm(`Delete "${def.name}"? This can't be undone.`) && onDelete(def.id)}
          >
            <Icon name="trash-2" size={14} style={{ color: safeToDelete ? "var(--rust)" : "var(--muted)" }} />
          </button>
        </div>
      </div>
      {showOccurrences && occurrenceCapable && (
        <div style={{ padding: "0 12px 10px" }}>
          <OccurrencesPreview definitionId={def.id} />
        </div>
      )}
    </div>
  );
}

function TasksManager() {
  const { taskDefinitions, categoryDefs, occurrences, monthlyData, addTaskDefinition, updateTaskDefinition, archiveTaskDefinition, deleteTaskDefinition, graduateTaskDefinition } = useAppData();
  const [showArchived, setShowArchived] = useState(false);
  const [filterCat, setFilterCat] = useState("all");
  const [adding, setAdding] = useState(false);
  const [newDraft, setNewDraft] = useState(() => blankDraft(categoryDefs[0]?.id));

  const categories = useMemo(() => [...categoryDefs].filter((c) => !c.archived).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)), [categoryDefs]);
  const visible = taskDefinitions.filter((t) => (showArchived || !t.archived) && (filterCat === "all" || t.categoryId === filterCat));

  const safeToDelete = (def) => definitionSafeToDelete(def, monthlyData, occurrences);

  const submitNew = () => {
    if (!newDraft.name.trim() || !newDraft.categoryId) return;
    addTaskDefinition(newDraft);
    setNewDraft(blankDraft(newDraft.categoryId));
    setAdding(false);
  };

  return (
    <Card pad={false}>
      <div className="flex items-center justify-between flex-wrap gap-2" style={{ padding: "13px 16px", borderBottom: "1px solid var(--border)" }}>
        <div className="eyebrow">Task Definitions</div>
        <div className="flex items-center gap-3">
          <select className="select mono" style={{ width: "auto" }} value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
            <option value="all">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <label className="checkbox-row" style={{ margin: 0 }}>
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            <span className="text-xs dim">Show archived</span>
          </label>
        </div>
      </div>
      <div>
        {visible.map((def) => (
          <TaskRow
            key={def.id}
            def={def}
            categories={categories}
            monthlyData={monthlyData}
            safeToDelete={safeToDelete(def)}
            onSave={updateTaskDefinition}
            onArchive={archiveTaskDefinition}
            onDelete={deleteTaskDefinition}
            onGraduate={graduateTaskDefinition}
          />
        ))}
        {visible.length === 0 && <div className="text-sm dim" style={{ padding: 16 }}>No tasks match this filter.</div>}
      </div>

      <div style={{ padding: 12 }}>
        {!adding ? (
          <button className="btn btn-secondary btn-sm" onClick={() => setAdding(true)}><Icon name="plus" size={14} /> Add task</button>
        ) : (
          <div style={{ padding: 12, background: "var(--bg-soft)", borderRadius: 8 }}>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className="field-label">Name</label>
                <input className="input" value={newDraft.name} onChange={(e) => setNewDraft((d) => ({ ...d, name: e.target.value }))} autoFocus />
              </div>
              <div>
                <label className="field-label">Category</label>
                <select className="select" value={newDraft.categoryId} onChange={(e) => setNewDraft((d) => ({ ...d, categoryId: e.target.value }))}>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="mb-2">
              <label className="field-label">Priority</label>
              <div className="segmented">
                {PRIORITIES.map((p) => (
                  <button key={p} className={newDraft.priority === p ? "active" : ""} onClick={() => setNewDraft((d) => ({ ...d, priority: p }))}>{PRIORITY_META[p].label}</button>
                ))}
              </div>
            </div>
            <div className="mb-3">
              <RecurrenceFields draft={newDraft} setDraft={setNewDraft} />
            </div>
            <div className="flex gap-2">
              <button className="btn btn-primary btn-sm" onClick={submitNew}>Add task</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setAdding(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ----------------------------------------------------------------- Root */

export function ManageTasks() {
  return (
    <div>
      <p className="text-sm dim mb-4">
        Manage the accounting task library — rename, re-categorize, archive, or create new tasks with their own
        recurrence. The original 53 monthly tasks keep working exactly as before through the Task Board; new tasks
        with weekly, yearly, or custom recurrence generate their own occurrences below.
      </p>
      <CategoriesManager />
      <TasksManager />
    </div>
  );
}
