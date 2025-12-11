CREATE OR REPLACE FUNCTION public.trgfn_app_inbound_shipment_items_po_item_status_sync_from_poste()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_normal_id   uuid;
  v_special_id  uuid;

  v_qty_ordered     numeric;
  v_sum_posted      numeric;
  v_count_posted    integer;
begin
  -- Betroffene IDs je nach Operation ermitteln
  if tg_op = 'INSERT' then
    v_normal_id  := new.po_item_normal_id;
    v_special_id := new.po_item_special_id;
  elsif tg_op = 'UPDATE' then
    v_normal_id  := coalesce(new.po_item_normal_id, old.po_item_normal_id);
    v_special_id := coalesce(new.po_item_special_id, old.po_item_special_id);
  else -- DELETE
    v_normal_id  := old.po_item_normal_id;
    v_special_id := old.po_item_special_id;
  end if;

  -- === NORMAL-Position ===
  if v_normal_id is not null then
    select p.qty_ordered into v_qty_ordered
    from public.app_purchase_orders_positions_normal p
    where p.id = v_normal_id;

    if found then
      -- Nur POSTED-Items zählen!
      select coalesce(sum(isi.quantity_delivered), 0)::numeric,
             count(*)::int
        into v_sum_posted, v_count_posted
      from public.app_inbound_shipment_items isi
      where isi.po_item_normal_id = v_normal_id
        and isi.item_status = 'posted';

      -- Wenn (noch) nichts gepostet ist -> KEIN Positionsstatus-Update
      if v_count_posted > 0 then
        if v_sum_posted >= v_qty_ordered then
          update public.app_purchase_orders_positions_normal p
             set po_item_status    = 'delivered',
                 goods_received_at = case when p.goods_received_at is null then now() else p.goods_received_at end,
                 updated_at        = now()
           where p.id = v_normal_id;
        else
          update public.app_purchase_orders_positions_normal p
             set po_item_status = 'partially_delivered',
                 updated_at     = now()
           where p.id = v_normal_id;
        end if;
      end if;
    end if;
  end if;

  -- === SPECIAL-Position ===
  if v_special_id is not null then
    select p.qty_ordered into v_qty_ordered
    from public.app_purchase_orders_positions_special p
    where p.id = v_special_id;

    if found then
      -- Nur POSTED-Items zählen!
      select coalesce(sum(isi.quantity_delivered), 0)::numeric,
             count(*)::int
        into v_sum_posted, v_count_posted
      from public.app_inbound_shipment_items isi
      where isi.po_item_special_id = v_special_id
        and isi.item_status = 'posted';

      if v_count_posted > 0 then
        if v_sum_posted >= v_qty_ordered then
          update public.app_purchase_orders_positions_special p
             set po_item_status    = 'delivered',
                 goods_received_at = case when p.goods_received_at is null then now() else p.goods_received_at end,
                 updated_at        = now()
           where p.id = v_special_id;
        else
          update public.app_purchase_orders_positions_special p
             set po_item_status = 'partially_delivered',
                 updated_at     = now()
           where p.id = v_special_id;
        end if;
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  else
    return new;
  end if;
end;
$function$;
