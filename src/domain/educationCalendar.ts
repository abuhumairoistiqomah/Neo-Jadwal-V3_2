/** V3.16: independent education agenda. NEVER mutates academic/operational schedule. */
import type { Teacher, ScheduleItem } from './models';

export type EducationTagKind = 'CLASS' | 'SUBJECT' | 'ROLE' | 'TEAM' | 'TEACHER';
export type BooleanOp = 'AND' | 'OR';
export interface EducationTag { kind: EducationTagKind; value: string }
export interface AudienceGroup { tags: EducationTag[]; op: BooleanOp; join: BooleanOp }
export interface AudienceRule { all: boolean; groups: AudienceGroup[] }
export type EducationEventStatus = 'DRAFT' | 'PUBLISHED' | 'CANCELLED';
export interface EducationEvent {
  id: string;
  title: string;
  description: string;
  category: string;
  start_date: string;
  end_date: string;
  status: EducationEventStatus;
  management_only: boolean;
  audience_rule: AudienceRule;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
  restored_at?: string | null;
  restored_by?: string | null;
}
export interface EducationMember { teacher_id: string; team_code: string }
export type EducationEventWrite = Omit<EducationEvent, 'id' | 'created_at' | 'updated_at' | 'deleted_at' | 'deleted_by' | 'restored_at' | 'restored_by'>;
export const DEFAULT_AUDIENCE_RULE: AudienceRule = { all: true, groups: [] };

const norm = (s: unknown) => String(s || '').trim().toLocaleUpperCase('id-ID').replace(/\s+/g, ' ');
const normSubject = (s: unknown) => norm(s).replace(/MATHEMATICS?|MATEMATIKA/g, 'MATH');
const isClass = (value: string, tag: string) => {
  const left = norm(value).replace(/[^A-Z0-9]+/g, ' ').trim();
  const right = norm(tag).replace(/[^A-Z0-9]+/g, ' ').trim();
  return Boolean(right) && (left === right || left.startsWith(`${right} `));
};

export function validateAudience(rule: AudienceRule): string | null {
  if (!rule || typeof rule.all !== 'boolean' || !Array.isArray(rule.groups)) return 'Aturan target tidak valid.';
  if (rule.all) return null;
  if (!rule.groups.length || rule.groups.length > 8) return 'Pilih 1–8 grup tag atau Semua Guru.';
  for (const group of rule.groups) {
    if (!['AND','OR'].includes(group.op) || !['AND','OR'].includes(group.join)
      || !Array.isArray(group.tags) || !group.tags.length || group.tags.length > 12) return 'Isi 1–12 tag pada setiap grup.';
    for (const tag of group.tags) {
      if (!['CLASS','SUBJECT','ROLE','TEAM','TEACHER'].includes(tag.kind) || !String(tag.value || '').trim()) return 'Terdapat tag tidak lengkap.';
    }
  }
  return null;
}

/**
 * Crucial: class AND subject AND academic role must match ONE schedule assignment.
 * It must NOT combine Math taught in grade 10 with English taught in grade 6.
 * Organisational tags describe teacher identity and may coexist with assignment tags.
 * A teacher with multiple master rows is checked against each row separately.
 */
export function matchesEducationAudience(
  rule: AudienceRule,
  teacher: Teacher | undefined,
  schedules: ScheduleItem[],
  memberships: EducationMember[],
): boolean {
  if (!teacher) return false;
  if (validateAudience(rule)) return false;
  if (rule.all) return true;
  const teacherName = norm(teacher.nama);
  const teacherMemberships = new Set(memberships.filter((m) => m.teacher_id && m.teacher_id === teacher.id).map((m) => norm(m.team_code)));
  const related = schedules.flatMap((row) => {
    const positions = [row.guru1, row.guru2, row.guru3, row.guru4, row.guru5, row.guru6];
    return positions.map((name, index) => norm(name) === teacherName && teacherName
      ? { row, role: index === 0 ? 'PENGAMPU' : 'PENDAMPING' }
      : null).filter((entry): entry is { row: ScheduleItem; role: string } => entry !== null);
  });
  const assignments: Array<{row?: ScheduleItem;role?: string}> = related.length ? related : [{}];
  const memberTags = [norm(teacher.tugas_tambahan), norm(teacher.keterangan)];
  if (teacher.is_manajemen) teacherMemberships.add('MANAJEMEN');
  // Organizational memberships are admin-maintained; metadata is a compatibility fallback.
  const matchTag = (tag: EducationTag, assignment: {row?: ScheduleItem;role?: string}): boolean => {
    switch (tag.kind) {
      case 'CLASS': return Boolean(assignment.row && (isClass(assignment.row.kelas, tag.value)
        || String(assignment.row.kelasgabung || '').split(/[,;|]/).some((candidate) => isClass(candidate, tag.value))));
      case 'SUBJECT': return Boolean(assignment.row && normSubject(assignment.row.mapel) === normSubject(tag.value));
      case 'ROLE': return norm(assignment.role) === norm(tag.value);
      case 'TEACHER': return norm(tag.value) === teacherName || (!!teacher.id && tag.value === teacher.id);
      case 'TEAM': return teacherMemberships.has(norm(tag.value)) || memberTags.some((value) => value.split(/[,;/|]/).map(norm).includes(norm(tag.value)));
    }
  };
  return assignments.some((assignment) => {
    const matchesGroup = (group: AudienceGroup) => group.op === 'AND'
      ? group.tags.every((tag) => matchTag(tag, assignment))
      : group.tags.some((tag) => matchTag(tag, assignment));
    return rule.groups.reduce((acc, group, i) => i === 0 ? matchesGroup(group)
      : group.join === 'AND' ? acc && matchesGroup(group) : acc || matchesGroup(group), false);
  });
}

/** A deleted event is not an event cancellation; it is hidden from all public views. */
export function isEducationEventDeleted(event: Pick<EducationEvent, 'deleted_at'>): boolean {
  return Boolean(event.deleted_at);
}

/**
 * Admin list presentation only. Deleted events remain visible ONLY when opted in;
 * unlike the past-date toggle, this also shows deleted items from old dates.
 * No status is mutated and active/cancelled history remains intact.
 */
export function filterEducationAdminEvents(
  events: EducationEvent[], schoolToday: string, showPast: boolean, showDeleted: boolean,
): EducationEvent[] {
  return events.filter((event) => isEducationEventDeleted(event)
    ? showDeleted : showPast || !isEducationEventPast(event, schoolToday));
}

/** Only archive once the event's LAST school day has passed. Current/multiday events stay visible. */
export function isEducationEventPast(event: Pick<EducationEvent, 'start_date' | 'end_date'>, schoolToday: string): boolean {
  const lastDay = event.end_date || event.start_date;
  return /^\d{4}-\d{2}-\d{2}$/.test(lastDay) && lastDay < schoolToday;
}

export function matchesReminderDate(event: EducationEvent, today: string, days = 14): boolean {
  if (event.status !== 'PUBLISHED' || isEducationEventDeleted(event)) return false;
  const toUtc = (date: string) => Date.parse(`${date}T00:00:00Z`);
  const diff = Math.round((toUtc(event.end_date) - toUtc(today)) / 86400000);
  return Number.isFinite(diff) && diff >= 0 && diff <= days && event.start_date <= addEducationDays(today, days);
}
export function addEducationDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export const EDUCATION_CATEGORIES = ['Akademik', 'Kegiatan Siswa', 'Rapat', 'Tenggat Waktu', 'Hari Besar', 'Lainnya'];
