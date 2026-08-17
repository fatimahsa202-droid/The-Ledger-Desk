import React, { useCallback, useState } from "react";
import { AppDataProvider, useAppData } from "./store/AppDataProvider.jsx";
import { useTheme } from "./hooks/useTheme.js";
import { useSound } from "./hooks/useSound.js";
import { useNotifications, useStreakRiskReminder } from "./hooks/useNotifications.js";
import { useHashRoute } from "./hooks/useHashRoute.js";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts.js";
import { AppShell } from "./components/AppShell.jsx";
import { Toasts } from "./components/Toasts.jsx";
import { CelebrationOverlay } from "./components/CelebrationOverlay.jsx";
import { CommandPalette } from "./components/CommandPalette.jsx";

import { Dashboard } from "./pages/Dashboard.jsx";
import { Categories } from "./pages/Categories.jsx";
import { Migration } from "./pages/Migration.jsx";
import { Timeline } from "./pages/Timeline.jsx";
import { CalendarPage } from "./pages/CalendarPage.jsx";
import { Analytics } from "./pages/Analytics.jsx";
import { Achievements } from "./pages/Achievements.jsx";
import { Reports } from "./pages/Reports.jsx";
import { History } from "./pages/History.jsx";
import { Settings } from "./pages/Settings.jsx";

const PAGES = {
  dashboard: Dashboard,
  categories: Categories,
  migration: Migration,
  timeline: Timeline,
  calendar: CalendarPage,
  analytics: Analytics,
  achievements: Achievements,
  reports: Reports,
  history: History,
  settings: Settings,
};

function Shell() {
  const data = useAppData();
  const [page, param, navigate] = useHashRoute();
  const [paletteOpen, setPaletteOpen] = useState(false);

  useTheme(data.settings.theme);
  const sound = useSound(data.settings.soundEnabled);
  const notifications = useNotifications(data.settings.notificationsEnabled);
  useStreakRiskReminder(data.settings.notificationsEnabled, { streak: data.game.streak, lastActiveDate: data.game.lastActiveDate, notify: notifications.notify });

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const selectTask = useCallback((taskId) => navigate("categories", taskId), [navigate]);

  useKeyboardShortcuts({
    "mod+k": openPalette,
    "g d": () => navigate("dashboard"),
    "g c": () => navigate("categories"),
    "g t": () => navigate("timeline"),
    "g a": () => navigate("analytics"),
    "g r": () => navigate("reports"),
    "g s": () => navigate("settings"),
    esc: () => setPaletteOpen(false),
  });

  React.useEffect(() => {
    document.documentElement.setAttribute("data-accent", data.settings.accent);
    document.documentElement.setAttribute("data-reduce-motion", String(!!data.settings.reduceMotion));
  }, [data.settings.accent, data.settings.reduceMotion]);

  const playCelebrationSound = useCallback(
    (type) => (type === "levelup" ? sound.playLevelUp() : sound.playBadge()),
    [sound]
  );

  if (!data.loaded) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--muted)" }}>
        <div className="mono text-sm">Loading the ledger…</div>
      </div>
    );
  }

  const Page = PAGES[page] || Dashboard;

  return (
    <>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <AppShell page={page} navigate={navigate} onOpenPalette={openPalette}>
        <Page navigate={navigate} initialTaskId={param} onSelectTask={selectTask} notifications={notifications} />
      </AppShell>
      <Toasts toasts={data.toasts} />
      <CelebrationOverlay celebration={data.celebration} onClose={() => data.setCelebration(null)} playSound={data.settings.soundEnabled ? playCelebrationSound : undefined} />
      <CommandPalette open={paletteOpen} onClose={closePalette} onNavigate={navigate} onSelectTask={selectTask} />
    </>
  );
}

export default function App() {
  return (
    <AppDataProvider>
      <Shell />
    </AppDataProvider>
  );
}
