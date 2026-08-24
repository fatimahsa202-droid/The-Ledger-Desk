import { useEffect, useRef } from "react";
import { useCloudSync } from "../store/CloudSyncProvider.jsx";
import { listConnections, triggerSync } from "../lib/google/sheetConnectionsApi.js";

/**
 * How often a connection is considered due for a background catch-up
 * sync. 7 minutes: Google's Sheets API quota has no realistic pressure
 * at this scale (a handful of clinic users), so the real tradeoff is
 * just "how stale can the data get before something else (focus, a
 * fresh connect) catches it" vs. redundant Edge Function calls — 7
 * minutes is comfortably inside the 5-10 minute range without being
 * aggressive.
 */
export const SYNC_INTERVAL_MS = 7 * 60 * 1000;

function isStale(conn) {
  if (!conn.last_synced_at) return true;
  return Date.now() - new Date(conn.last_synced_at).getTime() > SYNC_INTERVAL_MS;
}

/**
 * Drives Sync now's manual trigger automatically: on sign-in/app load, on
 * window focus / tab visibility (the common "I just edited the Sheet,
 * switched back to Ledger Desk" case), and periodically while the app
 * stays open. Sync now itself is untouched — this only adds triggers
 * that call the exact same triggerSync().
 *
 * Duplicate/overlapping-request safety:
 *  - Same-tab: inFlight tracks connection ids currently syncing in THIS
 *    tab, so a focus event firing moments after the periodic timer (or
 *    Calendar and Settings both mounting the trigger) can't fire twice
 *    for the same connection.
 *  - Cross-tab/cross-device: sheets-sync itself now rejects a request
 *    for a connection whose sync_state is already 'syncing' and whose
 *    updated_at is recent (see the Edge Function) — so two devices
 *    triggering near-simultaneously can't run two Google reads/writes
 *    concurrently against the same connection. Even without that guard,
 *    scheduled_names is written by id-keyed upsert (never insert), so
 *    concurrent writes for the same row just overwrite name/date
 *    harmlessly — never a duplicate row, and status/completed_at are
 *    never part of that write path at all.
 */
export function useScheduledNamesAutoSync() {
  const { diagnostics } = useCloudSync();
  const signedIn = Boolean(diagnostics.connectedEmail);
  const inFlight = useRef(new Set());

  useEffect(() => {
    if (!signedIn) return undefined;

    const syncStaleConnections = async () => {
      let connections;
      try {
        connections = await listConnections();
      } catch {
        return; // e.g. offline — try again on the next trigger, never treated as "nothing to sync"
      }
      for (const conn of connections) {
        if (conn.sync_state === "pending_setup") continue;
        if (inFlight.current.has(conn.id)) continue;
        if (!isStale(conn)) continue;
        inFlight.current.add(conn.id);
        triggerSync(conn.id).catch(() => {}).finally(() => inFlight.current.delete(conn.id));
      }
    };

    syncStaleConnections(); // on sign-in / app load

    const onFocus = () => syncStaleConnections();
    const onVisibility = () => { if (document.visibilityState === "visible") syncStaleConnections(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    const interval = setInterval(syncStaleConnections, SYNC_INTERVAL_MS);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(interval);
    };
  }, [signedIn]);
}
