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
-- 13. Sync bootstrap — a definitive per-user "first-time migration
--     completed" marker, written only after every table above has been
--     uploaded successfully. Deliberately not the same signal as "does
--     reconciliation_entries have rows": a migration that fails partway
--     through (e.g. after reconciliation_entries but before work_sessions)
--     must be retried in full next time, not mistaken for done. Not synced
--     data, so not added to the realtime publication below.
-- ----------------------------------------------------------------------------
create table sync_bootstrap (
  user_id uuid primary key references auth.users(id) on delete cascade,
  completed_at timestamptz not null default now()
);
alter table sync_bootstrap enable row level security;
create policy "own row" on sync_bootstrap for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

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
  preferences_cloud;
