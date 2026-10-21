import React,{useCallback,useMemo,useState} from 'react';
import {CalendarCheck2,RefreshCw,ShieldAlert,AlertTriangle,FileDown} from 'lucide-react';
import type {Teacher,ScheduleItem,JadwalInsidentalItem,KalenderAkademikItem,LogIzinItem} from '../domain/models';
import {getSchoolTodayISO} from '../domain/date';
import {addIsoDays,buildTeacherDutyLog,dutyLogSummary,validateDutyLogRange,type RecordedDutyDay,type RecordedDayStatus} from '../domain/teacherDutyLogV319';
import {TeacherDutyV319Repository} from '../infrastructure/repositories/teacherDutyV319Repository';
import {OperationalCalendarV319Repository} from '../infrastructure/repositories/operationalCalendarV319Repository';
import {TeacherIndividualStatisticsRepository} from '../infrastructure/repositories/teacherIndividualStatisticsRepository';
import {getCurrentUserContext} from '../infrastructure/auth/supabaseAuthRepository';

interface Props{teachers:Teacher[];schedules:ScheduleItem[];incidentals:JadwalInsidentalItem[];calendar:KalenderAkademikItem[];logs:LogIzinItem[];}
const titleFor:Record<RecordedDayStatus,string>={
 COMPENSATORY_OFF:'Libur pengganti',EVENT_DUTY:'Tugas kegiatan',DUTY_CONFLICT:'Perlu peninjauan',
 TEACHING_AND_LEAVE:'Mengajar + izin parsial',TEACHING_PLANNED:'Dijadwalkan mengajar',
 LEAVE_RECORDED:'Izin APPROVED tercatat',REMAINS_ON_DUTY:'Tetap bertugas',
 NON_KBM:'KBM terkait dinonaktifkan',OUTSIDE_TERM:'Di luar periode KBM',
 NO_RECORDED_ASSIGNMENT:'Belum ada kewajiban tercatat',
};
const colors:Partial<Record<RecordedDayStatus,string>>={
 COMPENSATORY_OFF:'bg-slate-100 text-slate-700',EVENT_DUTY:'bg-indigo-100 text-indigo-900',
 DUTY_CONFLICT:'bg-red-100 text-red-900',TEACHING_AND_LEAVE:'bg-amber-100 text-amber-900',
 TEACHING_PLANNED:'bg-emerald-100 text-emerald-900',LEAVE_RECORDED:'bg-orange-100 text-orange-900',
 REMAINS_ON_DUTY:'bg-blue-100 text-blue-900',NON_KBM:'bg-slate-100 text-slate-700',
};
const formatDate=(s:string)=>s.split('-').reverse().join('/');
const displayJp=(values:readonly number[])=>values.length?values.map(p=>`JP${p}`).join(', '):'—';
const csvEscape=(v:unknown)=>{ const raw=String(v??''); const safe=/^[\s]*[=+@-]/.test(raw)?`'${raw}`:raw; return `"${safe.replace(/"/g,'""')}"`; };
export const TeacherDutyLogV319Panel:React.FC<Props>=({teachers,schedules,incidentals,calendar,logs})=>{
 const today=getSchoolTodayISO();
 const [dateStart,setDateStart]=useState(addIsoDays(today,-6));
 const [dateEnd,setDateEnd]=useState(today);
 const [teacherId,setTeacherId]=useState('');
 const [filter,setFilter]=useState('');
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const [result,setResult]=useState<{teacherId:string;start:string;end:string;days:RecordedDutyDay[]}|null>(null);
 const available=useMemo(()=>teachers.filter(t=>t.id).slice().sort((a,b)=>a.nama.localeCompare(b.nama,'id-ID')),[teachers]);
 const filtered=useMemo(()=>available.filter(t=>t.nama.toLocaleLowerCase('id-ID').includes(filter.trim().toLocaleLowerCase('id-ID'))),[available,filter]);
 const load=useCallback(async()=>{
  setError('');setResult(null);
  const teacher=available.find(t=>t.id===teacherId);
  if(!teacher?.id){setError('Pilih satu guru terlebih dahulu.');return;}
  const invalid=validateDutyLogRange(dateStart,dateEnd);
  if(invalid){setError(invalid);return;}
  setLoading(true);
  try{
    const user=await getCurrentUserContext();
    if(!user?.roles.some(r=>r==='ADMIN'||r==='WAKASEK'))throw new Error('Akses hanya untuk ADMIN/WAKASEK yang terautentikasi Supabase.');
    // Each read must succeed; never claim zero duty/leave when one source is unavailable.
    const [profile,duties,terms]=await Promise.all([
      new TeacherIndividualStatisticsRepository().load(teacher.id,dateStart,dateEnd),
      new TeacherDutyV319Repository().list(),
      new OperationalCalendarV319Repository().listTerms(),
    ]);
    const days=buildTeacherDutyLog({teacher,dateStart,dateEnd,schedules,incidentals,calendar,logs,profile,duties,terms});
    setResult({teacherId:teacher.id,start:dateStart,end:dateEnd,days});
  }catch(e){setError(e instanceof Error?e.message:'Gagal menyusun log. Tidak ada status yang diasumsikan.');}
  finally{setLoading(false);}
 },[teacherId,dateStart,dateEnd,available,schedules,incidentals,calendar,logs]);
 const summary=useMemo(()=>result?dutyLogSummary(result.days):null,[result]);
 const download=()=>{
  if(!result)return;
  const table=[['Tanggal','Status operasional','JP rencana mengajar','JP izin teaching approved','JP izin FREE/JP0','Tugas resmi','Catatan','Peringatan']];
  for(const d of result.days)table.push([d.date,titleFor[d.status],displayJp(d.plannedTeachingPeriods),displayJp(d.approvedTeachingLeavePeriods),displayJp(d.freeLeavePeriods),d.officialDuty.join('; '),d.details.join('; '),d.warnings.join('; ')]);
  const csv='\uFEFF'+table.map(row=>row.map(csvEscape).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=`log-kewajiban-guru-v319-rc4-${result.start}-${result.end}.csv`;a.click();URL.revokeObjectURL(url);
 };
 return <section className="space-y-4 rounded-2xl border bg-white p-4 md:p-5" aria-label="RC4 Log Kewajiban Masuk Guru">
  <div><h2 className="font-black text-lg flex items-center gap-2"><CalendarCheck2 className="w-5 h-5 text-teal-700"/>RC4 · Log Kewajiban Masuk Guru</h2>
   <p className="text-sm text-slate-600">Rekonstruksi rencana mengajar, izin APPROVED, penugasan, dan libur pengganti berdasarkan data tersimpan. <strong>Bukan presensi, bukan bukti hadir fisik, bukan penilaian kinerja.</strong></p></div>
  <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 items-end">
   <label className="text-sm font-bold space-y-1">Cari guru<input className="block w-full rounded-xl border p-2 text-sm font-normal" placeholder="Ketik nama guru" aria-label="Cari guru pada log" value={filter} onChange={e=>setFilter(e.currentTarget.value)}/></label>
   <label className="text-sm font-bold space-y-1">Nama guru<select aria-label="Guru untuk log kewajiban" className="block w-full rounded-xl border p-2 text-sm font-normal" value={teacherId} onChange={e=>{setTeacherId(e.currentTarget.value);setResult(null);}}><option value="">Pilih guru</option>{filtered.map(t=><option key={t.id!} value={t.id!}>{t.nama}</option>)}{teacherId&&!filtered.some(t=>t.id===teacherId)&&available.filter(t=>t.id===teacherId).map(t=><option key={t.id!} value={t.id!}>{t.nama}</option>)}</select></label>
   <label className="text-sm font-bold space-y-1">Mulai<input type="date" aria-label="Awal log kewajiban" className="block w-full rounded-xl border p-2 text-sm font-normal" value={dateStart} onChange={e=>{setDateStart(e.currentTarget.value);setResult(null);}}/></label>
   <label className="text-sm font-bold space-y-1">Selesai<input type="date" aria-label="Akhir log kewajiban" className="block w-full rounded-xl border p-2 text-sm font-normal" value={dateEnd} onChange={e=>{setDateEnd(e.currentTarget.value);setResult(null);}}/></label>
  </div>
  <div className="flex flex-wrap items-center gap-2"><button disabled={loading||!teacherId} onClick={()=>void load()} className="inline-flex gap-2 items-center rounded-xl bg-teal-700 px-4 py-2 text-white font-bold text-sm disabled:opacity-50"><RefreshCw className={`w-4 h-4 ${loading?'animate-spin':''}`}/>{loading?'Mengambil data…':'Buat / Refresh Log'}</button>
   <button disabled={!result} onClick={download} className="inline-flex gap-2 items-center rounded-xl border px-4 py-2 font-bold text-sm disabled:opacity-40"><FileDown className="w-4 h-4"/>Unduh CSV</button>
   <span className="text-xs text-slate-500">Maksimal 31 hari per guru • Snapshot dibangun saat tombol diklik</span></div>
  {error&&<p role="alert" className="text-sm rounded-xl bg-red-50 text-red-800 p-3 flex gap-2"><ShieldAlert className="w-5 h-5 shrink-0"/>{error}</p>}
  {summary&&<><div className="grid grid-cols-2 md:grid-cols-5 gap-2">{[
   ['Hari rencana mengajar',summary.daysWithPlannedTeaching],['Hari ada izin',summary.daysWithApprovedLeave],
   ['Hari tugas kegiatan',summary.daysWithDuty],['Hari libur pengganti',summary.compensatoryDays],
   ['Hari perlu review',summary.daysToReview]
  ].map(([name,value])=><div key={name} className="rounded-xl border bg-slate-50 p-3"><p className="text-xs text-slate-600">{name}</p><p className="text-2xl font-black">{value}</p></div>)}</div>
  <p className="text-xs text-amber-900 bg-amber-50 p-3 rounded-xl">Hari mengajar dan Hari Izin <strong>boleh beririsan</strong>; jangan jumlahkan keduanya menjadi total hari. JP izin FREE/JP0 dipisahkan dari JP izin mengajar. Semua JP mengajar yang ditampilkan adalah <strong>rencana/penugasan</strong>, belum diverifikasi sebagai pembelajaran terlaksana.</p>
  <div className="max-h-[540px] overflow-auto rounded-xl border"><table className="min-w-[1050px] w-full text-xs border-collapse"><thead className="sticky top-0 z-10 bg-slate-100"><tr>{['Tanggal','Status','JP rencana mengajar','JP izin mengajar','JP izin FREE/JP0','Tugas/kegiatan & alasan','Peringatan'].map(h=><th key={h} className="text-left p-3 border-b">{h}</th>)}</tr></thead><tbody>{result!.days.map(d=><tr key={d.date} className="border-b align-top"><td className="p-3 whitespace-nowrap font-bold">{formatDate(d.date)}</td><td className="p-3"><span className={`rounded-lg px-2 py-1 inline-block font-bold ${colors[d.status]||'bg-slate-100 text-slate-800'}`}>{titleFor[d.status]}</span></td><td className="p-3">{displayJp(d.plannedTeachingPeriods)}</td><td className="p-3">{displayJp(d.approvedTeachingLeavePeriods)}</td><td className="p-3">{displayJp(d.freeLeavePeriods)}</td><td className="p-3">{[...d.officialDuty,...d.details].join(' • ')||'—'}</td><td className="p-3 text-amber-900">{d.warnings.length?<span className="flex gap-1"><AlertTriangle className="w-4 h-4 shrink-0"/>{d.warnings.join(' | ')}</span>:'—'}</td></tr>)}</tbody></table></div>
  <p className="text-xs text-slate-500">Log ini adalah tampilan baca-saja. Revisi sumber dilakukan melalui Kalender Akademik, Penugasan Guru, atau Approval Izin; tidak ada perubahan data melalui halaman ini.</p></>}
 </section>;
};
