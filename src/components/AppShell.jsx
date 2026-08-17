import React, { useState } from "react";
import { Icon } from "../lib/Icon.jsx";
import { NAV_SECTIONS, BOTTOM_NAV_ITEMS } from "../lib/nav.js";
import { LevelAvatar } from "./primitives.jsx";
import { levelInfo, levelTitle, levelRankTier, xpProgressPercent } from "../lib/gamification.js";
import { useAppData } from "../store/AppDataProvider.jsx";

export function AppShell({ page, navigate, onOpenPalette, children }) {
  const { game } = useAppData();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const info = levelInfo(game.xp);
  const tier = levelRankTier(info.level);

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="app-shell">
      {sidebarOpen && <div className="sidebar-scrim" onClick={closeSidebar} />}
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`} aria-label="Primary navigation">
        <div className="brand">
          <div className="brand-mark"><Icon name="book-open" size={18} /></div>
          <div>
            <div className="brand-name">The Ledger Desk</div>
            <div className="brand-sub">Reconciliation &amp; Close</div>
          </div>
        </div>

        <nav style={{ overflowY: "auto", flex: 1 }}>
          {NAV_SECTIONS.map((section, si) => (
            <div className="nav-group" key={si}>
              {section.label && <div className="nav-group-label eyebrow">{section.label}</div>}
              {section.items.map((item) => (
                <button
                  key={item.id}
                  className={`nav-item ${page === item.id ? "active" : ""}`}
                  onClick={() => { navigate(item.id); closeSidebar(); }}
                  aria-current={page === item.id ? "page" : undefined}
                >
                  <Icon name={item.icon} size={16} className="icon" />
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="w-full flex items-center gap-3" style={{ background: "none", border: "none", padding: "6px 4px", textAlign: "left" }} onClick={() => { navigate("achievements"); closeSidebar(); }}>
            <LevelAvatar level={info.level} tier={tier} size={40} />
            <div className="min-w-0 flex-1">
              <div className="text-sm fw-semibold truncate">{levelTitle(info.level)}</div>
              <div className="progress-track thin mt-1"><div className="progress-fill" style={{ width: `${xpProgressPercent(game.xp)}%` }} /></div>
            </div>
          </button>
        </div>
      </aside>

      <div className="main-col">
        <header className="topbar">
          <button className="btn btn-ghost btn-icon menu-btn" aria-label="Open menu" onClick={() => setSidebarOpen(true)}>
            <Icon name="menu" size={18} />
          </button>
          <div className="flex-1" />
          <button className="btn btn-secondary btn-sm" onClick={onOpenPalette} data-tip="Quick jump">
            <Icon name="search" size={14} />
            <span className="hide-xs">Search</span>
            <span className="kbd">⌘K</span>
          </button>
          <div className="flex items-center gap-1.5 text-sm fw-semibold" style={{ color: game.streak > 0 ? "var(--amber)" : "var(--muted)" }}>
            <Icon name="flame" size={16} />
            {game.streak > 0 ? `${game.streak}d` : "0d"}
          </div>
        </header>

        <main id="main-content" className="page">
          {children}
        </main>
      </div>

      <nav className="bottom-nav" aria-label="Primary navigation">
        {BOTTOM_NAV_ITEMS.map((item) => (
          <button key={item.id} className={`bottom-nav-item ${page === item.id ? "active" : ""}`} onClick={() => navigate(item.id)} aria-current={page === item.id ? "page" : undefined}>
            <Icon name={item.icon} size={19} />
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
