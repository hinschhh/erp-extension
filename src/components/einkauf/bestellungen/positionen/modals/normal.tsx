//src/components/einkauf/bestellungen/positionen/modals/normal.tsx
"use client";
import { useInvalidate } from "@refinedev/core";
import { useModalForm, useSelect } from "@refinedev/antd";
import { Tables } from "@/types/supabase";
import { Button, Flex, Form, Input, Modal, Select } from "antd";
import { dataProvider } from "@providers/data-provider";
import { supabaseBrowserClient } from "@utils/supabase/client";

type PoItemNormal = Tables<"app_purchase_orders_positions_normal">;
type Produkte = Tables<"app_products">;

export default function ButtonEinkaufBestellpositionenNormalHinzufuegen({orderId, supplier, status}: {orderId: string, supplier: string, status: string}) {
    const dataProvider = supabaseBrowserClient;
    const invalidate = useInvalidate(); 
    const { formProps: createFormProps, modalProps: createModalProps, show: createModalShow } = useModalForm<PoItemNormal>({
        action: "create",
        resource: "app_purchase_orders_positions_normal",
        redirect: false,
        onMutationSuccess: async () => {
            await Promise.all([
                invalidate({
                resource: "app_purchase_orders_positions_normal_view", // <- VIEW!
                invalidates: ["list", "many"],
                }),
                invalidate({
                resource: "app_purchase_orders_positions_normal",
                invalidates: ["list", "many"],
                }),
            ]);
        },
    });
    const form = createFormProps.form!;

    const { selectProps } = useSelect<Produkte>({
        resource: "app_products",
        optionLabel: "bb_sku",
        optionValue: "id",
        sorters: [{ field: "bb_sku", order: "asc" }],
        filters: [{
            field: "fk_bb_supplier",
            operator: "eq",
            value: supplier,
        }],
    });

        const ausArtikelKopieren = async () => {
            const { data, error } = await dataProvider
                .from("app_products")
                .select("supplier_sku, bb_net_purchase_price, purchase_details")
                .eq("id", form.getFieldValue("billbee_product_id"))
                .single<{
                    supplier_sku: string | null;
                    bb_net_purchase_price: number | null;
                }>();

            if (error) {
                console.error("Error fetching product:", error);
            }

            const product = data;

            form.setFieldsValue({
                supplier_sku: product?.supplier_sku ?? "",
                unit_price_net: product?.bb_net_purchase_price ?? 0,
            });
        };

    return (
        <>
        <Button onClick={() => { createModalShow() }} disabled={!(status === "draft" || status === "ordered")}>Neue Position</Button>
        <Modal {...createModalProps} title="Neue Position hinzufügen">
            <Form {...createFormProps} layout="vertical">
                <Form.Item label="Bestellung ID" name="order_id" initialValue={orderId} hidden />
                <Form.Item label="Artikel" style={{ marginBottom: 0 }}>
                    <Flex gap="8px" align="end">
                        <Form.Item
                            name="billbee_product_id"
                            noStyle
                        >        
                            <Select {...selectProps} style={{ minWidth: 220 }} />
                        </Form.Item>
                            <Button onClick={ausArtikelKopieren}>Aus Artikel kopieren</Button>
                    </Flex>
                </Form.Item>
                <Form.Item label="Menge" name="qty_ordered">
                    <Input type="number" />
                </Form.Item>
                <Form.Item label="Preis" name="unit_price_net">
                    <Input type="number" />
                </Form.Item>
                <Form.Item label="Anmerkungen" name="internal_notes">
                    <Input.TextArea rows={4} />
                </Form.Item>
            </Form>
        </Modal>
        </>
    );
}