-- Migration: Update product purchase price when shipment item is posted
-- Date: 2026-01-08
-- Reason: Keep product master data up-to-date with actual landed cost (goods + shipping)
-- Note: ONLY updates for NORMAL positions (standard products), NOT special positions (custom orders)

-- Create function to update product purchase price on posting
CREATE OR REPLACE FUNCTION trgfn_update_product_price_on_posting()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  v_product_id bigint;
  v_unit_price_net numeric;
  v_landed_cost_per_unit numeric;
BEGIN
  -- Only proceed if status changed to 'posted'
  IF NEW.item_status = 'posted' AND (OLD.item_status IS NULL OR OLD.item_status IS DISTINCT FROM 'posted') THEN
    
    -- ONLY update for NORMAL positions (standard products)
    -- SPECIAL positions are custom orders and should not update product master
    IF NEW.po_item_normal_id IS NOT NULL THEN
      SELECT 
        billbee_product_id,
        unit_price_net
      INTO v_product_id, v_unit_price_net
      FROM app_purchase_orders_positions_normal
      WHERE id = NEW.po_item_normal_id;
      
      -- Calculate landed cost per unit (unit price + proportional shipping per unit)
      IF v_product_id IS NOT NULL AND NEW.quantity_delivered > 0 THEN
        v_landed_cost_per_unit := v_unit_price_net + 
          (COALESCE(NEW.shipping_costs_proportional, 0) / NEW.quantity_delivered);
        
        -- Update product's net purchase price
        UPDATE app_products
        SET bb_net_purchase_price = v_landed_cost_per_unit
        WHERE id = v_product_id;
        
        RAISE NOTICE 'Updated product % purchase price to % (unit: % + shipping/unit: %)',
          v_product_id,
          v_landed_cost_per_unit,
          v_unit_price_net,
          (COALESCE(NEW.shipping_costs_proportional, 0) / NEW.quantity_delivered);
      END IF;
    END IF;
    -- NOTE: We explicitly do NOT update for po_item_special_id
    -- Special positions are custom orders with individual pricing
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create trigger on shipment items (UPDATE only, when status changes to posted)
CREATE TRIGGER trg_au__update_product_price_on_posting
AFTER UPDATE OF item_status ON app_inbound_shipment_items
FOR EACH ROW
EXECUTE FUNCTION trgfn_update_product_price_on_posting();

-- Add helpful comment
COMMENT ON COLUMN app_products.bb_net_purchase_price IS 
'Standard purchase price per unit including proportional shipping costs (landed cost). 
Automatically updated when NORMAL (not special) inbound shipment items are posted. 
Represents typical acquisition cost including ANK for regular stock purchases.';
