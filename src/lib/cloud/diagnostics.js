/**
 * Sync Diagnostics — a small observable store so "why is this device
 * stale?" has a real answer instead of a guess. Settings -> Connections
 * reads this directly; the topbar status pill reads only `status`.
 */

const initialState = {
  status: "disconnected", // 'disconnected' | 'connecting' | 'synced' | 'syncing' | 'offline' | 'error'
  connectedEmail: null,
  lastSuccessfulSync: null, // last authoritative reconcile that completed
  lastSuccessfulWrite: null, // last outbox entry that made it to the server
  lastReconciliationFetch: null, // last time we asked the server for current state, success or not
  pendingOutboxCount: 0,
  failedWriteCount: 0,
  realtimeState: "disconnected", // 'disconnected' | 'connecting' | 'connected' | 'error'
  authError: null,
  lastError: null,
  events: [], // capped human-readable timeline, newest first
};

let state = { ...initialState };
const listeners = new Set();

function emit() {
  listeners.forEach((fn) => fn());
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getSnapshot() {
  return state;
}

export function logEvent(message, level = "info") {
  const entry = { id: Date.now() + Math.random().toString(36).slice(2, 6), ts: Date.now(), message, level };
  state = { ...state, events: [entry, ...state.events].slice(0, 100) };
  emit();
}

export function patch(fields) {
  state = { ...state, ...fields };
  emit();
}

export function reset() {
  state = { ...initialState };
  emit();
}

export function recordConflict(description) {
  logEvent(`Conflict resolved: ${description}`, "warn");
}
