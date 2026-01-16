CREATE OR REPLACE FUNCTION public.fn_is_post_and_dispatch(p_inbound_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_inbound         app_inbound_shipments%rowtype;
  v_supplier_name   text;
  v_order_numbers   text;
  v_items_count     int;
  v_outbox_id       bigint;
  v_payload_items   jsonb;
  v_payload         jsonb;
begin
  -- Inbound laden & plausibilisieren
  select * into v_inbound
  from app_inbound_shipments
  where id = p_inbound_id;

  if not found then
    raise exception 'Inbound shipment % not found', p_inbound_id using errcode = 'P0002';
  end if;

  if v_inbound.status = 'posted' then
    raise exception 'Inbound shipment % already posted', p_inbound_id;
  end if;

  -- Supplier-Name (optional)
  select s.id into v_supplier_name
  from app_suppliers s
  where s.id = v_inbound.fk_bb_supplier;

  -- Alle zugehörigen Bestellnummern zusammenführen (distinct, sortiert)
  select string_agg(distinct o.order_number, ', ' order by o.order_number)
    into v_order_numbers
  from app_inbound_shipment_items isi
  join app_purchase_orders o on o.id = isi.order_id
  where isi.shipment_id = p_inbound_id;

  -- *** WICHTIG: Nur normale Positionen aggregieren (special wird ausgeschlossen) ***
  with items_raw as (
    select
      pn.billbee_product_id::text as id,
      sum(isi.quantity_delivered)::numeric as amount
    from app_inbound_shipment_items isi
    join app_purchase_orders_positions_normal pn on pn.id = isi.po_item_normal_id
    where isi.shipment_id = p_inbound_id
      and pn.billbee_product_id is not null
    group by pn.billbee_product_id
  ),
  items as (
    select
      jsonb_agg(
        jsonb_build_object(
          'id', id,                          -- BillbeeId als String; Edge-Function nutzt lookupBy="id"
          'lookupBy', 'id',
          'amount', amount,
          'reason',
            format(
              'INBOUND %s | %s | %s | INV %s',
              coalesce(v_inbound.inbound_number, '?'),
              coalesce(v_order_numbers, '?'),
              coalesce(v_supplier_name, '?'),
              coalesce(v_inbound.delivery_note_no, '?')
            )
        )
      ) as items_json,
      count(*) as cnt
    from items_raw
  )
  select items_json, cnt into v_payload_items, v_items_count
  from items;

  if v_items_count is null then
    v_items_count := 0;
  end if;

  -- Nur wenn es normale Items gibt, Outbox schreiben
  if v_items_count > 0 then
    v_payload := jsonb_build_object(
      'items', coalesce(v_payload_items, '[]'::jsonb),
      'forceSendStockToShops', true,
      'autosubtractReservedAmount', false
    );

    insert into integration_outbox (topic, payload)
    values ('billbee.stock.increase', v_payload)
    returning id into v_outbox_id;
  else
    v_outbox_id := null;
    v_payload := null;
  end if;

  -- Inbound auf posted setzen (immer)
  update app_inbound_shipments
     set status = 'posted',
         updated_at = now()
   where id = p_inbound_id;

  return jsonb_build_object(
    'ok', true,
    'inbound_id', p_inbound_id,
    'outbox_id', v_outbox_id,
    'items_count', v_items_count,
    'payload', v_payload
  );
end;
$function$;
