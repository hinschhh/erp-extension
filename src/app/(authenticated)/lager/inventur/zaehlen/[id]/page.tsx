"use client";

import SelectProduct from "@components/common/selects/product";
import { Alert, Select, Input, Button, Space, Card, Table, Form, Row, Col, Typography, InputNumber} from "antd";
import { Title, useSelect, useTable, useForm, SaveButton, DeleteButton } from "@refinedev/antd";
import { Tables } from "@/types/supabase";
import { useDataProvider } from "@refinedev/core";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useGetIdentity } from "@refinedev/core";


type stocks = Tables<"app_stocks">
type stock_locations = Tables<"app_stock_locations">
type counts = Tables<"app_inventory_counts">

export default function InventurZaehlenPage() {
    const params = useParams() as { id: string };
    const sessionId = params?.id;

    const { data: identity } = useGetIdentity<{ id: string }>();


    const dataProvider = useDataProvider();

    const [existingCount, setExistingCount] = useState<counts | null>(null);
    const [isChecking, setIsChecking] = useState(false);


    const {formProps, saveButtonProps} = useForm<counts>({
        resource: "app_inventory_counts",
        action: "create",
        liveMode: "auto",
        redirect: false,      // kein Redirect nach Create
        onMutationSuccess: () => {
            // hier nutzen wir die von refine verwaltete Form-Instanz
            formProps.form?.setFieldsValue({
                fk_products: undefined,   // Produkt leeren
                qty_sellable: undefined,  // oder 0, wenn du lieber eine 0 sehen willst
                qty_unsellable: undefined,
                note: undefined,          // dein Anmerkungsfeld (ggf. Namen anpassen)
            } as Partial<counts>);
        },
    });
    

        const handleValuesChange = async (
        changedValues: Partial<counts>,
        allValues: any, // hier TS ruhig etwas locker sehen, wir nutzen nur ein paar Felder
    ) => {
        // Wir reagieren nur, wenn eine der relevanten Auswahl-Felder sich ändert
        const relevantKeys = ["fk_stocks", "region", "fk_products"] as const;
        const changedKey = Object.keys(changedValues)[0] as keyof counts | undefined;

        if (!changedKey || !relevantKeys.includes(changedKey as any)) {
            return;
        }

        const { fk_stocks, region, fk_products } = allValues;

        // Wenn noch nicht alle drei Werte gesetzt sind → Hinweis zurücksetzen
        if (!fk_stocks || !region || !fk_products) {
            setExistingCount(null);
            return;
        }

        try {
            setIsChecking(true);

            const response = await dataProvider().getList<counts>({
                resource: "app_inventory_counts",
                pagination: { current: 1, pageSize: 1 },
                filters: [
                    {
                        field: "session_id", // 🟡 an deine Spalte anpassen (z.B. fk_inventory_sessions_id)
                        operator: "eq",
                        value: sessionId,
                    },
                    {
                        field: "fk_stocks",
                        operator: "eq",
                        value: fk_stocks,
                    },
                    {
                        field: "region", // 🟡 ggf. fk_stock_locations o. ä.
                        operator: "eq",
                        value: region,
                    },
                    {
                        field: "fk_products",
                        operator: "eq",
                        value: fk_products,
                    },
                ],
            });

            const row = response.data?.[0] ?? null;
            setExistingCount(row);
        } catch (error) {
            console.error("Fehler beim Prüfen vorhandener Zählung:", error);
            // keinen message.error hier, sonst nervt es beim Tippen – nur Log
            setExistingCount(null);
        } finally {
            setIsChecking(false);
        }
    };


    const {selectProps: stocksSelectProps} = useSelect<stocks>({
        resource: "app_stocks",
        optionLabel: "bb_Name",
        optionValue: "id",
    });

    const {selectProps: stockLocationsSelectProps} = useSelect<stock_locations>({
        resource: "app_stock_locations",
        optionLabel: "name",
        optionValue: "id",
    });


    const {tableProps} = useTable<counts>({
        resource: "app_inventory_counts",
        liveMode: "auto",
        sorters: { initial: [{ field: "created_at", order: "desc" }], mode: "server" },
        pagination: {pageSize: 50},
        meta: {select: "*, app_products(bb_sku), app_stocks(bb_Name), app_stock_locations(name)"},
    });

    const sharedProps = {
        mode: 'spinner',
        min: 0,
        max: 100,
        onChange: (value: number | null) => {
          if (value !== null) {
            console.log("Value changed:", value);
          }
        },
        style: { width: 150 },
    };


    return (
        <>
        <Card>
            <Form {...formProps} layout="vertical" onValuesChange={handleValuesChange} >
                <Form.Item label="session_id" name="session_id" hidden initialValue={sessionId}/>
                <Form.Item label="Zähler" name="counted_by" hidden initialValue={identity?.id}/>
                <Row gutter={[8, 8]}>
                    <Col xs={24} sm={24} md={24}>
                        <Form.Item label="Lager" name="fk_stocks" style={{width: "100%"}}>
                            <Select style={{ width: "100%" }} placeholder="Lager wählen" {...stocksSelectProps} />
                        </Form.Item>
                    </Col>
                    <Col xs={24} sm={24} md={24}>
                        <Form.Item label="Lagerregion" name="stock_location" style={{width: "100%"}}>
                            <Select style={{ width: "100%" }} placeholder="Lagerregion wählen" {...stockLocationsSelectProps} />
                        </Form.Item>
                    </Col>
                    <Col xs={24} sm={24} md={24}>
                        <Form.Item label="Produkt" name="fk_products" style={{width: "100%"}}>
                            <SelectProduct />
                        </ Form.Item>
                        {isChecking && (
                <Typography.Text type="secondary">
                    Prüfe vorhandene Zählung …
                </Typography.Text>
            )}

            {!isChecking && existingCount && (
                <Alert
                    style={{ marginTop: 12 }}
                    type="warning"
                    showIcon
                    message="Für dieses Produkt in dieser Lagerregion existiert bereits ein Zählbestand."
                    description={
                        <>
                            <div>
                                <strong>Verkäuflich:</strong>{" "}
                                {Number(existingCount.qty_sellable ?? 0)}
                            </div>
                            <div>
                                <strong>Unverkäuflich:</strong>{" "}
                                {Number(existingCount.qty_unsellable ?? 0)}
                            </div>
                        </>
                    }
                />
            )}
                    </Col>
                    
                    <Col xs={12} sm={12} md={12}>
                        <Form.Item label="Verkäuflich" name="qty_sellable" style={{width: "100%"}}>
                            <InputNumber placeholder="Anzahl" {...sharedProps} style={{width: "100%"}}/>
                        </ Form.Item>
                    </Col>
                    <Col xs={12} sm={12} md={12}>
                        <Form.Item label="Unverkäuflich" name="qty_unsellable" style={{width: "100%"}}>
                            <InputNumber placeholder="Anzahl" {...sharedProps} style={{width: "100%"}}/>
                        </ Form.Item>
                    </Col>
                    <Col xs={24} sm={24} md={24}>
                        <Form.Item label="Anmerkungen" name="note" style={{width: "100%"}}>
                            <Input.TextArea  style={{ width: "100%" }} rows={4}/>
                        </Form.Item>
                    </Col>
                    <Col xs={24} sm={24} md={24}>
                        <Form.Item>
                            <SaveButton  style={{ width: "100%" }} type="primary" htmlType="submit">Hinzufügen</SaveButton>
                        </Form.Item>
                    </Col>
                </Row>
            </Form>
        </Card>
            <Space><Typography.Title level={4}>Zuletzt gezählt:</Typography.Title></Space>
            <Table {...tableProps}  tableLayout="fixed" scroll={{ x: "100%" }}  rowKey="id" style={{ marginTop: 8, width: "100%" }}>
                <Table.Column title="Produkt" dataIndex={["app_products", "bb_sku"]} key="product" ellipsis />
                <Table.Column title="Lagerregion" dataIndex="stock_location" key="region" ellipsis
                    render={(_, record) =><>
                        <Typography.Text ellipsis>{record.app_stock_locations?.name}</Typography.Text>
                        <Typography.Text type="secondary" style={{display: 'block'}} ellipsis>{record.app_stocks?.bb_Name}</Typography.Text>
                    </>}
                />
                <Table.Column title="Verkäuflich" dataIndex="qty_sellable" key="qty_sellable" />
                <Table.Column title="Unverkäuflich" dataIndex="qty_unsellable" key="qty_unsellable" />
                <Table.Column title="Löschen" 
                    render={(_, record) => 
                        <DeleteButton recordItemId={record.id} hideText
                            size="small"
                            resource="app_inventory_counts"
                            mutationMode="pessimistic"
                            confirmTitle="Position wirklich löschen?"
                            confirmOkText="Löschen"
                            confirmCancelText="Abbrechen"
                            onError={(err) => console.error("Delete error:", err)}
                        />
                        } 
                />
            </Table>
        </>
    );
}