//src/components/einkauf/bestellungen/positionen/modals/special.tsx

"use client";

import { useModalForm, useSelect } from "@refinedev/antd";
import { Tables } from "@/types/supabase";
import { Button, Checkbox, Col, Flex, Form, Input, Modal, Row, Select, Space } from "antd";
import { useDataProvider, useOne, HttpError } from "@refinedev/core";
import { supabaseBrowserClient } from "@utils/supabase/client";

type PoItemSpecial = Tables<"app_purchase_orders_positions_special">;
type Produkte = Tables<"app_products">;
type AutoValues = {
  supplier_sku?: string | null;
  unit_price_net?: number | null;
  details_override?: string | null;
};

export default function ButtonEinkaufBestellpositionenSpezialHinzufuegen({orderId, supplier, status}: {orderId: string, supplier: string, status: string}) {

    const { formProps: createFormProps, modalProps: createModalProps, show: createModalShow } = useModalForm<PoItemSpecial>({
        action: "create",
        resource: "app_purchase_orders_positions_special",
        redirect: false,
    });

    const form = createFormProps.form!;
    const dataProvider = supabaseBrowserClient;

    const { selectProps: selectPropsBaseModel } = useSelect<Produkte>({
        resource: "app_products",
        optionLabel: "bb_sku",
        optionValue: "id",
        sorters: [{ field: "bb_sku", order: "asc" }],
        filters: [{
            field: "fk_bb_supplier",
            operator: "eq",
            value: supplier,
        },
        {            
            field: "bb_sku",
            operator: "ncontains",
            value: "Sonder",
        }],
    });

    const { selectProps: selectPropsSpecial } = useSelect<Produkte>({
        resource: "app_products",
        optionLabel: "bb_sku",
        optionValue: "id",
        sorters: [{ field: "bb_sku", order: "asc" }],
        filters: [{
            field: "fk_bb_supplier",
            operator: "eq",
            value: supplier,
        },
        {            
            field: "bb_sku",
            operator: "contains",
            value: "Sonder",
        }],
    });


    const ausGrundmodellKopieren = async () => {
        const { data, error } = await dataProvider
            .from("app_products")
            .select("supplier_sku, bb_net_purchase_price, purchase_details")
            .eq("id", form.getFieldValue("base_model_billbee_product_id"))
            .single();

        if (error) {
            console.error("Error fetching product:", error);
        }

        const product = data;

        form.setFieldsValue({
            supplier_sku: product?.supplier_sku ?? "",
            unit_price_net: product?.bb_net_purchase_price ?? 0,
            details_override: product?.purchase_details ?? "",
        });
    };

    return (
        <>
        <Button onClick={() => createModalShow()} disabled={!(status === "draft" || status === "ordered")}>Neue Sonderposition</Button>
        <Modal {...createModalProps} title="Neue Sonderposition hinzufügen">
            <Form {...createFormProps} layout="vertical">
                <Form.Item label="Bestellung ID" name="order_id" initialValue={orderId} hidden />
                <Row gutter={24}>
                    <Col  span={12}>
                    <Form.Item label="Sonderbestellung" name="billbee_product_id">
                        <Select {...selectPropsSpecial} />
                    </Form.Item>
                    </Col>
                    <Col  span={12}>
                        <Form.Item label="Grundmodell" style={{ marginBottom: 0 }}>
                            <Flex gap="8px" align="end">
                                <Form.Item
                                name="base_model_billbee_product_id"
                                noStyle   // wichtig! verhindert doppeltes Label
                                >
                                    <Select {...selectPropsBaseModel} style={{ minWidth: 220 }} />
                                </Form.Item>
                                <Button onClick={ausGrundmodellKopieren}>Aus Grundmodell kopieren</Button>
                            </Flex>
                        </Form.Item>
                    </Col>
                </Row>
                <Row gutter={24}>
                    <Col  span={12}>
                        <Form.Item label="Ext. SKU" name="supplier_sku">
                            <Input />
                        </Form.Item>
                        <Form.Item name="sketch_needed" valuePropName="checked" initialValue={true}>
                            <Checkbox>Skizze benötigt?</Checkbox>
                        </Form.Item>
                    </Col>
                    <Col  span={12}>
                        <Form.Item label="Details" name="details_override">
                            <Input.TextArea rows={4} />
                        </Form.Item>
                    </Col>
                </Row>
                <Row gutter={24}>
                    <Col  span={12}>
                        <Form.Item label="Menge" name="qty_ordered">
                            <Input type="number" />
                        </Form.Item>
                    </Col>
                    <Col  span={12}>
                        <Form.Item label="Preis" name="unit_price_net">
                            <Input type="number" />
                        </Form.Item>
                    </Col>
                </Row>
                <Row gutter={24}>
                    <Col  span={6}>
                        <Form.Item label="AB-Referenz" name="order_confirmation_ref">
                            <Input />
                        </Form.Item>
                    </Col>
                    <Col  span={18}>
                        <Form.Item label="Dokumente" name="external_file_url">  
                            <Input />
                        </Form.Item>
                    </Col>
                </Row>
                <Form.Item label="Anmerkungen" name="internal_notes">
                    <Input.TextArea rows={4} />
                </Form.Item>
            </Form>
        </Modal>
        </>
    );
}