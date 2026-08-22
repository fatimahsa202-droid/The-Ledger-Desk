import React, { useMemo } from "react";
import { Icon } from "../../lib/Icon.jsx";
import { shiftWeek, weekLabel } from "../../lib/weekNav.js";
import { shiftMonthKey, monthKeyFor, parseMonthKey, monthKeyLabel } from "../../lib/monthNav.js";

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const PERIOD_LABELS = { today: "Today", week: "Week", month: "Month", year: "Year" };

function useYearOptions(selectedYear, currentYear) {
  return useMemo(() => {
    const base = [];
    for (let y = currentYear - 5; y <= currentYear + 2; y++) base.push(y);
    if (!base.includes(selectedYear)) base.push(selectedYear);
    return base.sort((a, b) => a - b);
  }, [selectedYear, currentYear]);
}

export function PeriodHeader({
  periodType, setPeriodType,
  weekStart, setWeekStart,
  selectedMonth, selectedYear, setSelectedMonthYear,
  yearOnly, setYearOnly,
  selectedCategory, setSelectedCategory,
  categories,
  isCurrentPeriod, onCurrentPeriod,
  currentYear,
}) {
  const yearOptions = useYearOptions(periodType === "year" ? yearOnly : selectedYear, currentYear);

  return (
    <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
      <div className="segmented">
        {["today", "week", "month", "year"].map((p) => (
          <button key={p} className={periodType === p ? "active" : ""} onClick={() => setPeriodType(p)}>{PERIOD_LABELS[p]}</button>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {periodType === "week" && (
          <div className="flex items-center gap-1" style={{ background: "var(--bg-soft)", border: "1px solid var(--border)", borderRadius: 10, padding: "6px 8px" }}>
            <button className="btn btn-ghost btn-icon" aria-label="Previous week" onClick={() => setWeekStart(shiftWeek(weekStart, -1))}><Icon name="chevron-left" size={16} /></button>
            <span className="text-sm fw-semibold mono" style={{ minWidth: 150, textAlign: "center" }}>{weekLabel(weekStart)}</span>
            <button className="btn btn-ghost btn-icon" aria-label="Next week" onClick={() => setWeekStart(shiftWeek(weekStart, 1))}><Icon name="chevron-right" size={16} /></button>
          </div>
        )}

        {periodType === "month" && (
          <div className="flex items-center gap-1" style={{ background: "var(--bg-soft)", border: "1px solid var(--border)", borderRadius: 10, padding: "6px 8px" }}>
            <button
              className="btn btn-ghost btn-icon" aria-label="Previous month"
              onClick={() => { const shifted = shiftMonthKey(monthKeyFor(selectedYear, selectedMonth), -1); const { year, monthIndex } = parseMonthKey(shifted); setSelectedMonthYear(year, monthIndex); }}
            >
              <Icon name="chevron-left" size={16} />
            </button>
            <select className="select mono" style={{ width: "auto" }} value={selectedMonth} onChange={(e) => setSelectedMonthYear(selectedYear, Number(e.target.value))}>
              {MONTH_NAMES.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <select className="select mono" style={{ width: "auto" }} value={selectedYear} onChange={(e) => setSelectedMonthYear(Number(e.target.value), selectedMonth)}>
              {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <button
              className="btn btn-ghost btn-icon" aria-label="Next month"
              onClick={() => { const shifted = shiftMonthKey(monthKeyFor(selectedYear, selectedMonth), 1); const { year, monthIndex } = parseMonthKey(shifted); setSelectedMonthYear(year, monthIndex); }}
            >
              <Icon name="chevron-right" size={16} />
            </button>
          </div>
        )}

        {periodType === "year" && (
          <div className="flex items-center gap-1" style={{ background: "var(--bg-soft)", border: "1px solid var(--border)", borderRadius: 10, padding: "6px 8px" }}>
            <button className="btn btn-ghost btn-icon" aria-label="Previous year" onClick={() => setYearOnly(yearOnly - 1)}><Icon name="chevron-left" size={16} /></button>
            <select className="select mono" style={{ width: "auto" }} value={yearOnly} onChange={(e) => setYearOnly(Number(e.target.value))}>
              {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <button className="btn btn-ghost btn-icon" aria-label="Next year" onClick={() => setYearOnly(yearOnly + 1)}><Icon name="chevron-right" size={16} /></button>
          </div>
        )}

        <select className="select mono" style={{ width: "auto" }} value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} aria-label="Category filter">
          <option value="all">All Categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        {!isCurrentPeriod && <button className="btn btn-secondary btn-sm" onClick={onCurrentPeriod}>Current Period</button>}
      </div>
    </div>
  );
}

export { monthKeyLabel };
