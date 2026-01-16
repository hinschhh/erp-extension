-- Create or replace helper to start an inventory session and snapshot stock levels atomically
create or replace function public.start_inventory_session(
  p_name text,
  p_note text default null
)
returns public.app_inventory_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.app_inventory_sessions;
begin
  -- ensure caller is authenticated
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- create session and mark counting with snapshot timestamp
  insert into public.app_inventory_sessions
    (name, note, status, counting_started_at, snapshot_taken_at, created_at)
  values
    (p_name, p_note, 'counting', now(), now(), now())
  returning * into v_session;

  -- snapshot current stock levels (one row per app_stock_levels entry)
  insert into public.app_inventory_snapshots (
    session_id,
    fk_products,
    fk_stocks,
    source_stock_level_id,
    bb_stock_current,
    bb_unfullfilled_amount,
    snapshot_taken_at,
    created_at
  )
  select
    v_session.id,
    sl.fk_products,
    sl.fk_stocks,
    sl.id,
    coalesce(sl."bb_StockCurrent", 0),
    sl."bb_UnfullfilledAmount",
    v_session.snapshot_taken_at,
    v_session.snapshot_taken_at
  from public.app_stock_levels sl;

  return v_session;
end;
$$;
