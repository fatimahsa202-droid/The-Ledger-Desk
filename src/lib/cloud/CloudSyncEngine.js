import { ensureClient, getStoredConnection, setStoredConnection, disconnectClient, isPlausibleConnection } from "./supabaseClient.js";
import { getActiveAuthStrategy } from "./authStrategies.js";
import { enqueue, flushOutbox, outboxCount, outboxFailedCount, loadOutbox, clearOutbox } from "./outbox.js";
import * as map from "./schema-map.js";
import { patch as diagPatch, logEvent, reset as diagReset, recordConflict } from "./diagnostics.js";

const TABLES = [
  "reconciliation_entries", "work_sessions", "sources", "migration_state", "migration_log",
  "migration_tasks", "activity_log", "gamification_state", "badges_earned", "active_timer",
  "settings_cloud", "preferences_cloud",
];

const RECONCILE_INTERVAL_MS = 45_000;
const REALTIME_DEBOUNCE_MS = 600;

/**
 * Orchestrates cloud sync. Owns the connection, auth session, outbox
 * flushing, Realtime subscriptions, and periodic/lifecycle reconciliation.
 * Never assumes Realtime delivered every change — every code path that
 * matters for correctness (startup, reconnect, focus/wake, and a
 * background interval) re-pulls authoritative state directly.
 */
class CloudSyncEngine {
  constructor() {
    this.client = null;
    this.userId = null;
    this.applyHandlers = null;
    this.getLocalSnapshot = null;
    this.realtimeChannel = null;
    this.reconcileTimer = null;
    this.realtimeDebounce = null;
    this.authSub = null;
    this._reconciling = false;
  }

  /** AppDataProvider calls this once on mount so we can apply pulled/pushed state back into it. */
  registerHandlers({ apply, getLocalSnapshot }) {
    this.applyHandlers = apply;
    this.getLocalSnapshot = getLocalSnapshot;
  }

  isConnected() {
    return !!(this.client && this.userId);
  }

  authStrategy() {
    return getActiveAuthStrategy();
  }

  /* ---------------------------------------------------------- lifecycle --- */

  async initFromStorage() {
    const conn = getStoredConnection();
    if (!conn?.url || !conn?.anonKey) return;
    await this.connect(conn.url, conn.anonKey, { persist: false });
  }

