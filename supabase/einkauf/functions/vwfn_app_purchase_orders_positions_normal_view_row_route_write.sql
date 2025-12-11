CREATE OR REPLACE FUNCTION public.vwfn_app_purchase_orders_positions_normal_view_row_route_write()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  -- INSERT
  if tg_op = 'INSERT' then
    insert into public.app_purchase_orders_positions_normal (
      id,
      order_id,
      billbee_product_id,
      qty_ordered,
      unit_price_net,
      po_item_status,
      shipping_costs_proportional,
      internal_notes,
      proforma_confirmed_at,
      dol_planned_at,
      dol_actual_at,
      goods_received_at,
      created_at,
      updated_at
    ) values (
      coalesce(new.id, gen_random_uuid()),
      new.order_id,
      new.billbee_product_id,
      new.qty_ordered,
      new.unit_price_net,
      new.po_item_status,
      new.shipping_costs_proportional,
      new.internal_notes,
      new.proforma_confirmed_at,
      new.dol_planned_at,
      new.dol_actual_at,
      new.goods_received_at,
      coalesce(new.created_at, now()),
      now()
    )
    returning * into new;
    return new;
  end if;

  -- UPDATE
  if tg_op = 'UPDATE' then
    update public.app_purchase_orders_positions_normal
       set order_id = new.order_id,
           billbee_product_id = new.billbee_product_id,
           qty_ordered = new.qty_ordered,
           unit_price_net = new.unit_price_net,
           po_item_status = new.po_item_status,
           shipping_costs_proportional = new.shipping_costs_proportional,
           internal_notes = new.internal_notes,
           proforma_confirmed_at = new.proforma_confirmed_at,
           dol_planned_at = new.dol_planned_at,
           dol_actual_at = new.dol_actual_at,
           goods_received_at = new.goods_received_at,
           updated_at = now()
     where id = old.id;
    return new;
  end if;

  -- DELETE
  if tg_op = 'DELETE' then
    delete from public.app_purchase_orders_positions_normal
     where id = old.id;
    return old;
  end if;

  return null;
end;
$function$;
