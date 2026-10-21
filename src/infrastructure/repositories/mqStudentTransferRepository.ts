import { requireSupabaseClient } from '../supabase/client';
import type { MqTransferRecord } from '../../domain/schedule/mqStudentTransfer';

export class MqStudentTransferRepository {
  async list(date: string): Promise<MqTransferRecord[]> {
    const { data, error } = await requireSupabaseClient()
      .from('ejadwal_mq_student_transfers_v319')
      .select('id,coverage_slot_id,schedule_date,period,receiving_class_name,source_class_name,receiving_teacher_name')
      .eq('schedule_date', date)
      .is('deleted_at', null);
    if (error) throw new Error(`Gagal membaca konfirmasi pelimpahan MQ: ${error.message}`);
    return (data || []) as MqTransferRecord[];
  }

  async confirm(coverageId: string, receivingClass: string): Promise<void> {
    const { error } = await requireSupabaseClient().rpc('ejadwal_confirm_mq_student_transfer_v319', {
      p_coverage_id: coverageId, p_receiving_class: receivingClass,
    });
    if (error) throw new Error(`Gagal mengonfirmasi pelimpahan MQ: ${error.message}`);
  }

  async revoke(id: string): Promise<void> {
    const { error } = await requireSupabaseClient().rpc('ejadwal_revoke_mq_student_transfer_v319', {
      p_transfer_id: id,
    });
    if (error) throw new Error(`Gagal membatalkan pelimpahan MQ: ${error.message}`);
  }
}
