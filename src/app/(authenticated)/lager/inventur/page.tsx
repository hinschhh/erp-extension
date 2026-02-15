"use client";

import { Space, Card, Table, Form, Input, Button, Alert, App as AntdApp, Progress, Collapse, Typography, Statistic, Row, Col } from "antd";
import { List, useTable } from "@refinedev/antd";
import React, { useState, useEffect, useMemo } from "react";

import { Database } from "@/types/supabase";
import { supabaseBrowserClient } from "@/utils/supabase/client";
import { CheckOutlined, EditOutlined, BarChartOutlined } from "@ant-design/icons";

const { Panel } = Collapse;
const { Title, Text } = Typography;

type InventorySession =
  Database["public"]["Tables"]["app_inventory_sessions"]["Row"];

interface SessionWithProgress extends InventorySession {
  countable_products: number;
  counted_products: number;
}

interface ProductWithSnapshot {
  id: number;
  bb_name: string | null;
  bb_sku: string | null;
  inventory_cagtegory: string | null;
  bb_category1: string | null;
  bb_category2: string | null;
  bb_category3: string | null;
  cost_price: number;
  bb_stock_current: number;
  total_value: number;
}

interface CategoryData {
  category: string;
  products: ProductWithSnapshot[];
  totalValue: number;
  totalQuantity: number;
  subcategories: Map<string, ProductWithSnapshot[]>;
}

interface InventoryValueData {
  categories: Map<string, CategoryData>;
  totalInventoryValue: number;
}

