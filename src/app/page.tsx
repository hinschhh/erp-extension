"use client";

import { ThemedLayoutV2, ThemedSiderV2 } from "@refinedev/antd";
import { Authenticated } from "@refinedev/core";
import {
  Layout,
  Card,
  Col,
  Row,
  Statistic,
  Typography,
  Skeleton,
  Alert,
  Space,
  Tooltip,
  Button,
  Modal,
  Table,
  Tag,
  Divider,
  theme,
} from "antd";
import Link from "next/link";
import {
  ArrowUpOutlined,
  CalendarOutlined,
  TruckOutlined,
  ShoppingCartOutlined,
  EuroCircleOutlined,
  ExclamationCircleOutlined,
  FileSearchOutlined,
} from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { RefineKbar } from "@refinedev/kbar";
import React, { useMemo, useState } from "react";

/** ----------- Layout/Styling tokens ----------- */
const GRID_GUTTER: [number, number] = [24, 24];
const CARD_MIN_HEIGHT = 180;

/** ----------- Skeletons ----------- */
function KpiCardSkeleton() {
  const { token } = theme.useToken();
  return (
    <Card
      style={{
        height: "100%",
        width: "100%",
        borderRadius: 16,
        boxShadow: "0 4px 18px rgba(0,0,0,0.06)",
      }}
      bodyStyle={{
        minHeight: CARD_MIN_HEIGHT,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: 16,
      }}
    >
      {/* Titelzeile */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: token.colorFillTertiary,
            }}
          />
          <Skeleton.Input active size="small" style={{ width: 160 }} />
        </div>
        <Skeleton.Button active size="small" shape="round" style={{ width: 48 }} />
      </div>

      {/* Wert */}
      <div style={{ marginTop: 6 }}>
        <Skeleton.Input active size="large" style={{ width: 140, height: 34 }} />
      </div>

      {/* Sublines */}
      <div style={{ marginTop: 2 }}>
        <Space size="small" wrap>
          <Space>
            <Skeleton.Input active size="small" style={{ width: 160 }} />
            <Skeleton.Input active size="small" style={{ width: 90 }} />
          </Space>
          <Divider type="vertical" />
          <Space>
            <Skeleton.Input active size="small" style={{ width: 160 }} />
            <Skeleton.Input active size="small" style={{ width: 90 }} />
          </Space>
        </Space>
      </div>

      {/* Footer-Pill */}
      <div style={{ marginTop: "auto", display: "flex", justifyContent: "flex-end" }}>
        <Skeleton.Button active size="small" shape="round" style={{ width: 120 }} />
      </div>
    </Card>
  );
}

function PaymentsStatusCardSkeleton() {
  return (
    <Card
      style={{ height: "100%", borderRadius: 16, boxShadow: "0 4px 18px rgba(0,0,0,0.06)" }}
      bodyStyle={{ minHeight: CARD_MIN_HEIGHT, display: "flex", flexDirection: "column", gap: 10, padding: 16 }}
      title={
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "#f2f4f7" }} />
          <Skeleton.Input active size="small" style={{ width: 220 }} />
        </div>
      }
      extra={
        <Space>
          <Skeleton.Button active />
          <Skeleton.Button active />
        </Space>
      }
    >
      <Row gutter={[16, 12]}>
        {[1, 2, 3].map((i) => (
          <Col xs={24} md={8} key={i}>
            <Skeleton.Input active size="small" style={{ width: 120 }} />
            <div style={{ marginTop: 8 }}>
              <Skeleton.Input active size="large" style={{ width: 140, height: 34 }} />
            </div>
            <div style={{ marginTop: 8 }}>
              <Skeleton.Input active size="small" style={{ width: 180 }} />
            </div>
            <div style={{ marginTop: 6 }}>
              <Skeleton.Input active size="small" style={{ width: 160 }} />
            </div>
          </Col>
        ))}
      </Row>
    </Card>
  );
}


