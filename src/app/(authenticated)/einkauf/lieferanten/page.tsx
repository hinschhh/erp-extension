"use client";
import { List, EditButton, CreateButton, useTable } from "@refinedev/antd";
import { Table, Tag } from "antd";

type Supplier = {
  id: string; name: string; short_code?: string|null; email?: string|null;
  phone?: string|null; default_currency: string; active: boolean;
};

export default function SuppliersListPage() {
  const { tableProps } = useTable<Supplier>({
    resource: "app_suppliers",
    initialSorter: [{ field: "name", order: "asc" }],
    syncWithLocation: true,
  });

  return (
    <List title="Lieferanten"
      headerButtons={<CreateButton onClick={()=>location.assign("/einkauf/lieferanten/anlegen")} />}>
      <Table {...tableProps} rowKey="id">
        <Table.Column dataIndex="name" title="Name" />
        <Table.Column dataIndex="short_code" title="Kürzel" />
        <Table.Column dataIndex="email" title="E-Mail" />
        <Table.Column dataIndex="phone" title="Telefon" />
        <Table.Column dataIndex="default_currency" title="Währung" />
        <Table.Column title="Status" render={(_, r: Supplier)=> <Tag color={r.active?"green":"default"}>{r.active?"aktiv":"inaktiv"}</Tag>} />
        <Table.Column title="Aktionen" render={(_, r: Supplier)=>
          <EditButton hideText size="small" onClick={()=>location.assign(`/einkauf/lieferanten/bearbeiten/${r.id}`)} />
        }/>
      </Table>
    </List>
  );
}