export default function InventarPage() {
  const { message } = AntdApp.useApp();
  const [starting, setStarting] = useState(false);
  const [session, setSession] = useState<InventorySession | null>(null);
  const [sessions, setSessions] = useState<InventorySession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [progressData, setProgressData] = useState<Record<number, { countable: number; counted: number }>>({});
  const [inventoryData, setInventoryData] = useState<InventoryValueData | null>(null);
  const [loadingInventoryData, setLoadingInventoryData] = useState(false);

  // Lade Inventarwerte-Daten für aktuelle Bestände
  const { tableProps: productsTableProps } = useTable({
    resource: "app_products",
    filters: {
      permanent: [
        { field: "bb_is_active", operator: "eq", value: true }
      ]
    },
    queryOptions: {
      enabled: false, // Wir triggern das manuell wenn benötigt
    }
  });

  // Lade Sessions
  useEffect(() => {
    const loadSessions = async () => {
      setIsLoading(true);
      const { data, error } = await supabaseBrowserClient
        .from("app_inventory_sessions")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Fehler beim Laden der Sessions:", error);
        message.error("Fehler beim Laden der Inventuren");
      } else {
        setSessions(data || []);
      }
      setIsLoading(false);
    };

    loadSessions();

    // Live-Updates
    const channel = supabaseBrowserClient
      .channel("inventory_sessions_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_inventory_sessions" },
        () => {
          loadSessions();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [message]);

  // Berechne Fortschritt für jede Session
  useEffect(() => {
    if (sessions.length === 0) return;

    const loadProgress = async () => {
      const progressMap: Record<number, { countable: number; counted: number }> = {};
      
      for (const session of sessions) {
        // Zähle relevante Snapshots (Produkte mit Bestand im letzten Jahr oder aktuellem Bestand <> 0)
        const { data: snapshots, error: snapshotError } = await supabaseBrowserClient
          .from("app_inventory_snapshots")
          .select("fk_products, bb_stock_current")
          .eq("session_id", session.id);

        if (snapshotError || !snapshots) {
          console.error("Fehler beim Laden der Snapshots:", snapshotError);
          continue;
        }

        if (snapshots.length === 0) {
          progressMap[session.id] = { countable: 0, counted: 0 };
          continue;
        }

        const productIds = snapshots.map(s => s.fk_products);
        
        // Filtere Produkte: nur die mit Bewegung im letzten Jahr oder aktuellem Bestand
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

        // Prüfe welche Produkte im letzten Jahr in Bestellungen vorkamen
        const { data: normalPositions } = await supabaseBrowserClient
          .from("app_purchase_orders_positions_normal")
          .select("billbee_product_id")
          .in("billbee_product_id", productIds)
          .gte("created_at", oneYearAgo.toISOString());

        const { data: specialPositions } = await supabaseBrowserClient
          .from("app_purchase_orders_positions_special")
          .select("billbee_product_id")
          .in("billbee_product_id", productIds)
          .gte("created_at", oneYearAgo.toISOString());

        const productsWithActivity = new Set([
          ...(normalPositions?.map(p => p.billbee_product_id) || []),
          ...(specialPositions?.map(p => p.billbee_product_id) || [])
        ]);

        // Füge Produkte mit aktuellem Bestand <> 0 hinzu
        snapshots
          .filter(s => s.bb_stock_current !== 0)
          .forEach(s => productsWithActivity.add(s.fk_products));

        const countableProducts = productsWithActivity.size;

        // Zähle gezählte Produkte (nur die relevanten)
        const { data: counts } = await supabaseBrowserClient
          .from("app_inventory_counts")
          .select("fk_products")
          .eq("session_id", session.id);

        const countedRelevantProducts = new Set(
          counts?.filter(c => productsWithActivity.has(c.fk_products))
                 .map(c => c.fk_products) || []
        );

        progressMap[session.id] = {
          countable: countableProducts,
          counted: countedRelevantProducts.size
        };
      }

      setProgressData(progressMap);
    };

    loadProgress();
  }, [sessions]);

  // Funktion zum Laden der Inventarwerte-Daten
  const loadInventoryValueData = async () => {
    if (loadingInventoryData) return;
    
    setLoadingInventoryData(true);
    try {
      // Lade Produkte mit aktuellen Lagerbeständen
      const { data: productsWithStock, error } = await supabaseBrowserClient
        .from("app_products")
        .select(`
          id,
          bb_name,
          bb_sku,
          inventory_cagtegory,
          bb_category1,
          bb_category2,
          bb_category3,
          bb_costnet,
          app_stock_levels!inner (
            bb_StockCurrent
          )
        `)
        .eq("bb_is_active", true)
        .gt("app_stock_levels.bb_StockCurrent", 0);

      if (error) {
        console.error("Fehler beim Laden der Inventardaten:", error);
        message.error("Fehler beim Laden der Inventarwerte");
        return;
      }

      if (!productsWithStock || productsWithStock.length === 0) {
        message.info("Keine Produkte mit Lagerbestand gefunden");
        setInventoryData({
          categories: new Map(),
          totalInventoryValue: 0
        });
        return;
      }

      // Aggregiere Daten nach Kategorien
      const categoriesMap = new Map<string, CategoryData>();
      let totalInventoryValue = 0;

      productsWithStock.forEach((product: any) => {
        const stockCurrent = product.app_stock_levels?.[0]?.bb_StockCurrent || 0;
        const totalValue = stockCurrent * (product.bb_costnet || 0);
        totalInventoryValue += totalValue;

        const productWithSnapshot: ProductWithSnapshot = {
          id: product.id,
          bb_name: product.bb_name,
          bb_sku: product.bb_sku,
          inventory_cagtegory: product.inventory_cagtegory,
          bb_category1: product.bb_category1,
          bb_category2: product.bb_category2,
          bb_category3: product.bb_category3,
          cost_price: product.bb_costnet || 0,
          bb_stock_current: stockCurrent,
          total_value: totalValue
        };

        const category = product.inventory_cagtegory || "Ohne Kategorie";
        
        if (!categoriesMap.has(category)) {
          categoriesMap.set(category, {
            category,
            products: [],
            totalValue: 0,
            totalQuantity: 0,
            subcategories: new Map()
          });
        }

        const categoryData = categoriesMap.get(category)!;
        categoryData.products.push(productWithSnapshot);
        categoryData.totalValue += totalValue;
        categoryData.totalQuantity += stockCurrent;

        // Gruppiere nach Subkategorie (bb_category1)
        const subcategory = product.bb_category1 || "Ohne Subkategorie";
        if (!categoryData.subcategories.has(subcategory)) {
          categoryData.subcategories.set(subcategory, []);
        }
        categoryData.subcategories.get(subcategory)!.push(productWithSnapshot);
      });

      setInventoryData({
        categories: categoriesMap,
        totalInventoryValue
      });

      message.success(`Inventarwerte für ${productsWithStock.length} Produkte geladen`);
    } catch (err: any) {
      console.error("Fehler beim Laden der Inventardaten:", err);
      message.error("Fehler beim Laden der Inventarwerte");
    } finally {
      setLoadingInventoryData(false);
    }
  };

  // Memoized category data für bessere Performance
  const categoryDataArray = useMemo(() => {
    if (!inventoryData) return [];
    
    return Array.from(inventoryData.categories.entries())
      .map(([categoryName, categoryData]) => ({
        key: categoryName,
        categoryName,
        ...categoryData
      }))
      .sort((a, b) => b.totalValue - a.totalValue);
  }, [inventoryData]);

  // Kombiniere Session-Daten mit Fortschritt
  const sessionsWithProgress: SessionWithProgress[] = sessions.map((session: InventorySession) => ({
    ...session,
    countable_products: progressData[session.id]?.countable || 0,
    counted_products: progressData[session.id]?.counted || 0
  }));

  const handleStart = async (values: { name: string; note?: string }) => {
    const name = values?.name?.trim();
    if (!name) {
      message.error("Bitte einen Namen fuer die Inventur angeben.");
      return;
    }

    try {
      setStarting(true);
      const { data, error } = await (supabaseBrowserClient as any).rpc(
        "rpc_app_inventory_session_start",
        {
          p_name: name,
          p_note: values?.note ?? null,
        }
      );
      if (error) {
        throw error;
      }
      setSession(data as InventorySession);
      message.success("Inventur gestartet und Snapshot erstellt.");
    } catch (err: any) {
      const msg = err?.message ?? "Inventur konnte nicht gestartet werden.";
      message.error(msg);
    } finally {
      setStarting(false);
    }
  };

  return (
      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        {/* Inventarwerte-Übersicht */}
        <Card 
          title={<><BarChartOutlined /> Inventarwerte nach Kategorien</>} 
          bordered
          extra={
            <Button 
              type="primary" 
              onClick={loadInventoryValueData}
              loading={loadingInventoryData}
            >
              Inventarwerte laden
            </Button>
          }
        >
          {inventoryData && (
            <>
              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={8}>
                  <Statistic
                    title="Gesamtinventarwert"
                    value={inventoryData.totalInventoryValue}
                    precision={2}
                    suffix="€"
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="Kategorien"
                    value={inventoryData.categories.size}
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="Produkte mit Bestand"
                    value={Array.from(inventoryData.categories.values())
                      .reduce((sum, cat) => sum + cat.products.length, 0)}
                  />
                </Col>
              </Row>

              <Collapse size="small">
                {categoryDataArray.map((categoryData) => (
                  <Panel
                    key={categoryData.key}
                    header={
                      <Row style={{ width: '100%' }} align="middle">
                        <Col flex="auto">
                          <Text strong>{categoryData.categoryName}</Text>
                        </Col>
                        <Col>
                          <Text type="secondary">
                            {categoryData.products.length} Produkte | {categoryData.totalValue.toFixed(2)}€
                          </Text>
                        </Col>
                      </Row>
                    }
                  >
                    <Collapse size="small" ghost>
                      {Array.from(categoryData.subcategories.entries())
                        .sort(([,a], [,b]) => {
                          const valueA = a.reduce((sum, p) => sum + p.total_value, 0);
                          const valueB = b.reduce((sum, p) => sum + p.total_value, 0);
                          return valueB - valueA;
                        })
                        .map(([subcat, products]) => {
                          const subcatValue = products.reduce((sum, p) => sum + p.total_value, 0);
                          return (
                            <Panel
                              key={`${categoryData.key}-${subcat}`}
                              header={
                                <Row style={{ width: '100%' }} align="middle">
                                  <Col flex="auto">
                                    <Text>{subcat}</Text>
                                  </Col>
                                  <Col>
                                    <Text type="secondary">
                                      {products.length} Produkte | {subcatValue.toFixed(2)}€
                                    </Text>
                                  </Col>
                                </Row>
                              }
                            >
                              <Table
                                size="small"
                                dataSource={products}
                                rowKey="id"
                                pagination={false}
                                scroll={{ x: true }}
                              >
                                <Table.Column
                                  title="Artikel"
                                  dataIndex="bb_name"
                                  key="bb_name"
                                  render={(name, record: ProductWithSnapshot) => (
                                    <div>
                                      <div><strong>{name || "Unbenannt"}</strong></div>
                                      <Text type="secondary" style={{ fontSize: '0.85em' }}>
                                        {record.bb_sku}
                                      </Text>
                                    </div>
                                  )}
                                />
                                <Table.Column
                                  title="Bestand"
                                  dataIndex="bb_stock_current"
                                  key="bb_stock_current"
                                  align="right"
                                  render={(value) => <Text>{value}</Text>}
                                />
                                <Table.Column
                                  title="Stückkosten"
                                  dataIndex="cost_price"
                                  key="cost_price"
                                  align="right"
                                  render={(value) => <Text>{value?.toFixed(2)}€</Text>}
                                />
                                <Table.Column
                                  title="Gesamtwert"
                                  dataIndex="total_value"
                                  key="total_value"
                                  align="right"
                                  render={(value) => <Text strong>{value?.toFixed(2)}€</Text>}
                                />
                                <Table.Column
                                  title="Kategorie 2"
                                  dataIndex="bb_category2"
                                  key="bb_category2"
                                  render={(value) => <Text type="secondary">{value || "-"}</Text>}
                                />
                                <Table.Column
                                  title="Kategorie 3"
                                  dataIndex="bb_category3"
                                  key="bb_category3"
                                  render={(value) => <Text type="secondary">{value || "-"}</Text>}
                                />
                              </Table>
                            </Panel>
                          );
                        })
                      }
                    </Collapse>
                  </Panel>
                ))}
              </Collapse>
            </>
          )}
          
          {!inventoryData && (
            <Alert
              message="Inventarwerte-Übersicht"
              description="Klicken Sie auf 'Inventarwerte laden', um eine Übersicht der aktuellen Lagerbestände nach Kategorien zu erhalten."
              type="info"
              showIcon
            />
          )}
        </Card>

        <Card title="Inventur starten" bordered>
          <Form layout="vertical" onFinish={handleStart}>
            <Form.Item
              label="Name"
              name="name"
              rules={[{ required: true, message: "Name der Inventur fehlt." }]}
            >
              <Input placeholder="z. B. Jahresinventur 2025" />
            </Form.Item>
            <Form.Item label="Notiz" name="note">
              <Input.TextArea rows={2} placeholder="Optional: Beschreibung/Notiz" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={starting}>
                Inventur starten & Snapshot erzeugen
              </Button>
            </Form.Item>
          </Form>
          {session ? (
            <Alert
              style={{ marginTop: 12 }}
              type="success"
              showIcon
              message={`Inventur "${session.name}" gestartet`}
              description={`Status: ${session.status}, Snapshot: ${session.snapshot_taken_at ?? "-"}`}
            />
          ) : null}
        </Card>

        <List title="Vergangene Inventuren">
          <Table 
            dataSource={sessionsWithProgress} 
            rowKey="id"
            loading={isLoading}
          >
            <Table.Column title="Bezeichnung" dataIndex="name" sorter />
            <Table.Column title="Status" dataIndex="status" sorter />
            <Table.Column title="Anmerkungen" dataIndex="note" sorter />
            <Table.Column title="Fortschritt" dataIndex="countable_products" 
              render={(_, record: SessionWithProgress) => {
                const percent = record.countable_products > 0 
                  ? Math.round((record.counted_products / record.countable_products) * 100)
                  : 0;
                return <Progress percent={percent} />;
              }}
            />
            <Table.Column title="Aktionen" key="actions" render={(_, record: SessionWithProgress) => (
              <Space>
                <Button href={`/lager/inventur/zaehlen/${record.id}`} icon={<EditOutlined />}>Zählen</Button>
                <Button href={`/lager/inventur/pruefen/${record.id}`} icon={<CheckOutlined />}>Differenzen prüfen</Button>
              </Space>
            )} />
          </Table>
        </List>
      </Space>
  );
}
