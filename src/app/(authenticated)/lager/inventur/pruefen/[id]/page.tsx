"use client";

import { Collapse, Table, Radio, Space } from "antd";
import { useTable } from "@refinedev/antd";
import { Tables } from "@/types/supabase";
import { render } from "react-dom";
import { useState } from "react";

type Stock = Tables<"app_stocks">;
type StockLocation = Tables<"app_stock_locations">;

type Product = Tables<"app_products"> & {
    app_inventory_counts?: Array<Tables<"app_inventory_counts"> & { app_stocks: Stock | null; app_stock_locations: StockLocation | null }> | null;
    app_inventory_snapshots?: Array<Tables<"app_inventory_snapshots"> & { app_stocks: Stock | null }> | null;
};

type InventoryCount = Tables<"app_inventory_counts"> & { app_stocks: Stock | null; app_stock_locations: StockLocation | null };
type InventorySnapshot = Tables<"app_inventory_snapshots"> & { app_stocks: Stock | null };

export default function InventurPruefenPage() {
  const [showOnlyDifferences, setShowOnlyDifferences] = useState(false);
  
  const { tableProps, sorters } = useTable<Product>({
    resource: "app_products",
    pagination: { mode: "off" },
    sorters: { initial: [{ field: "created_at", order: "desc" }] },
    filters: { permanent: [{ field: "bb_is_active", operator: "eq", value: true },{ field: "is_antique", operator: "eq", value: false },{ field: "bb_is_bom", operator: "eq", value: false },{ field: "is_variant_set", operator: "eq", value: false }, { field: "product_type", operator: "ne", value: "Service" }], mode: "server" },
    meta: {
      select: "id, bb_sku, supplier_sku, inventory_cagtegory, bb_is_active, is_antique, bb_is_bom, is_variant_set, product_type, bb_net_purchase_price, app_inventory_counts(*, app_stocks(*), app_stock_locations(*)), app_inventory_snapshots(*, app_stocks(*))",
    },
  });

  



  const products = tableProps.dataSource || [];
  
  // Filter anwenden
  const filteredProducts = showOnlyDifferences 
    ? products.filter(product => {
        const qtyCounted = (product.app_inventory_counts?.reduce((acc: number, c: InventoryCount) => acc + ((c.qty_sellable || 0) + (c.qty_unsellable || 0)), 0) || 0);
        const systemStock = (product.app_inventory_snapshots?.reduce((acc: number, c: InventorySnapshot) => acc + ((c.bb_stock_current || 0) + (c.bb_unfullfilled_amount || 0)), 0) || 0);
        return qtyCounted !== systemStock;
      })
    : products;

  console.log(products);

  const expandable ={
    expandedRowRender: (record: Product) => {
        const inventoryCounts = record.app_inventory_counts || [];
        const inventorySnapshots = record.app_inventory_snapshots || [];
        
        // Nach Lager gruppieren
        const stocksMap = new Map<number, { name: string; counts: InventoryCount[]; snapshots: InventorySnapshot[] }>();
        
        inventoryCounts.forEach(count => {
            const stockId = count.fk_stocks;
            const stockName = count.app_stocks?.bb_Name || `Lager ${stockId}`;
            
            if (!stocksMap.has(stockId)) {
                stocksMap.set(stockId, { name: stockName, counts: [], snapshots: [] });
            }
            stocksMap.get(stockId)!.counts.push(count);
        });
        
        inventorySnapshots.forEach(snapshot => {
            const stockId = snapshot.fk_stocks;
            const stockName = snapshot.app_stocks?.bb_Name || `Lager ${stockId}`;
            
            if (!stocksMap.has(stockId)) {
                stocksMap.set(stockId, { name: stockName, counts: [], snapshots: [] });
            }
            stocksMap.get(stockId)!.snapshots.push(snapshot);
        });
        
        // Items für Collapse erstellen
        // Lager nach ID sortieren für konsistente Reihenfolge
        const sortedStocks = Array.from(stocksMap.entries()).sort((a, b) => a[0] - b[0]);
        
        const items = sortedStocks.map(([stockId, data]) => {
            // Nach Lagerort (stock_location) gruppieren
            const locationsMap = new Map<string, { qtySellable: number; qtyUnsellable: number; systemStock: number }>();
            
            data.counts.forEach(count => {
                const locationName = count.app_stock_locations?.name || 'Kein Lagerort';
                if (!locationsMap.has(locationName)) {
                    locationsMap.set(locationName, { qtySellable: 0, qtyUnsellable: 0, systemStock: 0 });
                }
                const locationData = locationsMap.get(locationName)!;
                locationData.qtySellable += count.qty_sellable || 0;
                locationData.qtyUnsellable += count.qty_unsellable || 0;
            });
            
            // Aggregierte Werte für das gesamte Lager berechnen
            const totalQtySellable = data.counts.reduce((acc, c) => acc + (c.qty_sellable || 0), 0);
            const totalQtyUnsellable = data.counts.reduce((acc, c) => acc + (c.qty_unsellable || 0), 0);
            const totalSystemStock = data.snapshots.reduce((acc, s) => acc + ((s.bb_stock_current || 0) + (s.bb_unfullfilled_amount || 0)), 0);
            const totalDifference = (totalQtySellable + totalQtyUnsellable) - totalSystemStock;
            
            // Lagerorte alphabetisch sortieren, 'Kein Lagerort' ans Ende
            const sortedLocations = Array.from(locationsMap.entries()).sort((a, b) => {
                if (a[0] === 'Kein Lagerort') return 1;
                if (b[0] === 'Kein Lagerort') return -1;
                return a[0].localeCompare(b[0]);
            });
            
            // Tabellendaten: erst aggregierte Zeile, dann Lagerorte (nur wenn sie tatsächlich Daten haben)
            const tableData = [
                {
                    key: 'total',
                    location: <strong>{data.name} (Gesamt)</strong>,
                    qtySellable: <strong>{totalQtySellable}</strong>,
                    qtyUnsellable: <strong>{totalQtyUnsellable}</strong>,
                    qtyTotal: <strong>{totalQtySellable + totalQtyUnsellable}</strong>,
                    systemStock: <strong>{totalSystemStock}</strong>,
                    difference: <strong>{totalDifference}</strong>,
                },
                ...sortedLocations
                    .filter(([location, values]) => 
                        // Zeige 'Kein Lagerort' nur, wenn tatsächlich Werte vorhanden sind
                        location !== 'Kein Lagerort' || 
                        values.qtySellable > 0 || 
                        values.qtyUnsellable > 0
                    )
                    .map(([location, values]) => ({
                        key: location,
                        location: `  ${location}`,
                        qtySellable: values.qtySellable,
                        qtyUnsellable: values.qtyUnsellable,
                        qtyTotal: values.qtySellable + values.qtyUnsellable,
                        systemStock: values.systemStock,
                        difference: (values.qtySellable + values.qtyUnsellable) - values.systemStock,
                    }))
            ];
            
            const nestedColumns = [
                { dataIndex: 'location', key: 'location', width: '25%' },
                { dataIndex: 'qtySellable', key: 'qtySellable', width: '15%', align: 'right' as const },
                { dataIndex: 'qtyUnsellable', key: 'qtyUnsellable', width: '15%', align: 'right' as const },
                { dataIndex: 'qtyTotal', key: 'qtyTotal', width: '15%', align: 'right' as const },
                { dataIndex: 'systemStock', key: 'systemStock', width: '15%', align: 'right' as const },
                { dataIndex: 'difference', key: 'difference', width: '15%', align: 'right' as const },
            ];
            
            return {
                key: stockId.toString(),
                label: (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                        <span>{data.name}</span>
                        <span style={{ display: 'flex', gap: '20px', fontSize: '0.9em', color: '#666' }}>
                            <span>Verkaufbar: {totalQtySellable}</span>
                            <span>Nicht verkaufbar: {totalQtyUnsellable}</span>
                            <span>Zählbestand: {totalQtySellable + totalQtyUnsellable}</span>
                            <span>System: {totalSystemStock}</span>
                            <span style={{ fontWeight: totalDifference !== 0 ? 'bold' : 'normal', color: totalDifference !== 0 ? '#ff4d4f' : 'inherit' }}>
                                Diff: {totalDifference}
                            </span>
                        </span>
                    </div>
                ),
                children: (
                    <Table
                        dataSource={tableData}
                        columns={nestedColumns}
                        pagination={false}
                        showHeader={false}
                        size="small"
                        style={{ marginLeft: '32px' }}
                    />
                ),
            };
        });
        
        return (
            <>
                <Collapse
                    items={items}
                    style={{ marginLeft: "32px"}} 
                />
            </>
        );
    }
  }

  const columns = [
    { title: "BB SKU", dataIndex: "bb_sku", key: "bb_sku" },
    { title: "Inventurkategorie", dataIndex: "inventory_cagtegory", key: "inventory_cagtegory" },
    { 
        title: "Gezählte Menge", 
        key: "qty_sellable", 
        render: (item: Product) => {
                const qty_sellable_per_product = item.app_inventory_counts?.reduce((acc: number, c: InventoryCount) => acc + (c.qty_sellable || 0), 0);
                return(qty_sellable_per_product || 0);
            } 
    },
    { 
        title: "Gezählte Menge (nicht verkaufbar)", 
        key: "qty_unsellable",  
        render: (item: Product) => {
            const qty_unsellable_per_product = item.app_inventory_counts?.reduce((acc: number, c: InventoryCount) => acc + (c.qty_unsellable || 0), 0);
            return qty_unsellable_per_product || 0;
        }
    },
    { 
        title: "Zählbestand (gesamt)", 
        key: "qty_total",  
        render: (item: Product) => {
            const qty_sellable = item.app_inventory_counts?.reduce((acc: number, c: InventoryCount) => acc + (c.qty_sellable || 0), 0) || 0;
            const qty_unsellable = item.app_inventory_counts?.reduce((acc: number, c: InventoryCount) => acc + (c.qty_unsellable || 0), 0) || 0;
            return qty_sellable + qty_unsellable;
        }
    },
    { 
        title: "Systembestand", 
        key: "system_stock",
        render: (item: Product) => {
            const system_stock = item.app_inventory_snapshots?.reduce((acc: number, c: InventorySnapshot) => acc + ((c.bb_stock_current || 0) + (c.bb_unfullfilled_amount || 0)), 0);
            return(system_stock);
        }
    },
    { title: "Differenz", key: "difference",
        sorter: (a: Product, b: Product) => {
            const diffA = (a.app_inventory_counts?.reduce((acc: number, c: InventoryCount) => acc + ((c.qty_sellable || 0) + (c.qty_unsellable || 0)), 0) || 0) - (a.app_inventory_snapshots?.reduce((acc: number, c: InventorySnapshot) => acc + ((c.bb_stock_current || 0) + (c.bb_unfullfilled_amount || 0)), 0) || 0);
            const diffB = (b.app_inventory_counts?.reduce((acc: number, c: InventoryCount) => acc + ((c.qty_sellable || 0) + (c.qty_unsellable || 0)), 0) || 0) - (b.app_inventory_snapshots?.reduce((acc: number, c: InventorySnapshot) => acc + ((c.bb_stock_current || 0) + (c.bb_unfullfilled_amount || 0)), 0) || 0);
            return diffA - diffB;
        },
        render: (item: Product) => {
            const difference = (item.app_inventory_counts?.reduce((acc: number, c: InventoryCount) => acc + ((c.qty_sellable || 0) + (c.qty_unsellable || 0)), 0) || 0) - (item.app_inventory_snapshots?.reduce((acc: number, c: InventorySnapshot) => acc + ((c.bb_stock_current || 0) + (c.bb_unfullfilled_amount || 0)), 0) || 0);
            return (
                <span style={{ 
                    fontWeight: difference !== 0 ? 'bold' : 'normal',
                    color: difference !== 0 ? '#ff4d4f' : 'inherit'
                }}>
                    {difference}
                </span>
            );
        }
     },
    { title: "Differenz (Wert)", key: "difference_value",
        sorter: (a: Product, b: Product) => {
            const diffA = (a.app_inventory_counts?.reduce((acc: number, c: InventoryCount) => acc + ((c.qty_sellable || 0) + (c.qty_unsellable || 0)), 0) || 0) - (a.app_inventory_snapshots?.reduce((acc: number, c: InventorySnapshot) => acc + ((c.bb_stock_current || 0) + (c.bb_unfullfilled_amount || 0)), 0) || 0);
            const diffB = (b.app_inventory_counts?.reduce((acc: number, c: InventoryCount) => acc + ((c.qty_sellable || 0) + (c.qty_unsellable || 0)), 0) || 0) - (b.app_inventory_snapshots?.reduce((acc: number, c: InventorySnapshot) => acc + ((c.bb_stock_current || 0) + (c.bb_unfullfilled_amount || 0)), 0) || 0);
            const valueA = diffA * (Number(a.bb_net_purchase_price) || 0);
            const valueB = diffB * (Number(b.bb_net_purchase_price) || 0);
            return valueA - valueB;
        },
        render: (item: Product) => {
            const difference = (item.app_inventory_counts?.reduce((acc: number, c: InventoryCount) => acc + ((c.qty_sellable || 0) + (c.qty_unsellable || 0)), 0) || 0) - (item.app_inventory_snapshots?.reduce((acc: number, c: InventorySnapshot) => acc + ((c.bb_stock_current || 0) + (c.bb_unfullfilled_amount || 0)), 0) || 0);
            const purchasePrice = Number(item.bb_net_purchase_price) || 0;
            const differenceValue = difference * purchasePrice;
            
            return (
                <span style={{ 
                    fontWeight: differenceValue !== 0 ? 'bold' : 'normal',
                    color: differenceValue !== 0 ? '#ff4d4f' : 'inherit'
                }}>
                    {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(differenceValue)}
                </span>
            );
        }
     },
  ]


  
  return (
      <>
        <Space style={{ marginBottom: 16 }}>
          <span>Anzeige:</span>
          <Radio.Group 
            value={showOnlyDifferences} 
            onChange={(e) => setShowOnlyDifferences(e.target.value)}
          >
            <Radio.Button value={false}>Alle Produkte</Radio.Button>
            <Radio.Button value={true}>Nur mit Differenz</Radio.Button>
          </Radio.Group>
        </Space>
        <Table 
          {...tableProps}
          dataSource={filteredProducts}
          columns={columns}
          expandable={expandable}
          rowKey="id"
        />
      </>
    );
}