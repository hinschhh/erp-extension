// Kleine Helfer zum Laden von Select-Optionen (Supplier, Produkte)
// ────────────────────────────────────────────────────────────────────────────────
import { supabaseBrowserClient } from "@/utils/supabase/client";


export type Option = { label: string; value: string | number };


