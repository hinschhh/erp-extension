"use client";

import SelectSupplier from "@components/common/selects/supplier";
import { PoStatusTag } from "@components/common/tags/states/po";
import { Create, useForm } from "@refinedev/antd";
import { parseNumber } from "@utils/formats";
import { Col, Row, Checkbox, DatePicker, Form, Input } from "antd";
import { Tables } from "@/types/supabase";
import dayjs from "dayjs";
import { useNavigation } from "@refinedev/core";

type Po = Tables<"app_purchase_orders">;

export default function EinkaufsBestellungenAnlegen() {

    const {edit} = useNavigation();

  const { formProps: formPropsHeader, saveButtonProps } = useForm<Po>({
    resource: "app_purchase_orders",
    redirect: false,
    onMutationSuccess: async (data) => {
        const newId = data?.data?.id;
        if (!newId) return;
        edit("app_purchase_orders", newId);
    }
  });

return (
    <Create title="Einkauf - Bestellung anlegen" saveButtonProps={saveButtonProps}>
    <Form {...formPropsHeader} layout="vertical" id="edit-po-header-form">
        <Row gutter={24}>
          <Col span={8}>
            <Form.Item label="ID" name="id" hidden>
              <Input disabled />
            </Form.Item>

            <Form.Item
              label="Bestellnummer"
              name="order_number"
            >
              <Input disabled placeholder="wird automatisch erzeugt"/>
            </Form.Item>

            <Form.Item label="Bestelldatum" name="ordered_at">
                <DatePicker type="date" placeholder="Datum wählen..." defaultValue={dayjs(new Date().toISOString().slice(0, 10))} format="DD.MM.YYYY" style={{ width: "100%" }} />
            </Form.Item>

            <Form.Item label="Hersteller" name="supplier">
              <SelectSupplier />
            </Form.Item>

            <div style={{ paddingTop: 8 }}>
              <PoStatusTag status={formPropsHeader.initialValues?.status || "draft"} />
            </div>
          </Col>
        </Row>
      </Form>
    </Create>
);

}