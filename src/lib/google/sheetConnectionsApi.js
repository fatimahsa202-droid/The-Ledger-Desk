import { getClient } from "../cloud/supabaseClient.js";
import { requestGoogleAuthorizationCode, REDIRECT_URI_FOR_EXCHANGE } from "./googleAuth.js";

function requireClient() {
  const client = getClient();
  if (!client) throw new Error("Cloud Sync isn't connected — Scheduled Names needs it to know which account a Sheet connection belongs to.");
  return client;
}

/**
 * supabase-js's functions.invoke() gives a generic error.message on a
 * non-2xx response ("Edge Function returned a non-2xx status code") — the
 * actual JSON body our functions return (the real, diagnosable message)
 * only lives on error.context, a Response object that has to be read
 * separately. Without this, every real failure reason from
 * google-oauth-exchange/sheets-sync was being swallowed into that one
 * generic string, which is exactly why it wasn't visible anywhere.
 */
async function describeInvokeError(error) {
  if (error?.context && typeof error.context.json === "function") {
    try {
      const body = await error.context.clone().json();
      if (body?.error) return body.error;
    } catch {
      /* body wasn't JSON — fall through to the generic message below */
    }
  }
  return error?.message || "Request failed.";
}

/** Runs the popup consent flow, then exchanges the resulting code server-side. Returns { connectionId, accessToken, expiresAt } — never a refresh token, which stays server-only. */
export async function connectGoogleAccount() {
  const client = requireClient();
  const code = await requestGoogleAuthorizationCode();
  const { data, error } = await client.functions.invoke("google-oauth-exchange", {
    body: { code, redirectUri: REDIRECT_URI_FOR_EXCHANGE },
  });
  if (error) throw new Error(await describeInvokeError(error));
  if (data?.error) throw new Error(data.error);
  return data; // { connectionId, accessToken, expiresAt }
}

/**
 * Friendly-checks whether this user already has an active connection to the
 * same spreadsheet + tab, for the "Already connected" pre-flight in
 * ConnectSheetWizard. This is a courtesy layer, not the real guarantee — the
 * DB's own partial unique index (sheet_connections(user_id, spreadsheet_id,
 * sheet_tab) WHERE is_active) is what actually prevents two active
 * connections from existing at all, including across a two-tab/two-device
 * race this client-side check can't fully close on its own.
 */
export async function findExistingActiveConnection(spreadsheetId, sheetTab) {
  const client = requireClient();
  const { data, error } = await client
    .from("sheet_connections")
    .select("*")
    .eq("is_active", true)
    .eq("spreadsheet_id", spreadsheetId)
    .eq("sheet_tab", sheetTab)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

/** Finishes setup for a connection created by connectGoogleAccount(): sets the real spreadsheet/tab/mapping and moves it out of pending_setup. Plain RLS-protected write — no secret involved, safe from the client. */
export async function finalizeConnection(connectionId, { displayName, spreadsheetId, spreadsheetName, sheetTab, columnMapping }) {
  const client = requireClient();
  const { error } = await client
    .from("sheet_connections")
    .update({ display_name: displayName, spreadsheet_id: spreadsheetId, spreadsheet_name: spreadsheetName, sheet_tab: sheetTab, column_mapping: columnMapping, sync_state: "idle" })
    .eq("id", connectionId);
  if (error) {
    // 23505 = unique_violation — the DB's own uq_sheet_connections_active_target
    // index caught a race the client-side pre-flight check couldn't (two tabs/
    // devices finishing setup for the same spreadsheet+tab at the same time).
    if (error.code === "23505") throw new Error("This Sheet and tab is already connected — someone finished connecting it just now. Refresh Connected Sheets to see it.");
    throw new Error(error.message);
  }
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

/**
 * Soft-disconnect — never deletes the connection, its OAuth tokens, or its
 * Scheduled Names history. Two writes: (1) is_active: false, which alone
 * already stops every sync path (foreground periodic/focus/load, and server
 * cron — both scope their queries to is_active: true), then (2) retires this
 * connection's currently-active Scheduled Names (source_status: "removed")
 * so they stop appearing on Calendar immediately. scheduled_names is already
 * in the Realtime publication and CalendarPage already subscribes to it, so
 * this needs no page refresh to take effect. The rows themselves are never
 * deleted — their name/date/status/completed_at history stays exactly as it
 * was, just no longer "active" — so Disconnect never destroys history, and
 * running it twice (e.g. a retry after a network blip) is harmless.
 */
export async function disconnectConnection(connectionId) {
  const client = requireClient();
  const { error: connErr } = await client.from("sheet_connections").update({ is_active: false }).eq("id", connectionId);
  if (connErr) throw new Error(connErr.message);
  const { error: namesErr } = await client
    .from("scheduled_names")
    .update({ source_status: "removed" })
    .eq("connection_id", connectionId)
    .eq("source_status", "active");
  if (namesErr) throw new Error(namesErr.message);
}

/** Triggers an on-demand sync. Requires the sheets-sync Edge Function to be deployed — surfaces a clear error if it isn't reachable yet rather than failing silently. */
export async function triggerSync(connectionId) {
  const client = requireClient();
  const { data, error } = await client.functions.invoke("sheets-sync", { body: { connectionId } });
  if (error) throw new Error(await describeInvokeError(error));
  if (data?.error) throw new Error(data.error);
  return data;
}
