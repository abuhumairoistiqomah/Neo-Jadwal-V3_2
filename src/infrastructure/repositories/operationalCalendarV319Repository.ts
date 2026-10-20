import {requireSupabaseClient} from '../supabase/client';
export interface OperationalTerm {id?:string;term_code:string;title:string;kbm_start:string;kbm_end:string;weekdays:number[];is_active:boolean;}
export class OperationalCalendarV319Repository {
  async listTerms():Promise<OperationalTerm[]> {
    const {data,error}=await requireSupabaseClient().from('ejadwal_operational_terms').select('id,term_code,title,kbm_start,kbm_end,weekdays,is_active').order('kbm_start',{ascending:false});
    if(error) throw new Error(`Tidak dapat membaca semester operasional. Jalankan migration V3.19 RC1: ${error.message}`);
    return (data||[]) as OperationalTerm[];
  }
  async saveTerm(input:OperationalTerm):Promise<void> {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(input.kbm_start)||!/^\d{4}-\d{2}-\d{2}$/.test(input.kbm_end)||input.kbm_end<input.kbm_start) throw new Error('Periode KBM tidak valid.');
    if(!input.term_code.trim()||!input.title.trim()) throw new Error('Kode dan nama semester harus diisi.');
    const payload={term_code:input.term_code.trim(),title:input.title.trim(),kbm_start:input.kbm_start,kbm_end:input.kbm_end,weekdays:[1,2,3,4,5],is_active:input.is_active};
    const q=input.id ? requireSupabaseClient().from('ejadwal_operational_terms').update(payload).eq('id',input.id):requireSupabaseClient().from('ejadwal_operational_terms').insert(payload);
    const {error}=await q;
    if(error) throw error;
  }
}
