import React, { useState, useMemo, useEffect, useRef } from "react";
import { Icon } from "../lib/Icon.jsx";
import { NAV_ITEMS } from "../lib/nav.js";
import { useAppData } from "../store/AppDataProvider.jsx";

export function CommandPalette({ open, onClose, onNavigate, onSelectTask }) {
  const { effectiveCategories } = useAppData();
  // Live task library (built-in + user-created + renamed/re-categorized),
  // not the frozen ALL_TASKS constant — otherwise a task created or edited
  // via Manage Tasks is invisible to ⌘K even though it's fully usable on
  // the Task Board.
  const allTasks = useMemo(() => effectiveCategories.flatMap((c) => c.tasks), [effectiveCategories]);
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pages = NAV_ITEMS.filter((n) => !q || n.label.toLowerCase().includes(q)).map((n) => ({
      kind: "page",
      id: n.id,
      label: n.label,
      icon: n.icon,
    }));
    const tasks = q
      ? allTasks.filter((t) => t.name.toLowerCase().includes(q) || t.categoryName.toLowerCase().includes(q)).slice(0, 8).map((t) => ({
          kind: "task",
          id: t.id,
          label: t.name,
          sub: t.categoryName,
          icon: "clipboard-list",
        }))
      : [];
    return [...pages.slice(0, q ? 4 : 8), ...tasks];
  }, [query, allTasks]);

  const [activeIdx, setActiveIdx] = useState(0);
  useEffect(() => setActiveIdx(0), [query]);

  if (!open) return null;

  const choose = (item) => {
    if (item.kind === "page") onNavigate(item.id);
    else onSelectTask(item.id);
    onClose();
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (results[activeIdx]) choose(results[activeIdx]); }
    else if (e.key === "Escape") onClose();
  };

  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="modal">
        <div className="modal-panel command-palette" role="dialog" aria-modal="true" aria-label="Quick jump">
          <div className="flex items-center gap-2" style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
            <Icon name="search" size={16} className="muted" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Jump to a page or task..."
              className="input"
              style={{ border: "none", background: "none", padding: 0 }}
              aria-label="Search"
            />
            <span className="kbd">esc</span>
          </div>
          <div style={{ maxHeight: 360, overflowY: "auto", padding: 6 }}>
            {results.length === 0 && <div className="text-sm muted" style={{ padding: 16 }}>No matches.</div>}
            {results.map((item, i) => (
              <button
                key={item.kind + item.id}
                onClick={() => choose(item)}
                onMouseEnter={() => setActiveIdx(i)}
                className="w-full flex items-center gap-3 text-left text-sm"
                style={{
                  padding: "10px 12px", borderRadius: 10, border: "none",
                  background: i === activeIdx ? "var(--panel-hover)" : "transparent", color: "var(--ink)",
                }}
              >
                <Icon name={item.icon} size={15} className="muted shrink-0" />
                <span className="truncate flex-1">{item.label}</span>
                {item.sub && <span className="text-xs muted shrink-0">{item.sub}</span>}
                {item.kind === "page" && <span className="text-xs muted shrink-0">Go to</span>}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
