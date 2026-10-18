import { requireSupabaseClient } from "../supabase/client";

export interface OperationalTeacherRow {
  id: string;
  full_name: string;
  short_name?: string | null;
  gender?: string | null;
  is_active: boolean;
}

export interface OperationalClassRow {
  id: string;
  code: string;
  display_name: string;
  grade_level?: number | null;
  program?: string | null;
  gender?: string | null;
  is_active: boolean;
}

export interface SubstituteConstraintAdminRow {
  id: string;
  teacher_id: string;
  constraint_type: "WEEKLY" | "DATE";
  day_of_week: number | null;
  specific_date: string | null;
  period_start: number;
  period_end: number;
  valid_from: string | null;
  valid_until: string | null;
  reason: string;
  override_allowed: boolean;
  blocks_normal_teaching: boolean;
  requires_badal?: boolean;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
}

export interface SubstituteConstraintWriteInput {
  id?: string;
  teacherId: string;
  kind: "WEEKLY" | "DATE";
  dayOfWeek?: number | null;
  specificDate?: string | null;
  periodStart: number;
  periodEnd: number;
  validFrom?: string | null;
  validUntil?: string | null;
  reason: string;
  overrideAllowed?: boolean;
  blocksNormalTeaching?: boolean;
  requiresBadal?: boolean;
  isActive?: boolean;
}

export interface AcademicEventAdminRow {
  id: string;
  admin_group_code?: string | null;
  legacy_event_code?: string | null;
  date_start: string;
  date_end: string;
  event_name: string;
  event_type: string;
  scope: "ALL" | "CLASS";
  class_id: string | null;
  period_start: number | null;
  period_end: number | null;
  status: "ACTIVE" | "INACTIVE";
  created_at?: string | null;
  updated_at?: string | null;
}

export interface AcademicEventGroup {
  key: string;
  groupCode: string | null;
  rowIds: string[];
  dateStart: string;
  dateEnd: string;
  eventName: string;
  eventType: string;
  scope: "ALL" | "CLASS";
  classIds: string[];
  classNames: string[];
  periodStart: number | null;
  periodEnd: number | null;
  status: "ACTIVE" | "INACTIVE";
}

export interface AcademicEventWriteInput {
  existingRowIds?: string[];
  groupCode?: string | null;
  dateStart: string;
  dateEnd: string;
  eventName: string;
  eventType: string;
  scope: "ALL" | "CLASS";
  classIds?: string[];
  periodStart?: number | null;
  periodEnd?: number | null;
}

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function nullable(value: unknown): string | null {
  const out = clean(value);
  return out || null;
}

function ensurePeriodRange(start: number, end: number): void {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > 6 || end < start) {
    throw new Error("Rentang JP harus berada di JP0–JP6 dan JP akhir tidak boleh lebih kecil dari JP awal.");
  }
}

function buildCalendarGroupCode(): string {
  const suffix = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().slice(0, 8).toUpperCase()
    : Math.random().toString(36).slice(2, 10).toUpperCase();
  return `CAL-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${suffix}`;
}

export class OperationalRulesRepository {
  async listTeachers(): Promise<OperationalTeacherRow[]> {
    const client = requireSupabaseClient();
    const { data, error } = await client
      .from("teachers")
      .select("id,full_name,short_name,gender,is_active")
      .eq("is_active", true)
      .order("full_name");
    if (error) throw error;
    return (data || []) as OperationalTeacherRow[];
  }

  async listClasses(): Promise<OperationalClassRow[]> {
    const client = requireSupabaseClient();
    const { data, error } = await client
      .from("classes")
      .select("id,code,display_name,grade_level,program,gender,is_active")
      .eq("is_active", true)
      .order("display_name");
    if (error) throw error;
    return (data || []) as OperationalClassRow[];
  }