/** KPI Card – vereinheitlicht Optik & Höhe */
function KpiCard({
  title,
  count,
  icon,
  value,
  sublines,
  footPill,
}: {
  title: string;
  count?: number | string;
  icon?: React.ReactNode;
  value: React.ReactNode;
  sublines?: React.ReactNode;
  footPill?: React.ReactNode;
}) {
  const { token } = theme.useToken();
  return (
    <Card
      style={{
        height: "100%",
        width: "100%",
        borderRadius: 16,
        boxShadow: "0 4px 18px rgba(0,0,0,0.06)",
      }}
      bodyStyle={{
        minHeight: CARD_MIN_HEIGHT,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: 16,
      }}
    >
      {/* Titelzeile */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: token.colorFillTertiary,
              display: "grid",
              placeItems: "center",
            }}
          >
            {icon}
          </div>
          <Typography.Text type="secondary" style={{ fontWeight: 500 }}>
            {title}
          </Typography.Text>
        </div>
        {typeof count !== "undefined" && (
          <Tag style={{ borderRadius: 999, paddingInline: 10, height: 24, display: "grid", placeItems: "center" }}>
            {count}
          </Tag>
        )}
      </div>

      {/* Wert */}
      <div>
        <Typography.Title level={3} style={{ margin: 0, fontWeight: 700 }}>
          {value}
        </Typography.Title>
      </div>

      {/* Sublines */}
      {sublines && <div style={{ marginTop: 2 }}>{sublines}</div>}

      {/* Footer-Pill (Forecast etc.) */}
      {footPill && (
        <div style={{ marginTop: "auto", display: "flex", justifyContent: "flex-end" }}>
          <Tag
            icon={<ArrowUpOutlined />}
            style={{
              borderRadius: 999,
              borderColor: token.colorBorderSecondary,
            }}
          >
            {footPill}
          </Tag>
        </div>
      )}
    </Card>
  );
}

/** ---- Types ---- */
type OrderLight = { id: string; number?: string; shippedAt?: string | null; open: number; customer: string };
type UnshippedRow = { id: string; orderNumber?: string; createdAt?: string | null; customer: string; gross: number; paid: number; open: number };

type MetricsResponse = {
  period: { from: string; to: string; today: string; dayOfMonth: number; daysInMonth: number };
  kpis: {
    auftragseingangMTD: { total: number; standard: number; sb: number; count: { total: number; standard: number; sb: number } };
    angeboteMTD: { total: number; standard: number; sb: number; count: { total: number; standard: number; sb: number } };
    umsatzMTD: { total: number; standard: number; sb: number; count: { total: number; standard: number; sb: number } };
    zahlungseingangMTD: number;
    zahlungseingangMTDCount: number;

    offeneAngebote: number;
    offeneAngeboteCount: number;

    auftragsbestand: { total: number; standard: number; sb: number; count: { total: number; standard: number; sb: number } };
    erhalteneAnzahlungen: { total: number; standard: number; sb: number; count: { total: number; standard: number; sb: number } };

    opos: { totalOpen: number; count: number; orders: OrderLight[] };

    unshippedPaymentStatus: {
      unpaid: { count: number; sum: number; orders: UnshippedRow[] };
      partial: { count: number; sum: number; orders: UnshippedRow[]; depositSum: number; depositAvgRatio: number };
      full: { count: number; sum: number };
    };
    forecast: {
      auftragseingang: { total: number; standard: number; sb: number };
      angebote: { total: number; standard: number; sb: number };
      umsatz: { total: number; standard: number; sb: number };
    };
  };
  meta: { source: string; notes: string };
};

/** ---- Formatierer ---- */
const currency = (v: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v || 0);
const percent = (v: number) => new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 0 }).format(v || 0);

const CustomTitle = ({ collapsed }: { collapsed: boolean }) => (
  <Link href="/">
    <span>{collapsed ? <img src="/LL_500x500.png" alt="L&L" width="60px" /> : <img src="/L&L_Logo_1200_x_200.jpg" alt="Land & Liebe" width="160px" />}</span>
  </Link>
);

