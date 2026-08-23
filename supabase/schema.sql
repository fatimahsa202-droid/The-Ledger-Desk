-- ============================================================================
-- Ledger Desk — Cloud Sync schema (Update 1A)
--
-- Design principles this schema implements:
--  - Granular, per-entity tables (not one JSON blob per storage key) so
--    unrelated edits on different devices are never false conflicts.
--  - updated_at is stamped by a server-side trigger, never trusted from the
--    client — client clocks can be wrong or skewed; the server's clock is
--    the one honest reference for last-write-wins conflict resolution and
--    stale-device detection.
--  - Rows that represent an event (a session, a log entry, a badge unlock)
--    use a client-generated UUID as their primary key, so a retried write
--    after a dropped connection is a safe no-op (ON CONFLICT DO NOTHING),
--    never a duplicate.
--  - active_timer is a singleton per user (user_id is the primary key), so
--    "at most one active timer" is enforced by the database itself, not by
--    application logic that could race.
--  - Every table is scoped to auth.uid() via Row Level Security. Run this
--    whole file once, in order, in the Supabase SQL Editor.
-- ============================================================================

begin;

-- Reusable trigger: stamp updated_at with the server's clock on every UPDATE.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ----------------------------------------------------------------------------
-- 1. Reconciliation entries — one row per (month, task). This is the core
--    13-category / 53-task dataset: status, completion time, and notes.
-- ----------------------------------------------------------------------------
create table reconciliation_entries (
  user_id uuid not null references auth.users(id) on delete cascade,
  month_key text not null,
  task_id text not null,
  status text not null default 'pending' check (status in ('pending','in-progress','done')),
  completed_at timestamptz,
  notes text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, month_key, task_id)
);
alter table reconciliation_entries enable row level security;
create policy "own rows" on reconciliation_entries for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger trg_updated_at before update on reconciliation_entries
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- 2. Work sessions — one row per timer session, for either a reconciliation
--    task or a migration task. Client-generated id makes retries safe.
--    id is `text`, not `uuid`: the app's own id generator (uid(), in
--    src/lib/format.js) produces short base36 strings like "wayumanf", not
--    RFC 4122 UUIDs — this column has to accept that native format as-is.
-- ----------------------------------------------------------------------------
create table work_sessions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('reconciliation','migration')),
  task_id text not null,
  month_key text,                      -- null for migration sessions
  start_at timestamptz not null,
  end_at timestamptz not null,
  duration_seconds integer not null,
  created_at timestamptz not null default now()
);
alter table work_sessions enable row level security;
create policy "own rows" on work_sessions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index idx_work_sessions_user on work_sessions(user_id, start_at);

