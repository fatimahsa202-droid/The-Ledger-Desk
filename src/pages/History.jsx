import React, { useState } from "react";
import { Icon } from "../lib/Icon.jsx";
import { Card, EmptyState } from "../components/primitives.jsx";
import { useAppData } from "../store/AppDataProvider.jsx";
import { relativeTime } from "../lib/format.js";

const TYPE_META = {
  status: { icon: "circle-check", tone: "green" },
  session: { icon: "clock", tone: "accent" },
  badge: { icon: "medal", tone: "gold" },
  migration: { icon: "languages", tone: "purple" },
  "migration-status": { icon: "languages", tone: "purple" },
  "migration-add": { icon: "plus-circle", tone: "purple" },
  "month-closed": { icon: "calendar-check", tone: "green" },
};

export function History() {
  const { activityLog } = useAppData();
  const [filter, setFilter] = useState("all");

  const filtered = filter === "all" ? activityLog : activityLog.filter((a) => a.type === filter);
  const types = Array.from(new Set(activityLog.map((a) => a.type)));

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Insights</div>
          <h1 className="page-title mt-1">Recent Activity</h1>
          <p className="page-sub">A running log of everything that happened in your workspace.</p>
        </div>
      </div>

      {types.length > 1 && (
        <div className="segmented mb-5">
          <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>All</button>
          {types.map((t) => (
            <button key={t} className={filter === t ? "active" : ""} onClick={() => setFilter(t)}>{t.replace("-", " ")}</button>
          ))}
        </div>
      )}

      <Card pad={false}>
        {filtered.length === 0 ? (
          <EmptyState icon="history" title="No activity yet" desc="Start a timer or reconcile a task to see it here." />
        ) : (
          <div>
            {filtered.map((a) => {
              const meta = TYPE_META[a.type] || { icon: "activity", tone: "accent" };
              return (
                <div key={a.id} className="flex items-start gap-3 text-sm" style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
                  <div
                    className="shrink-0"
                    style={{ width: 30, height: 30, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: `var(--${meta.tone}-bg)`, color: `var(--${meta.tone})` }}
                  >
                    <Icon name={meta.icon} size={14} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div>{a.message}</div>
                    <div className="text-xs muted mt-1">{relativeTime(a.ts)} · {new Date(a.ts).toLocaleString()}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
