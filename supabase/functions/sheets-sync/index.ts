// POST { connectionId } -> { ok: true, added, updated, removed } | { error }
//
// The core Scheduled Names sync engine. Self-contained (no _shared/
// imports — see google-oauth-exchange/index.ts for why: Dashboard
// deployment doesn't reliably resolve cross-function relative imports).
//
// Safety invariants enforced here, all load-bearing for the product spec:
//  - A failed/partial Google fetch NEVER touches scheduled_names. The
//    full diff is computed in memory first; Supabase is only written to
//    after every Google call this run has succeeded.
//  - completed_at/status are NEVER written by this function — only
//    Complete/Reopen actions (a separate, direct client write) touch
//    those two columns. A sync can rename/reschedule a row; it can never
//    un-complete one.
//  - The identity column is never silently recreated. If this connection
//    previously had one (id_column_header is set) and it's no longer
//    found in the sheet, sync aborts into sync_state = 'id_column_missing'
//    and touches nothing else.
//  - Row identity is exact-match on a UUID stored in the sheet's own
//    hidden column, never content/position heuristics — so duplicate
//    Name+Date rows, reordering, and edits all resolve unambiguously.
//  - scheduled_names.id = `${connectionId}::${rawSheetRowUuid}` so two
//    different Ledger Desk accounts reading the identical physical sheet
//    never collide or share state.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ID_COLUMN_HEADER = "Ledger Desk ID (auto-generated, do not edit)";

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing required Edge Function secret: ${name}`);
  return v;
}

function adminClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

async function requireCallerUserId(req: Request): Promise<string> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("Missing Authorization header");
  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) throw new Error("Not authenticated");
  return data.user.id;
}

class GoogleReauthRequiredError extends Error {
  constructor(detail: string) {
    super(`Google authorization needs to be renewed: ${detail}`);
    this.name = "GoogleReauthRequiredError";
  }
}

async function refreshAccessToken(refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      grant_type: "refresh_token",
    }),
  });
  const body = await res.json();
  if (!res.ok) {
    if (body.error === "invalid_grant") throw new GoogleReauthRequiredError(body.error_description || "refresh token expired or revoked");
    throw new Error(`Google token refresh failed: ${body.error || res.status} ${body.error_description || ""}`);
  }
  return { accessToken: body.access_token as string, expiresAt: new Date(Date.now() + body.expires_in * 1000).toISOString() };
}

/** Refreshes only when the cached access token is expired or about to be — persists the refresh so the next sync can reuse it. */
async function getValidAccessToken(admin: any, connectionId: string): Promise<string> {
  const { data: row, error } = await admin.from("google_oauth_tokens").select("refresh_token, access_token, access_token_expires_at").eq("connection_id", connectionId).single();
  if (error || !row) throw new Error(`No stored Google tokens for connection ${connectionId}`);
  const stillValid = row.access_token && row.access_token_expires_at && new Date(row.access_token_expires_at).getTime() - 60_000 > Date.now();
  if (stillValid) return row.access_token;
  const { accessToken, expiresAt } = await refreshAccessToken(row.refresh_token);
  await admin.from("google_oauth_tokens").update({ access_token: accessToken, access_token_expires_at: expiresAt }).eq("connection_id", connectionId);
  return accessToken;
}

async function sheetsFetch(path: string, accessToken: string, init?: RequestInit) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message || `Google Sheets API error (${res.status})`);
  return body;
}

function colIndexToLetter(idx: number): string {
  let s = "";
  let n = idx;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/** Google Sheets serial date (days since 1899-12-30) -> a real Date, avoiding locale-dependent string parsing entirely. */
function serialDateToDate(serial: number): Date | null {
  if (typeof serial !== "number" || !isFinite(serial)) return null;
  return new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = adminClient();
  let connectionId: string | null = null;

  try {
    const userId = await requireCallerUserId(req);
    const body = await req.json();
    connectionId = body.connectionId;
    if (!connectionId) throw new Error("connectionId is required");

    const { data: conn, error: connErr } = await admin.from("sheet_connections").select("*").eq("id", connectionId).eq("user_id", userId).single();
    if (connErr || !conn) throw new Error("Sheet connection not found.");
    if (conn.sync_state === "pending_setup") throw new Error("This connection's setup isn't finished yet.");

    // Overlap guard: with auto-sync (periodic + focus + multi-device), two
    // triggers can genuinely race for the same connection. If one is
    // already mid-run (sync_state = 'syncing', set the moment a run starts
    // — see below), skip rather than run a second concurrent Google
    // read/write pass. The updated_at recency check is what makes this
    // self-healing: a run that crashed instead of completing can't wedge
    // every future sync forever, since the stale 'syncing' state simply
    // ages out. Not the only safety net here — scheduled_names is written
    // by id-keyed upsert, never insert, so even a genuine race would only
    // ever overwrite name/scheduled_date harmlessly, never create a
    // duplicate row or touch status/completed_at.
    const SYNC_LOCK_TIMEOUT_MS = 3 * 60 * 1000;
    if (conn.sync_state === "syncing" && conn.updated_at && Date.now() - new Date(conn.updated_at).getTime() < SYNC_LOCK_TIMEOUT_MS) {
      return json({ ok: true, skipped: true, reason: "A sync for this connection is already in progress." });
    }

    await admin.from("sheet_connections").update({ sync_state: "syncing" }).eq("id", connectionId);

    // ---- Everything below is Google reads/writes + in-memory diffing.
    // Nothing is written to scheduled_names until every Google call this
    // run needs has already succeeded.
    let accessToken: string;
    try {
      accessToken = await getValidAccessToken(admin, connectionId);
    } catch (err) {
      if (err instanceof GoogleReauthRequiredError) {
        await admin.from("sheet_connections").update({ sync_state: "reauth_required", last_sync_error: err.message }).eq("id", connectionId);
        return json({ error: err.message });
      }
      throw err;
    }

    const meta = await sheetsFetch(`${conn.spreadsheet_id}?fields=sheets.properties(sheetId,title)`, accessToken);
    const sheetProps = (meta.sheets || []).find((s: any) => s.properties.title === conn.sheet_tab)?.properties;
    if (!sheetProps) throw new Error(`Tab "${conn.sheet_tab}" no longer exists in this spreadsheet.`);

    const range = encodeURIComponent(`'${conn.sheet_tab}'`);
    const valuesBody = await sheetsFetch(`${conn.spreadsheet_id}/values/${range}?valueRenderOption=UNFORMATTED_VALUE`, accessToken);
    const rows: any[][] = valuesBody.values || [];
    if (rows.length === 0) throw new Error("The sheet's header row is missing or the tab is empty.");

    const header: string[] = rows[0].map((h: any) => String(h ?? "").trim());
    const nameColIdx = header.indexOf(conn.column_mapping?.name);
    const dateColIdx = header.indexOf(conn.column_mapping?.date);
    if (nameColIdx === -1) throw new Error(`Mapped Name column "${conn.column_mapping?.name}" was not found in the sheet's header row.`);
    if (dateColIdx === -1) throw new Error(`Mapped Date column "${conn.column_mapping?.date}" was not found in the sheet's header row.`);

    let idColIdx = header.indexOf(ID_COLUMN_HEADER);
    const idColumnAlreadyExisted = Boolean(conn.id_column_header);

    if (idColIdx === -1 && idColumnAlreadyExisted) {
      // Previously synced with a real identity column that is no longer
      // there — never silently recreate it (would break every existing
      // row's identity). Surface it and stop.
      await admin.from("sheet_connections").update({ sync_state: "id_column_missing", last_sync_error: "The Ledger Desk ID column was not found in the sheet." }).eq("id", connectionId);
      return json({ error: "The Ledger Desk ID column was removed from the sheet. Reconnect to restore it before this Sheet can sync again." });
    }

    let creatingIdColumn = false;
    if (idColIdx === -1) {
      // First sync ever for this connection — create the column, appended after the last used column, never touching existing ones.
      creatingIdColumn = true;
      idColIdx = header.length;
      const headerCellRange = encodeURIComponent(`'${conn.sheet_tab}'!${colIndexToLetter(idColIdx)}1`);
      await sheetsFetch(`${conn.spreadsheet_id}/values/${headerCellRange}?valueInputOption=RAW`, accessToken, {
        method: "PUT",
        body: JSON.stringify({ range: `'${conn.sheet_tab}'!${colIndexToLetter(idColIdx)}1`, values: [[ID_COLUMN_HEADER]] }),
      });
      // Best-effort protection (warning-only) — not fatal if it fails.
      try {
        await sheetsFetch(`${conn.spreadsheet_id}:batchUpdate`, accessToken, {
          method: "POST",
          body: JSON.stringify({
            requests: [{
              addProtectedRange: {
                protectedRange: {
                  range: { sheetId: sheetProps.sheetId, startColumnIndex: idColIdx, endColumnIndex: idColIdx + 1 },
                  description: "Ledger Desk internal row identity — do not edit or delete this column.",
                  warningOnly: true,
                },
              },
            }],
          }),
        });
      } catch { /* non-fatal — protection is a nice-to-have, not correctness-critical */ }
    }

    // ---- Compute the diff in memory. No Supabase writes yet.
    const dataRows = rows.slice(1);
    const seenIds = new Set<string>();
    const idCellWrites: { row: number; rawUuid: string }[] = []; // sheet writes still needed
    const toUpsert: { id: string; name: string; scheduled_date: string }[] = [];
    let skippedInvalidDate = 0;

    dataRows.forEach((row, i) => {
      const name = String(row[nameColIdx] ?? "").trim();
      const dateSerial = row[dateColIdx];
      const existingRawId = idColIdx < row.length ? String(row[idColIdx] ?? "").trim() : "";
      if (!name && !dateSerial) return; // fully blank row, ignore

      const date = serialDateToDate(typeof dateSerial === "number" ? dateSerial : NaN);
      if (!date) { skippedInvalidDate++; return; }

      const rawUuid = existingRawId || crypto.randomUUID();
      if (!existingRawId) idCellWrites.push({ row: i + 2, rawUuid }); // +2: 1-indexed, +1 for header row
      const id = `${connectionId}::${rawUuid}`;
      seenIds.add(id);
      toUpsert.push({ id, name, scheduled_date: date.toISOString().slice(0, 10) });
    });

    // ---- Write new IDs into the sheet (batched), BEFORE any Supabase
    // write — if this fails, abort with nothing changed in Supabase.
    if (idCellWrites.length > 0) {
      await sheetsFetch(`${conn.spreadsheet_id}/values:batchUpdate`, accessToken, {
        method: "POST",
        body: JSON.stringify({
          valueInputOption: "RAW",
          data: idCellWrites.map((w) => ({ range: `'${conn.sheet_tab}'!${colIndexToLetter(idColIdx)}${w.row}`, values: [[w.rawUuid]] })),
        }),
      });
    }

    // ---- Now safe to write Supabase. Upsert active rows (name/date/source_status only — never status/completed_at).
    let added = 0, updated = 0;
    for (const row of toUpsert) {
      const { data: existing } = await admin.from("scheduled_names").select("id").eq("id", row.id).maybeSingle();
      if (existing) updated++; else added++;
      await admin.from("scheduled_names").upsert(
        { id: row.id, connection_id: connectionId, user_id: userId, name: row.name, scheduled_date: row.scheduled_date, source_status: "active" },
        { onConflict: "id" }
      );
    }

    // ---- Anything previously active but not seen this run is no longer in the source.
    const { data: previouslyActive } = await admin.from("scheduled_names").select("id").eq("connection_id", connectionId).eq("source_status", "active");
    const toRemove = (previouslyActive || []).filter((r: any) => !seenIds.has(r.id)).map((r: any) => r.id);
    if (toRemove.length > 0) {
      await admin.from("scheduled_names").update({ source_status: "removed" }).in("id", toRemove);
    }

    await admin.from("sheet_connections").update({
      sync_state: "idle",
      last_synced_at: new Date().toISOString(),
      last_sync_error: skippedInvalidDate > 0 ? `${skippedInvalidDate} row(s) skipped (unreadable date)` : null,
      id_column_header: ID_COLUMN_HEADER,
    }).eq("id", connectionId);

    return json({ ok: true, added, updated, removed: toRemove.length, skippedInvalidDate, createdIdColumn: creatingIdColumn });
  } catch (err) {
    const message = String((err as any)?.message || err);
    // Safe: our own error text / Google's error + error_description
    // fields — never a client_secret, access token, or refresh token.
    console.error("[sheets-sync]", message);
    if (connectionId) {
      await admin.from("sheet_connections").update({ sync_state: "error", last_sync_error: message }).eq("id", connectionId).catch(() => {});
    }
    return json({ error: message }, 400);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
