"use client";

import { Database } from "@/types/supabase";
import { Space, Card, List, Table, Spin } from "antd";
import { useList } from "@refinedev/core";
import { useTable } from "@refinedev/antd";
import { useMemo } from "react";

type productInventory = Database["public"]["Views"]["rpt_products_inventory_purchasing"];
type inventoryGroups = Database["public"]["Views"]["rpt_products_inventory_grouped"];

export default function InventarPage() {
    {/*const { data, isLoading } = useList({
      resource: "rpt_products_inventory_grouped",
      pagination: { mode: "off" }, // wir holen alles
    });

    // Gruppierung nach inventory_cagtegory_sort
    const grouped = useMemo(() => {
      if (!data?.data) return {};

      return data.data.reduce<Record<string, any[]>>((acc, row) => {
        const key = row.inventory_cagtegory_sort ?? "Unbekannt";
        if (!acc[key]) acc[key] = [];
        acc[key].push(row);
        return acc;
      }, {});
    }, [data]);

    if (isLoading) return <Spin size="large" />;*/}

    const { tableProps } = useTable<productInventory>({
        resource: "rpt_products_inventory_purchasing",
        filters: { initial: [{field: "inventory_cagtegory", operator:"ne", value: "Kein Inventar"}], mode: "server" },
        meta: { select: "*" },
        pagination: { pageSize: 100 },
    });


    return (
      <Space>
        {/*<List>
          <List.Item>
            <Card title={grouped[Object.keys(grouped)[0]]?.[0]?.inventory_cagtegory_sort || "Inventar"}>
              <Table {...tableProps} rowKey="product_id">
                <Table.Column title="SKU" dataIndex="sku" sorter />
                <Table.Column title="Kategorie" dataIndex="bb_category" sorter />
              </Table>
            </Card>
          </List.Item>
        </List>*/}
        <Table {...tableProps} rowKey="product_id">
          <Table.Column title="SKU" dataIndex="sku" sorter />
          <Table.Column title="Kategorie" dataIndex="bb_category" sorter />
          <Table.Column title="Lagergruppe" dataIndex="inventory_cagtegory" sorter />
          <Table.Column title="Lieferant" dataIndex="supplier" sorter />
        </Table>

      </Space>
    )

}