-- ============================================================================
-- Ledger Desk — Phase A fix: dedicated bootstrap marker for Phase A metadata
--
-- Root cause this fixes: an account that already had a pre-Phase-A
-- sync_bootstrap row (from Update 1A, before task_definitions/categories/
-- task_occurrences existed) skipped the original first-time upload
-- entirely, because that upload is gated on the SAME marker. Its Phase A
-- tables started empty and only grew one row at a time as individual items
-- were edited — and the client's old reconcile guard treated any non-empty
-- (but still partial) cloud result as complete, truncating local state to
-- match. Categories collapsed to whichever single row had been pushed.
--
-- Fix: a second, dedicated marker column. The client (see
-- CloudSyncEngine.js's _phaseAMigrationIfNeeded) now checks THIS column
-- specifically, heals only whatever built-in categories/task definitions
-- are completely missing from the cloud (never touching one that's already
-- there, in any form — renamed, archived, edited), uploads just the
-- missing rows, and only then sets this column. Reconcile never applies a
-- Phase A pull for task_definitions/categories/task_occurrences until this
-- column is set for the account, no matter how many rows come back.
--
-- Purely additive: one nullable column on the existing sync_bootstrap
-- table. Does not touch any row, in any table. Safe to run once, and safe
-- to re-run (IF NOT EXISTS) if you're unsure whether it already applied.
-- Run after 002_phase_a_dynamic_tasks.sql.
-- ============================================================================

begin;

alter table sync_bootstrap add column if not exists phase_a_migrated_at timestamptz;

commit;
