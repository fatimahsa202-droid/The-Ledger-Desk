// Google OAuth token exchange/refresh — the ONLY place the Google client
// secret is ever used. This file only runs inside Supabase Edge
// Functions; it is never bundled into the frontend.

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing required Edge Function secret: ${name}`);
  return v;
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string; // ISO timestamp
}

/** A refresh token that Google has expired or revoked. Callers should turn this into sync_state = 'reauth_required', never a generic sync error, and must never touch scheduled_names when this is thrown. */
export class GoogleReauthRequiredError extends Error {
  constructor(detail: string) {
    super(`Google authorization needs to be renewed: ${detail}`);
    this.name = "GoogleReauthRequiredError";
  }
}

function expiresAtFromNow(expiresInSeconds: number): string {
  return new Date(Date.now() + expiresInSeconds * 1000).toISOString();
}

/** One-time exchange of an authorization code for tokens. Requires access_type=offline + prompt=consent to have been requested by the frontend, or Google will not include a refresh_token. */
export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<GoogleTokens> {
  const res = await fetch(TOKEN_ENDPOINT, {
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
  return { accessToken: body.access_token, refreshToken: body.refresh_token, expiresAt: expiresAtFromNow(body.expires_in) };
}

/** Exchange a stored refresh_token for a fresh access_token. Never returns a new refresh_token (Google doesn't issue one on refresh). */
export async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: string }> {
  const res = await fetch(TOKEN_ENDPOINT, {
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
  return { accessToken: body.access_token, expiresAt: expiresAtFromNow(body.expires_in) };
}

/** Returns a valid access token for a connection, refreshing (and persisting the refresh) only when the cached one is expired or about to be. Throws GoogleReauthRequiredError if the refresh token itself is no longer valid — callers must catch this specifically and set sync_state = 'reauth_required' rather than treating it as a generic sync failure. */
export async function getValidAccessToken(admin: any, connectionId: string): Promise<string> {
  const { data: row, error } = await admin
    .from("google_oauth_tokens")
    .select("refresh_token, access_token, access_token_expires_at")
    .eq("connection_id", connectionId)
    .single();
  if (error || !row) throw new Error(`No stored Google tokens for connection ${connectionId}`);

  const SAFETY_MARGIN_MS = 60_000;
  const stillValid = row.access_token && row.access_token_expires_at && new Date(row.access_token_expires_at).getTime() - SAFETY_MARGIN_MS > Date.now();
  if (stillValid) return row.access_token;

  const { accessToken, expiresAt } = await refreshAccessToken(row.refresh_token);
  const { error: updateErr } = await admin
    .from("google_oauth_tokens")
    .update({ access_token: accessToken, access_token_expires_at: expiresAt })
    .eq("connection_id", connectionId);
  if (updateErr) throw new Error(`Failed to persist refreshed access token: ${updateErr.message}`);
  return accessToken;
}
