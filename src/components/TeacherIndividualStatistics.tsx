import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BarChart3, CalendarDays, FileDown, RefreshCw, ShieldAlert, UserRound } from 'lucide-react';
import type { JadwalInsidentalItem, KalenderAkademikItem, LogIzinItem, ScheduleItem, Teacher } from '../domain/models';
import { getSchoolTodayISO } from '../domain/date';
import { buildIndividualTeacherStatistics, type IndividualLeaveProfile, type PatternMode, type LeaveReasonCategory } from '../domain/teacherIndividualStatistics';
import { TeacherIndividualStatisticsRepository } from '../infrastructure/repositories/teacherIndividualStatisticsRepository';
import { SearchableSelect } from './ui/SearchableSelect';

import { T } from '../i18n/LanguageProvider';

interface Props {
  teachers: Teacher[];
  schedules: ScheduleItem[];
  incidentals: JadwalInsidentalItem[];
  academicEvents: KalenderAkademikItem[];
  logs: LogIzinItem[];
  initialTeacher?: string;
  onBack: () => void;
}
const DAYS = ['Senin','Selasa','Rabu','Kamis','Jumat'];
const REASON_FILTERS: Array<{value:'ALL'|LeaveReasonCategory; label:string}> = [
  {value:'ALL',label:'Semua alasan'},
  {value:'SICK_KEYWORD',label:'Terkait sakit'},
  {value:'OTHER',label:'Selain sakit'},
  {value:'UNSPECIFIED',label:'Tanpa alasan'},
];
const sourceText = (value:string) => value === 'APPROVED' ? 'Izin disetujui' :
  value === 'LEGACY_IMPORT' ? 'Histori impor' : value === 'ADMIN_MANUAL' ? 'Input admin' : value;
const scopeText = (value:string) => value === 'FULL_DAY' ? 'Sehari penuh' :
  value === 'PARTIAL' ? 'Sebagian JP' : 'Jenis belum diketahui';
const SCOPES: Array<{id:PatternMode; label:string; details:string}> = [
  {id:'ALL',label:'Semua izin',details:'Seluruh jenis izin, termasuk histori belum terklasifikasi.'},
  {id:'FULL_DAY',label:'Sehari penuh',details:'Hanya pengajuan yang tersimpan sebagai FULL_DAY.'},
  {id:'PARTIAL',label:'Sebagian JP',details:'Hanya pengajuan yang tersimpan sebagai PARTIAL.'},
  {id:'UNKNOWN',label:'Histori lama',details:'Data yang tidak memiliki informasi jenis pengajuan.'},
];
const addDays = (iso:string,n:number) => {
  const [y,m,d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y,m-1,d+n)).toISOString().slice(0,10);
};
const pct = (n:number,d:number) => d ? `${(n/d*100).toFixed(1)}%` : '—';
const formatDay = (date:string) => date.split('-').reverse().join('/');
const dayName = (date:string) => {
  const [year,month,day]=date.split('-').map(Number);
  return DAYS[(new Date(Date.UTC(year,month-1,day)).getUTCDay()+6)%7] || '—';
};
function Metric({label,value,description}:{label:string;value:string|number;description:string}) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-2 text-3xl font-black text-slate-900">{value}</p>
    <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p>
  </div>;
}
const toneFor = (absent:number,scheduled:number) => {
  if (!scheduled) return '#f1f5f9';
  const fraction = absent/scheduled;
  if (fraction >= 0.5) return '#fcd34d';
  if (fraction >= 0.2) return '#fde68a';
  if (absent) return '#fef3c7';
  return '#f8fafc';
};
const modeMatch = (scope:PatternMode, type:string) => scope==='ALL' || scope===type;
const hasHomeroom = (teacher:Teacher|undefined) => {
  const fields = [teacher?.wali_kelas,teacher?.pendamping_kelas];
  return fields.some(field => Boolean(String(field||'').trim()) && !/^(tidak|none|-|no)$/i.test(String(field).trim()));
};

