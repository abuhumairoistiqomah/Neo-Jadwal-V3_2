import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, ChevronDown, ChevronUp, Lock } from 'lucide-react';
import { addEducationDays, matchesEducationAudience, matchesReminderDate, type EducationEvent, type EducationMember } from '../domain/educationCalendar';
import { EducationCalendarRepository } from '../infrastructure/repositories/educationCalendarRepository';
import { getCurrentUserContext, type CurrentUserContext } from '../infrastructure/auth/supabaseAuthRepository';
import type { ScheduleItem, Teacher } from '../types';

import { T, useLanguage } from '../i18n/LanguageProvider';
interface Props {teachers:Teacher[];schedules:ScheduleItem[];selectedTeacher:string;today:string;authEpoch?:number;onOpenCalendar:()=>void}
export const EducationReminder:React.FC<Props>=({teachers,schedules,selectedTeacher,today,authEpoch,onOpenCalendar})=>{
  const {t}=useLanguage();
  const [expanded,setExpanded]=useState(false); // always collapsed by default
  const [events,setEvents]=useState<EducationEvent[]>([]);
  const [members,setMembers]=useState<EducationMember[]>([]);
  const [context,setContext]=useState<CurrentUserContext|null>(null);
  const [error,setError]=useState('');
  useEffect(()=>{
    let alive=true;setEvents([]);setMembers([]);setContext(null);setError('');setExpanded(false);
    const repo=new EducationCalendarRepository();
    Promise.all([repo.list(today,addEducationDays(today,14)),repo.listMemberships(),getCurrentUserContext()])
      .then(([rows,memberships,auth])=>{if(alive){setEvents(rows);setMembers(memberships);setContext(auth);}})
      .catch(err=>{if(alive)setError(err instanceof Error?err.message:String(err));});
    return()=>{alive=false;};
  },[today,authEpoch]);
  const relevant=useMemo(()=>events.filter(e=>{
    if(!matchesReminderDate(e,today))return false;
    const staff=Boolean(context?.roles.some(role=>role==='ADMIN'||role==='WAKASEK'));
    if(e.management_only&&!staff)return false;
    if(!e.management_only&&e.audience_rule?.all===true)return true; // public school-wide event needs no teacher selection
    // A selectedTeacher is NOT authenticated identity. Secret reminder always uses user_profiles.teacher_id.
    const teacher=e.management_only?teachers.find(t=>t.id&&t.id===context?.teacherId):teachers.find(t=>t.nama===selectedTeacher);
    if(e.management_only&&!teacher){
      // Staff without linked teacher gets only unfiltered management-wide announcements.
      return e.audience_rule?.all===true;
    }
    return matchesEducationAudience(e.audience_rule,teacher,schedules,members);
  }),[events,today,context,selectedTeacher,teachers,schedules,members]);
  return <section className="bg-white border border-indigo-100 shadow-sm rounded-2xl p-3 sm:p-4 space-y-3">
    <button type="button" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)} className="w-full flex text-left items-center gap-3"><div className="rounded-xl bg-indigo-50 p-2.5"><CalendarClock className="w-5 h-5 text-indigo-600"/></div><div className="flex-1"><p className="font-black text-sm text-slate-900"><T>{"Agenda 14 Hari Mendatang"}</T></p><p className="text-xs text-slate-500">{error?t('Agenda belum bisa dimuat'):`${relevant.length} ${t('pengingat relevan')} • ${t(expanded ? 'rincian ditampilkan' : 'tertutup secara default')}`}</p></div>{relevant.length>0&&<span className="rounded-full bg-indigo-100 text-indigo-700 font-black text-xs px-2 py-1">{relevant.length}</span>}{expanded?<ChevronUp className="w-4 h-4 text-slate-500"/>:<ChevronDown className="w-4 h-4 text-slate-500"/>}</button>
    {expanded&&<div className="space-y-2 border-t border-slate-100 pt-3">{error&&<p role="alert" className="text-xs text-red-700">{error}. {t("Jalankan migration V3.16 bila belum terpasang.")}</p>}{!error&&relevant.length===0&&<p className="text-xs text-slate-500"><T>{"Tidak ada agenda relevan dalam dua minggu ke depan. Untuk notifikasi bertarget guru, pilih nama guru di Dashboard."}</T></p>}{relevant.map(e=><div key={e.id} className="border border-slate-200 rounded-xl p-3 space-y-1"><div className="flex items-center justify-between gap-2"><strong className="text-sm">{e.title}</strong>{e.management_only&&<Lock className="w-4 h-4 text-amber-700"/>}</div><p className="text-xs text-slate-500">{e.start_date===e.end_date?e.start_date:`${e.start_date} – ${e.end_date}`} • {t(e.category)}</p>{e.description&&<p className="text-xs text-slate-700 whitespace-pre-line">{e.description}</p>}</div>)}<div className="flex items-center justify-between gap-2 pt-1"><button type="button" onClick={onOpenCalendar} className="text-xs font-bold text-indigo-700 hover:underline">{t("Lihat Kalender Pendidikan")} →</button><button type="button" onClick={()=>setExpanded(false)} aria-label={t("Sembunyikan rincian agenda")} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"><ChevronUp className="h-3.5 w-3.5"/> <T>{"Sembunyikan"}</T></button></div></div>}
  </section>;
};
