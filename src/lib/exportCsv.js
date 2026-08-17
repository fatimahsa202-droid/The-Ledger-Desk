import { CATEGORIES } from "../data/categories.js";
import { getEntry, formatHours } from "./format.js";

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildMonthCsv(monthlyData, monthKey, monthLabel) {
  const header = ["Category", "Task", "Status", "Time Logged", "Time (seconds)", "Sources", "Notes"];
  const rows = [header];
  CATEGORIES.forEach((cat) => {
    cat.tasks.forEach((t) => {
      const e = getEntry(monthlyData, monthKey, t.id);
      rows.push([
        cat.name,
        t.name,
        e.status,
        formatHours(e.timeSeconds),
        e.timeSeconds,
        (e.sources || []).map((s) => s.label).join("; "),
        e.notes || "",
      ]);
    });
  });
  return rows.map((r) => r.map(csvEscape).join(",")).join("\n");
}

export function downloadTextFile(filename, content, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
