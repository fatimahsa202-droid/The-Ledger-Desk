// POST { code, redirectUri } -> { connectionId, accessToken, expiresAt }
//
// Called once, right after the frontend's Google consent popup returns an
// authorization code. This is the ONLY place the Google client secret is
// used. The refresh token this yields is stored server-side and NEVER
// returned to the caller — only a short-lived access token comes back,
// which the frontend needs immediately to drive the Google Picker and
// preview the chosen tab's header row.
//
// Creates the sheet_connections row right here, in sync_state =
// 'pending_setup', because Google consent necessarily happens before the
// user has picked a spreadsheet/tab (Picker itself needs an access token
// to run) — see migration 004_scheduled_names.sql's comment on
// sheet_connections for why that state is a real, honest part of the
// model rather than a workaround.
//
// Self-contained on purpose (no imports from a sibling _shared/ folder) —
// deployed via the Supabase Dashboard's per-function editor, which
// doesn't reliably resolve relative imports that escape a function's own
// directory. sheets-sync duplicates the small helpers below rather than
// sharing this file, for the same reason.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing required Edge Function secret: ${name}`);
  return v;
}

function adminClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

/** Never trust a client-supplied user id — always derive it from the caller's own verified Supabase JWT. */
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

/** One-time exchange of an authorization code for tokens. Requires access_type=offline + prompt=consent to have been requested by the frontend, or Google will not include a refresh_token. */
async function exchangeCodeForTokens(code: string, redirectUri: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Google token exchange failed: ${body.error || res.status} ${body.error_description || ""}`);
  if (!body.refresh_token) {
    throw new Error(
      "Google did not return a refresh_token — this happens on a repeat consent without prompt=consent. Revoke Ledger Desk's access at https://myaccount.google.com/permissions and try connecting again."
    );
  }
  return {
    accessToken: body.access_token as string,
    refreshToken: body.refresh_token as string,
    expiresAt: new Date(Date.now() + body.expires_in * 1000).toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const userId = await requireCallerUserId(req);
    const { code, redirectUri } = await req.json();
    if (!code || !redirectUri) {
      return new Response(JSON.stringify({ error: "code and redirectUri are required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const tokens = await exchangeCodeForTokens(code, redirectUri);
    const admin = adminClient();
    const connectionId = crypto.randomUUID();

    const { error: connErr } = await admin.from("sheet_connections").insert({
      id: connectionId,
      user_id: userId,
      sync_state: "pending_setup",
    });
    if (connErr) throw new Error(`Failed to create connection: ${connErr.message}`);

    const { error: tokenErr } = await admin.from("google_oauth_tokens").insert({
      connection_id: connectionId,
      user_id: userId,
      refresh_token: tokens.refreshToken,
      access_token: tokens.accessToken,
      access_token_expires_at: tokens.expiresAt,
    });
    if (tokenErr) {
      // Compensating cleanup — never leave a connection row with no
      // corresponding token row; that combination can never be synced.
      await admin.from("sheet_connections").delete().eq("id", connectionId);
      throw new Error(`Failed to store Google tokens: ${tokenErr.message}`);
    }

    return new Response(
      JSON.stringify({ connectionId, accessToken: tokens.accessToken, expiresAt: tokens.expiresAt }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err?.message || err) }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
