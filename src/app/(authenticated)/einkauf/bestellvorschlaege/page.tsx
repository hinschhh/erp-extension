"use client";

import React from 'react';
import { Table, Input, Layout, Spin } from "antd";
import { SyncAllButton } from '@components/sync-stock-button';
import { PageHeader } from "@refinedev/antd";
import { useTable, FilterDropdown } from '@refinedev/antd';
import { Component } from '@utils/interfaces';
import { createClient } from '@refinedev/supabase';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function PurchaseSuggestionsDashboard() {
  const { tableProps } = useTable<Component>({
    resource: "components_enriched",
  });

  const loading = tableProps.loading;

  return (
    <Layout>
      <PageHeader title="Bestellvorschläge" />
      <div style={{ padding: 24 }}>
        {loading ? <Spin /> : <></>}
      </div>

      <SyncAllButton />

      <Table 
        {...tableProps}
        rowKey="id"
      >
        <Table.Column 
          title="SKU" 
          dataIndex="sku" 
          key="sku" 
          filterDropdown={(props) => (
            <FilterDropdown {...props}>
              <Input
                placeholder="Filter SKU"
                value={props.selectedKeys[0]}
                onChange={e => props.setSelectedKeys(e.target.value ? [e.target.value] : [])}
                onPressEnter={() => props.confirm()}
                style={{ width: 188, marginBottom: 8, display: 'block' }}
              />
            </FilterDropdown>
          )}
          sorter={{multiple: 1}}
        />
        <Table.Column 
          title="Typ" 
          dataIndex="category" 
          key="category" 
          filterDropdown={(props) => (
            <FilterDropdown {...props}>
              <Input
                placeholder="Filter Typ"
                value={props.selectedKeys[0]}
                onChange={e => props.setSelectedKeys(e.target.value ? [e.target.value] : [])}
                onPressEnter={() => props.confirm()}
                style={{ width: 188, marginBottom: 8, display: 'block' }}
              />
            </FilterDropdown>
          )}
          sorter={{multiple: 1}}
          />
          <Table.Column 
          title="Lieferant" 
          dataIndex="manufacturer" 
          key="manufacturer"
          filterDropdown={(props) => (
            <FilterDropdown {...props}>
              <Input
                placeholder="Filter Lieferanten"
                value={props.selectedKeys[0]}
                onChange={e => props.setSelectedKeys(e.target.value ? [e.target.value] : [])}
                onPressEnter={() => props.confirm()}
                style={{ width: 188, marginBottom: 8, display: 'block' }}
              />
            </FilterDropdown>
          )}
          sorter={{multiple: 1}}
          />
        <Table.Column
  title="Verfügbarer Bestand"
  dataIndex="stock_available"
  key="stock_available"
  sorter={{ multiple: 1 }}
/>

<Table.Column
  title="Reservierter Bestand"
  dataIndex="reserved_stock"   // <- kommt aus der View
  key="reserved_stock"
  sorter={{ multiple: 2 }}
/>

<Table.Column
  title="Aktueller Lagerbestand"
  dataIndex="total_stock"      // <- kommt aus der View
  key="total_stock"
  sorter={{ multiple: 2 }}
/>

<Table.Column
  title="Verbrauch (3-Monats-Summe)"
  dataIndex="sold_3m_sum"      // <- kommt aus der View
  key="sold_3m_sum"
  sorter={{ multiple: 2 }}
/>

<Table.Column
  title="Aktualisiert am"
  dataIndex="updated_at"
  key="updated_at"
  sorter={{ multiple: 2 }}
  render={(_, record) => new Date(record.updated_at).toLocaleDateString("de-DE")}
/>

      </Table>
    </Layout>
  );
}