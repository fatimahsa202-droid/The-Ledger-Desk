import { getClient } from "../cloud/supabaseClient.js";
import { requestGoogleAuthorizationCode, REDIRECT_URI_FOR_EXCHANGE } from "./googleAuth.js";

function requireClient() {
  const client = getClient();
  if (!client) throw new Error("Cloud Sync isn't connected — Scheduled Names needs it to know which account a Sheet connection belongs to.");
  return client;
}

/** Runs the popup consent flow, then exchanges the resulting code server-side. Returns { connectionId, accessToken, expiresAt } — never a refresh token, which stays server-only. */
export async function connectGoogleAccount() {
  const client = requireClient();
  const code = await requestGoogleAuthorizationCode();
  const { data, error } = await client.functions.invoke("google-oauth-exchange", {
    body: { code, redirectUri: REDIRECT_URI_FOR_EXCHANGE },
  });
  if (error) throw new Error(error.message || "Google authorization failed.");
  if (data?.error) throw new Error(data.error);
  return data; // { connectionId, accessToken, expiresAt }
}

/** Finishes setup for a connection created by connectGoogleAccount(): sets the real spreadsheet/tab/mapping and moves it out of pending_setup. Plain RLS-protected write — no secret involved, safe from the client. */
export async function finalizeConnection(connectionId, { displayName, spreadsheetId, spreadsheetName, sheetTab, columnMapping }) {
  const client = requireClient();
  const { error } = await client
    .from("sheet_connections")
    .update({ display_name: displayName, spreadsheet_id: spreadsheetId, spreadsheet_name: spreadsheetName, sheet_tab: sheetTab, column_mapping: columnMapping, sync_state: "idle" })
    .eq("id", connectionId);
  if (error) throw new Error(error.message);
}

/** Abandons a connection that never finished setup (e.g. the user closed the mapping step) — deletes the row and its tokens (cascade), since it never held any Scheduled Names data. */
export async function abandonPendingConnection(connectionId) {
  const client = requireClient();
  await client.from("sheet_connections").delete().eq("id", connectionId).eq("sync_state", "pending_setup");
}

export async function listConnections() {
  const client = requireClient();
  const { data, error } = await client.from("sheet_connections").select("*").eq("is_active", true).order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

/** Soft-disconnect — never deletes the connection or its Scheduled Names history, just stops it from syncing further. */
export async function disconnectConnection(connectionId) {
  const client = requireClient();
  const { error } = await client.from("sheet_connections").update({ is_active: false }).eq("id", connectionId);
  if (error) throw new Error(error.message);
}

/** Triggers an on-demand sync. Requires the sheets-sync Edge Function to be deployed — surfaces a clear error if it isn't reachable yet rather than failing silently. */
export async function triggerSync(connectionId) {
  const client = requireClient();
  const { data, error } = await client.functions.invoke("sheets-sync", { body: { connectionId } });
  if (error) throw new Error(error.message || "Sync failed.");
  if (data?.error) throw new Error(data.error);
  return data;
}
