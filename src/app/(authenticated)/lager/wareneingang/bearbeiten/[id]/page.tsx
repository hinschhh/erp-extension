"use client";

import { Edit, useForm, useSelect, ListButton, RefreshButton } from "@refinedev/antd";
import { Button, Col, DatePicker, Form, Input, InputNumber, Row, Select, TreeSelect, Upload } from "antd";
import { LoginOutlined, UploadOutlined } from "@ant-design/icons";
import {Tables } from "@/types/supabase";
import InboundItemList from "@components/lager/wareneingang/bearbeiten/InboundItemList";
import InboundItems from "@components/lager/wareneingang/bearbeiten/InboundItemList";
import SelectStateIS from "@components/common/selects/state_is";
import dayjs from "dayjs";
import InboundPostAndDispatchButton from "@components/common/buttons/post_is";

type InboundShipment = Tables<"app_inbound_shipments">;
type PO = Tables<"app_purchase_orders">;
type POItemsNormal = Tables<"app_purchase_orders_positions_normal">;
type POItemsSpecial = Tables<"app_purchase_orders_positions_special">;
type Suppliers = Tables<"app_suppliers">;

export default function InboundShipmentCreatePage() {

  const { formProps, saveButtonProps} = useForm<InboundShipment>({
    resource: "app_inbound_shipments",
    redirect: false,
  });

  const {selectProps: selectPropsPOItemNormal} = useSelect<POItemsNormal>({
    resource: "app_purchase_orders_positions_normal",
    optionLabel: "id",
    optionValue: "id",
  });

    const {selectProps: selectPropsSupplier} = useSelect<Suppliers>({
    resource: "app_suppliers",
    optionLabel: "id",
    optionValue: "id",
  });

    const {selectProps: selectPropsPO} = useSelect<PO>({
      resource: "app_purchase_orders",
      optionLabel: (item) => `${item.order_number} - (${item.supplier} - ${item.invoice_number})`,
      optionValue: "id",
      filters: [{
        field: "status",
        operator: "in",
        value: ["partially_in_production", "in_production", "partially_delivered"],
      }],
    });

  return (
    <>
    <Edit title="Wareneingang bearbeiten"
      headerButtons={
        <>
          <ListButton hideText />
          <RefreshButton hideText />
          <InboundPostAndDispatchButton inboundShipmentId={formProps?.initialValues?.id as string} />
        </> 
      }
    saveButtonProps={saveButtonProps} 
    >
      <Form {...formProps} layout="vertical">
        <Row gutter={24}>
          <Col span={8}>
            <Form.Item name="inbound_number" label="Wareneingangsnummer">
              <Input placeholder="wird automatisch vergeben" disabled/>
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="arrived_at" label="Wareneingangsdatum" getValueProps={(v) => ({ value: v ? dayjs(v) : null })} required>
              <DatePicker style={{ width: "100%" }} placeholder="Datum wählen..." format="DD.MM.YYYY"/>
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="status" label="Status" required>
              <SelectStateIS />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={24}>
          <Col span={8}>
            <Form.Item name="fk_bb_supplier" label="Lieferant" required>
              <Select {...selectPropsSupplier} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item name="delivery_note_no" label="Lieferscheinnummer" required>
              <Input placeholder="Lieferscheinnummer eingeben" />
            </Form.Item>
          </Col>
          {/*<Col span={4}>
            <Form.Item name="upload_delivery_note" label="Lieferschein hochladen">
              <Upload {...{}}>
                <Button icon={<UploadOutlined />}>Klicken zum Hochladen</Button>
              </Upload>
            </Form.Item>
          </Col>*/}
          <Col span={8}>
          <Form.Item name="shipping_cost_separate" label="Lieferkosten separate Rechnung">
            <InputNumber placeholder="Betrag" addonAfter="€" step={0.01} />
          </Form.Item>
        </Col>
          
        </Row>
            <Form.Item name="note" label="Notiz">
              <Input.TextArea placeholder="Notiz eingeben" rows={4} />
            </Form.Item>
      </Form>
      
    </Edit>
    <InboundItems inboundShipmentId={formProps?.initialValues?.id as string} inboundShipmentStatus={formProps?.initialValues?.status as "planned" | "delivered" | "posted"} inboundShipmentSupplier={formProps?.initialValues?.fk_bb_supplier as string} />
    </>
  );
}