"use client";

import React, { useMemo } from "react";
import { Table, Tooltip, Typography, Tag } from "antd"; // ⬅️ Tag hinzu
import {
  List,
  useTable,
  getDefaultFilter,
  getDefaultSortOrder,
  useSelect,
} from "@refinedev/antd";
import type { HttpError } from "@refinedev/core";
import { ColumnMultiSelectFilter, type ColumnFilterOption } from "@/components/common/table/ColumnMultiSelectFilter";
import Link from "next/link";

/* ---------- Typen ---------- */
type Row = {
  product_id: number;
  sku: string | null;
  inventory_cagtegory: string | null;
  supplier: string | null;
  on_demand: boolean | null;      // ⬅️ NEU
  stock_free: number | string;
  stock_reserved_direct: number | string;
  stock_reserved_bom: number | string;
  stock_unavailable: number | string;
  stock_physical: number | string;
  stock_on_order: number | string;
  updated_at: string;
};

type Search = { q?: string };

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

export default function BestellvorschlaegePage() {
  const { tableProps, sorters, filters } = useTable<Row, HttpError, Search>({
    resource: "rpt_products_inventory_purchasing",
    meta: { select: "*" },
    sorters: { initial: [{ field: "sku", order: "asc" }], mode: "server" },
    filters: { initial: [], mode: "server" },
    pagination: { pageSize: 100 },
    syncWithLocation: true,
  });

  /* ---------- useSelect: Optionen pro Spalte ---------- */
  const { selectProps: skuSelectProps } = useSelect({
    resource: "rpt_products_inventory_purchasing",
    optionLabel: "sku",
    optionValue: "sku",
    pagination: { pageSize: 100 },
    sorters: [{ field: "sku", order: "asc" }],
    filters: [{ field: "sku", operator: "ne", value: null }],
    meta: { select: "sku" },
  });
  const skuOptions = useMemo(
    () => dedupeOptions((skuSelectProps.options ?? []) as ColumnFilterOption[]),
    [skuSelectProps.options],
  );

  const { selectProps: invCatSelectProps } = useSelect({
    resource: "rpt_products_inventory_purchasing",
    optionLabel: "inventory_cagtegory",
    optionValue: "inventory_cagtegory",
    pagination: { pageSize: 100 },
    sorters: [{ field: "inventory_cagtegory", order: "asc" }],
    filters: [{ field: "inventory_cagtegory", operator: "ne", value: null }],
    meta: { select: "inventory_cagtegory" },
  });
  const inventoryCategoryOptions = useMemo(
    () => dedupeOptions((invCatSelectProps.options ?? []) as ColumnFilterOption[]),
    [invCatSelectProps.options],
  );

  // Für on_demand reichen feste Optionen (Boolean)
  const onDemandOptions: ColumnFilterOption[] = useMemo(
    () => [
      { label: "Nur auf Bestellung", value: "true" },
      { label: "In der Regel auf Lager", value: "false" },
    ],
    [],
  );

  const { selectProps: supplierSelectProps } = useSelect({
    resource: "rpt_products_inventory_purchasing",
    optionLabel: "supplier",
    optionValue: "supplier",
    pagination: { pageSize: 100 },
    sorters: [{ field: "supplier", order: "asc" }],
    filters: [{ field: "supplier", operator: "ne", value: null }],
    meta: { select: "supplier" },
  });
  const supplierOptions = useMemo(
    () => dedupeOptions((supplierSelectProps.options ?? []) as ColumnFilterOption[]),
    [supplierSelectProps.options],
  );

  // Helper: Badge/Tag-Renderer
  const renderOnDemandTag = (flag: boolean | null | undefined) => {
    if (flag === true) {
      return <Tag>Nur auf Bestellung</Tag>;
    }
    if (flag === false) {
      return <Tag>In der Regel auf Lager</Tag>;
    }
    return <Tag>—</Tag>; // falls NULL
  };

  return (
    <List title="Bestellvorschläge">
      <Table
        rowKey="billbee_product_id"
        {...tableProps}
        pagination={{
          ...tableProps.pagination,
          position: ["topRight", "bottomRight"],
          size: "small",
          showSizeChanger: true,
          pageSizeOptions: [50, 100, 250, 500],
          showTotal: (t) => `${t} Einträge`,
        }}
      >
        {/* SKU */}
        <Table.Column<Row>
          title="SKU"
          dataIndex="sku"
          width={250}
          ellipsis
          fixed="left"
          sorter
          defaultSortOrder={getDefaultSortOrder("sku", sorters)}
          filteredValue={getDefaultFilter("sku", filters)}
          filterDropdown={(fp) => (
            <ColumnMultiSelectFilter {...fp} options={skuOptions} placeholder="SKU wählen…" />
          )}
          render={(v, r) => <Link href={`/artikel/anzeigen/${r.product_id}`}>{v || "—"}</Link>}
        />

        {/* Inventur-Kategorie */}
        <Table.Column<Row>
          title="Inventur-Kategorie"
          dataIndex="inventory_cagtegory"
          width={150}
          ellipsis
          sorter
          filteredValue={getDefaultFilter("inventory_cagtegory", filters)}
          filterDropdown={(fp) => (
            <ColumnMultiSelectFilter
              {...fp}
              options={inventoryCategoryOptions}
              placeholder="Kategorie wählen…"
            />
          )}
        />

        {/* Lieferant */}
        <Table.Column<Row>
          title="Lieferant"
          dataIndex="supplier"
          width={100}
          ellipsis
          sorter={{ multiple: 1 }}
          defaultSortOrder={getDefaultSortOrder("supplier", sorters)}
          filteredValue={getDefaultFilter("supplier", filters)}
          filterDropdown={(fp) => (
            <ColumnMultiSelectFilter
              {...fp}
              options={supplierOptions}
              placeholder="Lieferant wählen…"
            />
          )}
        />

        {/* On-Demand (als Tags) */}
        <Table.Column<Row>
          title="On-Demand"
          dataIndex="on_demand"
          width={180}
          sorter
          filteredValue={getDefaultFilter("on_demand", filters)}
          filterDropdown={(fp) => (
            <ColumnMultiSelectFilter
              {...fp}
              options={onDemandOptions}
              placeholder="True/False wählen…"
            />
          )}
          render={(v: Row["on_demand"]) => renderOnDemandTag(v)}
        />

        <Table.Column<Row> title="Freier Lagerbestand" dataIndex="stock_free" width={140} sorter={{ multiple: 1 }} />
        <Table.Column<Row> title="Reservierter Bestand" dataIndex="stock_reserved_direct" width={140} sorter={{ multiple: 1 }} />
        <Table.Column<Row> title="Reserviert in Stücklisten" dataIndex="stock_reserved_bom" width={140} sorter={{ multiple: 1 }} />
        <Table.Column<Row> title="Nicht verfügbar" dataIndex="stock_unavailable" width={140} sorter={{ multiple: 1 }} />
        <Table.Column<Row> title="Physischer Bestand" dataIndex="stock_physical" width={140} sorter={{ multiple: 1 }} />
        <Table.Column<Row> title="Nachbestellter Bestand" dataIndex="stock_on_order" width={140} sorter={{ multiple: 1 }} />

        <Table.Column<Row>
          title="Verbrauch"
          dataIndex="consumption_3m_rolling"
        />

        <Table.Column<Row> title="aktualisiert am" dataIndex="updated_at" width={150} hidden />
      </Table>
    </List>
  );
}
