export function emptyEntry() {
  return { status: "pending", timeSeconds: 0, sessions: [], sources: [], notes: "" };
}

export function getEntry(monthlyData, monthKey, taskId) {
  const e = (monthlyData[monthKey] && monthlyData[monthKey][taskId]) || emptyEntry();
  return { ...emptyEntry(), ...e };
}

export function formatHMS(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function formatHours(totalSeconds) {
  return (totalSeconds / 3600).toFixed(1) + "h";
}

export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

export function formatSessionRange(start, end) {
  const d1 = new Date(start), d2 = new Date(end);
  const sameDay = d1.toDateString() === d2.toDateString();
  const dateStr = d1.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
  const t1 = d1.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const t2 = d2.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return sameDay
    ? `${dateStr}, ${t1}–${t2}`
    : `${dateStr} ${t1} → ${d2.toLocaleDateString(undefined, { day: "2-digit", month: "short" })} ${t2}`;
}

export function getMonthsList() {
  const now = new Date();
  const year = now.getFullYear();
  const cur = now.getMonth();
  const out = [];
  for (let i = 0; i <= cur; i++) {
    const d = new Date(year, i, 1);
    out.push({
      key: `${year}-${String(i + 1).padStart(2, "0")}`,
      label: d.toLocaleString("en-US", { month: "short" }),
      full: d.toLocaleString("en-US", { month: "long" }),
      year,
      monthIndex: i,
    });
  }
  return out;
}

export const MONTHS = getMonthsList();
export const CURRENT_MONTH_KEY = MONTHS[MONTHS.length - 1].key;

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function isoWeekKey(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNo = 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export function relativeTime(ts) {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

export function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}
