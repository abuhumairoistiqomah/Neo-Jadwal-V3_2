import React,{useEffect,useMemo,useRef,useState} from 'react';
import {AlertTriangle,CalendarCheck2,FileDown,RefreshCw} from 'lucide-react';
import type {Teacher,ScheduleItem,JadwalInsidentalItem,KalenderAkademikItem,LogIzinItem} from '../domain/models';
import type {IndividualLeaveProfile} from '../domain/teacherIndividualStatistics';
import {buildDutyHistoryByChunks,summarizeOperationalTeacherActivity,type OperationalTeacherActivity} from '../domain/teacherOperationalStatisticsV319';
import {TeacherOperationalStatisticsV319Repository} from '../infrastructure/repositories/teacherOperationalStatisticsV319Repository';
import {TeacherDutyV319Repository} from '../infrastructure/repositories/teacherDutyV319Repository';
import {OperationalCalendarV319Repository} from '../infrastructure/repositories/operationalCalendarV319Repository';

interface Props{teacher:Teacher;profile:IndividualLeaveProfile;schedules:ScheduleItem[];incidentals:JadwalInsidentalItem[];calendar:KalenderAkademikItem[];logs:LogIzinItem[];}
const dateLabel=(iso:string)=>iso.split('-').reverse().join('/');
const jp=(numbers:ReadonlyArray<number>)=>numbers.length?numbers.map(p=>`JP${p}`).join(', '):'—';
const escapeCsv=(value:unknown)=>{const s=String(value??'');const safe=/^\s*[=+@-]/.test(s)?`'${s}`:s;return `"${safe.replace(/"/g,'""')}"`;};
const dayStatus:Record<string,string>={
 COMPENSATORY_OFF:'Libur pengganti',EVENT_DUTY:'Tugas kegiatan',DUTY_CONFLICT:'Perlu tinjauan',
 TEACHING_AND_LEAVE:'Mengajar parsial (rencana)',TEACHING_PLANNED:'Rencana mengajar',
 LEAVE_RECORDED:'Izin tercatat',REMAINS_ON_DUTY:'Tetap bertugas',NON_KBM:'Non-KBM',
 OUTSIDE_TERM:'Di luar periode KBM',NO_RECORDED_ASSIGNMENT:'Belum ada penugasan',
};
const Stat=({title,value,help}:{title:string;value:number|string;help:string})=><div className="rounded-xl border bg-slate-50 p-3"><div className="text-xs font-bold text-slate-600">{title}</div><div className="my-1 text-2xl font-black text-slate-900">{value}</div><p className="text-xs text-slate-500">{help}</p></div>;
export const TeacherV319OperationalSummary:React.FC<Props>=({teacher,profile,schedules,incidentals,calendar,logs})=>{
 const [report,setReport]=useState<OperationalTeacherActivity|null>(null);
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(false);
 const [showAll,setShowAll]=useState(false);
 const [onlyRelevant,setOnlyRelevant]=useState(true);
 const requestSeq=useRef(0);
 const start=profile.dateStart,end=profile.dateEnd,teacherId=teacher.id || '';
 const load=async()=>{
   const seq=++requestSeq.current;
   setError('');setReport(null);setLoading(true);
   try {
     if(!teacherId||profile.teacherId!==teacherId)throw new Error('Identitas profil izin tidak cocok dengan guru yang dipilih.');
     const [canonical,duties,terms]=await Promise.all([
       new TeacherOperationalStatisticsV319Repository().load(teacherId,start,end),
       new TeacherDutyV319Repository().list(),
       new OperationalCalendarV319Repository().listTerms(),
     ]);
     const days=buildDutyHistoryByChunks({teacher,dateStart:start,dateEnd:end,schedules,incidentals,calendar,logs,profile,duties,terms});
     if(seq===requestSeq.current)setReport(summarizeOperationalTeacherActivity(canonical,days));
   }catch(e){if(seq===requestSeq.current)setError(e instanceof Error?e.message:'Statistik operasional gagal dimuat; angka tidak diasumsikan nol.');}
   finally{if(seq===requestSeq.current)setLoading(false);}
 };
 // Guard results from async reads that finish after the selected teacher/date changes.
 useEffect(()=>{
   let cancelled=false;
   const seq=++requestSeq.current;
   setReport(null);setError('');setLoading(true);
   if(!teacherId||profile.teacherId!==teacherId){setError('Profil guru tidak cocok.');setLoading(false);return;}
   void Promise.all([
     new TeacherOperationalStatisticsV319Repository().load(teacherId,start,end),
     new TeacherDutyV319Repository().list(),new OperationalCalendarV319Repository().listTerms(),
   ]).then(([canonical,duties,terms])=>{
     if(cancelled||seq!==requestSeq.current)return;
     const days=buildDutyHistoryByChunks({teacher,dateStart:start,dateEnd:end,schedules,incidentals,calendar,logs,profile,duties,terms});
     if(!cancelled&&seq===requestSeq.current)setReport(summarizeOperationalTeacherActivity(canonical,days));
   }).catch(e=>{if(!cancelled&&seq===requestSeq.current)setError(e instanceof Error?e.message:'Gagal memuat statistik operasional.');})
    .finally(()=>{if(!cancelled&&seq===requestSeq.current)setLoading(false);});
   return()=>{cancelled=true;};
 },[teacherId,start,end,profile,teacher,schedules,incidentals,calendar,logs]);
 const days=useMemo(()=>report?.operationalDays.filter(d=>!onlyRelevant || d.plannedTeachingPeriods.length>0||d.approvedTeachingLeavePeriods.length>0||d.freeLeavePeriods.length>0||d.officialDuty.length>0||d.warnings.length>0)||[],[report,onlyRelevant]);
 const displayed=showAll?days:days.slice(0,31);
 const exportCsv=()=>{
   if(!report)return;
   const rows:unknown[][]=[['Tanggal','Status operasional (rencana)','JP rencana mengajar','JP izin TEACHING','JP izin FREE/JP0','Tugas resmi','Peringatan']];
   for(const d of report.operationalDays)rows.push([d.date,dayStatus[d.status]||d.status,jp(d.plannedTeachingPeriods),jp(d.approvedTeachingLeavePeriods),jp(d.freeLeavePeriods),d.officialDuty.join(' ; '),d.warnings.join(' ; ')]);
   const content='\uFEFF'+rows.map(row=>row.map(escapeCsv).join(',')).join('\r\n');
   const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));
   const a=document.createElement('a');a.href=url;a.download=`statistik-guru-v319-${start}-${end}.csv`;a.click();URL.revokeObjectURL(url);
 };
 return <section aria-label="Statistik operasional V3.19" className="space-y-4 rounded-2xl border-2 border-teal-200 bg-white p-4 sm:p-6 shadow-sm">
  <div className="flex flex-wrap justify-between items-start gap-3"><div><h2 className="flex items-center gap-2 text-lg font-black text-slate-900"><CalendarCheck2 className="h-5 w-5 text-teal-700"/> V3.19 · Statistik operasional dua lapis</h2><p className="text-xs text-slate-600 mt-1">Angka utama menggunakan RPC V3.18. Rincian kalender RC4 membantu menjelaskan kewajiban, bukan membuktikan presensi fisik.</p></div><div className="no-print flex gap-2"><button onClick={()=>void load()} disabled={loading} className="rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-50"><RefreshCw className="inline h-3 w-3"/> Refresh</button><button disabled={!report} onClick={exportCsv} className="rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-50"><FileDown className="inline h-3 w-3"/> CSV rincian</button></div></div>
  {loading&&<p className="text-sm text-slate-600">Menghitung statistik dari Supabase dan log operasional…</p>}
  {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-800">{error}</p>}
  {report&&<>
   <div className="grid grid-cols-2 gap-2 lg:grid-cols-4"><Stat title="Hari Mengajar Efektif" value={report.canonical.effectiveTeachingDays} help="Tanggal unik; sebagian JP tetap 1 hari"/><Stat title="Hari Izin" value={report.canonical.leaveDays} help="Tanggal unik; dapat beririsan dengan hari mengajar"/><Stat title="JP Mengajar Efektif" value={report.canonical.effectiveTeachingJp} help="JP unik dari jadwal/badal efektif"/><Stat title="JP Izin" value={report.canonical.leaveJp} help="Izin teaching; bukan JP FREE/JP0"/></div>
   <div className="flex flex-wrap gap-4 rounded-xl bg-teal-50 p-3 text-sm text-teal-950"><span><b>Persentase JP Mengajar:</b> {report.teachingPct===null?'—':report.teachingPct.toFixed(1)+'%'}</span><span><b>Persentase JP Izin:</b> {report.leavePct===null?'—':report.leavePct.toFixed(1)+'%'}</span><span><b>Hari parsial (log RC4):</b> {report.daysWithBoth}</span></div>
   <div className="grid grid-cols-2 gap-2 md:grid-cols-4"><Stat title="Hari tugas kegiatan" value={report.eventDutyDays} help="Non-KBM, bukan JP mengajar"/><Stat title="Libur pengganti" value={report.compensatoryDays} help="Bukan izin pribadi"/><Stat title="Hari perlu ditinjau" value={report.reviewDays} help="Benturan atau data kalender belum lengkap"/><Stat title="Tanggal ada izin di RC4" value={report.daysWithApprovedLeave} help="Termasuk FREE/JP0; dapat berbeda dari RPC"/></div>
   <p className="text-xs rounded-xl bg-amber-50 px-3 py-2 text-amber-950"><AlertTriangle className="inline h-4 w-4"/> <b>Jangan jumlahkan Hari Mengajar + Hari Izin sebagai total hari.</b> Keduanya boleh beririsan. Angka V3.18 adalah statistik penugasan/izin, bukan bukti kehadiran. Rincian RC4 memakai snapshot jadwal yang tersedia dan dapat berbeda dengan SQL historis; perbedaan tidak disembunyikan.</p>
   {(report.planningJp!==report.canonical.effectiveTeachingJp||report.recordedTeachingLeaveJp!==report.canonical.leaveJp)&&<p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950"><b>Perlu rekonsiliasi:</b> Log RC4 memuat {report.planningJp} JP rencana mengajar dan {report.recordedTeachingLeaveJp} JP izin teaching, sedangkan RPC resmi memuat {report.canonical.effectiveTeachingJp} JP mengajar dan {report.canonical.leaveJp} JP izin. Ini dua sumber dengan aturan cakupan berbeda (misalnya badal, histori, atau kewajiban kegiatan). Angka resmi tidak ditimpa.</p>}
   <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-black text-slate-900">Drill-down tanggal ({days.length})</h3><label className="no-print flex gap-2 items-center text-xs font-bold"><input type="checkbox" checked={onlyRelevant} onChange={e=>{setOnlyRelevant(e.target.checked);setShowAll(false);}}/> Tanggal dengan penugasan/izin saja</label></div>
   <div className="max-h-[490px] overflow-auto rounded-xl border"><table className="w-full min-w-[830px] text-left text-xs"><thead className="sticky top-0 z-10 bg-slate-100"><tr>{['Tanggal','Kondisi','JP rencana','JP izin','Tugas / libur','Catatan'].map(h=><th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{displayed.map(d=><tr key={d.date} className="border-t align-top"><td className="p-2 whitespace-nowrap font-bold">{dateLabel(d.date)}</td><td className="p-2">{dayStatus[d.status]||d.status}</td><td className="p-2">{jp(d.plannedTeachingPeriods)}</td><td className="p-2">{jp(d.approvedTeachingLeavePeriods)}{d.freeLeavePeriods.length>0&&<div className="text-amber-700">Free/JP0: {jp(d.freeLeavePeriods)}</div>}</td><td className="p-2">{d.officialDuty.join('; ')|| (d.status==='COMPENSATORY_OFF'?'Libur pengganti':'—')}</td><td className="p-2 text-amber-900">{[...d.details,...d.warnings].join('; ')||'—'}</td></tr>)}</tbody></table></div>
   {!showAll&&days.length>31&&<button className="no-print text-xs font-bold text-blue-700" onClick={()=>setShowAll(true)}>Tampilkan seluruh {days.length} tanggal</button>}
  </>}
 </section>;
};
