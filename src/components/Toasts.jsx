import React from "react";
import { Icon } from "../lib/Icon.jsx";

const TONE_ICON = { xp: "zap", level: "party-popper", badge: "medal" };

export function Toasts({ toasts }) {
  if (!toasts.length) return null;
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.tone}`}>
          <Icon name={TONE_ICON[t.tone] || "zap"} size={16} />
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}
