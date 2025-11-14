"use client";

import { useEditableTable, List } from "@refinedev/antd";
import { Tables } from "@/types/supabase";
import { Form, Table } from "antd";

type SpecialOrderPosition = Tables<"app_purchase_orders_positions_special">;


export default function EinkaufsPositionenSonderÜbersicht<SpecialOrderPosition>() {
    const {formProps, tableProps } = useEditableTable({
        resource: "app_purchase_orders_positions_special",
        meta: { select: "*, base_modell:app_products!app_purchase_orders_positions_base_model_billbee_product_i_fkey(bb_sku, supplier_sku, purchase_details), special_product:app_products!app_purchase_orders_positions_special_billbee_product_id_fkey(bb_sku)" },
    });

    return (
    <List>
        <Form {...formProps}>
            <Table {...tableProps}>
                <Table.Column dataIndex="id" title="ID" />
                <Table.Column dataIndex="special_product" title="SB" />
                <Table.Column dataIndex="base_modell" title="Grundmodell" />
                <Table.Column dataIndex="order_confirmation_ref" title="AB-Ref" />
                <Table.Column dataIndex="fk_app_orders_id" title="Bestellreferenz" />
            </Table>
        </Form>

    </List>
)}