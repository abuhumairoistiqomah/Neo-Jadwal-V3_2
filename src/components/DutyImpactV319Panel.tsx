import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {AlertTriangle,CheckCircle2,RefreshCw} from 'lucide-react';
import type {Teacher,ScheduleItem,JadwalInsidentalItem,KalenderAkademikItem,LogIzinItem} from '../domain/models';
import {findDutyTeachingImpacts,findDutySubstituteConflicts,type TeacherDutySnapshot} from '../domain/dutyResolutionV319';
import {TeacherDutyV319Repository} from '../infrastructure/repositories/teacherDutyV319Repository';

interface Props {
 teachers:Teacher[];schedules:ScheduleItem[];incidentals:JadwalInsidentalItem[];
 calendar:KalenderAkademikItem[];logs:LogIzinItem[];today:string;
 onOpenDuty?:()=>void;
}
export const DutyImpactV319Panel:React.FC<Props>=({teachers,schedules,incidentals,calendar,logs,today,onOpenDuty})=>{
 const [date,setDate]=useState(today);
 const [state,setState]=useState<{date:string;data:TeacherDutySnapshot|null;error:string}>({date:'',data:null,error:''});
 const [refreshCounter,setRefreshCounter]=useState(0);
 const repo=useMemo(()=>new TeacherDutyV319Repository(),[]);
 const reload=useCallback(()=>setRefreshCounter(v=>v+1),[]);
 useEffect(()=>{let cancelled=false;
  repo.listForDate(date).then(data=>{if(!cancelled)setState({date,data,error:''});})
   .catch((error:unknown)=>{if(!cancelled)setState({date,data:null,error:error instanceof Error?error.message:'Gagal membaca penugasan.'});});
  return ()=>{cancelled=true;};
 },[date,repo,refreshCounter]);
 const ready=state.date===date && state.data!==null;
 const impacts=useMemo(()=>ready?findDutyTeachingImpacts({snapshot:state.data!,date,teachers,schedules,incidentals,calendar,logs}):[],[ready,state,date,teachers,schedules,incidentals,calendar,logs]);
 const pending=impacts.filter(i=>!i.covered);
 const substituteClashes=useMemo(()=>ready?findDutySubstituteConflicts({snapshot:state.data!,date,teachers,logs}):[],[ready,state,date,teachers,logs]);
 return <section className="rounded-2xl border border-indigo-200 bg-white p-4 md:p-5 space-y-3" aria-label="RC3 Dampak Penugasan Guru">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <div><h3 className="text-base font-black text-slate-900">RC3 · Dampak Penugasan & Libur Pengganti</h3>
    <p className="text-xs text-slate-600">Cek kelas aktif yang pengampunya berhalangan karena penugasan resmi. Peringatan saja, tidak mengubah jadwal/badal otomatis.</p></div>
   <div className="flex items-center gap-2"><input aria-label="Tanggal dampak penugasan" type="date" value={date} onChange={e=>setDate(e.currentTarget.value)} className="border rounded-lg px-3 py-2 text-sm"/>
    <button aria-label="Refresh dampak penugasan" onClick={reload} className="rounded-lg border p-2" title="Refresh dari Supabase"><RefreshCw className="w-4 h-4"/></button></div>
  </div>
  {!ready ? <div role={state.date===date&&state.error?'alert':'status'} className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{state.date===date&&state.error?`Tidak dapat memastikan dampak tugas RC3: ${state.error}`:'Memverifikasi tugas guru dan kalender…'}</div> : <>
    <div className="flex flex-wrap gap-2 text-xs font-bold"><span className="bg-amber-100 text-amber-900 rounded-lg px-3 py-2">Perlu ditinjau: {pending.length}</span><span className="bg-rose-100 text-rose-900 rounded-lg px-3 py-2">Badal berbenturan tugas: {substituteClashes.length}</span><span className="bg-emerald-100 text-emerald-900 rounded-lg px-3 py-2">Sudah tercatat badal: {impacts.length-pending.length}</span></div>
    {substituteClashes.length>0&&<div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50 p-3"><p className="text-xs font-black text-rose-900">Badal yang sudah tercatat kini berbenturan dengan tugas/libur pengganti (tinjau segera, tidak dibatalkan otomatis):</p>
      {substituteClashes.map(i=><p key={i.key} className="text-xs text-rose-900">JP {i.period} • {i.className} • {i.teacherName} — {i.reason}</p>)}
    </div>}
    {impacts.length===0?<div className="flex gap-2 text-xs text-emerald-800"><CheckCircle2 className="w-4 h-4"/>Tidak ada kelas pengampu yang terdampak langsung. Periksa juga daftar badal yang telah ditunjuk di atas.</div>:
    <div className="max-h-80 overflow-auto rounded-xl border divide-y">{impacts.map(i=><div key={i.key} className="flex gap-3 p-3 text-xs">
      {i.covered?<CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600"/>:<AlertTriangle className="w-4 h-4 shrink-0 text-amber-600"/>}
      <div className="space-y-1"><p className="font-bold text-slate-900">JP {i.period} • {i.className} • {i.subject}</p>
       <p className="text-slate-700">{i.teacherName} — {i.reason}</p>
       <p className={i.covered?'text-emerald-700':'text-amber-800'}>{i.covered?'Sudah ada badal tercatat, periksa kesesuaian pengganti':'Belum ada badal tercatat untuk pengampu ini — tinjau kebutuhan'}</p></div>
     </div>)}</div>}
   </>}
  {onOpenDuty&&<button onClick={onOpenDuty} className="text-sm font-bold text-indigo-700 underline">Buka Kalender Operasional untuk edit penugasan</button>}
  <p className="text-[11px] text-slate-500">Data penugasan ≠ presensi. Kewajiban lain, tugas parsial, atau badal yang belum tersinkron mungkin memerlukan pemeriksaan admin.</p>
 </section>;
};
