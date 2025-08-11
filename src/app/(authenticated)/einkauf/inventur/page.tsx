"use client";
import { useEffect, useState } from "react";
import { Table, Card } from "antd";
import { createClient } from "@supabase/supabase-js";

type Row = {
  month: string;
  ord: number;
  category: string;
  system_qty: number | null;
  manual_qty: number | null;
  inventory_qty: number;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function InventoryView() {
  const [data, setData] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("v_inventory_by_category")
        .select("*")
        .order("ord", { ascending: true });
      if (!error && data) setData(data as Row[]);
      setLoading(false);
    })();
  }, []);

  return (
    <Card title="Inventur nach Kategorie" size="small">
      <Table<Row>
        rowKey={(r) => r.category}
        loading={loading}
        dataSource={data}
        pagination={false}
      >
        <Table.Column<Row> title="Kategorie" dataIndex="category" key="category" />
        <Table.Column<Row>
          title="Systemwert"
          dataIndex="system_qty"
          key="system_qty"
          sorter={(a, b) => (a.system_qty ?? 0) - (b.system_qty ?? 0)}
          render={(v) => (v ?? 0).toLocaleString("de-DE")}
        />
        <Table.Column<Row>
          title="Manuell (Monat)"
          dataIndex="manual_qty"
          key="manual_qty"
          sorter={(a, b) => (a.manual_qty ?? 0) - (b.manual_qty ?? 0)}
          render={(v) => (v ?? 0).toLocaleString("de-DE")}
        />
        <Table.Column<Row>
          title="Inventurmenge"
          dataIndex="inventory_qty"
          key="inventory_qty"
          sorter={(a, b) => a.inventory_qty - b.inventory_qty}
          defaultSortOrder="descend"
          render={(v) => v.toLocaleString("de-DE")}
        />
      </Table>
    </Card>
  );
}
