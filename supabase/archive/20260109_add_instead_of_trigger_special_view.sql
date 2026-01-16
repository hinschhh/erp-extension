-- Migration: Add INSTEAD OF UPDATE trigger for app_purchase_orders_positions_special_view
-- Date: 2026-01-09
-- Description: Views with CTE (WITH clause) are not automatically updatable. 
--              This trigger allows updates to the view by forwarding them to the base table.

-- Create the trigger function
CREATE OR REPLACE FUNCTION trgfn_app_purchase_orders_positions_special_view_update()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE app_purchase_orders_positions_special
  SET
    order_id = NEW.order_id,
    billbee_product_id = NEW.billbee_product_id,
    base_model_billbee_product_id = NEW.base_model_billbee_product_id,
    supplier_sku = NEW.supplier_sku,
    details_override = NEW.details_override,
    qty_ordered = NEW.qty_ordered,
    unit_price_net = NEW.unit_price_net,
    po_item_status = NEW.po_item_status,
    internal_notes = NEW.internal_notes,
    sketch_needed = NEW.sketch_needed,
    sketch_confirmed_at = NEW.sketch_confirmed_at,
    proforma_confirmed_at = NEW.proforma_confirmed_at,
    dol_planned_at = NEW.dol_planned_at,
    dol_actual_at = NEW.dol_actual_at,
    goods_received_at = NEW.goods_received_at,
    order_confirmation_ref = NEW.order_confirmation_ref,
    fk_app_orders_id = NEW.fk_app_orders_id,
    fk_app_order_items_id = NEW.fk_app_order_items_id,
    updated_at = NOW()
  WHERE id = OLD.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the INSTEAD OF UPDATE trigger on the view
CREATE TRIGGER trg_app_purchase_orders_positions_special_view_update
INSTEAD OF UPDATE ON app_purchase_orders_positions_special_view
FOR EACH ROW
EXECUTE FUNCTION trgfn_app_purchase_orders_positions_special_view_update();
