"use client";

import { useEditableTable, List } from "@refinedev/antd";
import { Tables } from "@/types/supabase";
import { Form, Select, Table } from "antd";
import { PoItemStatusTag } from "@components/common/tags/states/po_item";

type SpecialOrderPosition = Tables<"app_purchase_orders_positions_special">;


export default function EinkaufsPositionenSonderÜbersicht<SpecialOrderPosition>() {
    const {formProps, tableProps, setId, isEditing } = useEditableTable({
        resource: "app_purchase_orders_positions_special",
        meta: { select: "*, base_modell:app_products!app_purchase_orders_positions_base_model_billbee_product_i_fkey(bb_sku, supplier_sku, purchase_details), special_product:app_products!app_purchase_orders_positions_special_billbee_product_id_fkey(bb_sku)" },
    });

    return (
    <List>
        <Form {...formProps}>
            <Table {...tableProps}
            scroll={{ x: 1400 }}
            tableLayout="fixed"
            {...tableProps} 
            rowKey="id"
            rowSelection={{ type: "checkbox" }}
            onRow={(record) => ({
              onClick: (event: any) => {
                if (event.target.nodeName === "TD") {
                  setId && setId(record.id);
                }
              },
            })}>
                <Table.Column dataIndex="id" title="ID" />
                <Table.Column dataIndex="special_product" title="SB" />
                <Table.Column dataIndex="base_modell" title="Grundmodell" />
                <Table.Column dataIndex="order_confirmation_ref" title="AB-Ref" />
                <Table.Column dataIndex="internal_notes" title="Anmerkungen" />
                <Table.Column dataIndex="fk_app_orders_id" title="Bestellreferenz" 
                render={(_, record) => {
                    if (isEditing(record.id)) {
                        return (
                            <Form.Item
                                name="fk_app_orders_id"
                                style={{ margin: 0 }}
                            >
                                <Select />
                            </Form.Item>
                        );
                    }
                    return record.fk_app_orders_id;
                }}
                />
            </Table>
        </Form>

    </List>
)}