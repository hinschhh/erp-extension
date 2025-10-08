"use client";

import React, { useMemo } from "react";
import {
  Form,
  Input,
  Table,
  Button,
  Tooltip,
  Typography,
  Space,
  Select,
} from "antd";
import {
  List,
  useTable,
  getDefaultFilter,
  getDefaultSortOrder,
  useSelect,
} from "@refinedev/antd";
import type { HttpError, CrudFilters } from "@refinedev/core";
import type { FilterDropdownProps as AntdFilterDropdownProps, FilterConfirmProps } from "antd/es/table/interface";

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
type Option = { label: string; value: string };

/* Dedupe & Null/Leer filtern */
const dedupeOptions = (opts: Option[] = []): Option[] => {
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
  const { tableProps, sorters, filters, searchFormProps } = useTable<Row, HttpError, Search>({
    resource: "rpt_products_inventory_purchasing",
    meta: { select: "*" },
    sorters: { initial: [{ field: "sku", order: "asc" }], mode: "server" },
    filters: { initial: [], mode: "server" },
    pagination: { pageSize: 100 },
    syncWithLocation: true,
    onSearch: (values) => {
      const crud: CrudFilters = [];
      if (values.q?.trim()) {
        crud.push({
          operator: "or",
          value: [
            { field: "sku", operator: "contains", value: values.q.trim() },
            { field: "supplier", operator: "contains", value: values.q.trim() },
          ],
        });
      }
      return crud;
    },
  });

  /* ---------- useSelect: Optionen pro Spalte ---------- */
  const { selectProps: skuSelectProps } = useSelect({
    resource: "rpt_products_inventory_purchasing",
    optionLabel: "sku",
    optionValue: "sku",
    pagination: { pageSize: 1000 },
    sorters: [{ field: "sku", order: "asc" }],
    filters: [{ field: "sku", operator: "ne", value: null }],
    meta: { select: "sku" },
  });
  const skuOptions = useMemo(
    () => dedupeOptions(((skuSelectProps.options as Option[]) ?? [])),
    [skuSelectProps.options],
  );

  const { selectProps: invCatSelectProps } = useSelect({
    resource: "rpt_products_inventory_purchasing",
    optionLabel: "inventory_category",
    optionValue: "inventory_category",
    pagination: { pageSize: 1000 },
    sorters: [{ field: "inventory_category", order: "asc" }],
    filters: [{ field: "inventory_category", operator: "ne", value: null }],
    meta: { select: "inventory_category" },
  });
  const inventoryCategoryOptions = useMemo(
    () => dedupeOptions(((invCatSelectProps.options as Option[]) ?? [])),
    [invCatSelectProps.options],
  );

  const { selectProps: supplierSelectProps } = useSelect({
    resource: "rpt_products_inventory_purchasing",
    optionLabel: "supplier",
    optionValue: "supplier",
    pagination: { pageSize: 1000 },
    sorters: [{ field: "supplier", order: "asc" }],
    filters: [{ field: "supplier", operator: "ne", value: null }],
    meta: { select: "supplier" },
  });
  const supplierOptions = useMemo(
    () => dedupeOptions(((supplierSelectProps.options as Option[]) ?? [])),
    [supplierSelectProps.options],
  );

  const submit = () => searchFormProps.form?.submit();
  const resetAndSubmit = () => {
    searchFormProps.form?.resetFields();
    Promise.resolve().then(() => searchFormProps.form?.submit());
  };

  /* ---- Hilfs-Renderer für AntD-custom filterDropdown (keine doppelten Buttons) ---- */
  const renderMultiSelectDropdown =
  (options: Option[]) =>
  (fp: AntdFilterDropdownProps) => {
    const handleApply = () =>
      fp.confirm({ closeDropdown: true } as FilterConfirmProps);

    const handleReset = () => {
      fp.clearFilters?.();
      fp.confirm({ closeDropdown: true } as FilterConfirmProps);
    };

    return (
      <div style={{ padding: 8, width: 300 }}>
        <Select
          mode="multiple"
          allowClear
          showSearch
          placeholder="Werte wählen…"
          options={options}
          value={fp.selectedKeys as string[]}
          onChange={(vals) => fp.setSelectedKeys(vals as React.Key[])}
          /* Enter = sofort anwenden */
          onInputKeyDown={(e) => {
            if (e.key === "Enter") handleApply();
          }}
          /* Clear = sofort anwenden */
          onClear={handleReset}
          style={{ width: "100%" }}
          optionFilterProp="label"
          maxTagCount="responsive"
        />
        <Space style={{ marginTop: 8 }}>
          <Button type="primary" onClick={handleApply}>
            Filtern
          </Button>
          <Button onClick={handleReset}>
            Zurücksetzen
          </Button>
        </Space>
      </div>
    );
  };

  return (
    <>
      <List
        title="Bestellvorschläge">
        {/* Top-Suchleiste (OR auf sku/supplier) */}
        {/*<Form {...searchFormProps} layout="inline" style={{ marginBottom: 16 }}>
          <Form.Item name="q" label="Suche">
            <Input placeholder="SKU oder Lieferant…" allowClear onPressEnter={submit} />
          </Form.Item>
          <Space>
            <Button onClick={submit} type="primary">Suchen</Button>
            <Button onClick={resetAndSubmit}>Zurücksetzen</Button>
          </Space>
        </Form>*/}

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
          scroll={{ x: true }}
        >
          {/* SKU – Mehrfachfilter (IN) via AntD custom filterDropdown */}
          <Table.Column<Row>
            title="SKU"
            dataIndex="sku"
            sorter
            defaultSortOrder={getDefaultSortOrder("sku", sorters)}
            filteredValue={getDefaultFilter("sku", filters)}
            filterDropdown={renderMultiSelectDropdown(skuOptions)}
            render={(v) => <Typography.Text code>{v ?? "—"}</Typography.Text>}
          />

          {/* Inventur-Kategorie – Mehrfachfilter (IN) */}
          <Table.Column<Row>
            title="Inventur-Kategorie"
            dataIndex="inventory_category"
            sorter
            filteredValue={getDefaultFilter("inventory_category", filters)}
            filterDropdown={renderMultiSelectDropdown(inventoryCategoryOptions)}
          />

          {/* Lieferant – Mehrfachfilter (IN) */}
          <Table.Column<Row>
            title="Lieferant"
            dataIndex="supplier"
            sorter={{ multiple: 1 }}
            defaultSortOrder={getDefaultSortOrder("supplier", sorters)}
            filteredValue={getDefaultFilter("supplier", filters)}
            filterDropdown={renderMultiSelectDropdown(supplierOptions)}
          />

          <Table.Column<Row> title="Freier Lagerbestand" dataIndex="stock_free" />
          <Table.Column<Row> title="Reservierter Bestand" dataIndex="stock_reserved_direct" />
          <Table.Column<Row> title="Reserviert in Stücklisten" dataIndex="stock_reserved_bom" />
          <Table.Column<Row> title="Nicht verfügbar" dataIndex="stock_unavailable" />
          <Table.Column<Row> title="Physischer Bestand" dataIndex="stock_physical" />
          <Table.Column<Row> title="Nachbestellter Bestand" dataIndex="stock_on_order" />

          <Table.Column<Row>
            title="Verbrauch"
            key="consumption_3m"
            render={() => (
              <Tooltip title="Rollierende 3-Monatssumme">
                <span>—</span>
              </Tooltip>
            )}
          />

          <Table.Column<Row> title="aktualisiert am" dataIndex="updated_at" />
        </Table>
      </List>
    </>
  );
}
