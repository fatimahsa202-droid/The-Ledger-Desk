-- ============================================================================
-- Ledger Desk — Cloud Sync fix-up migration
--
-- Run this once against your existing project (the one where schema.sql
-- already ran). It does two things, both safe and non-destructive:
--
-- 1. Changes work_sessions.id, sources.id, migration_log.id,
--    migration_tasks.id, and activity_log.id from `uuid` to `text`.
--    The app's own id generator (uid(), in src/lib/format.js) produces
--    short base36 strings like "wayumanf" — never real UUIDs — so the
--    original `uuid` column type was wrong from the start. These five
--    tables are currently empty for you (the first-time migration failed
--    before writing any rows to them), so this ALTER touches zero rows.
--    reconciliation_entries is untouched — it never used a uuid id column,
--    and whatever rows already landed there stay exactly as they are.
--
-- 2. Adds a new `sync_bootstrap` table: a definitive per-user "first-time
--    migration completed" marker. Ledger Desk previously inferred "already
--    migrated" from whether reconciliation_entries had rows, which is
--    exactly the check that misfired for you — reconciliation_entries had
--    already been written before the uuid error stopped the rest of the
--    upload, so a retry would have skipped everything else, thinking
--    migration was done. This table removes that ambiguity.
-- ============================================================================

alter table work_sessions   alter column id type text using id::text;
alter table sources         alter column id type text using id::text;
alter table migration_log   alter column id type text using id::text;
alter table migration_tasks alter column id type text using id::text;
alter table activity_log    alter column id type text using id::text;

create table if not exists sync_bootstrap (
  user_id uuid primary key references auth.users(id) on delete cascade,
  completed_at timestamptz not null default now()
);
alter table sync_bootstrap enable row level security;
create policy "own row" on sync_bootstrap for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
