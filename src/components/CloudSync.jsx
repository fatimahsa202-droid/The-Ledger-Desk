import React, { useState } from "react";
import { Icon } from "../lib/Icon.jsx";
import { Card, Pill } from "./primitives.jsx";
import { useCloudSync } from "../store/CloudSyncProvider.jsx";
import { getStoredConnection } from "../lib/cloud/supabaseClient.js";
import { relativeTime } from "../lib/format.js";

const STATUS_META = {
  disconnected: { label: "Local only", tone: "outline", icon: "cloud" },
  connecting: { label: "Connecting…", tone: "amber", icon: "refresh-cw" },
  synced: { label: "Synced", tone: "green", icon: "cloud" },
  syncing: { label: "Syncing…", tone: "amber", icon: "refresh-cw" },
  offline: { label: "Offline", tone: "amber", icon: "plug" },
  error: { label: "Sync error", tone: "rust", icon: "triangle-alert" },
};

/** Small topbar indicator — the one UI addition allowed outside Settings. */
export function SyncStatusPill({ navigate }) {
  const { diagnostics } = useCloudSync();
  const meta = STATUS_META[diagnostics.status] || STATUS_META.disconnected;
  const label =
    diagnostics.status === "offline" && diagnostics.pendingOutboxCount > 0
      ? `Offline — ${diagnostics.pendingOutboxCount} pending`
      : meta.label;

  return (
    <button
      className="btn btn-ghost btn-sm"
      onClick={() => navigate("settings")}
      data-tip={diagnostics.status === "synced" && diagnostics.lastSuccessfulSync ? `Last synced ${relativeTime(diagnostics.lastSuccessfulSync)}` : "Cloud Sync"}
      style={{ padding: 0, background: "none", border: "none" }}
    >
      <Pill tone={meta.tone === "outline" ? "accent" : meta.tone} outline={meta.tone === "outline"} icon={meta.icon}>
        {label}
      </Pill>
    </button>
  );
}

