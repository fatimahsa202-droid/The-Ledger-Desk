import React from "react";
import { Icon } from "../../lib/Icon.jsx";
import { IconButton, Pill } from "../primitives.jsx";
import { CategoryTimeDrilldown } from "../dashboard/CategoryTimeDrilldown.jsx";
import { formatHours } from "../../lib/format.js";

const STATUS_TONE = { done: "green", overdue: "rust", "in-progress": "amber", pending: "accent" };
const STATUS_LABEL = { done: "Completed", overdue: "Overdue", "in-progress": "In Progress", pending: "Pending" };

/** Day → Category → Task → Sessions detail modal. Reuses the existing overlay/modal pattern and CategoryTimeDrilldown/SessionLog components unchanged. */
export function DayDetailPanel({ dateLabel, occurrences, workTree, workSeconds, sourceFilter, onClose, onToggleOccurrence }) {
  const showTasks = sourceFilter !== "work";
  const showWork = sourceFilter !== "tasks";

  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="modal">
        <div className="modal-panel" style={{ maxWidth: 600 }} role="dialog" aria-modal="true" aria-label={`${dateLabel} detail`}>
          <div style={{ padding: 22, maxHeight: "82vh", overflowY: "auto" }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg fw-bold">{dateLabel}</h3>
              <IconButton name="x" label="Close" onClick={onClose} />
            </div>

            {showTasks && (
              <div className="mb-5">
                <div className="eyebrow mb-2">Accounting Tasks</div>
                {occurrences.length === 0 ? (
                  <div className="text-sm dim">No scheduled accounting work this day.</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {occurrences.map((o) => (
                      <div key={o.id} className="flex items-center justify-between gap-2 text-sm" style={{ background: "var(--bg-soft)", border: "1px solid var(--border)", borderRadius: 10, padding: "9px 12px" }}>
                        <span className="flex items-center gap-2 truncate">
                          {(o.priority === "high" || o.priority === "critical") && (
                            <Icon name="flag" size={11} style={{ color: o.priority === "critical" ? "var(--rust)" : "var(--gold)" }} className="shrink-0" />
                          )}
                          <span className="truncate">{o.name}</span>
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          <Pill tone={STATUS_TONE[o.displayStatus]} outline={o.displayStatus !== "done"}>{STATUS_LABEL[o.displayStatus]}</Pill>
                          <button className="btn btn-ghost btn-sm" onClick={() => onToggleOccurrence(o.id, o.status === "done" ? "pending" : "done")}>
                            {o.status === "done" ? "Reopen" : "Complete"}
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {showWork && (
              <div>
                <div className="eyebrow mb-2">Work Activity — {formatHours(workSeconds)} total</div>
                <CategoryTimeDrilldown tree={workTree} />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
