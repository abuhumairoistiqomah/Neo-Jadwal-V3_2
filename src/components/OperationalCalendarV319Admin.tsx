import {TeacherDutyV319Admin} from './TeacherDutyV319Admin';
import {TeacherDutyLogV319Panel} from './TeacherDutyLogV319Panel';
import type {Teacher,ScheduleItem,JadwalInsidentalItem,KalenderAkademikItem,LogIzinItem} from '../domain/models';
import React,{useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,CalendarRange,CheckCircle2,FileUp,RefreshCw,Save,ShieldAlert,AlertTriangle,RotateCcw} from 'lucide-react';
import {getCurrentUserContext} from '../infrastructure/auth/supabaseAuthRepository';
import {OperationalRulesRepository,type AcademicEventGroup,type OperationalClassRow} from '../infrastructure/repositories/operationalRulesRepository';
import {OperationalCalendarV319Repository,type OperationalTerm} from '../infrastructure/repositories/operationalCalendarV319Repository';
import {DEFAULT_TERM_V319,makeRphSuggestions,parseRphRows,coveredClassIds,canPublishCalendarProposal,type CalendarProposal,type OperationalScope,type CalendarDisposition} from '../domain/operationalCalendarV319';

const uiInput='rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white w-full';
const dateLabel=(s:string)=>s.split('-').reverse().join('/');
const initialTerm:OperationalTerm={term_code:DEFAULT_TERM_V319.code,title:DEFAULT_TERM_V319.title,kbm_start:DEFAULT_TERM_V319.start,kbm_end:DEFAULT_TERM_V319.end,weekdays:[1,2,3,4,5],is_active:true};
const sameExisting=(proposal:CalendarProposal,events:AcademicEventGroup[],classIds:string[]) => events.some(e=>e.status==='ACTIVE' && e.dateStart===proposal.start && e.dateEnd===proposal.end && e.eventName.trim().toLocaleLowerCase('id-ID')===proposal.label.trim().toLocaleLowerCase('id-ID') && e.periodStart===proposal.periodStart && e.periodEnd===proposal.periodEnd && (proposal.scope==='ALL' ? e.scope==='ALL' : e.scope==='CLASS' && classIds.length===e.classIds.length && classIds.every(id=>e.classIds.includes(id))));

