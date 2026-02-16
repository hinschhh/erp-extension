"use client";

import React, { useMemo, useState } from "react";
import type { CrudFilters } from "@refinedev/core";
import { useList } from "@refinedev/core";
import { Card, Col, Row, Table, Typography, Statistic, Space, Divider, Radio } from "antd";
import { DateRangeFilter, type RangeValue } from "@/components/common/filters/DateRangeFilter";
import { Tables } from "@/types/supabase";

const { Title, Text } = Typography;

// Type definitions für bessere Typisierung
type SpecialOrderPosition = Tables<"app_purchase_orders_positions_special"> & {
  base_model?: Pick<Tables<"app_products">, "id" | "bb_sku" | "bb_name" | "room">;
  special_product?: Pick<Tables<"app_products">, "id" | "bb_sku" | "bb_name" | "room">;
  order?: Pick<Tables<"app_orders">, "bb_OrderNumber" | "bb_CreatedAt" | "bb_ShippedAt"> & {
    app_customers?: Pick<Tables<"app_customers">, "bb_Name">;
    app_order_items?: Array<Pick<Tables<"app_order_items">, "id" | "bb_TotalPrice" | "bb_Quantity" | "fk_app_products_id">>;
  };
};

// Hilfsfunktion für Währungsformatierung
const currency = (v: number) =>
  new Intl.NumberFormat("de-DE", { 
    style: "currency", 
    currency: "EUR", 
    maximumFractionDigits: 2 
  }).format(v || 0);

