CREATE OR REPLACE FUNCTION public.vwfn_app_purchase_orders_positions_special_view_row_route_write()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  -- INSERT via View -> Basistabelle
  if tg_op = 'INSERT' then
    insert into public.app_purchase_orders_positions_special (
      id,
      order_id,
      billbee_product_id,
      qty_ordered,
      unit_price_net,
      supplier_sku,
      details_override,
      po_item_status,
      shipping_costs_proportional,
      internal_notes,
      sketch_needed,
      sketch_confirmed_at,
      proforma_confirmed_at,
      dol_planned_at,
      dol_actual_at,
      fk_app_orders_id,
      fk_app_order_items_id,
      goods_received_at,
      created_at,
      updated_at
    )
    values (
      coalesce(new.id, gen_random_uuid()),
      new.order_id,
      new.billbee_product_id,
      new.qty_ordered,
      new.unit_price_net,
      new.supplier_sku,
      new.details_override,
      new.po_item_status,
      new.shipping_costs_proportional,
      new.internal_notes,
      new.sketch_needed,
      new.sketch_confirmed_at,
      new.proforma_confirmed_at,
      new.dol_planned_at,
      new.dol_actual_at,
      new.fk_app_orders_id,
      new.fk_app_order_items_id,
      new.goods_received_at,
      coalesce(new.created_at, now()),
      now()
    )
    returning * into new;

    return new;
  end if;

  -- UPDATE via View -> Basistabelle
  if tg_op = 'UPDATE' then
    update public.app_purchase_orders_positions_special
       set order_id                   = new.order_id,
           billbee_product_id         = new.billbee_product_id,
           supplier_sku               = new.supplier_sku,
           details_override           = new.details_override,
           qty_ordered                = new.qty_ordered,
           unit_price_net             = new.unit_price_net,
           po_item_status             = new.po_item_status,
           shipping_costs_proportional= new.shipping_costs_proportional,
           internal_notes             = new.internal_notes,
           sketch_needed              = new.sketch_needed,
           sketch_confirmed_at        = new.sketch_confirmed_at,
           proforma_confirmed_at      = new.proforma_confirmed_at,
           dol_planned_at             = new.dol_planned_at,
           dol_actual_at              = new.dol_actual_at,
           fk_app_orders_id           = new.fk_app_orders_id,
           fk_app_order_items_id      = new.fk_app_order_items_id,
           goods_received_at          = new.goods_received_at,
           updated_at                 = now()
     where id = old.id;

    return new;
  end if;

  -- DELETE via View -> Basistabelle
  if tg_op = 'DELETE' then
    delete from public.app_purchase_orders_positions_special
     where id = old.id;

    return old;
  end if;

  return null;
end;
$function$;
