import { getEntry, formatHours } from "./format.js";
import { resolveTaskReportRow } from "./dashboardSelectors.js";

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * `categories` is the live effectiveCategories list (built-in + custom,
 * current names/order), not the frozen data/categories.js constant, and
 * `taskDefinitions` is the full live definition list — otherwise a custom or
 * graduated task is silently missing from the exported CSV. Sources/Notes
 * only apply to legacy-storage tasks (occurrence-driven tasks don't have a
 * task-month Source Sheets/Notes concept — see TaskDetailPanel.jsx), so those
 * two columns are blank for them; status/time are still fully populated via
 * the same resolveTaskReportRow used by the printed Reports page.
 */
export function buildMonthCsv(monthlyData, occurrences, categories, taskDefinitions, monthKey, monthLabel) {
  const header = ["Category", "Task", "Status", "Time Logged", "Time (seconds)", "Sources", "Notes"];
  const rows = [header];
  const defById = Object.fromEntries((taskDefinitions || []).map((d) => [d.id, d]));
  (categories || []).forEach((cat) => {
    cat.tasks.forEach((t) => {
      const def = defById[t.id];
      if (!def) return;
      const e = getEntry(monthlyData, monthKey, t.id);
      const row = resolveTaskReportRow(monthlyData, occurrences, def, monthKey);
      if (!row) return;
      rows.push([
        cat.name,
        t.name,
        row.status,
        formatHours(row.seconds),
        row.seconds,
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
