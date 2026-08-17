import React from "react";
import { Icon } from "../lib/Icon.jsx";

export function StatusPicker({ statusMeta, value, onChange, size = "md" }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {Object.entries(statusMeta).map(([key, meta]) => {
        const active = value === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`btn ${size === "sm" ? "btn-sm" : ""}`}
            style={{
              background: active ? `var(--${meta.tone}-bg)` : "transparent",
              color: `var(--${meta.tone})`,
              border: `1.5px solid ${active ? `var(--${meta.tone})` : "var(--border)"}`,
            }}
          >
            <Icon name={meta.icon} size={13} />
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}

export function StatusDot({ statusMeta, status }) {
  const meta = statusMeta[status];
  return <span className="dot" style={{ background: `var(--${meta.tone})` }} />;
}
