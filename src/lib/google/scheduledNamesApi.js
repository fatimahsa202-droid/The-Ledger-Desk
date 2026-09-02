import { getClient } from "../cloud/supabaseClient.js";

function requireClient() {
  const client = getClient();
  if (!client) throw new Error("Cloud Sync isn't connected.");
  return client;
}

/**
 * Active Scheduled Names whose scheduled_date falls within [fromDateStr,
 * toDateStr] ("YYYY-MM-DD"), for the signed-in user (RLS-scoped). Returns []
 * if Cloud Sync isn't connected, rather than throwing — Calendar should
 * render normally for a user who never connected a Sheet.
 *
 * Never trusts source_status alone: a row can be stuck at 'active' even
 * after its owning connection is disconnected (e.g. any connection that was
 * disconnected before this guard existed, or one deactivated as a losing
 * duplicate). This is the read-side half of the "inactive connection can
 * never appear in Calendar" invariant — the defense-in-depth partner to
 * disconnectConnection() marking rows 'removed' on the write side. Even if
 * a row is somehow still 'active' in the DB, this filter keeps it off
 * Calendar unconditionally.
 */
export async function fetchScheduledNamesInRange(fromDateStr, toDateStr) {
  const client = getClient();
  if (!client) return [];
  const { data: activeConns, error: connErr } = await client
    .from("sheet_connections")
    .select("id")
    .eq("is_active", true);
  if (connErr) throw new Error(connErr.message);
  const activeConnIds = (activeConns || []).map((c) => c.id);
  if (activeConnIds.length === 0) return []; // no active connections -- nothing can legitimately be on Calendar; also sidesteps ambiguous empty-.in() behavior below
  const { data, error } = await client
    .from("scheduled_names")
    .select("*")
    .eq("source_status", "active")
    .in("connection_id", activeConnIds)
    .gte("scheduled_date", fromDateStr)
    .lte("scheduled_date", toDateStr);
  if (error) throw new Error(error.message);
  return data || [];
}

/** Ledger-Desk-owned completion write — never touches the source Sheet, never touched by sync. */
export async function setScheduledNameStatus(id, status) {
  const client = requireClient();
  const { error } = await client
    .from("scheduled_names")
    .update({ status, completed_at: status === "done" ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Live updates across devices/tabs — scheduled_names is already in the supabase_realtime publication. Returns an unsubscribe function; a no-op subscription if Cloud Sync isn't connected. */
export function subscribeToScheduledNamesChanges(onChange) {
  const client = getClient();
  if (!client) return () => {};
  const channel = client
    .channel("scheduled_names_changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "scheduled_names" }, () => onChange())
    .subscribe();
  return () => client.removeChannel(channel);
}
