import { requireSupabaseClient } from '../supabase/client';
import { getCurrentUserContext } from '../auth/supabaseAuthRepository';
import type { EducationEvent, EducationEventWrite, EducationMember } from '../../domain/educationCalendar';

/** Separate from academic_events / the effective schedule. RLS protects private rows. */
export class EducationCalendarRepository {
  async list(from: string, through: string, includeDrafts = false): Promise<EducationEvent[]> {
    const client = requireSupabaseClient();
    let query = client.from('education_calendar_events').select('id,title,description,category,start_date,end_date,status,management_only,audience_rule,created_at,updated_at')
      .lte('start_date', through).gte('end_date', from).is('deleted_at', null).order('start_date', { ascending: true });
    if (!includeDrafts) query = query.in('status', ['PUBLISHED', 'CANCELLED']);
    const { data, error } = await query.limit(500);
    if (error) throw error;
    return (data || []) as EducationEvent[];
  }
  async listForAdmin(): Promise<EducationEvent[]> {
    await this.requireAdmin();
    const { data, error } = await requireSupabaseClient().from('education_calendar_events')
      .select('id,title,description,category,start_date,end_date,status,management_only,audience_rule,created_at,updated_at,deleted_at,deleted_by,restored_at,restored_by')
      .order('start_date', { ascending: false }).limit(500);
    if (error) throw error;
    return (data || []) as EducationEvent[];
  }
  async listMemberships(): Promise<EducationMember[]> {
    const { data, error } = await requireSupabaseClient().from('education_audience_memberships')
      .select('teacher_id,team_code').limit(3000);
    if (error) throw error;
    return (data || []) as EducationMember[];
  }
  async save(input: EducationEventWrite, id?: string): Promise<void> {
    await this.requireAdmin();
    const client = requireSupabaseClient();
    const body = {
      title: input.title.trim(), description: input.description.trim(), category: input.category,
      start_date: input.start_date, end_date: input.end_date, status: input.status,
      management_only: input.management_only, audience_rule: input.audience_rule,
    };
    if (id) {
      const { data, error } = await client.from('education_calendar_events')
        .update(body).eq('id', id).is('deleted_at', null).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('Event tidak ditemukan atau sudah dihapus. Muat ulang daftar kegiatan.');
    } else {
      const { error } = await client.from('education_calendar_events').insert(body);
      if (error) throw error;
    }
  }
  async softDelete(id: string): Promise<void> {
    await this.requireAdmin();
    const { data, error } = await requireSupabaseClient().rpc('ejadwal_soft_delete_education_event_v1', { p_event_id: id });
    if (error) throw error;
    if (data !== true) throw new Error('Event sudah dihapus atau tidak ditemukan. Muat ulang daftar kegiatan.');
  }
  async restore(id: string): Promise<void> {
    await this.requireAdmin();
    const { data, error } = await requireSupabaseClient().rpc('ejadwal_restore_education_event_v1', { p_event_id: id });
    if (error) throw error;
    if (data !== true) throw new Error('Event tidak ditemukan atau belum dihapus. Muat ulang daftar kegiatan.');
  }
  async updateMemberships(teacherId: string, teamCodes: string[]): Promise<void> {
    await this.requireAdmin();
    const client = requireSupabaseClient();
    const { data, error: listError } = await client.from('education_audience_memberships')
      .select('team_code').eq('teacher_id', teacherId);
    if (listError) throw listError;
    const before = new Set((data || []).map((item) => String(item.team_code)));
    const after = new Set(teamCodes);
    const add = [...after].filter((code) => !before.has(code));
    const remove = [...before].filter((code) => !after.has(code));
    // Additions first: a failed write never erases previously valid team assignments.
    if (add.length) {
      const { error } = await client.from('education_audience_memberships')
        .insert(add.map((team_code) => ({ teacher_id: teacherId, team_code })));
      if (error) throw error;
    }
    if (remove.length) {
      const { error } = await client.from('education_audience_memberships')
        .delete().eq('teacher_id', teacherId).in('team_code', remove);
      if (error) throw error;
    }
  }
  private async requireAdmin() {
    const context = await getCurrentUserContext();
    if (!context?.roles.includes('ADMIN')) throw new Error('Login Supabase dengan role ADMIN diperlukan.');
  }
}
