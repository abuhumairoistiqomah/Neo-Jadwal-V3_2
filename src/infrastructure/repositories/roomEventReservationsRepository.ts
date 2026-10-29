import { requireSupabaseClient } from '../supabase/client';

export interface RoomEventReservation {
  id: string;
  room_id: string;
  event_date: string;
  start_time: string;
  end_time: string;
  title: string;
  organizer: string;
  description: string | null;
  status: 'ACTIVE' | 'CANCELLED';
}

export interface RoomEventConflict { conflict_type: string; label: string; starts: string; ends: string }

export interface RoomEventInput {
  id?: string;
  roomId: string;
  date: string;
  starts: string;
  ends: string;
  title: string;
  organizer: string;
  description: string;
}

export class RoomEventReservationsRepository {
  async list(from: string, to: string): Promise<RoomEventReservation[]> {
    const { data, error } = await requireSupabaseClient().rpc('ejadwal_list_room_events_rc17', { p_from: from, p_to: to });
    if (error) throw new Error(`Gagal memuat reservasi: ${error.message}`);
    if (!Array.isArray(data)) throw new Error('Format daftar reservasi tidak valid. Periksa migrasi RC1.7.');
    return data as RoomEventReservation[];
  }
  /** Read-only safe availability for teachers/guests: no PIC, description or audit columns. */
  async listPublic(from: string, to: string): Promise<RoomEventReservation[]> {
    const { data, error } = await requireSupabaseClient().rpc('ejadwal_public_room_calendar_rc171', {p_from: from, p_to: to});
    if (error) throw new Error(`Kalender event tidak dapat dimuat (periksa migrasi RC1.7.1): ${error.message}`);
    if (!Array.isArray(data)) throw new Error('Format kalender event tidak valid.');
    return data as RoomEventReservation[];
  }
  async check(input: Pick<RoomEventInput, 'id'|'roomId'|'date'|'starts'|'ends'>): Promise<RoomEventConflict[]> {
    const { data, error } = await requireSupabaseClient().rpc('ejadwal_room_conflicts_rc17', {
      p_room_id: input.roomId, p_date: input.date,
      p_start: input.starts, p_end: input.ends, p_exclude_id: input.id || null,
    });
    if (error) throw new Error(`Gagal memeriksa konflik: ${error.message}`);
    if (!Array.isArray(data)) throw new Error('Format konflik ruangan tidak valid.');
    return data as RoomEventConflict[];
  }
  async save(input: RoomEventInput): Promise<void> {
    const { error } = await requireSupabaseClient().rpc('ejadwal_upsert_room_event_rc17', {
      p_room_id: input.roomId, p_event_date: input.date,
      p_start_time: input.starts, p_end_time: input.ends,
      p_title: input.title.trim(), p_organizer: input.organizer.trim(),
      p_description: input.description.trim() || null, p_id: input.id || null,
    });
    if (error) throw new Error(`Reservasi ditolak: ${error.message}`);
  }
  async cancel(id: string, note: string): Promise<void> {
    const { error } = await requireSupabaseClient().rpc('ejadwal_cancel_room_event_rc17', { p_id: id, p_note: note });
    if (error) throw new Error(`Gagal membatalkan reservasi: ${error.message}`);
  }
}
