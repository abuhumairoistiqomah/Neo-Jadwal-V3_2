import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Lock, RefreshCw } from 'lucide-react';
import type { EducationEvent } from '../domain/educationCalendar';
import { EducationCalendarRepository } from '../infrastructure/repositories/educationCalendarRepository';
import { getSchoolTodayISO } from '../domain/date';

import { T, useLanguage } from '../i18n/LanguageProvider';
import { localeIntl } from '../i18n/translations';

const dateStr = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const asLocal = (iso: string) => new Date(Number(iso.slice(0,4)),Number(iso.slice(5,7))-1,Number(iso.slice(8,10)));
const pretty = (iso: string, locale: string) => asLocal(iso).toLocaleDateString(locale,{day:'numeric',month:'long',year:'numeric'});
const getStart = (year:number,month:number) => dateStr(new Date(year,month,1));
const getEnd = (year:number,month:number) => dateStr(new Date(year,month+1,0));
const colors: Record<string,string> = {'Akademik':'bg-blue-100 text-blue-900','Kegiatan Siswa':'bg-emerald-100 text-emerald-900','Rapat':'bg-purple-100 text-purple-900','Tenggat Waktu':'bg-amber-100 text-amber-900','Hari Besar':'bg-rose-100 text-rose-900'};
export const EducationCalendar: React.FC<{onBack:()=>void; authEpoch?:number}> = ({onBack,authEpoch}) => {
  const { language, t } = useLanguage();
  const locale = localeIntl(language);
  const today = getSchoolTodayISO();
  const [yearMonth,setYearMonth] = useState(()=>({year:Number(today.slice(0,4)),month:Number(today.slice(5,7))-1}));
  const [events,setEvents] = useState<EducationEvent[]>([]);
  const [selectedDate,setSelectedDate] = useState(today);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState('');
  const [revision,setRevision] = useState(0);
  const {year,month} = yearMonth;
  useEffect(()=>{
    let alive=true;
    setLoading(true);setError('');setEvents([]); // clear previously privileged rows during auth refresh
    new EducationCalendarRepository().list(getStart(year,month),getEnd(year,month))
      .then(rows=>{if(alive)setEvents(rows);})
      .catch(err=>{if(alive)setError(err instanceof Error?err.message:String(err));})
      .finally(()=>{if(alive)setLoading(false);});
    return()=>{alive=false;};
  },[year,month,revision,authEpoch]);
  const cells=useMemo(()=>{
    const first=new Date(year,month,1);
    const startOffset=(first.getDay()+6)%7;
    return Array.from({length:Math.ceil((startOffset+new Date(year,month+1,0).getDate())/7)*7},(_,i)=>{
      const n=i-startOffset+1;
      return n>0&&n<=new Date(year,month+1,0).getDate()?dateStr(new Date(year,month,n)):null;
    });
  },[year,month]);
  const eventsAt=(day:string)=>events.filter(e=>e.start_date<=day&&e.end_date>=day);
  const move=(delta:number)=>{const d=new Date(year,month+delta,1);setYearMonth({year:d.getFullYear(),month:d.getMonth()});setSelectedDate(dateStr(d));};
  return <div className="space-y-5">
    <div className="flex items-center justify-between gap-3 flex-wrap"><div><button onClick={onBack} className="flex items-center gap-1 text-xs font-bold text-slate-500"><ArrowLeft className="w-4 h-4"/> <T>{"Dashboard"}</T></button><h1 className="text-2xl font-black text-slate-900 flex items-center gap-2 mt-2"><CalendarDays className="text-blue-600"/> {t("Kalender Pendidikan")}</h1><p className="text-xs text-slate-500"><T>{"Agenda sekolah • independen dari Kalender Akademik dan jadwal KBM"}</T></p></div><button className="border border-slate-200 rounded-xl px-3 py-2 text-sm flex items-center gap-2" onClick={()=>setRevision(v=>v+1)}><RefreshCw className="w-4 h-4"/> {t("Refresh")}</button></div>
    <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between"><button aria-label={t("Bulan sebelumnya")} className="p-2 hover:bg-slate-100 rounded-xl" onClick={()=>move(-1)}><ChevronLeft/></button><h2 className="font-black text-lg">{new Date(year,month,1).toLocaleDateString(locale,{month:'long',year:'numeric'})}</h2><button aria-label={t("Bulan berikutnya")} className="p-2 hover:bg-slate-100 rounded-xl" onClick={()=>move(1)}><ChevronRight/></button></div>
      {error&&<p role="alert" className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-800"><T>{"Gagal memuat Kalender Pendidikan:"}</T> {error}<T>{". Pastikan migration V3.16 sudah dijalankan."}</T></p>}
      {loading&&<p className="text-xs text-blue-700"><T>{"Memuat agenda bulan ini…"}</T></p>}
      <div className="grid grid-cols-7 gap-1 sm:gap-2">{['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'].map(d=><div key={d} className="text-center text-[10px] sm:text-xs font-black text-slate-500 py-2"><span title={t(d)} lang={language} dir={language === "ar" ? "rtl" : undefined}>{language === "id" ? d.slice(0,3) : language === "en" ? t(d).slice(0,3) : t(d).slice(0,3)}</span></div>)}
        {cells.map((day,i)=><button type="button" disabled={!day} aria-label={day||'Kosong'} onClick={()=>day&&setSelectedDate(day)} key={`${day||'empty'}-${i}`} className={`text-left min-h-17 sm:min-h-25 rounded-lg border p-1 sm:p-2 overflow-hidden ${day===selectedDate?'ring-2 ring-blue-500 border-blue-300':day===today?'border-blue-200 bg-blue-50':'border-slate-100 bg-slate-50/70'} ${!day?'opacity-30':'hover:bg-blue-50'}`}>
          {day&&<><div className="text-xs font-black text-slate-800 mb-1">{Number(day.slice(-2))}</div>{eventsAt(day).slice(0,2).map(e=><div key={e.id} className={`text-[9px] sm:text-[10px] px-1 py-0.5 rounded mb-1 truncate ${colors[e.category]||'bg-slate-200 text-slate-800'}`}>{e.management_only?'🔒 ':''}{e.title}</div>)}{eventsAt(day).length>2&&<span className="text-[9px] text-slate-600">+{eventsAt(day).length-2} <T>{"lainnya"}</T></span>}</>}
        </button>)}
      </div>
    </div>
    <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-3"><h3 className="font-black text-slate-900"><T>{"Agenda"}</T> {pretty(selectedDate,locale)}</h3>
      {!loading&&eventsAt(selectedDate).length===0&&<p className="text-sm text-slate-500"><T>{"Tidak ada agenda yang dapat dilihat pada tanggal ini."}</T></p>}
      {eventsAt(selectedDate).map(event=><div key={event.id} className="border border-slate-200 rounded-xl p-3 space-y-1"><div className="flex flex-wrap gap-2 items-center"><h4 className="font-bold text-sm text-slate-900">{event.title}</h4>{event.management_only&&<span className="flex gap-1 items-center text-[10px] text-amber-700"><Lock className="w-3 h-3"/> Khusus Manajemen</span>}{event.status==='CANCELLED'&&<span className="text-red-700 text-xs font-black"><T>{"DIBATALKAN"}</T></span>}</div><p className="text-xs text-slate-500">{t(event.category)} • {pretty(event.start_date,locale)} – {pretty(event.end_date,locale)}</p>{event.description&&<p className="text-sm text-slate-700 whitespace-pre-wrap">{event.description}</p>}</div>)}
    </section>
  </div>;
};
