import { requireSupabaseClient } from "../supabase/client";

export type MasterGender = "IKHWAN" | "AKHWAT" | "UNKNOWN";

export interface AdminTeacherRow {
  id: string;
  full_name: string;
  short_name: string | null;
  gender: MasterGender;
  whatsapp_e164: string | null;
  primary_subjects_text: string | null;
  subject_cluster: string | null;
  levels_text: string | null;
  additional_task: string | null;
  notes: string | null;
  legacy_name: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface AdminClassRow {
  id: string;
  code: string;
  display_name: string;
  gender: MasterGender;
  grade_level: number | null;
  program: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface AdminRoomRow {
  id: string;
  name: string;
  aliases: string[];
  capacity: number | null;
  location: string | null;
  room_type: string | null;
  status: "ACTIVE" | "INACTIVE";
  created_at?: string;
  updated_at?: string;
}

export interface TeacherWriteInput {
  full_name: string;
  short_name?: string | null;
  gender?: MasterGender;
  whatsapp_e164?: string | null;
  primary_subjects_text?: string | null;
  subject_cluster?: string | null;
  levels_text?: string | null;
  additional_task?: string | null;
  notes?: string | null;
  is_active?: boolean;
}

export interface ClassWriteInput {
  code: string;
  display_name: string;
  gender?: MasterGender;
  grade_level?: number | null;
  program?: string | null;
  is_active?: boolean;
}

export interface RoomWriteInput {
  id: string;
  name: string;
  aliases?: string[];
  capacity?: number | null;
  location?: string | null;
  room_type?: string | null;
  status?: "ACTIVE" | "INACTIVE";
}

function nullIfBlank(value: unknown): string | null {
  const clean = String(value ?? "").trim();
  return clean ? clean : null;
}

export function normalizeWhatsappE164(raw: unknown): string | null {
  let digits = String(raw ?? "").replace(/[^0-9]/g, "");
  if (!digits) return null;
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  if (!digits.startsWith("62")) {
    throw new Error("Nomor WhatsApp Indonesia harus diawali 08, 62, atau +62.");
  }
  if (digits.length < 10 || digits.length > 15) {
    throw new Error("Format nomor WhatsApp tidak valid.");
  }
  return `+${digits}`;
}

export class AdminMasterDataRepository {
  async listAll(): Promise<{ teachers: AdminTeacherRow[]; classes: AdminClassRow[]; rooms: AdminRoomRow[] }> {
    const client = requireSupabaseClient();
    const [teacherResult, classResult, roomResult] = await Promise.all([
      client.from("teachers").select("*").order("is_active", { ascending: false }).order("full_name"),
      client.from("classes").select("*").order("is_active", { ascending: false }).order("display_name"),
      client.from("rooms").select("*").order("status", { ascending: true }).order("name"),
    ]);
    if (teacherResult.error) throw teacherResult.error;
    if (classResult.error) throw classResult.error;
    if (roomResult.error) throw roomResult.error;
    return {
      teachers: (teacherResult.data || []) as AdminTeacherRow[],
      classes: (classResult.data || []) as AdminClassRow[],
      rooms: (roomResult.data || []) as AdminRoomRow[],
    };
  }

  async createTeacher(input: TeacherWriteInput): Promise<void> {
    const client = requireSupabaseClient();
    const payload = {
      full_name: String(input.full_name || "").trim(),
      short_name: nullIfBlank(input.short_name),
      gender: input.gender || "UNKNOWN",
      whatsapp_e164: normalizeWhatsappE164(input.whatsapp_e164),
      primary_subjects_text: nullIfBlank(input.primary_subjects_text),
      subject_cluster: nullIfBlank(input.subject_cluster),
      levels_text: nullIfBlank(input.levels_text),
      additional_task: nullIfBlank(input.additional_task),
      notes: nullIfBlank(input.notes),
      is_active: input.is_active !== false,
    };
    if (!payload.full_name) throw new Error("Nama lengkap guru wajib diisi.");
    const { error } = await client.from("teachers").insert(payload);
    if (error) throw error;
  }

  async updateTeacher(id: string, input: TeacherWriteInput): Promise<void> {
    const client = requireSupabaseClient();
    const payload = {
      full_name: String(input.full_name || "").trim(),
      short_name: nullIfBlank(input.short_name),
      gender: input.gender || "UNKNOWN",
      whatsapp_e164: normalizeWhatsappE164(input.whatsapp_e164),
      primary_subjects_text: nullIfBlank(input.primary_subjects_text),
      subject_cluster: nullIfBlank(input.subject_cluster),
      levels_text: nullIfBlank(input.levels_text),
      additional_task: nullIfBlank(input.additional_task),
      notes: nullIfBlank(input.notes),
      is_active: input.is_active !== false,
    };
    if (!payload.full_name) throw new Error("Nama lengkap guru wajib diisi.");
    const { error } = await client.from("teachers").update(payload).eq("id", id);
    if (error) throw error;
  }

  async setTeacherActive(id: string, active: boolean): Promise<void> {
    const client = requireSupabaseClient();
    const { error } = await client.from("teachers").update({ is_active: active }).eq("id", id);
    if (error) throw error;
  }

  async createClass(input: ClassWriteInput): Promise<void> {
    const client = requireSupabaseClient();
    const payload = {
      code: String(input.code || "").trim().toUpperCase(),
      display_name: String(input.display_name || "").trim(),
      gender: input.gender || "UNKNOWN",
      grade_level: input.grade_level ?? null,
      program: nullIfBlank(input.program),
      is_active: input.is_active !== false,
    };
    if (!payload.code || !payload.display_name) throw new Error("Kode dan nama kelas wajib diisi.");
    const { error } = await client.from("classes").insert(payload);
    if (error) throw error;
  }

  async updateClass(id: string, input: ClassWriteInput): Promise<void> {
    const client = requireSupabaseClient();
    const payload = {
      code: String(input.code || "").trim().toUpperCase(),
      display_name: String(input.display_name || "").trim(),
      gender: input.gender || "UNKNOWN",
      grade_level: input.grade_level ?? null,
      program: nullIfBlank(input.program),
      is_active: input.is_active !== false,
    };
    if (!payload.code || !payload.display_name) throw new Error("Kode dan nama kelas wajib diisi.");
    const { error } = await client.from("classes").update(payload).eq("id", id);
    if (error) throw error;
  }

  async setClassActive(id: string, active: boolean): Promise<void> {
    const client = requireSupabaseClient();
    const { error } = await client.from("classes").update({ is_active: active }).eq("id", id);
    if (error) throw error;
  }

  async createRoom(input: RoomWriteInput): Promise<void> {
    const client = requireSupabaseClient();
    const payload = {
      id: String(input.id || "").trim().toUpperCase().replace(/\s+/g, "_"),
      name: String(input.name || "").trim(),
      aliases: input.aliases || [],
      capacity: input.capacity ?? null,
      location: nullIfBlank(input.location),
      room_type: nullIfBlank(input.room_type),
      status: input.status || "ACTIVE",
    };
    if (!payload.id || !payload.name) throw new Error("ID dan nama ruangan wajib diisi.");
    const { error } = await client.from("rooms").insert(payload);
    if (error) throw error;
  }

  async updateRoom(id: string, input: RoomWriteInput): Promise<void> {
    const client = requireSupabaseClient();
    const payload = {
      name: String(input.name || "").trim(),
      aliases: input.aliases || [],
      capacity: input.capacity ?? null,
      location: nullIfBlank(input.location),
      room_type: nullIfBlank(input.room_type),
      status: input.status || "ACTIVE",
    };
    if (!payload.name) throw new Error("Nama ruangan wajib diisi.");
    const { error } = await client.from("rooms").update(payload).eq("id", id);
    if (error) throw error;
  }

  async setRoomActive(id: string, active: boolean): Promise<void> {
    const client = requireSupabaseClient();
    const { error } = await client.from("rooms").update({ status: active ? "ACTIVE" : "INACTIVE" }).eq("id", id);
    if (error) throw error;
  }
}
