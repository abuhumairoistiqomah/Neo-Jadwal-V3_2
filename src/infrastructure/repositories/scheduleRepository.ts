import type {
  JadwalInsidentalItem,
  KalenderAkademikItem,
  LogIzinItem,
  MasterRuanganItem,
  ScheduleItem,
  Teacher,
} from "../../domain/models";

export interface ScheduleDataSnapshot {
  teachers: Teacher[];
  schedules: ScheduleItem[];
  logs: LogIzinItem[];
  jadwalInsidental: JadwalInsidentalItem[];
  masterRuangan: MasterRuanganItem[];
  kalenderAkademik: KalenderAkademikItem[];
}

/**
 * Persistence boundary for the canonical schedule domain.
 *
 * The domain engine must not care whether the source is Apps Script/Sheets,
 * Supabase/Postgres, fixtures, or another adapter.
 */
export interface ScheduleReadRepository {
  loadSnapshot(): Promise<ScheduleDataSnapshot>;
}