export const OperationalCalendarV319Admin:React.FC<{onBack:()=>void;onChanged?:()=>Promise<void>|void;teachers:Teacher[];schedules:ScheduleItem[];incidentals:JadwalInsidentalItem[];calendar:KalenderAkademikItem[];logs:LogIzinItem[]}> = ({onBack,onChanged,teachers,schedules,incidentals,calendar,logs})=>{
  const repo=useMemo(()=>new OperationalRulesRepository(),[]);
  const termRepo=useMemo(()=>new OperationalCalendarV319Repository(),[]);
  const fileRef=useRef<HTMLInputElement>(null);
  const [terms,setTerms]=useState<OperationalTerm[]>([]);
  const [term,setTerm]=useState<OperationalTerm>(initialTerm);
  const [classes,setClasses]=useState<OperationalClassRow[]>([]);
  const [existing,setExisting]=useState<AcademicEventGroup[]>([]);
  const [canManage,setCanManage]=useState(false);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [proposals,setProposals]=useState<CalendarProposal[]>([]);
  const [selected,setSelected]=useState<string[]>([]);
  const [importErrors,setImportErrors]=useState<string[]>([]);
  const [showExisting,setShowExisting]=useState(false);
  const [tab,setTab]=useState<'PERIODE'|'EXCEPTIONS'|'TEACHER_DUTY'|'DUTY_LOG'>('PERIODE');
  const load=async()=>{
    setLoading(true);setError('');
    try{
      const context=await getCurrentUserContext();
      const authorized=Boolean(context?.roles.some(r=>r==='ADMIN'||r==='WAKASEK'));
      setCanManage(authorized);
      if(!authorized){setLoading(false);return;}
      const [termRows,classRows,eventRows]=await Promise.all([termRepo.listTerms(),repo.listClasses(),repo.listAcademicEventGroups()]);
      setTerms(termRows);setClasses(classRows);setExisting(eventRows);
      if(termRows.length && !term.id) setTerm(termRows.find(r=>r.is_active)||termRows[0]);
    } catch(e){setError(e instanceof Error?e.message:'Gagal memuat data kalender operasional.');}
    finally{setLoading(false);}
  };
  useEffect(()=>{void load();},[]);
  const update=(id:string,change:Partial<CalendarProposal>)=>setProposals(old=>old.map(p=>p.id===id?{...p,...change}:p));
  const activeClasses=useMemo(()=>classes.filter(c=>c.is_active),[classes]);
  const analyzed=useMemo(()=>proposals.map(p=>{
    const classIds=coveredClassIds(p,activeClasses);
    return {proposal:p,classIds,error:canPublishCalendarProposal(p,classIds.length),duplicate:sameExisting(p,existing,classIds)};
  }),[proposals,activeClasses,existing]);
  const canPublishCount=analyzed.filter(r=>!r.error&&!r.duplicate&&selected.includes(r.proposal.id)).length;
  const addSuggestions=()=>{const batch=makeRphSuggestions();setProposals(batch);setSelected([]);setImportErrors([]);setTab('EXCEPTIONS');setMessage('Template RPH dimuat sebagai usulan saja; BELUM diterbitkan. Review setiap tanggal, cakupan, dan status sebelum publish.');};
  const saveTerm=async()=>{
    if(!canManage||busy)return;setBusy(true);setError('');setMessage('');
    try{await termRepo.saveTerm(term);await load();setMessage('Periode KBM tersimpan untuk perencanaan. RC1 belum mengubah jadwal master atau statistik V3.18.');}
    catch(e){setError(e instanceof Error?e.message:'Gagal menyimpan semester.');}finally{setBusy(false);}
  };
  const readFile=async(file:File)=>{
    setError('');setImportErrors([]);setMessage('');
    try{
      const workbook=await import('xlsx');
      const buffer=await file.arrayBuffer();
      const book=workbook.read(buffer,{type:'array',cellDates:true});
      const sheet=book.Sheets[book.SheetNames[0]];
      if(!sheet)throw new Error('Sheet pertama tidak tersedia.');
      const rows=workbook.utils.sheet_to_json<Record<string,unknown>>(sheet,{defval:''});
      const result=parseRphRows(rows);
      setProposals(result.proposals);setSelected([]);setImportErrors(result.errors);
      setTab('EXCEPTIONS');
      setMessage(`${result.proposals.length} catatan perlu ditinjau; ${result.skipped} baris aktif/kosong dilewati. Kolom kelas v/X tidak dipakai. Tidak ada yang dipublish otomatis.`);
    }catch(e){setError(e instanceof Error?e.message:'Gagal membaca file.');}
    finally{if(fileRef.current)fileRef.current.value='';}
  };
  const publishSelected=async()=>{
    if(!canManage||busy||!canPublishCount)return;
    if(!window.confirm(`Terbitkan ${canPublishCount} pengecualian menjadi KALENDER AKADEMIK AKTIF? Ini akan memengaruhi jadwal efektif setelah tiap kegiatan disimpan. Operasi per kegiatan, bukan satu transaksi global.`))return;
    setBusy(true);setError('');setMessage('');
    let successes=0;
    try {
      for(const row of analyzed) {
        if(!selected.includes(row.proposal.id)||row.error||row.duplicate)continue;
        const p=row.proposal;
        await repo.saveAcademicEventGroup({dateStart:p.start,dateEnd:p.end,eventName:p.label,eventType:p.eventType,scope:p.scope==='ALL'?'ALL':'CLASS',classIds:row.classIds,periodStart:p.periodStart,periodEnd:p.periodEnd});
        successes++;
        // Refresh and preserve already-published items on partial network failure.
        const fresh=await repo.listAcademicEventGroups();setExisting(fresh);
      }
      setSelected([]);
      await onChanged?.();
      setMessage(`${successes} pengecualian diterbitkan via Kalender Akademik. Cek daftar aktif sebelum lanjut.`);
    }catch(e){
      setError(`${successes} kegiatan sudah tersimpan; publikasi berikutnya berhenti: ${e instanceof Error?e.message:'Kesalahan jaringan'}. Refresh lalu cek duplikasi sebelum mengulang.`);
      try{setExisting(await repo.listAcademicEventGroups());await onChanged?.();}catch{/* leave visible error */}
    }finally{setBusy(false);}
  };
  return <div className="space-y-5 pb-10">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><button onClick={onBack} className="text-xs font-bold text-blue-700 flex items-center gap-1 mb-2"><ArrowLeft className="w-4 h-4"/> Kembali</button><h1 className="text-2xl font-black flex items-center gap-2"><CalendarRange className="w-7 h-7 text-teal-700"/> Kalender Operasional KBM</h1><p className="text-sm text-slate-500 mt-1">V3.19 RC4 — periode KBM, preview keterangan RPH, dan publikasi terkontrol ke Kalender Akademik.</p></div>
      <button disabled={loading||busy} onClick={()=>void load()} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold flex gap-2 items-center"><RefreshCw className="w-4 h-4"/> Refresh</button>
    </header>
    <div className="rounded-xl border border-blue-200 bg-blue-50 text-blue-900 p-4 text-sm"><strong>Batas RC4:</strong> periode semester adalah metadata perencanaan, belum mengganti kalkulasi JP SQL V3.18. Pengecualian yang dipublish memakai Kalender Akademik lama sebagai satu-satunya sumber penonaktifan KBM. Penugasan RC2 sudah mengamankan rekomendasi badal melalui resolver RC3. Log RC4 menampilkan kewajiban tercatat, BUKAN presensi fisik atau metrik statistik final RC5.</div>
    {!loading&&!canManage&&<div className="rounded-xl p-4 bg-amber-50 text-amber-900 flex gap-2"><ShieldAlert/> Login WAKASEK/ADMIN Supabase diperlukan.</div>}
    {error&&<div role="alert" className="rounded-xl bg-red-50 text-red-800 p-4 text-sm font-bold">{error}</div>}
    {message&&<div role="status" className="rounded-xl bg-emerald-50 text-emerald-800 p-4 text-sm">{message}</div>}
    <div role="tablist" className="flex flex-wrap gap-2">
      <button role="tab" aria-selected={tab==='PERIODE'} onClick={()=>setTab('PERIODE')} className={`px-4 py-2 text-sm font-bold rounded-xl ${tab==='PERIODE'?'bg-slate-900 text-white':'bg-white border'}`}>Periode KBM</button>
      <button role="tab" aria-selected={tab==='EXCEPTIONS'} onClick={()=>setTab('EXCEPTIONS')} className={`px-4 py-2 text-sm font-bold rounded-xl ${tab==='EXCEPTIONS'?'bg-slate-900 text-white':'bg-white border'}`}>Pengecualian & Import RPH</button>
      <button role="tab" aria-selected={tab==='DUTY_LOG'} onClick={()=>setTab('DUTY_LOG')} className={`px-4 py-2 text-sm font-bold rounded-xl ${tab==='DUTY_LOG'?'bg-slate-900 text-white':'bg-white border'}`}>Log Kewajiban Guru</button>
      <button role="tab" aria-selected={tab==='TEACHER_DUTY'} onClick={()=>setTab('TEACHER_DUTY')} className={`px-4 py-2 text-sm font-bold rounded-xl ${tab==='TEACHER_DUTY'?'bg-slate-900 text-white':'bg-white border'}`}>Penugasan Guru & Libur Pengganti</button>
    </div>
    {tab==='TEACHER_DUTY'&&<TeacherDutyV319Admin/>}
    {tab==='DUTY_LOG'&&<TeacherDutyLogV319Panel teachers={teachers} schedules={schedules} incidentals={incidentals} calendar={calendar} logs={logs}/>}
    {tab==='PERIODE'&&<section className="rounded-2xl border bg-white p-5 space-y-4">
      <div><h2 className="text-lg font-black">Semester & Default KBM</h2><p className="text-xs text-slate-500 mt-1">Senin–Jumat merupakan baseline. Tanggal setelah akhir KBM tidak otomatis dianggap kosong oleh resolver V3.18 sampai integrasi RC berikutnya aktif.</p></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-sm font-bold">Kode semester<input className={uiInput} value={term.term_code} onChange={e=>setTerm(v=>({...v,term_code:e.target.value}))}/></label>
        <label className="text-sm font-bold">Nama semester<input className={uiInput} value={term.title} onChange={e=>setTerm(v=>({...v,title:e.target.value}))}/></label>
        <label className="text-sm font-bold">Awal KBM<input type="date" className={uiInput} value={term.kbm_start} onChange={e=>setTerm(v=>({...v,kbm_start:e.target.value}))}/></label>
        <label className="text-sm font-bold">Akhir KBM<input type="date" className={uiInput} value={term.kbm_end} onChange={e=>setTerm(v=>({...v,kbm_end:e.target.value}))}/></label>
      </div>
      <p className="text-xs font-semibold text-slate-500">Hari default: Senin, Selasa, Rabu, Kamis, Jumat. Status perencanaan: {terms.length} semester tersimpan.</p>
      <button disabled={busy||!canManage} onClick={()=>void saveTerm()} className="px-4 py-2.5 rounded-xl bg-teal-700 text-white text-sm font-bold flex gap-2 items-center disabled:opacity-50"><Save className="w-4 h-4"/> Simpan Semester</button>
      {terms.length>0&&<div className="space-y-1"><p className="text-xs font-bold text-slate-600">Semester tersimpan</p>{terms.map(t=><button key={t.id} onClick={()=>setTerm(t)} className="w-full text-left rounded-lg border p-3 text-sm hover:bg-slate-50">{t.title} — {dateLabel(t.kbm_start)} s.d. {dateLabel(t.kbm_end)} {t.is_active?'• aktif':''}</button>)}</div>}
    </section>}
    {tab==='EXCEPTIONS'&&<section className="rounded-2xl border bg-white p-4 md:p-5 space-y-4">
      <div><h2 className="font-black text-lg">RPH → Preview → Kalender Akademik</h2><p className="text-xs text-slate-500">Kolom tanggal dan keterangan saja yang dibaca. Seluruh baris impor perlu diklasifikasi manual; label KBM aktif tidak diterbitkan.</p></div>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={addSuggestions} className="flex items-center gap-2 rounded-xl border border-teal-300 px-4 py-2 text-sm font-bold text-teal-800"><CalendarRange className="w-4 h-4"/> Muat pengecualian RPH 2026</button>
        <label className="flex items-center gap-2 cursor-pointer rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold"><FileUp className="w-4 h-4"/> Import Excel / CSV<input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={e=>{const f=e.target.files?.[0];if(f)void readFile(f);}}/></label>
        <button onClick={()=>{setProposals([]);setSelected([]);setImportErrors([]);}} className="flex items-center gap-1 rounded-xl border px-3 py-2 text-sm"><RotateCcw className="w-4 h-4"/> Kosongkan preview</button>
      </div>
      {importErrors.length>0&&<div className="rounded-xl bg-amber-50 text-amber-900 p-3 text-sm"><strong>{importErrors.length} baris bermasalah:</strong> {importErrors.slice(0,8).join(' | ')}</div>}
      {proposals.length>0&&<><div className="flex flex-wrap gap-3 items-center justify-between"><div className="text-sm font-bold">{proposals.length} usulan • {selected.length} dipilih • {canPublishCount} siap terbit</div><button onClick={()=>setSelected(analyzed.filter(a=>!a.error&&!a.duplicate).map(a=>a.proposal.id))} className="text-xs text-blue-700 font-bold">Pilih semua yang valid</button></div>
      <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[1130px] border-collapse text-xs"><thead className="bg-slate-100 text-slate-700"><tr><th className="p-3 text-left">Pilih</th><th className="p-3 text-left">Tanggal / Keterangan</th><th className="p-3 text-left">Status</th><th className="p-3 text-left">Cakupan</th><th className="p-3 text-left">JP</th><th className="p-3 text-left">Preview dampak</th></tr></thead><tbody>{analyzed.map(({proposal:p,classIds,error:validation,duplicate})=><tr key={p.id} className="border-t align-top"><td className="p-3"><input type="checkbox" aria-label={`Pilih ${p.label}`} checked={selected.includes(p.id)} disabled={Boolean(validation)||duplicate||busy} onChange={e=>setSelected(old=>e.target.checked?[...old,p.id]:old.filter(x=>x!==p.id))}/></td><td className="p-3 min-w-[310px] space-y-2"><div className="flex gap-1"><input aria-label="Tanggal mulai" type="date" value={p.start} onChange={e=>update(p.id,{start:e.target.value})} className={uiInput}/><input aria-label="Tanggal selesai" type="date" value={p.end} onChange={e=>update(p.id,{end:e.target.value})} className={uiInput}/></div><input aria-label="Nama kegiatan" value={p.label} onChange={e=>update(p.id,{label:e.target.value})} className={uiInput}/><div className="text-slate-400">{p.source}</div></td><td className="p-3"><select aria-label="Status operasional" value={p.disposition} onChange={e=>update(p.id,{disposition:e.target.value as CalendarDisposition})} className={uiInput}><option value="REVIEW">Review dahulu</option><option value="NO_KBM">Non-KBM (publish)</option><option value="KBM_ACTIVE">KBM aktif (skip)</option></select><select aria-label="Tipe kegiatan" value={p.eventType} onChange={e=>update(p.id,{eventType:e.target.value})} className={`${uiInput} mt-2`}><option>Kegiatan</option><option>Libur</option><option>Ujian</option></select></td><td className="p-3"><select aria-label="Cakupan" value={p.scope} onChange={e=>update(p.id,{scope:e.target.value as OperationalScope,classIds:[]})} className={uiInput}><option value="ALL">Semua kelas</option><option value="IKHWAN">Ikhwan</option><option value="AKHWAT">Akhwat</option><option value="CLASS">Kelas tertentu</option></select>{p.scope==='CLASS'&&<select aria-label="Kelas" multiple value={p.classIds} onChange={e=>update(p.id,{classIds:Array.from(e.currentTarget.selectedOptions as HTMLCollectionOf<HTMLOptionElement>, option => option.value)})} className={`${uiInput} mt-2 h-28`}>{activeClasses.map(c=><option key={c.id} value={c.id}>{c.display_name}</option>)}</select>}</td><td className="p-3"><label className="inline-flex gap-1 items-center"><input type="checkbox" checked={p.periodStart===null} onChange={e=>update(p.id,{periodStart:e.target.checked?null:1,periodEnd:e.target.checked?null:6})}/> Sehari</label>{p.periodStart!==null&&<div className="flex gap-1 mt-2"><input type="number" min="0" max="6" aria-label="JP mulai" className={uiInput} value={p.periodStart} onChange={e=>update(p.id,{periodStart:Number(e.target.value)})}/><input type="number" min="0" max="6" aria-label="JP akhir" className={uiInput} value={p.periodEnd??6} onChange={e=>update(p.id,{periodEnd:Number(e.target.value)})}/></div>}</td><td className="p-3 min-w-[155px]">{duplicate?<span className="text-emerald-700 font-bold flex gap-1"><CheckCircle2 className="w-4 h-4"/> Sudah ada aktif</span>:validation?<span className="text-amber-700 flex gap-1"><AlertTriangle className="w-4 h-4 shrink-0"/> {validation}</span>:<span className="text-teal-700 font-bold">Siap terbit • {p.scope==='ALL'?'Seluruh sekolah':`${classIds.length} kelas`} • {p.periodStart===null?'Sehari':`JP ${p.periodStart}–${p.periodEnd}`}</span>}</td></tr>)}</tbody></table></div>
      <div className="flex gap-3 flex-wrap items-center"><button disabled={busy||!canManage||canPublishCount===0} onClick={()=>void publishSelected()} className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-black text-white disabled:opacity-50">{busy?'Memproses...':`Publish ${canPublishCount} ke Kalender Akademik`}</button><span className="text-xs text-slate-500">Publish bersifat operasional langsung dan dilakukan per kegiatan. Preview dahulu. Tidak ada publikasi otomatis dari file.</span></div></>}
      <div className="pt-2"><button className="text-sm font-bold text-blue-700" onClick={()=>setShowExisting(v=>!v)}>{showExisting?'Tutup':'Lihat'} kegiatan Kalender Akademik aktif ({existing.filter(e=>e.status==='ACTIVE').length})</button>{showExisting&&<div className="max-h-72 overflow-auto mt-2 rounded-xl border p-3 space-y-1">{existing.filter(e=>e.status==='ACTIVE').map(e=><div className="text-xs border-b py-2" key={e.key}>{dateLabel(e.dateStart)}–{dateLabel(e.dateEnd)} • {e.eventName} • {e.scope==='ALL'?'Semua kelas':`${e.classNames.length} kelas`}</div>)}</div>}</div>
    </section>}
  </div>;
};
