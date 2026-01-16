// @/common/selects/state_po-item.tsx
"use client";

import { Select } from "antd";
import type { SelectProps } from "antd";
import { statusMap } from "@components/common/tags/states/po_item";

type Value = string;
type Props = Omit<SelectProps<Value>, "options" | "onChange" | "value"> & {
  value?: Value | null;
  onChange?: (value: Value | null) => void;
};

const disabledStatuses = ["draft"];

export default function SelectStatePoItem({ value, onChange, ...props }: Props) {
  const options = Object.entries(statusMap ?? {}).map(([val, cfg]) => ({
    value: val as Value,
    label: (
      <>
        <span style={{ marginRight: 6 }}>{cfg.icon}</span>
        {cfg.label}
      </>
    ),
    disabled: disabledStatuses.includes(val)
  }));

  return (
    <Select<Value>
      options={options}
      value={value ?? undefined} // AntD erwartet undefined statt null
      onChange={(v) => onChange?.(v ?? null)}
      placeholder="Status wählen"
      allowClear
      optionFilterProp="label"
      {...props}
    />
  );
}
