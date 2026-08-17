import React, { useMemo } from "react";

const COLORS = ["#3b82f6", "#60a5fa", "#2fd07f", "#f0b73f", "#a78bfa", "#fb6f7f"];

export function Confetti({ pieces = 60 }) {
  const items = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.4,
        duration: 2.2 + Math.random() * 1.4,
        color: COLORS[i % COLORS.length],
        rotate: Math.random() * 360,
        w: 6 + Math.random() * 6,
      })),
    [pieces]
  );
  return (
    <div aria-hidden="true">
      {items.map((p) => (
        <span
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            background: p.color,
            width: p.w,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
}