function Dashboard() {
  const { data, isLoading, isError, error } = useQuery<MetricsResponse>({
    queryKey: ["billbee-metrics-monthly-polished"],
    queryFn: async () => {
      const res = await fetch("/api/billbee/metrics/monthly", { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  // Modals
  const [modalOposOpen, setModalOposOpen] = useState(false);
  const [modalUnpaidOpen, setModalUnpaidOpen] = useState(false);
  const [modalPartialOpen, setModalPartialOpen] = useState(false);

  const ups = data?.kpis.unshippedPaymentStatus;
  const unpaidOrders = ups?.unpaid.orders ?? [];
  const partialOrders = ups?.partial.orders ?? [];
  const oposOrders = data?.kpis.opos.orders ?? [];

  // Tabellen-Spalten
  const columnsOpos = [
    { title: "Bestellnr.", dataIndex: "number", key: "number", render: (v: string | undefined, row: OrderLight) => <a href={`https://app.billbee.io/Orders/Details/${row.id}`} target="_blank" rel="noreferrer">{v || "—"}</a> },
    { title: "Kunde", dataIndex: "customer", key: "customer" },
    { title: "Versendet am", dataIndex: "shippedAt", key: "shippedAt", render: (v: string | null | undefined) => (v ? new Date(v).toLocaleDateString("de-DE") : "—") },
    { title: "Offen", dataIndex: "open", key: "open", align: "right" as const, render: (v: number) => currency(v || 0) },
  ];
  const columnsUnshipped = [
    { title: "Bestelldatum", dataIndex: "createdAt", key: "createdAt", render: (v: string | null | undefined) => (v ? new Date(v).toLocaleDateString("de-DE") : "—") },
    { title: "Bestellnummer", dataIndex: "orderNumber", key: "orderNumber", render: (v: string | undefined, row: UnshippedRow) => <a href={`https://app.billbee.io/Orders/Details/${row.id}`} target="_blank" rel="noreferrer">{v || "—"}</a> },
    { title: "Kunde", dataIndex: "customer", key: "customer" },
    { title: "Betrag", dataIndex: "gross", key: "gross", align: "right" as const, render: (v: number) => currency(v) },
    { title: "Bezahlt", dataIndex: "paid", key: "paid", align: "right" as const, render: (v: number) => currency(v) },
    { title: "Offen", dataIndex: "open", key: "open", align: "right" as const, render: (v: number) => currency(v) },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Space direction="vertical" size="small" style={{ width: "100%" }}>
        <Typography.Title level={3} style={{ margin: 0 }}>Übersicht – Aktueller Monat</Typography.Title>
        {data && (
          <Typography.Paragraph type="secondary" style={{ marginTop: 0, marginBottom: 16 }}>
            Zeitraum: {new Date(data.period.from).toLocaleDateString("de-DE")} – {new Date(data.period.to).toLocaleDateString("de-DE")}
            {" "}• Tag {data.period.dayOfMonth} von {data.period.daysInMonth} • Quelle: {data.meta.source}
          </Typography.Paragraph>
        )}
      </Space>

{isLoading && (
  <>
    {/* Header/Periode Skeleton */}
    <Space direction="vertical" size="small" style={{ width: "100%" }}>
      <Skeleton.Input active size="large" style={{ width: 320, height: 28 }} />
      <Skeleton.Input active size="small" style={{ width: 520 }} />
    </Space>

    {/* 1) MTD – 3 Karten */}
    <Row gutter={GRID_GUTTER} align="stretch" style={{ marginTop: 12, marginBottom: 12 }}>
      <Col xs={24} md={12} lg={8} style={{ display: "flex" }}>
        <KpiCardSkeleton />
      </Col>
      <Col xs={24} md={12} lg={8} style={{ display: "flex" }}>
        <KpiCardSkeleton />
      </Col>
      <Col xs={24} md={12} lg={8} style={{ display: "flex" }}>
        <KpiCardSkeleton />
      </Col>
    </Row>

    {/* 2) Bestände – 3 Karten */}
    <Row gutter={GRID_GUTTER} align="stretch" style={{ marginTop: 12, marginBottom: 12 }}>
      <Col xs={24} md={12} lg={8} style={{ display: "flex" }}>
        <KpiCardSkeleton />
      </Col>
      <Col xs={24} md={12} lg={8} style={{ display: "flex" }}>
        <KpiCardSkeleton />
      </Col>
      <Col xs={24} md={12} lg={8} style={{ display: "flex" }}>
        <KpiCardSkeleton />
      </Col>
    </Row>

    {/* 3) Zahlungsaufteilung – breite Karte + 1 KPI */}
    <Row gutter={GRID_GUTTER} align="stretch" style={{ marginTop: 12, marginBottom: 12 }}>
      <Col xs={24} md={24} lg={16} style={{ display: "flex" }}>
        <PaymentsStatusCardSkeleton />
      </Col>
      <Col xs={24} md={12} lg={8} style={{ display: "flex" }}>
        <KpiCardSkeleton />
      </Col>
    </Row>
  </>
)}


      {isError && (
        <Alert type="error" message="Fehler beim Laden der Kennzahlen" description={(error as any)?.message ?? "Unbekannter Fehler"} showIcon />
      )}

      {data && (
        <>
          {/* 1) MTD */}
          <Row gutter={GRID_GUTTER} align="stretch" style={{marginTop:"12px", marginBottom:"12px"}}>
            <Col xs={24} md={12} lg={8 } style={{ display: "flex", justifyContent: "space-between"}}>
              <KpiCard
                title="Geschriebene Angebote MTD (Total)"
                count={data.kpis.angeboteMTD.count.total}
                icon={<CalendarOutlined />}
                value={currency(data.kpis.angeboteMTD.total)}
                sublines={
                  <Space size="small" wrap>
                    <Space>
                      <Typography.Text type="secondary">Standard ({data.kpis.angeboteMTD.count.standard}): </Typography.Text>
                      <Typography.Text strong>{currency(data.kpis.angeboteMTD.standard)}</Typography.Text>
                      <Divider type="vertical" />
                    </Space>
                    <Space>
                      <Typography.Text type="secondary">SB ({data.kpis.angeboteMTD.count.sb}): </Typography.Text>
                      <Typography.Text strong>{currency(data.kpis.angeboteMTD.sb)}</Typography.Text>
                    </Space>
                  </Space>
                }
                footPill={<span>Forecast: <b>{currency(data.kpis.forecast.angebote.total)}</b></span>}
              />
            </Col>

            <Col xs={24} md={12} lg={8} style={{ display: "flex" }}>
              <KpiCard
                title="Auftragseingang MTD (Total)"
                count={data.kpis.auftragseingangMTD.count.total}
                icon={<CalendarOutlined />}
                value={currency(data.kpis.auftragseingangMTD.total)}
                sublines={
                  <Space size="small" wrap>
                    <Space>
                    <Typography.Text type="secondary">Standard ({data.kpis.auftragseingangMTD.count.standard}): </Typography.Text>
                    <Typography.Text strong>{currency(data.kpis.auftragseingangMTD.standard)}</Typography.Text>
                    <Divider type="vertical" />
                    </Space>
                    <Space>
                    <Typography.Text type="secondary">SB ({data.kpis.auftragseingangMTD.count.sb}): </Typography.Text>
                    <Typography.Text strong>{currency(data.kpis.auftragseingangMTD.sb)}</Typography.Text>
                    </Space>
                  </Space>
                }
                footPill={<span>Forecast: <b>{currency(data.kpis.forecast.auftragseingang.total)}</b></span>}
              />
            </Col>

            <Col xs={24} md={12} lg={8} style={{ display: "flex" }}>
              <KpiCard
                title="Umsatz MTD (versendet)"
                count={data.kpis.umsatzMTD.count.total}
                icon={<TruckOutlined />}
                value={currency(data.kpis.umsatzMTD.total)}
                sublines={
                  <Space size="small" wrap>
                    <Space>
                      <Typography.Text type="secondary">Standard ({data.kpis.umsatzMTD.count.standard}): </Typography.Text>
                      <Typography.Text strong>{currency(data.kpis.umsatzMTD.standard)}</Typography.Text>
                      <Divider type="vertical" />
                      </Space>
                    <Space>
                      <Typography.Text type="secondary">SB ({data.kpis.umsatzMTD.count.sb}): </Typography.Text>
                      <Typography.Text strong>{currency(data.kpis.umsatzMTD.sb)}</Typography.Text>
                    </Space>
                  </Space>
                }
                footPill={<span>Forecast: <b>{currency(data.kpis.forecast.umsatz.total)}</b></span>}
              />
            </Col>
          </Row>

          {/* 2) Bestände */}
          <Row gutter={GRID_GUTTER} align="stretch" style={{marginTop:"12px", marginBottom:"12px"}}>
            <Col xs={24} md={12} lg={8} style={{ display: "flex" }}>
              <KpiCard
                title="Offene Angebote (aktuell)"
                count={data.kpis.offeneAngeboteCount}
                icon={<CalendarOutlined />}
                value={currency(data.kpis.offeneAngebote)}
              />
            </Col>

            <Col xs={24} md={12} lg={8} style={{ display: "flex" }}>
              <KpiCard
                title="Auftragsbestand (unversendet, Total)"
                count={data.kpis.auftragsbestand.count.total}
                icon={<ShoppingCartOutlined />}
                value={currency(data.kpis.auftragsbestand.total)}
                sublines={
                  <Space size="small" wrap>
                    <Space>
                      <Typography.Text type="secondary">Standard ({data.kpis.auftragsbestand.count.standard}): </Typography.Text>
                      <Typography.Text strong>{currency(data.kpis.auftragsbestand.standard)}</Typography.Text>
                      <Divider type="vertical" />
                    </Space>
                    <Space>
                      <Typography.Text type="secondary">SB ({data.kpis.auftragsbestand.count.sb}): </Typography.Text>
                      <Typography.Text strong>{currency(data.kpis.auftragsbestand.sb)}</Typography.Text>
                    </Space>
                  </Space>
                }
              />
            </Col>

            <Col xs={24} md={12} lg={8} style={{ display: "flex" }}>
              <KpiCard
                title="Erhaltene Anzahlungen (unversendet)"
                count={data.kpis.erhalteneAnzahlungen.count.total}
                icon={<EuroCircleOutlined />}
                value={currency(data.kpis.erhalteneAnzahlungen.total)}
                sublines={
                  <Space size="small" wrap>
                    <Space>
                    <Typography.Text type="secondary">Standard ({data.kpis.erhalteneAnzahlungen.count.standard}): </Typography.Text>
                    <Typography.Text strong>{currency(data.kpis.erhalteneAnzahlungen.standard)}</Typography.Text>
                    <Divider type="vertical" />
                    </Space>
                    <Space>
                      <Typography.Text type="secondary">SB ({data.kpis.erhalteneAnzahlungen.count.sb}): </Typography.Text>
                      <Typography.Text strong>{currency(data.kpis.erhalteneAnzahlungen.sb)}</Typography.Text>
                    </Space>
                  </Space>
                }
              />
            </Col>
          </Row>

          {/* 3) Zahlungsaufteilung */}
          <Row gutter={GRID_GUTTER} align="stretch" style={{marginTop:"12px", marginBottom:"12px"}}>
            <Col xs={24} md={24} lg={16} style={{ display: "flex" }}>
              <Card
                style={{ height: "100%", borderRadius: 16, boxShadow: "0 4px 18px rgba(0,0,0,0.06)" }}
                bodyStyle={{ minHeight: CARD_MIN_HEIGHT, display: "flex", flexDirection: "column", gap: 10, padding: 16 }}
                title={
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: "#f2f4f7", display: "grid", placeItems: "center" }}>
                      <EuroCircleOutlined />
                    </div>
                    <span>Unversendet nach Bezahlstatus</span>
                  </div>
                }
                extra={
                  <Space>
                    <Button onClick={() => setModalUnpaidOpen(true)} icon={<FileSearchOutlined />}>Unbezahlt (Liste)</Button>
                    <Button type="primary" onClick={() => setModalPartialOpen(true)} icon={<FileSearchOutlined />}>Angezahlt (Liste)</Button>
                  </Space>
                }
              >
                <Row gutter={[16, 12]}>
                  <Col xs={24} md={8}>
                    <Statistic
                      title="Unbezahlt"
                      value={currency(ups?.unpaid.sum || 0)}
                      suffix={<Typography.Text type="secondary"> ({ups?.unpaid.count || 0})</Typography.Text>}
                    />
                  </Col>
                  <Col xs={24} md={8}>
                    <Statistic
                      title="Angezahlt"
                      value={currency(ups?.partial.sum || 0)}
                      suffix={<Typography.Text type="secondary"> ({ups?.partial.count || 0})</Typography.Text>}
                    />
                    <div style={{ marginTop: 6 }}>
                      <Typography.Text type="secondary">Anzahlungen: </Typography.Text>
                      <Typography.Text strong>{currency(ups?.partial.depositSum || 0)}</Typography.Text>
                    </div>
                    <div>
                      <Typography.Text type="secondary">Ø Anzahlungsquote: </Typography.Text>
                      <Typography.Text strong>{percent(ups?.partial.depositAvgRatio || 0)}</Typography.Text>
                    </div>
                  </Col>
                  <Col xs={24} md={8}>
                    <Statistic
                      title="Vollbezahlt"
                      value={currency(ups?.full.sum || 0)}
                      suffix={<Typography.Text type="secondary"> ({ups?.full.count || 0})</Typography.Text>}
                    />
                  </Col>
                </Row>
              </Card>
            </Col>

            <Col xs={24} md={12} lg={8} style={{ display: "flex" }}>
              <KpiCard
                title="OPOS (versendet & nicht voll bezahlt)"
                count={data.kpis.opos.count}
                icon={<ExclamationCircleOutlined />}
                value={currency(data.kpis.opos.totalOpen)}
                sublines={<Typography.Text type="secondary">Details zeigt die betroffenen Aufträge</Typography.Text>}
                footPill={
                  <Button size="small" onClick={() => setModalOposOpen(true)} icon={<FileSearchOutlined />}>
                    Details
                  </Button>
                }
              />
            </Col>
          </Row>

          {/* ---------- MODALS: max 90vw/80vh, Body scrollt ---------- */}
          <Modal
            title="OPOS: Versendet & nicht voll bezahlt"
            open={modalOposOpen}
            onCancel={() => setModalOposOpen(false)}
            footer={null}
            width="90vw"
            styles={{ body: { maxHeight: "80vh", overflow: "auto" } }}
            centered
          >
            <Table rowKey="id" dataSource={oposOrders} columns={columnsOpos} pagination={{ pageSize: 12 }} />
          </Modal>

          <Modal
            title="Unversendet – Unbezahlt (Vorkasse offen)"
            open={modalUnpaidOpen}
            onCancel={() => setModalUnpaidOpen(false)}
            footer={null}
            width="90vw"
            styles={{ body: { maxHeight: "80vh", overflow: "auto" } }}
            centered
          >
            <Table rowKey="id" dataSource={unpaidOrders} columns={columnsUnshipped} pagination={{ pageSize: 100 }} />
          </Modal>

          <Modal
            title="Unversendet – Angezahlt"
            open={modalPartialOpen}
            onCancel={() => setModalPartialOpen(false)}
            footer={null}
            width="90vw"
            styles={{ body: { maxHeight: "80vh", overflow: "auto" } }}
            centered
          >
            <Table rowKey="id" dataSource={partialOrders} columns={columnsUnshipped} pagination={{ pageSize: 100 }} />
          </Modal>

          <RefineKbar />
        </>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Authenticated v3LegacyAuthProviderCompatible={true} key="authenticated">
      <ThemedLayoutV2
        Sider={() => (
          <ThemedSiderV2
            Title={({ collapsed }) => <CustomTitle collapsed={collapsed} />}
            render={({ items, logout }) => (<>{items}{logout}</>)}
          />
        )}
        Footer={() => (
          <Layout.Footer style={{ textAlign: "center", color: "#fff", backgroundColor: "#5B6773" }}>
            Ich muss Christin erst um Erlaubnis fragen, ob ich hier etwas einfügen darf.
          </Layout.Footer>
        )}
      >
        <Dashboard />
      </ThemedLayoutV2>
    </Authenticated>
  );
}
