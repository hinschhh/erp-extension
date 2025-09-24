// src/app/(authenticated)/einkauf/bestellungen/page.tsx
"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Table,
  Button,
  Space,
  Tag,
  DatePicker,
  Select,
  Input,
  Row,
  Col,
  Typography,
} from "antd";
import { useTable } from "@refinedev/core";
import type { Tables } from "@/types/supabase";
import dayjs from "dayjs";
import { supabaseBrowserClient } from "@/utils/supabase/client";

// Supabase row types (generated via supabase gen types)
type PoRow = Tables<"app_purchase_orders">;

const STATUS_OPTIONS = [
  { value: "ordered", label: "Bestellt" },
  { value: "proforma", label: "Proforma bestätigt" },
  { value: "sketch_confirmed", label: "Skizze bestätigt" },
  { value: "dol_planned", label: "Lieferung geplant" },
  { value: "dol_actual", label: "Lieferung erfolgt" },
  { value: "goods_received", label: "Wareneingang" },
  { value: "invoiced", label: "Rechnung erhalten" },
];

const currency = (v?: number | null) =>
  typeof v === "number"
    ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v)
    : "-";

export default function BestellungenListPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowserClient, []);

  const { tableQueryResult, setFilters, setSorter, current, pageCount, setCurrent } =
    useTable<PoRow>({
      resource: "app_purchase_orders",
      pagination: { current: 1, pageSize: 20 },
      sorters: { initial: [{ field: "ordered_at", order: "desc" }] },
      filters: {
        initial: [
          { field: "status", operator: "eq", value: undefined },
        ],
      },
      meta: {
        select:
          "id, order_number, supplier_id, status, ordered_at, invoice_number, invoice_date, shipping_cost_net",
      },
    });

  const data = tableQueryResult?.data?.data ?? [];
  const loading = tableQueryResult?.isLoading;

  // Lightweight supplier name lookup (client-side to keep MVP simple)
  // You can replace this with a ref view later if needed
  const [supplierMap, setSupplierMap] = React.useState<Record<string, string>>({});
  React.useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("app_suppliers")
        .select("id, name")
        .limit(1000);
      const map: Record<string, string> = {};
      (data ?? []).forEach((s: any) => (map[s.id] = s.name));
      setSupplierMap(map);
    })();
  }, [supabase]);

  return (
    <div className="p-4">
      <Row justify="space-between" align="middle" className="mb-3">
        <Col>
          <Typography.Title level={3}>Einkauf · Bestellungen</Typography.Title>
        </Col>
        <Col>
          <Space>
            <Button type="primary" onClick={() => router.push("/einkauf/bestellungen/anlegen")} >
              Anlegen
            </Button>
          </Space>
        </Col>
      </Row>

      <Row gutter={[12, 12]} className="mb-3">
        <Col xs={24} md={8}>
          <Select
            allowClear
            placeholder="Status filtern"
            className="w-full"
            options={STATUS_OPTIONS}
            onChange={(val) => setFilters([{ field: "status", operator: "eq", value: val }])}
          />
        </Col>
        <Col xs={24} md={8}>
          <DatePicker.RangePicker
            placeholder={["Bestellt ab", "bis"]}
            className="w-full"
            onChange={(range) => {
              if (!range) return setFilters([]);
              const [from, to] = range;
              setFilters([
                { field: "ordered_at", operator: "gte", value: from?.format("YYYY-MM-DD") },
                { field: "ordered_at", operator: "lte", value: to?.format("YYYY-MM-DD") },
              ]);
            }}
          />
        </Col>
        <Col xs={24} md={8}>
          <Input.Search
            placeholder="Suche nach Bestellnr. / Rechnungsnr."
            onSearch={(q) =>
              setFilters([
                { field: "order_number", operator: "contains", value: q || undefined },
              ])
            }
            allowClear
          />
        </Col>
      </Row>

      <Table
        rowKey="id"
        loading={loading}
        dataSource={data as any}
        pagination={{ current, total: pageCount * 20, pageSize: 20, onChange: (p) => setCurrent(p) }}
        onChange={(pagination, _filters, sorter: any) => {
          if (sorter?.field) setSorter([{ field: sorter.field, order: sorter.order }]);
        }}
        columns={[
          {
            title: "Bestellnr.",
            dataIndex: "order_number",
            sorter: true,
            render: (val: string, rec: PoRow) => (
              <Link href={`/einkauf/bestellungen/bearbeiten/${rec.id}`}>{val}</Link>
            ),
          },
          {
            title: "Lieferant",
            dataIndex: "supplier_id",
            render: (v: string) => supplierMap[v] || v,
          },
          {
            title: "Status",
            dataIndex: "status",
            render: (s: string) => <Tag>{s}</Tag>,
          },
          {
            title: "Bestellt am",
            dataIndex: "ordered_at",
            sorter: true,
            render: (d?: string | null) => (d ? dayjs(d).format("DD.MM.YYYY") : "-"),
          },
          {
            title: "Rechnung",
            dataIndex: "invoice_number",
            render: (val: string | null, rec: PoRow) => (
              <Space direction="vertical" size={0}>
                <span>{val || "-"}</span>
                <small>{rec.invoice_date ? dayjs(rec.invoice_date).format("DD.MM.YYYY") : ""}</small>
              </Space>
            ),
          },
          {
            title: "Versand (netto)",
            dataIndex: "shipping_cost_net",
            align: "right" as const,
            render: (v: number | null) => currency(v ?? 0),
          },
          {
            title: "Aktion",
            render: (_: any, rec: PoRow) => (
              <Space>
                <Link href={`/einkauf/bestellungen/bearbeiten/${rec.id}`}>
                  <Button size="small">Bearbeiten</Button>
                </Link>
              </Space>
            ),
          },
        ]}
      />
    </div>
  );
}