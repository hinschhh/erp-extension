"use client";

import { Table, Tooltip, Typography } from "antd";
import { useTable } from "@refinedev/antd";

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
  stock_on_order: number | string; // Platzhalter 0 aus View
  updated_at: string;
};

export default function BestellvorschlaegePage() {
  const { tableProps } = useTable<Row>({
    resource: "rpt_products_inventory_purchasing",
    pagination: { pageSize: 50 },
    syncWithLocation: true,
    meta: { select: "*" },
  });

  return (
    <>
      <Typography.Title level={3}>Bestellvorschläge</Typography.Title>

      <Table<Row> rowKey="billbee_product_id" {...tableProps}>
        <Table.Column<Row> title="SKU" dataIndex="sku" />
        <Table.Column<Row> title="Inventur-Kategorie" dataIndex="inventory_category" />
        <Table.Column<Row> title="Lieferant" dataIndex="supplier" />
        <Table.Column<Row> title="Freier Lagerbestand" dataIndex="stock_free" />
        <Table.Column<Row> title="Reservierter Bestand" dataIndex="stock_reserved_direct" />
        <Table.Column<Row> title="Reserviert in Stücklisten" dataIndex="stock_reserved_bom" />
        <Table.Column<Row> title="Nicht verfügbar" dataIndex="stock_unavailable" />
        <Table.Column<Row> title="Physischer Bestand" dataIndex="stock_physical" />
        <Table.Column<Row> title="Nachbestellter Bestand" dataIndex="stock_on_order"/>
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
    </>
  );
}
