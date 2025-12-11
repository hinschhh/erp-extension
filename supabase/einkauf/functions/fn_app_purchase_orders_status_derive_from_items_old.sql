CREATE OR REPLACE FUNCTION public.fn_app_purchase_orders_status_derive_from_items_old(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  total int;
  active int;
  cnt_draft int;
  cnt_ordered int;
  cnt_confirmed int;
  cnt_in_production int;
  cnt_partially_delivered int;
  cnt_delivered int;
  cnt_cancelled int;
  cnt_paused int;
  new_status public.po_status;
begin
  select
    count(*) filter (where po_item_status not in ('cancelled','paused')),
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
    active, total,
    cnt_draft, cnt_ordered, cnt_confirmed,
    cnt_in_production, cnt_partially_delivered,
    cnt_delivered, cnt_cancelled, cnt_paused
  from (
    select po_item_status from public.app_purchase_orders_positions_normal where order_id = p_order_id
    union all
    select po_item_status from public.app_purchase_orders_positions_special where order_id = p_order_id
  ) t;

  if total = 0 then
    new_status := 'draft';
  elsif active = 0 and cnt_cancelled > 0 then
    new_status := 'cancelled';
  elsif cnt_delivered > 0 and (cnt_delivered + cnt_cancelled + cnt_paused = total) then
    new_status := 'delivered';
  elsif cnt_partially_delivered > 0 then
    new_status := 'partially_delivered';
  elsif cnt_in_production > 0 and (cnt_in_production < active) then
    new_status := 'partially_in_production';
  elsif cnt_in_production = active then
    new_status := 'in_production';
  elsif cnt_confirmed = active then
    new_status := 'confirmed';
  elsif cnt_ordered = active then
    new_status := 'ordered';
  elsif cnt_draft = active then
    new_status := 'draft';
  else
    new_status := 'ordered';
  end if;

  update public.app_purchase_orders
     set status = new_status,
         updated_at = now(),
         proforma_confirmed_at = case
           when new_status = 'confirmed' and proforma_confirmed_at is null then now()
           else proforma_confirmed_at
         end
   where id = p_order_id;
end;
$function$;
