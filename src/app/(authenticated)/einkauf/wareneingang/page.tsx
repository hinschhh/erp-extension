"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Alert,
  Avatar,
  Button,
  Card,
  Descriptions,
  Divider,
  Form,
  Input,
  InputNumber,
  List,
  Modal,
  Result,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
} from "antd";
import {
  BarcodeOutlined,
  CheckOutlined,
  InboxOutlined,
  SearchOutlined,
  ShoppingCartOutlined,
} from "@ant-design/icons";
import { HttpError, useCreate, useList, useNotification } from "@refinedev/core";

// Barcode/QR-Scanner dynamisch (CSR-only)
const BarcodeScannerComponent = dynamic(
  // @ts-ignore
  () => import("react-qr-barcode-scanner"),
  { ssr: false, loading: () => <div style={{ height: 320 }} /> },
);

// --------- Types (Supabase 'components') ----------
type ComponentItem = {
  id: number;
  sku: string;
  name: string;
  manufacturer_number?: string;
  supplier_name?: string;
  stock?: number;
  unit?: string;
  thumbnail_url?: string;
};

type EinkaufBestellung = {
  id: number | string;
  supplier: string;
  eta?: string;
  quantityOpen: number;
  status: "open" | "partially_received" | "closed";
};

const { Title, Text } = Typography;

// --------- Utils ----------
const isNumericId = (q: string) => /^\d+$/.test(q.trim());

/** Vorschlags-OR (ilike) */
const buildSuggestOrMeta = (q: string | undefined) => {
  if (!q?.trim()) return undefined;
  const t = q.trim();
  // ilike.*term* für case-insensitive Teiltreffer
  const parts: string[] = [
    `sku.ilike.*${t}*`,
    `manufacturer_number.ilike.*${t}*`,
    `name.ilike.*${t}*`,
  ];
  return { or: parts.join(",") };
};

