import React, { useState, useMemo } from "react";
import { useAppData } from "../store/AppDataProvider.jsx";
import { CURRENT_MONTH_KEY } from "../lib/format.js";
import { PeriodHeader } from "../components/dashboard/PeriodHeader.jsx";
import { TodayPanel } from "../components/dashboard/TodayPanel.jsx";
import { WeekPanel } from "../components/dashboard/WeekPanel.jsx";
import { MonthPanel } from "../components/dashboard/MonthPanel.jsx";
import { YearPanel } from "../components/dashboard/YearPanel.jsx";
import { startOfWeekSunday, weekKey } from "../lib/weekNav.js";
import { monthKeyFor } from "../lib/monthNav.js";

export function Dashboard({ navigate, onSelectTask }) {
  const { effectiveCategories } = useAppData();
  const now = Date.now();

  const currentYear = new Date().getFullYear();
  const currentMonthIdx = new Date().getMonth();

  const [periodType, setPeriodType] = useState("today");
  const [weekStart, setWeekStart] = useState(() => startOfWeekSunday(now));
  const [selectedMonth, setSelectedMonth] = useState(currentMonthIdx);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [yearOnly, setYearOnly] = useState(currentYear);
  const [selectedCategory, setSelectedCategory] = useState("all");

  const monthKey = monthKeyFor(selectedYear, selectedMonth);
  const monthStart = useMemo(() => new Date(selectedYear, selectedMonth, 1).getTime(), [selectedYear, selectedMonth]);
  const monthEnd = useMemo(() => new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59, 999).getTime(), [selectedYear, selectedMonth]);
  const dayStart = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }, [now]); // eslint-disable-line react-hooks/exhaustive-deps
  const dayEnd = useMemo(() => { const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime(); }, [now]); // eslint-disable-line react-hooks/exhaustive-deps

  const isCurrentPeriod =
    periodType === "today" ||
    (periodType === "week" && weekKey(weekStart) === weekKey(startOfWeekSunday(now))) ||
    (periodType === "month" && monthKey === CURRENT_MONTH_KEY) ||
    (periodType === "year" && yearOnly === currentYear);

  const goToCurrentPeriod = () => {
    setWeekStart(startOfWeekSunday(now));
    setSelectedMonth(currentMonthIdx);
    setSelectedYear(currentYear);
    setYearOnly(currentYear);
  };

  return (
    <div>
      <PeriodHeader
        periodType={periodType} setPeriodType={setPeriodType}
        weekStart={weekStart} setWeekStart={setWeekStart}
        selectedMonth={selectedMonth} selectedYear={selectedYear}
        setSelectedMonthYear={(y, m) => { setSelectedYear(y); setSelectedMonth(m); }}
        yearOnly={yearOnly} setYearOnly={setYearOnly}
        selectedCategory={selectedCategory} setSelectedCategory={setSelectedCategory}
        categories={effectiveCategories}
        isCurrentPeriod={isCurrentPeriod} onCurrentPeriod={goToCurrentPeriod}
        currentYear={currentYear}
      />

      {periodType === "today" && (
        <TodayPanel navigate={navigate} selectedCategory={selectedCategory} dayStart={dayStart} dayEnd={dayEnd} now={now} />
      )}
      {periodType === "week" && (
        <WeekPanel selectedCategory={selectedCategory} weekStart={weekStart} now={now} />
      )}
      {periodType === "month" && (
        <MonthPanel selectedCategory={selectedCategory} monthKey={monthKey} currentMonthKey={CURRENT_MONTH_KEY} monthStart={monthStart} monthEnd={monthEnd} now={now} />
      )}
      {periodType === "year" && (
        <YearPanel selectedCategory={selectedCategory} year={yearOnly} currentMonthKey={CURRENT_MONTH_KEY} now={now} />
      )}
    </div>
  );
}
