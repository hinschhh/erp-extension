"use client";

import { Collapse, Table, Radio, Space, Button, Typography, Statistic, Row, Col, Card } from "antd";
import { useTable } from "@refinedev/antd";
import { Tables } from "@/types/supabase";
import { render } from "react-dom";
import { useState, useMemo } from "react";
import { DownloadOutlined, BarChartOutlined } from "@ant-design/icons";

type Stock = Tables<"app_stocks">;
type StockLocation = Tables<"app_stock_locations">;

type Product = Tables<"app_products"> & {
    app_inventory_counts?: Array<Tables<"app_inventory_counts"> & { app_stocks: Stock | null; app_stock_locations: StockLocation | null }> | null;
    app_inventory_snapshots?: Array<Tables<"app_inventory_snapshots"> & { app_stocks: Stock | null }> | null;
};

type InventoryCount = Tables<"app_inventory_counts"> & { app_stocks: Stock | null; app_stock_locations: StockLocation | null };
type InventorySnapshot = Tables<"app_inventory_snapshots"> & { app_stocks: Stock | null };

interface CategoryData {
  category: string;
  products: Product[];
  subcategories: Map<string, Product[]>;
  totalCountedValue: number;
  totalSystemValue: number;
  totalCountedQty: number;
  totalSystemQty: number;
  totalDifference: number;
  totalDifferenceValue: number;
}

interface ProductCalculations {
  qtyCounted: number;
  qtySystem: number;
  valueCounted: number;
  valueSystem: number;
  difference: number;
  differenceValue: number;
}

