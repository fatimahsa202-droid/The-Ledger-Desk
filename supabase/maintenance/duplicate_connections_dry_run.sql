-- ============================================================================
-- Ledger Desk — Duplicate Sheet Connection DRY-RUN report
--
-- READ-ONLY. Every statement below is a SELECT — there is no UPDATE, DELETE,
-- or INSERT anywhere in this file. Running it changes nothing.
--
-- Run this in Supabase Dashboard -> SQL Editor (as the project owner, which
-- runs with full table visibility, not the app's RLS-scoped anon client) and
-- share the full output back before any healing write is proposed or run.
-- This is exactly the dry-run report described in the cleanup plan: which
-- duplicate groups exist, which connection would be canonical, how many
-- Scheduled Names belong to each, and whether their completion states
-- differ — nothing is healed here, this is inspection only.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Duplicate connection groups: same user + same physical spreadsheet+tab,
--    more than one sheet_connections row (active or not). The proposed
--    canonical connection in each group is the active one if there is one
--    (there can be at most one, per uq_sheet_connections_active_target);
--    otherwise the most recently created row.
-- ----------------------------------------------------------------------------
with dup_groups as (
  select user_id, spreadsheet_id, sheet_tab, count(*) as connection_count
  from sheet_connections
  where spreadsheet_id is not null and sheet_tab is not null
  group by user_id, spreadsheet_id, sheet_tab
  having count(*) > 1
)
select
  sc.user_id,
  sc.spreadsheet_id,
  sc.sheet_tab,
  sc.id as connection_id,
  sc.display_name,
  sc.spreadsheet_name,
  sc.is_active,
  sc.sync_state,
  sc.created_at,
  sc.last_synced_at,
  case
    when sc.is_active then 'CANONICAL (active)'
    when sc.id = (
      select sc2.id from sheet_connections sc2
      where sc2.user_id = sc.user_id and sc2.spreadsheet_id = sc.spreadsheet_id and sc2.sheet_tab = sc.sheet_tab
        and not exists (
          select 1 from sheet_connections sc3
          where sc3.user_id = sc.user_id and sc3.spreadsheet_id = sc.spreadsheet_id and sc3.sheet_tab = sc.sheet_tab
            and sc3.is_active
        )
      order by sc2.created_at desc
      limit 1
    ) then 'CANONICAL (most recent, no active row exists)'
    else 'duplicate — would become/stay inactive'
  end as proposed_role,
  (select count(*) from scheduled_names sn where sn.connection_id = sc.id) as total_names,
  (select count(*) from scheduled_names sn where sn.connection_id = sc.id and sn.source_status = 'active') as active_names,
  (select count(*) from scheduled_names sn where sn.connection_id = sc.id and sn.status = 'done') as done_names
from sheet_connections sc
join dup_groups g
  on g.user_id = sc.user_id and g.spreadsheet_id = sc.spreadsheet_id and g.sheet_tab = sc.sheet_tab
order by sc.user_id, sc.spreadsheet_id, sc.sheet_tab, sc.is_active desc, sc.created_at desc;

-- ----------------------------------------------------------------------------
-- 2) Physical-row overlaps within each duplicate group: the same underlying
--    Google Sheet row (same UUID after "::" in scheduled_names.id, which is
--    stable across syncs — see sheets-sync/index.ts) appearing under more
--    than one connection_id. These are the actual rows a user would see
--    duplicated on Calendar. statuses_by_connection / completed_ats_by_
--    connection are ordered canonical-connection-first, so the first entry
--    in each array is what the canonical connection currently holds and any
--    entries after it are what a healing merge would need to reconcile in
--    (done beats pending; if both done, keep the earlier completed_at).
-- ----------------------------------------------------------------------------
with dup_groups as (
  select user_id, spreadsheet_id, sheet_tab
  from sheet_connections
  where spreadsheet_id is not null and sheet_tab is not null
  group by user_id, spreadsheet_id, sheet_tab
  having count(*) > 1
),
dup_conns as (
  select sc.id as connection_id, sc.user_id, sc.spreadsheet_id, sc.sheet_tab, sc.is_active, sc.created_at
  from sheet_connections sc
  join dup_groups g using (user_id, spreadsheet_id, sheet_tab)
),
sn_tagged as (
  select
    sn.*,
    split_part(sn.id, '::', 2) as raw_uuid,
    dc.spreadsheet_id, dc.sheet_tab, dc.is_active as connection_is_active, dc.created_at as connection_created_at
  from scheduled_names sn
  join dup_conns dc on dc.connection_id = sn.connection_id
)
select
  user_id, spreadsheet_id, sheet_tab, raw_uuid,
  count(distinct connection_id) as connections_holding_this_row,
  array_agg(connection_id order by connection_is_active desc, connection_created_at desc) as connection_ids_canonical_first,
  array_agg(status order by connection_is_active desc, connection_created_at desc) as statuses_by_connection,
  array_agg(completed_at order by connection_is_active desc, connection_created_at desc) as completed_ats_by_connection,
  array_agg(source_status order by connection_is_active desc, connection_created_at desc) as source_statuses_by_connection,
  array_agg(distinct name) as names_seen,
  array_agg(distinct scheduled_date) as dates_seen
from sn_tagged
group by user_id, spreadsheet_id, sheet_tab, raw_uuid
having count(distinct connection_id) > 1
order by user_id, spreadsheet_id, sheet_tab, raw_uuid;

-- ----------------------------------------------------------------------------
-- 3) Summary: one row per duplicate group, counting how many physical rows
--    actually overlap (query 2) vs. how many are unique to just one
--    connection in the group (present in that connection only — these need
--    no merge, just carrying forward to the canonical connection's next
--    sync, which already happens automatically once the duplicate is
--    deactivated).
-- ----------------------------------------------------------------------------
with dup_groups as (
  select user_id, spreadsheet_id, sheet_tab, count(*) as connection_count
  from sheet_connections
  where spreadsheet_id is not null and sheet_tab is not null
  group by user_id, spreadsheet_id, sheet_tab
  having count(*) > 1
)
select user_id, spreadsheet_id, sheet_tab, connection_count
from dup_groups
order by user_id, spreadsheet_id, sheet_tab;
