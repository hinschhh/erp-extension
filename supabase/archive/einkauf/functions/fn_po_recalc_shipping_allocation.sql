CREATE OR REPLACE FUNCTION public.fn_po_recalc_shipping_allocation(p_po_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
    v_shipping_total numeric(12,2);
    v_base_sum       numeric; -- Summe aller Positionswerte (normal + special)
begin
    -- 1) Versandkosten der Bestellung holen (NULL => 0)
    select coalesce(po.shipping_cost_net, 0)::numeric(12,2)
      into v_shipping_total
    from public.app_purchase_orders po
    where po.id = p_po_id
    for update;

    -- 2) Summe der Positionswerte über beide Tabellen bilden
    select
        coalesce((
            select sum(n.qty_ordered * n.unit_price_net)
            from public.app_purchase_orders_positions_normal n
            where n.order_id = p_po_id
        ), 0)::numeric
        +
        coalesce((
            select sum(s.qty_ordered * s.unit_price_net)
            from public.app_purchase_orders_positions_special s
            where s.order_id = p_po_id
        ), 0)::numeric
    into v_base_sum;

    -- 3) Edge Cases: keine Positionen oder kein Versand -> alles 0 setzen und raus
    if v_base_sum is null or v_base_sum = 0 or v_shipping_total = 0 then
        update public.app_purchase_orders_positions_normal
           set shipping_costs_proportional = 0
         where order_id = p_po_id;

        update public.app_purchase_orders_positions_special
           set shipping_costs_proportional = 0
         where order_id = p_po_id;

        return;
    end if;

    -- 4) Proportionale Verteilung auf NORMAL-Positionen
    update public.app_purchase_orders_positions_normal n
       set shipping_costs_proportional =
           round( ( (n.qty_ordered * n.unit_price_net) / v_base_sum ) * v_shipping_total, 2 )
     where n.order_id = p_po_id;

    -- 5) Proportionale Verteilung auf SPECIAL-Positionen
    update public.app_purchase_orders_positions_special s
       set shipping_costs_proportional =
           round( ( (s.qty_ordered * s.unit_price_net) / v_base_sum ) * v_shipping_total, 2 )
     where s.order_id = p_po_id;

    -- Optional: Wenn ihr updated_at führen wollt, hier mitsetzen
    -- update public.app_purchase_orders set updated_at = now() where id = p_po_id;

end;
$function$;