  async listSubstituteConstraints(): Promise<SubstituteConstraintAdminRow[]> {
    const client = requireSupabaseClient();
    const { data, error } = await client
      .from("substitute_constraints")
      .select("*")
      .is("deleted_at", null)
      .order("is_active", { ascending: false })
      .order("specific_date", { ascending: true, nullsFirst: false })
      .order("teacher_id");
    if (error) throw error;
    return (data || []) as SubstituteConstraintAdminRow[];
  }

  async saveSubstituteConstraint(input: SubstituteConstraintWriteInput): Promise<void> {
    const client = requireSupabaseClient();
    const reason = clean(input.reason);
    if (!input.teacherId) throw new Error("Guru wajib dipilih.");
    if (!reason) throw new Error("Alasan restriksi wajib diisi.");
    ensurePeriodRange(Number(input.periodStart), Number(input.periodEnd));

    const payload = input.kind === "DATE"
      ? {
          teacher_id: input.teacherId,
          constraint_type: "DATE",
          day_of_week: null,
          specific_date: nullable(input.specificDate),
          period_start: Number(input.periodStart),
          period_end: Number(input.periodEnd),
          valid_from: null,
          valid_until: null,
          reason,
          override_allowed: Boolean(input.overrideAllowed),
          blocks_normal_teaching: Boolean(input.blocksNormalTeaching),
          requires_badal: Boolean(input.blocksNormalTeaching && input.requiresBadal),
          is_active: input.isActive !== false,
          deleted_at: null,
        }
      : {
          teacher_id: input.teacherId,
          constraint_type: "WEEKLY",
          day_of_week: input.dayOfWeek == null ? null : Number(input.dayOfWeek),
          specific_date: null,
          period_start: Number(input.periodStart),
          period_end: Number(input.periodEnd),
          valid_from: nullable(input.validFrom),
          valid_until: nullable(input.validUntil),
          reason,
          override_allowed: Boolean(input.overrideAllowed),
          blocks_normal_teaching: Boolean(input.blocksNormalTeaching),
          requires_badal: Boolean(input.blocksNormalTeaching && input.requiresBadal),
          is_active: input.isActive !== false,
          deleted_at: null,
        };

    if (payload.constraint_type === "DATE" && !payload.specific_date) {
      throw new Error("Tanggal restriksi wajib diisi untuk mode Tanggal Tertentu.");
    }
    if (payload.constraint_type === "WEEKLY" && payload.day_of_week != null && (payload.day_of_week < 1 || payload.day_of_week > 7)) {
      throw new Error("Hari mingguan tidak valid.");
    }
    if (payload.constraint_type === "WEEKLY" && payload.valid_from && payload.valid_until && payload.valid_until < payload.valid_from) {
      throw new Error("Tanggal akhir berlaku tidak boleh sebelum tanggal mulai.");
    }

    const query = input.id
      ? client.from("substitute_constraints").update(payload).eq("id", input.id)
      : client.from("substitute_constraints").insert(payload);
    const { error } = await query;
    if (error) throw error;
  }

  async setSubstituteConstraintActive(id: string, active: boolean): Promise<void> {
    const client = requireSupabaseClient();
    const { error } = await client
      .from("substitute_constraints")
      .update({ is_active: active, deleted_at: null })
      .eq("id", id);
    if (error) throw error;
  }

  async listAcademicEventGroups(): Promise<AcademicEventGroup[]> {
    const client = requireSupabaseClient();
    const [eventsResult, classesResult] = await Promise.all([
      client.from("academic_events").select("*").order("date_start", { ascending: false }).order("created_at", { ascending: false }),
      client.from("classes").select("id,display_name").order("display_name"),
    ]);
    if (eventsResult.error) throw eventsResult.error;
    if (classesResult.error) throw classesResult.error;

    const classes = new Map<string, string>((classesResult.data || []).map((row: any) => [String(row.id), String(row.display_name || "")]));
    const grouped = new Map<string, AcademicEventAdminRow[]>();
    for (const raw of (eventsResult.data || []) as AcademicEventAdminRow[]) {
      const key = clean(raw.admin_group_code) || clean(raw.legacy_event_code) || raw.id;
      const list = grouped.get(key) || [];
      list.push(raw);
      grouped.set(key, list);
    }

    return Array.from(grouped.entries()).map(([key, rows]) => {
      const first = rows[0];
      const classIds = rows.map((row) => row.class_id).filter((id): id is string => Boolean(id));
      return {
        key,
        groupCode: clean(first.admin_group_code) || null,
        rowIds: rows.map((row) => row.id),
        dateStart: first.date_start,
        dateEnd: first.date_end,
        eventName: first.event_name,
        eventType: first.event_type,
        scope: first.scope,
        classIds,
        classNames: classIds.map((id) => classes.get(id) || id),
        periodStart: first.period_start ?? null,
        periodEnd: first.period_end ?? null,
        status: rows.some((row) => row.status === "ACTIVE") ? "ACTIVE" : "INACTIVE",
      };
    });
  }

