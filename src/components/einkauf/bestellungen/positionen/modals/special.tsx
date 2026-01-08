//src/components/einkauf/bestellungen/positionen/modals/special.tsx

"use client";
import { useInvalidate } from "@refinedev/core";
import { useModalForm, useSelect } from "@refinedev/antd";
import { Tables } from "@/types/supabase";
import { Button, Cascader, Checkbox, Col, Flex, Form, Input, Modal, Row, Select, Space } from "antd";
import { supabaseBrowserClient } from "@utils/supabase/client";
import {useOrderItemCascader} from "@components/common/selects/cascader_order_items";

type PoItemSpecial = Tables<"app_purchase_orders_positions_special">;
type Produkte = Tables<"app_products">;
type AutoValues = {
  supplier_sku?: string | null;
  unit_price_net?: number | null;
  details_override?: string | null;
};

export default function ButtonEinkaufBestellpositionenSpezialHinzufuegen({orderId, supplier, status}: {orderId: string, supplier: string, status: string}) {
    const invalidate = useInvalidate();
    const { formProps: createFormProps, modalProps: createModalProps, onFinish: refineOnFinish, show: createModalShow } = useModalForm<PoItemSpecial>({
        action: "create",
        resource: "app_purchase_orders_positions_special",
        redirect: false,
        onMutationSuccess: async () => {
            await Promise.all([
                invalidate({
                resource: "app_purchase_orders_positions_special_view", // <- VIEW!
                invalidates: ["list", "many"],
                }),
                invalidate({
                resource: "app_purchase_orders_positions_special",
                invalidates: ["list", "many"],
                }),
            ]);
        },
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
            operator: "in",
            value: [supplier, "Verschiedene"],
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
            operator: "in",
            value: [supplier, "Verschiedene"],
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
            .single<{
                supplier_sku: string | null;
                bb_net_purchase_price: number | null;
                purchase_details: string | null;
            }>();

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
    const handleFinish = (values: any) => {
    const cascaderValue = values.order_item_cascader;

    if (Array.isArray(cascaderValue) && cascaderValue.length === 2) {
        const [orderId, orderItemId] = cascaderValue;

        values.fk_app_orders_id = orderId;
        values.fk_app_order_items_id = orderItemId;
    }

    // UI-Feld rausnehmen (falls du sauber bleiben willst)
    delete values.order_item_cascader;

    return refineOnFinish(values);
};

    const { options, loading } = useOrderItemCascader();

    return (
        <>
        <Button onClick={() => createModalShow()} disabled={!(status === "draft" || status === "ordered")}>Neue Sonderposition</Button>
        <Modal {...createModalProps} title="Neue Sonderposition hinzufügen">
            <Form {...createFormProps} layout="vertical" onFinish={handleFinish}>
                <Form.Item label="Bestellung ID" name="order_id" initialValue={orderId} hidden />
                <Row gutter={24}>
                    <Col  span={12}>
                    <Form.Item label="Sonderbestellung" name="billbee_product_id" required>
                        <Select {...selectPropsSpecial} />
                    </Form.Item>
                    </Col>
                    <Col  span={12}>
                        <Form.Item label="Grundmodell" style={{ marginBottom: 0 }} required>
                            <Flex gap="8px" align="end">
                                <Form.Item
                                name="base_model_billbee_product_id"
                                noStyle   // wichtig! verhindert doppeltes Label
                                >
                                    <Select {...selectPropsBaseModel} style={{ minWidth: 220 }} />
                                </Form.Item>
                                <Button onClick={ausGrundmodellKopieren} >Aus Grundmodell kopieren</Button>
                            </Flex>
                        </Form.Item>
                    </Col>
                </Row>
                <Row gutter={24}>
                    <Col  span={12}>
                        <Form.Item label="Ext. SKU" name="supplier_sku" required>
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
                        <Form.Item label="Menge" name="qty_ordered" required>
                            <Input type="number" />
                        </Form.Item>
                    </Col>
                    <Col  span={12}>
                        <Form.Item label="Preis" name="unit_price_net" required>
                            <Input type="number" />
                        </Form.Item>
                    </Col>
                </Row>
                <Row gutter={24}>
                    <Col  span={6}>
                        <Form.Item label="Referenz" name="order_item_cascader" required>
                            <Cascader 
                                options={options} 
                                loading={loading} 
                                showSearch
                                allowClear
                                placeholder="Bestellung → Position"
                            />
                        </Form.Item>
                        <Form.Item name="fk_app_orders_id" hidden />
                        <Form.Item name="fk_app_order_items_id" hidden />
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