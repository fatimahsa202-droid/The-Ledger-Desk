import React from "react";
import { Icon } from "../lib/Icon.jsx";

export function Card({ children, className = "", hover = false, glass = false, pad = true, ...rest }) {
  return (
    <div className={`card ${hover ? "card-hover" : ""} ${glass ? "card-glass" : ""} ${pad ? "card-pad" : ""} ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function Pill({ tone = "accent", outline = false, icon, children, className = "" }) {
  return (
    <span className={`pill ${outline ? "pill-outline" : `pill-tone-${tone}`} ${className}`}>
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}

export function ProgressBar({ percent, tone, thin = false, className = "" }) {
  return (
    <div className={`progress-track ${thin ? "thin" : ""} ${className}`}>
      <div className={`progress-fill ${tone || ""}`} style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
    </div>
  );
}

export function RingProgress({ percent, size = 56, stroke = 6, tone, children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.max(0, Math.min(100, percent)) / 100) * c;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="ring" width={size} height={size}>
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
        <circle
          className="ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={tone ? { stroke: tone } : undefined}
        />
      </svg>
      {children && (
        <div className="flex items-center justify-center" style={{ position: "absolute", inset: 0 }}>
          {children}
        </div>
      )}
    </div>
  );
}

export function LevelAvatar({ level, tier = "bronze", size = 52 }) {
  return (
    <div className={`level-avatar tier-${tier}`} style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {level}
    </div>
  );
}

export function StatCard({ icon, iconTone = "accent", label, value, sub, delta, className = "" }) {
  return (
    <Card hover className={`stat-tile ${className}`}>
      {icon && (
        <div className="stat-icon" style={{ background: `var(--${iconTone}-bg, var(--panel-hover))`, color: `var(--${iconTone}, var(--accent-1))` }}>
          <Icon name={icon} size={16} />
        </div>
      )}
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="text-xs muted">{sub}</div>}
      {delta != null && (
        <div className={`stat-delta ${delta >= 0 ? "up" : "down"}`}>
          <Icon name={delta >= 0 ? "arrow-up" : "arrow-down"} size={11} />
          {Math.abs(delta)}%
        </div>
      )}
    </Card>
  );
}

export function EmptyState({ icon = "inbox", title, desc, action }) {
  return (
    <div className="empty-state">
      <Icon name={icon} size={34} className="icon" />
      {title && <div className="text-base fw-semibold mt-3" style={{ color: "var(--ink-dim)" }}>{title}</div>}
      {desc && <div className="text-sm mt-1">{desc}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ w = "100%", h = 14, radius = 8, className = "" }) {
  return <div className={`skeleton ${className}`} style={{ width: w, height: h, borderRadius: radius }} />;
}

export function IconButton({ name, label, onClick, className = "", size = 16, tone = "ghost", ...rest }) {
  return (
    <button aria-label={label} data-tip={label} onClick={onClick} className={`btn btn-${tone} btn-icon ${className}`} {...rest}>
      <Icon name={name} size={size} />
    </button>
  );
}

export function Divider({ vertical = false }) {
  return vertical ? <div className="divider-v" /> : <hr className="divider" />;
}
