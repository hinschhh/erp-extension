"use client";

import React, { useMemo } from "react";
import { Button, Table } from "antd";
import { useExport } from "@refinedev/core";
import { ExportButton, Show, useTable } from "@refinedev/antd";
import { ExportOutlined, UploadOutlined } from "@ant-design/icons";

type InventoryRow = {
    session_id: number | null;
    fk_stocks: number | null;
    fk_products: number | null;
    stock_location: string | null;

    bb_sku: string | null;
    product_type: string | null;
    inventory_category: string | null;

    snapshot_qty_sellable: string | number | null;
    snapshot_qty_unsellable: string | number | null;
    counted_qty_sellable: string | number | null;
    counted_qty_unsellable: string | number | null;
    diff_qty_sellable: string | number | null;
    diff_qty_unsellable: string | number | null;
};

type ProductGroup = {
    key: string;
    fk_products: number | null;
    bb_sku: string | null;
    product_type: string | null;
    inventory_category: string | null;

    snapshot_qty_sellable: number;
    snapshot_qty_unsellable: number;
    counted_qty_sellable: number;
    counted_qty_unsellable: number;
    diff_qty_sellable: number;
    diff_qty_unsellable: number;

    rows: InventoryRow[];
};

const toNumber = (value: string | number | null | undefined): number => {
    if (value === null || value === undefined) return 0;
    if (typeof value === "number") return value;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? 0 : parsed;
};

export default function InventurPruefenPage() {
    const { tableProps } = useTable<InventoryRow>({
        resource: "view_inventory_stock_level_comparison",
        pagination: { mode: "off" },
        meta: { select: "*" },
        filters: {
            initial: [],
            mode: "server",
        },
    });

    const { triggerExport, isLoading: exportLoading } = useExport();

    const groupedData: ProductGroup[] = useMemo(() => {
        const source = (tableProps.dataSource ?? []) as InventoryRow[];
        const map = new Map<string, ProductGroup>();

        for (const row of source) {
            const key = String(row.fk_products ?? row.bb_sku ?? "unknown");

            if (!map.has(key)) {
                map.set(key, {
                    key,
                    fk_products: row.fk_products ?? null,
                    bb_sku: row.bb_sku ?? null,
                    product_type: row.product_type ?? null,
                    inventory_category: row.inventory_category ?? null,
                    snapshot_qty_sellable: 0,
                    snapshot_qty_unsellable: 0,
                    counted_qty_sellable: 0,
                    counted_qty_unsellable: 0,
                    diff_qty_sellable: 0,
                    diff_qty_unsellable: 0,
                    rows: [],
                });
            }

            const group = map.get(key)!;
            group.rows.push(row);

            group.snapshot_qty_sellable += toNumber(row.snapshot_qty_sellable);
            group.snapshot_qty_unsellable += toNumber(row.snapshot_qty_unsellable);
            group.counted_qty_sellable += toNumber(row.counted_qty_sellable);
            group.counted_qty_unsellable += toNumber(row.counted_qty_unsellable);
            group.diff_qty_sellable += toNumber(row.diff_qty_sellable);
            group.diff_qty_unsellable += toNumber(row.diff_qty_unsellable);
        }

        return Array.from(map.values());
    }, [tableProps.dataSource]);

    return (
        <Show
            title="Inventurdifferenzen prüfen"
            headerButtons={
                <>
                    <Button icon={<UploadOutlined />} type="primary">
                        Abschließen
                    </Button>
                    <ExportButton
                        onClick={triggerExport}
                        loading={exportLoading}
                        icon={<ExportOutlined />}
                    />
                </>
            }
        >
                        <Table<ProductGroup>
                            dataSource={groupedData}
                            rowKey={(record) => record.key}
                            pagination={false}
                            expandable={{
                                expandedRowRender: (record) => (
                                    <Table<InventoryRow>
                                        dataSource={record.rows}
                                        pagination={false}
                                        size="small"
                                        rowKey={(row) =>
                                            `${row.session_id ?? "n"}-${row.fk_stocks ?? "s"}-${
                                                row.stock_location ?? "loc"
                                            }`
                                        }
                                    >
                                        <Table.Column<InventoryRow>
                                            title="Lager (ID)"
                                            dataIndex="fk_stocks"
                                            key="fk_stocks"
                                        />
                                        <Table.Column<InventoryRow>
                                            title="Lagerort / Region"
                                            dataIndex="stock_location"
                                            key="stock_location"
                                        />
                                        <Table.Column<InventoryRow>
                                            title="Snapshot: Verkäuflich"
                                            dataIndex="snapshot_qty_sellable"
                                            key="snapshot_qty_sellable"
                                        />
                                        <Table.Column<InventoryRow>
                                            title="Snapshot: Unverkäuflich"
                                            dataIndex="snapshot_qty_unsellable"
                                            key="snapshot_qty_unsellable"
                                        />
                                        <Table.Column<InventoryRow>
                                            title="Gezählt: Verkäuflich"
                                            dataIndex="counted_qty_sellable"
                                            key="counted_qty_sellable"
                                        />
                                        <Table.Column<InventoryRow>
                                            title="Gezählt: Unverkäuflich"
                                            dataIndex="counted_qty_unsellable"
                                            key="counted_qty_unsellable"
                                        />
                                        <Table.Column<InventoryRow>
                                            title="Differenz (Verkäuflich)"
                                            dataIndex="diff_qty_sellable"
                                            key="diff_qty_sellable"
                                        />
                                        <Table.Column<InventoryRow>
                                            title="Differenz (Unverkäuflich)"
                                            dataIndex="diff_qty_unsellable"
                                            key="diff_qty_unsellable"
                                        />
                                    </Table>
                                ),
                            }}
                        >
                <Table.Column<ProductGroup>
                    title="SKU"
                    dataIndex="bb_sku"
                    key="bb_sku"
                />
                <Table.Column<ProductGroup>
                    title="Produkttyp"
                    dataIndex="product_type"
                    key="product_type"
                />
                <Table.Column<ProductGroup>
                    title="Inventarkategorie"
                    dataIndex="inventory_category"
                    key="inventory_category"
                />
                <Table.Column<ProductGroup>
                    title="Verkäuflich (Snapshot gesamt)"
                    dataIndex="snapshot_qty_sellable"
                    key="snapshot_qty_sellable"
                />
                <Table.Column<ProductGroup>
                    title="Unverkäuflich (Snapshot gesamt)"
                    dataIndex="snapshot_qty_unsellable"
                    key="snapshot_qty_unsellable"
                />
                <Table.Column<ProductGroup>
                    title="Verkäuflich (gezählt gesamt)"
                    dataIndex="counted_qty_sellable"
                    key="counted_qty_sellable"
                />
                <Table.Column<ProductGroup>
                    title="Unverkäuflich (gezählt gesamt)"
                    dataIndex="counted_qty_unsellable"
                    key="counted_qty_unsellable"
                />
                <Table.Column<ProductGroup>
                    title="Differenz (Verkäuflich gesamt)"
                    dataIndex="diff_qty_sellable"
                    key="diff_qty_sellable"
                />
                <Table.Column<ProductGroup>
                    title="Differenz (Unverkäuflich gesamt)"
                    dataIndex="diff_qty_unsellable"
                    key="diff_qty_unsellable"
                />
            </Table>
        </Show>
    );
}