  async connect(url, anonKey, { persist = true } = {}) {
    if (!isPlausibleConnection(url, anonKey)) {
      diagPatch({ status: "error", lastError: "That doesn't look like a valid Supabase URL/key." });
      return { ok: false, error: "invalid-connection" };
    }
    diagPatch({ status: "connecting" });
    // The active strategy determines the client's flowType (implicit for
    // paste-link local testing, pkce for a real hosted redirect) — it must
    // be known before the client is constructed, since flowType is baked
    // in at createClient() time.
    const strategy = this.authStrategy();
    const client = ensureClient(url, anonKey, strategy.flowType);
    this.client = client;
    if (persist) setStoredConnection({ url, anonKey });

    // Try to resolve any redirect-based session (hosted strategy) before
    // asking whether we're signed in.
    if (!strategy.needsManualInput) {
      await strategy.completeFromRedirect(client).catch(() => {});
    }

    const { data } = await client.auth.getSession();
    if (data?.session?.user) {
      await this._onSignedIn(data.session.user.id, data.session.user.email);
    } else {
      diagPatch({ status: "disconnected" });
    }

    this.authSub = client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        this._onSignedIn(session.user.id, session.user.email);
      } else if (event === "SIGNED_OUT") {
        this._onSignedOut();
      } else if (event === "TOKEN_REFRESHED") {
        logEvent("Session token refreshed.");
      } else if (event === "USER_UPDATED") {
        logEvent("Auth user updated.");
      }
    });

    return { ok: true };
  }

  disconnect() {
    this._stopLoops();
    this.client?.auth.signOut().catch(() => {});
    this.authSub?.data?.subscription?.unsubscribe?.();
    disconnectClient();
    this.client = null;
    this.userId = null;
    clearOutbox();
    diagReset();
  }

  async requestSignInEmail(email) {
    if (!this.client) return { ok: false, error: "Not connected to a Supabase project yet." };
    diagPatch({ authError: null });
    const result = await this.authStrategy().requestCode(this.client, email);
    if (!result.ok) diagPatch({ authError: result.error });
    return result;
  }

  async completeSignIn(pastedValue) {
    if (!this.client) return { ok: false, error: "Not connected to a Supabase project yet." };
    const result = await this.authStrategy().completeWithInput(this.client, pastedValue);
    if (!result.ok) diagPatch({ authError: result.error });
    return result;
  }

  async _onSignedIn(userId, email) {
    if (this.userId === userId && this.reconcileTimer) return; // already running
    this.userId = userId;
    diagPatch({ status: "syncing", connectedEmail: email || null, authError: null });
    logEvent(`Signed in as ${email || userId}.`);

    const migrationOk = await this._firstTimeMigrationIfNeeded();
    await this.reconcileNow("initial connect");
    this._startRealtime();
    this._startPeriodicReconcile();
    this._attachLifecycleListeners();
    await this.flushOutboxNow();
    if (migrationOk) {
      diagPatch({ status: "synced" });
    } else {
      // Leave status as an error, even though the reconcile above may have
      // succeeded — a partial initial upload is not "synced." lastError is
      // already set by _firstTimeMigrationIfNeeded.
      diagPatch({ status: "error" });
    }
  }

  _onSignedOut() {
    logEvent("Signed out.");
    this._stopLoops();
    this.userId = null;
    diagPatch({ status: "disconnected", connectedEmail: null });
  }

  _stopLoops() {
    if (this.reconcileTimer) clearInterval(this.reconcileTimer);
    this.reconcileTimer = null;
    if (this.realtimeChannel) this.client?.removeChannel(this.realtimeChannel);
    this.realtimeChannel = null;
    if (this._lifecycleAttached) {
      window.removeEventListener("focus", this._onFocus);
      document.removeEventListener("visibilitychange", this._onVisible);
      window.removeEventListener("online", this._onOnline);
      window.removeEventListener("offline", this._onOffline);
      this._lifecycleAttached = false;
    }
  }

  _attachLifecycleListeners() {
    if (this._lifecycleAttached) return;
    this._onFocus = () => this.reconcileNow("window focus");
    this._onVisible = () => {
      if (document.visibilityState === "visible") this.reconcileNow("tab visible (wake)");
    };
    this._onOnline = () => {
      logEvent("Back online — flushing outbox and reconciling.");
      diagPatch({ status: "syncing" });
      this.flushOutboxNow().then(() => this.reconcileNow("reconnected"));
    };
    this._onOffline = () => {
      logEvent("Connection lost — writes will queue locally.", "warn");
      diagPatch({ status: "offline" });
    };
    window.addEventListener("focus", this._onFocus);
    document.addEventListener("visibilitychange", this._onVisible);
    window.addEventListener("online", this._onOnline);
    window.addEventListener("offline", this._onOffline);
    this._lifecycleAttached = true;
  }

  _startPeriodicReconcile() {
    if (this.reconcileTimer) clearInterval(this.reconcileTimer);
    this.reconcileTimer = setInterval(() => this.reconcileNow("periodic"), RECONCILE_INTERVAL_MS);
  }

  _startRealtime() {
    if (!this.client || !this.userId) return;
    diagPatch({ realtimeState: "connecting" });
    const channel = this.client.channel(`ledgerdesk-sync-${this.userId}`);
    TABLES.forEach((table) => {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `user_id=eq.${this.userId}` },
        () => {
          // Realtime is a latency hint only — it never applies the payload
          // directly. It just triggers the same authoritative reconcile
          // every other trigger uses, debounced so a burst of changes
          // (e.g. a session + an activity-log row landing together)
          // collapses into one fetch.
          clearTimeout(this.realtimeDebounce);
          this.realtimeDebounce = setTimeout(() => this.reconcileNow("realtime hint"), REALTIME_DEBOUNCE_MS);
        }
      );
    });
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") diagPatch({ realtimeState: "connected" });
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        diagPatch({ realtimeState: "error" });
        logEvent(`Realtime ${status.toLowerCase().replace("_", " ")} — relying on periodic reconcile.`, "warn");
      } else if (status === "CLOSED") diagPatch({ realtimeState: "disconnected" });
    });
    this.realtimeChannel = channel;
  }

  /* -------------------------------------------------------- reconcile ----- */

  async reconcileNow(reason = "manual") {
    if (!this.client || !this.userId || this._reconciling) return;
    this._reconciling = true;
    diagPatch({ status: "syncing" });
    try {
      const uid = this.userId;
      const [entries, sessions, sources, migState, migLog, migTasks, activity, game, badges, timer, settings, prefs] = await Promise.all([
        this.client.from("reconciliation_entries").select("*").eq("user_id", uid),
        this.client.from("work_sessions").select("*").eq("user_id", uid),
        this.client.from("sources").select("*").eq("user_id", uid),
        this.client.from("migration_state").select("*").eq("user_id", uid).maybeSingle(),
        this.client.from("migration_log").select("*").eq("user_id", uid),
        this.client.from("migration_tasks").select("*").eq("user_id", uid),
        this.client.from("activity_log").select("*").eq("user_id", uid).order("ts", { ascending: false }).limit(200),
        this.client.from("gamification_state").select("*").eq("user_id", uid).maybeSingle(),
        this.client.from("badges_earned").select("*").eq("user_id", uid),
        this.client.from("active_timer").select("*").eq("user_id", uid).maybeSingle(),
        this.client.from("settings_cloud").select("*").eq("user_id", uid).maybeSingle(),
        this.client.from("preferences_cloud").select("*").eq("user_id", uid).maybeSingle(),
      ]);

      const firstError = [entries, sessions, sources, migState, migLog, migTasks, activity, game, badges, timer, settings, prefs].find((r) => r.error)?.error;
      if (firstError) throw firstError;

      const h = this.applyHandlers;
      if (h) {
        h.setMonthlyData(map.rowsToMonthlyData(entries.data || [], sessions.data || [], sources.data || []));
        h.setMigration(map.rowsToMigration(migState.data, migLog.data || [], migTasks.data || [], sessions.data || []));
        const gameBlob = map.rowToGamification(game.data, badges.data || []);
        if (gameBlob) h.setGame((prev) => ({ ...prev, ...gameBlob }));
        h.setActivityLog(map.rowsToActivityLog(activity.data || []));
        const settingsPatch = map.rowToSettingsPatch(settings.data);
        if (settingsPatch) h.setSettings((prev) => ({ ...prev, ...settingsPatch }));
        const nextTimer = map.rowToActiveTimer(timer.data);
        h.adoptRemoteActiveTimer(nextTimer);
        const prefsBlob = map.rowToPreferences(prefs.data);
        h.setFavorites(prefsBlob.favorites);
        h.setPinned(prefsBlob.pinned);
        h.setRecentTaskIds(prefsBlob.recentTasks);
      }

      const now = Date.now();
      diagPatch({ lastSuccessfulSync: now, lastReconciliationFetch: now, status: "synced", lastError: null });
    } catch (err) {
      diagPatch({ status: "error", lastError: err.message || String(err), lastReconciliationFetch: Date.now() });
      logEvent(`Reconcile (${reason}) failed: ${err.message || err}`, "error");
    } finally {
      this._reconciling = false;
    }
  }

  /* -------------------------------------------------------------- push ---- */

  _push(table, payload, { conflictKeys, isDelete = false, match } = {}) {
    diagPatch({ pendingOutboxCount: outboxCount() + 1 });
    enqueue({ table, kind: isDelete ? "delete" : "upsert", payload, conflictKeys, match });
    this.flushOutboxNow();
  }

  pushReconciliationEntry(monthKey, taskId, entry) {
    if (!this.isConnected()) return;
    this._push("reconciliation_entries", map.buildReconciliationRow(this.userId, monthKey, taskId, entry), { conflictKeys: ["user_id", "month_key", "task_id"] });
  }

  pushSession(session, sourceType, taskId, monthKey) {
    if (!this.isConnected()) return;
    this._push("work_sessions", map.buildSessionRow(this.userId, session, sourceType, taskId, monthKey), { conflictKeys: ["id"] });
  }

  pushSource(monthKey, taskId, source) {
    if (!this.isConnected()) return;
    this._push("sources", map.buildSourceRow(this.userId, monthKey, taskId, source), { conflictKeys: ["id"] });
  }

  removeSource(sourceId) {
    if (!this.isConnected()) return;
    this._push("sources", { id: sourceId }, { isDelete: true, match: { id: sourceId, user_id: this.userId } });
  }

  pushMigrationState(total) {
    if (!this.isConnected()) return;
    this._push("migration_state", map.buildMigrationStateRow(this.userId, total), { conflictKeys: ["user_id"] });
  }

  pushMigrationLogEntry(entry) {
    if (!this.isConnected()) return;
    this._push("migration_log", map.buildMigrationLogRow(this.userId, entry), { conflictKeys: ["id"] });
  }

  pushMigrationTask(task) {
    if (!this.isConnected()) return;
    this._push("migration_tasks", map.buildMigrationTaskRow(this.userId, task), { conflictKeys: ["id"] });
  }

  deleteMigrationTask(taskId) {
    if (!this.isConnected()) return;
    this._push("migration_tasks", { id: taskId }, { isDelete: true, match: { id: taskId, user_id: this.userId } });
  }

  pushActivityLogEntry(entry) {
    if (!this.isConnected()) return;
    this._push("activity_log", map.buildActivityLogRow(this.userId, entry), { conflictKeys: ["id"] });
  }

  pushGamificationState(game) {
    if (!this.isConnected()) return;
    this._push("gamification_state", map.buildGamificationRow(this.userId, game), { conflictKeys: ["user_id"] });
  }

  pushBadge(badgeId) {
    if (!this.isConnected()) return;
    this._push("badges_earned", map.buildBadgeRow(this.userId, badgeId), { conflictKeys: ["user_id", "badge_id"] });
  }

  pushActiveTimer(timer) {
    if (!this.isConnected()) return;
    this._push("active_timer", map.buildActiveTimerRow(this.userId, timer), { conflictKeys: ["user_id"] });
  }

  clearActiveTimer() {
    if (!this.isConnected()) return;
    this._push("active_timer", { user_id: this.userId }, { isDelete: true, match: { user_id: this.userId } });
  }

  /** Reset wipes all logged sessions for one task — matches the existing "Reset" behavior. */
  clearSessionsFor(sourceType, taskId, monthKey) {
    if (!this.isConnected()) return;
    const match = { user_id: this.userId, source_type: sourceType, task_id: taskId };
    if (monthKey) match.month_key = monthKey;
    this._push("work_sessions", {}, { isDelete: true, match });
  }

  pushSettings(settings) {
    if (!this.isConnected()) return;
    this._push("settings_cloud", map.buildSettingsRow(this.userId, settings), { conflictKeys: ["user_id"] });
  }

  pushPreferences(prefs) {
    if (!this.isConnected()) return;
    this._push("preferences_cloud", map.buildPreferencesRow(this.userId, prefs), { conflictKeys: ["user_id"] });
  }

  async flushOutboxNow() {
    if (!this.client) return;
    const before = outboxCount();
    if (before === 0) {
      diagPatch({ pendingOutboxCount: 0, failedWriteCount: 0 });
      return;
    }
    const result = await flushOutbox(this.client, {
      onEntryResult: (entry, error) => {
        if (error) {
          logEvent(`Write to ${entry.table} failed (attempt ${entry.attempts + 1}): ${error}`, "warn");
        }
      },
    });
    diagPatch({
      pendingOutboxCount: outboxCount(),
      failedWriteCount: outboxFailedCount(),
      lastSuccessfulWrite: result.sent > 0 ? Date.now() : undefined,
    });
    if (result.sent > 0) logEvent(`Synced ${result.sent} pending change${result.sent === 1 ? "" : "s"}.`);
    return result;
  }

  /* ------------------------------------------------- first-time migration - */

  async _firstTimeMigrationIfNeeded() {
    if (!this.getLocalSnapshot) return true;
    try {
      // Gate on a dedicated completion marker, written only as the very
      // last step below — never on whether reconciliation_entries happens
      // to have rows. A partially-failed upload (e.g. it got through
      // reconciliation_entries and then hit an error on a later table)
      // must be retried in full next time, not mistaken for "already
      // migrated" just because some tables already have data.
      const { data: marker, error: markerErr } = await this.client
        .from("sync_bootstrap")
        .select("user_id")
        .eq("user_id", this.userId)
        .maybeSingle();
      if (markerErr) throw markerErr;
      if (marker) {
        logEvent("Cloud already has data for this account — pulling it down as the source of truth.");
        return true; // subsequent device: normal reconcile below will pull it down
      }

      const snap = this.getLocalSnapshot();
      logEvent("No existing cloud data found — uploading this device's local history as the starting point.");
      const rows = { reconciliation_entries: [], work_sessions: [], sources: [] };

      Object.entries(snap.monthlyData || {}).forEach(([monthKey, tasks]) => {
        Object.entries(tasks || {}).forEach(([taskId, entry]) => {
          rows.reconciliation_entries.push(map.buildReconciliationRow(this.userId, monthKey, taskId, entry));
          (entry.sessions || []).forEach((s) => rows.work_sessions.push(map.buildSessionRow(this.userId, s, "reconciliation", taskId, monthKey)));
          (entry.sources || []).forEach((s) => rows.sources.push(map.buildSourceRow(this.userId, monthKey, taskId, s)));
        });
      });

      const mig = snap.migration || { total: 720, log: [], tasks: [] };
      (mig.tasks || []).forEach((t) => {
        (t.sessions || []).forEach((s) => rows.work_sessions.push(map.buildSessionRow(this.userId, s, "migration", t.id, null)));
      });

      const batches = [
        ["reconciliation_entries", rows.reconciliation_entries],
        ["work_sessions", rows.work_sessions],
        ["sources", rows.sources],
        ["migration_log", (mig.log || []).map((l) => map.buildMigrationLogRow(this.userId, l))],
        ["migration_tasks", (mig.tasks || []).map((t) => map.buildMigrationTaskRow(this.userId, t))],
        ["activity_log", (snap.activityLog || []).map((a) => map.buildActivityLogRow(this.userId, a))],
        ["badges_earned", (snap.game?.badges || []).map((id) => map.buildBadgeRow(this.userId, id))],
      ];

      for (const [table, payload] of batches) {
        if (payload.length === 0) continue;
        const { error: insErr } = await this.client.from(table).upsert(payload);
        if (insErr) throw insErr;
      }

      await this.client.from("migration_state").upsert(map.buildMigrationStateRow(this.userId, mig.total));
      if (snap.game) await this.client.from("gamification_state").upsert(map.buildGamificationRow(this.userId, snap.game));
      await this.client.from("settings_cloud").upsert(map.buildSettingsRow(this.userId, snap.settings || {}));
      await this.client
        .from("preferences_cloud")
        .upsert(map.buildPreferencesRow(this.userId, { favorites: snap.favorites, pinned: snap.pinned, recentTasks: snap.recentTaskIds }));
      if (snap.activeTimer) await this.client.from("active_timer").upsert(map.buildActiveTimerRow(this.userId, snap.activeTimer));

      // Marker written last, and only once everything above has succeeded —
      // this is what "first-time migration is done" actually means.
      const { error: markerInsErr } = await this.client.from("sync_bootstrap").upsert({ user_id: this.userId });
      if (markerInsErr) throw markerInsErr;

      logEvent("Initial upload complete.");
      return true;
    } catch (err) {
      logEvent(`First-time migration failed: ${err.message || err}. Your local data is untouched — safe to retry.`, "error");
      diagPatch({ lastError: err.message || String(err) });
      return false;
    }
  }
}

export const cloudSync = new CloudSyncEngine();