function DiagnosticsPanel({ diagnostics, onReconcile, onFlush }) {
  const [open, setOpen] = useState(false);
  const rows = [
    ["Status", diagnostics.status],
    ["Realtime", diagnostics.realtimeState],
    ["Last successful sync", diagnostics.lastSuccessfulSync ? relativeTime(diagnostics.lastSuccessfulSync) : "never"],
    ["Last successful write", diagnostics.lastSuccessfulWrite ? relativeTime(diagnostics.lastSuccessfulWrite) : "never"],
    ["Last reconcile attempt", diagnostics.lastReconciliationFetch ? relativeTime(diagnostics.lastReconciliationFetch) : "never"],
    ["Pending writes (outbox)", diagnostics.pendingOutboxCount],
    ["Failed writes (parked)", diagnostics.failedWriteCount],
    ["Last error", diagnostics.lastError || "—"],
  ];

  return (
    <div className="mt-4" style={{ borderTop: "1px solid var(--border)", paddingTop: 14 }}>
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => setOpen((o) => !o)}
        style={{ padding: 0, background: "none", border: "none" }}
      >
        <Icon name={open ? "chevron-up" : "chevron-down"} size={14} /> Sync Diagnostics
      </button>
      {open && (
        <div className="mt-3">
          <div className="grid grid-cols-2 gap-2 text-sm mb-3">
            {rows.map(([label, value]) => (
              <React.Fragment key={label}>
                <div className="dim">{label}</div>
                <div className="mono truncate" title={String(value)}>{String(value)}</div>
              </React.Fragment>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap mb-3">
            <button className="btn btn-secondary btn-sm" onClick={onReconcile}><Icon name="refresh-cw" size={13} /> Reconcile now</button>
            <button className="btn btn-secondary btn-sm" onClick={onFlush}><Icon name="upload" size={13} /> Flush pending writes</button>
          </div>
          {diagnostics.events.length > 0 && (
            <div style={{ maxHeight: 180, overflowY: "auto", background: "var(--bg-soft)", border: "1px solid var(--border)", borderRadius: 8, padding: 8 }}>
              {diagnostics.events.map((ev) => (
                <div key={ev.id} className="text-xs mono mb-1" style={{ color: ev.level === "error" ? "var(--rust)" : ev.level === "warn" ? "var(--amber)" : "var(--muted)" }}>
                  {new Date(ev.ts).toLocaleTimeString()} — {ev.message}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function CloudConnectionsCard() {
  const cloud = useCloudSync();
  const { diagnostics } = cloud;
  const stored = getStoredConnection();
  const [url, setUrl] = useState(stored?.url || "");
  const [anonKey, setAnonKey] = useState(stored?.anonKey || "");
  const [email, setEmail] = useState(diagnostics.connectedEmail || "");
  const [pastedLink, setPastedLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [codeRequested, setCodeRequested] = useState(false);

  const strategy = cloud.authStrategy;
  const signedIn = cloud.isConnected;
  const projectConnected = diagnostics.status !== "disconnected" || !!stored;

  const handleConnect = async () => {
    setBusy(true);
    setMsg("");
    const result = await cloud.connect(url.trim(), anonKey.trim());
    if (!result.ok) setMsg(result.error === "invalid-connection" ? "That doesn't look like a valid Supabase Project URL / anon key." : result.error || "Could not connect.");
    setBusy(false);
  };

  const handleDisconnect = () => {
    if (!window.confirm("Disconnect Cloud Sync on this device? Your data stays in Supabase and on this device — nothing is deleted.")) return;
    cloud.disconnect();
    setCodeRequested(false);
    setMsg("");
  };

  const handleRequestCode = async () => {
    setBusy(true);
    setMsg("");
    const result = await cloud.requestSignInEmail(email.trim());
    setBusy(false);
    if (!result.ok) setMsg(result.error || "Could not send the sign-in email.");
    else setCodeRequested(true);
  };

  const handleCompleteSignIn = async () => {
    setBusy(true);
    setMsg("");
    const result = await cloud.completeSignIn(pastedLink.trim());
    setBusy(false);
    if (!result.ok) setMsg(result.error || "Could not verify that link.");
    else setPastedLink("");
  };

  return (
    <Card className="mb-5">
      <div className="eyebrow mb-1">Cloud Sync</div>
      <p className="text-sm dim mb-3">
        Keep every category, timer, note, and achievement in sync across your devices via Supabase. Your Project URL and anon key are
        stored only on this device — never sent anywhere except your own Supabase project.
      </p>

      {!projectConnected && (
        <>
          <div className="grid grid-cols-1 gap-2 mb-3">
            <div>
              <label className="field-label" htmlFor="sb-url">Supabase Project URL</label>
              <input id="sb-url" className="input mono" placeholder="https://xxxx.supabase.co" value={url} onChange={(e) => setUrl(e.target.value)} />
            </div>
            <div>
              <label className="field-label" htmlFor="sb-key">Supabase anon (public) key</label>
              <input id="sb-key" className="input mono" placeholder="eyJhbGciOi..." value={anonKey} onChange={(e) => setAnonKey(e.target.value)} />
            </div>
          </div>
          <button className="btn btn-primary btn-sm" disabled={busy || !url.trim() || !anonKey.trim()} onClick={handleConnect}>
            <Icon name="plug" size={14} /> Connect
          </button>
        </>
      )}

      {projectConnected && !signedIn && (
        <>
          <div className="text-sm dim mb-3">{strategy.instructions}</div>
          <div className="flex gap-2 flex-wrap mb-2">
            <input className="input" style={{ minWidth: 220 }} type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="btn btn-secondary btn-sm" disabled={busy || !email.trim()} onClick={handleRequestCode}>
              <Icon name="mail" size={14} /> Send sign-in link
            </button>
          </div>
          {codeRequested && strategy.needsManualInput && (
            <div className="flex gap-2 flex-wrap mt-2">
              <input className="input mono flex-1" style={{ minWidth: 220 }} placeholder="Paste the sign-in link here" value={pastedLink} onChange={(e) => setPastedLink(e.target.value)} />
              <button className="btn btn-secondary btn-sm" disabled={busy || !pastedLink.trim()} onClick={handleCompleteSignIn}>
                <Icon name="key" size={14} /> Verify
              </button>
            </div>
          )}
          {codeRequested && !strategy.needsManualInput && (
            <div className="text-xs mt-2" style={{ color: "var(--accent-3)" }}>Check your email — clicking the link will bring you back here signed in.</div>
          )}
          <div className="mt-3">
            <button className="btn btn-ghost btn-sm" onClick={handleDisconnect} style={{ padding: 0, background: "none", border: "none" }}>
              Use a different Supabase project
            </button>
          </div>
        </>
      )}

      {signedIn && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
            <div className="flex items-center gap-2 text-sm">
              <Icon name="shield-check" size={15} style={{ color: "var(--green)" }} />
              Signed in as <span className="fw-semibold">{diagnostics.connectedEmail}</span>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={handleDisconnect}>
              <Icon name="circle-x" size={14} /> Disconnect
            </button>
          </div>
          <DiagnosticsPanel diagnostics={diagnostics} onReconcile={() => cloud.reconcileNow("manual")} onFlush={() => cloud.flushOutboxNow()} />
        </>
      )}

      {msg && <div className="text-xs mt-3" style={{ color: "var(--rust)" }}>{msg}</div>}
    </Card>
  );
}
