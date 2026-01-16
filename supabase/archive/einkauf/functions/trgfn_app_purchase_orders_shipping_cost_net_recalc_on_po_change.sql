CREATE OR REPLACE FUNCTION public.trgfn_app_purchase_orders_shipping_cost_net_recalc_on_po_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  perform public.fn_po_recalc_shipping_allocation(new.id);
  return new;
end
$function$;
