import { isSupabaseConfigured, requireSupabaseClient } from "./client";

export interface SupabaseDiagnosticResult {
  configured: boolean;
  authenticated: boolean;
  userId: string | null;
  databaseReachable: boolean | null;
  detail: string;
}

/**
 * Lightweight staging diagnostic. It intentionally does not mutate data.
 *
 * If no user is signed in, databaseReachable remains null because V3.5 RLS
 * deliberately keeps operational tables closed to the anonymous role.
 */
export async function diagnoseSupabaseConnection(): Promise<SupabaseDiagnosticResult> {
  if (!isSupabaseConfigured) {
    return {
      configured: false,
      authenticated: false,
      userId: null,
      databaseReachable: null,
      detail: "Supabase environment variables belum diisi.",
    };
  }

  const client = requireSupabaseClient();
  const { data: sessionData, error: sessionError } = await client.auth.getSession();

  if (sessionError) {
    return {
      configured: true,
      authenticated: false,
      userId: null,
      databaseReachable: null,
      detail: `Auth session error: ${sessionError.message}`,
    };
  }

  const userId = sessionData.session?.user?.id || null;
  if (!userId) {
    return {
      configured: true,
      authenticated: false,
      userId: null,
      databaseReachable: null,
      detail: "Client configured. Belum ada user Supabase Auth yang login.",
    };
  }

  const { error: databaseError } = await client.from("teachers").select("id").limit(1);

  return {
    configured: true,
    authenticated: true,
    userId,
    databaseReachable: !databaseError,
    detail: databaseError
      ? `Authenticated, tetapi query teachers gagal: ${databaseError.message}`
      : "Authenticated dan query read-only ke database berhasil.",
  };
}
