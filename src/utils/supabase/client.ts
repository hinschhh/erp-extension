import { createBrowserClient } from "@supabase/ssr";
import { Database } from "../../types/supabase";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

export const supabaseBrowserClient = createBrowserClient<Database>(
  SUPABASE_URL,
  SUPABASE_KEY,
  {
    db: {
      schema: "public",
    },
  }
);
