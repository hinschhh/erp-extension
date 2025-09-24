"use client";

import { Table, Typography, Card, Carousel, Space } from "antd";
import { useTable } from "@refinedev/antd";
import { useList } from "@refinedev/core";

type PurchasingRow = {
  billbee_product_id: number;
  sku: string | null;
  inventory_category: string | null;
  supplier: string | null;
  stock_free: number | string;
  stock_reserved_direct: number | string;
  stock_reserved_bom: number | string;
  stock_unavailable: number | string;
  stock_physical: number | string;
  unit_cost_net: number | string;
  inventory_value: number | string;
  updated_at: string;
};

type GroupRow = {
  inventory_category: string | null;
  total_physical_qty: number | string;
  total_inventory_value: number | string;
};

const currency = (v: number | string | null | undefined) =>
  v != null
    ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(v))
    : "—";

export default function InventurPage() {
  // Haupttabelle aus View ref_products_inventory_purchasing
  const { tableProps } = useTable<PurchasingRow>({
    resource: "rpt_products_inventory_purchasing",
    pagination: { pageSize: 50 },
    syncWithLocation: true,
    meta: { select: "*" },
  });

  // Gruppierte Summen für Karten/Carousel
  const { data: groupedResp, isLoading: groupedLoading } = useList<GroupRow>({
    resource: "rpt_products_inventory_grouped",
    meta: { select: "*" },
    pagination: { mode: "off" },
  });

  const grouped = (groupedResp?.data ?? []).map((r) => ({
    inventory_category: r.inventory_category ?? "Unkategorisiert",
    total_physical_qty: Number(r.total_physical_qty ?? 0),
    total_inventory_value: Number(r.total_inventory_value ?? 0),
  }));

  // Karten absteigend nach Inventarwert
  const sortedByValueDesc = [...grouped].sort(
    (a, b) => b.total_inventory_value - a.total_inventory_value
  );

  // Gesamt-Inventarwert (Frontend-berechnet)
  const totalInventoryValue = sortedByValueDesc.reduce(
    (acc, cur) => acc + (cur.total_inventory_value || 0),
    0
  );

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      {/* Titel + Gesamtwert */}
      <Space align="baseline" wrap>
        <Typography.Title level={3} style={{ marginBottom: 0 }}>
          Inventur
        </Typography.Title>
        <Typography.Text type="secondary" style={{ fontSize: 16 }}>
          Gesamt-Inventarwert:&nbsp;
          <strong>{currency(totalInventoryValue)}</strong>
        </Typography.Text>
      </Space>

      {/* Karten-Karussell je Inventur-Kategorie */}
      {!groupedLoading && sortedByValueDesc.length > 0 ? (
        <Carousel dots draggable initialSlide={-1} slidesToShow={Math.min(4.33, sortedByValueDesc.length)} style={{ maxWidth: "100%" }}>
          {sortedByValueDesc.map((c) => (
            <div key={c.inventory_category}>
              <Card title={c.inventory_category} style={{ width: 300 }} bordered>
                <Space size="small">
                  <div>
                    <div style={{ opacity: 0.7 }}>Inventarwert</div>
                    <Typography.Title level={4} style={{ margin: 0 }}>
                      {currency(c.total_inventory_value)}
                    </Typography.Title>
                  </div>
                  <div>
                    <div style={{ opacity: 0.7 }}>Physischer Bestand</div>
                    <Typography.Title level={4} style={{ margin: 0 }}>
                      {c.total_physical_qty}
                    </Typography.Title>
                  </div>
                </Space>
              </Card>
            </div>
          ))}
        </Carousel>
      ) : null}

      {/* Tabelle */}
      <Table<PurchasingRow> rowKey="billbee_product_id" {...tableProps}>
        <Table.Column<PurchasingRow> title="SKU" dataIndex="sku" />
        <Table.Column<PurchasingRow> title="Inventur-Kategorie" dataIndex="inventory_category" />
        <Table.Column<PurchasingRow> title="Lieferant" dataIndex="supplier" />
        <Table.Column<PurchasingRow> title="Freier Lagerbestand" dataIndex="stock_free" />
        <Table.Column<PurchasingRow> title="Reservierter Bestand" dataIndex="stock_reserved_direct" />
        <Table.Column<PurchasingRow> title="Reserviert in Stücklisten" dataIndex="stock_reserved_bom" />
        <Table.Column<PurchasingRow> title="Nicht verfügbar" dataIndex="stock_unavailable" />
        <Table.Column<PurchasingRow> title="Physischer Bestand" dataIndex="stock_physical" />
        <Table.Column<PurchasingRow>
          title="EK-Preis (netto) inkl. ANK"
          dataIndex="unit_cost_net"
          render={(v) => currency(v)}
        />
        <Table.Column<PurchasingRow>
          title="Inventarwert"
          dataIndex="inventory_value"
          render={(v) => currency(v)}
        />
        <Table.Column<PurchasingRow> title="aktualisiert am" dataIndex="updated_at" />
      </Table>

      <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
        Hinweis: „Verbrauch (3M)“ und „Nachbestellter Bestand“ werden später ergänzt.
      </Typography.Paragraph>
    </Space>
  );
}