export default function SonderbestellungenDashboard() {
  // Zeitraum-State (wird von DateRangeFilter initialisiert)
  const [dateRange, setDateRange] = useState<RangeValue>(null);
  const [dataSource, setDataSource] = useState<"orders" | "sales">("orders");

  // Basis-Filter (ohne Datum, da wir Client-seitig filtern)
  const filters: CrudFilters = []; // Leer, da wir Client-seitig filtern

  // Lade alle Sonderbestellungen mit ausführlichen Informationen
  const { data: specialOrdersData, isLoading } = useList<SpecialOrderPosition>({
    resource: "app_purchase_orders_positions_special",
    filters,
    meta: {
      select: `
        *,
        base_model:app_products!base_model_billbee_product_id(id, bb_sku, bb_name, room),
        special_product:app_products!billbee_product_id(id, bb_sku, bb_name, room),
        order:app_orders!fk_app_orders_id(
          bb_OrderNumber,
          bb_CreatedAt,
          bb_ShippedAt,
          app_customers!fk_app_customers_id(bb_Name),
          app_order_items!fk_app_orders_id(id, bb_TotalPrice, bb_Quantity, fk_app_products_id)
        )
      `
    },
    pagination: { pageSize: 1000 },
    queryOptions: { keepPreviousData: true }
  });

  // Berechne Analysedaten
  const analysis = useMemo(() => {
    if (!specialOrdersData?.data) return null;

    let orders = specialOrdersData.data;

    // Client-seitige Filterung basierend auf Zeitraum und Datenquelle
    if (dateRange?.[0] && dateRange?.[1]) {
      const startDate = dateRange[0].startOf("day");
      const endDate = dateRange[1].endOf("day");

      orders = orders.filter(order => {
        if (dataSource === "orders") {
          // Auftragsvolumen: basierend auf created_at der Sonderbestellung
          const orderDate = order.created_at ? new Date(order.created_at) : null;
          return orderDate && orderDate >= startDate.toDate() && orderDate <= endDate.toDate();
        } else {
          // Umsatz: basierend auf bb_CreatedAt des verknüpften Orders
          const salesDate = order.order?.bb_CreatedAt ? new Date(order.order.bb_CreatedAt) : null;
          return salesDate && salesDate >= startDate.toDate() && salesDate <= endDate.toDate();
        }
      });
    }

    // 1. Produkthäufigkeit als Basis für Sonderbestellungen
    const baseProductFrequency: Record<string, {
      count: number;
      product: Pick<Tables<"app_products">, "id" | "bb_sku" | "bb_name" | "room">;
      totalValue: number;
      totalCost: number;
      realMargin: number;
      materialCostRatio: number;
    }> = {};

    // 2. Kategorieanalyse (basierend auf Raum/Kategorie)
    const categoryAnalysis: Record<string, {
      count: number;
      totalValue: number;
      totalCost: number;
      realMargin: number;
      materialCostRatio: number;
    }> = {};

    // 3. Gesamtdaten
    let totalOrders = 0;
    let totalValue = 0;
    let totalCost = 0;
    let totalMargin = 0;

    orders.forEach(order => {
      totalOrders += 1;
      const orderCost = (order.unit_price_net || 0) * (order.qty_ordered || 1);
      totalCost += orderCost;

      // Berechne Verkaufswert basierend auf direkt verknüpften Order Items
      let orderSalesValue = 0;
      if (order.fk_app_order_items_id && order.order?.app_order_items) {
        const linkedOrderItem = order.order.app_order_items.find(
          item => item.id === order.fk_app_order_items_id
        );
        
        if (linkedOrderItem) {
          // Verkaufswert ist brutto (19% MwSt.) - auf netto umrechnen für Margenberechnung
          const bruttoValue = linkedOrderItem.bb_TotalPrice || 0;
          orderSalesValue = bruttoValue / 1.19; // Netto-Verkaufswert
        }
      }

      totalValue += orderSalesValue;
      const orderMargin = orderSalesValue - orderCost;
      totalMargin += orderMargin;

      // Verwende das Base-Model für die Häufigkeitsanalyse
      if (order.base_model) {
        const key = order.base_model.bb_sku || 'Unbekannt';
        
        if (!baseProductFrequency[key]) {
          baseProductFrequency[key] = {
            count: 0,
            product: order.base_model,
            totalValue: 0,
            totalCost: 0,
            realMargin: 0,
            materialCostRatio: 0
          };
        }
        
        baseProductFrequency[key].count += 1;
        baseProductFrequency[key].totalValue += orderSalesValue;
        baseProductFrequency[key].totalCost += orderCost;
        baseProductFrequency[key].realMargin += orderMargin;
      }

      // Kategorieanalyse basierend auf Raum des Spezialprodukts
      const category = order.special_product?.room || order.base_model?.room || 'Unbekannte Kategorie';
      if (!categoryAnalysis[category]) {
        categoryAnalysis[category] = {
          count: 0,
          totalValue: 0,
          totalCost: 0,
          realMargin: 0,
          materialCostRatio: 0
        };
      }
      
      categoryAnalysis[category].count += 1;
      categoryAnalysis[category].totalValue += orderSalesValue;
      categoryAnalysis[category].totalCost += orderCost;
      categoryAnalysis[category].realMargin += orderMargin;
    });

    // Berechne Materialkostenquoten nach der Aggregation
    Object.keys(baseProductFrequency).forEach(key => {
      const data = baseProductFrequency[key];
      data.materialCostRatio = data.totalValue > 0 ? (data.totalCost / data.totalValue * 100) : 0;
    });

    Object.keys(categoryAnalysis).forEach(category => {
      const data = categoryAnalysis[category];
      data.materialCostRatio = data.totalValue > 0 ? (data.totalCost / data.totalValue * 100) : 0;
    });

    return {
      baseProductFrequency,
      categoryAnalysis,
      totalOrders,
      totalValue,
      totalCost,
      totalMargin,
      avgOrderValue: totalValue / totalOrders || 0,
      avgMargin: totalMargin / totalOrders || 0,
      marginPercentage: totalValue > 0 ? (totalMargin / totalValue * 100) : 0,
      materialCostRatio: totalValue > 0 ? (totalCost / totalValue * 100) : 0
    };
  }, [specialOrdersData, dateRange, dataSource]);

  // Tabellendaten für Produkthäufigkeit
  const productFrequencyData = useMemo(() => {
    if (!analysis) return [];
    
    return Object.entries(analysis.baseProductFrequency)
      .map(([sku, data]) => ({
        key: sku,
        sku,
        productName: data.product.bb_name || 'Unbekannt',
        room: data.product.room || 'Unbekannt',
        count: data.count,
        totalValue: data.totalValue,
        totalCost: data.totalCost,
        realMargin: data.realMargin,
        avgOrderValue: data.totalValue / data.count,
        marginPercentage: data.totalValue > 0 ? (data.realMargin / data.totalValue * 100) : 0,
        materialCostRatio: data.materialCostRatio
      }))
      .sort((a, b) => b.count - a.count);
  }, [analysis]);

  // Tabellendaten für Kategorieanalyse
  const categoryData = useMemo(() => {
    if (!analysis) return [];
    
    return Object.entries(analysis.categoryAnalysis)
      .map(([category, data]) => ({
        key: category,
        category,
        count: data.count,
        totalValue: data.totalValue,
        totalCost: data.totalCost,
        realMargin: data.realMargin,
        avgOrderValue: data.totalValue / data.count,
        marginPercentage: data.totalValue > 0 ? (data.realMargin / data.totalValue * 100) : 0,
        materialCostRatio: data.materialCostRatio
      }))
      .sort((a, b) => b.totalValue - a.totalValue);
  }, [analysis]);

  return (
    <div style={{ padding: "24px" }}>
      <div style={{ marginBottom: 24 }}>
        <Title level={2}>Sonderbestellungen Analyse</Title>
        <Space style={{ marginTop: 16 }}>
          <DateRangeFilter
            value={dateRange}
            onChangeAction={setDateRange}
            storageKey="sonderbestellungen-range"
            isLoading={isLoading}
            label="Zeitraum"
          />
          <Radio.Group
            value={dataSource}
            onChange={(e) => setDataSource(e.target.value)}
            buttonStyle="solid"
            size="middle"
          >
            <Radio.Button value="orders">
              Auftragsvolumen
              <br />
              <Text type="secondary" style={{ fontSize: '11px' }}>
                (Bestelldatum)
              </Text>
            </Radio.Button>
            <Radio.Button value="sales">
              Umsatz
              <br />
              <Text type="secondary" style={{ fontSize: '11px' }}>
                (Auftragsdatum)
              </Text>
            </Radio.Button>
          </Radio.Group>
        </Space>
      </div>
      
      {/* Übersicht-KPIs */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={4}>
          <Card>
            <Statistic
              title="Gesamte Sonderbestellungen"
              value={analysis?.totalOrders || 0}
              loading={isLoading}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="Verkaufswert"
              value={analysis?.totalValue || 0}
              formatter={(value) => currency(Number(value))}
              loading={isLoading}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="Einkaufswert"
              value={analysis?.totalCost || 0}
              formatter={(value) => currency(Number(value))}
              loading={isLoading}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="Reale Marge"
              value={analysis?.totalMargin || 0}
              formatter={(value) => currency(Number(value))}
              loading={isLoading}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="Marge %"
              value={analysis?.marginPercentage || 0}
              formatter={(value) => `${Number(value).toFixed(1)}%`}
              loading={isLoading}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="Materialkostenquote %"
              value={analysis?.materialCostRatio || 0}
              formatter={(value) => `${Number(value).toFixed(1)}%`}
              loading={isLoading}
            />
          </Card>
        </Col>
      </Row>

      <Divider />

      {/* Produkthäufigkeit Tabelle */}
      <Card
        title="Basisprodukte für Sonderbestellungen (Häufigkeitsanalyse)"
        style={{ marginBottom: 24 }}
      >
        <Table
          dataSource={productFrequencyData}
          loading={isLoading}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          scroll={{ x: 1500 }}
        >
          <Table.Column
            title="Rang"
            key="rank"
            width={60}
            render={(_, __, index) => index + 1}
          />
          <Table.Column
            title="SKU"
            dataIndex="sku"
            key="sku"
            width={120}
            sorter={(a: any, b: any) => a.sku.localeCompare(b.sku)}
          />
          <Table.Column
            title="Produktname"
            dataIndex="productName"
            key="productName"
            width={200}
            sorter={(a: any, b: any) => a.productName.localeCompare(b.productName)}
          />
          <Table.Column
            title="Kategorie"
            dataIndex="room"
            key="room"
            width={120}
            sorter={(a: any, b: any) => a.room.localeCompare(b.room)}
          />
          <Table.Column
            title="Anzahl Bestellungen"
            dataIndex="count"
            key="count"
            width={140}
            sorter={(a: any, b: any) => a.count - b.count}
            render={(value) => <Text strong>{value}</Text>}
          />
          <Table.Column
            title="Verkaufswert"
            dataIndex="totalValue"
            key="totalValue"
            width={120}
            sorter={(a: any, b: any) => a.totalValue - b.totalValue}
            render={(value) => currency(value)}
          />
          <Table.Column
            title="Einkaufswert"
            dataIndex="totalCost"
            key="totalCost"
            width={120}
            sorter={(a: any, b: any) => a.totalCost - b.totalCost}
            render={(value) => currency(value)}
          />
          <Table.Column
            title="Ø Bestellwert"
            dataIndex="avgOrderValue"
            key="avgOrderValue"
            width={120}
            sorter={(a: any, b: any) => a.avgOrderValue - b.avgOrderValue}
            render={(value) => currency(value)}
          />
          <Table.Column
            title="Reale Marge"
            dataIndex="realMargin"
            key="realMargin"
            width={120}
            sorter={(a: any, b: any) => a.realMargin - b.realMargin}
            render={(value) => currency(value)}
          />
          <Table.Column
            title="Marge %"
            dataIndex="marginPercentage"
            key="marginPercentage"
            width={100}
            sorter={(a: any, b: any) => a.marginPercentage - b.marginPercentage}
            render={(value) => `${value.toFixed(1)}%`}
          />
          <Table.Column
            title="Materialkostenquote %"
            dataIndex="materialCostRatio"
            key="materialCostRatio"
            width={140}
            sorter={(a: any, b: any) => a.materialCostRatio - b.materialCostRatio}
            render={(value) => `${value.toFixed(1)}%`}
          />
        </Table>
      </Card>

      {/* Kategorieanalyse Tabelle */}
      <Card title="Marge je Sonderbestellungskategorie">
        <Table
          dataSource={categoryData}
          loading={isLoading}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          scroll={{ x: 1300 }}
        >
          <Table.Column
            title="Kategorie"
            dataIndex="category"
            key="category"
            width={150}
            sorter={(a: any, b: any) => a.category.localeCompare(b.category)}
            render={(value) => <Text strong>{value}</Text>}
          />
          <Table.Column
            title="Anzahl Bestellungen"
            dataIndex="count"
            key="count"
            width={140}
            sorter={(a: any, b: any) => a.count - b.count}
          />
          <Table.Column
            title="Verkaufswert"
            dataIndex="totalValue"
            key="totalValue"
            width={120}
            sorter={(a: any, b: any) => a.totalValue - b.totalValue}
            render={(value) => currency(value)}
          />
          <Table.Column
            title="Einkaufswert"
            dataIndex="totalCost"
            key="totalCost"
            width={120}
            sorter={(a: any, b: any) => a.totalCost - b.totalCost}
            render={(value) => currency(value)}
          />
          <Table.Column
            title="Ø Bestellwert"
            dataIndex="avgOrderValue"
            key="avgOrderValue"
            width={120}
            sorter={(a: any, b: any) => a.avgOrderValue - b.avgOrderValue}
            render={(value) => currency(value)}
          />
          <Table.Column
            title="Reale Marge"
            dataIndex="realMargin"
            key="realMargin"
            width={120}
            sorter={(a: any, b: any) => a.realMargin - b.realMargin}
            render={(value) => currency(value)}
          />
          <Table.Column
            title="Marge %"
            dataIndex="marginPercentage"
            key="marginPercentage"
            width={100}
            sorter={(a: any, b: any) => a.marginPercentage - b.marginPercentage}
            render={(value) => `${value.toFixed(1)}%`}
          />
          <Table.Column
            title="Materialkostenquote %"
            dataIndex="materialCostRatio"
            key="materialCostRatio"
            width={140}
            sorter={(a: any, b: any) => a.materialCostRatio - b.materialCostRatio}
            render={(value) => `${value.toFixed(1)}%`}
          />
        </Table>
      </Card>

      <Divider />

      {/* Alle Sonderbestellungen */}
      <Card title="Alle Sonderbestellungen (Detail)">
        <Table
          dataSource={specialOrdersData?.data || []}
          loading={isLoading}
          pagination={{ pageSize: 20, showSizeChanger: true }}
          scroll={{ x: 1600 }}
        >
          <Table.Column
            title="Erstellt"
            dataIndex="created_at"
            key="created_at"
            width={120}
            sorter={(a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()}
            render={(value) => new Date(value).toLocaleDateString('de-DE')}
          />
          <Table.Column
            title="Auftragsnummer"
            key="orderNumber"
            width={140}
            render={(_, record: SpecialOrderPosition) => 
              record.order?.bb_OrderNumber || 'N/A'
            }
          />
          <Table.Column
            title="Kunde"
            key="customer"
            width={180}
            render={(_, record: SpecialOrderPosition) => 
              record.order?.app_customers?.bb_Name || 'N/A'
            }
          />
          <Table.Column
            title="Basis-SKU"
            key="baseSku"
            width={120}
            render={(_, record: SpecialOrderPosition) => 
              record.base_model?.bb_sku || 'N/A'
            }
          />
          <Table.Column
            title="Sonder-SKU"
            key="specialSku"
            width={120}
            render={(_, record: SpecialOrderPosition) => 
              record.special_product?.bb_sku || 'N/A'
            }
          />
          <Table.Column
            title="Menge"
            dataIndex="qty_ordered"
            key="qty_ordered"
            width={80}
            sorter={(a: any, b: any) => a.qty_ordered - b.qty_ordered}
          />
          <Table.Column
            title="Nettopreis"
            dataIndex="unit_price_net"
            key="unit_price_net"
            width={120}
            sorter={(a: any, b: any) => a.unit_price_net - b.unit_price_net}
            render={(value) => currency(value)}
          />
          <Table.Column
            title="Gesamtwert"
            key="totalValue"
            width={120}
            sorter={(a: any, b: any) => 
              (a.unit_price_net * a.qty_ordered) - (b.unit_price_net * b.qty_ordered)
            }
            render={(_, record: SpecialOrderPosition) => 
              currency((record.unit_price_net || 0) * (record.qty_ordered || 1))
            }
          />
          <Table.Column
            title="Status"
            dataIndex="po_item_status"
            key="po_item_status"
            width={120}
            filters={[
              { text: 'Entwurf', value: 'draft' },
              { text: 'Bestellt', value: 'ordered' },
              { text: 'Bestätigt', value: 'confirmed' },
              { text: 'Erhalten', value: 'received' }
            ]}
            onFilter={(value, record) => record.po_item_status === value}
          />
          <Table.Column
            title="Notizen"
            dataIndex="internal_notes"
            key="internal_notes"
            width={200}
            ellipsis={true}
          />
        </Table>
      </Card>
    </div>
  );
}