export const TeacherIndividualStatistics:React.FC<Props> = ({teachers,schedules,incidentals,academicEvents,logs,initialTeacher,onBack}) => {
  const today = getSchoolTodayISO();
  const [teacherId,setTeacherId] = useState(() => teachers.find(t=>t.nama===initialTeacher)?.id || '');
  const [start,setStart] = useState(addDays(today,-89));
  const [end,setEnd] = useState(today);
  const [profile,setProfile] = useState<IndividualLeaveProfile|null>(null);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState('');
  const [mode,setMode] = useState<PatternMode>('ALL');
  const [onlyAbsent,setOnlyAbsent] = useState(true);
  const [showAllDates,setShowAllDates] = useState(false);
  const [weekdayFilter,setWeekdayFilter] = useState('ALL');
  const [reasonFilter,setReasonFilter] = useState<'ALL'|LeaveReasonCategory>('ALL');
  const [reasonSearch,setReasonSearch] = useState('');
  const [showAllReasons,setShowAllReasons] = useState(false);
  const sortedTeachers = useMemo(()=>teachers.filter(t=>t.id).sort((a,b)=>a.nama.localeCompare(b.nama,'id-ID')), [teachers]);
  const teacher = teachers.find(t=>t.id===teacherId);
  const stats = useMemo(() => profile && teacher ? buildIndividualTeacherStatistics({
    profile,teacherName:teacher.nama,schedules,incidentals,logs,academicEvents,
    hasHomeroomDuty:hasHomeroom(teacher),
  }) : null,[profile,teacher,schedules,incidentals,logs,academicEvents]);
  const load = async () => {
    setError(''); setProfile(null); setShowAllDates(false);
    if (!teacherId) return;
    if (!start || !end || end < start || end > today || addDays(start,180) < end) {
      setError('Rentang tanggal wajib valid, tidak boleh melewati hari ini, dan maksimal 181 hari.');return;
    }
    setLoading(true);
    try {setProfile(await new TeacherIndividualStatisticsRepository().load(teacherId,start,end));}
    catch(e) {setError(e instanceof Error ? e.message : 'Gagal memuat statistik guru.');}
    finally {setLoading(false);}
  };
  useEffect(()=>{if (!teacherId && sortedTeachers.length>0 && initialTeacher) {
    setTeacherId(sortedTeachers.find(t=>t.nama===initialTeacher)?.id || '');
  }},[teacherId,sortedTeachers,initialTeacher]);
  useEffect(()=>{if (teacherId) void load();
    // Reload when teacher changes. Custom date inputs require Apply.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[teacherId]);
  const visibleReasonRecords = useMemo(() => (stats?.leaveReasonRecords || []).filter(record => {
    if (reasonFilter !== 'ALL' && record.category !== reasonFilter) return false;
    return record.reason.toLocaleLowerCase('id-ID').includes(reasonSearch.trim().toLocaleLowerCase('id-ID'));
  }),[stats,reasonFilter,reasonSearch]);
  const visibleReasonSummary = useMemo(() => (stats?.leaveReasonSummary || []).filter(record => {
    if (reasonFilter !== 'ALL' && record.category !== reasonFilter) return false;
    return record.reason.toLocaleLowerCase('id-ID').includes(reasonSearch.trim().toLocaleLowerCase('id-ID'));
  }),[stats,reasonFilter,reasonSearch]);
  const shownReasons = showAllReasons ? visibleReasonRecords : visibleReasonRecords.slice(0,20);
  const reasonDates = new Set(visibleReasonRecords.map(record=>record.date)).size;
  const reasonJps = visibleReasonRecords.reduce((sum,record)=>sum+record.totalJp,0);
  const selected = stats?.daysByMode[mode] || [];
  const affectedDates = useMemo(() => (stats?.chronological || []).filter(row => {
    if (weekdayFilter!=='ALL' && dayName(row.date)!==weekdayFilter) return false;
    const teachingAbsent = row.absentPeriods.some(slot => modeMatch(mode,slot.scope));
    const otherAbsent = mode==='ALL' && (row.jpFreeAbsent>0 || row.jp0Absent);
    return !onlyAbsent || teachingAbsent || otherAbsent;
  }).slice().reverse(),[stats,mode,weekdayFilter,onlyAbsent]);
  const displayDates = showAllDates ? affectedDates : affectedDates.slice(0,30);
  const reviewSlotsForMode = selected.flatMap(day => day.byPeriod
    .filter(cell => cell.scheduled>=5 && cell.absent>=2)
    .map(cell => ({weekday:day.weekday,period:cell.period,absent:cell.absent,
      scheduled:cell.scheduled,percent:Math.round(cell.absent/cell.scheduled*1000)/10})))
    .sort((a,b)=>b.percent-a.percent||b.absent-a.absent);
  const selectedAbsent = selected.reduce((sum,day)=>sum+day.absentTeachingJp,0);
  const selectedScheduled = stats?.expectedTeachingJp || 0;
  const needMoreData = selected.reduce((count,day)=>count+day.byPeriod.filter(cell=>cell.scheduled>=5).length,0)===0;

  return <div id="individual-teacher-report" className="space-y-6 pb-8">
    <style>{`@media print {
      @page { size: A4 landscape; margin: 12mm; }
      body * { visibility: hidden !important; }
      #individual-teacher-report, #individual-teacher-report * { visibility: visible !important; }
      #individual-teacher-report { position: absolute !important; inset: 0 auto auto 0; width: 100% !important; background: white !important; }
      #individual-teacher-report .no-print { display: none !important; }
      #individual-teacher-report section, #individual-teacher-report .print-safe { break-inside: avoid; }
      #individual-teacher-report .overflow-x-auto { overflow: visible !important; }
      #individual-teacher-report table { font-size: 10px !important; min-width: 0 !important; }
    }`}</style>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <button type="button" onClick={onBack} className="no-print mb-3 inline-flex items-center gap-2 text-sm font-semibold text-blue-700"><ArrowLeft className="h-4 w-4"/> Kembali</button>
        <h1 className="flex items-center gap-2 text-2xl font-black text-slate-900"><UserRound className="h-6 w-6 text-blue-600"/> Statistik Individu Guru</h1>
        <p className="mt-1 text-sm text-slate-500">Evaluasi JP izin, pola hari/JP, dan histori berdasarkan data Supabase.</p>
        {teacher && <p className="mt-2 font-bold text-slate-800">{teacher.nama} • {formatDay(start)}–{formatDay(end)}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">Hanya admin / petugas berwenang</span>
        {stats && <button type="button" onClick={()=>window.print()} className="no-print inline-flex items-center gap-2 rounded-xl border border-blue-200 px-3 py-2 text-sm font-bold text-blue-800 hover:bg-blue-50"><FileDown className="h-4 w-4"/> Cetak / Simpan PDF</button>}
      </div>
    </div>
    <section className="no-print rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className="text-xs font-bold text-slate-600">Guru
          <SearchableSelect className="mt-1" value={teacherId} onChange={setTeacherId} placeholder="Ketik nama guru..." options={sortedTeachers.map(t=>({value:t.id!,label:t.nama}))}/>
        </label>
        <label className="text-xs font-bold text-slate-600">Dari tanggal
          <input type="date" value={start} max={today} onChange={e=>setStart(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm"/>
        </label>
        <label className="text-xs font-bold text-slate-600">Sampai tanggal
          <input type="date" value={end} max={today} onChange={e=>setEnd(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm"/>
        </label>
      </div>
      <button type="button" disabled={loading||!teacherId} onClick={()=>void load()} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-black text-white disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading?'animate-spin':''}`}/>{loading?'Menghitung...':'Tampilkan Statistik'}</button>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    </section>
    {!teacherId && <p className="rounded-xl bg-slate-100 p-5 text-sm text-slate-500">Pilih satu guru untuk melihat statistiknya.</p>}
    {stats && profile && <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="JP izin mengajar" value={`${stats.recordedTeachingLeaveJp} JP`} description="Hanya JP1–JP6 yang ditinggalkan; tidak menghitung JP0/Free."/>
        <Metric label="Total JP ketidakhadiran" value={`${stats.totalLeaveJp} JP`} description={`${stats.recordedTeachingLeaveJp} mengajar + ${stats.homeroomLeaveJp} JP0 + ${stats.freeLeaveJp} Free.`}/>
        <Metric label="Rasio izin mengajar" value={stats.teachingLeavePct===null?'—':`${stats.teachingLeavePct.toFixed(1)}%`} description={`${stats.comparableTeachingLeaveJp}/${stats.expectedTeachingJp} JP efektif terjadwal yang cocok.`}/>
        <Metric label="Rasio ketidakhadiran operasional (estimasi)" value={stats.operationalLeavePct===null?'—':`${stats.operationalLeavePct.toFixed(1)}%`} description={`${stats.comparableOperationalLeaveJp}/${stats.estimatedRequiredPresenceJp} JP wajib hadir nominal, termasuk JP0 jika wali/pendamping.`}/>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 print-safe">
        <Metric label="Beban master saat ini" value={`${stats.regularWeeklyJp} JP/minggu`} description="Kelas gabung satu JP."/>
        <Metric label="JP mengajar terjadwal" value={`${stats.expectedTeachingJp} JP`} description="Jadwal efektif pada periode yang dipilih."/>
        <Metric label="JP0 Homeroom izin" value={`${stats.homeroomLeaveJp} JP`} description="Dipisahkan dari JP mengajar."/>
        <Metric label="JP Free izin" value={`${stats.freeLeaveJp} JP`} description="Dicatat untuk ketidakhadiran operasional."/>
      </div>
      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-950">
        <ShieldAlert className="h-5 w-5 shrink-0"/>
        <p><strong>Catatan validitas:</strong> JP izin berasal dari permohonan APPROVED dan log badal historis aktif yang dideduplikasi. Penyebut mengajar direkonstruksi memakai <strong>jadwal efektif dari data saat ini</strong>, bukan snapshot historis yang dijamin. Rasio operasional adalah <strong>estimasi</strong> berdasarkan JP wajib hadir Senin–Kamis 1–6, Jumat 1–3, dan JP0 bagi wali/pendamping (libur seluruh sekolah dikecualikan bila tercatat). Jangan jadikan angka ini dasar tunggal penindakan atau penolakan izin.</p>
      </div>
      {stats.unmatchedHistoricalLeaveJp>0 && <p className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm font-semibold text-orange-900">Ada {stats.unmatchedHistoricalLeaveJp} JP izin mengajar historis yang tidak cocok dengan jadwal efektif saat ini. Tetap dihitung sebagai JP izin, tetapi tidak masuk rasio mengajar maupun heatmap agar tidak menghasilkan persentase palsu.</p>}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm space-y-4">
        <h2 className="flex items-center gap-2 text-lg font-black text-slate-900"><BarChart3 className="h-5 w-5 text-indigo-600"/> Heatmap pola izin — Hari × JP</h2>
        <div className="no-print flex flex-wrap gap-2" role="group" aria-label="Jenis izin yang dianalisis">
          {SCOPES.map(choice=><button key={choice.id} type="button" aria-pressed={mode===choice.id} onClick={()=>{setMode(choice.id);setShowAllDates(false);}} className={`rounded-lg border px-3 py-2 text-xs font-bold ${mode===choice.id?'bg-indigo-600 border-indigo-600 text-white':'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'}`}>{choice.label}</button>)}
        </div>
        <p className="text-sm text-slate-500">{SCOPES.find(item=>item.id===mode)?.details} Warna = konsentrasi JP izin terhadap kesempatan mengajar pada slot yang sama.</p>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-xl border border-slate-200 p-3"><strong><T>{"Sehari penuh"}</T></strong><p>{stats.teachingByScope.FULL_DAY} JP / {stats.absentDatesByScope.FULL_DAY} tanggal</p></div>
          <div className="rounded-xl border border-slate-200 p-3"><strong><T>{"Sebagian JP"}</T></strong><p>{stats.teachingByScope.PARTIAL} JP / {stats.absentDatesByScope.PARTIAL} tanggal</p></div>
          <div className="rounded-xl border border-slate-200 p-3"><strong>Belum terklasifikasi</strong><p>{stats.teachingByScope.UNKNOWN} JP / {stats.absentDatesByScope.UNKNOWN} tanggal</p></div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">JP izin cocok — mode ini</p><p className="text-xl font-black">{selectedAbsent} <T>{"JP"}</T></p></div>
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Kesempatan mengajar</p><p className="text-xl font-black">{selectedScheduled} <T>{"JP"}</T></p></div>
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Rasio sesuai mode</p><p className="text-xl font-black">{pct(selectedAbsent,selectedScheduled)}</p></div>
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Jenis historis tidak diketahui</p><p className="text-xl font-black">{stats.teachingByScope.UNKNOWN} <T>{"JP"}</T></p></div>
        </div>
        <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-center text-xs border-separate border-spacing-1">
          <thead><tr><th className="p-2 text-left">Hari</th>{[1,2,3,4,5,6].map(p=><th key={p} className="p-2"><T>{"JP"}</T>{p}</th>)}<th className="p-2">Total</th></tr></thead>
          <tbody>{selected.map((d,i)=><tr key={d.weekday}>
            <th className="p-2 text-left font-bold text-slate-800">{DAYS[i]}</th>
            {d.byPeriod.map(cell=><td key={cell.period} title={`${cell.absent} izin dari ${cell.scheduled} kesempatan mengajar`} className="rounded-lg p-2" style={{backgroundColor:toneFor(cell.absent,cell.scheduled)}}><span className="font-bold">{cell.absent}/{cell.scheduled}</span><span className="block text-[10px] text-slate-600">{pct(cell.absent,cell.scheduled)}</span></td>)}
            <td className="p-2 font-black">{d.absentTeachingJp}/{d.scheduledJp}<span className="block text-slate-500">{pct(d.absentTeachingJp,d.scheduledJp)}</span></td>
          </tr>)}</tbody>
        </table></div>
        <p className="text-xs text-slate-600">Penyebut tetap semua kesempatan mengajar pada slot itu, untuk setiap mode. Misalnya 2 izin parsial dari 8 kali Senin JP4 = 25%. Nilai 0/0 berarti tidak ada kesempatan mengajar, bukan bukti selalu hadir.</p>
        {needMoreData && <p className="rounded-lg bg-slate-100 p-3 text-xs text-slate-600">Banyak sel belum mempunyai setidaknya 5 kesempatan mengajar pada periode ini. Perpanjang periode sebelum menyimpulkan kecenderungan.</p>}
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm space-y-3">
        <h2 className="text-lg font-black text-slate-900">Slot dengan konsentrasi izin untuk ditinjau</h2>
        <p className="text-xs text-slate-600">Daftar eksploratif sesuai mode di atas: minimal 5 kesempatan dan 2 JP izin pada slot yang sama. Bukan deteksi niat, diagnosis, atau dasar otomatis membatasi izin.</p>
        {reviewSlotsForMode.length===0 ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Belum ada slot yang memenuhi batas data minimal untuk peninjauan.</p>
          : <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{reviewSlotsForMode.slice(0,6).map(slot=><div key={`${slot.weekday}-${slot.period}`} className="rounded-xl border border-amber-200 bg-amber-50 p-3"><p className="text-sm font-extrabold text-amber-950">{DAYS[slot.weekday-1]} • JP{slot.period}</p><p className="text-xl font-black">{slot.percent.toFixed(1)}%</p><p className="text-xs">{slot.absent} JP izin / {slot.scheduled} kesempatan</p></div>)}</div>}
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-black"><CalendarDays className="h-5 w-5 text-indigo-600"/> Kronologi per tanggal dan JP</h2>
        <p className="text-sm text-slate-500">Satu baris = satu tanggal. Tanda berwarna menunjukkan JP mengajar yang ditinggalkan; JP Free dan JP0 ditampilkan terpisah. Gunakan filter di atas untuk melihat jenis izin.</p>
        <div className="no-print flex flex-wrap items-center gap-3">
          <label className="text-xs font-bold text-slate-600">Hari:
            <select value={weekdayFilter} onChange={e=>{setWeekdayFilter(e.target.value);setShowAllDates(false);}} className="ml-2 rounded-lg border border-slate-200 bg-white p-2"><option value="ALL">Semua hari</option>{DAYS.map(day=><option key={day} value={day}>{day}</option>)}</select>
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={onlyAbsent} onChange={e=>{setOnlyAbsent(e.target.checked);setShowAllDates(false);}}/> Tanggal ada izin saja</label>
        </div>
        <div className="overflow-x-auto"><table className="w-full min-w-[670px] text-center text-xs border-separate border-spacing-1">
          <thead><tr><th className="p-2 text-left"><T>{"Tanggal"}</T></th>{[1,2,3,4,5,6].map(p=><th key={p} className="p-2"><T>{"JP"}</T>{p}</th>)}<th className="p-2">JP0</th><th className="p-2">JP Free</th></tr></thead>
          <tbody>{displayDates.map(row=><tr key={row.date}><th className="whitespace-nowrap p-2 text-left font-bold text-slate-700">{dayName(row.date)}, {formatDay(row.date)}</th>
            {[1,2,3,4,5,6].map(p=>{
              const absent = row.absentPeriods.find(slot=>slot.period===p && modeMatch(mode,slot.scope));
              const scheduled = row.scheduledPeriods.includes(p);
              return <td key={p} className={`rounded-md p-2 ${absent?'bg-amber-300 text-amber-950 font-black':scheduled?'bg-blue-50 text-blue-800':'bg-slate-50 text-slate-400'}`} title={absent?`Izin ${absent.scope==='FULL_DAY'?'sehari penuh':absent.scope==='PARTIAL'?'parsial':'histori tanpa jenis'}`:scheduled?'Mengajar terjadwal':'Tidak terjadwal'}>{absent?'I':scheduled?'•':'—'}</td>;
            })}
            <td className="p-2">{mode==='ALL'&&row.jp0Absent?'✓':'—'}</td><td className="p-2">{mode==='ALL'&&row.jpFreeAbsent?row.jpFreeAbsent:'—'}</td>
          </tr>)}</tbody>
        </table></div>
        {!displayDates.length && <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">Tidak ada tanggal yang cocok dengan filter.</p>}
        {!showAllDates && affectedDates.length>30 && <button type="button" onClick={()=>setShowAllDates(true)} className="no-print text-sm font-bold text-blue-700">Tampilkan seluruh {affectedDates.length} tanggal</button>}
        <p className="text-xs text-slate-500">I = JP izin mengajar, • = ada jadwal, — = tidak terjadwal. Catatan legacy yang tidak cocok dengan jadwal saat ini ditandai sebagai ketidakcocokan di bagian atas dan tidak diposisikan sebagai izin pada slot grafis.</p>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-black text-slate-900">Rekap seluruh alasan izin (internal)</h2>
        <p className="text-sm text-slate-600">Menampilkan alasan <strong>persis sesuai catatan izin</strong>, termasuk pendampingan lomba, tugas sekolah, keperluan keluarga, sakit, atau alasan lain. Tidak hanya izin sakit.</p>
        <div className="no-print flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="text-xs font-bold text-slate-600">Kelompok alasan
            <select value={reasonFilter} onChange={e=>{setReasonFilter(e.target.value as 'ALL'|LeaveReasonCategory);setShowAllReasons(false);}} className="mt-1 block rounded-lg border border-slate-200 bg-white p-2.5 text-sm">
              {REASON_FILTERS.map(filter=><option key={filter.value} value={filter.value}>{filter.label}</option>)}
            </select>
          </label>
          <label className="flex-1 text-xs font-bold text-slate-600">Cari kata dalam alasan
            <input type="search" value={reasonSearch} onChange={e=>{setReasonSearch(e.target.value);setShowAllReasons(false);}} placeholder="Contoh: lomba, tugas sekolah, keluarga..." className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm" />
          </label>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center sm:text-left">
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Tanggal izin</p><p className="text-xl font-black">{reasonDates}</p></div>
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Total JP izin</p><p className="text-xl font-black">{reasonJps}</p></div>
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Jenis alasan tercatat</p><p className="text-xl font-black">{visibleReasonSummary.length}</p></div>
        </div>
        {visibleReasonSummary.length > 0 && <div className="space-y-2">
          <h3 className="text-sm font-black text-slate-800">Alasan paling sering tercatat</h3>
          <div className="overflow-x-auto"><table className="w-full min-w-[530px] text-sm">
            <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-2 pr-3">Alasan sebagaimana tercatat</th><th className="px-2"><T>{"Tanggal"}</T></th><th className="px-2">JP mengajar</th><th className="px-2">JP0 + Free</th><th className="px-2">Total JP</th></tr></thead>
            <tbody>{visibleReasonSummary.map(row=><tr key={row.reason.toLocaleLowerCase('id-ID')} className="border-b border-slate-100"><td className="py-2 pr-3 font-medium break-words">{row.reason}</td><td className="px-2">{row.dates}</td><td className="px-2">{row.teachingJp}</td><td className="px-2">{row.homeroomJp+row.freeJp}</td><td className="px-2 font-bold">{row.totalJp}</td></tr>)}</tbody>
          </table></div>
        </div>}
        <h3 className="text-sm font-black text-slate-800">Rincian alasan menurut tanggal</h3>
        {visibleReasonRecords.length ? <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-sm">
          <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-2 pr-3"><T>{"Tanggal"}</T></th><th className="pr-3">Alasan asli</th><th className="px-2">Jenis izin</th><th className="px-2">JP mengajar</th><th className="px-2">JP0</th><th className="px-2">Free</th><th className="px-2">Total</th><th className="pl-2">Sumber</th></tr></thead>
          <tbody>{shownReasons.map(row=><tr key={`${row.date}|${row.reason}|${row.source}|${row.requestType}`} className="border-b border-slate-100"><td className="whitespace-nowrap py-3 pr-3">{dayName(row.date)}, {formatDay(row.date)}</td><td className="min-w-[150px] pr-3 break-words">{row.reason}</td><td className="whitespace-nowrap px-2 text-xs">{scopeText(row.requestType)}</td><td className="px-2">{row.teachingJp}</td><td className="px-2">{row.homeroomJp}</td><td className="px-2">{row.freeJp}</td><td className="px-2 font-bold">{row.totalJp}</td><td className="whitespace-nowrap pl-2 text-xs text-slate-500">{sourceText(row.source)}</td></tr>)}</tbody>
        </table></div> : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Tidak ada alasan izin yang tercatat sesuai filter dan periode ini.</p>}
        {!showAllReasons && visibleReasonRecords.length > 20 && <button type="button" onClick={()=>setShowAllReasons(true)} className="no-print text-sm font-bold text-blue-700">Tampilkan seluruh {visibleReasonRecords.length} catatan tanggal/alasan</button>}
        <p className="text-xs text-slate-500">Filter “terkait sakit” hanya mendeteksi kata kunci pada teks; ini bukan diagnosis atau penentuan keabsahan izin. Alasan lain tetap ditampilkan apa adanya. Satu tanggal bisa memiliki lebih dari satu alasan; JP kelas gabungan dihitung sekali. Hanya izin disetujui dan catatan historis aktif yang tersedia pada data sumber.</p>
      </section>
      <p className="text-xs text-slate-500">Laporan internal — gunakan untuk memeriksa distribusi dan klarifikasi, bukan menilai kesengajaan. Jumlah kesempatan, jadwal yang berubah, persetujuan resmi, dan konteks ketidakhadiran perlu diperiksa sebelum keputusan administratif.</p>
    </>}
  </div>;
};