export default function WareneinkaufPage() {
  // ------------- UI State -------------
  const [query, setQuery] = useState("");
  const [searchQ, setSearchQ] = useState<string>("");
  const [hasSearched, setHasSearched] = useState(false);

  const [scannerOpen, setScannerOpen] = useState(false);
  const lastScanRef = useRef<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ComponentItem | null>(null);

  // ------------- Refine -------------
  const { open } = useNotification();
  const { mutate: createWareneingang, isLoading: creatingReceipt } = useCreate();

  // ------------- Queries -------------
  // 1) Exakte ID-Suche (nur bei numerischer Eingabe)
  const {
    data: exactIdList,
    isLoading: isLoadingExactId,
    isRefetching: isRefetchingExactId,
    error: exactIdError,
  } = useList<ComponentItem, HttpError>({
    resource: "components",
    pagination: { current: 1, pageSize: 1 },
    filters: isNumericId(searchQ) ? [{ field: "id", operator: "eq", value: Number(searchQ) }] : [],
    meta: undefined,
    sorters: [],
    queryOptions: {
      enabled: hasSearched && isNumericId(searchQ),
      keepPreviousData: false,
    },
  });
  const exactIdProduct: ComponentItem | null =
    exactIdList?.data && exactIdList.data.length > 0 ? exactIdList.data[0] : null;

  // 2) Vorschläge (SKU/HerstellerNr/Name via ilike)
  const {
    data: suggestList,
    isLoading: isLoadingSuggest,
    isRefetching: isRefetchingSuggest,
    error: suggestError,
  } = useList<ComponentItem, HttpError>({
    resource: "components",
    pagination: { current: 1, pageSize: 12 },
    filters: [],
    meta: buildSuggestOrMeta(searchQ),
    sorters: [],
    queryOptions: {
      enabled: hasSearched && !!searchQ,
      keepPreviousData: false,
    },
  });

  const suggestions: ComponentItem[] = suggestList?.data ?? [];

  // 3) Aus Vorschlägen exakten (case-insensitive) SKU/HerstellerNr-Treffer ermitteln
  const exactCodeProduct: ComponentItem | null = useMemo(() => {
    if (!searchQ || isNumericId(searchQ) || suggestions.length === 0) return null;
    const q = searchQ.trim().toLowerCase();
    const exactMatches = suggestions.filter(
      (item) =>
        item.sku?.toLowerCase() === q ||
        item.manufacturer_number?.toLowerCase() === q,
    );
    if (exactMatches.length === 1) return exactMatches[0];
    return null;
  }, [searchQ, suggestions]);

  // -------- eindeutiger Kandidat? (ID gewinnt vor Code) --------
  const uniqueCandidate: ComponentItem | null = useMemo(() => {
    if (exactIdProduct) return exactIdProduct;
    if (exactCodeProduct) return exactCodeProduct;
    return null;
  }, [exactIdProduct, exactCodeProduct]);

  // bei eindeutigem Treffer Modal öffnen
  useEffect(() => {
    if (uniqueCandidate) {
      setSelectedProduct(uniqueCandidate);
      setModalOpen(true);
    }
  }, [uniqueCandidate]);

  const anyLoading =
    hasSearched &&
    (isLoadingExactId ||
      isRefetchingExactId ||
      isLoadingSuggest ||
      isRefetchingSuggest);

  // Placeholder bis PO-Backend steht
  const offeneBestellungen: EinkaufBestellung[] = [];

  // ------------- Handlers -------------
  const onSearch = useCallback(() => {
    const val = query.trim();
    if (!val) return;
    setSearchQ(val);
    setHasSearched(true);
  }, [query]);

  const onScanDetected = useCallback((text: string) => {
    if (!text) return;
    if (lastScanRef.current === text) return;
    lastScanRef.current = text;

    setScannerOpen(false); // Scanner sofort schließen
    setQuery(text);
    setSearchQ(text);
    setHasSearched(true);

    setTimeout(() => (lastScanRef.current = null), 800);
  }, []);

  const openProductModal = useCallback((p: ComponentItem) => {
    setSelectedProduct(p);
    setModalOpen(true);
  }, []);

  const markAsReceived = useCallback(
    (po: EinkaufBestellung) => {
      open?.({
        type: "success",
        message: "Wareneingang gebucht",
        description: `Bestellung #${po.id} für ${po.quantityOpen} Stk. als eingetroffen markiert.`,
      });
    },
    [open],
  );

  const onManualReceipt = useCallback(
    (values: any) => {
      if (!selectedProduct) return;
      createWareneingang(
        {
          resource: "wareneingaenge",
          values: {
            product_id: selectedProduct.id,
            sku: values.sku ?? selectedProduct.sku,
            quantity: values.quantity,
            supplier_name: values.supplierName ?? selectedProduct.supplier_name ?? null,
            notes: values.notes ?? null,
            received_at: new Date().toISOString(),
          },
          successNotification: () => ({
            type: "success",
            message: "Wareneingang erfasst",
            description: `Wareneingang für ${values.sku || selectedProduct.sku} gespeichert.`,
          }),
        },
        {
          onError: (err) => {
            open?.({
              type: "error",
              message: "Fehler beim Speichern",
              description: (err as any)?.message || "Bitte später erneut versuchen.",
            });
          },
        },
      );
    },
    [createWareneingang, open, selectedProduct],
  );

  // ------------- UI: Tabellen & Listen -------------
  const poColumns = [
    { title: "Bestell-Nr.", dataIndex: "id", key: "id", width: 140 },
    { title: "Lieferant", dataIndex: "supplier", key: "supplier" },
    {
      title: "ETA",
      dataIndex: "eta",
      key: "eta",
      width: 160,
      render: (eta: string | undefined) => (eta ? <Text>{eta}</Text> : <Tag>k. A.</Tag>),
    },
    {
      title: "Offen",
      dataIndex: "quantityOpen",
      key: "quantityOpen",
      width: 120,
      render: (q: number) => <Text strong>{q}</Text>,
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 180,
      render: (s: EinkaufBestellung["status"]) => {
        const color =
          s === "open" ? "processing" : s === "partially_received" ? "default" : "success";
        const label =
          s === "open" ? "Offen" : s === "partially_received" ? "Teilweise" : "Erledigt";
        return <Tag color={color as any}>{label}</Tag>;
      },
    },
    {
      title: "Aktion",
      key: "action",
      width: 220,
      render: (_: any, record: EinkaufBestellung) => (
        <Button
          icon={<CheckOutlined />}
          type="primary"
          onClick={() => markAsReceived(record)}
          disabled={record.status === "closed"}
        >
          Als eingetroffen markieren
        </Button>
      ),
    },
  ];

  return (
    <Space direction="vertical" size="large" style={{ display: "flex" }}>
      {/* Suche */}
      <Card>
        <Space direction="vertical" style={{ width: "100%" }} size="large">
          <Title level={3} style={{ margin: 0 }}>
            Wareneinkauf – Wareneingang
          </Title>
          <Text type="secondary">
            Suche nach <b>SKU</b>, <b>Hersteller-Nr.</b> oder <b>ID</b>. Alternativ per Kamera-Scan.
          </Text>

          <Space.Compact style={{ width: "100%" }}>
            <Input
              allowClear
              size="large"
              prefix={<SearchOutlined />}
              placeholder="Suche nach SKU, Hersteller-Nr. oder ID"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onPressEnter={onSearch}
            />
            <Button size="large" type="primary" onClick={onSearch}>
              Suchen
            </Button>
            <Button size="large" icon={<BarcodeOutlined />} onClick={() => setScannerOpen(true)}>
              Scannen
            </Button>
          </Space.Compact>

          {(exactIdError || suggestError) && (
            <Alert
              type="error"
              message="Fehler bei der Suche"
              description={
                (exactIdError as any)?.message ||
                (suggestError as any)?.message ||
                "Bitte später erneut versuchen."
              }
              showIcon
            />
          )}
        </Space>
      </Card>

      {/* CTA vor erster Suche */}
      {!hasSearched && (
        <Card>
          <Result
            icon={<SearchOutlined style={{ fontSize: 48 }} />}
            title="Starte die Wareneingangs-Suche"
            subTitle="Gib eine SKU, Hersteller-Nr. oder ID ein – oder scanne per Kamera."
          />
        </Card>
      )}

      {/* Ladezustand nur NACH Start einer Suche */}
      {hasSearched && anyLoading && (
        <Card>
          <Result status="info" title="Suche läuft..." />
        </Card>
      )}

      {/* Vorschläge wenn keine eindeutige Auswahl */}
      {hasSearched && !anyLoading && !uniqueCandidate && suggestions.length > 0 && (
        <Card
          title={
            <Space align="center">
              <SearchOutlined />
              <Text strong>Vorschläge</Text>
              <Text type="secondary">({suggestions.length})</Text>
            </Space>
          }
        >
          <List
            itemLayout="horizontal"
            dataSource={suggestions}
            renderItem={(item) => (
              <List.Item
                actions={[
                  <Button
                    key="select"
                    type="link"
                    icon={<ShoppingCartOutlined />}
                    onClick={() => openProductModal(item)}
                  >
                    Auswählen
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  avatar={
                    item.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        alt={item.name}
                        src={item.thumbnail_url}
                        style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6 }}
                      />
                    ) : (
                      <Avatar shape="square" size={40} style={{ borderRadius: 6 }}>
                        {item.sku?.slice(0, 2)?.toUpperCase() || "A"}
                      </Avatar>
                    )
                  }
                  title={
                    <Space split={<Divider type="vertical" />}>
                      <Text strong>{item.name}</Text>
                      <Text type="secondary">SKU: {item.sku}</Text>
                      {item.manufacturer_number && (
                        <Text type="secondary">Hersteller-Nr.: {item.manufacturer_number}</Text>
                      )}
                      <Text type="secondary">ID: {item.id}</Text>
                    </Space>
                  }
                  description={
                    <Space>
                      <Tag>{typeof item.stock === "number" ? `Bestand: ${item.stock}` : "Bestand: k. A."}</Tag>
                      <Tag>{item.unit || "Stk."}</Tag>
                      {item.supplier_name ? <Tag color="default">{item.supplier_name}</Tag> : <Tag>Lieferant: k. A.</Tag>}
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        </Card>
      )}

      {/* Kein Ergebnis */}
      {hasSearched && !anyLoading && !uniqueCandidate && suggestions.length === 0 && (
        <Card>
          <Result status="warning" title="Kein Produkt zur Suche gefunden." />
        </Card>
      )}

      {/* Produkt-Modal */}
      <Modal
        title={
          selectedProduct ? (
            <Space direction="vertical" size={0}>
              <Text strong style={{ fontSize: 16 }}>{selectedProduct.name}</Text>
              <Text type="secondary">
                ID: {selectedProduct.id} · SKU: {selectedProduct.sku}
                {selectedProduct.manufacturer_number ? ` · Hersteller-Nr.: ${selectedProduct.manufacturer_number}` : ""}
              </Text>
            </Space>
          ) : (
            "Produkt"
          )
        }
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={900}
        destroyOnClose
      >
        {selectedProduct && (
          <>
            <Tabs
              defaultActiveKey="po"
              items={[
                {
                  key: "po",
                  label: "Offene Einkaufsbestellungen",
                  children: (
                    <Card size="small" bordered>
                      <Table
                        size="small"
                        rowKey="id"
                        columns={[
                          { title: "Bestell-Nr.", dataIndex: "id", key: "id", width: 140 },
                          { title: "Lieferant", dataIndex: "supplier", key: "supplier" },
                          {
                            title: "ETA",
                            dataIndex: "eta",
                            key: "eta",
                            width: 160,
                            render: (eta: string | undefined) =>
                              eta ? <Text>{eta}</Text> : <Tag>k. A.</Tag>,
                          },
                          {
                            title: "Offen",
                            dataIndex: "quantityOpen",
                            key: "quantityOpen",
                            width: 120,
                            render: (q: number) => <Text strong>{q}</Text>,
                          },
                          {
                            title: "Status",
                            dataIndex: "status",
                            key: "status",
                            width: 180,
                            render: (s: EinkaufBestellung["status"]) => {
                              const color =
                                s === "open"
                                  ? "processing"
                                  : s === "partially_received"
                                  ? "default"
                                  : "success";
                              const label =
                                s === "open" ? "Offen" : s === "partially_received" ? "Teilweise" : "Erledigt";
                              return <Tag color={color as any}>{label}</Tag>;
                            },
                          },
                          {
                            title: "Aktion",
                            key: "action",
                            width: 220,
                            render: (_: any, record: EinkaufBestellung) => (
                              <Button
                                icon={<CheckOutlined />}
                                type="primary"
                                onClick={() => markAsReceived(record)}
                                disabled={record.status === "closed"}
                              >
                                Als eingetroffen markieren
                              </Button>
                            ),
                          },
                        ] as any}
                        dataSource={[] /* TODO: echte Daten einbinden */}
                        locale={{
                          emptyText: (
                            <Space direction="vertical" align="center" style={{ width: "100%" }}>
                              <InboxOutlined style={{ fontSize: 28 }} />
                              <Text type="secondary">Keine offenen Bestellungen gefunden.</Text>
                            </Space>
                          ),
                        }}
                      />
                    </Card>
                  ),
                },
                {
                  key: "manual",
                  label: "Manuell",
                  children: (
                    <Card size="small" bordered>
                      <Title level={5} style={{ marginTop: 0 }}>
                        Manueller Wareneingang (ohne Bestellung)
                      </Title>
                      <Text type="secondary">Buche einen Wareneingang unabhängig von einer Einkaufsbestellung.</Text>
                      <Divider />
                      <Form
                        layout="vertical"
                        onFinish={onManualReceipt}
                        requiredMark="optional"
                        initialValues={{
                          quantity: 1,
                          sku: selectedProduct.sku,
                          supplierName: selectedProduct.supplier_name,
                        }}
                      >
                        <Form.Item
                          label="SKU"
                          name="sku"
                          rules={[{ required: true, message: "Bitte SKU angeben" }]}
                        >
                          <Input placeholder="SKU des Artikels" />
                        </Form.Item>
                        <Form.Item label="Lieferant (optional)" name="supplierName">
                          <Input placeholder="Lieferant/Hersteller" />
                        </Form.Item>
                        <Form.Item
                          label="Menge"
                          name="quantity"
                          rules={[{ required: true, message: "Bitte Menge angeben" }]}
                        >
                          <InputNumber min={1} style={{ width: 200 }} />
                        </Form.Item>
                        <Form.Item label="Notiz (optional)" name="notes">
                          <Input.TextArea rows={3} placeholder="z. B. Chargen-Nr., Abweichungen, etc." />
                        </Form.Item>
                        <Space>
                          <Button htmlType="submit" type="primary" loading={creatingReceipt} icon={<CheckOutlined />}>
                            Wareneingang speichern
                          </Button>
                        </Space>
                      </Form>
                    </Card>
                  ),
                },
              ]}
            />
            <Divider />
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="Bestand">
                {typeof selectedProduct.stock === "number" ? selectedProduct.stock : <Tag>k. A.</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="Einheit">
                {selectedProduct.unit || <Tag>Stk.</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="Lieferant" span={2}>
                {selectedProduct.supplier_name || <Tag>k. A.</Tag>}
              </Descriptions.Item>
            </Descriptions>
          </>
        )}
      </Modal>

      {/* Scanner-Modal */}
      <Modal
        title="Barcode / QR-Code scannen"
        open={scannerOpen}
        onCancel={() => setScannerOpen(false)}
        footer={null}
        destroyOnClose
      >
        <div style={{ width: "100%", height: 320, overflow: "hidden", borderRadius: 8 }}>
          {/* @ts-ignore */}
          <BarcodeScannerComponent
            width={"100%"}
            height={320}
            onUpdate={(err: any, result: any) => {
              if (result?.text) onScanDetected(result.text);
            }}
          />
        </div>
        <Divider />
        <Text type="secondary">Tipp: Gute Beleuchtung und Kamera mit Autofokus erhöhen die Erkennungsrate.</Text>
      </Modal>
    </Space>
  );
}
