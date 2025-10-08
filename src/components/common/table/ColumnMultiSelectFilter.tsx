"use client";
import React from "react";
import { Select, Space, Button } from "antd";
import type { FilterDropdownProps as AntdFilterDropdownProps, FilterConfirmProps } from "antd/es/table/interface";

export type ColumnFilterOption = { label: string; value: string | number };

type Props = AntdFilterDropdownProps & {
  options: ColumnFilterOption[];
  placeholder?: string;
  width?: number;
};

export const ColumnMultiSelectFilter: React.FC<Props> = ({ options, placeholder = "Werte wählen…", width = 300, ...fp }) => {
  const apply = () => fp.confirm({ closeDropdown: true } as FilterConfirmProps);
  const reset = () => { fp.clearFilters?.(); fp.confirm({ closeDropdown: true } as FilterConfirmProps); };

    return (
        <div style={{ padding: 8, width }}>
        <Select
            mode="multiple"
            allowClear
            showSearch
            placeholder={placeholder}
            options={options}
            value={fp.selectedKeys as (string | number)[]}
            onChange={(vals) => fp.setSelectedKeys(vals as React.Key[])}
            onInputKeyDown={(e) => { if (e.key === "Enter") apply(); }}
            onClear={reset}
            style={{ width: "100%" }}
            optionFilterProp="label"
            maxTagCount="responsive"
        />
        <Space style={{ marginTop: 8 }}>
            <Button type="primary" onClick={apply}>Filtern</Button>
            <Button onClick={reset}>Zurücksetzen</Button>
        </Space>
        </div>
  );
};

ColumnMultiSelectFilter.displayName = "ColumnMultiSelectFilter";
