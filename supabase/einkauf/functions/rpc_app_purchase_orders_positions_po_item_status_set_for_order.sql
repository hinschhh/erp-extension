CREATE OR REPLACE FUNCTION public.rpc_app_purchase_orders_positions_po_item_status_set_for_order(p_order_id uuid, p_status text, p_dol_planned_at date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_prev_status text;
  v_updated_normal  int := 0;
  v_updated_special int := 0;
BEGIN
  SELECT status::text
    INTO v_prev_status
    FROM public.app_purchase_orders
   WHERE id = p_order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id USING ERRCODE = 'P0002';
  END IF;

  IF v_prev_status = 'draft' AND p_status NOT IN ('ordered') THEN
    RAISE EXCEPTION 'Invalid status transition: % -> %', v_prev_status, p_status;
  ELSIF v_prev_status = 'ordered' AND p_status NOT IN ('confirmed') THEN
    RAISE EXCEPTION 'Invalid status transition: % -> %', v_prev_status, p_status;
  END IF;

  UPDATE public.app_purchase_orders_positions_normal
     SET po_item_status = p_status::po_item_status,
         updated_at     = now()
   WHERE order_id = p_order_id
     AND po_item_status IS DISTINCT FROM p_status::po_item_status;
  GET DIAGNOSTICS v_updated_normal = ROW_COUNT;

  UPDATE public.app_purchase_orders_positions_special
     SET po_item_status = p_status::po_item_status,
         updated_at     = now()
   WHERE order_id = p_order_id
     AND po_item_status IS DISTINCT FROM p_status::po_item_status;
  GET DIAGNOSTICS v_updated_special = ROW_COUNT;

  IF p_status = 'ordered' THEN
    UPDATE public.app_purchase_orders
       SET ordered_at = current_date,
           updated_at = now()
     WHERE id = p_order_id;

  ELSIF p_status = 'confirmed' THEN
    UPDATE public.app_purchase_orders
       SET proforma_confirmed_at = current_date,
           dol_planned_at        = coalesce(p_dol_planned_at, dol_planned_at),
           updated_at            = now()
     WHERE id = p_order_id;
  END IF;

  PERFORM public.fn_app_purchase_orders_status_derive_from_items(p_order_id);

  RETURN jsonb_build_object(
    'updated_normal',  v_updated_normal,
    'updated_special', v_updated_special,
    'new_status',      p_status
  );
END;
$function$;
