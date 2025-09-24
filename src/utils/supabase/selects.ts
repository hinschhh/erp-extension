// Kleine Helfer zum Laden von Select-Optionen (Supplier, Produkte)
// ────────────────────────────────────────────────────────────────────────────────
import { supabaseBrowserClient } from "@/utils/supabase/client";


export type Option = { label: string; value: string | number };


export async function fetchSupplierOptions(search?: string): Promise<Option[]> {
const supabase = supabaseBrowserClient;
let q = supabase.from("app_suppliers").select("id,name").eq("active", true).limit(50);
if (search) {
q = q.ilike("name", `%${search}%`);
}
const { data, error } = await q;
if (error) throw error;
return (data ?? []).map((r) => ({ label: r.name ?? r.id, value: r.id }));
}


export async function fetchBillbeeProductOptions(search?: string): Promise<Option[]> {
const supabase = supabaseBrowserClient;
let q = supabase
.from("ref_billbee_products_mirror")
.select("billbee_product_id, sku, name")
.eq("is_active", true)
.limit(50);
if (search) {
// Suche über SKU oder Name
q = q.or(`sku.ilike.%${search}%,name.ilike.%${search}%`);
}
const { data, error } = await q;
if (error) throw error;
return (data ?? []).map((r) => ({
label: `${r.sku ?? "–"} — ${r.name ?? r.billbee_product_id}`,
value: r.billbee_product_id,
}));
}