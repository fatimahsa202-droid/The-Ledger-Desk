import { createClient } from "@supabase/supabase-js";
import { DEPLOYED_SUPABASE_URL, DEPLOYED_SUPABASE_ANON_KEY } from "./deployedConfig.js";

/**
 * Manages the lifecycle of the Supabase client instance.
 *
 * The normal connection target is baked into the deployed build
 * (deployedConfig.js) — a normal user never sees or enters a Project URL
 * or key. An explicit override can still be set, per device, from Settings
 * -> Cloud Sync -> Advanced (for switching projects or local testing
 * against a different one); it's stored under its own localStorage key,
 * deliberately outside the STORAGE_KEYS synced-data set, since it's the
 * bootstrap credential this whole sync system depends on (a chicken-and-egg
 * problem to sync it through itself). An override always wins over the
 * baked-in default.
 */

const CONNECTION_KEY = "ledgerdesk:cloud-connection";

export function getStoredConnection() {
  try {
    const raw = window.localStorage.getItem(CONNECTION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredConnection(conn) {
  try {
    if (conn) window.localStorage.setItem(CONNECTION_KEY, JSON.stringify(conn));
    else window.localStorage.removeItem(CONNECTION_KEY);
  } catch {
    /* private browsing / storage unavailable */
  }
}

/**
 * The connection the app should actually use: a device-level override if
 * one has been set (Advanced), otherwise the build's baked-in default.
 * `isOverride` lets Advanced UI show which one is currently active.
 */
export function getEffectiveConnection() {
  const stored = getStoredConnection();
  if (stored?.url && stored?.anonKey) return { url: stored.url, anonKey: stored.anonKey, isOverride: true };
  if (DEPLOYED_SUPABASE_URL && DEPLOYED_SUPABASE_ANON_KEY) {
    return { url: DEPLOYED_SUPABASE_URL, anonKey: DEPLOYED_SUPABASE_ANON_KEY, isOverride: false };
  }
  return null;
}

let clientInstance = null;
let clientForUrl = null;
let clientFlowType = null;

/** Returns the current client, or null if never connected. */
export function getClient() {
  return clientInstance;
}

/** (Re)creates the Supabase client from stored connection info, if any. */
export function initClientFromStorage(flowType) {
  const conn = getStoredConnection();
  if (!conn?.url || !conn?.anonKey) return null;
  return ensureClient(conn.url, conn.anonKey, flowType);
}

/**
 * `flowType` matters here: the pasted-link (temporary local-testing) auth
 * strategy hands a copied email-link token straight to `verifyOtp`, which
 * only understands the classic hashed-OTP token format ("implicit" flow).
 * Under supabase-js's default "pkce" flow, that same link instead embeds a
 * `pkce_`-prefixed opaque code meant only for GoTrue's own server-side
 * redirect exchange — feeding it to `verifyOtp` fails with "invalid or
 * expired" no matter what `type` is guessed. The hosted-redirect strategy
 * (used once this app has a stable URL) wants the opposite: "pkce" is the
 * safer, recommended default for a real redirect-based sign-in. Each
 * strategy in authStrategies.js declares which one it needs.
 */
export function ensureClient(url, anonKey, flowType = "pkce") {
  if (clientInstance && clientForUrl === url && clientFlowType === flowType) return clientInstance;
  clientInstance = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "ledgerdesk-auth",
      flowType,
    },
  });
  clientForUrl = url;
  clientFlowType = flowType;
  return clientInstance;
}

export function disconnectClient() {
  clientInstance = null;
  clientForUrl = null;
  clientFlowType = null;
  setStoredConnection(null);
}

/** Basic shape validation before we ever try to hit the network with it. */
export function isPlausibleConnection(url, anonKey) {
  if (!url || !anonKey) return false;
  try {
    const u = new URL(url);
    if (!/\.supabase\.co$/.test(u.hostname) && !u.hostname.includes("supabase")) {
      // Not fatal — self-hosted Supabase is valid too — just don't block on it.
    }
    return u.protocol === "https:" && anonKey.length > 20;
  } catch {
    return false;
  }
}
