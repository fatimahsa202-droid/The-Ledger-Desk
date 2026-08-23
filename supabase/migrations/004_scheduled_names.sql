-- ============================================================================
-- Ledger Desk — Google Sheets: Scheduled Names
--
-- Adds three new tables, fully independent of the accounting schema
-- (reconciliation_entries, task_definitions, task_occurrences, etc.) —
-- purely additive, does not touch or reference any existing table.
-- Run this once against your existing project, after
-- 003_phase_a_bootstrap_marker.sql.
--
-- Identity model: unlike task_definitions/task_occurrences (deterministic,
-- cross-account-colliding ids that need a composite (user_id, id) primary
-- key), every id here is a randomly generated UUID string, minted once by
-- the sheets-sync Edge Function the first time it sees a given sheet row
-- and written into that row's own hidden identity column in the user's
-- Google Sheet — so a bare `id text primary key` is safe, matching the
-- same convention already used for work_sessions/sources (app-generated
-- random ids, see schema.sql).
--
-- Security model: sheet_connections and scheduled_names carry no secrets
-- and use the exact same per-user RLS policy as every other table in this
-- schema. google_oauth_tokens is different on purpose — it holds the
-- Google refresh token — and gets RLS enabled with ZERO policies for
-- `authenticated`/`anon`, which is a default-deny: no client-side request
-- can ever read or write it, under any circumstance. Only Supabase Edge
-- Functions, using the service_role key (which Supabase injects into the
-- Edge Function runtime automatically — never present in this repo or the
-- GitHub Pages bundle), can reach it, since service_role bypasses RLS.
--
-- Wrapped in a transaction, same as every other migration here.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Sheet Connections — one row per Google Sheet+Tab the user has
--    connected. Holds only non-secret configuration: which spreadsheet/tab,
--    which columns map to Name/Date, and the connection's own sync status.
--    No Google credential of any kind lives here.
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
-- A given spreadsheet+tab may only be actively connected once at a time —
-- prevents two connections from racing to write two different identity
-- columns into the same tab.
create unique index uq_sheet_connections_active_target
  on sheet_connections(user_id, spreadsheet_id, sheet_tab)
  where is_active;

-- ----------------------------------------------------------------------------
-- 2. Google OAuth Tokens — server-only. Deliberately NO policies for
--    authenticated/anon: RLS is enabled with an empty policy set, which is
--    a default-deny. Only reachable via service_role inside an Edge
--    Function. Never returned to, or writable from, the browser.
-- ----------------------------------------------------------------------------
create table google_oauth_tokens (
  connection_id text primary key references sheet_connections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  refresh_token text not null,
  access_token text,
  access_token_expires_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table google_oauth_tokens enable row level security;
-- No policies created on purpose — see header comment.
create trigger trg_updated_at before update on google_oauth_tokens
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. Scheduled Names — the imported rows themselves. `id` is
--    `${connectionId}::${rawSheetRowUuid}` — the SAME deterministic-
--    composite-string pattern already used for task_occurrences.id
--    (`${definitionId}::${periodKey}`) elsewhere in this schema, and for
--    the same reason: the raw UUID actually written into the user's
--    spreadsheet cell is just a short, plain, per-row id with no notion
--    of which Ledger Desk account is reading it, so it is NOT globally
--    unique on its own — if the identical physical spreadsheet is ever
--    connected by two different Ledger Desk accounts (e.g. a shared
--    clinic Sheet, two staff logins), both would see the same raw UUID.
--    Prefixing with connection_id (which always belongs to exactly one
--    user_id) keeps every account's rows — and completion state —
--    fully independent and non-colliding, without the Sheet itself ever
--    needing to know or store anything account-specific. Matching an
--    incoming sheet row to its Supabase record is still a plain equality
--    lookup, never a heuristic — just keyed by the composite string
--    rather than the bare raw UUID. Completion (`status`,
--    `completed_at`) is Ledger Desk-owned and is NEVER written by the
--    sync path — only Complete/Reopen actions touch those two columns.
--    Conceptually and technically separate from every accounting table;
--    nothing here is read by, or feeds into, reconciliation/occurrence
--    completion totals.
-- ----------------------------------------------------------------------------
create table scheduled_names (
  id text primary key,
  connection_id text not null references sheet_connections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  scheduled_date date not null,
  -- 'active' = currently present in the source sheet. 'removed' = no
  -- longer found there as of the last successful sync — never deleted,
  -- never hard-removed, so history/completion is preserved and the row
  -- can safely flip back to 'active' if it reappears.
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
-- Realtime — latency hint only, same as every other table. Deliberately
-- excludes google_oauth_tokens.
-- ----------------------------------------------------------------------------
alter publication supabase_realtime add table sheet_connections, scheduled_names;

commit;
