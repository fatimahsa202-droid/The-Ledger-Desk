/**
 * Auth strategies — isolated behind one contract so the sign-in mechanism
 * can be swapped later without touching the sync engine, the storage
 * layer, or any screen. Selection is automatic: a page opened over
 * http(s) (a real hosted URL) uses the standard hosted-redirect flow; a
 * page opened as a local file (no stable origin to redirect back to) uses
 * the temporary pasted-link flow. The moment this app is hosted somewhere,
 * it upgrades itself automatically — no settings to flip.
 *
 * Contract every strategy implements:
 *   id, label, instructions, flowType ("implicit" | "pkce" — passed to
 *     createClient so the Supabase client is built to match the token
 *     format this strategy's link-handling actually expects)
 *   requestCode(client, email)              -> Promise<{ ok, error? }>
 *   needsManualInput: boolean
 *   completeWithInput(client, pastedValue)  -> Promise<{ ok, error? }>   (manual strategies)
 *   completeFromRedirect(client)            -> Promise<{ ok, error? }>  (redirect strategies, called on app load)
 */

import { logEvent } from "./diagnostics.js";

function currentOrigin() {
  try {
    return window.location.origin + window.location.pathname;
  } catch {
    return null;
  }
}

export const pastedLinkStrategy = {
  id: "pasted-link",
  label: "Paste sign-in link (temporary, local testing)",
  instructions:
    "Enter your email, then open the sign-in email Supabase sends. Instead of clicking the button, right-click (or long-press on mobile) it and choose “Copy Link Address,” then paste that link below.",
  needsManualInput: true,
  // "implicit" so the emailed link carries the classic hashed-OTP token
  // that verifyOtp() expects. Supabase's default "pkce" flow would embed a
  // pkce_-prefixed opaque code there instead — valid only for GoTrue's own
  // server-side /verify redirect, and rejected by verifyOtp() as an
  // "invalid or expired" link no matter what `type` is guessed.
  flowType: "implicit",

  async requestCode(client, email) {
    const { error } = await client.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  },

  async completeWithInput(client, pastedValue) {
    const parsed = parseSignInLink(pastedValue);
    if (!parsed?.token) {
      return { ok: false, error: "That doesn't look like a Supabase sign-in link. Copy the link address from the email's login button and paste the whole thing." };
    }
    logEvent(
      `Pasted link parsed — query params: [${parsed.paramNames.join(", ") || "none"}]` +
        (parsed.type ? `, detected type: "${parsed.type}"` : ", no type param found") +
        `, token format: ${parsed.token.startsWith("pkce_") ? "pkce (unexpected under implicit flow)" : "classic hashed-OTP"}.`
    );
    // Prefer the `type` actually embedded in the link; fall back to the
    // known values Supabase has used across SDK/project versions, in case
    // the link's own type param is missing or unrecognized.
    const fallbackTypes = ["magiclink", "email", "signup", "recovery"];
    const typesToTry = parsed.type ? [parsed.type, ...fallbackTypes.filter((t) => t !== parsed.type)] : fallbackTypes;
    let lastError = null;
    for (const type of typesToTry) {
      const { error } = await client.auth.verifyOtp({ token_hash: parsed.token, type });
      if (!error) return { ok: true };
      lastError = error.message;
    }
    return { ok: false, error: `Could not verify that link (${lastError}). The link may have expired — request a new one.` };
  },

  async completeFromRedirect() {
    return { ok: false, error: "not applicable" };
  },
};

export const hostedRedirectStrategy = {
  id: "hosted-redirect",
  label: "Email sign-in link",
  instructions: "Enter your email, then open the sign-in email and click the login link. You'll land back here signed in automatically.",
  needsManualInput: false,
  // "pkce" is the recommended, more secure default for a real redirect-
  // based sign-in, and pairs correctly with detectSessionInUrl's automatic
  // code exchange once this app is hosted at a stable URL.
  flowType: "pkce",

  async requestCode(client, email) {
    const redirectTo = currentOrigin();
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: redirectTo || undefined },
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  },

  async completeWithInput() {
    return { ok: false, error: "not applicable" };
  },

  async completeFromRedirect(client) {
    // With detectSessionInUrl:true, the client already parses the
    // access/refresh tokens out of the URL fragment on load. We just need
    // to confirm a session landed, then tidy the URL.
    const { data, error } = await client.auth.getSession();
    if (error) return { ok: false, error: error.message };
    if (data?.session) {
      if (window.history?.replaceState) {
        // Drop the ?code=... (or #access_token=...) that the redirect
        // added — it's single-use and shouldn't linger in the address bar
        // or survive a bookmark/reload.
        window.history.replaceState(null, "", window.location.pathname + window.location.hash);
      }
      return { ok: true };
    }
    return { ok: false, error: "no session in URL" };
  },
};

/**
 * Pulls the verification token, its `type`, and (for safe diagnostics only)
 * the set of query param *names* present — never other param values — out
 * of a pasted sign-in link.
 */
function parseSignInLink(pastedValue) {
  const text = (pastedValue || "").trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    const token = url.searchParams.get("token") || url.searchParams.get("token_hash");
    if (!token) return null;
    return { token, type: url.searchParams.get("type"), paramNames: [...url.searchParams.keys()] };
  } catch {
    // Not a full URL — allow pasting just the raw token value too.
    if (/^[a-zA-Z0-9_-]{16,}$/.test(text)) return { token: text, type: null, paramNames: [] };
    return null;
  }
}

/** Picks the strategy automatically based on how this page was opened. */
export function getActiveAuthStrategy() {
  const isHosted = typeof window !== "undefined" && /^https?:$/.test(window.location.protocol);
  return isHosted ? hostedRedirectStrategy : pastedLinkStrategy;
}
