-- Migration: Add INSTEAD OF UPDATE trigger for app_purchase_orders_positions_normal_view
-- Date: 2026-01-09
-- Description: Views with CTE (WITH clause) are not automatically updatable. 
--              This trigger allows updates to the view by forwarding them to the base table.

-- Create the trigger function
CREATE OR REPLACE FUNCTION trgfn_app_purchase_orders_positions_normal_view_update()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE app_purchase_orders_positions_normal
  SET
    order_id = NEW.order_id,
    billbee_product_id = NEW.billbee_product_id,
    qty_ordered = NEW.qty_ordered,
    unit_price_net = NEW.unit_price_net,
    po_item_status = NEW.po_item_status,
    internal_notes = NEW.internal_notes,
    proforma_confirmed_at = NEW.proforma_confirmed_at,
    dol_planned_at = NEW.dol_planned_at,
    dol_actual_at = NEW.dol_actual_at,
    goods_received_at = NEW.goods_received_at,
    fk_app_orders_id = NEW.fk_app_orders_id,
    updated_at = NOW()
  WHERE id = OLD.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the INSTEAD OF UPDATE trigger on the view
CREATE TRIGGER trg_app_purchase_orders_positions_normal_view_update
INSTEAD OF UPDATE ON app_purchase_orders_positions_normal_view
FOR EACH ROW
EXECUTE FUNCTION trgfn_app_purchase_orders_positions_normal_view_update();
