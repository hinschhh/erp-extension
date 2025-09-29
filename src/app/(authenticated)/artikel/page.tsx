"use client";

import React from "react";
import Link from "next/link";
import { useTable } from "@refinedev/antd";
import { Table, Card, Space, Tag, Input, Button } from "antd";
import type { Tables } from "@/types/supabase";
import { EditOutlined } from "@ant-design/icons";

type Row = Omit<Tables<"rpt_products_full">, "id"> & { id: number };

export default function ArtikelListPage() {
  const [search, setSearch] = React.useState<string>("");

  const { tableProps } = useTable<Row>({
    resource: "rpt_products_full",
    pagination: { pageSize: 20 },
    sorters: { initial: [{ field: "sku", order: "asc" }] },
    syncWithLocation: false,
    meta: {},
  });

  const filteredData = (tableProps.dataSource ?? []).filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (r.sku ?? "").toLowerCase().includes(q) ||
      (r.name ?? "").toLowerCase().includes(q) ||
      (r.manufacturer ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <Card
      title="Artikel"
      extra={
        <Input.Search
          placeholder="SKU, Name, Hersteller…"
          allowClear
          onSearch={setSearch}
          onChange={(e) => setSearch(e.target.value)}
        />
      }
    >
      <Table<Row>
        {...tableProps}
        dataSource={filteredData}
        rowKey={(r) => String(r.id!)}
        pagination={tableProps.pagination}
        columns={[
          {
            title: "SKU",
            dataIndex: "sku",
            render: (v, r) => (
              <Link href={`/artikel/bearbeiten/${r.id}`}>{v ?? "—"}</Link>
            ),
          },
          { title: "Name", dataIndex: "name", ellipsis: true },
          { title: "Hersteller", dataIndex: "manufacturer", width: 160 },
          {
            title: "Aktiv",
            dataIndex: "is_active",
            width: 90,
            render: (v: boolean | null) =>
              v ? <Tag color="green">aktiv</Tag> : <Tag>inaktiv</Tag>,
          },
          {
            title: "BOM",
            dataIndex: "is_bom",
            width: 90,
            render: (v: boolean | null) =>
              v ? <Tag color="blue">ja</Tag> : <Tag>nein</Tag>,
          },
          {
            title: "EK (netto)",
            dataIndex: "net_purchase_price",
            width: 130,
            render: (v: number | null) =>
              v != null
                ? new Intl.NumberFormat("de-DE", {
                    style: "currency",
                    currency: "EUR",
                  }).format(Number(v))
                : "—",
          },
          { title: "Ext. Art.-Nr.", dataIndex: "external_sku", width: 160, ellipsis: true },
          {
            title: "Aktion",
            dataIndex: "billbee_product_id",
            width: 180,
            render: (_: any, r) => (
              <Space size="small">
                <Button 
                  icon={<EditOutlined />}
                  href={`/artikel/bearbeiten/${r.id}`}
                >
                </Button>
              </Space>
            ),
          },
        ]}
      />
    </Card>
  );
}
