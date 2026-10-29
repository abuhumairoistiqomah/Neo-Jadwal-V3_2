import React, {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import { absenceCategoryLabel, type LeaveAbsenceCategory } from '../domain/leaveClassificationV320';
import {ArrowLeft,ChevronDown,Clock3,RefreshCw,Save,ShieldCheck,Trash2} from 'lucide-react';
import {getCurrentUserContext} from '../infrastructure/auth/supabaseAuthRepository';
import {getSchoolTodayISO} from '../domain/date';
import {approvedLeaveVisible,approvedLeaveEditableSessions} from '../domain/approvedLeaveMaintenance';
import {SupabaseApprovedLeaveMaintenanceRepository,type ApprovedLeaveEntry} from '../infrastructure/repositories/supabaseApprovedLeaveMaintenanceRepository';
import {T} from '../i18n/LanguageProvider';

export const ApprovedLeaveMaintenanceAdmin:React.FC<{onBack:()=>void;onChanged?:()=>Promise<void>|void}> = ({onBack,onChanged})=>{
  const repo=useMemo(()=>new SupabaseApprovedLeaveMaintenanceRepository(),[]);
  const [authorized,setAuthorized]=useState(false);
  const [checking,setChecking]=useState(true);
  const [loading,setLoading]=useState(false);
  const [loadFailed,setLoadFailed]=useState(false);
  const [rows,setRows]=useState<ApprovedLeaveEntry[]>([]);
  const [categoryDrafts,setCategoryDrafts]=useState<Record<string,LeaveAbsenceCategory>>({});
  const [reasonDrafts,setReasonDrafts]=useState<Record<string,string>>({});
  const [detailDrafts,setDetailDrafts]=useState<Record<string,string>>({});
  const [taskDrafts,setTaskDrafts]=useState<Record<string,string>>({});
  const [showPast,setShowPast]=useState(false);
  const [showDeleted,setShowDeleted]=useState(false);
  const [error,setError]=useState('');
  const [info,setInfo]=useState('');
  const [working,setWorking]=useState(false);
  const [edit,setEdit]=useState<{id:string;date:string;oldJP:number;newJP:number;note:string}|null>(null);
  const editorRef=useRef<HTMLDivElement>(null);
  const [removal,setRemoval]=useState<{id:string;code:string;note:string;restore:boolean}|null>(null);
  const today=getSchoolTodayISO();
  const load=useCallback(async()=>{
    setLoading(true);setLoadFailed(false);setError('');setRows([]);
    try {
      const user=await getCurrentUserContext();
      const staff=Boolean(user?.roles.some(role=>role==='ADMIN'||role==='WAKASEK'));
      setAuthorized(staff);
      if(!staff){setRows([]);return;}
      const freshRows=await repo.list();
      setRows(freshRows);
      setCategoryDrafts({});
      setReasonDrafts(Object.fromEntries(freshRows.map(r=>[r.id,r.reason])));
      setDetailDrafts(Object.fromEntries(freshRows.map(r=>[r.id,r.detail])));
      setTaskDrafts(Object.fromEntries(freshRows.flatMap(r=>r.tasks.map(t=>[`${r.id}:${t.period}`,t.description]))));
    } catch(e){setLoadFailed(true);setError(e instanceof Error?e.message:String(e));}
    finally{setLoading(false);setChecking(false);}
  },[repo]);
  useEffect(()=>{void load();},[load]);
  const filtered=approvedLeaveVisible<ApprovedLeaveEntry>(rows,today,showPast,showDeleted);
  const hiddenPast=rows.filter(r=>r.dateEnd<today&&!r.deleted).length;
  const hiddenDeleted=rows.filter(r=>r.deleted).length;
  const openEditor=(row:ApprovedLeaveEntry,date:string,period:number)=>{
    setRemoval(null);setError('');setInfo('');
    setEdit({id:row.id,date,oldJP:period,newJP:period,note:''});
    requestAnimationFrame(()=>editorRef.current?.scrollIntoView({behavior:'smooth',block:'start'}));
  };
  const correctCategory=async(row:ApprovedLeaveEntry)=>{
    const next=categoryDrafts[row.id]||row.absenceCategory;
    if(next===row.absenceCategory)return;
    const note=window.prompt(`Alasan koreksi kategori ${row.code} (minimal 5 karakter):`);
    if(!note||note.trim().length<5)return;
    setWorking(true);setError('');setInfo('');
    try {await repo.setAbsenceCategory(row.id,next,note.trim());
      setInfo(`Kategori ${row.code} diperbarui menjadi ${absenceCategoryLabel(next)} (audit tersimpan).`);
      await load();await onChanged?.();
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setWorking(false);}
  };
  const correctReason=async(row:ApprovedLeaveEntry)=>{
    const nextReason=(reasonDrafts[row.id]??row.reason).trim();
    const nextDetail=(detailDrafts[row.id]??row.detail).trim();
    if(nextReason===row.reason && nextDetail===row.detail)return;
    if(nextReason.length<3){setError('Alasan minimal 3 karakter.');return;}
    const note=window.prompt(`Catatan audit koreksi alasan ${row.code} (minimal 5 karakter):`);
    if(!note||note.trim().length<5)return;
    setWorking(true);setError('');setInfo('');
    try{await repo.correctReason(row.id,nextReason,nextDetail,note.trim());
      await load();await onChanged?.();setInfo(`Alasan ${row.code} diperbarui dan seluruh snapshot badal disinkronkan.`);
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setWorking(false);}
  };
  const correctTask=async(row:ApprovedLeaveEntry,period:number)=>{
    const original=row.tasks.find(t=>t.period===period)?.description||'';
    const next=taskDrafts[`${row.id}:${period}`]??original;
    if(next===original)return;
    const note=window.prompt(`Catatan audit tugas ${row.code} JP${period} (minimal 5 karakter):`);
    if(!note||note.trim().length<5)return;
    setWorking(true);setError('');setInfo('');
    try{await repo.editTeacherTask(row.id,period,next,original,note.trim());
      await load();await onChanged?.();setInfo(`Tugas JP${period} berhasil diperbarui pada pengajuan dan tugas guru pengganti. Lampiran lama tetap tersimpan.`);
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setWorking(false);}
  };
  const move=async()=>{
    if(!edit||edit.newJP===edit.oldJP||!edit.note.trim())return;
    setWorking(true);setError('');setInfo('');
    try{
      const count=await repo.moveTeachingPeriod(edit.id,edit.date,edit.oldJP,edit.newJP,edit.note.trim());
      setInfo(`JP ${edit.oldJP} → JP ${edit.newJP} berhasil dikoreksi secara atomik pada ${count} kelas. Silakan cek jadwal guru dan tugas badal.`);
      setEdit(null);await load();await onChanged?.();
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setWorking(false);}
  };
  const remove=async()=>{
    if(!removal||!removal.note.trim())return;
    if(!window.confirm(removal.restore
      ? `Pulihkan pengajuan ${removal.code}? Validasi jadwal, konflik, dan batasan badal akan dijalankan ulang.`
      : `Soft delete SELURUH pengajuan ${removal.code} dan seluruh slot badalnya? Data tetap tersimpan untuk audit.`))return;
    setWorking(true);setError('');setInfo('');
    try{
      if(removal.restore) {
        await repo.restore(removal.id,removal.note.trim());
        setInfo(`Pengajuan ${removal.code} berhasil dipulihkan setelah validasi ulang.`);
      } else {
        await repo.softDelete(removal.id,removal.note.trim());
        setInfo(`Pengajuan ${removal.code} dan slot badalnya berhasil diarsipkan (soft delete).`);
      }
      setRemoval(null);setEdit(null);await load();await onChanged?.();
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setWorking(false);}
  };
  return <div className="max-w-6xl mx-auto p-3 sm:p-5 space-y-5">
    <div className="flex gap-3 items-start">
      <button type="button" onClick={onBack} className="rounded-xl p-2 border bg-white" aria-label="Kembali"><ArrowLeft className="w-5 h-5"/></button>
      <div className="flex-1"><h1 className="font-black text-xl sm:text-2xl text-slate-900"><T>{'List Badal Pengajuan Badal'}</T></h1>
        <p className="text-xs text-slate-500 mt-1">Semua pengajuan izin APPROVED; koreksi JP mengubah seluruh kelas dalam sesi yang sama. Data historis disembunyikan secara default.</p></div>
      <button type="button" onClick={()=>void load()} disabled={loading||working} className="px-3 py-2 rounded-xl border border-emerald-200 text-emerald-700 font-semibold flex gap-1 items-center"><RefreshCw className="w-4 h-4"/><span className="hidden sm:inline"><T>{"Refresh"}</T></span></button>
    </div>
    {error&&<div role="alert" className="p-3 border rounded-xl bg-red-50 border-red-200 text-sm text-red-800">{error}</div>}
    {info&&<div role="status" className="p-3 border rounded-xl bg-emerald-50 border-emerald-200 text-sm text-emerald-800">{info}</div>}
    {checking||loading&&!rows.length?<p className="text-slate-500 text-sm">Memeriksa hak akses dan memuat data...</p>:!authorized?<div className="p-5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900">Login Supabase sebagai ADMIN/WAKASEK diperlukan. Admin Mode saja tidak memberikan izin mengedit pengajuan.</div>:loadFailed?<div role="status" className="p-5 rounded-2xl border border-rose-200 bg-rose-50 text-sm text-rose-900">Daftar pengajuan belum berhasil dibaca dari Supabase. Angka 0 bukan berarti tidak ada pengajuan. Periksa pesan error di atas dan migrasi database, lalu tekan Refresh.</div>:<>
      <div className="rounded-2xl bg-white border border-slate-200 p-3 flex flex-wrap items-center justify-between gap-3">
        <strong className="text-sm"><T>{"Daftar Pengajuan"}</T> ({filtered.length})</strong>
        <div className="flex flex-wrap gap-3 text-xs font-semibold text-slate-600">
          <label className="flex gap-1.5 items-center cursor-pointer"><input type="checkbox" checked={showPast} onChange={e=>setShowPast(e.target.checked)}/><T>{"Tampilkan lampau"}</T> ({hiddenPast})</label>
          <label className="flex gap-1.5 items-center cursor-pointer"><input type="checkbox" checked={showDeleted} onChange={e=>setShowDeleted(e.target.checked)}/><T>{"Tampilkan terhapus"}</T> ({hiddenDeleted})</label>
        </div>
      </div>
      {edit&&<div ref={editorRef} className="scroll-mt-4 rounded-2xl bg-indigo-50 border border-indigo-300 p-4 space-y-3">
        <h2 className="font-black text-indigo-900">Koreksi JP Badal • {edit.date}</h2>
        <p className="text-xs text-indigo-800">JP {edit.oldJP} akan dipindah untuk seluruh kelas pada sesi ini, termasuk relasi izin dan tugas. Sistem menolak jika guru izin tidak mengajar pada JP tujuan, ada konflik coverage, atau restriksi badal.</p>
        <div className="flex flex-wrap items-center gap-3"><strong className="text-sm">JP {edit.oldJP} →</strong>
          <select aria-label="JP tujuan" value={edit.newJP} onChange={e=>setEdit(v=>v?{...v,newJP:Number(e.target.value)}:v)} className="rounded-lg border bg-white px-3 py-2 text-sm">{[1,2,3,4,5,6].map(p=><option key={p} value={p}>JP {p}</option>)}</select>
          <input className="flex-1 min-w-[200px] rounded-lg border px-3 py-2 text-sm" placeholder="Alasan koreksi (wajib)" value={edit.note} onChange={e=>setEdit(v=>v?{...v,note:e.target.value}:v)}/>
        </div>
        <div className="flex gap-2"><button type="button" disabled={working||edit.oldJP===edit.newJP||!edit.note.trim()} onClick={()=>void move()} className="bg-indigo-600 disabled:opacity-40 text-white px-3 py-2 rounded-lg text-sm font-bold flex gap-1 items-center"><Save className="w-4 h-4"/> <T>{"Simpan Koreksi"}</T></button><button type="button" onClick={()=>setEdit(null)} className="bg-white border px-3 py-2 rounded-lg text-sm"><T>{"Batal"}</T></button></div>
      </div>}
      {removal&&<div className="rounded-2xl bg-rose-50 border border-rose-300 p-4 space-y-3">
        <h2 className="font-black text-rose-900">{removal.restore?<T>{"Pulihkan Pengajuan"}</T>:<T>{"Soft Delete"}</T>} • {removal.code}</h2>
        <p className="text-xs text-rose-800">{removal.restore?"Pemulihan hanya berhasil jika jadwal lama masih valid dan tidak ada penugasan baru yang bertabrakan.":"Seluruh pengajuan, slot badal, dan tugas ikut dinonaktifkan. Riwayat fisik tidak dihapus."}</p>
        <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder={removal.restore?"Alasan pulihkan (wajib)":"Alasan hapus (wajib)"} value={removal.note} onChange={e=>setRemoval(v=>v?{...v,note:e.target.value}:v)}/>
        <div className="flex gap-2"><button disabled={working||!removal.note.trim()} onClick={()=>void remove()} className="bg-rose-600 disabled:opacity-40 text-white px-3 py-2 rounded-lg text-sm font-bold">{removal.restore?<T>{"Konfirmasi Pulihkan"}</T>:<T>{"Konfirmasi Soft Delete"}</T>}</button><button onClick={()=>setRemoval(null)} className="bg-white border px-3 py-2 rounded-lg text-sm"><T>{"Batal"}</T></button></div>
      </div>}
      {!filtered.length&&<div className="p-8 bg-white border rounded-2xl text-center text-sm text-slate-500">Tidak ada pengajuan dalam filter ini.</div>}
      <div className="space-y-3">{filtered.map(row=>{
        const groups=approvedLeaveEditableSessions(row.slots);
        return <article key={row.id} className={`rounded-2xl border bg-white p-4 space-y-3 ${row.deleted?'opacity-60 border-rose-200':'border-slate-200'}`}>
          <div className="flex flex-wrap justify-between gap-2"><div><div className="flex flex-wrap items-center gap-2"><strong className="text-slate-900">{row.teacher}</strong><span className="text-[10px] font-mono text-slate-500">{row.code}</span>{row.deleted?<span className="text-[10px] bg-rose-100 text-rose-800 rounded px-2 py-0.5">SOFT DELETED</span>:<span className="text-[10px] bg-emerald-100 text-emerald-800 rounded px-2 py-0.5">APPROVED</span>}</div>
            <p className="text-xs text-slate-500 mt-1">{row.dateStart}{row.dateEnd!==row.dateStart?` – ${row.dateEnd}`:''} • {row.reason}</p>{row.detail&&<p className="text-xs mt-1 text-slate-600">{row.detail}</p>}
            {!row.deleted&&<div className="mt-3 space-y-2 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
              <strong className="text-xs text-indigo-900">Koreksi Alasan Izin (Audit)</strong>
              <input aria-label={`Alasan ${row.code}`} value={reasonDrafts[row.id]??row.reason}
                onChange={e=>setReasonDrafts(v=>({...v,[row.id]:e.target.value}))}
                className="block w-full rounded-lg border bg-white p-2 text-sm" maxLength={240}/>
              <textarea aria-label={`Detail ${row.code}`} value={detailDrafts[row.id]??row.detail}
                onChange={e=>setDetailDrafts(v=>({...v,[row.id]:e.target.value}))}
                className="block w-full rounded-lg border bg-white p-2 text-xs" rows={2} maxLength={2000}/>
              <button type="button" disabled={working||((reasonDrafts[row.id]??row.reason)===row.reason&&(detailDrafts[row.id]??row.detail)===row.detail)}
                onClick={()=>void correctReason(row)} className="rounded-lg bg-indigo-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40">Simpan Alasan + Audit</button>
            </div>}
            <div className="mt-2 flex flex-wrap gap-2 items-center"><label className="text-xs text-slate-600">Jenis Izin
              <select disabled={row.deleted||working} value={categoryDrafts[row.id]||row.absenceCategory} onChange={e=>setCategoryDrafts(v=>({...v,[row.id]:e.target.value as LeaveAbsenceCategory}))} className="ml-2 rounded border bg-white p-1.5">
                {(['PERSONAL','SCHOOL_DUTY','UNCLASSIFIED'] as const).map(c=><option key={c} value={c}>{absenceCategoryLabel(c)}</option>)}
              </select></label>
              {!row.deleted&&(categoryDrafts[row.id]||row.absenceCategory)!==row.absenceCategory&&<button disabled={working} onClick={()=>void correctCategory(row)} className="text-xs rounded-lg bg-indigo-600 text-white px-2 py-1.5">Simpan Kategori (Audit)</button>}
            </div></div>
            {!row.deleted&&<button onClick={()=>{setEdit(null);setRemoval({id:row.id,code:row.code,note:'',restore:false});}} className="flex items-center gap-1 rounded-lg border border-rose-200 text-rose-700 px-3 py-1.5 text-xs font-bold"><Trash2 className="w-3.5 h-3.5"/> <T>{"Soft Delete"}</T></button>}
          </div>
          {row.deleted&&<button type="button" onClick={()=>{setEdit(null);setRemoval({id:row.id,code:row.code,note:'',restore:true});}} className="rounded-lg border border-emerald-200 text-emerald-700 bg-emerald-50 px-3 py-1.5 text-xs font-bold"><T>{"Pulihkan (validasi ulang)"}</T></button>}
          <div className="flex flex-wrap gap-1">{row.periods.map((p,i)=><span key={`${p.date}|${p.period}|${i}`} className={`text-[10px] rounded px-2 py-1 font-bold ${p.type==='FREE'?'bg-sky-50 text-sky-700':'bg-slate-100 text-slate-700'}`}>{p.date} • JP{p.period} {p.type==='FREE'?'FREE':''}</span>)}</div>
          <div className="grid gap-2 sm:grid-cols-2">{row.slots.map(s=><div key={s.id} className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-1"><div className="font-extrabold">{s.scheduleDate} • JP{s.period} • {s.className}</div><div>{s.subject||'Mapel belum tercatat'}</div><div className="text-slate-600">Badal: <strong>{s.substitute||'BELUM DIPILIH'}</strong> • {s.status}</div></div>)}</div>
          {!row.deleted&&<details className="text-xs text-slate-600 rounded-xl border border-slate-200 p-3">
            <summary className="font-bold cursor-pointer flex gap-1 items-center"><ChevronDown className="w-4 h-4"/> Edit Tugas Pengajuan & Badal ({row.tasks.length} JP terisi)</summary>
            <p className="mt-2 text-xs text-amber-800">Tugas dimiliki oleh pengajuan guru. Perubahan berlaku untuk semua kelas yang berbagi JP ini, dan diteruskan ke tugas badal. Lampiran Drive/link terstruktur tidak dihapus.</p>
            <div className="mt-2 space-y-2">{[...new Set([...row.tasks.map(t=>t.period),...row.periods.filter(p=>p.type==='TEACHING'&&p.period>0).map(p=>p.period)])].sort((a,b)=>a-b).map(period=>{
              const original=row.tasks.find(t=>t.period===period)?.description||'';
              const current=taskDrafts[`${row.id}:${period}`]??original;
              return <div key={period} className="rounded-lg border bg-slate-50 p-2 space-y-2">
                <label className="block font-bold">JP{period} • Materi/Tugas</label>
                <textarea aria-label={`Tugas ${row.code} JP${period}`} rows={2} value={current}
                  onChange={e=>setTaskDrafts(v=>({...v,[`${row.id}:${period}`]:e.target.value}))}
                  className="w-full rounded-lg border bg-white p-2" maxLength={5000}/>
                <button type="button" disabled={working||current===original} onClick={()=>void correctTask(row,period)}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40">Simpan Tugas JP{period} + Audit</button>
              </div>;
            })}</div>
          </details>}
          {!row.deleted&&groups.length>0&&<div className="flex flex-wrap gap-2">{groups.map(group=><button type="button" key={`${group.date}|${group.period}`} onClick={()=>openEditor(row,group.date,group.period)} className="rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-800 px-3 py-2 text-xs font-bold flex gap-1 items-center"><Clock3 className="w-4 h-4"/> <T>{"Edit JP"}</T>{group.period} ({group.date})</button>)}</div>}
        </article>;
      })}</div>
      <p className="text-[11px] text-slate-400 flex gap-1 items-center"><ShieldCheck className="w-4 h-4"/> Hanya akun ADMIN/WAKASEK terverifikasi Supabase; semua perubahan ditulis ke audit_logs.</p>
    </>}
  </div>;
};
export default ApprovedLeaveMaintenanceAdmin;
