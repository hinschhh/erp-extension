"use client";

import { Form, Button, Space, Select, InputNumber } from "antd";
import type { SelectProps } from "antd";

type Props = {
  /** Name der Form.List, z.B. "itemsNormal" oder "itemsSpecial" */
  name: string;
  /** Button-Label zum Hinzufügen */
  addLabel: string;
  /** Select-Props direkt aus useSelect().selectProps */
  selectProps: SelectProps<string>;
};

export default function InboundItemList({ name, addLabel, selectProps }: Props) {
  return (
    <Form.List name={name}>
      {(fields, { add, remove }) => (
        <>
          <Space style={{ marginBottom: 12 }}>
            <Button type="primary" onClick={() => add()}>{addLabel}</Button>
          </Space>

          {fields.length === 0 && (
            <div style={{ padding: 12, border: "1px dashed #d9d9d9", borderRadius: 8 }}>
              Noch keine Positionen hinzugefügt.
            </div>
          )}

          {fields.map(({ key, name, ...rest }) => (
            <div
              key={key}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 180px 100px",
                gap: 12,
                alignItems: "start",
                padding: 12,
                border: "1px solid #f0f0f0",
                borderRadius: 8,
                marginBottom: 8,
              }}
            >
              <Form.Item
                {...rest}
                name={[name, "purchase_order_position_id"]}
                label="PO-Position"
                rules={[{ required: true, message: "Bitte Position wählen" }]}
                style={{ marginBottom: 0 }}
              >
                <Select {...selectProps} placeholder="Offene PO-Position wählen" showSearch />
              </Form.Item>

              <Form.Item
                {...rest}
                name={[name, "qty_received"]}
                label="Menge (WE)"
                rules={[{ required: true, message: "Bitte Menge angeben" }]}
              >
                <InputNumber min={1} style={{ width: "100%" }} />
              </Form.Item>

              <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
                <Button danger onClick={() => remove(name)}>Entfernen</Button>
              </div>
            </div>
          ))}
        </>
      )}
    </Form.List>
  );
}
