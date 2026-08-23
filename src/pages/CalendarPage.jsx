import React, { useMemo, useState } from "react";
import { Icon } from "../lib/Icon.jsx";
import { Card } from "../components/primitives.jsx";
import { useAppData } from "../store/AppDataProvider.jsx";
import { dayKey } from "../lib/format.js";
import { monthKeyFor, shiftMonthKey, parseMonthKey } from "../lib/monthNav.js";
import { occurrencesByDay, workSecondsByDay, dayWorkActivityTree } from "../lib/calendarSelectors.js";
import { MonthGrid } from "../components/calendar/MonthGrid.jsx";
import { AgendaList } from "../components/calendar/AgendaList.jsx";
import { DayDetailPanel } from "../components/calendar/DayDetailPanel.jsx";

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const SOURCE_LABELS = { all: "All", tasks: "Accounting Tasks", work: "Work Activity" };

function useYearOptions(selectedYear, currentYear) {
  return useMemo(() => {
    const base = [];
    for (let y = currentYear - 5; y <= currentYear + 2; y++) base.push(y);
    if (!base.includes(selectedYear)) base.push(selectedYear);
    return base.sort((a, b) => a - b);
  }, [selectedYear, currentYear]);
}

/** "YYYY-MM-DD" -> local-midnight Date, avoiding the UTC-parse day-shift bug new Date(str) has. */
function dateFromDayKey(k) {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function CalendarPage() {
  const { sessions, occurrences, setOccurrenceStatus } = useAppData();
  const now = Date.now();
  const todayKey = dayKey(now);
  const currentYear = new Date().getFullYear();

  const [year, setYear] = useState(currentYear);
  const [monthIndex, setMonthIndex] = useState(new Date().getMonth());
  const [sourceFilter, setSourceFilter] = useState("all");
  const [selectedDayKey, setSelectedDayKey] = useState(null);

  const monthKey = monthKeyFor(year, monthIndex);
  const currentMonthKey = monthKeyFor(currentYear, new Date().getMonth());
  const isCurrentMonth = monthKey === currentMonthKey;
  const yearOptions = useYearOptions(year, currentYear);

  const monthStart = useMemo(() => new Date(year, monthIndex, 1).getTime(), [year, monthIndex]);
  const monthEnd = useMemo(() => new Date(year, monthIndex + 1, 0, 23, 59, 59, 999).getTime(), [year, monthIndex]);

  const occByDay = useMemo(() => occurrencesByDay(occurrences, monthStart, monthEnd, now), [occurrences, monthStart, monthEnd, now]);
  const workByDay = useMemo(() => workSecondsByDay(sessions, monthStart, monthEnd), [sessions, monthStart, monthEnd]);

  const goToMonth = (y, m) => { setYear(y); setMonthIndex(m); };
  const shift = (delta) => { const shifted = shiftMonthKey(monthKey, delta); const { year: y, monthIndex: m } = parseMonthKey(shifted); goToMonth(y, m); };
  const goToday = () => { setYear(currentYear); setMonthIndex(new Date().getMonth()); setSelectedDayKey(null); };

  const selectedOccs = selectedDayKey ? (occByDay[selectedDayKey] || []) : [];
  const selectedWorkSeconds = selectedDayKey ? (workByDay[selectedDayKey] || 0) : 0;
  const selectedWorkTree = useMemo(() => (selectedDayKey ? dayWorkActivityTree(sessions, selectedDayKey) : []), [sessions, selectedDayKey]);
  const selectedDateLabel = selectedDayKey ? dateFromDayKey(selectedDayKey).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "";

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Overview</div>
          <h1 className="page-title mt-1">Calendar</h1>
          <p className="page-sub">Scheduled accounting work and tracked time, together.</p>
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div className="flex items-center gap-1" style={{ background: "var(--bg-soft)", border: "1px solid var(--border)", borderRadius: 10, padding: "6px 8px" }}>
          <button className="btn btn-ghost btn-icon" aria-label="Previous month" onClick={() => shift(-1)}><Icon name="chevron-left" size={16} /></button>
          <select className="select mono" style={{ width: "auto" }} value={monthIndex} onChange={(e) => goToMonth(year, Number(e.target.value))}>
            {MONTH_NAMES.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <select className="select mono" style={{ width: "auto" }} value={year} onChange={(e) => goToMonth(Number(e.target.value), monthIndex)}>
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button className="btn btn-ghost btn-icon" aria-label="Next month" onClick={() => shift(1)}><Icon name="chevron-right" size={16} /></button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="segmented">
            {["all", "tasks", "work"].map((f) => (
              <button key={f} className={sourceFilter === f ? "active" : ""} onClick={() => setSourceFilter(f)}>{SOURCE_LABELS[f]}</button>
            ))}
          </div>
          {!isCurrentMonth && <button className="btn btn-secondary btn-sm" onClick={goToday}>Today</button>}
        </div>
      </div>

      <Card>
        <MonthGrid
          year={year} monthIndex={monthIndex}
          occByDay={occByDay} workByDay={workByDay}
          todayKey={todayKey} sourceFilter={sourceFilter}
          onSelectDay={setSelectedDayKey} dayKeyOf={dayKey}
        />
        <AgendaList
          year={year} monthIndex={monthIndex}
          occByDay={occByDay} workByDay={workByDay}
          todayKey={todayKey} sourceFilter={sourceFilter}
          onSelectDay={setSelectedDayKey} dayKeyOf={dayKey}
        />
      </Card>

      {selectedDayKey && (
        <DayDetailPanel
          dateLabel={selectedDateLabel}
          occurrences={selectedOccs}
          workTree={selectedWorkTree}
          workSeconds={selectedWorkSeconds}
          sourceFilter={sourceFilter}
          onClose={() => setSelectedDayKey(null)}
          onToggleOccurrence={setOccurrenceStatus}
        />
      )}
    </div>
  );
}
