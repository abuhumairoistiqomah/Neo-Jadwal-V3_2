import type { Session, User } from "@supabase/supabase-js";
import { requireSupabaseClient } from "../supabase/client";

export type AppRole = "TEACHER" | "WAKASEK" | "ADMIN";

export interface CurrentUserContext {
  user: User;
  session: Session;
  displayName: string;
  teacherId: string | null;
  roles: AppRole[];
}

export interface SignInInput {
  email: string;
  password: string;
}

export async function signInWithPassword({ email, password }: SignInInput): Promise<Session> {
  const client = requireSupabaseClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });

  if (error) throw error;
  if (!data.session) throw new Error("Login berhasil tetapi session Supabase tidak tersedia.");

  return data.session;
}

export async function signOut(): Promise<void> {
  const client = requireSupabaseClient();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function getCurrentUserContext(): Promise<CurrentUserContext | null> {
  const client = requireSupabaseClient();
  const { data: sessionData, error: sessionError } = await client.auth.getSession();

  if (sessionError) throw sessionError;
  const session = sessionData.session;
  if (!session) return null;

  const userId = session.user.id;
  const [{ data: profile, error: profileError }, { data: roleRows, error: rolesError }] =
    await Promise.all([
      client
        .from("user_profiles")
        .select("display_name, teacher_id")
        .eq("user_id", userId)
        .maybeSingle(),
      client.from("user_roles").select("role").eq("user_id", userId),
    ]);

  if (profileError) throw profileError;
  if (rolesError) throw rolesError;

  const roles = (roleRows || [])
    .map((row: { role?: string | null }) => row.role)
    .filter((role: unknown): role is AppRole =>
      role === "TEACHER" || role === "WAKASEK" || role === "ADMIN",
    );

  return {
    user: session.user,
    session,
    displayName: String(profile?.display_name || session.user.email || "User"),
    teacherId: profile?.teacher_id ? String(profile.teacher_id) : null,
    roles,
  };
}
