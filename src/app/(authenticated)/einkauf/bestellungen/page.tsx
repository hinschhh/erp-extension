"use client";

import { List, useTable, EditButton, DeleteButton, useSelect, CreateButton, ShowButton } from "@refinedev/antd";  // oder Create, Edit, Show
import { Table, Space, Input, Typography } from "antd";
import { Tables } from "@/types/supabase";
import { PoStatusTag, statusMap } from "@/components/common/tags/states/po";
import { ColumnFilterOption, ColumnMultiSelectFilter } from "@components/common/table/ColumnMultiSelectFilter";
import { formatCurrencyEUR } from "@utils/formats";
import dayjs from "dayjs";

type Po = Tables<"app_purchase_orders">;
type Supplier = Tables<"app_suppliers">;

export default function EinkaufsBestellungenÜbersicht() {


  const { tableProps, sorters, filters, setFilters } = useTable<Po>({
    resource: "app_purchase_orders",
    meta: { 
      select: `
        *,
        positions_normal:app_purchase_orders_positions_normal(qty_ordered, unit_price_net),
        positions_special:app_purchase_orders_positions_special(qty_ordered, unit_price_net)
      `
    },
    sorters: { initial: [{ field: "created_at", order: "desc" }], mode: "server" },
    filters: { mode: "server" },
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
  

  const handleSearch = (value: string) => {
    const otherFilters = (filters ?? []).filter((f) => 'field' in f && f.field !== "search_blob");

    if (!value) {
      // Suche leer → Filter entfernen
      setFilters(otherFilters, "replace");
      return;
    }
    
    // Filter auf search_blob setzen (ILIKE '%value%')
    setFilters(
      [
        ...otherFilters,
        {
          field: "search_blob",
          operator: "contains",
          value,
        } as const,
      ],
      "replace"
    );
  };

  return (
    <List title="Einkauf - Bestellungen"
      headerButtons={
        <>
          <Input.Search placeholder="Suchen…" style={{ width: 200 }} enterButton onSearch={handleSearch}/>
          <CreateButton hideText/>
        </>
      }
    >
        <Table rowKey="id" {...tableProps} >
          <Table.Column title="Bestellnummer" dataIndex="order_number" sorter />
          <Table.Column title="Bestellt am" dataIndex="ordered_at" sorter 
          render={(value, record) => <>{value ? new Date(value).toLocaleDateString() : ""}</>}
          
          />
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
          <Table.Column title="Bestellbestätigung" dataIndex="confirmation_number" sorter render={(value, record) => {
            return value ? 
              <Space direction="vertical" size={0}>
                <Typography.Text strong>{value}</Typography.Text>
                <Typography.Text type="secondary">{record?.confirmation_date ? dayjs(record.confirmation_date).format("DD.MM.YYYY") : "—"}</Typography.Text>
              </Space> : "-";            
          }} 
          />
          <Table.Column title="Rechnungsnummer" dataIndex="invoice_number" sorter render={(value, record) => {
            return value ? 
              <Space direction="vertical" size={0}>
                <Typography.Text strong>{value}</Typography.Text>
                <Typography.Text type="secondary">{record?.invoice_date ? dayjs(record.invoice_date).format("DD.MM.YYYY") : "—"}</Typography.Text>
              </Space> : "-";            
          }}
          />
          <Table.Column title="Summe" dataIndex="total_amount_net" sorter render={(_, record: any) => {
            const normalTotal = (record.positions_normal || []).reduce((sum: number, pos: any) => 
              sum + (Number(pos.qty_ordered) * Number(pos.unit_price_net)), 0
            );
            const specialTotal = (record.positions_special || []).reduce((sum: number, pos: any) => 
              sum + (Number(pos.qty_ordered) * Number(pos.unit_price_net)), 0
            );
            return formatCurrencyEUR(normalTotal + specialTotal);
          }}/>
          <Table.Column title="Unbestätigte Skizzen" dataIndex="sketch_unconfirmed_cnt" sorter render={(value, _) => {
            if (value && value > 0) {
              return value;
            }
            return "-";
          }}/>
          <Table.Column title="Anmerkungen" dataIndex="notes" render={(value) => <Typography.Paragraph ellipsis={{ rows: 5, expandable: true, symbol: 'mehr' }}>{value}</Typography.Paragraph>  } />
          <Table.Column title="Aktionen" dataIndex="actions" render={(_, record) => (
            <Space>
              <ShowButton hideText size="small" recordItemId={record.id} />
              <EditButton hideText size="small" recordItemId={record.id} />
              <DeleteButton hideText size="small" recordItemId={record.id} disabled={!(record.status === "draft" || record.status === "ordered")} />
            </Space>
          )} />
        </Table>
    </List>
  );
}
