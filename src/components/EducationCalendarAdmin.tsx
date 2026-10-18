import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import { ArrowLeft, CalendarPlus2, Check, ClipboardList, Lock, Pencil, Plus, RefreshCw, RotateCcw, Save, Tags, Trash2, Users } from 'lucide-react';
import { getCurrentUserContext } from '../infrastructure/auth/supabaseAuthRepository';
import { EducationCalendarRepository } from '../infrastructure/repositories/educationCalendarRepository';
import { EducationAudienceBuilder } from './EducationAudienceBuilder';
import { DEFAULT_AUDIENCE_RULE, EDUCATION_CATEGORIES, filterEducationAdminEvents, isEducationEventDeleted, isEducationEventPast, validateAudience, type EducationEvent, type EducationEventWrite, type EducationMember } from '../domain/educationCalendar';
import { getSchoolTodayISO } from '../domain/date';
import type {Teacher,ScheduleItem} from '../types';

import { T, useLanguage } from '../i18n/LanguageProvider';

const input='w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200';
const label='text-xs font-black text-slate-600 block mb-1';
const TEAMS=['MANAJEMEN','WAKAKUR','PANITIA FIELD TRIP','TIM TKA'];
const emptyEvent=():EducationEventWrite=>({title:'',description:'',category:'Akademik',start_date:getSchoolTodayISO(),end_date:getSchoolTodayISO(),status:'DRAFT',management_only:false,audience_rule:DEFAULT_AUDIENCE_RULE});
export const EducationCalendarAdmin: React.FC<{teachers:Teacher[];schedules:ScheduleItem[];onBack:()=>void}> = ({teachers,schedules,onBack})=>{
  const {t}=useLanguage();
  const repo=useMemo(()=>new EducationCalendarRepository(),[]);
  const editorRef=useRef<HTMLDivElement>(null);
  const [authorized,setAuthorized]=useState(false);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [tab,setTab]=useState<'events'|'members'>('events');
  const [events,setEvents]=useState<EducationEvent[]>([]);
  const [members,setMembers]=useState<EducationMember[]>([]);
  const [form,setForm]=useState<EducationEventWrite>(emptyEvent);
  const [editingId,setEditingId]=useState<string|null>(null);
  const [showPastEvents,setShowPastEvents]=useState(false);
  const [showDeletedEvents,setShowDeletedEvents]=useState(false);
  const [memberTeacherId,setMemberTeacherId]=useState('');
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');
  const schoolToday=getSchoolTodayISO();
  const pastEventCount=events.filter(event=>!isEducationEventDeleted(event)&&isEducationEventPast(event,schoolToday)).length;
  const deletedEventCount=events.filter(isEducationEventDeleted).length;
  const visibleEvents=filterEducationAdminEvents(events,schoolToday,showPastEvents,showDeletedEvents);
  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{
      const context=await getCurrentUserContext();
      if(!context?.roles.includes('ADMIN')){setAuthorized(false);setEvents([]);setMembers([]);return;}
      setAuthorized(true);
      const [rows,roster]=await Promise.all([repo.listForAdmin(),repo.listMemberships()]);
      setEvents(rows);setMembers(roster);
    }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setLoading(false);}
  },[repo]);
  useEffect(()=>{void load();},[load]);
  const save=async(status:'DRAFT'|'PUBLISHED')=>{
    setError('');setNotice('');
    if(!form.title.trim()){setError('Nama kegiatan wajib diisi.');return;}
    if(form.end_date<form.start_date){setError('Tanggal selesai tidak boleh sebelum tanggal mulai.');return;}
    const invalid=validateAudience(form.audience_rule);if(invalid){setError(invalid);return;}
    setBusy(true);
    try{
      await repo.save({...form,status},editingId||undefined);
      await load();setEditingId(null);setForm(emptyEvent());setNotice(status==='PUBLISHED'?'Agenda berhasil dipublikasikan.':'Draft berhasil disimpan.');
    }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  };
  const edit=(event:EducationEvent)=>{
    setTab('events');setEditingId(event.id);
    setForm({title:event.title,description:event.description,category:event.category,start_date:event.start_date,end_date:event.end_date,status:event.status,management_only:event.management_only,audience_rule:event.audience_rule});
    // App.tsx scrolls in an overflow-y-auto content pane, not the window.
    editorRef.current?.scrollIntoView({behavior:'smooth',block:'start'});
  };
  const cancel=async(event:EducationEvent)=>{
    if(!window.confirm(`Batalkan kegiatan "${event.title}"? Event tetap tercatat dalam kalender dengan status dibatalkan.`))return;
    setBusy(true);setError('');
    try{await repo.save({...event,status:'CANCELLED'},event.id);await load();setNotice('Kegiatan ditandai dibatalkan.');}
    catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  };
  const remove=async(event:EducationEvent)=>{
    if(!window.confirm(`Hapus kegiatan "${event.title}"?\n\nKegiatan akan hilang dari kalender dan pengingat, tetapi datanya tetap tersimpan dan bisa dipulihkan oleh Admin.`))return;
    setBusy(true);setError('');setNotice('');
    try{
      await repo.softDelete(event.id);
      if(editingId===event.id){setEditingId(null);setForm(emptyEvent());}
      await load();setNotice('Kegiatan berhasil dihapus sementara. Centang Tampilkan kegiatan terhapus untuk memulihkan.');
    }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  };
  const restore=async(event:EducationEvent)=>{
    if(!window.confirm(`Pulihkan kegiatan "${event.title}" ke status ${event.status}?\n\nJika statusnya PUBLISHED, kegiatan akan kembali terlihat di kalender dan reminder yang relevan.`))return;
    setBusy(true);setError('');setNotice('');
    try{await repo.restore(event.id);await load();setNotice('Kegiatan berhasil dipulihkan dengan status sebelumnya.');}
    catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  };
  const selectedTeacherTags=members.filter(m=>m.teacher_id===memberTeacherId).map(m=>m.team_code);
  const toggleMember=async(team:string,checked:boolean)=>{
    if(!memberTeacherId)return;
    setBusy(true);setError('');
    try{const tags=checked?[...new Set([...selectedTeacherTags,team])]:selectedTeacherTags.filter(t=>t!==team);await repo.updateMemberships(memberTeacherId,tags);const rows=await repo.listMemberships();setMembers(rows);setNotice('Tag organisasi guru berhasil diperbarui.');}
    catch(e){setError(e instanceof Error?e.message:String(e));await load();}finally{setBusy(false);}
  };
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><button type="button" onClick={onBack} className="text-xs text-slate-500 font-bold flex gap-1 items-center"><ArrowLeft className="w-4 h-4"/> <T>{"Dashboard"}</T></button><h1 className="text-2xl font-black flex items-center gap-2 mt-2"><CalendarPlus2 className="text-indigo-600"/> <T>{"Kelola Kalender Pendidikan"}</T></h1><p className="text-xs text-slate-500">{t("Agenda input manual • tidak mengubah Kalender Akademik maupun jadwal efektif")}</p></div><button type="button" onClick={()=>void load()} className="text-xs border border-slate-300 px-3 py-2 rounded-lg flex items-center gap-2"><RefreshCw className="w-4 h-4"/> <T>{"Muat ulang"}</T></button></div>
    {loading&&<p className="text-sm text-blue-700"><T>{"Memeriksa login ADMIN dan memuat agenda…"}</T></p>}
    {!loading&&!authorized&&<p className="border border-red-200 bg-red-50 p-4 rounded-xl text-sm text-red-800"><T>{"Fitur ini hanya untuk akun dengan role Supabase ADMIN. Aktifkan login Admin dahulu."}</T></p>}
    {error&&<p role="alert" className="bg-red-50 border border-red-200 p-3 rounded-xl text-sm text-red-800">{error}</p>}
    {notice&&<p role="status" className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl text-sm text-emerald-800">{notice}</p>}
    {!loading&&authorized&&<>
      <div className="grid grid-cols-2 gap-2 bg-white border border-slate-200 p-2 rounded-xl"><button className={`rounded-lg py-2 text-xs font-bold flex items-center justify-center gap-2 ${tab==='events'?'bg-indigo-600 text-white':'text-slate-600'}`} onClick={()=>setTab('events')}><ClipboardList className="w-4 h-4"/> <T>{"Input & Daftar Event"}</T></button><button className={`rounded-lg py-2 text-xs font-bold flex items-center justify-center gap-2 ${tab==='members'?'bg-indigo-600 text-white':'text-slate-600'}`} onClick={()=>setTab('members')}><Tags className="w-4 h-4"/> <T>{"Tag Tim / Jabatan"}</T></button></div>
      {tab==='events'&&<>
        <div ref={editorRef} className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 space-y-4 shadow-sm scroll-mt-4">
          <div className="flex justify-between items-center"><h2 className="font-black text-slate-900 text-lg">{t(editingId?'Edit Kegiatan':'Tambah Kegiatan Baru')}</h2>{editingId&&<button onClick={()=>{setEditingId(null);setForm(emptyEvent());}} className="text-xs font-bold text-indigo-700"><T>{"+ Event baru"}</T></button>}</div>
          <div><label className={label}><T>{"Nama kegiatan *"}</T></label><input className={input} maxLength={180} value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder={t("Contoh: Batas Koreksi Try Out TKA")}/></div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><div><label className={label}><T>{"Tanggal mulai"}</T></label><input type="date" className={input} value={form.start_date} onChange={e=>setForm({...form,start_date:e.target.value,end_date:form.end_date<e.target.value?e.target.value:form.end_date})}/></div><div><label className={label}><T>{"Tanggal selesai"}</T></label><input type="date" className={input} min={form.start_date} value={form.end_date} onChange={e=>setForm({...form,end_date:e.target.value})}/></div><div><label className={label}><T>{"Kategori"}</T></label><select className={input} value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{EDUCATION_CATEGORIES.map(c=><option key={c} value={c}>{t(c)}</option>)}</select></div></div>
          <div><label className={label}><T>{"Deskripsi / instruksi"}</T></label><textarea rows={3} className={input} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2"><label className="flex items-center gap-2 text-sm font-bold text-amber-900"><input type="checkbox" checked={form.management_only} onChange={e=>setForm({...form,management_only:e.target.checked,audience_rule:e.target.checked?{all:true,groups:[]}:form.audience_rule})}/> <Lock className="w-4 h-4"/> <T>{"Khusus Manajemen — Full Confidential"}</T></label><p className="text-xs text-amber-800"><T>{"Bila dicentang, seluruh event (judul, detail, jumlah) hanya dapat dibaca akun ADMIN/WAKASEK yang telah login. Tag mempersempit penerima reminder, tidak memperluas akses."}</T></p></div>
          <EducationAudienceBuilder key={form.management_only?'private':'public'} value={form.audience_rule} onChange={audience_rule=>setForm(old=>({...old,audience_rule}))} teachers={teachers} schedules={schedules} memberships={members} managementOnly={form.management_only}/>
          <div className="flex flex-wrap gap-2"><button disabled={busy} onClick={()=>void save('DRAFT')} className="bg-slate-100 hover:bg-slate-200 rounded-xl px-4 py-2.5 text-xs font-black flex items-center gap-2"><Save className="w-4 h-4"/> <T>{"Simpan Draft"}</T></button><button disabled={busy} onClick={()=>void save('PUBLISHED')} className="bg-indigo-700 hover:bg-indigo-800 text-white rounded-xl px-4 py-2.5 text-xs font-black flex items-center gap-2"><Check className="w-4 h-4"/> Publikasikan</button></div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-black text-lg">{t("Daftar Kegiatan")} ({visibleEvents.length})</h2>
            <div className="flex flex-wrap gap-x-4 gap-y-2 items-center">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer select-none">
                <input type="checkbox" checked={showPastEvents} onChange={e=>setShowPastEvents(e.target.checked)} className="accent-indigo-600"/>
                <T>{"Tampilkan kegiatan lampau"}</T>{pastEventCount>0?` (${pastEventCount})`:''}
              </label>
              <label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer select-none">
                <input type="checkbox" checked={showDeletedEvents} onChange={e=>setShowDeletedEvents(e.target.checked)} className="accent-indigo-600"/>
                Tampilkan kegiatan terhapus{deletedEventCount>0?` (${deletedEventCount})`:''}
              </label>
            </div>
          </div>
          {!showPastEvents&&pastEventCount>0&&<p className="text-xs text-slate-500">{pastEventCount} <T>{"kegiatan lampau disembunyikan. Centang untuk melihat arsip."}</T></p>}
          {!showDeletedEvents&&deletedEventCount>0&&<p className="text-xs text-slate-500">{deletedEventCount} <T>{"kegiatan terhapus disembunyikan. Centang untuk melihat dan memulihkan."}</T></p>}
          {events.length===0&&<p className="text-sm text-slate-500"><T>{"Belum ada kegiatan."}</T></p>}
          {events.length>0&&visibleEvents.length===0&&<p className="text-sm text-slate-500"><T>{"Tidak ada kegiatan dalam daftar saat ini. Centang arsip atau kegiatan terhapus untuk melihat riwayat."}</T></p>}
          {visibleEvents.map(e=>{
            const deleted=isEducationEventDeleted(e);
            return <div className={`border-b border-slate-100 pb-3 flex flex-wrap justify-between gap-3 ${deleted?'opacity-65':''}`} key={e.id}>
              <div className="space-y-1">
                <p className="font-bold text-sm">{e.management_only?'🔒 ':''}{e.title} {deleted&&<span className="ml-1 text-[10px] font-black text-red-700 bg-red-50 px-2 py-0.5 rounded-full"><T>{"TERHAPUS"}</T></span>}</p>
                <p className="text-xs text-slate-500">{e.start_date} s.d. {e.end_date} • {t(e.category)} • {t(e.status)}</p>
                {deleted&&<p className="text-xs text-red-700"><T>{"Dihapus sementara"}</T>{e.deleted_at?` • ${new Date(e.deleted_at).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})} WIB`:''}</p>}
              </div>
              <div className="flex gap-2 items-start flex-wrap">
                {deleted
                  ? <button disabled={busy} onClick={()=>void restore(e)} className="border border-emerald-200 text-emerald-700 rounded-lg px-3 py-2 text-xs font-bold flex items-center gap-1"><RotateCcw className="w-3 h-3"/> <T>{"Pulihkan"}</T></button>
                  : <><button disabled={busy} onClick={()=>edit(e)} className="border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold flex items-center gap-1"><Pencil className="w-3 h-3"/>{t("Edit")}</button>
                    {e.status!=='CANCELLED'&&<button disabled={busy} onClick={()=>void cancel(e)} className="border border-red-200 text-red-700 rounded-lg px-3 py-2 text-xs font-bold">{t("Batalkan")}</button>}
                    <button disabled={busy} onClick={()=>void remove(e)} className="border border-red-200 bg-red-50 text-red-800 rounded-lg px-3 py-2 text-xs font-bold flex items-center gap-1"><Trash2 className="w-3 h-3"/> <T>{"Hapus"}</T></button></>}
              </div>
            </div>;
          })}
        </div>
      </>}
      {tab==='members'&&<div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 space-y-4"><div><h2 className="font-black flex gap-2 items-center"><Users className="w-4 h-4"/> <T>{"Keanggotaan Tag Tim"}</T></h2><p className="text-xs text-slate-500 mt-1"><T>{"Tentukan anggota tag organisasi. Ini bukan pemberian hak login manajemen; otorisasi rahasia tetap dari role Supabase."}</T></p></div><div><label className={label}><T>{"Pilih guru"}</T></label><select className={input} value={memberTeacherId} onChange={e=>setMemberTeacherId(e.target.value)}><option value="">{t("Pilih nama guru")}</option>{teachers.filter(t=>t.id).sort((a,b)=>a.nama.localeCompare(b.nama)).map(t=><option key={t.id!} value={t.id!}>{t.nama}</option>)}</select></div>{memberTeacherId&&<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{TEAMS.map(team=><label key={team} className="flex gap-2 items-center border border-slate-200 p-3 rounded-xl text-sm font-bold"><input type="checkbox" disabled={busy} checked={selectedTeacherTags.includes(team)} onChange={e=>void toggleMember(team,e.target.checked)}/>{team}</label>)}</div>}
      <p className="text-xs text-amber-800"><T>{"Tag organisasi dapat dibaca publik untuk mengevaluasi agenda publik yang bertarget. Jangan simpan informasi rahasia sebagai nama tag. Event dengan Khusus Manajemen tetap dilindungi RLS."}</T></p></div>}
    </>}
  </div>;
};
