"use client";

import { ThemedLayoutV2, ThemedSiderV2 } from "@refinedev/antd";
import { Authenticated } from "@refinedev/core";
import { Layout, Card, Col, Row, Statistic, Typography, Skeleton, Alert, Space, Tooltip } from "antd";
import Link from "next/link";
import {
  ArrowUpOutlined,
  CalendarOutlined,
  TruckOutlined,
  ShoppingCartOutlined,
  EuroCircleOutlined,
} from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { RefineKbar } from "@refinedev/kbar";

// ---------- Types für die API-Antwort ----------
type MetricsResponse = {
  period: {
    from: string;
    to: string;
    today: string;
    dayOfMonth: number;
    daysInMonth: number;
  };
  kpis: {
    auftragsbestand: number;
    auftragseingangBestellungenMTD: number; // Bestellungen (ConfirmedAt im Monat)
    angeboteMTD: number;                    // Angebote (CreatedAt im Monat)
    umsatzMTD: number;                      // Versendet im Monat
    erhalteneAnzahlungen: number;               // Zahlungen auf unversendete Aufträge
    offeneAngebote: number;                 // Aktueller Bestand an Angeboten (State 14)
    forecast: {
      auftragseingangBestellungen: number;
      angebote: number;
      umsatz: number;
    };
  };
  meta: { source: string; notes: string };
};

// Format EUR ohne Nachkommastellen
const currency = (v: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v || 0);

// Simple CustomTitle component definition
const CustomTitle = ({ collapsed }: { collapsed: boolean }) => (
  <Link href="/">
    <span>
      {collapsed ? (
        <img src="/LL_500x500.png" alt="L&L" width="60px" />
      ) : (
        <img src="/L&L_Logo_1200_x_200.jpg" alt="Land & Liebe" width="160px" />
      )}
    </span>
  </Link>
);

// ---------- Dashboard Inhalt ----------
function Dashboard() {
  const { data, isLoading, isError, error } = useQuery<MetricsResponse>({
    queryKey: ["billbee-metrics-monthly"],
    queryFn: async () => {
      const res = await fetch("/api/billbee/metrics/monthly", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // optional: 5 Min „frisch“
  });

  return (
    <div style={{ padding: 24 }}>
      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Übersicht – Aktueller Monat
        </Typography.Title>

        {isLoading && (
          <Row gutter={[16, 16]}>
            {Array.from({ length: 6 }).map((_, i) => ( // 6 Karten inkl. offene Angebote
              <Col key={i} xs={24} md={12} lg={8}>
                <Card>
                  <Skeleton active paragraph={false} />
                </Card>
              </Col>
            ))}
          </Row>
        )}

        {isError && (
          <Alert
            type="error"
            message="Fehler beim Laden der Kennzahlen"
            description={(error as any)?.message ?? "Unbekannter Fehler"}
            showIcon
          />
        )}

        {data && (
          <>
            <Row gutter={[16, 16]}>
              {/* Offene Angebote (aktuell) */}
              <Col xs={24} md={12} lg={8}>
                <Card>
                  <Statistic
                    title="Offene Angebote (aktuell)"
                    value={currency(data.kpis.offeneAngebote)}
                    prefix={<CalendarOutlined />}
                  />
                </Card>
              </Col>              
              {/* Auftragsbestand */}
              <Col xs={24} md={12} lg={8}>
                <Card>
                  <Statistic
                    title="Auftragsbestand (unversendet)"
                    value={currency(data.kpis.auftragsbestand)}
                    prefix={<ShoppingCartOutlined />}
                  />
                </Card>
              </Col>
              
              {/* Anzahlungen (offen) */}
              <Col xs={24} md={12} lg={8}>
                <Card>
                  <Statistic
                    title="Anzahlungen (offen, unversendete Aufträge)"
                    value={currency(data.kpis.erhalteneAnzahlungen)}
                    prefix={<EuroCircleOutlined />}
                  />
                </Card>
              </Col>

              {/* Angebote (MTD) */}
              <Col xs={24} md={12} lg={8}>
                <Card>
                  <Statistic
                    title="Geschriebene Angebote ohne Bestätigung (MTD)"
                    value={currency(data.kpis.angeboteMTD)}
                    prefix={<CalendarOutlined />}
                  />
                  <div style={{ marginTop: 8, opacity: 0.8 }}>
                    <Tooltip title="Hochrechnung = MTD * (Tage im Monat / aktueller Tag)">
                      <Space>
                        <ArrowUpOutlined />
                        <Typography.Text>
                          Hochrechnung: <b>{currency(data.kpis.forecast.angebote)}</b>
                        </Typography.Text>
                      </Space>
                    </Tooltip>
                  </div>
                </Card>
              </Col>

              {/* Auftragseingang (Bestellungen, MTD) */}
              <Col xs={24} md={12} lg={8}>
                <Card>
                  <Statistic
                    title="Auftragseingang (MTD, Bestellungen)"
                    value={currency(data.kpis.auftragseingangBestellungenMTD)}
                    prefix={<CalendarOutlined />}
                  />
                  <div style={{ marginTop: 8, opacity: 0.8 }}>
                    <Tooltip title="Hochrechnung = MTD * (Tage im Monat / aktueller Tag)">
                      <Space>
                        <ArrowUpOutlined />
                        <Typography.Text>
                          Hochrechnung: <b>{currency(data.kpis.forecast.auftragseingangBestellungen)}</b>
                        </Typography.Text>
                      </Space>
                    </Tooltip>
                  </div>
                </Card>
              </Col>

              

              {/* Umsatz (MTD) */}
              <Col xs={24} md={12} lg={8}>
                <Card>
                  <Statistic
                    title="Umsatz (MTD, versendet)"
                    value={currency(data.kpis.umsatzMTD)}
                    prefix={<TruckOutlined />}
                  />
                  <div style={{ marginTop: 8, opacity: 0.8 }}>
                    <Tooltip title="Hochrechnung = MTD * (Tage im Monat / aktueller Tag)">
                      <Space>
                        <ArrowUpOutlined />
                        <Typography.Text>
                          Hochrechnung: <b>{currency(data.kpis.forecast.umsatz)}</b>
                        </Typography.Text>
                      </Space>
                    </Tooltip>
                  </div>
                </Card>
              </Col>

              

              

              {/* Zeitraum/Meta */}
              <Col xs={24} md={12} lg={8}>
                <Card>
                  <Space direction="vertical" size={4}>
                    <Typography.Text type="secondary">Zeitraum</Typography.Text>
                    <Typography.Text>
                      {new Date(data.period.from).toLocaleDateString("de-DE")} –{" "}
                      {new Date(data.period.to).toLocaleDateString("de-DE")}
                    </Typography.Text>
                    <Typography.Text type="secondary">
                      Tag {data.period.dayOfMonth} von {data.period.daysInMonth}
                    </Typography.Text>
                    <Typography.Text type="secondary">Quelle: {data.meta.source}</Typography.Text>
                  </Space>
                </Card>
              </Col>
            </Row>

            {/* KBar ins Content einbetten */}
            <RefineKbar />
          </>
        )}
      </Space>
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
            render={({ items, logout }) => (
              <>
                {items}
                {logout}
              </>
            )}
          />
        )}
        Footer={() => (
          <Layout.Footer
            style={{
              textAlign: "center",
              color: "#fff",
              backgroundColor: "#5B6773",
            }}
          >
            Ich muss Christin erst um Erlaubnis fragen, ob ich hier etwas einfügen darf.
          </Layout.Footer>
        )}
      >
        <Dashboard />
      </ThemedLayoutV2>
    </Authenticated>
  );
}
