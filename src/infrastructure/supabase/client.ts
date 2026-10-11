import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const viteEnv: Record<string, string | undefined> =
  (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {};
const supabaseUrl = String(viteEnv.VITE_SUPABASE_URL || "").trim();
const supabasePublishableKey = String(
  viteEnv.VITE_SUPABASE_PUBLISHABLE_KEY || "",
).trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

/**
 * Browser-safe Supabase client.
 *
 * IMPORTANT:
 * - Use ONLY the publishable key in Vite/browser code.
 * - Never put a Supabase secret key/service-role key in VITE_* variables.
 * - RLS remains the authorization boundary for browser queries.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export function requireSupabaseClient(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      "Supabase belum dikonfigurasi. Isi VITE_SUPABASE_URL dan VITE_SUPABASE_PUBLISHABLE_KEY di file .env.local.",
    );
  }

  return supabase;
}
