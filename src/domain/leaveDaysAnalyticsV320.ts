import { normalizeAbsenceCategory, type LeaveAbsenceCategory } from './leaveClassificationV320.ts';
import { teacherDayLeaveRate, type ExpectedTeacherDaysSummary } from './expectedTeacherDaysV320.ts';

export type LeaveDayFilter = 'ALL' | LeaveAbsenceCategory;
export type LeaveDayMode = 'weekly' | 'monthly' | 'semester' | 'yearly';
export interface LeaveDayEvent {
  date: string;
  teacherId: string;
  teacherName: string;
  category: LeaveAbsenceCategory;
}
export interface LeaveDayBucket {
  key: string;
  label: string;
  firstDay: string;
  lastDay: string;
  teacherDays: number;
  affectedTeachers: number;
  dominantCategory: LeaveAbsenceCategory | null;
}
export interface LeaveDayReport {
  totalDays: number;
  affectedTeachers: number;
  averageDays: number;
  teacherRanking: Array<{ teacherId: string; teacherName: string; days: number }>;
  buckets: LeaveDayBucket[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export function parseISODate(value: string): Date {
  if (!ISO_DATE.test(value)) throw new Error('Format tanggal harus YYYY-MM-DD.');
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() + 1 !== month || parsed.getUTCDate() !== day) {
    throw new Error(`Tanggal tidak valid: ${value}`);
  }
  return parsed;
}
export function dateISO(date: Date): string { return date.toISOString().slice(0, 10); }
export function shiftDate(iso: string, amount: number): string {
  const date = parseISODate(iso);
  date.setUTCDate(date.getUTCDate() + amount);
  return dateISO(date);
}
export function daysInclusive(start: string, end: string): number {
  const ms = parseISODate(end).getTime() - parseISODate(start).getTime();
  return Math.floor(ms / 86_400_000) + 1;
}
export function previousWindow(start: string, end: string): {start: string; end: string} {
  const length = daysInclusive(start, end);
  if (length <= 0) throw new Error('Tanggal akhir sebelum tanggal awal.');
  return { start: shiftDate(start, -length), end: shiftDate(start, -1) };
}
export function defaultDayRange(mode: LeaveDayMode, schoolToday: string): {start: string; end: string} {
  const now = parseISODate(schoolToday);
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  switch(mode) {
    case 'weekly': return {start: shiftDate(schoolToday,-13),end:schoolToday};
    case 'monthly': return {start: `${month >= 7 ? year : year-1}-07-01`,end:schoolToday};
    case 'semester': return {start: `${month >= 7 ? year-1 : year-2}-07-01`,end:schoolToday};
    case 'yearly': return {start: `${year-2}-01-01`,end:schoolToday};
  }
}
export function maxRangeDays(mode: LeaveDayMode): number {
  return mode === 'weekly' ? 93 : mode === 'monthly' ? 732 : 1462;
}
export function validateLeaveDayRange(mode: LeaveDayMode, start: string, end: string, today: string): string | null {
  try {
    const total = daysInclusive(start,end);
    parseISODate(today);
    if (total <= 0) return 'Tanggal akhir harus sama atau setelah tanggal awal.';
    if (end > today) return 'Analisis belum tersedia untuk tanggal yang akan datang.';
    if (total > maxRangeDays(mode)) return `Rentang ${mode} maksimal ${maxRangeDays(mode)} hari.`;
    return null;
  } catch { return 'Isi tanggal mulai dan tanggal akhir yang valid.'; }
}

export function parseLeaveDayEvents(value: unknown): LeaveDayEvent[] {
  if (!Array.isArray(value)) throw new Error('Format data hari izin dari Supabase tidak valid.');
  const events: LeaveDayEvent[] = [];
  const keys = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') throw new Error('Record hari izin tidak valid.');
    const row = raw as Record<string,unknown>;
    if (typeof row.date !== 'string' || typeof row.teacher_id !== 'string' || typeof row.teacher_name !== 'string'
      || !row.teacher_name.trim() || !ISO_DATE.test(row.date)
      || !['PERSONAL','SCHOOL_DUTY','UNCLASSIFIED'].includes(String(row.category))) {
      throw new Error('Record hari izin tidak lengkap atau kategorinya tidak valid.');
    }
    parseISODate(row.date);
    // Defensive deduplication when the database sends the same teacher-day-category twice.
    const key = `${row.teacher_id}|${row.date}|${row.category}`;
    if (keys.has(key)) continue;
    keys.add(key);
    if (row.teacher_name.trim().replace(/\s+/g,' ').toLocaleLowerCase('id-ID') === 'guru belum ditentukan') continue;
    events.push({date:row.date, teacherId:row.teacher_id, teacherName:row.teacher_name,
      category:normalizeAbsenceCategory(row.category)});
  }
  return events;
}