-- ----------------------------------------------------------------------------
-- 3. Source links attached to a task/month.
-- ----------------------------------------------------------------------------
create table sources (
  id text primary key, -- see note on work_sessions.id above: app-native id format, not uuid
  user_id uuid not null references auth.users(id) on delete cascade,
  month_key text not null,
  task_id text not null,
  label text not null,
  link text not null default '',
  created_at timestamptz not null default now()
);
alter table sources enable row level security;
create policy "own rows" on sources for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 4. Migration state — the "total names" counter (singleton per user).
-- ----------------------------------------------------------------------------
create table migration_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  total integer not null default 720,
  updated_at timestamptz not null default now()
);
alter table migration_state enable row level security;
create policy "own row" on migration_state for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger trg_updated_at before update on migration_state
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- 5. Migration log — append-only batch entries.
-- ----------------------------------------------------------------------------
create table migration_log (
  id text primary key, -- see note on work_sessions.id above: app-native id format, not uuid
  user_id uuid not null references auth.users(id) on delete cascade,
  ts timestamptz not null,
  change integer not null,
  total_after integer not null,
  note text not null default '',
  created_at timestamptz not null default now()
);
alter table migration_log enable row level security;
create policy "own rows" on migration_log for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 6. Migration tasks — the ad-hoc task list inside Data Migration.
-- ----------------------------------------------------------------------------
create table migration_tasks (
  id text primary key, -- see note on work_sessions.id above: app-native id format, not uuid
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  status text not null default 'pending' check (status in ('pending','in-progress','done')),
  notes text not null default '',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table migration_tasks enable row level security;
create policy "own rows" on migration_tasks for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger trg_updated_at before update on migration_tasks
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- 7. Activity log — append-only Recent Activity feed.
-- ----------------------------------------------------------------------------
create table activity_log (
  id text primary key, -- see note on work_sessions.id above: app-native id format, not uuid
  user_id uuid not null references auth.users(id) on delete cascade,
  ts timestamptz not null,
  type text not null,
  task_id text,
  month_key text,
  message text not null,
  created_at timestamptz not null default now()
);
alter table activity_log enable row level security;
create policy "own rows" on activity_log for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index idx_activity_log_user on activity_log(user_id, ts desc);

-- ----------------------------------------------------------------------------
-- 8. Gamification state — XP, streak, claimed-date flags (singleton).
-- ----------------------------------------------------------------------------
create table gamification_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  xp integer not null default 0,
  streak integer not null default 0,
  last_active_date text,
  daily_goal_claimed_date text,
  daily_challenge_claimed_date text,
  showcase_badge text,
  month_closed_at jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table gamification_state enable row level security;
create policy "own row" on gamification_state for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger trg_updated_at before update on gamification_state
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- 9. Badges earned — append-only unlock events.
-- ----------------------------------------------------------------------------
create table badges_earned (
  user_id uuid not null references auth.users(id) on delete cascade,
  badge_id text not null,
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);
alter table badges_earned enable row level security;
create policy "own rows" on badges_earned for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 10. Active timer — singleton per user. The primary key on user_id is what
--     guarantees "at most one active timer," enforced by Postgres itself.
-- ----------------------------------------------------------------------------
create table active_timer (
  user_id uuid primary key references auth.users(id) on delete cascade,
  kind text not null check (kind in ('recon','migration')),
  task_id text not null,
  month_key text,
  started_at timestamptz not null,
  device_label text,
  updated_at timestamptz not null default now()
);
alter table active_timer enable row level security;
create policy "own row" on active_timer for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 11. Settings — only the two fields that are meant to sync across devices
--     (theme/sound/etc. deliberately stay device-local, never written here).
-- ----------------------------------------------------------------------------
create table settings_cloud (
  user_id uuid primary key references auth.users(id) on delete cascade,
  closing_deadline_day integer not null default 5,
  daily_goal_tasks integer not null default 3,
  -- Business rule (Phase A), not a device preference — 0=Sun..6=Sat.
  -- Default: Sunday-Thursday working, Friday-Saturday weekend.
  working_days jsonb not null default '[0,1,2,3,4]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table settings_cloud enable row level security;
create policy "own row" on settings_cloud for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger trg_updated_at before update on settings_cloud
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- 12. Preferences — favorites / pinned / recently opened tasks (singleton).
-- ----------------------------------------------------------------------------
create table preferences_cloud (
  user_id uuid primary key references auth.users(id) on delete cascade,
  favorites jsonb not null default '[]'::jsonb,
  pinned jsonb not null default '[]'::jsonb,
  recent_tasks jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table preferences_cloud enable row level security;
create policy "own row" on preferences_cloud for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger trg_updated_at before update on preferences_cloud
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- 13. Task Definitions (Phase A) — the editable accounting task library. The
--     original 53 tasks migrate in with id = their existing task_id string
--     (not a uuid) and legacy_monthly_storage = true, so their history keeps
--     living in reconciliation_entries exactly as before; this table's rows
--     for them are metadata only (name/category/priority), never occurrence
--     data — unless/until the user explicitly graduates one (see below).
--
--     Identity: the built-in 53/13 use fixed ids (e.g. "bank-charges") that
--     are the same string for every account, and occurrence ids are
--     likewise deterministic with no per-user salt — so, exactly like
--     reconciliation_entries' `primary key (user_id, month_key, task_id)`,
--     these tables are keyed by `(user_id, id)`, not `id` alone. A bare
--     `id text primary key` would be one global uniqueness constraint that
--     RLS does not shard, so a second account could never insert the same
--     built-in id. See CloudSyncEngine.js's conflictKeys for the matching
--     upsert targets.
-- ----------------------------------------------------------------------------
create table task_definitions (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category_id text not null,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'critical')),
  frequency text not null check (frequency in ('once', 'weekly', 'monthly', 'yearly', 'custom')),
  monthly_rule jsonb,
  weekdays jsonb not null default '[]'::jsonb,
  every_n_weeks integer not null default 1,
  yearly_rule jsonb,
  custom_rule jsonb,
  due_date timestamptz,
  notes text not null default '',
  timer_eligible boolean not null default true,
  is_built_in boolean not null default false,
  legacy_monthly_storage boolean not null default false,
  -- Set once, by explicit user choice, when a legacy task is moved onto this
  -- recurrence engine (see ManageTasks.jsx). null = still fully legacy.
  -- Occurrences are only ever generated on/after this date; every month
  -- before it stays in reconciliation_entries, untouched, forever.
  graduated_from timestamptz,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table task_definitions enable row level security;
create policy "own rows" on task_definitions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger trg_updated_at before update on task_definitions
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- 14. Categories (Phase A) — the editable version of the original 13
--     categories.
-- ----------------------------------------------------------------------------
create table categories (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  icon text,
  color text,
  order_index integer not null default 0,
  is_built_in boolean not null default false,
  archived boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table categories enable row level security;
create policy "own rows" on categories for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger trg_updated_at before update on categories
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- 15. Task Occurrences (Phase A) — one row per generated occurrence: for
--     every non-legacy (new) task definition from day one, and for a
--     graduated legacy definition (graduated_from set), one row per period
--     on/after that date. Periods before graduated_from — and every legacy
--     definition never graduated — have no rows here; that history lives
--     in reconciliation_entries exactly as before. id =
--     `${definitionId}::${periodKey}`, deterministic within one account,
--     so re-running generation from any device is always a safe no-op
--     upsert — never a duplicate — and (user_id, id) together is what
--     makes it safe across accounts too.
-- ----------------------------------------------------------------------------
create table task_occurrences (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  definition_id text not null,
  period_key text not null,
  -- Snapshot fields, frozen at generation time (see AppDataProvider.jsx /
  -- occurrenceEngine.js) — editing the definition later never rewrites an
  -- occurrence that already exists.
  name text not null,
  category_id text,
  priority text,
  monthly_rule_kind text,
  due_date timestamptz,
  status text not null default 'pending' check (status in ('pending', 'done')),
  completed_at timestamptz,
  notes text not null default '',
  time_seconds integer not null default 0,
  sessions jsonb not null default '[]'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table task_occurrences enable row level security;
create policy "own rows" on task_occurrences for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger trg_updated_at before update on task_occurrences
  for each row execute function set_updated_at();
create index idx_task_occurrences_definition on task_occurrences(user_id, definition_id);

-- ----------------------------------------------------------------------------
-- 16. Sync bootstrap — a definitive per-user "first-time migration
--     completed" marker, written only after every table above has been
--     uploaded successfully. Deliberately not the same signal as "does
--     reconciliation_entries have rows": a migration that fails partway
--     through (e.g. after reconciliation_entries but before work_sessions)
--     must be retried in full next time, not mistaken for done. Not synced
--     data, so not added to the realtime publication below.
--
--     phase_a_migrated_at is a second, independent marker for the Phase A
--     tables specifically (task_definitions/categories/task_occurrences) —
--     an account whose completed_at predates Phase A must not be assumed
--     to have Phase A metadata too. See CloudSyncEngine.js's
--     _phaseAMigrationIfNeeded and supabase/migrations/003_phase_a_
--     bootstrap_marker.sql for why this is a separate column, not reused.
-- ----------------------------------------------------------------------------
create table sync_bootstrap (
  user_id uuid primary key references auth.users(id) on delete cascade,
  completed_at timestamptz not null default now(),
  phase_a_migrated_at timestamptz
);
alter table sync_bootstrap enable row level security;
create policy "own row" on sync_bootstrap for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- Google Sheets: Scheduled Names — see supabase/migrations/004_scheduled_
-- names.sql for full rationale (identity model, security model). Fully
-- independent of every table above; nothing here feeds accounting/
-- reconciliation completion totals.
-- ----------------------------------------------------------------------------
create table sheet_connections (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Google consent must happen BEFORE the user can pick a spreadsheet
  -- (the Picker itself needs an access token to run), so a connection
  -- genuinely exists in an incomplete state for a little while: the row
  -- is created the moment OAuth succeeds (sync_state = 'pending_setup'),
  -- with spreadsheet/tab left null until the user finishes Picker +
  -- column mapping and presses Connect. The check constraint below is
  -- what makes "incomplete" a real, honest state rather than empty
  -- strings standing in for null.
  display_name text not null default '',
  spreadsheet_id text,
  spreadsheet_name text not null default '',
  sheet_tab text,
  -- {"name": "Patient", "date": "Appointment Date"} today; a jsonb map so
  -- an optional third mapped field later is a new key here, not a new
  -- column / migration.
  column_mapping jsonb not null default '{}'::jsonb,
  -- The exact header text of Ledger Desk's own appended identity column in
  -- this sheet, re-located by this text on every sync rather than by a
  -- remembered index (an index can drift if the user adds their own
  -- columns). Null until the first successful setup sync creates it.
  id_column_header text,
  sync_state text not null default 'pending_setup'
    check (sync_state in ('pending_setup', 'idle', 'syncing', 'error', 'id_column_missing', 'reauth_required')),
  last_synced_at timestamptz,
  last_sync_error text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Once setup is no longer pending, the target sheet/tab must be real —
  -- "incomplete" is only a valid state while sync_state = 'pending_setup'.
  check (sync_state = 'pending_setup' or (spreadsheet_id is not null and sheet_tab is not null))
);
alter table sheet_connections enable row level security;
create policy "own rows" on sheet_connections for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger trg_updated_at before update on sheet_connections
  for each row execute function set_updated_at();
create index idx_sheet_connections_user on sheet_connections(user_id);
create unique index uq_sheet_connections_active_target
  on sheet_connections(user_id, spreadsheet_id, sheet_tab)
  where is_active;

-- Server-only — RLS enabled with NO policies for authenticated/anon
-- (default-deny). Only reachable via service_role inside an Edge Function.
create table google_oauth_tokens (
  connection_id text primary key references sheet_connections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  refresh_token text not null,
  access_token text,
  access_token_expires_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table google_oauth_tokens enable row level security;
create trigger trg_updated_at before update on google_oauth_tokens
  for each row execute function set_updated_at();

-- id = `${connectionId}::${rawSheetRowUuid}` — same composite-string
-- pattern as task_occurrences.id, so two different Ledger Desk accounts
-- reading the identical physical Sheet never collide or share state.
create table scheduled_names (
  id text primary key,
  connection_id text not null references sheet_connections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  scheduled_date date not null,
  source_status text not null default 'active' check (source_status in ('active', 'removed')),
  status text not null default 'pending' check (status in ('pending', 'done')),
  completed_at timestamptz,
  extra_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table scheduled_names enable row level security;
create policy "own rows" on scheduled_names for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger trg_updated_at before update on scheduled_names
  for each row execute function set_updated_at();
create index idx_scheduled_names_connection on scheduled_names(connection_id);
create index idx_scheduled_names_user_date on scheduled_names(user_id, scheduled_date);

-- ----------------------------------------------------------------------------
-- Realtime: publish change events for every synced table (used purely as a
-- latency optimization by the client — never as the sole correctness path).
-- ----------------------------------------------------------------------------
alter publication supabase_realtime add table
  reconciliation_entries,
  work_sessions,
  sources,
  migration_state,
  migration_log,
  migration_tasks,
  activity_log,
  gamification_state,
  badges_earned,
  active_timer,
  settings_cloud,
  preferences_cloud,
  task_definitions,
  categories,
  task_occurrences,
  sheet_connections,
  scheduled_names;

commit;
