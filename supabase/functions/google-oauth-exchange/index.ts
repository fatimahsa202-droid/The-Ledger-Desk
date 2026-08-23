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
// to run) — see the migration's comment on sheet_connections for why that
// state is a real, honest part of the model rather than a workaround.
import { corsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { adminClient, requireCallerUserId } from "../_shared/supabaseClients.ts";
import { exchangeCodeForTokens } from "../_shared/google.ts";

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

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
