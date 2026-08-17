import React, { useRef, useState } from "react";
import { Icon } from "../lib/Icon.jsx";
import { Card } from "../components/primitives.jsx";
import { useAppData } from "../store/AppDataProvider.jsx";
import { ACCENT_UNLOCKS } from "../store/defaults.js";
import { levelInfo } from "../lib/gamification.js";
import { storage, STORAGE_KEYS, exportAllData } from "../lib/storage.js";
import { downloadTextFile } from "../lib/exportCsv.js";

export function Settings({ notifications }) {
  const { settings, setSettings, game, monthlyData, migration, favorites, pinned } = useAppData();
  const fileRef = useRef(null);
  const [importMsg, setImportMsg] = useState("");
  const level = levelInfo(game.xp).level;

  const patch = (p) => setSettings((prev) => ({ ...prev, ...p }));

  const accentUnlocked = (key) => {
    const req = ACCENT_UNLOCKS[key].requires;
    if (!req) return true;
    if (req.type === "level") return level >= req.value;
    if (req.type === "badge") return game.badges.includes(req.value);
    return false;
  };

  const exportData = () => {
    const snapshot = { monthlyData, migration, game, settings, favorites, pinned };
    downloadTextFile(`ledger-desk-backup-${new Date().toISOString().slice(0, 10)}.json`, exportAllData(snapshot), "application/json");
  };

  const importData = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data.monthlyData) await storage.set(STORAGE_KEYS.monthlyData, data.monthlyData);
      if (data.migration) await storage.set(STORAGE_KEYS.migration, data.migration);
      if (data.game) await storage.set(STORAGE_KEYS.gamification, data.game);
      if (data.settings) await storage.set(STORAGE_KEYS.settings, data.settings);
      setImportMsg("Imported — reload the page to see your restored data.");
    } catch {
      setImportMsg("That file couldn't be read as a Ledger Desk backup.");
    }
    e.target.value = "";
  };

  const resetAll = async () => {
    if (!window.confirm("This clears every reconciliation, timer, and achievement stored on this device. This cannot be undone. Continue?")) return;
    await Promise.all(Object.values(STORAGE_KEYS).map((k) => storage.remove(k)));
    window.location.reload();
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Configuration</div>
          <h1 className="page-title mt-1">Settings</h1>
          <p className="page-sub">Personalize the experience — none of this touches your accounting data.</p>
        </div>
      </div>

      <Card className="mb-5">
        <div className="eyebrow mb-3">Appearance</div>
        <div className="field-label">Theme</div>
        <div className="segmented mb-4">
          {[["dark", "Dark"], ["light", "Light"], ["system", "System"]].map(([id, label]) => (
            <button key={id} className={settings.theme === id ? "active" : ""} onClick={() => patch({ theme: id })}>{label}</button>
          ))}
        </div>
        <div className="field-label">Accent</div>
        <div className="flex gap-2 flex-wrap">
          {Object.entries(ACCENT_UNLOCKS).map(([key, meta]) => {
            const unlocked = accentUnlocked(key);
            return (
              <button
                key={key}
                disabled={!unlocked}
                onClick={() => unlocked && patch({ accent: key })}
                className="tag-chip"
                style={settings.accent === key ? { borderColor: "var(--accent-1)", color: "var(--ink)", background: "var(--panel-hover)" } : undefined}
                data-tip={unlocked ? undefined : meta.requires?.type === "level" ? `Unlocks at level ${meta.requires.value}` : `Unlocks with a badge`}
              >
                {!unlocked && <Icon name="lock" size={12} />}
                {meta.label}
              </button>
            );
          })}
        </div>
        <div className="checkbox-row mt-4">
          <input id="reduce-motion" type="checkbox" checked={settings.reduceMotion} onChange={(e) => patch({ reduceMotion: e.target.checked })} />
          <label htmlFor="reduce-motion" className="text-sm">Reduce motion (disables animations &amp; confetti)</label>
        </div>
      </Card>

      <Card className="mb-5">
        <div className="eyebrow mb-3">Sound &amp; Notifications</div>
        <div className="checkbox-row">
          <input id="sound" type="checkbox" checked={settings.soundEnabled} onChange={(e) => patch({ soundEnabled: e.target.checked })} />
          <label htmlFor="sound" className="text-sm">Play sounds for level-ups, badges, and completions</label>
        </div>
        <div className="checkbox-row">
          <input
            id="notif"
            type="checkbox"
            checked={settings.notificationsEnabled}
            onChange={async (e) => {
              if (e.target.checked) await notifications?.requestPermission();
              patch({ notificationsEnabled: e.target.checked });
            }}
          />
          <label htmlFor="notif" className="text-sm">Browser reminders for streaks &amp; daily goals (this tab only — not push)</label>
        </div>
      </Card>

      <Card className="mb-5">
        <div className="eyebrow mb-3">Monthly Close</div>
        <div className="grid grid-cols-2">
          <div>
            <label className="field-label" htmlFor="deadline">Closing deadline (day of month)</label>
            <input id="deadline" type="number" min={1} max={28} value={settings.closingDeadlineDay} onChange={(e) => patch({ closingDeadlineDay: Math.max(1, Math.min(28, Number(e.target.value) || 1)) })} className="input mono" />
          </div>
          <div>
            <label className="field-label" htmlFor="goal">Daily goal (tasks/day)</label>
            <input id="goal" type="number" min={1} max={20} value={settings.dailyGoalTasks} onChange={(e) => patch({ dailyGoalTasks: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} className="input mono" />
          </div>
        </div>
      </Card>

      <Card className="mb-5">
        <div className="eyebrow mb-3">Data &amp; Sync</div>
        <p className="text-sm dim mb-3">
          Everything is stored on this device via a small storage abstraction (see <code className="mono">src/lib/storage.js</code>). A future update can point that
          same interface at Firebase, Supabase, Appwrite, or PocketBase to sync across your laptop, phone, and iPad without changing any screen in this app.
        </p>
        <div className="flex gap-2 flex-wrap">
          <button className="btn btn-secondary" onClick={exportData}><Icon name="download" size={14} /> Export backup (JSON)</button>
          <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}><Icon name="upload" size={14} /> Import backup</button>
          <input ref={fileRef} type="file" accept="application/json" style={{ display: "none" }} onChange={importData} />
        </div>
        {importMsg && <div className="text-xs mt-2" style={{ color: "var(--accent-3)" }}>{importMsg}</div>}
      </Card>

      <Card>
        <div className="eyebrow mb-3" style={{ color: "var(--rust)" }}>Danger Zone</div>
        <p className="text-sm dim mb-3">Permanently erase all reconciliation data, timers, and gamification progress stored on this device.</p>
        <button className="btn btn-danger" onClick={resetAll}><Icon name="trash-2" size={14} /> Reset all data</button>
      </Card>
    </div>
  );
}
