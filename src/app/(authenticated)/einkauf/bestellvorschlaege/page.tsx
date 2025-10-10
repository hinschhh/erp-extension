"use client";

import React, { useMemo } from "react";
import { Table, Tooltip, Typography } from "antd";
import {
  List,
  useTable,
  getDefaultFilter,
  getDefaultSortOrder,
  useSelect,
} from "@refinedev/antd";
import type { HttpError } from "@refinedev/core";
import { ColumnMultiSelectFilter, type ColumnFilterOption } from "@/components/common/table/ColumnMultiSelectFilter";

/* ---------- Typen ---------- */
type Row = {
  billbee_product_id: number;
  sku: string | null;
  inventory_category: string | null;
  supplier: string | null;
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
    optionLabel: "inventory_category",
    optionValue: "inventory_category",
    pagination: { pageSize: 100 },
    sorters: [{ field: "inventory_category", order: "asc" }],
    filters: [{ field: "inventory_category", operator: "ne", value: null }],
    meta: { select: "inventory_category" },
  });
  const inventoryCategoryOptions = useMemo(
    () => dedupeOptions((invCatSelectProps.options ?? []) as ColumnFilterOption[]),
    [invCatSelectProps.options],
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

  return (
    <List title="Bestellvorschläge" contentProps={{ style: { height: "70vh", display: "flex", flexDirection: "column"} }}>
      <Table
        rowKey="billbee_product_id"
        {...tableProps}
        pagination={{
          ...tableProps.pagination,
          position: ["bottomRight"],
          size: "small",
          showSizeChanger: true,
          pageSizeOptions: [50, 100, 250, 500],
          showTotal: (t) => `${t} Einträge`,
        }}
        tableLayout="fixed"  
        sticky={{}}
        scroll={{
          x: true,
        }}
        style={{
          flex: 1,
          overflow: "auto",
          width: "100%",
        }}
      >
        {/* SKU */}
        <Table.Column<Row>
          title="SKU"
          dataIndex="sku"
          width={50} ellipsis
          sorter
          defaultSortOrder={getDefaultSortOrder("sku", sorters)}
          filteredValue={getDefaultFilter("sku", filters)}
          filterDropdown={(fp) => (
            <ColumnMultiSelectFilter
              {...fp}
              options={skuOptions}
              placeholder="SKU wählen…"
            />
          )}
          render={(v) => <Typography.Text code>{v ?? "—"}</Typography.Text>}
        />

        {/* Inventur-Kategorie */}
        <Table.Column<Row>
          title="Inventur-Kategorie"
          dataIndex="inventory_category"
          width={25} ellipsis
          sorter
          filteredValue={getDefaultFilter("inventory_category", filters)}
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
          width={25} ellipsis
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

        <Table.Column<Row> title="Freier Lagerbestand" dataIndex="stock_free" />
        <Table.Column<Row> title="Reservierter Bestand" dataIndex="stock_reserved_direct" sorter={{ multiple: 1 }} />
        <Table.Column<Row> title="Reserviert in Stücklisten" dataIndex="stock_reserved_bom" sorter={{ multiple: 1 }} />
        <Table.Column<Row> title="Nicht verfügbar" dataIndex="stock_unavailable" sorter={{ multiple: 1 }} />
        <Table.Column<Row> title="Physischer Bestand" dataIndex="stock_physical" sorter={{ multiple: 1 }} />
        <Table.Column<Row> title="Nachbestellter Bestand" dataIndex="stock_on_order" sorter={{ multiple: 1 }} />

        <Table.Column<Row>
          title="Verbrauch"
          key="consumption_3m"
          render={() => (
            <Tooltip title="Rollierende 3-Monatssumme">
              <span>—</span>
            </Tooltip>
          )}
        />

        <Table.Column<Row> title="aktualisiert am" dataIndex="updated_at" width={25} hidden />
      </Table>
    </List>
  );
}
