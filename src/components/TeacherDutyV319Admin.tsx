import React,{useEffect,useMemo,useState} from 'react';
import {CalendarDays,CheckCircle2,ShieldAlert,Save,RefreshCw,Trash2,Users} from 'lucide-react';
import {getCurrentUserContext} from '../infrastructure/auth/supabaseAuthRepository';
import {OperationalRulesRepository,type OperationalTeacherRow} from '../infrastructure/repositories/operationalRulesRepository';
import {TeacherDutyV319Repository,type StoredDutyEvent,type StoredDutyAssignment} from '../infrastructure/repositories/teacherDutyV319Repository';
import {FIELD_TRIP_V319,previewDuty,warnDutyOverlaps,suggestedCompensationDate,type DutyEventInput,type DutyAssignmentInput,type DutyRole} from '../domain/teacherDutyV319';
const emptyEvent:DutyEventInput={title:'',dateStart:'',dateEnd:'',scope:'OTHER',notes:''};
const input='w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm';
const fmt=(date:string)=>date.split('-').reverse().join('/');
export const TeacherDutyV319Admin:React.FC=()=>{
  const repository=useMemo(()=>new TeacherDutyV319Repository(),[]);
  const teacherRepository=useMemo(()=>new OperationalRulesRepository(),[]);
  const [teachers,setTeachers]=useState<OperationalTeacherRow[]>([]);
  const [events,setEvents]=useState<StoredDutyEvent[]>([]);
  const [rows,setRows]=useState<StoredDutyAssignment[]>([]);
  const [eventId,setEventId]=useState<string|null>(null);
  const [draft,setDraft]=useState<DutyEventInput>(emptyEvent);
  const [assignments,setAssignments]=useState<DutyAssignmentInput[]>([]);
  const [query,setQuery]=useState('');
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [authorized,setAuthorized]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [showCancelled,setShowCancelled]=useState(false);
  const reload=async()=>{
    setLoading(true);setError('');
    try{
      const user=await getCurrentUserContext();
      if(!user?.roles.some(r=>r==='ADMIN'||r==='WAKASEK')) {setAuthorized(false);return;}
      setAuthorized(true);
      const [t,history]=await Promise.all([teacherRepository.listTeachers(),repository.list()]);
      setTeachers(t);setEvents(history.events);setRows(history.assignments);
    }catch(e){setError(e instanceof Error?e.message:'Tidak dapat memuat penugasan guru.');}
    finally{setLoading(false);}
  };
  useEffect(()=>{void reload();},[]);
  const knownIds=useMemo(()=>teachers.map(t=>t.id),[teachers]);
  const preview=useMemo(()=>previewDuty(draft,assignments,knownIds),[draft,assignments,knownIds]);
  const chosen=useMemo(()=>new Set(assignments.map(a=>a.teacherId)),[assignments]);
  const filtered=useMemo(()=>teachers.filter(t=>!chosen.has(t.id) && `${t.full_name} ${t.short_name||''}`.toLocaleLowerCase('id-ID').includes(query.toLocaleLowerCase('id-ID'))).slice(0,25),[teachers,chosen,query]);
  const teacherName=(id:string)=>teachers.find(t=>t.id===id)?.full_name||`ID ${id.slice(0,8)}`;
  const overlapWarnings=warnDutyOverlaps(draft,assignments,events,rows,eventId,teacherName);
  const reset=()=>{setEventId(null);setDraft(emptyEvent);setAssignments([]);setQuery('');setError('');setMessage('');};
  const edit=(event:StoredDutyEvent)=>{
    setEventId(event.id);
    setDraft({title:event.title,dateStart:event.date_start,dateEnd:event.date_end,scope:event.scope,notes:event.notes});
    setAssignments(rows.filter(a=>a.event_id===event.id).map(a=>({teacherId:a.teacher_id,role:a.duty_role,compensationDate:a.compensation_date})));
    setQuery('');setError('');setMessage('');
  };
  const chooseTemplate=(index:number)=>{
    if(assignments.length>0||draft.title.trim()){
      if(!window.confirm('Ganti draft kegiatan? Daftar guru yang belum disimpan akan dikosongkan.'))return;
    }
    reset();setDraft({...FIELD_TRIP_V319[index]});
  };
  const add=(id:string)=>{setAssignments(old=>[...old,{teacherId:id,role:'PARTICIPANT',compensationDate:null}]);setQuery('');};
  const patchAssignment=(id:string,change:Partial<DutyAssignmentInput>)=>setAssignments(old=>old.map(a=>a.teacherId===id?{...a,...change}:a));
  const save=async()=>{
    if(busy||!authorized||preview.warnings.length)return;
    if(!window.confirm(`Simpan kegiatan ${draft.title} dan ${assignments.length} penugasan guru? RC3 akan memblokir peserta/staf dan penerima libur pengganti sebagai kandidat badal pada tanggal terkait. Ini bukan data absensi.`))return;
    setBusy(true);setError('');setMessage('');
    try{
      const savedId=await repository.save(draft,assignments,eventId);
      const history=await repository.list();setEvents(history.events);setRows(history.assignments);
      setEventId(savedId);setMessage('Penugasan berhasil disimpan dalam satu transaksi, termasuk seluruh daftar guru. RC3: data ini langsung memengaruhi validator ketersediaan badal. Refresh Conflict Center untuk melihat dampaknya.');
    }catch(e){setError(e instanceof Error?e.message:'Gagal menyimpan.');}
    finally{setBusy(false);}
  };
  const cancel=async(event:StoredDutyEvent)=>{
    if(busy||!authorized||!window.confirm(`Batalkan ${event.title} (${fmt(event.date_start)})? Data guru dipertahankan sebagai histori audit. Tidak mengubah izin atau jadwal.`))return;
    setBusy(true);setError('');setMessage('');
    try{await repository.cancel(event.id);const history=await repository.list();setEvents(history.events);setRows(history.assignments);if(eventId===event.id)reset();setMessage('Kegiatan ditandai CANCELLED; riwayat tetap tersimpan.');}
    catch(e){setError(e instanceof Error?e.message:'Gagal membatalkan kegiatan.');}finally{setBusy(false);}
  };
  if(loading)return <div className="p-5 text-sm text-slate-500">Memuat penugasan guru…</div>;
  if(!authorized)return <div className="p-5 flex gap-3 rounded-xl bg-amber-50 text-amber-800"><ShieldAlert/> Login ADMIN/WAKASEK diperlukan untuk melihat penugasan.</div>;
  return <section className="space-y-5" aria-label="Penugasan guru dan libur pengganti">
    <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-950">
      <strong>RC3 • Penugasan eksplisit terhubung ke resolver badal, bukan absensi.</strong> Hanya guru yang dipilih dicatat sebagai peserta/staf kegiatan; mengajar kelompok Ikhwan/Akhwat saja tidak otomatis ikut Field Trip atau memperoleh libur pengganti. Guru “Tetap bertugas” tidak bisa diberi libur pengganti. Peserta/staf kegiatan dan penerima libur pengganti tidak tersedia sebagai kandidat badal pada tanggal terkait; guru tetap bertugas mengikuti aturan normal.
    </div>
    {error&&<div role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">{error}</div>}
    {message&&<div role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{message}</div>}
    <div className="rounded-2xl border bg-white p-4 md:p-5 space-y-4">
      <div className="flex flex-wrap justify-between gap-3 items-center"><div><h2 className="font-black text-lg flex gap-2 items-center"><CalendarDays className="w-5 h-5"/> Kegiatan & Guru yang Ditugaskan</h2><p className="text-xs text-slate-500">Pilih template hanya sebagai awal. Guru dan tanggal libur selalu perlu ditetapkan satu per satu.</p></div><button onClick={reset} className="rounded-lg border px-3 py-2 text-sm font-bold">Kegiatan baru / Reset</button></div>
      <div className="flex flex-wrap gap-2">{FIELD_TRIP_V319.map((f,i)=><button key={f.title} onClick={()=>chooseTemplate(i)} className="rounded-lg border border-indigo-300 px-3 py-2 text-sm font-semibold text-indigo-800">Template {f.title}</button>)}</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-sm font-bold">Nama kegiatan<input className={input} value={draft.title} onChange={e=>setDraft(v=>({...v,title:e.target.value}))} maxLength={180}/></label>
        <label className="text-sm font-bold">Cakupan kegiatan (informasi)<select className={input} value={draft.scope} onChange={e=>setDraft(v=>({...v,scope:e.target.value as DutyEventInput['scope']}))}><option value="IKHWAN">Ikhwan</option><option value="AKHWAT">Akhwat</option><option value="ALL">Seluruh sekolah</option><option value="OTHER">Lainnya</option></select></label>
        <label className="text-sm font-bold">Tanggal mulai<input type="date" className={input} value={draft.dateStart} onChange={e=>setDraft(v=>({...v,dateStart:e.target.value}))}/></label>
        <label className="text-sm font-bold">Tanggal selesai<input type="date" className={input} value={draft.dateEnd} onChange={e=>setDraft(v=>({...v,dateEnd:e.target.value}))}/></label>
      </div>
      <label className="text-sm font-bold block">Catatan kegiatan<textarea rows={2} maxLength={2000} className={input} value={draft.notes} onChange={e=>setDraft(v=>({...v,notes:e.target.value}))}/></label>
      <div className="rounded-xl border border-slate-200 p-3 space-y-2">
        <label className="font-bold text-sm flex gap-2 items-center"><Users className="w-4 h-4"/> Tambahkan guru berdasarkan daftar master</label>
        <input className={input} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cari nama guru untuk ditugaskan…" aria-label="Cari guru"/>
        {query.trim()&&<div className="max-h-48 overflow-y-auto rounded-lg border divide-y">{filtered.map(t=><button key={t.id} onClick={()=>add(t.id)} className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-100">+ {t.full_name}</button>)}{filtered.length===0&&<p className="p-3 text-xs text-slate-500">Tidak ada guru aktif yang cocok.</p>}</div>}
      </div>
      <div className="overflow-x-auto rounded-xl border"><table className="min-w-[850px] w-full text-sm"><thead className="bg-slate-100"><tr><th className="p-3 text-left">Guru ditugaskan</th><th className="p-3 text-left">Peran</th><th className="p-3 text-left">Libur pengganti per guru</th><th className="p-3 text-left">Tindakan</th></tr></thead><tbody>{assignments.map(a=><tr key={a.teacherId} className="border-t"><td className="p-3 font-semibold">{teacherName(a.teacherId)}</td><td className="p-3"><select aria-label={`Peran ${teacherName(a.teacherId)}`} value={a.role} className={input} onChange={e=>{const role=e.target.value as DutyRole;patchAssignment(a.teacherId,{role,compensationDate:role==='REMAINS_ON_DUTY'?null:a.compensationDate});}}><option value="PARTICIPANT">Peserta</option><option value="STAFF">Staf / Panitia</option><option value="REMAINS_ON_DUTY">Tetap bertugas (tanpa libur)</option></select></td><td className="p-3"><div className="flex gap-2 items-center"><input type="date" aria-label={`Libur pengganti ${teacherName(a.teacherId)}`} disabled={a.role==='REMAINS_ON_DUTY'} className={input} value={a.compensationDate||''} onChange={e=>patchAssignment(a.teacherId,{compensationDate:e.target.value||null})}/>{a.role!=='REMAINS_ON_DUTY'&&suggestedCompensationDate(draft)&&<button className="rounded border px-2 py-2 text-xs whitespace-nowrap" title="Tanggal contoh saja, bukan pemberian libur otomatis" onClick={()=>patchAssignment(a.teacherId,{compensationDate:suggestedCompensationDate(draft)})}>Usul {fmt(suggestedCompensationDate(draft)!)}</button>}</div></td><td className="p-3"><button aria-label={`Hapus ${teacherName(a.teacherId)}`} className="text-red-700" onClick={()=>setAssignments(v=>v.filter(x=>x.teacherId!==a.teacherId))}><Trash2 className="w-4 h-4"/></button></td></tr>)}{!assignments.length&&<tr><td colSpan={4} className="p-4 text-slate-500">Belum ada guru ditugaskan. Tidak ada guru yang dianggap peserta secara otomatis.</td></tr>}</tbody></table></div>
      <div className="rounded-xl bg-slate-50 p-4 space-y-2"><h3 className="font-bold">Preview sebelum publish</h3><div className="flex flex-wrap gap-4 text-sm"><span>Dipilih: <strong>{preview.total}</strong></span><span>Peserta/staf: <strong>{preview.eligible}</strong></span><span>Libur pengganti: <strong>{preview.compensatory}</strong></span><span>Tetap bertugas: <strong>{preview.remainsOnDuty}</strong></span></div>{preview.warnings.length>0&&<ul className="text-sm text-red-700 list-disc pl-5">{preview.warnings.map(w=><li key={w}>{w}</li>)}</ul>}{overlapWarnings.length>0&&<div className="text-xs text-amber-800"><strong>Peringatan benturan antarpenugasan (harus ditinjau):</strong><ul className="list-disc pl-5">{overlapWarnings.map(w=><li key={w}>{w}</li>)}</ul></div>}{preview.warnings.length===0&&<p className="text-xs text-emerald-700 flex gap-2"><CheckCircle2 className="w-4 h-4"/> Draft valid. Saat disimpan, pembatasan badal langsung berlaku; jadwal master tetap utuh.</p>}</div>
      <button disabled={busy||preview.warnings.length>0} onClick={()=>void save()} className="rounded-xl bg-slate-900 px-5 py-3 flex gap-2 items-center font-bold text-sm text-white disabled:opacity-40"><Save className="w-4 h-4"/>{busy?'Menyimpan…':eventId?'Simpan perubahan penugasan':'Publish penugasan kegiatan'}</button>
    </div>
    <div className="rounded-2xl border bg-white p-4 md:p-5 space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-black">Daftar Penugasan Tersimpan ({events.filter(e=>e.status==='ACTIVE').length} aktif)</h2><div className="flex gap-2"><label className="text-xs flex gap-1 items-center"><input type="checkbox" checked={showCancelled} onChange={e=>setShowCancelled(e.target.checked)}/> Tampilkan dibatalkan</label><button onClick={()=>void reload()} className="text-sm border rounded-lg px-3 py-2 flex gap-1 items-center"><RefreshCw className="w-4 h-4"/> Refresh</button></div></div>
      {events.filter(e=>showCancelled||e.status==='ACTIVE').map(event=><div key={event.id} className="rounded-xl border p-3 flex flex-wrap justify-between items-start gap-3"><div><p className="text-sm font-bold">{event.title} {event.status==='CANCELLED'&&<span className="text-red-600">(CANCELLED)</span>}</p><p className="text-xs text-slate-500">{fmt(event.date_start)} – {fmt(event.date_end)} · {event.scope} · {rows.filter(a=>a.event_id===event.id).length} guru · {rows.filter(a=>a.event_id===event.id&&a.compensation_date).length} libur pengganti</p></div>{event.status==='ACTIVE'&&<div className="flex gap-2"><button disabled={busy} className="rounded-lg border px-3 py-2 text-xs font-bold" onClick={()=>edit(event)}>Edit</button><button disabled={busy} className="rounded-lg border border-red-200 text-red-700 px-3 py-2 text-xs" onClick={()=>void cancel(event)}>Batalkan</button></div>}</div>)}{events.length===0&&<p className="text-sm text-slate-500">Belum ada kegiatan tersimpan. Data dari template tidak dipublish otomatis.</p>}
    </div>
  </section>;
};
