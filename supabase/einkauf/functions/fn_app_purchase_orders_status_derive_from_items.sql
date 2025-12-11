CREATE OR REPLACE FUNCTION public.fn_app_purchase_orders_status_derive_from_items(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  total int;
  cnt_draft int;
  cnt_ordered int;
  cnt_confirmed int;
  cnt_in_production int;
  cnt_partially_delivered int; -- kann existieren, muss aber nicht genutzt werden
  cnt_delivered int;
  cnt_cancelled int;
  cnt_paused int;

  active_open int; -- = total - cancelled - paused
  new_status public.po_status;
  current_status public.po_status;
begin
  -- Alle Zählwerte holen (normal + special)
  select
    count(*) as total,
    count(*) filter (where po_item_status = 'draft'),
    count(*) filter (where po_item_status = 'ordered'),
    count(*) filter (where po_item_status = 'confirmed'),
    count(*) filter (where po_item_status = 'in_production'),
    count(*) filter (where po_item_status = 'partially_delivered'),
    count(*) filter (where po_item_status = 'delivered'),
    count(*) filter (where po_item_status = 'cancelled'),
    count(*) filter (where po_item_status = 'paused')
  into
    total,
    cnt_draft, cnt_ordered, cnt_confirmed,
    cnt_in_production, cnt_partially_delivered,
    cnt_delivered, cnt_cancelled, cnt_paused
  from (
    select po_item_status
      from public.app_purchase_orders_positions_normal
     where order_id = p_order_id
    union all
    select po_item_status
      from public.app_purchase_orders_positions_special
     where order_id = p_order_id
  ) t;

  -- aktive (offene) Positionen = alles außer cancelled/paused
  active_open := coalesce(total,0) - coalesce(cnt_cancelled,0) - coalesce(cnt_paused,0);

  -- aktuellen Status holen
  select status into current_status
    from public.app_purchase_orders
   where id = p_order_id;

  -- Ableitungslogik (Prioritäten)
  if coalesce(total,0) = 0 then
    new_status := 'draft';

  -- Voll geliefert: alle aktiven sind delivered
  elsif active_open > 0 and coalesce(cnt_delivered,0) >= active_open then
    new_status := 'delivered';

  -- Teilweise geliefert: mind. ein delivered, aber nicht alle aktiven
  elsif coalesce(cnt_delivered,0) > 0 then
    new_status := 'partially_delivered';

  -- Produktion: Mischbestand in_production + andere aktive
  elsif coalesce(cnt_in_production,0) > 0 and coalesce(cnt_in_production,0) < active_open then
    new_status := 'partially_in_production';

  elsif active_open > 0 and coalesce(cnt_in_production,0) = active_open then
    new_status := 'in_production';

  elsif active_open > 0 and coalesce(cnt_confirmed,0) = active_open then
    new_status := 'confirmed';

  elsif active_open > 0 and coalesce(cnt_ordered,0) = active_open then
    new_status := 'ordered';

  elsif active_open > 0 and coalesce(cnt_draft,0) = active_open then
    new_status := 'draft';

  else
    -- Fallback: wenn nur cancelled/paused übrig sind, als delivered werten
    -- (oder, wenn du das anders möchtest, hier auf 'cancelled' setzen)
    new_status := 'delivered';
  end if;

  -- Nur updaten, wenn sich etwas ändert
  if new_status is distinct from current_status then
    update public.app_purchase_orders
       set status = new_status,
           updated_at = now(),
           -- confirmed-Datum nur beim erstmaligen Erreichen setzen
           proforma_confirmed_at = case
             when new_status = 'confirmed' and proforma_confirmed_at is null then now()
             else proforma_confirmed_at
           end
     where id = p_order_id;
  end if;
end;
$function$;
