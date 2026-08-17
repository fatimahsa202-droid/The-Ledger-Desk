import React, { useEffect } from "react";
import { Icon } from "../lib/Icon.jsx";
import { Confetti } from "./Confetti.jsx";

export function CelebrationOverlay({ celebration, onClose, playSound }) {
  useEffect(() => {
    if (!celebration) return;
    playSound?.(celebration.type);
    const t = setTimeout(onClose, 3400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celebration]);

  if (!celebration) return null;

  const isLevel = celebration.type === "levelup";
  return (
    <div className="overlay" onClick={onClose} style={{ display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
      <Confetti pieces={70} />
      <div className="card card-glass" style={{ padding: "36px 40px", textAlign: "center", maxWidth: 360, animation: "popIn .3s cubic-bezier(.34,1.56,.64,1)" }}>
        <div
          className="pulse-glow"
          style={{
            width: 76, height: 76, borderRadius: "50%", margin: "0 auto 18px", display: "flex", alignItems: "center", justifyContent: "center",
            background: isLevel ? "linear-gradient(135deg,var(--gold),var(--amber))" : "linear-gradient(135deg,var(--purple),#d68bff)",
            color: "#fff",
          }}
        >
          <Icon name={isLevel ? "party-popper" : "medal"} size={34} />
        </div>
        {isLevel ? (
          <>
            <div className="eyebrow">Level Up</div>
            <div className="font-display fw-bold text-2xl mt-1">Level {celebration.level}</div>
            <div className="dim text-sm mt-1">{celebration.title}</div>
          </>
        ) : (
          <>
            <div className="eyebrow">Badge Unlocked</div>
            <div className="font-display fw-bold text-2xl mt-1">{celebration.badge.name}</div>
            <div className="dim text-sm mt-1">{celebration.badge.desc}</div>
          </>
        )}
        <div className="text-xs muted mt-4">Tap anywhere to dismiss</div>
      </div>
    </div>
  );
}
