import { createClient } from "@supabase/supabase-js";
import { getCurrentUserContext } from "../auth/supabaseAuthRepository";
import { isSupabaseConfigured, requireSupabaseClient } from "./client";

export type SmokeStatus = "PASS" | "FAIL" | "SKIP";

export interface SmokeStepResult {
  id: string;
  label: string;
  status: SmokeStatus;
  detail: string;
}

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || "").trim();
const supabasePublishableKey = String(
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "",
).trim();

export async function probeAnonymousReadBlocked(): Promise<SmokeStepResult> {
  if (!isSupabaseConfigured) {
    return {
      id: "anonymous-read",
      label: "Anonymous read is blocked",
      status: "FAIL",
      detail: "Supabase environment variables belum dikonfigurasi.",
    };
  }

  const anonymousClient = createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const { error } = await anonymousClient.from("teachers").select("id").limit(1);

  if (error) {
    return {
      id: "anonymous-read",
      label: "Anonymous read is blocked",
      status: "PASS",
      detail: `Anon tidak bisa membaca teachers (${error.message}).`,
    };
  }

  return {
    id: "anonymous-read",
    label: "Anonymous read is blocked",
    status: "FAIL",
    detail: "Query anonymous ke teachers berhasil. Periksa grant/RLS sebelum lanjut.",
  };
}

export async function probeAuthenticatedContext(): Promise<SmokeStepResult> {
  const context = await getCurrentUserContext();

  if (!context) {
    return {
      id: "auth-context",
      label: "Authenticated session + profile",
      status: "FAIL",
      detail: "Belum ada session Supabase Auth yang aktif.",
    };
  }

  return {
    id: "auth-context",
    label: "Authenticated session + profile",
    status: "PASS",
    detail: `${context.displayName} • roles: ${context.roles.join(", ") || "(none)"}`,
  };
}

export async function probeAdminRole(): Promise<SmokeStepResult> {
  const client = requireSupabaseClient();
  const context = await getCurrentUserContext();

  if (!context) {
    return {
      id: "admin-role",
      label: "ADMIN role is recognized by RLS helper",
      status: "FAIL",
      detail: "Tidak ada user yang login.",
    };
  }

  const { data, error } = await client.rpc("current_user_has_role", {
    required_role: "ADMIN",
  });

  if (error) {
    return {
      id: "admin-role",
      label: "ADMIN role is recognized by RLS helper",
      status: "FAIL",
      detail: error.message,
    };
  }

  const appRoleHasAdmin = context.roles.includes("ADMIN");
  const dbHelperHasAdmin = data === true;

  return {
    id: "admin-role",
    label: "ADMIN role is recognized by RLS helper",
    status: appRoleHasAdmin && dbHelperHasAdmin ? "PASS" : "FAIL",
    detail: `Repository roles=${context.roles.join(", ") || "(none)"}; DB helper ADMIN=${String(data)}.`,
  };
}

export async function probeAuthenticatedReads(): Promise<SmokeStepResult> {
  const client = requireSupabaseClient();
  const tableNames = ["teachers", "classes", "rooms"] as const;
  const counts: string[] = [];

  for (const tableName of tableNames) {
    const { count, error } = await client
      .from(tableName)
      .select("*", { count: "exact", head: true });

    if (error) {
      return {
        id: "authenticated-reads",
        label: "Authenticated reference-data reads",
        status: "FAIL",
        detail: `${tableName}: ${error.message}`,
      };
    }

    counts.push(`${tableName}=${count ?? 0}`);
  }

  return {
    id: "authenticated-reads",
    label: "Authenticated reference-data reads",
    status: "PASS",
    detail: counts.join(" • "),
  };
}

export async function probeAdminWriteAndCleanup(): Promise<SmokeStepResult> {
  const client = requireSupabaseClient();
  const context = await getCurrentUserContext();

  if (!context) {
    return {
      id: "admin-write",
      label: "ADMIN write + cleanup",
      status: "FAIL",
      detail: "Tidak ada user yang login.",
    };
  }

  if (!context.roles.includes("ADMIN")) {
    return {
      id: "admin-write",
      label: "ADMIN write + cleanup",
      status: "SKIP",
      detail: "User aktif bukan ADMIN; destructive smoke probe dilewati.",
    };
  }

  // Staging-only probe. Any stale row from an interrupted previous run is removed first.
  await client.from("rooms").delete().like("id", "__SMOKE_TEST__%");

  const smokeId = `__SMOKE_TEST__${Date.now()}`;
  const { error: insertError } = await client.from("rooms").insert({
    id: smokeId,
    name: "E-Jadwal V3.5.1 Smoke Test",
    aliases: [],
    status: "ACTIVE",
  });

  if (insertError) {
    return {
      id: "admin-write",
      label: "ADMIN write + cleanup",
      status: "FAIL",
      detail: `Insert ditolak: ${insertError.message}`,
    };
  }

  const { error: deleteError } = await client.from("rooms").delete().eq("id", smokeId);

  if (deleteError) {
    return {
      id: "admin-write",
      label: "ADMIN write + cleanup",
      status: "FAIL",
      detail: `Insert berhasil, tetapi cleanup gagal untuk ${smokeId}: ${deleteError.message}`,
    };
  }

  return {
    id: "admin-write",
    label: "ADMIN write + cleanup",
    status: "PASS",
    detail: "Temporary room berhasil dibuat lalu dihapus. ADMIN write policy aktif.",
  };
}

export async function runSupabaseSmokeSuite(): Promise<SmokeStepResult[]> {
  const results: SmokeStepResult[] = [];

  results.push({
    id: "configuration",
    label: "Browser-safe Supabase configuration",
    status: isSupabaseConfigured ? "PASS" : "FAIL",
    detail: isSupabaseConfigured
      ? "Project URL + publishable key tersedia."
      : "VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY belum tersedia.",
  });

  results.push(await probeAnonymousReadBlocked());
  results.push(await probeAuthenticatedContext());
  results.push(await probeAdminRole());
  results.push(await probeAuthenticatedReads());
  results.push(await probeAdminWriteAndCleanup());

  return results;
}
