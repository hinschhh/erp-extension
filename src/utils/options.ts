// src/utils/options.ts
import type { ColumnFilterOption } from "@/components/common/table/ColumnMultiSelectFilter";

export const dedupeOptions = (opts: ColumnFilterOption[] = []) => {
  const seen = new Set<string>();
  return opts.filter((o) => {
    const val = o?.value;
    if (val === null || val === undefined || val === "") return false;
    const key = String(val);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
