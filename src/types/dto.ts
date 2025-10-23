export type UUID = string;

// (authenticated)/lager/wareneingang/anlegen
export type InboundShipmentHeaderDTO = {
    supplier_id: UUID;
    delivery_note_number: string | null;
    note: string | null;
    arrived_at?: string; //ISO
    shipping_cost_separate?: number | null;
}

export type InboundShipmentDetailNormalDTO = {
    po_item_normal_id: UUID;
    quantity_delivered: number;
}

export type InboundShipmentDetailSpecialDTO = {
    po_item_special_id: UUID;
    quantity_delivered: number;
}
