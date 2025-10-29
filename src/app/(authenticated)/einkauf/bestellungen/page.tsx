"use client";

import { List, useTable, EditButton, DeleteButton, useSelect, CreateButton } from "@refinedev/antd";  // oder Create, Edit, Show
import { Table, Space } from "antd";
import { Tables } from "@/types/supabase";
import { PoStatusTag, statusMap } from "@/components/common/tags/states/po";
import { ColumnFilterOption, ColumnMultiSelectFilter } from "@components/common/table/ColumnMultiSelectFilter";
import { formatCurrencyEUR } from "@utils/formats";

type Po = Tables<"app_purchase_orders">;
type Supplier = Tables<"app_suppliers">;

export default function EinkaufsBestellungenÜbersicht() {


  const { tableProps, sorters, filters } = useTable<Po>({
    resource: "app_purchase_orders_list_view",
    meta: { select: "*" },
    sorters: { initial: [{ field: "created_at", order: "desc" }], mode: "server" },
    filters: { initial: [{field: "status", operator: "ne", value: "delivered"}], mode: "server" },
    pagination: { pageSize: 20 },
    syncWithLocation: true,
  });

    

  const { selectProps: supplierSelectProps } = useSelect<Supplier>({
    resource: "app_suppliers",
    optionLabel: "id",
  });
  
  const statusOptions = Object.entries(statusMap).map(([value, { label }]) => ({
    label, 
    value, 
  }));

  return (
    <List title="Einkauf - Bestellungen"
      headerButtons={
        <CreateButton hideText/>
      }
    >
        <Table rowKey="id" {...tableProps} >
          <Table.Column title="Bestellnummer" dataIndex="order_number" sorter />
          <Table.Column title="Lieferant" dataIndex="supplier" 
            filterDropdown={(fp) => (
              <ColumnMultiSelectFilter {...fp} options={supplierSelectProps.options as ColumnFilterOption[]} placeholder="Lieferant wählen…" />
            )}
          />
          <Table.Column title="Status" dataIndex="status" 
            filterDropdown={(fp) => (
              <ColumnMultiSelectFilter {...fp} options={statusOptions as ColumnFilterOption[]} placeholder="Status wählen…" />
            )}
            render={(value) => <PoStatusTag status={value} />} sorter 
          />
          <Table.Column title="Rechnungsnummer" dataIndex="invoice_number" sorter 
          />
          <Table.Column title="Summe" dataIndex="items_amount_net_all" sorter render={(value, _) => formatCurrencyEUR(value)}/>
          <Table.Column title="Unbestätigte Skizzen" dataIndex="sketch_unconfirmed_cnt" sorter render={(value, _) => {
            if (value && value > 0) {
              return value;
            }
            return "-";
          }}/>
          <Table.Column title="Anmerkungen" dataIndex="internal_notes" />
          <Table.Column title="Aktionen" dataIndex="actions" render={(_, record) => (
            <Space>
              <EditButton hideText size="small" recordItemId={record.id} />
              <DeleteButton hideText size="small" recordItemId={record.id} disabled={!(record.status === "draft" || record.status === "ordered")} />
            </Space>
          )} />
        </Table>
    </List>
  );
}
