CREATE OR REPLACE FUNCTION public.trgfn_app_inbound_shipments_shipping_cost_separate_recalc_alloc()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_delta numeric;
begin
  -- Nur reagieren, wenn NEW vorhanden ist und ein (neuer) Wert gesetzt wurde
  if tg_op = 'INSERT' then
    v_delta := coalesce(new.shipping_cost_separate, 0);
  elsif tg_op = 'UPDATE' then
    -- Delta = NEW - OLD (negative Werte möglich, falls reduziert wird)
    v_delta := coalesce(new.shipping_cost_separate, 0) - coalesce(old.shipping_cost_separate, 0);
  else
    -- Für DELETE nicht relevant
    return coalesce(new, old);
  end if;

  -- Kein Delta -> nichts zu tun
  if v_delta = 0 then
    return new;
  end if;

  -- Verteilung nur, wenn es im Shipment zugehörige Items gibt und Summen > 0
  with order_qty as (
    select
      i.order_id,
      sum(i.quantity_delivered)::numeric as qty_total
    from public.app_inbound_shipment_items i
    where i.shipment_id = new.id
    group by i.order_id
  ),
  totals as (
    select sum(qty_total)::numeric as grand_total
    from order_qty
  ),
  alloc as (
    select
      q.order_id,
      round((q.qty_total / nullif(t.grand_total, 0)) * v_delta, 2) as add_amount
    from order_qty q
    cross join totals t
    where coalesce(t.grand_total, 0) > 0
  )
  update public.app_purchase_orders p
     set shipping_cost_net = coalesce(p.shipping_cost_net, 0) + a.add_amount,
         separate_invoice_for_shipping_cost = true,
         updated_at = now()
    from alloc a
   where p.id = a.order_id;

  return new;
end;
$function$;
