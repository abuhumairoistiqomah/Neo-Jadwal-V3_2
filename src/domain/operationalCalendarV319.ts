/** V3.19 RC1: operational calendar planning, never proof of staff attendance.
 * Publishing an exception intentionally delegates to the existing academic_events RPC.
 */
export type OperationalScope = 'ALL' | 'IKHWAN' | 'AKHWAT' | 'CLASS';
export type CalendarDisposition = 'NO_KBM' | 'KBM_ACTIVE' | 'REVIEW';
export interface CalendarProposal {
  id: string;
  start: string;
  end: string;
  label: string;
  scope: OperationalScope;
  disposition: CalendarDisposition;
  eventType: string;
  classIds: string[];
  periodStart: number | null;
  periodEnd: number | null;
  source: string;
}
export const DEFAULT_TERM_V319 = {code:'2026-S1',title:'Semester 1 (2026/2027)',start:'2026-07-20',end:'2026-12-01'};

// School-wide instruction exceptions from dated RPH remarks; not based on v/X subject markers.
// Neither an exam day nor an educational trip is automatically a teacher leave day.
export const RPH_2026_SUGGESTIONS: ReadonlyArray<Omit<CalendarProposal,'id'|'classIds'|'periodStart'|'periodEnd'|'source'>> = [
  {start:'2026-08-17',end:'2026-08-18',label:'Lomba/peringatan Kemerdekaan',scope:'ALL',disposition:'NO_KBM',eventType:'Kegiatan'},
  {start:'2026-08-20',end:'2026-08-21',label:'Rumah Tahfidz 1',scope:'ALL',disposition:'NO_KBM',eventType:'Kegiatan'},
  {start:'2026-08-25',end:'2026-08-25',label:'Libur nasional (verifikasi kalender resmi)',scope:'ALL',disposition:'REVIEW',eventType:'Libur'},
  {start:'2026-09-09',end:'2026-09-11',label:'Ujian praktik',scope:'ALL',disposition:'NO_KBM',eventType:'Ujian'},
  {start:'2026-09-14',end:'2026-09-18',label:'ASTS',scope:'ALL',disposition:'NO_KBM',eventType:'Ujian'},
  {start:'2026-09-21',end:'2026-09-21',label:'Field Trip Ikhwan',scope:'IKHWAN',disposition:'NO_KBM',eventType:'Kegiatan'},
  {start:'2026-09-22',end:'2026-09-22',label:'Field Trip Akhwat',scope:'AKHWAT',disposition:'NO_KBM',eventType:'Kegiatan'},
  {start:'2026-10-15',end:'2026-10-16',label:'Rumah Tahfidz 2',scope:'ALL',disposition:'NO_KBM',eventType:'Kegiatan'},
  {start:'2026-11-19',end:'2026-11-20',label:'Rumah Tahfidz 3',scope:'ALL',disposition:'NO_KBM',eventType:'Kegiatan'},
  {start:'2026-12-02',end:'2026-12-04',label:'EXPO dan tindak lanjut (setelah KBM reguler)',scope:'ALL',disposition:'REVIEW',eventType:'Kegiatan'},
  {start:'2026-12-07',end:'2026-12-11',label:'ASAS (setelah KBM reguler)',scope:'ALL',disposition:'REVIEW',eventType:'Ujian'},
  {start:'2026-12-14',end:'2026-12-17',label:'Remedial/pengayaan/susulan (setelah KBM reguler)',scope:'ALL',disposition:'REVIEW',eventType:'Kegiatan'},
  {start:'2026-12-18',end:'2026-12-31',label:'Persiapan rapor dan libur semester',scope:'ALL',disposition:'REVIEW',eventType:'Libur'},
];

export function makeRphSuggestions(): CalendarProposal[] {
  return RPH_2026_SUGGESTIONS.map((r,i)=>({...r,id:`rph-${i}`,classIds:[],periodStart:null,periodEnd:null,source:'RPH 2026 — keterangan'}));
}

export function normalizeCalendarDate(input: unknown): string | null {
  if (input instanceof Date && Number.isFinite(input.getTime())) {
    return new Date(Date.UTC(input.getFullYear(),input.getMonth(),input.getDate())).toISOString().slice(0,10);
  }
  if (typeof input === 'number' && input > 20000 && input < 100000) {
    // Excel serialized date, using UTC days since 1899-12-30.
    const date = new Date(Date.UTC(1899,11,30) + Math.floor(input)*86400000);
    return date.toISOString().slice(0,10);
  }
  const text = String(input ?? '').trim();
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (match) return checkedISO(+match[1],+match[2],+match[3]);
  match = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/.exec(text);
  if (match) return checkedISO(+match[3],+match[2],+match[1]);
  return null;
}
function checkedISO(y:number,m:number,d:number): string|null {
  if (y<2000||y>2100||m<1||m>12||d<1||d>31) return null;
  const date = new Date(Date.UTC(y,m-1,d));
  return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d ? date.toISOString().slice(0,10):null;
}

