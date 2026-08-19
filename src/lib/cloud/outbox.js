import { uid } from "../format.js";

/**
 * Persisted offline write queue.
 *
 * Every mutation the app wants to sync goes here first, before it ever
 * touches the network — this is what makes "offline edits," "refresh with
 * pending writes," and "retry without duplicates" all safe by
 * construction rather than by luck:
 *   - Persisted to localStorage immediately, so a refresh or tab close
 *     mid-flight doesn't lose the write; it's replayed on next load.
 *   - Each entry carries the target row's own client-generated primary
 *     key, so re-sending an already-applied write is a safe no-op
 *     (INSERT ... ON CONFLICT), never a duplicate.
 *   - APPEND_ONLY tables use ignoreDuplicates (ON CONFLICT DO NOTHING) —
 *     a retried create can never overwrite or duplicate a row.
 *     UPSERT tables use normal upsert (ON CONFLICT DO UPDATE) — a
 *     retried status/notes change safely re-applies the same value.
 */

const OUTBOX_KEY = "ledgerdesk:cloud-outbox";
const MAX_ATTEMPTS_BEFORE_PARK = 8;

export const APPEND_ONLY_TABLES = new Set(["work_sessions", "sources", "migration_log", "activity_log", "badges_earned"]);

export function loadOutbox() {
  try {
    const raw = window.localStorage.getItem(OUTBOX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveOutbox(list) {
  try {
    window.localStorage.setItem(OUTBOX_KEY, JSON.stringify(list));
  } catch {
    /* storage full/unavailable — the in-memory queue for this session still works */
  }
}

/**
 * op: { table, kind: 'upsert' | 'delete', payload, conflictKeys? }
 * Returns the enqueued entry's id.
 */
export function enqueue(op) {
  const entry = { id: uid() + uid(), attempts: 0, lastError: null, createdAt: Date.now(), ...op };
  const list = loadOutbox();
  list.push(entry);
  saveOutbox(list);
  return entry.id;
}

export function outboxCount() {
  return loadOutbox().length;
}

export function outboxFailedCount() {
  return loadOutbox().filter((e) => e.attempts > 0).length;
}

/**
 * Attempts to send every queued entry, in order, to Supabase. Successful
 * entries are removed; failed ones stay queued with their attempt count
 * bumped, so the next flush (triggered by reconnect, focus, or the
 * periodic timer — never by Realtime alone) retries them. Entries that
 * fail repeatedly are kept (never silently dropped) so Sync Diagnostics
 * can surface them.
 */
export async function flushOutbox(client, { onEntryResult } = {}) {
  let list = loadOutbox();
  if (list.length === 0) return { sent: 0, failed: 0, remaining: 0 };

  let sent = 0, failed = 0;
  const remaining = [];

  for (const entry of list) {
    try {
      const table = client.from(entry.table);
      let error;
      if (entry.kind === "delete") {
        const res = await table.delete().match(entry.match || { id: entry.payload?.id });
        error = res.error;
      } else {
        const ignoreDuplicates = APPEND_ONLY_TABLES.has(entry.table);
        const res = await table.upsert(entry.payload, {
          onConflict: entry.conflictKeys?.join(","),
          ignoreDuplicates,
        });
        error = res.error;
      }
      if (error) throw error;
      sent++;
      onEntryResult?.(entry, null);
    } catch (err) {
      failed++;
      const attempts = (entry.attempts || 0) + 1;
      const parked = attempts >= MAX_ATTEMPTS_BEFORE_PARK;
      remaining.push({ ...entry, attempts, lastError: err.message || String(err), parked });
      onEntryResult?.(entry, err.message || String(err));
    }
  }

  saveOutbox(remaining);
  return { sent, failed, remaining: remaining.length };
}

export function clearParkedEntry(id) {
  saveOutbox(loadOutbox().filter((e) => e.id !== id));
}

export function clearOutbox() {
  saveOutbox([]);
}
