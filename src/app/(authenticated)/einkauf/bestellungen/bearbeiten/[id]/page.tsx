// src/app/(authenticated)/einkauf/bestellungen/bearbeiten/[id]/page.tsx
"use client";

import { useParams } from "next/navigation";
import { useOne } from "@refinedev/core";
import {
  useForm,
  Edit,
  RefreshButton,
  ListButton,
} from "@refinedev/antd";
import { Button, Checkbox, Col, DatePicker, Form, Input, Row } from "antd";
import dayjs from "dayjs";

import { Tables } from "@/types/supabase";
import { PoStatusTag } from "@components/common/tags/states/po";
import SelectSupplier from "@components/common/selects/supplier";

import { parseNumber } from "@/utils/formats";
import EinkaufBestellpositionenNormalBearbeiten from "@components/einkauf/bestellungen/positionen/normal";
import EinkaufBestellpositionenSpecialBearbeiten from "@components/einkauf/bestellungen/positionen/special";
import OrderStatusActionButton from "@components/common/buttons/po_order_confirm";

type Po = Tables<"app_purchase_orders">;

export default function EinkaufsBestellungenBearbeiten() {
  const params = useParams() as { id: string };
  const orderId = params?.id;


  const { formProps: formPropsHeader, saveButtonProps } = useForm<Po>({
    resource: "app_purchase_orders",
    id: orderId,
    meta: {
      select: "*, supplier_rel:app_suppliers!app_purchase_orders_supplier_fkey(id)",
    },
  });

  const orderIdStr = orderId?.toString();
  const supplier = Form.useWatch("supplier", formPropsHeader.form);
  const status = formPropsHeader.form?.getFieldValue("status");

  return (
    <>
    <Edit
      title="Einkauf - Bestellung bearbeiten"
      headerButtons={
        <>
          <ListButton hideText />
          <RefreshButton hideText />
          <OrderStatusActionButton orderId={orderId}/>
        </> 
      }
      saveButtonProps={saveButtonProps} 
    >
      <Form {...formPropsHeader} layout="vertical" id="edit-po-header-form">
        <Row gutter={24}>
          <Col span={8}>
            <Form.Item label="ID" name="id" hidden>
              <Input disabled />
            </Form.Item>

            <Form.Item
              label="Bestellnummer"
              name="order_number"
              rules={[{ required: true, message: "Bestellnummer fehlt noch" }]}
            >
              <Input disabled />
            </Form.Item>

            <Form.Item label="Bestelldatum" name="ordered_at">
              <Input disabled />
            </Form.Item>

            <Form.Item label="Hersteller" name="supplier">
              <SelectSupplier disabled />
            </Form.Item>

            <div style={{ paddingTop: 8 }}>
              <PoStatusTag status={status || "draft"} />
            </div>
          </Col>

          <Col span={8}>
            <Form.Item label="Rechnungsnummer" name="invoice_number">
              <Input />
            </Form.Item>

            <Form.Item label="Rechnungsdatum" name="invoice_date">
              <DatePicker type="date" placeholder="Datum wählen..." format="DD.MM.YYYY" style={{ width: "100%" }} />
            </Form.Item>

            <Form.Item
              label="Versandkosten netto"
              name="shipping_cost_net"
              normalize={parseNumber}
            >
              <Input type="number" />
            </Form.Item>

            <Form.Item
              name="separate_invoice_for_shipping_cost"
              valuePropName="checked"
            >
              <Checkbox>Versandkosten separat abrechnen?</Checkbox>
            </Form.Item>
          </Col>

          <Col span={8}>
            <Form.Item label="Notizen" name="notes">
              <Input.TextArea rows={6} />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Edit>
        <EinkaufBestellpositionenNormalBearbeiten orderId={orderIdStr as string} supplier={supplier as string} status={status as string} />
        <EinkaufBestellpositionenSpecialBearbeiten orderId={orderIdStr as string} supplier={supplier as string} status={status as string}/>
    </>
  );
}
