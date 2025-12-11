"use client";

import { Space, Card, Table, Form, Input, Button, Alert, App as AntdApp, Progress, Select } from "antd";
import { List, useTable, useSelect } from "@refinedev/antd";
import { useState } from "react";

import { Database } from "@/types/supabase";
import { supabaseBrowserClient } from "@/utils/supabase/client";
import { CheckOutlined, EditOutlined } from "@ant-design/icons";
import { Tables } from "@/types/supabase";

type ProductInventory =
  Database["public"]["Views"]["rpt_products_inventory_purchasing"];
type InventorySession =
  Database["public"]["Tables"]["app_inventory_sessions"]["Row"];

export default function InventarPage() {
  const { message } = AntdApp.useApp();
  const [starting, setStarting] = useState(false);
  const [session, setSession] = useState<InventorySession | null>(null);

  const { tableProps } = useTable<ProductInventory>({
    resource: "view_inventory_sessions_with_product_count",
    liveMode: "auto",
    filters: {
      initial: [
      ],
      mode: "server",
    },
    meta: { select: "*" },
    pagination: {mode: "off"},
  });

  const handleStart = async (values: { name: string; note?: string }) => {
    const name = values?.name?.trim();
    if (!name) {
      message.error("Bitte einen Namen fuer die Inventur angeben.");
      return;
    }

    try {
      setStarting(true);
      const { data, error } = await (supabaseBrowserClient as any).rpc(
        "rpc_app_inventory_session_start",
        {
          p_name: name,
          p_note: values?.note ?? null,
        }
      );
      if (error) {
        throw error;
      }
      setSession(data as InventorySession);
      message.success("Inventur gestartet und Snapshot erstellt.");
    } catch (err: any) {
      const msg = err?.message ?? "Inventur konnte nicht gestartet werden.";
      message.error(msg);
    } finally {
      setStarting(false);
    }
  };

  return (
      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <Card title="Inventur starten" bordered>
          <Form layout="vertical" onFinish={handleStart}>
            <Form.Item
              label="Name"
              name="name"
              rules={[{ required: true, message: "Name der Inventur fehlt." }]}
            >
              <Input placeholder="z. B. Jahresinventur 2025" />
            </Form.Item>
            <Form.Item label="Notiz" name="note">
              <Input.TextArea rows={2} placeholder="Optional: Beschreibung/Notiz" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={starting}>
                Inventur starten & Snapshot erzeugen
              </Button>
            </Form.Item>
          </Form>
          {session ? (
            <Alert
              style={{ marginTop: 12 }}
              type="success"
              showIcon
              message={`Inventur "${session.name}" gestartet`}
              description={`Status: ${session.status}, Snapshot: ${session.snapshot_taken_at ?? "-"}`}
            />
          ) : null}
        </Card>

        <List title="Vergangene Inventuren">
          <Table {...tableProps} rowKey="product_id">
            <Table.Column title="Bezeichnung" dataIndex="name" sorter />
            <Table.Column title="Status" dataIndex="status" sorter />
            <Table.Column title="Anmerkungen" dataIndex="note" sorter />
            <Table.Column title="Fortschritt" dataIndex="countable_products" 
              render={(_, record) => 
                <Progress percent={Math.round(record?.counted_products / record?.countable_products * 100)}/>
              }   
            />
            <Table.Column title="Aktionen" key="actions" render={(_, record) => (
              <Space>
                <Button href={`/lager/inventur/zaehlen/${record.id}`} icon={<EditOutlined />}>Zählen</Button>
                <Button href={`/lager/inventur/pruefen/${record.id}`} icon={<CheckOutlined />}>Differenzen prüfen</Button>
              </Space>
            )} />
          </Table>
        </List>
      </Space>
  );
}
