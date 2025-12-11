CREATE OR REPLACE FUNCTION public.rpc_app_purchase_orders_positions_special_sketch_confirm_and_ad(p_item_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  update public.app_purchase_orders_positions_special
     set sketch_confirmed_at = now(),
         po_item_status = 'in_production',
         updated_at = now()
   where id = p_item_id
     and sketch_confirmed_at is null;
$function$;
