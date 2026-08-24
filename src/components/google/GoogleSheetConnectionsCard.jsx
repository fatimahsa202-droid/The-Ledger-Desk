import React, { useEffect, useState } from "react";
import { Icon } from "../../lib/Icon.jsx";
import { Card, Pill } from "../primitives.jsx";
import { useCloudSync } from "../../store/CloudSyncProvider.jsx";
import { relativeTime } from "../../lib/format.js";
import { listConnections, disconnectConnection, triggerSync } from "../../lib/google/sheetConnectionsApi.js";
import { ConnectSheetWizard } from "./ConnectSheetWizard.jsx";

const STATE_META = {
  idle: { label: "Connected", tone: "green" },
  syncing: { label: "Syncing…", tone: "amber" },
  error: { label: "Sync error", tone: "rust" },
  id_column_missing: { label: "Needs attention", tone: "rust" },
  reauth_required: { label: "Reconnect needed", tone: "rust" },
  pending_setup: { label: "Setup incomplete", tone: "amber" },
};

function ConnectionRow({ conn, onChange }) {
  const [busy, setBusy] = useState(false);
  const meta = STATE_META[conn.sync_state] || STATE_META.idle;

  const handleSync = async () => {
    setBusy(true);
    try {
      await triggerSync(conn.id);
    } catch (err) {
      // triggerSync's own error is descriptive enough (e.g. "sheets-sync not deployed yet"); the row's own sync_state/last_sync_error, refreshed below, is the durable record — no separate toast needed here.
      console.warn("Sync now failed:", err.message);
    } finally {
      await onChange();
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setBusy(true);
    await disconnectConnection(conn.id);
    await onChange();
    setBusy(false);
  };

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap" style={{ padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
      <div className="min-w-0">
        <div className="text-sm fw-semibold truncate">{conn.display_name || conn.spreadsheet_name}</div>
        <div className="text-xs muted mt-0.5">
          {conn.last_synced_at ? `Last synced ${relativeTime(new Date(conn.last_synced_at).getTime())}` : "Not synced yet"}
        </div>
        {conn.sync_state === "id_column_missing" && (
          <div className="text-xs mt-1" style={{ color: "var(--rust)" }}>The identity column Ledger Desk created was removed from the Sheet — reconnect to restore it before this Sheet can sync again.</div>
        )}
        {conn.sync_state === "reauth_required" && (
          <div className="text-xs mt-1" style={{ color: "var(--rust)" }}>Google access needs to be renewed — disconnect and reconnect this Sheet.</div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Pill tone={meta.tone} outline={meta.tone !== "green"}>{meta.label}</Pill>
        <button className="btn btn-secondary btn-sm" onClick={handleSync} disabled={busy}>Sync now</button>
        <button className="btn btn-ghost btn-sm" onClick={handleDisconnect} disabled={busy}>Disconnect</button>
      </div>
    </div>
  );
}

export function GoogleSheetConnectionsCard() {
  const { diagnostics } = useCloudSync();
  const cloudReady = Boolean(diagnostics.connectedEmail);
  const [connections, setConnections] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showWizard, setShowWizard] = useState(false);

  const refresh = async () => {
    if (!cloudReady) return;
    const rows = await listConnections().catch(() => []);
    setConnections(rows);
    setLoaded(true);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudReady]);

  return (
    <Card className="mb-5">
      <div className="flex items-center justify-between mb-1">
        <div className="eyebrow">Connected Sheets</div>
        {cloudReady && (
          <button className="btn btn-secondary btn-sm" onClick={() => setShowWizard(true)}>
            <Icon name="plus" size={13} /> Connect Google Sheet
          </button>
        )}
      </div>
      <p className="text-xs dim mb-3">Scheduled Names imported from a Google Sheet you choose, shown alongside Accounting Tasks and Work Activity on the Calendar.</p>

      {!cloudReady && <div className="text-sm dim">Connect Cloud Sync above first — Scheduled Names need an account to belong to.</div>}

      {cloudReady && loaded && connections.length === 0 && <div className="text-sm dim">No Sheet connected yet.</div>}

      {cloudReady && connections.map((c) => <ConnectionRow key={c.id} conn={c} onChange={refresh} />)}

      {showWizard && (
        <ConnectSheetWizard
          onClose={() => setShowWizard(false)}
          onConnected={async () => {
            setShowWizard(false);
            await refresh();
          }}
        />
      )}
    </Card>
  );
}