/** A teacher who has multiple periods or different categories on the same day counts only once in ALL. */
export function selectUniqueTeacherDays(events: readonly LeaveDayEvent[], filter: LeaveDayFilter): LeaveDayEvent[] {
  const unique = new Map<string,LeaveDayEvent>();
  for(const event of events) {
    if(filter !== 'ALL' && event.category !== filter) continue;
    const key = `${event.teacherId}|${event.date}`;
    if(!unique.has(key)) unique.set(key,event);
  }
  return Array.from(unique.values());
}
function keyFor(date: string, mode: LeaveDayMode): string {
  const year = Number(date.slice(0,4));
  const month = Number(date.slice(5,7));
  if(mode === 'weekly') return date;
  if(mode === 'monthly') return date.slice(0,7);
  if(mode === 'yearly') return String(year);
  // July–December is semester ganjil; January–June semester genap of the school year beginning last July.
  return `${month >= 7 ? year : year-1}-${month >= 7 ? 'G' : 'E'}`;
}
function displayBucket(key: string, mode: LeaveDayMode): string {
  if(mode === 'weekly') {
    const [,month,day] = key.split('-').map(Number);
    return `${day} ${MONTHS[month-1]}`;
  }
  if(mode === 'monthly') {
    const [year,month] = key.split('-').map(Number);
    return `${MONTHS[month-1]} ${year}`;
  }
  if(mode === 'semester') {
    const [start, half] = key.split('-');
    return `${half==='G'?'Ganjil':'Genap'} ${start}/${String(Number(start)+1).slice(-2)}`;
  }
  return key;
}
function createBucketDates(start: string, end: string, mode: LeaveDayMode) {
  const result = new Map<string,{label:string;firstDay:string;lastDay:string}>();
  for(let date=start;date<=end;date=shiftDate(date,1)) {
    const key = keyFor(date,mode);
    const existing = result.get(key);
    if(existing) existing.lastDay=date;
    else result.set(key,{label:displayBucket(key,mode),firstDay:date,lastDay:date});
  }
  return result;
}
export function makeLeaveDayReport(events: readonly LeaveDayEvent[], start: string, end: string,
    mode: LeaveDayMode, filter: LeaveDayFilter): LeaveDayReport {
  const selected = selectUniqueTeacherDays(events.filter(event => event.date>=start && event.date<=end),filter);
  const teacherCounts = new Map<string,{teacherId:string;teacherName:string;days:number}>();
  for(const event of selected) {
    const found=teacherCounts.get(event.teacherId);
    if(found) found.days++;
    else teacherCounts.set(event.teacherId,{teacherId:event.teacherId,teacherName:event.teacherName,days:1});
  }
  const categoriesByBucket = new Map<string,Map<LeaveAbsenceCategory,Set<string>>>();
  for(const event of events) {
    if(event.date<start||event.date>end) continue;
    const key=keyFor(event.date,mode);
    if(!categoriesByBucket.has(key)) categoriesByBucket.set(key,new Map());
    const map=categoriesByBucket.get(key)!;
    if(!map.has(event.category)) map.set(event.category,new Set());
    map.get(event.category)!.add(`${event.teacherId}|${event.date}`);
  }
  const buckets = Array.from(createBucketDates(start,end,mode),([key,period]):LeaveDayBucket=>{
    const subset=selected.filter(event=>keyFor(event.date,mode)===key);
    const types=categoriesByBucket.get(key);
    const ranks=Array.from(types||[],([category,ids])=>({category,count:ids.size}))
      .filter(row=>filter==='ALL'||row.category===filter)
      .sort((a,b)=>b.count-a.count);
    return {key,label:period.label,firstDay:period.firstDay,lastDay:period.lastDay,
      teacherDays:subset.length,affectedTeachers:new Set(subset.map(row=>row.teacherId)).size,
      // Ties are not a dominant category; the combined day total remains deduplicated.
      dominantCategory:ranks.length && (!ranks[1]||ranks[0].count>ranks[1].count)?ranks[0].category:null};
  });
  const ranking=Array.from(teacherCounts.values()).sort((a,b)=>b.days-a.days||a.teacherName.localeCompare(b.teacherName,'id-ID'));
  return {totalDays:selected.length,affectedTeachers:teacherCounts.size,
    averageDays:teacherCounts.size?selected.length/teacherCounts.size:0,teacherRanking:ranking,buckets};
}
export function changeFromPrevious(current: number, previous: number): {difference:number;percent:number|null} {
  return {difference:current-previous,percent:previous?((current-previous)/previous)*100:null};
}
export function leaveDayCsv(report: LeaveDayReport, start: string, end: string, mode: LeaveDayMode, filter:LeaveDayFilter, expected:ExpectedTeacherDaysSummary|null=null): string {
  const rows: (string|number)[][] = [
    ['Mode',mode,'Mulai',start,'Sampai',end,'Kategori',filter],
    ['Total guru-hari izin',report.totalDays,'Total guru-hari kewajiban (estimasi)',expected?.expectedTeacherDays??'—',
      'Persentase dari kewajiban (estimasi)',teacherDayLeaveRate(report.totalDays,expected)??'—'],
    ['Periode','Tanggal awal','Tanggal akhir','Guru-hari izin','Guru terdampak','Jenis dominan'],
    ...report.buckets.map(row=>[row.label,row.firstDay,row.lastDay,row.teacherDays,row.affectedTeachers,row.dominantCategory??'-']),
    [],['Peringkat guru','Guru','Hari izin'],
    ...report.teacherRanking.map((row,index)=>[index+1,row.teacherName,row.days]),
  ];
  return rows.map(row=>row.map(cell=>`"${String(cell).replace(/"/g,'""')}"`).join(',')).join('\r\n');
}
