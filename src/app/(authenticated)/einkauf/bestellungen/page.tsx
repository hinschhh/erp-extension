"use client";

import { List, useTable, FilterDropdown, EditButton, ShowButton, DeleteButton, useSelect } from "@refinedev/antd";  // oder Create, Edit, Show
import { Table, Tag, Select, Space } from "antd";
import { useMany } from "@refinedev/core";
import { Tables } from "@/types/supabase";
import {default as dayjs} from "dayjs";

type Po = Tables<"app_purchase_orders">;
type Supplier = Tables<"app_suppliers">;

export default function EinkaufsBestellungenÜbersicht() {

  const { tableProps, setFilters, setSorters } = useTable<Po>({
    resource: "app_purchase_orders",
    meta: { select: "*,app_suppliers(name)" },
    sorters: { initial: [{ field: "ordered_at", order: "desc" }], mode: "server" },
    pagination: { pageSize: 100 },
    filters: { mode: "server" },
  })

  const supplierIds = tableProps?.dataSource?.map((item) => item.supplier).filter((id): id is string => id !== null) ?? [];


  const {
    data: suppliersData,
    isLoading: suppliersLoading,
  } = useMany<Supplier>({
    resource: "app_suppliers",
    ids: supplierIds,
    queryOptions: {
      enabled: supplierIds.length > 0,
    },
  });

  const { selectProps: supplierSelectProps } = useSelect<Supplier>({
    resource: "app_suppliers",
    optionLabel: "id",
    optionValue: "id",
  });

    const getStatusColor = (status: string) => {
    const statusColors: Record<string, string> = {
      draft: "default",
      ordered: "blue",
      proforma_confirmed: "cyan",
      sketch_confirmed: "purple",
      in_production: "orange",
      shipped: "gold",
      received: "green",
      cancelled: "red",
    };
    return statusColors[status] || "default";
  };

  return (
    <List title="Beispiel-Liste">
      <Table {...tableProps} rowKey="id">
        <Table.Column dataIndex="order_number" title="Order Number" sorter width={150} />

        <Table.Column
          dataIndex="supplier_id"
          title="Supplier"
          render={(value) => {
            if (suppliersLoading) {
              return <div>Loading...</div>;
            }
            const supplier = suppliersData?.data.find((item: Supplier) => item.id === value);
            return <div>{supplier?.id || "-"}</div>;
          }}
          filterDropdown={(props) => (
            <FilterDropdown {...props}>
              <Select
                style={{ minWidth: 200 }}
                mode="multiple"
                placeholder="Select Supplier"
                {...supplierSelectProps}
              />
            </FilterDropdown>
          )}
        />

        <Table.Column
          dataIndex="status"
          title="Status"
          render={(value: string) => (
            <Tag color={getStatusColor(value)}>{value?.replace(/_/g, " ").toUpperCase() || "-"}</Tag>
          )}
          width={150}
          sorter
          filterDropdown={(props) => (
            <FilterDropdown {...props}>
              <Select
                style={{ minWidth: 200 }}
                mode="multiple"
                placeholder="Select Status"
                options={[
                  { label: "Draft", value: "draft" },
                  { label: "Ordered", value: "ordered" },
                  { label: "Proforma Confirmed", value: "proforma_confirmed" },
                  { label: "Sketch Confirmed", value: "sketch_confirmed" },
                  { label: "In Production", value: "in_production" },
                  { label: "Shipped", value: "shipped" },
                  { label: "Received", value: "received" },
                  { label: "Cancelled", value: "cancelled" },
                ]}
              />
            </FilterDropdown>
          )}
        />

        <Table.Column dataIndex="qty_ordered_total" title="Qty Ordered" align="right" width={120} />

        <Table.Column dataIndex="qty_received_total" title="Qty Received" align="right" width={120} />

        <Table.Column dataIndex="qty_open_total" title="Qty Open" align="right" width={120} />

        <Table.Column
          dataIndex="shipping_cost_net"
          title="Shipping Cost"
          align="right"
          render={(value: number) => <div>{value ? `€${value.toFixed(2)}` : "-"}</div>}
          width={130}
        />

        <Table.Column
          dataIndex="ordered_at"
          title="Ordered At"
          render={(value: string) => (value ? dayjs(value).format("YYYY-MM-DD") : "-")}
          sorter
          width={130}
        />

        <Table.Column
          dataIndex="dol_planned_at"
          title="DOL Planned"
          render={(value: string) => (value ? dayjs(value).format("YYYY-MM-DD") : "-")}
          width={130}
        />

        <Table.Column
          title="Actions"
          dataIndex="actions"
          fixed="right"
          width={150}
          render={(_, record: Po) => (
            <Space>
              <EditButton hideText size="small" recordItemId={record.id} />
              <DeleteButton hideText size="small" recordItemId={record.id} />
            </Space>
          )}
        />
      </Table>
    </List>
  );
}