  async saveAcademicEventGroup(input: AcademicEventWriteInput): Promise<void> {
    const client = requireSupabaseClient();
    const eventName = clean(input.eventName);
    const eventType = clean(input.eventType) || "Kegiatan";
    if (!eventName) throw new Error("Nama kegiatan wajib diisi.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dateStart) || !/^\d{4}-\d{2}-\d{2}$/.test(input.dateEnd)) {
      throw new Error("Tanggal mulai dan selesai wajib diisi.");
    }
    if (input.dateEnd < input.dateStart) throw new Error("Tanggal selesai tidak boleh sebelum tanggal mulai.");

    const hasStart = input.periodStart !== undefined && input.periodStart !== null;
    const hasEnd = input.periodEnd !== undefined && input.periodEnd !== null;
    if (hasStart !== hasEnd) throw new Error("JP mulai dan JP selesai harus sama-sama diisi atau sama-sama kosong.");
    if (hasStart && hasEnd) ensurePeriodRange(Number(input.periodStart), Number(input.periodEnd));

    const classIds = Array.from(new Set((input.classIds || []).filter(Boolean)));
    if (input.scope === "CLASS" && classIds.length === 0) throw new Error("Pilih minimal satu kelas.");

    // RC3.4.1: one atomic RPC transaction for any group size. Previously each
    // inserted class triggered a full schedule-version snapshot (SQLSTATE 57014
    // on large calendar events), and browser-side revision had partial-write risk.
    const groupCode = input.existingRowIds?.length ? buildCalendarGroupCode() : (clean(input.groupCode) || buildCalendarGroupCode());
    const { error } = await client.rpc("ejadwal_save_academic_event_group_v2", {
      p_existing_row_ids: input.existingRowIds || [],
      p_group_code: groupCode,
      p_date_start: input.dateStart,
      p_date_end: input.dateEnd,
      p_event_name: eventName,
      p_event_type: eventType,
      p_scope: input.scope,
      p_class_ids: input.scope === "CLASS" ? classIds : [],
      p_period_start: hasStart ? Number(input.periodStart) : null,
      p_period_end: hasEnd ? Number(input.periodEnd) : null,
    });
    if (error) {
      if (error.code === "PGRST202" || error.code === "42883") {
        throw new Error("RPC Kalender Akademik belum tersedia. Jalankan migration 202610110052_v3_14_6_calendar_bulk_versioning.sql di Supabase, lalu reload schema cache.");
      }
      throw error;
    }
  }

  async setAcademicEventGroupActive(rowIds: string[], active: boolean): Promise<void> {
    if (!rowIds.length) return;
    const client = requireSupabaseClient();
    const { error } = await client.rpc("ejadwal_set_academic_event_group_active_v2", {
      p_row_ids: Array.from(new Set(rowIds)),
      p_active: active,
    });
    if (error) {
      if (error.code === "PGRST202" || error.code === "42883") {
        throw new Error("RPC Kalender Akademik belum tersedia. Jalankan migration 202610110052_v3_14_6_calendar_bulk_versioning.sql di Supabase, lalu reload schema cache.");
      }
      throw error;
    }
  }
}
