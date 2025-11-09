"use client";

import React, { useMemo } from "react";
import { Table, Tag, Typography } from "antd";
import {
  List,
  useTable,
  getDefaultFilter,
  getDefaultSortOrder,
  useSelect,
} from "@refinedev/antd";
import type { HttpError } from "@refinedev/core";
import type { Tables } from "@/types/supabase";
import { ColumnMultiSelectFilter, type ColumnFilterOption } from "@/components/common/table/ColumnMultiSelectFilter";
import Link from "next/link";

/* ---------- Typen ---------- */
type Row = Tables<"app_products">;

/* Dedupe & Null/Leer filtern */
const dedupeOptions = (opts: ColumnFilterOption[] = []): ColumnFilterOption[] => {
  const seen = new Set<string>();
  return opts.filter((o) => {
    const v = o?.value;
    if (v === null || v === undefined || v === "") return false;
    const key = String(v);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export default function ArtikelListPage() {
  const { tableProps, sorters, filters } = useTable<Row, HttpError>({
    resource: "app_products",
    meta: { select: "*" },
    sorters: { initial: [{ field: "bb_sku", order: "asc" }], mode: "server" },
    filters: { initial: [], mode: "server" },
    pagination: { pageSize: 50 },
    syncWithLocation: true,
  });

  /* ---------- Optionen via useSelect (für Filter-Dropdowns) ---------- */

  // SKU-Optionen
  const { selectProps: skuSelectProps } = useSelect({
    resource: "app_products",
    optionLabel: "bb_sku",
    optionValue: "bb_sku",
    pagination: { pageSize: 200 },
    sorters: [{ field: "bb_sku", order: "asc" }],
    filters: [{ field: "bb_sku", operator: "ne", value: null }, { field: "inventory_cagtegory", operator: "ne", value: "Kein Inventar" }],
    meta: { select: "bb_sku" },
  });
  const skuOptions = useMemo(
    () => dedupeOptions((skuSelectProps.options ?? []) as ColumnFilterOption[]),
    [skuSelectProps.options],
  );

  // Lieferanten-Optionen
  const { selectProps: supplierSelectProps } = useSelect({
    resource: "app_products",
    optionLabel: "fk_bb_supplier",
    optionValue: "fk_bb_supplier",
    pagination: { pageSize: 200 },
    sorters: [{ field: "fk_bb_supplier", order: "asc" }],
    filters: [{ field: "fk_bb_supplier", operator: "ne", value: null }],
    meta: { select: "fk_bb_supplier" },
  });
  const supplierOptions = useMemo(
    () => dedupeOptions((supplierSelectProps.options ?? []) as ColumnFilterOption[]),
    [supplierSelectProps.options],
  );

  // Aktiv (Boolean) als feste Optionen
  const activeOptions: ColumnFilterOption[] = useMemo(
    () => [
      { label: "Aktiv", value: "true" },
      { label: "Inaktiv", value: "false" },
    ],
    [],
  );

  // BOM (Boolean) als feste Optionen
  const bomOptions: ColumnFilterOption[] = useMemo(
    () => [
      { label: "Ja", value: "true" },
      { label: "Nein", value: "false" },
    ],
    [],
  );

  return (
    <List title="Artikel">
      <Table<Row>
        rowKey="id"
        {...tableProps}
        pagination={{
          ...tableProps.pagination,
          position: ["topRight", "bottomRight"],
          size: "small",
          showSizeChanger: true,
          pageSizeOptions: [50, 100, 250, 500],
          showTotal: (t) => `${t} Einträge`,
        }}
        tableLayout="fixed"
        sticky={{}}
        scroll={{ x: "max-content" }}
      >
        {/* SKU mit ColumnMultiSelectFilter */}
        <Table.Column<Row>
          title="SKU"
          dataIndex="bb_sku"
          width={220}
          ellipsis
          sorter
          defaultSortOrder={getDefaultSortOrder("bb_sku", sorters)}
          filteredValue={getDefaultFilter("bb_sku", filters)}
          filterDropdown={(fp) => (
            <ColumnMultiSelectFilter
              {...fp}
              options={skuOptions}
              placeholder="SKU wählen…"
            />
          )}
          render={(v: Row["bb_sku"], r) =>
            v ? (
              <Link href={`/artikel/anzeigen/${r.id}`}>
                <Typography.Text code>{v}</Typography.Text>
              </Link>
            ) : (
              "—"
            )
          }
        />

        {/* Name */}
        <Table.Column<Row>
          title="Name"
          dataIndex="bb_name"
          ellipsis
          sorter
          defaultSortOrder={getDefaultSortOrder("bb_name", sorters)}
          filteredValue={getDefaultFilter("bb_name", filters)}
        />

        {/* Lieferant mit ColumnMultiSelectFilter */}
        <Table.Column<Row>
          title="Lieferant"
          dataIndex="fk_bb_supplier"
          width={200}
          ellipsis
          sorter
          filteredValue={getDefaultFilter("fk_bb_supplier", filters)}
          filterDropdown={(fp) => (
            <ColumnMultiSelectFilter
              {...fp}
              options={supplierOptions}
              placeholder="Lieferant wählen…"
            />
          )}
        />

        {/* Aktiv (Tag + Filter) */}
        <Table.Column<Row>
          title="Aktiv"
          dataIndex="bb_is_active"
          width={110}
          sorter
          filteredValue={getDefaultFilter("bb_is_active", filters)}
          filterDropdown={(fp) => (
            <ColumnMultiSelectFilter
              {...fp}
              options={activeOptions}
              placeholder="Status wählen…"
            />
          )}
          render={(v: Row["bb_is_active"]) =>
            v ? <Tag color="green">aktiv</Tag> : <Tag>inaktiv</Tag>
          }
        />

        {/* BOM (Tag + Filter) */}
        <Table.Column<Row>
          title="BOM"
          dataIndex="bb_is_bom"
          width={100}
          sorter
          filteredValue={getDefaultFilter("bb_is_bom", filters)}
          filterDropdown={(fp) => (
            <ColumnMultiSelectFilter
              {...fp}
              options={bomOptions}
              placeholder="BOM wählen…"
            />
          )}
          render={(v: Row["bb_is_bom"]) => (v ? <Tag color="blue">ja</Tag> : <Tag>nein</Tag>)}
        />

        {/* EK netto */}
        <Table.Column<Row>
          title="EK (netto)"
          dataIndex="bb_net_purchase_price"
          width={140}
          sorter
          render={(v: Row["bb_net_purchase_price"]) =>
            v != null
              ? new Intl.NumberFormat("de-DE", {
                  style: "currency",
                  currency: "EUR",
                }).format(Number(v))
              : "—"
          }
        />

        {/* Lieferanten-SKU (Externe Art.-Nr.) */}
        <Table.Column<Row>
          title="Ext. Art.-Nr."
          dataIndex="supplier_sku"
          width={180}
          ellipsis
          sorter
          filteredValue={getDefaultFilter("supplier_sku", filters)}
        />
      </Table>
    </List>
  );
}