const ACTIVE_HINT = /\b(hari pertama kbm|kbm aktif|belajar efektif|pembelajaran reguler|masuk normal)\b/i;
const NON_KBM_HINT = /\b(libur|holiday|rumah tahfidz|asts|asas|ujian praktik|field trip|outing|lomba|kemerdekaan|expo|remedial|pengayaan)\b/i;
/** Conservative classification: never silently publish ambiguous non-KBM. */
export function classifyCalendarRemark(remark:string):CalendarDisposition {
  const text=remark.trim();
  if (!text || ACTIVE_HINT.test(text)) return 'KBM_ACTIVE';
  if (NON_KBM_HINT.test(text)) return 'REVIEW';
  return 'REVIEW';
}

export interface ImportedRphPreview { proposals:CalendarProposal[]; skipped:number; errors:string[]; }
/** Pure parser; callers can feed CSV or XLSX worksheets converted to object records. */
export function parseRphRows(rows:Record<string,unknown>[]):ImportedRphPreview {
  const proposals:CalendarProposal[]=[]; let skipped=0; const errors:string[]=[];
  for(let i=0;i<rows.length;i++) {
    const raw=rows[i]; const normalized=Object.fromEntries(Object.entries(raw).map(([key,value])=>[key.trim().toLocaleLowerCase('id-ID'),value]));
    const rawDate=normalized['tanggal']??normalized['date']??normalized['tgl'];
    const label=String(normalized['keterangan']??normalized['remarks']??normalized['remark']??normalized['catatan']??'').trim();
    if(!label) {skipped++;continue;}
    const start=normalizeCalendarDate(rawDate);
    if(!start){errors.push(`Baris ${i+2}: tanggal tidak dikenali untuk "${label.slice(0,36)}".`);continue;}
    const disposition=classifyCalendarRemark(label);
    if(disposition==='KBM_ACTIVE'){skipped++;continue;}
    // Scope deliberately REVIEW: RPH description alone cannot safely identify teacher duty or class coverage.
    proposals.push({id:`import-${i}`,start,end:start,label,scope:'ALL',disposition:'REVIEW',eventType:'Kegiatan',classIds:[],periodStart:null,periodEnd:null,source:'Import RPH — butuh review'});
  }
  return {proposals,skipped,errors};
}

export function coveredClassIds(
  proposal:Pick<CalendarProposal,'scope'|'classIds'>,
  classes:ReadonlyArray<{id:string;gender?:string|null}>
):string[] {
  if(proposal.scope==='ALL') return classes.map(c=>c.id);
  if(proposal.scope==='CLASS') return classes.filter(c=>proposal.classIds.includes(c.id)).map(c=>c.id);
  return classes.filter(c=>String(c.gender||'').toUpperCase().includes(proposal.scope)).map(c=>c.id);
}
export function canPublishCalendarProposal(proposal:CalendarProposal,matchedClassCount:number):string|null {
  if(!normalizeCalendarDate(proposal.start)||!normalizeCalendarDate(proposal.end)||proposal.end<proposal.start) return 'Tanggal tidak valid.';
  if(!proposal.label.trim()) return 'Keterangan wajib diisi.';
  if(proposal.disposition!=='NO_KBM') return 'Tandai sebagai Non-KBM sebelum publish. Status Review/Aktif tidak akan diterbitkan.';
  if(proposal.scope!=='ALL' && !matchedClassCount) return 'Cakupan tidak cocok dengan kelas aktif. Pilih kelas terlebih dahulu.';
  if((proposal.periodStart===null)!==(proposal.periodEnd===null)) return 'JP awal/akhir harus terisi berpasangan.';
  if(proposal.periodStart!==null && proposal.periodEnd!==null &&
    (!Number.isInteger(proposal.periodStart)||!Number.isInteger(proposal.periodEnd)||proposal.periodStart<0||proposal.periodEnd>6||proposal.periodStart>proposal.periodEnd)) return 'JP harus dalam 0–6 secara berurutan.';
  return null;
}
