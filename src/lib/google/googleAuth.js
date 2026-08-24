import { GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_SCOPES } from "./googleConfig.js";

/**
 * The one-time authorization-code popup flow (Google Identity Services'
 * code client), used once per connection to get a code the backend
 * exchanges for tokens. Never touches the refresh token — that only ever
 * exists inside google-oauth-exchange and Supabase.
 *
 * Popup-mode code clients use Google's "postmessage" redirect convention
 * (the same one the older gapi.auth2().grantOfflineAccess() API used for
 * server-side exchange) rather than a real registered HTTPS redirect
 * URI — see REDIRECT_URI_FOR_EXCHANGE below, which must match exactly
 * what's sent to google-oauth-exchange.
 */
export const REDIRECT_URI_FOR_EXCHANGE = "postmessage";

let gisLoadPromise = null;
function loadGisScript() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisLoadPromise) return gisLoadPromise;
  gisLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load the Google sign-in script — check your connection and try again."));
    document.head.appendChild(script);
  });
  return gisLoadPromise;
}

/**
 * Opens Google's popup consent flow and resolves with a one-time
 * authorization code. access_type: "offline" + prompt: "consent" request
 * a refresh_token — if Google doesn't include one anyway,
 * google-oauth-exchange throws a specific, actionable error rather than
 * silently leaving the connection broken.
 */
export async function requestGoogleAuthorizationCode() {
  await loadGisScript();
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initCodeClient({
      client_id: GOOGLE_OAUTH_CLIENT_ID,
      scope: GOOGLE_OAUTH_SCOPES,
      ux_mode: "popup",
      access_type: "offline",
      prompt: "consent",
      callback: (response) => {
        if (response.error) reject(new Error(response.error));
        else resolve(response.code);
      },
      error_callback: (err) => reject(new Error(err?.message || "Google sign-in was cancelled or failed.")),
    });
    client.requestCode();
  });
}
