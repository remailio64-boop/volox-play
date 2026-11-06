import { createClient } from "@supabase/supabase-js";

// Accept values pasted as either a value or a complete .env assignment.
function envValue(value: string | undefined, name: string) {
  return value?.trim().replace(new RegExp(`^${name}\\s*=\\s*`), "").trim()
    .replace(/^(["'])(.*)\1$/, "$2").trim();
}

const url = envValue(import.meta.env.VITE_SUPABASE_URL, "VITE_SUPABASE_URL");
const key = envValue(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, "VITE_SUPABASE_PUBLISHABLE_KEY")
  || envValue(import.meta.env.VITE_SUPABASE_ANON_KEY, "VITE_SUPABASE_ANON_KEY");
if (!url || !key) throw new Error("Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env");
export const supabase = createClient(url, key);
