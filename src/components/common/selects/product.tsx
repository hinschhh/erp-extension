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
  /**
   * Statische Filter, die IMMER angewendet werden (z.B. supplier).
   */
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
    optionValue: "id", // id ist number
    sorters: [{ field: "bb_sku", order: "asc" }],

    // kleine Seiten -> schnelle Antwort; mehr Treffer durch Suche
    pagination: { current: 1, pageSize: 1000 },

    // Eingabe entprellen, um Requests zu sparen
    debounce: 300,

    // Falls du initial einen Wert hast, sicherstellen, dass dieser Wert geladen wird
    defaultValueQueryOptions: {
      enabled: true,
    },
  });

  // refine liefert DefaultOptionType; wir casten value -> number
  const options = (selectProps.options ?? []) as Array<
    DefaultOptionType & { value: number }
  >;

  return (
    <Select<number>
      // serverseitige Suche aktivieren
      showSearch
      filterOption={false}
      // refine stellt onSearch bereit – einfach durchreichen
      onSearch={selectProps.onSearch}
      // Optionen + Ladezustand aus useSelect
      options={options}
      loading={selectProps.loading}
      virtual
      allowClear
      placeholder="Produkt wählen"
      // controlled value
      value={value ?? undefined}
      onChange={(v) => onChange?.(v ?? null)}
    />
  );
}
