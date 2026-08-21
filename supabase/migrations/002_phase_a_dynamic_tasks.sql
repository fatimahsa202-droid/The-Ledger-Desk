-- ============================================================================
-- Ledger Desk — Phase A: Dynamic Task Foundation
--
-- Adds three new tables (task_definitions, categories, task_occurrences)
-- and one new column (settings_cloud.working_days). Purely additive —
-- does not touch reconciliation_entries, work_sessions, sources, or any
-- other existing table. Run this once against your existing project,
-- after 001_fix_id_types_and_bootstrap_marker.sql.
--
-- Same principles as every other table in this schema: granular rows
-- (not JSON blobs), client-generated deterministic ids for idempotent
-- upsert, updated_at stamped by the server (never trusted from the
-- client), RLS scoped to auth.uid() on every table.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Task Definitions — the editable accounting task library. The original
--    53 tasks migrate in with id = their existing task_id string (not a
--    uuid) and legacy_monthly_storage = true, so their history keeps living
--    in reconciliation_entries exactly as before; this table's rows for
--    them are metadata only (name/category/priority), never occurrence
--    data.
-- ----------------------------------------------------------------------------
create table task_definitions (
  id text primary key,
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
  updated_at timestamptz not null default now()
);
alter table task_definitions enable row level security;
create policy "own rows" on task_definitions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger trg_updated_at before update on task_definitions
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- 2. Categories — the editable version of the original 13 categories.
-- ----------------------------------------------------------------------------
create table categories (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  icon text,
  color text,
  order_index integer not null default 0,
  is_built_in boolean not null default false,
  archived boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table categories enable row level security;
create policy "own rows" on categories for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger trg_updated_at before update on categories
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. Task Occurrences — one row per generated occurrence, for every
--    definition EXCEPT the legacy-storage ones (those keep using
--    reconciliation_entries). id = `${definitionId}::${periodKey}`,
--    deterministic, so re-running generation from any device is always a
--    safe no-op upsert — never a duplicate.
-- ----------------------------------------------------------------------------
create table task_occurrences (
  id text primary key,
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
  updated_at timestamptz not null default now()
);
alter table task_occurrences enable row level security;
create policy "own rows" on task_occurrences for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger trg_updated_at before update on task_occurrences
  for each row execute function set_updated_at();
create index idx_task_occurrences_definition on task_occurrences(user_id, definition_id);

-- ----------------------------------------------------------------------------
-- 4. Working Days — a business-rule setting, not a device preference, so it
--    lives on settings_cloud alongside closing_deadline_day. Default:
--    Sunday-Thursday working, Friday-Saturday weekend (0=Sun..6=Sat).
-- ----------------------------------------------------------------------------
alter table settings_cloud add column if not exists working_days jsonb not null default '[0,1,2,3,4]'::jsonb;

-- ----------------------------------------------------------------------------
-- Realtime — latency hint only, same as every other table.
-- ----------------------------------------------------------------------------
alter publication supabase_realtime add table task_definitions, categories, task_occurrences;
