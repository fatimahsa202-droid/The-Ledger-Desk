import React from "react";

export function BarChart({ data, color = "var(--accent-1)", valueFmt, height = 150 }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const w = 44, gap = 14;
  return (
    <svg viewBox={`0 0 ${data.length * (w + gap)} ${height + 34}`} className="w-full" style={{ height, display: "block" }}>
      {data.map((d, i) => {
        const barH = (d.value / max) * height;
        const x = i * (w + gap);
        return (
          <g key={i} transform={`translate(${x},0)`}>
            <rect x={0} y={height - barH} width={w} height={Math.max(barH, 2)} rx={5} fill={color} opacity={d.faded ? 0.32 : 1} />
            <text x={w / 2} y={height - barH - 6} textAnchor="middle" fontSize="10.5" fontFamily="var(--font-mono)" fill="var(--ink-dim)">
              {valueFmt ? valueFmt(d.value) : d.value}
            </text>
            <text x={w / 2} y={height + 16} textAnchor="middle" fontSize="10.5" fill="var(--muted)">
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function LineChart({ points, color = "var(--accent-1)", height = 150, emptyLabel = "No entries logged yet." }) {
  if (!points || points.length === 0) return <div className="text-sm muted">{emptyLabel}</div>;
  const w = 640, pad = 10;
  const maxY = Math.max(...points.map((p) => p.y), 1);
  const minY = Math.min(...points.map((p) => p.y), 0);
  const range = maxY - minY || 1;
  const stepX = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0;
  const coords = points.map((p, i) => [pad + i * stepX, height - pad - ((p.y - minY) / range) * (height - pad * 2)]);
  const path = coords.map((c, i) => (i === 0 ? "M" : "L") + c[0].toFixed(1) + "," + c[1].toFixed(1)).join(" ");
  const areaPath = `${path} L${coords[coords.length - 1][0]},${height - pad} L${coords[0][0]},${height - pad} Z`;
  const gid = "lg-" + Math.random().toString(36).slice(2, 8);
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ height, display: "block" }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gid})`} stroke="none" />
      <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {coords.map((c, i) => (
        <circle key={i} cx={c[0]} cy={c[1]} r={3} fill={color} />
      ))}
    </svg>
  );
}

export function MiniSparkline({ values, color = "var(--accent-3)", width = 120, height = 32 }) {
  if (!values || values.length < 2) return <div style={{ width, height }} />;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const points = values.map((v, i) => `${(i * stepX).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DonutChart({ segments, size = 120, thickness = 16 }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted-soft)" strokeWidth={thickness} />
        {segments.map((s, i) => {
          const frac = s.value / total;
          const dash = frac * c;
          const el = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-acc}
              strokeLinecap={segments.length > 1 ? "butt" : "round"}
            />
          );
          acc += dash;
          return el;
        })}
      </g>
    </svg>
  );
}
