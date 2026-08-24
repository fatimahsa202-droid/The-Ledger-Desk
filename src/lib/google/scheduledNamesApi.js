import { getClient } from "../cloud/supabaseClient.js";

function requireClient() {
  const client = getClient();
  if (!client) throw new Error("Cloud Sync isn't connected.");
  return client;
}

/** Active Scheduled Names whose scheduled_date falls within [fromDateStr, toDateStr] ("YYYY-MM-DD"), for the signed-in user (RLS-scoped). Returns [] if Cloud Sync isn't connected, rather than throwing — Calendar should render normally for a user who never connected a Sheet. */
export async function fetchScheduledNamesInRange(fromDateStr, toDateStr) {
  const client = getClient();
  if (!client) return [];
  const { data, error } = await client
    .from("scheduled_names")
    .select("*")
    .eq("source_status", "active")
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
