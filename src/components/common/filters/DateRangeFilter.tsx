// src/components/common/filters/DateRangeFilter.tsx
"use client";

import { DatePicker, Space, Typography } from "antd";
import type { RangePickerProps } from "antd/es/date-picker";
import dayjs, { Dayjs } from "dayjs";
import { useEffect, useState } from "react";

const { RangePicker } = DatePicker;

export type RangeValue = [Dayjs | null, Dayjs | null] | null;

type Props = {
  value: RangeValue;
  onChangeAction: (range: RangeValue) => void;
  storageKey?: string;
  isLoading?: boolean;
  format?: string;
  label?: string;
  showLoadingState?: boolean;
};

/**
 * DateRangeFilter - Reusable date range picker with localStorage persistence
 * 
 * @example
 * ```tsx
 * const [range, setRange] = useState<RangeValue>(null);
 * 
 * <DateRangeFilter
 *   value={range}
 *   onChangeAction={setRange}
 *   storageKey="my-report-range"
 *   isLoading={isLoadingData}
 *   label="Berichtszeitraum"
 * />
 * ```
 */
export function DateRangeFilter({
  value,
  onChangeAction,
  storageKey,
  isLoading = false,
  format = "DD.MM.YYYY",
  label = "Zeitraum",
  showLoadingState = true,
}: Props) {
  const [initialized, setInitialized] = useState(false);

  // Initialize from localStorage on mount
  useEffect(() => {
    if (!storageKey || initialized) return;

    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed && Array.isArray(parsed) && parsed.length === 2) {
            const restoredRange: RangeValue = [
              parsed[0] ? dayjs(parsed[0]) : null,
              parsed[1] ? dayjs(parsed[1]) : null,
            ];
            onChangeAction(restoredRange);
            setInitialized(true);
            return;
          }
        } catch {
          // Ignore parse errors
        }
      }

      // Default: last 30 days if no stored value
      const end = dayjs().endOf("day");
      const start = dayjs().subtract(30, "day").startOf("day");
      onChangeAction([start, end]);
      setInitialized(true);
    }
  }, [storageKey, initialized, onChangeAction]);

  // Persist to localStorage whenever value changes
  useEffect(() => {
    if (!storageKey || !value) return;

    if (value && value[0] && value[1]) {
      localStorage.setItem(
        storageKey,
        JSON.stringify([value[0].toISOString(), value[1].toISOString()])
      );
    }
  }, [value, storageKey]);

  const handleChange: RangePickerProps["onChange"] = (values) => {
    if (!values) {
      onChangeAction(null);
      return;
    }
    const [start, end] = values;
    onChangeAction([start?.startOf("day") ?? null, end?.endOf("day") ?? null]);
  };

  return (
    <Space align="center" size="middle">
      <Typography.Text strong>{label}</Typography.Text>
      <RangePicker
        value={value as any}
        onChange={handleChange}
        allowClear
        format={format}
      />
      {showLoadingState && (
        <Typography.Text type="secondary">
          {isLoading ? "Lädt…" : "Aktualisiert"}
        </Typography.Text>
      )}
    </Space>
  );
}
