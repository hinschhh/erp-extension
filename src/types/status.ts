import type { Database } from "@/types/supabase";

export type PoItemStatus = Database["public"]["Enums"]["po_item_status"]; // "draft" | "ordered" | ...

export const PO_ITEM_ALL_STATUSES: readonly PoItemStatus[] = [
  "draft",
  "ordered",
  "confirmed",
  "in_production",
  "delivered",
  "paused",
  "cancelled",
] as const;

export const PO_ITEM_MENU_STATUSES: readonly PoItemStatus[] = [
  "confirmed",
  "in_production",
  "delivered",
  "paused",
  "cancelled",
] as const; // im Menü nur operative Stati
