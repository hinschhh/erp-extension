

// ====================================================================================
// 2) utils/actions/registry.ts
// ====================================================================================
import type { ActionConfig } from "@utils/actions/types";

export type PoStatus =
  | "draft" | "ordered" | "confirmed" | "in_production"
  | "partially_in_production" | "delivered" | "partially_delivered" | "cancelled";

export type PoItemStatus =
  | "draft" | "ordered" | "confirmed" | "in_production"
  | "partially_delivered" | "delivered" | "paused" | "cancelled";

export const ACTIONS: Record<string, ActionConfig<any>> = {
  "po.set_status": {
    id: "po.set_status",
    resource: "purchase_orders",
    rpc: {
      rpcName: "rpc_po_set_status",
      mapToDbParams: (v: { purchaseOrderId: string; nextStatus: PoStatus; dolPlanned?: string | null }) => ({
        p_po_id: v.purchaseOrderId,
        p_next: v.nextStatus,
        p_dol_planned: v?.dolPlanned ?? null,
      }),
    },
    successKey: "po.status.set.success",
    errorKey: "po.status.set.error",
  } satisfies ActionConfig,

  "po.item.set_dol_actual": {
    id: "po.item.set_dol_actual",
    resource: "app_purchase_orders_positions_normal",
    rpc: {
      rpcName: "rpc_po_set_dol_actual",
      mapToDbParams: (v: { itemId: string; dolActual: string | null }) => ({
        p_item_id: v.itemId,
        p_dol_actual: v.dolActual,
      }),
    },
    successKey: "po.item.dol.set.success",
    errorKey: "po.item.dol.set.error",
  } satisfies ActionConfig,

  "po.item.receive_partial": {
    id: "po.item.receive_partial",
    resource: "app_purchase_orders_positions_normal",
    rpc: {
      rpcName: "rpc_po_item_mark_delivered",
      mapToDbParams: (v: { itemId: string; qtyDelivered: number }) => ({
        p_item_id: v.itemId,
        p_qty_delivered: v.qtyDelivered,
      }),
    },
    successKey: "po.item.receive_partial.success",
    errorKey: "po.item.receive_partial.error",
  } satisfies ActionConfig,

  "po.item.set_status": {
    id: "po.item.set_status",
    resource: "app_purchase_orders_positions_normal",
    rpc: {
      rpcName: "rpc_po_item_set_status",
      mapToDbParams: (v: { itemId: string; nextStatus: PoItemStatus }) => ({
        p_item_id: v.itemId,
        p_next: v.nextStatus,
      }),
    },
    successKey: "po.item.status.set.success",
    errorKey: "po.item.status.set.error",
  } satisfies ActionConfig,

  "po.items.bulk_set_status": {
    id: "po.items.bulk_set_status",
    resource: "app_purchase_orders_positions_normal",
    rpc: {
      rpcName: "rpc_po_bulk_item_status",
      mapToDbParams: (v: { poId: string; itemIds: string[]; nextStatus: PoItemStatus }) => ({
        p_po_id: v.poId,
        p_item_ids: v.itemIds,
        p_next: v.nextStatus,
      }),
    },
    successKey: "po.items.bulk.success",
    errorKey: "po.items.bulk.error",
  } satisfies ActionConfig,

  "po.add_item_normal": {
    id: "po.add_item_normal",
    resource: "app_purchase_orders_positions_normal",
    rpc: {
      rpcName: "rpc_po_add_item_normal",
      mapToDbParams: (v: { poId: string; productId: number; qty: number; unitPrice: number | null; notes?: string | null }) => ({
        p_po_id: v.poId,
        p_product_id: v.productId,
        p_qty: v.qty,
        p_unit_price: v.unitPrice,
        p_notes: v?.notes ?? null,
      }),
    },
    successKey: "po.item.add_normal.success",
    errorKey: "po.item.add_normal.error",
  } satisfies ActionConfig,

  "po.add_item_special": {
    id: "po.add_item_special",
    resource: "app_purchase_orders_positions_special",
    rpc: {
      rpcName: "rpc_po_add_item_special",
      mapToDbParams: (v: {
        poId: string;
        sbProductId: number;
        baseModelId?: number | null;
        qty: number;
        unitPrice?: number | null;
        supplierSku?: string | null;
        detailsOverride?: string | null;
        orderConfirmationRef?: string | null;
        externalFileUrl?: string | null;
        sketchNeeded?: boolean;
      }) => ({
        p_po_id: v.poId,
        p_sb_product_id: v.sbProductId,
        p_base_model_id: v?.baseModelId ?? null,
        p_qty: v.qty,
        p_unit_price: v?.unitPrice ?? null,
        p_supplier_sku: v?.supplierSku ?? null,
        p_details_override: v?.detailsOverride ?? null,
        p_order_confirmation_ref: v?.orderConfirmationRef ?? null,
        p_external_file_url: v?.externalFileUrl ?? null,
        p_sketch_needed: v?.sketchNeeded ?? true,
      }),
    },
    successKey: "po.item.add_special.success",
    errorKey: "po.item.add_special.error",
  } satisfies ActionConfig,

  "po.item.confirm_sketch": {
    id: "po.item.confirm_sketch",
    resource: "app_purchase_orders_positions_special",
    rpc: {
      rpcName: "rpc_po_confirm_sketch",
      mapToDbParams: (v: { itemId: string; confirmedOn: string }) => ({
        p_item_id: v.itemId,
        p_confirmed_on: v.confirmedOn,
      }),
    },
    successKey: "po.item.sketch.confirm.success",
    errorKey: "po.item.sketch.confirm.error",
  } satisfies ActionConfig,
} as const satisfies Record<string, ActionConfig<any>>;

export type KnownActionId = keyof typeof ACTIONS;