CREATE OR REPLACE FUNCTION public.trgfn_app_purchase_orders_positions_status_trigger_recalc_po_st()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.fn_app_purchase_orders_status_derive_from_items(
    COALESCE(NEW.order_id, OLD.order_id)
  );
  RETURN NULL;
END;
$function$;
