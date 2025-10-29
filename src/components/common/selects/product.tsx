// @/common/selects/product.tsx
"use client";

import { Select } from "antd";
import type { SelectProps, DefaultOptionType } from "antd/es/select";
import { useSelect } from "@refinedev/antd";
import { Tables } from "@/types/supabase";

type Product = Tables<"app_products">;

type SelectProductProps = {
  value?: number | null;
  onChange?: (value: number | null) => void;
  filters?: Array<{
    field: string;
    operator:
      | "eq" | "ne" | "lt" | "gt" | "lte" | "gte"
      | "in" | "nin" | "ina" | "nina"
      | "contains" | "ncontains" | "containss" | "ncontainss"
      | "between" | "nbetween"
      | "null" | "nnull"
      | "startswith" | "nstartswith" | "endswith" | "nendswith"
      | "startswiths" | "nstartswiths" | "endswiths" | "nendswiths";
    value: any;
  }>;
};

export default function SelectProduct({ value, onChange, filters }: SelectProductProps) {
  const { selectProps } = useSelect<Product>({
    resource: "app_products",
    optionLabel: "bb_sku",
    optionValue: "id",                // id = number
    sorters: [{ field: "bb_sku", order: "asc" }],
    filters,
    // defaultValue hier weglassen -> wir steuern value selbst
  });

  // Optionen auf number casten – refine liefert DefaultOptionType
  const options = (selectProps.options ?? []) as Array<
    DefaultOptionType & { value: number }
  >;

  const filterOption: SelectProps<number>["filterOption"] = (input, option) =>
    String(option?.label ?? "").toLowerCase().includes(input.toLowerCase());

  return (
    <Select<number>
      options={options}
      loading={selectProps.loading}
      value={value ?? undefined}
      onChange={(v) => onChange?.(v ?? null)}
      allowClear
      showSearch
      placeholder="Produkt wählen"
      filterOption={filterOption}
      optionFilterProp="label"
    />
  );
}