export default function InventurPruefenPage() {
  const [showFilter, setShowFilter] = useState<'all' | 'withValue' | 'withDifference'>('all');
  const [expandedCategories, setExpandedCategories] = useState<string[]>([]);
  
  const { tableProps, sorters } = useTable<Product>({
    resource: "app_products",
    pagination: { mode: "off" },
    sorters: { initial: [{ field: "created_at", order: "desc" }] },
    filters: { permanent: [{ field: "bb_is_active", operator: "eq", value: true },{ field: "is_antique", operator: "eq", value: false },{ field: "bb_is_bom", operator: "eq", value: false },{ field: "is_variant_set", operator: "eq", value: false }, { field: "product_type", operator: "ne", value: "Service" }], mode: "server" },
    meta: {
      select: "id, bb_sku, supplier_sku, inventory_cagtegory, bb_category1, bb_is_active, is_antique, bb_is_bom, is_variant_set, product_type, bb_costnet, app_inventory_counts(*, app_stocks(*), app_stock_locations(*)), app_inventory_snapshots(*, app_stocks(*))",
    },
  });

  // Hilfsfunktion für Produktberechnungen
  const calculateProductValues = (product: Product): ProductCalculations => {
    const qtyCounted = product.app_inventory_counts?.reduce((acc: number, c: InventoryCount) => acc + ((c.qty_sellable || 0) + (c.qty_unsellable || 0)), 0) || 0;
    const qtySystem = product.app_inventory_snapshots?.reduce((acc: number, c: InventorySnapshot) => acc + ((c.bb_stock_current || 0) + (c.bb_unfullfilled_amount || 0)), 0) || 0;
    const costPrice = Number(product.bb_costnet) || 0;
    const valueCounted = qtyCounted * costPrice;
    const valueSystem = qtySystem * costPrice;
    const difference = qtyCounted - qtySystem;
    const differenceValue = difference * costPrice;

    return {
      qtyCounted,
      qtySystem,
      valueCounted,
      valueSystem,
      difference,
      differenceValue
    };
  };

  // CSV-Export Funktion
  const handleExportCSV = () => {
    const dataToExport = filteredProducts;
    
    // CSV Header
    const headers = [
      "BB SKU",
      "Inventurkategorie",
      "Gezählte Menge",
      "Gezählte Menge (nicht verkaufbar)",
      "Zählbestand (gesamt)",
      "Systembestand",
      "Differenz",
      "Differenz (Wert)",
      "Zählwert",
      "Systemwert",
      "Wertdifferenz"
    ];
    
    // CSV Rows
    const rows = dataToExport.map(product => {
      const calculations = calculateProductValues(product);
      const qtySellable = product.app_inventory_counts?.reduce((acc: number, c: InventoryCount) => acc + (c.qty_sellable || 0), 0) || 0;
      const qtyUnsellable = product.app_inventory_counts?.reduce((acc: number, c: InventoryCount) => acc + (c.qty_unsellable || 0), 0) || 0;
      
      return [
        product.bb_sku || "",
        product.inventory_cagtegory || "",
        qtySellable,
        qtyUnsellable,
        calculations.qtyCounted,
        calculations.qtySystem,
        calculations.difference,
        calculations.differenceValue.toFixed(2),
        calculations.valueCounted.toFixed(2),
        calculations.valueSystem.toFixed(2),
        (calculations.valueCounted - calculations.valueSystem).toFixed(2)
      ];
    });
    
    // CSV String erstellen
    const csvContent = [
      headers.join(";"),
      ...rows.map(row => row.join(";"))
    ].join("\n");
    
    // BOM für UTF-8 hinzufügen (für korrekte Darstellung in Excel)
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
    
    // Download auslösen
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `inventur_pruefung_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  



  const products = tableProps.dataSource || [];

  // Gruppiere Produkte nach Kategorien und berechne Werte
  const categoryData = useMemo(() => {
    const categoriesMap = new Map<string, CategoryData>();

    products.forEach(product => {
      const calculations = calculateProductValues(product);
      const category = product.inventory_cagtegory || 'Ohne Kategorie';
      const subcategory = product.bb_category1 || 'Ohne Subkategorie';

      if (!categoriesMap.has(category)) {
        categoriesMap.set(category, {
          category,
          products: [],
          subcategories: new Map(),
          totalCountedValue: 0,
          totalSystemValue: 0,
          totalCountedQty: 0,
          totalSystemQty: 0,
          totalDifference: 0,
          totalDifferenceValue: 0
        });
      }

      const catData = categoriesMap.get(category)!;
      catData.products.push(product);
      catData.totalCountedValue += calculations.valueCounted;
      catData.totalSystemValue += calculations.valueSystem;
      catData.totalCountedQty += calculations.qtyCounted;
      catData.totalSystemQty += calculations.qtySystem;
      catData.totalDifference += calculations.difference;
      catData.totalDifferenceValue += calculations.differenceValue;

      if (!catData.subcategories.has(subcategory)) {
        catData.subcategories.set(subcategory, []);
      }
      catData.subcategories.get(subcategory)!.push(product);
    });

    return categoriesMap;
  }, [products]);

  // Filter anwenden
  const filteredCategoryData = useMemo(() => {
    if (showFilter === 'all') return categoryData;

    const filtered = new Map<string, CategoryData>();
    
    categoryData.forEach((catData, categoryName) => {
      let filteredProducts: Product[];
      
      if (showFilter === 'withDifference') {
        filteredProducts = catData.products.filter(product => {
          const calculations = calculateProductValues(product);
          return calculations.difference !== 0;
        });
      } else if (showFilter === 'withValue') {
        filteredProducts = catData.products.filter(product => {
          const calculations = calculateProductValues(product);
          return !(calculations.qtyCounted === 0 && calculations.qtySystem === 0);
        });
      } else {
        filteredProducts = catData.products;
      }

      if (filteredProducts.length > 0) {
        const filteredSubcategories = new Map<string, Product[]>();
        filteredProducts.forEach(product => {
          const subcategory = product.bb_category1 || 'Ohne Subkategorie';
          if (!filteredSubcategories.has(subcategory)) {
            filteredSubcategories.set(subcategory, []);
          }
          filteredSubcategories.get(subcategory)!.push(product);
        });

        // Recalculate totals for filtered data
        let totalCountedValue = 0, totalSystemValue = 0, totalCountedQty = 0, totalSystemQty = 0, totalDifference = 0, totalDifferenceValue = 0;
        filteredProducts.forEach(product => {
          const calc = calculateProductValues(product);
          totalCountedValue += calc.valueCounted;
          totalSystemValue += calc.valueSystem;
          totalCountedQty += calc.qtyCounted;
          totalSystemQty += calc.qtySystem;
          totalDifference += calc.difference;
          totalDifferenceValue += calc.differenceValue;
        });

        filtered.set(categoryName, {
          ...catData,
          products: filteredProducts,
          subcategories: filteredSubcategories,
          totalCountedValue,
          totalSystemValue,
          totalCountedQty,
          totalSystemQty,
          totalDifference,
          totalDifferenceValue
        });
      }
    });

    return filtered;
  }, [categoryData, showFilter]);

  const filteredProducts = Array.from(filteredCategoryData.values()).flatMap(cat => cat.products);

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
            const locationsMap = new Map<string, { qtySellable: number; qtyUnsellable: number; systemStock: number; notes: string[] }>();
            
            data.counts.forEach(count => {
                const locationName = count.app_stock_locations?.name || 'Kein Lagerort';
                if (!locationsMap.has(locationName)) {
                    locationsMap.set(locationName, { qtySellable: 0, qtyUnsellable: 0, systemStock: 0, notes: [] });
                }
                const locationData = locationsMap.get(locationName)!;
                locationData.qtySellable += count.qty_sellable || 0;
                locationData.qtyUnsellable += count.qty_unsellable || 0;
                if (count.note && count.note.trim()) {
                    locationData.notes.push(count.note.trim());
                }
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
                    .map(([location, values]) => {
                        const noteText = values.notes.length > 0 ? values.notes.join(' | ') : '';
                        return {
                            key: location,
                            location: (
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <Typography.Text>{`  ${location}`}</Typography.Text>
                                    {noteText && <Typography.Text type="secondary" style={{ fontSize: '0.85em', marginLeft: '8px' }}>{`Anmerkung: ${noteText}`}</Typography.Text>}
                                </div>
                            ),
                            qtySellable: values.qtySellable,
                            qtyUnsellable: values.qtyUnsellable,
                            qtyTotal: values.qtySellable + values.qtyUnsellable,
                            systemStock: values.systemStock,
                            difference: (values.qtySellable + values.qtyUnsellable) - values.systemStock,
                        };
                    })
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
            const calculations = calculateProductValues(item);
            return calculations.qtyCounted;
        }
    },
    { 
        title: "Systembestand", 
        key: "system_stock",
        render: (item: Product) => {
            const calculations = calculateProductValues(item);
            return calculations.qtySystem;
        }
    },
    { title: "Differenz", key: "difference",
        sorter: (a: Product, b: Product) => {
            const calcA = calculateProductValues(a);
            const calcB = calculateProductValues(b);
            return calcA.difference - calcB.difference;
        },
        render: (item: Product) => {
            const calculations = calculateProductValues(item);
            return (
                <span style={{ 
                    fontWeight: calculations.difference !== 0 ? 'bold' : 'normal',
                    color: calculations.difference !== 0 ? '#ff4d4f' : 'inherit'
                }}>
                    {calculations.difference}
                </span>
            );
        }
     },
    { title: "Zählwert", key: "counted_value",
        sorter: (a: Product, b: Product) => {
            const calcA = calculateProductValues(a);
            const calcB = calculateProductValues(b);
            return calcA.valueCounted - calcB.valueCounted;
        },
        render: (item: Product) => {
            const calculations = calculateProductValues(item);
            return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(calculations.valueCounted);
        }
     },
    { title: "Systemwert", key: "system_value",
        sorter: (a: Product, b: Product) => {
            const calcA = calculateProductValues(a);
            const calcB = calculateProductValues(b);
            return calcA.valueSystem - calcB.valueSystem;
        },
        render: (item: Product) => {
            const calculations = calculateProductValues(item);
            return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(calculations.valueSystem);
        }
     },
    { title: "Wertdifferenz", key: "difference_value",
        sorter: (a: Product, b: Product) => {
            const calcA = calculateProductValues(a);
            const calcB = calculateProductValues(b);
            return calcA.differenceValue - calcB.differenceValue;
        },
        render: (item: Product) => {
            const calculations = calculateProductValues(item);
            
            return (
                <span style={{ 
                    fontWeight: calculations.differenceValue !== 0 ? 'bold' : 'normal',
                    color: calculations.differenceValue !== 0 ? '#ff4d4f' : 'inherit'
                }}>
                    {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(calculations.differenceValue)}
                </span>
            );
        }
     },
  ]


  // Gesamtstatistiken berechnen
  const totalStats = useMemo(() => {
    let totalCountedValue = 0, totalSystemValue = 0, totalCountedQty = 0, totalSystemQty = 0, totalDifferenceValue = 0;
    
    Array.from(filteredCategoryData.values()).forEach(catData => {
      totalCountedValue += catData.totalCountedValue;
      totalSystemValue += catData.totalSystemValue;
      totalCountedQty += catData.totalCountedQty;
      totalSystemQty += catData.totalSystemQty;
      totalDifferenceValue += catData.totalDifferenceValue;
    });
    
    return {
      totalCountedValue,
      totalSystemValue,
      totalCountedQty,
      totalSystemQty,
      totalDifferenceValue
    };
  }, [filteredCategoryData]);
  
  return (
      <>
        <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
          <Card>
            <Row gutter={16}>
              <Col span={6}>
                <Statistic
                  title="Zählwert (gesamt)"
                  value={totalStats.totalCountedValue}
                  precision={2}
                  suffix="€"
                  prefix={<BarChartOutlined />}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="Systemwert (gesamt)"
                  value={totalStats.totalSystemValue}
                  precision={2}
                  suffix="€"
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="Wertdifferenz"
                  value={totalStats.totalDifferenceValue}
                  precision={2}
                  suffix="€"
                  valueStyle={{ color: totalStats.totalDifferenceValue !== 0 ? '#ff4d4f' : '#3f8600' }}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="Kategorien"
                  value={filteredCategoryData.size}
                />
              </Col>
            </Row>
          </Card>
          
          <Space style={{ marginBottom: 16 }}>
            <span>Anzeige:</span>
            <Radio.Group 
              value={showFilter} 
              onChange={(e) => setShowFilter(e.target.value)}
            >
              <Radio.Button value="all">Alle Produkte</Radio.Button>
              <Radio.Button value="withValue">Mit Inventarwert</Radio.Button>
              <Radio.Button value="withDifference">Nur mit Differenz</Radio.Button>
            </Radio.Group>
            <Button 
              type="primary" 
              icon={<DownloadOutlined />}
              onClick={handleExportCSV}
            >
              CSV Export
            </Button>
          </Space>
        </Space>

        <Collapse
          size="small"
          onChange={(keys) => setExpandedCategories(keys as string[])}
          items={Array.from(filteredCategoryData.entries())
            .sort(([,a], [,b]) => Math.abs(b.totalDifferenceValue) - Math.abs(a.totalDifferenceValue))
            .map(([categoryName, catData]) => ({
              key: categoryName,
              label: (
                <Row style={{ width: '100%' }} align="middle">
                  <Col flex="auto">
                    <Typography.Text strong>{categoryName}</Typography.Text>
                  </Col>
                  <Col>
                    <Space size="large">
                      <Typography.Text>Produkte: {catData.products.length}</Typography.Text>
                      <Typography.Text>Zählwert: {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(catData.totalCountedValue)}</Typography.Text>
                      <Typography.Text>Systemwert: {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(catData.totalSystemValue)}</Typography.Text>
                      <Typography.Text 
                        style={{ 
                          fontWeight: catData.totalDifferenceValue !== 0 ? 'bold' : 'normal',
                          color: catData.totalDifferenceValue !== 0 ? '#ff4d4f' : 'inherit'
                        }}
                      >
                        Differenz: {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(catData.totalDifferenceValue)}
                      </Typography.Text>
                    </Space>
                  </Col>
                </Row>
              ),
              children: (
                <Collapse
                  size="small"
                  ghost
                  items={Array.from(catData.subcategories.entries())
                    .sort(([,a], [,b]) => {
                      const valueA = a.reduce((sum, p) => sum + calculateProductValues(p).differenceValue, 0);
                      const valueB = b.reduce((sum, p) => sum + calculateProductValues(p).differenceValue, 0);
                      return Math.abs(valueB) - Math.abs(valueA);
                    })
                    .map(([subcategoryName, subcatProducts]) => {
                      const subcatTotalCountedValue = subcatProducts.reduce((sum, p) => sum + calculateProductValues(p).valueCounted, 0);
                      const subcatTotalSystemValue = subcatProducts.reduce((sum, p) => sum + calculateProductValues(p).valueSystem, 0);
                      const subcatTotalDifferenceValue = subcatProducts.reduce((sum, p) => sum + calculateProductValues(p).differenceValue, 0);
                      
                      return {
                        key: `${categoryName}-${subcategoryName}`,
                        label: (
                          <Row style={{ width: '100%' }} align="middle">
                            <Col flex="auto">
                              <Typography.Text>{subcategoryName}</Typography.Text>
                            </Col>
                            <Col>
                              <Space size="large">
                                <Typography.Text>Produkte: {subcatProducts.length}</Typography.Text>
                                <Typography.Text>Zählwert: {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(subcatTotalCountedValue)}</Typography.Text>
                                <Typography.Text>Systemwert: {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(subcatTotalSystemValue)}</Typography.Text>
                                <Typography.Text 
                                  style={{ 
                                    fontWeight: subcatTotalDifferenceValue !== 0 ? 'bold' : 'normal',
                                    color: subcatTotalDifferenceValue !== 0 ? '#ff4d4f' : 'inherit'
                                  }}
                                >
                                  Differenz: {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(subcatTotalDifferenceValue)}
                                </Typography.Text>
                              </Space>
                            </Col>
                          </Row>
                        ),
                        children: (
                          <Table 
                            dataSource={subcatProducts}
                            columns={columns}
                            expandable={expandable}
                            rowKey="id"
                            pagination={false}
                            size="small"
                          />
                        )
                      };
                    })
                  }
                />
              )
            }))}
        />
      </>
    );
}