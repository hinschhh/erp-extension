-- Update inventory snapshot logic to only include relevant products
-- Products are relevant if they:
-- 1. Have been in purchase orders in the last year
-- 2. OR have current stock <> 0

CREATE OR REPLACE FUNCTION "public"."rpc_app_inventory_session_start"("p_name" "text", "p_note" "text" DEFAULT NULL::"text") 
RETURNS "public"."app_inventory_sessions"
LANGUAGE "plpgsql" SECURITY DEFINER
SET "search_path" TO 'public'
AS $$
declare
  v_session public.app_inventory_sessions;
  v_existing_id bigint;
  v_one_year_ago timestamp with time zone;
begin
  -- ensure caller is authenticated
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- prüfen, ob bereits eine aktive Inventur läuft
  select id
  into v_existing_id
  from public.app_inventory_sessions
  where status in ('counting', 'review')
  limit 1;

  if v_existing_id is not null then
    raise exception
      'Es läuft bereits eine Inventur (Session-ID=%). Bitte diese erst abschließen, bevor eine neue gestartet wird.',
      v_existing_id
      using errcode = 'check_violation';
  end if;

  -- create session and mark counting with snapshot timestamp
  insert into public.app_inventory_sessions
    (name, note, status, counting_started_at, snapshot_taken_at, created_at)
  values
    (p_name, p_note, 'counting', now(), now(), now())
  returning * into v_session;

  -- calculate one year ago timestamp
  v_one_year_ago := now() - interval '1 year';

  -- snapshot current stock levels
  -- only include products that:
  -- - have been in purchase orders in the last year
  -- - OR have current stock <> 0
  insert into public.app_inventory_snapshots (
    session_id,
    fk_products,
    fk_stocks,
    source_stock_level_id,
    bb_stock_current,
    bb_unfullfilled_amount,
    qty_unsellable,
    stock_location,
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
    sl.qty_unsellable,
    sl."bb_StockCode",
    v_session.snapshot_taken_at,
    v_session.snapshot_taken_at
  from public.app_stock_levels sl
  where 
    -- has current stock
    coalesce(sl."bb_StockCurrent", 0) <> 0
    OR
    -- was in purchase orders in the last year
    sl.fk_products in (
      select distinct billbee_product_id
      from public.app_purchase_orders_positions_normal
      where created_at >= v_one_year_ago
      
      union
      
      select distinct billbee_product_id
      from public.app_purchase_orders_positions_special
      where created_at >= v_one_year_ago
    );

  return v_session;
end;
$$;
