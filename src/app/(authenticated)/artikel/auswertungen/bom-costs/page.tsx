// src/app/(authenticated)/artikel/auswertungen/bom-costs/page.tsx
"use client";

import React from "react";
import { useList } from "@refinedev/core";
import { Card, Table, Tag, Typography, Space, Statistic, Row, Col } from "antd";
import type { Tables } from "@/types/supabase";
import type { HttpError } from "@refinedev/core";
import { formatCurrencyEUR as currency } from "@/utils/formats";
import Link from "next/link";

const { Title } = Typography;

type BomProduct = Tables<"app_products"> & {
  bom_recipes?: {
    quantity?: number | null;
    billbee_component?: {
      bb_name?: string | null;
      bb_sku?: string | null;
      cost_price?: number | null;
      inventory_cagtegory?: string | null;
    } | null;
  }[] | null;
};

type BomCostAnalysis = {
  id: number;
  bb_name: string;
  bb_sku: string;
  totalComponents: number;
  totalCost: number;
  sellingPriceNetto: number;
  marginAbsolute: number;
  marginPercentage: number;
  components: Array<{
    name: string;
    sku: string;
    category: string | null;
    quantity: number;
    unitCost: number;
    totalCost: number;
  }>;
};

export default function BomCostsPage() {
  /* ---------- BOM-Produkte laden ---------- */
  const { data: bomProductsRes, isLoading } = useList<BomProduct, HttpError>({
    resource: "app_products",
    filters: [
      { field: "bb_is_bom", operator: "eq", value: true }
    ],
    pagination: { mode: "off" },
    sorters: [{ field: "bb_name", order: "asc" }],
    meta: { 
      select: `
        id, bb_name, bb_sku, bb_is_bom, "bb_Net", "bb_Price",
        bom_recipes!bom_recipes_billbee_bom_id_fkey (
          quantity,
          billbee_component:app_products!bom_recipes_billbee_component_id_fkey (
            bb_name, bb_sku, cost_price, inventory_cagtegory
          )
        )
      `
    },
  });

  /* ---------- Kostenanalyse berechnen ---------- */
  const bomAnalysis = React.useMemo(() => {
    if (!bomProductsRes?.data) return [];

    return bomProductsRes.data
      .map((product): BomCostAnalysis | null => {
        const recipes = product.bom_recipes ?? [];
        if (recipes.length === 0) return null;

        const components = recipes
          .map((recipe) => {
            const component = recipe.billbee_component;
            if (!component) return null;

            const quantity = Number(recipe.quantity ?? 0);
            const unitCost = Number(component.cost_price ?? 0);
            const totalCost = quantity * unitCost;

            return {
              name: component.bb_name ?? "Unbekannt",
              sku: component.bb_sku ?? "—",
              category: component.inventory_cagtegory ?? null,
              quantity,
              unitCost,
              totalCost,
            };
          })
          .filter((comp): comp is NonNullable<typeof comp> => comp !== null)
          .sort((a, b) => b.totalCost - a.totalCost); // Nach Gesamtkosten sortieren

        const totalCost = components.reduce((sum, comp) => sum + comp.totalCost, 0);
        const sellingPriceNetto = Number(product.bb_Net ?? 0);
        const marginAbsolute = sellingPriceNetto - totalCost;
        const marginPercentage = sellingPriceNetto > 0 ? (marginAbsolute / sellingPriceNetto) * 100 : 0;

        return {
          id: Number(product.id),
          bb_name: product.bb_name ?? "Unbekannt",
          bb_sku: product.bb_sku ?? "—",
          totalComponents: components.length,
          totalCost,
          sellingPriceNetto,
          marginAbsolute,
          marginPercentage,
          components,
        };
      })
      .filter((analysis): analysis is NonNullable<typeof analysis> => analysis !== null)
      .sort((a, b) => b.totalCost - a.totalCost); // Nach Gesamtkosten sortieren
  }, [bomProductsRes?.data]);

  /* ---------- Statistiken ---------- */
  const stats = React.useMemo(() => {
    const totalBoms = bomAnalysis.length;
    const totalComponents = bomAnalysis.reduce((sum, bom) => sum + bom.totalComponents, 0);
    const totalMaterialValue = bomAnalysis.reduce((sum, bom) => sum + bom.totalCost, 0);
    const totalSalesValue = bomAnalysis.reduce((sum, bom) => sum + bom.sellingPriceNetto, 0);
    const avgCostPerBom = totalBoms > 0 ? totalMaterialValue / totalBoms : 0;
    const avgMarginPercentage = totalBoms > 0 ? bomAnalysis.reduce((sum, bom) => sum + bom.marginPercentage, 0) / totalBoms : 0;

    return { totalBoms, totalComponents, totalMaterialValue, totalSalesValue, avgCostPerBom, avgMarginPercentage };
  }, [bomAnalysis]);

  /* ---------- Komponenten-Tabellenspalten für expandierte Zeilen ---------- */
  const componentColumns = [
    {
      title: "Komponente",
      dataIndex: "name",
      key: "name",
      render: (name: string, record: BomCostAnalysis['components'][0]) => (
        <Space direction="vertical" size="small">
          <strong>{name}</strong>
          <Typography.Text type="secondary">{record.sku}</Typography.Text>
        </Space>
      ),
    },
    {
      title: "Kategorie",
      dataIndex: "category",
      key: "category",
      render: (category: string | null) => 
        category ? <Tag>{category}</Tag> : <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      title: "Menge",
      dataIndex: "quantity",
      key: "quantity",
      align: "right" as const,
      render: (qty: number) => qty.toFixed(2),
    },
    {
      title: "Stückkosten",
      dataIndex: "unitCost",
      key: "unitCost",
      align: "right" as const,
      render: (cost: number) => currency(cost),
    },
    {
      title: "Gesamtkosten",
      dataIndex: "totalCost",
      key: "totalCost",
      align: "right" as const,
      render: (cost: number) => <strong>{currency(cost)}</strong>,
    },
  ];

  /* ---------- Haupt-Tabellenspalten ---------- */
  const columns = [
    {
      title: "Stückliste",
      dataIndex: "bb_name",
      key: "bb_name",
      sorter: (a: BomCostAnalysis, b: BomCostAnalysis) => a.bb_name.localeCompare(b.bb_name),
      render: (name: string, record: BomCostAnalysis) => (
        <Space direction="vertical" size="small">
          <Link href={`/artikel/anzeigen/${record.id}`}>
            <strong>{name}</strong>
          </Link>
          <Typography.Text type="secondary">{record.bb_sku}</Typography.Text>
        </Space>
      ),
    },
    {
      title: "Komponenten",
      dataIndex: "totalComponents",
      key: "totalComponents",
      align: "center" as const,
      sorter: (a: BomCostAnalysis, b: BomCostAnalysis) => a.totalComponents - b.totalComponents,
      render: (count: number) => <Tag color="blue">{count}</Tag>,
    },
    {
      title: "Materialkosten",
      dataIndex: "totalCost",
      key: "totalCost",
      align: "right" as const,
      sorter: (a: BomCostAnalysis, b: BomCostAnalysis) => a.totalCost - b.totalCost,
      defaultSortOrder: "descend" as const,
      render: (cost: number) => (
        <Statistic
          value={cost}
          formatter={(value) => currency(Number(value))}
          valueStyle={{ 
            fontSize: "14px", 
            color: cost > 0 ? "#52c41a" : "#8c8c8c" 
          }}
        />
      ),
    },
    {
      title: "Verkaufspreis (netto)",
      dataIndex: "sellingPriceNetto",
      key: "sellingPriceNetto",
      align: "right" as const,
      sorter: (a: BomCostAnalysis, b: BomCostAnalysis) => a.sellingPriceNetto - b.sellingPriceNetto,
      render: (price: number) => (
        <Statistic
          value={price}
          formatter={(value) => currency(Number(value))}
          valueStyle={{ 
            fontSize: "14px", 
            color: "#1890ff" 
          }}
        />
      ),
    },
    {
      title: "Marge",
      dataIndex: "marginPercentage",
      key: "marginPercentage",
      align: "right" as const,
      sorter: (a: BomCostAnalysis, b: BomCostAnalysis) => a.marginPercentage - b.marginPercentage,
      render: (marginPct: number, record: BomCostAnalysis) => (
        <Space direction="vertical" size="small" style={{ alignItems: "flex-end" }}>
          <span style={{ 
            color: marginPct >= 68 ? '#52c41a' : marginPct >= 60 ? '#faad14' : '#ff4d4f',
            fontWeight: 'bold',
            fontSize: '14px'
          }}>
            {marginPct.toFixed(1)}%
          </span>
          <Typography.Text type="secondary" style={{ fontSize: "12px" }}>
            {currency(record.marginAbsolute)}
          </Typography.Text>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: "24px" }}>
      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <Card>
          <Title level={2}>Stücklisten - Materialkosten-Analyse</Title>
          <Typography.Paragraph>
            Übersicht über alle Stücklisten (BOMs) mit detaillierter Aufschlüsselung 
            der Materialkosten basierend auf aktuellen Einkaufspreisen.
          </Typography.Paragraph>
        </Card>

        {/* Statistiken */}
        <Card>
          <Row gutter={16}>
            <Col span={8}>
              <Statistic
                title="Stücklisten gesamt"
                value={stats.totalBoms}
                valueStyle={{ color: "#3f8600" }}
              />
            </Col>
            <Col span={8}>
              <Statistic
                title="Komponenten gesamt"
                value={stats.totalComponents}
                valueStyle={{ color: "#cf1322" }}
              />
            </Col>
            <Col span={8}>
              <Statistic
                title="Ø Marge"
                value={stats.avgMarginPercentage}
                formatter={(value) => `${Number(value).toFixed(1)}%`}
                valueStyle={{ color: stats.avgMarginPercentage >= 60 ? "#52c41a" : stats.avgMarginPercentage >= 40 ? "#faad14" : "#ff4d4f" }}
              />
            </Col>
          </Row>
        </Card>

        {/* Haupttabelle */}
        <Card>
          <Table
            dataSource={bomAnalysis}
            columns={columns}
            rowKey="id"
            loading={isLoading}
            pagination={false}
            expandable={{
              expandedRowRender: (record: BomCostAnalysis) => (
                <div style={{ padding: "16px 0" }}>
                  <Title level={5}>Komponenten für {record.bb_name}</Title>
                  <Table
                    dataSource={record.components}
                    columns={componentColumns}
                    rowKey="sku"
                    pagination={false}
                    size="small"
                    summary={() => (
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0} colSpan={2}>
                          <strong>Gesamte Materialkosten</strong>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={1} align="right">
                          <strong>{currency(record.totalCost)}</strong>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={2} align="right">
                          <Typography.Text type="secondary">—</Typography.Text>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={3} align="right">
                          <Typography.Text type="secondary">—</Typography.Text>
                        </Table.Summary.Cell>
                      </Table.Summary.Row>
                    )}
                  />
                </div>
              ),
              rowExpandable: (record) => record.totalComponents > 0,
            }}
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0}>
                  <strong>Gesamt ({stats.totalBoms} Stücklisten)</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={1} align="center">
                  <strong>{stats.totalComponents}</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right">
                  <strong>{currency(stats.totalMaterialValue)}</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="right">
                  <strong>{currency(stats.totalSalesValue)}</strong>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={4} align="right">
                  <span style={{ 
                    color: stats.avgMarginPercentage >= 68 ? '#52c41a' : stats.avgMarginPercentage >= 60 ? '#faad14' : '#ff4d4f',
                    fontWeight: 'bold' 
                  }}>
                    {stats.avgMarginPercentage.toFixed(1)}%
                  </span>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            )}
          />
        </Card>
      </Space>
    </div>
  );
}