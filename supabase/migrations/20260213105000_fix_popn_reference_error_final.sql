-- Fix the remaining SQL error in shipping distribution function  
-- Issue: popn and pops aliases not available in UPDATE statement context

CREATE OR REPLACE FUNCTION public.trgfn_inbound_shipment_distribute_shipping_costs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_shipment_id uuid;
  v_shipping_cost numeric;
  v_total_value numeric;
  v_delta numeric;
BEGIN
  v_shipment_id := NEW.id;
  v_shipping_cost := COALESCE(NEW.shipping_cost, 0);
  
  -- Calculate total value of all items in this shipment
  SELECT COALESCE(SUM(
    isi.quantity_delivered * COALESCE(
      popn.unit_price_net,  -- Normal position
      pops.unit_price_net,  -- Special position
      0
    )
  ), 0)
  INTO v_total_value
  FROM public.app_inbound_shipment_items isi
  LEFT JOIN public.app_purchase_orders_positions_normal popn 
    ON isi.po_item_normal_id = popn.id
  LEFT JOIN public.app_purchase_orders_positions_special pops 
    ON isi.po_item_special_id = pops.id
  WHERE isi.shipment_id = v_shipment_id;
  
  -- Distribute proportionally to each item
  -- FIXED: Use unit_price from the subquery instead of referencing popn/pops directly
  IF v_total_value > 0 AND v_shipping_cost > 0 THEN
    UPDATE public.app_inbound_shipment_items isi
    SET shipping_costs_proportional = ROUND(
      (isi.quantity_delivered * item_prices.unit_price / v_total_value) * v_shipping_cost,
      2
    ),
    updated_at = NOW()
    FROM (
      SELECT isi_inner.id, isi_inner.quantity_delivered,
             COALESCE(popn.unit_price_net, pops.unit_price_net, 0) as unit_price
      FROM public.app_inbound_shipment_items isi_inner
      LEFT JOIN public.app_purchase_orders_positions_normal popn 
        ON isi_inner.po_item_normal_id = popn.id
      LEFT JOIN public.app_purchase_orders_positions_special pops 
        ON isi_inner.po_item_special_id = pops.id
      WHERE isi_inner.shipment_id = v_shipment_id
    ) item_prices
    WHERE isi.id = item_prices.id
      AND isi.shipment_id = v_shipment_id
      AND item_prices.unit_price > 0;
      
  ELSIF v_shipping_cost = 0 THEN
    -- If shipping cost is 0, zero out allocations
    UPDATE public.app_inbound_shipment_items
    SET shipping_costs_proportional = 0,
        updated_at = NOW()
    WHERE shipment_id = v_shipment_id;
  END IF;
  
  -- Also propagate shipping costs to PO (for backwards compatibility)
  -- This maintains the PO-level aggregate but is NOT the source of truth
  IF TG_OP = 'INSERT' THEN
    v_delta := v_shipping_cost;
  ELSIF TG_OP = 'UPDATE' THEN
    v_delta := v_shipping_cost - COALESCE(OLD.shipping_cost, 0);
  END IF;
  
  IF v_delta != 0 THEN
    -- Distribute delta across POs proportionally
    WITH order_qty AS (
      SELECT
        i.order_id,
        SUM(i.quantity_delivered)::numeric AS qty_total
      FROM public.app_inbound_shipment_items i
      WHERE i.shipment_id = v_shipment_id
      GROUP BY i.order_id
    ),
    totals AS (
      SELECT SUM(qty_total)::numeric AS grand_total
      FROM order_qty
    ),
    alloc AS (
      SELECT
        q.order_id,
        ROUND((q.qty_total / NULLIF(t.grand_total, 0)) * v_delta, 2) AS add_amount
      FROM order_qty q
      CROSS JOIN totals t
      WHERE COALESCE(t.grand_total, 0) > 0
    )
    UPDATE public.app_purchase_orders p
    SET shipping_cost_net = COALESCE(p.shipping_cost_net, 0) + a.add_amount,
        separate_invoice_for_shipping_cost = true,
        updated_at = NOW()
    FROM alloc a
    WHERE p.id = a.order_id;
  END IF;
  
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trgfn_inbound_shipment_distribute_shipping_costs IS
'FIXED: Distributes shipping costs from inbound shipment to items proportionally based on value. Uses correct reference to unit_price from subquery instead of unavailable popn/pops aliases. On INSERT: adds full amount. On UPDATE: adds only the delta. Also maintains PO-level aggregate for backwards compatibility (not SSOT).';