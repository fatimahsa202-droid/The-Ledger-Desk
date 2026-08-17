export const NAV_SECTIONS = [
  {
    label: "Overview",
    items: [
      { id: "dashboard", label: "Dashboard", icon: "layout-dashboard" },
      { id: "calendar", label: "Calendar", icon: "calendar-days" },
      { id: "timeline", label: "Timeline", icon: "activity" },
    ],
  },
  {
    label: "Workspace",
    items: [
      { id: "categories", label: "Categories", icon: "clipboard-list" },
      { id: "migration", label: "Data Migration", icon: "languages" },
    ],
  },
  {
    label: "Insights",
    items: [
      { id: "analytics", label: "Analytics", icon: "bar-chart-3" },
      { id: "achievements", label: "Achievements", icon: "trophy" },
      { id: "reports", label: "Reports", icon: "file-text" },
      { id: "history", label: "Recent Activity", icon: "history" },
    ],
  },
  {
    label: "",
    items: [{ id: "settings", label: "Settings", icon: "settings" }],
  },
];

export const NAV_ITEMS = NAV_SECTIONS.flatMap((s) => s.items);

export const BOTTOM_NAV_ITEMS = [
  { id: "dashboard", label: "Home", icon: "layout-dashboard" },
  { id: "categories", label: "Tasks", icon: "clipboard-list" },
  { id: "timeline", label: "Timeline", icon: "activity" },
  { id: "achievements", label: "Awards", icon: "trophy" },
  { id: "settings", label: "More", icon: "settings" },
];
