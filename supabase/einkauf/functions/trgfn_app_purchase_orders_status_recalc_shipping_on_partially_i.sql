CREATE OR REPLACE FUNCTION public.trgfn_app_purchase_orders_status_recalc_shipping_on_partially_i()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
    -- Nur reagieren, wenn Status sich geändert hat und jetzt 'partially_in_production' ist
    if new.status = 'partially_in_production'
       and (old.status is distinct from new.status) then

        perform public.fn_po_recalc_shipping_allocation(new.id);
    end if;

    return new;
end;
$function$;
