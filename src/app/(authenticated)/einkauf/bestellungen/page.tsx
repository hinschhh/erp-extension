"use client";

import React from "react";
import { List, useTable, EditButton, DeleteButton, useSelect, CreateButton, ShowButton } from "@refinedev/antd";  // oder Create, Edit, Show
import { Table, Space, Input, Typography } from "antd";
import { Tables } from "@/types/supabase";
import { PoStatusTag, statusMap } from "@/components/common/tags/states/po";
import { PoItemStatusTag } from "@/components/common/tags/states/po_item";
import { ColumnFilterOption, ColumnMultiSelectFilter } from "@components/common/table/ColumnMultiSelectFilter";
import { formatCurrencyEUR } from "@utils/formats";
import dayjs from "dayjs";

type Po = Tables<"app_purchase_orders">;
type Supplier = Tables<"app_suppliers">;

export default function EinkaufsBestellungenÜbersicht() {

  const [searchValue, setSearchValue] = React.useState<string>("");

  const { tableProps, sorters, filters, setFilters } = useTable<Po>({
    resource: "app_purchase_orders",
    meta: { 
      select: `
        *,
        positions_normal:app_purchase_orders_positions_normal(
          id, 
          billbee_product_id, 
          qty_ordered, 
          unit_price_net, 
          internal_notes, 
          fk_app_orders_id, 
          fk_app_order_items_id,
          po_item_status,
          app_products!inner(bb_sku, supplier_sku),
          app_orders(bb_OrderNumber, app_customers(bb_Name))
        ),
        positions_special:app_purchase_orders_positions_special(
          id, 
          billbee_product_id, 
          base_model_billbee_product_id, 
          qty_ordered, 
          unit_price_net, 
          supplier_sku, 
          internal_notes, 
          fk_app_orders_id, 
          fk_app_order_items_id,
          po_item_status,
          app_orders(bb_OrderNumber, app_customers(bb_Name))
        )
      `
    },
    sorters: { initial: [{ field: "created_at", order: "desc" }], mode: "server" },
    filters: { mode: "server" },
    pagination: { pageSize: 100 },
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
    setSearchValue(value);
  };

  // Clientseitige Filterung nach Kundenname, SKU und Bestellnummer
  const filteredDataSource = React.useMemo(() => {
    if (!searchValue || !tableProps.dataSource) return tableProps.dataSource;

    const searchLower = searchValue.toLowerCase();
    return tableProps.dataSource.filter((record: any) => {
      // Prüfe, ob irgendeine Position einen Kunden mit passendem Namen, SKU oder Bestellnummer hat
      return [
        ...(record.positions_normal || []),
        ...(record.positions_special || []),
      ].some((pos: any) => {
        const customerName = pos.app_orders?.app_customers?.bb_Name;
        const orderNumber = pos.app_orders?.bb_OrderNumber;
        const billbeeSku = pos.app_products?.bb_sku || pos.billbee_product_id;
        
        return (
          (customerName && String(customerName).toLowerCase().includes(searchLower)) ||
          (orderNumber && String(orderNumber).toLowerCase().includes(searchLower)) ||
          (billbeeSku && String(billbeeSku).toLowerCase().includes(searchLower))
        );
      });
    });
  }, [searchValue, tableProps.dataSource]);

  const expandables = {
    expandedRowRender: (record: any) => {
      const normalPositions = record.positions_normal || [];
      const specialPositions = record.positions_special || [];
      const allPositions = [
        ...normalPositions.map((p: any) => ({
          ...p,
          type: 'normal',
          bb_sku: p.app_products?.bb_sku,
          supplier_sku: p.app_products?.supplier_sku,
          order_number: p.app_orders?.bb_OrderNumber,
          customer_name: p.app_orders?.app_customers?.bb_Name,
        })),
        ...specialPositions.map((p: any) => ({
          ...p,
          type: 'special',
          bb_sku: p.billbee_product_id,
          supplier_sku: p.supplier_sku,
          order_number: p.app_orders?.bb_OrderNumber,
          customer_name: p.app_orders?.app_customers?.bb_Name,
        })),
      ];

      return (
        <Table
          dataSource={allPositions}
          rowKey="id"
          pagination={false}
          size="small"
        >
          <Table.Column title="Typ" dataIndex="type" width={100}
            render={(value) => value === 'normal' ? 'Standard' : 'Sonder'}
          />
          <Table.Column title="Billbee SKU" dataIndex="bb_sku" width={150} />
          <Table.Column title="Lieferanten-SKU" dataIndex="supplier_sku" width={150} />
          <Table.Column title="Menge" dataIndex="qty_ordered" width={100} />
          <Table.Column title="Einzelpreis" dataIndex="unit_price_net" width={120}
            render={(value) => formatCurrencyEUR(value)}
          />
          <Table.Column title="Gesamt" width={120}
            render={(_, p: any) => formatCurrencyEUR(p.qty_ordered * p.unit_price_net)}
          />
          <Table.Column title="Kundenbestellung" width={200}
            render={(_, p: any) => {
              if (!p.order_number) return '—';
              return (
                <Space direction="vertical" size={0}>
                  <Typography.Text strong>{p.order_number}</Typography.Text>
                  <Typography.Text type="secondary">{p.customer_name || '—'}</Typography.Text>
                </Space>
              );
            }}
          />
          <Table.Column title="Status" dataIndex="po_item_status" width={150}
            render={(value) => value ? <PoItemStatusTag status={value} /> : '—'}
          />
        </Table>
      );
    },
    rowExpandable: (record: any) => 
      (record.positions_normal && record.positions_normal.length > 0) ||
      (record.positions_special && record.positions_special.length > 0),
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
        <Table 
          rowKey="id" 
          {...tableProps}
          dataSource={filteredDataSource}
          expandable={expandables}
        >
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
          <Table.Column title="Auftragsbestätigung" dataIndex="confirmation_number" sorter render={(value, record) => {
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
