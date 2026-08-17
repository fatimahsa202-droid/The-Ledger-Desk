/**
 * Storage layer
 * -------------
 * Everything the app persists goes through this module instead of touching
 * localStorage directly. That keeps a single seam to swap in a cloud backend
 * (Firebase / Supabase / Appwrite / PocketBase / a custom sync server) later
 * without touching any component or hook.
 *
 * Contract an adapter must implement:
 *   get(key)              -> Promise<any | undefined>
 *   set(key, value)        -> Promise<void>
 *   remove(key)             -> Promise<void>
 *   subscribe(key, fn)      -> unsubscribe()   // fn(value) called on external change
 *
 * To add real multi-device sync later: implement the same four methods
 * against your backend of choice (e.g. Firestore onSnapshot for subscribe),
 * then swap `activeAdapter` below. Nothing else in the app needs to change.
 */

const NAMESPACE = "ledgerdesk";

class LocalStorageAdapter {
  constructor() {
    this._listeners = new Map(); // key -> Set<fn>
    if (typeof window !== "undefined") {
      window.addEventListener("storage", (e) => {
        if (!e.key || !e.key.startsWith(NAMESPACE + ":")) return;
        const key = e.key.slice(NAMESPACE.length + 1);
        const fns = this._listeners.get(key);
        if (!fns) return;
        const value = e.newValue ? JSON.parse(e.newValue) : undefined;
        fns.forEach((fn) => fn(value));
      });
    }
  }

  _fullKey(key) {
    return `${NAMESPACE}:${key}`;
  }

  async get(key) {
    try {
      const raw = window.localStorage.getItem(this._fullKey(key));
      return raw == null ? undefined : JSON.parse(raw);
    } catch {
      return undefined;
    }
  }

  async set(key, value) {
    try {
      window.localStorage.setItem(this._fullKey(key), JSON.stringify(value));
    } catch {
      // Storage full or unavailable (private browsing) — fail silently,
      // the in-memory app state remains the source of truth for the session.
    }
  }

  async remove(key) {
    try {
      window.localStorage.removeItem(this._fullKey(key));
    } catch {
      /* noop */
    }
  }

  subscribe(key, fn) {
    if (!this._listeners.has(key)) this._listeners.set(key, new Set());
    this._listeners.get(key).add(fn);
    return () => this._listeners.get(key)?.delete(fn);
  }
}

// Swap this line to point at a different adapter (e.g. a future
// FirebaseAdapter / SupabaseAdapter implementing the same contract).
export const storage = new LocalStorageAdapter();

export const STORAGE_KEYS = {
  monthlyData: "acct-monthly-data",
  activeTimer: "acct-active-timer",
  migration: "migration-data",
  gamification: "gamification-data",
  settings: "app-settings",
  favorites: "favorite-tasks",
  pinned: "pinned-tasks",
  recentTasks: "recent-tasks",
  activityLog: "activity-log",
  lastSync: "last-sync-meta",
};

export function exportAllData(snapshot) {
  return JSON.stringify(
    { exportedAt: new Date().toISOString(), version: 1, ...snapshot },
    null,
    2
  );
}
