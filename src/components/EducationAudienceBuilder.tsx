import React, { useMemo, useState } from 'react';
import { Plus, Trash2, Users, Lock, CheckCircle } from 'lucide-react';
import type { AudienceRule, AudienceGroup, EducationTag, EducationTagKind, BooleanOp, EducationMember } from '../domain/educationCalendar';
import { matchesEducationAudience, validateAudience } from '../domain/educationCalendar';
import type { Teacher, ScheduleItem } from '../types';

import { T, useLanguage } from '../i18n/LanguageProvider';

interface Props {
  value: AudienceRule;
  onChange: (next: AudienceRule) => void;
  teachers: Teacher[];
  schedules: ScheduleItem[];
  memberships: EducationMember[];
  managementOnly: boolean;
}
const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200';
const tagOptions = (kind: EducationTagKind, teachers: Teacher[], schedules: ScheduleItem[]): {value:string;label:string}[] => {
  if (kind === 'CLASS') {
    const values = new Set<string>();
    for (const sc of schedules) {
      const klass = String(sc.kelas || '').trim();
      if (klass) {
        values.add(klass);
        const prefix = klass.match(/^(\d{1,2})\s+(INTER|AE|MQ)\b/i);
        if (prefix) values.add(`${prefix[1].padStart(2,'0')} ${prefix[2].toUpperCase()}`);
      }
    }
    return [...values].sort((a,b)=>a.localeCompare(b,'id',{numeric:true})).map(value=>({value,label:value}));
  }
  if (kind === 'SUBJECT') return [...new Set(schedules.map(s=>s.mapel.trim()).filter(Boolean))].sort().map(value=>({value,label:value}));
  if (kind === 'ROLE') return [{value:'PENGAMPU',label:'Pengampu (guru1)'},{value:'PENDAMPING',label:'Guru lain / pendamping (guru2–6)'}];
  if (kind === 'TEAM') return ['MANAJEMEN','WAKAKUR','PANITIA FIELD TRIP','TIM TKA'].map(value=>({value,label:value}));
  return teachers.map(t=>({value:t.id||t.nama,label:t.nama})).sort((a,b)=>a.label.localeCompare(b.label));
};
const emptyGroup = (join: BooleanOp = 'AND'): AudienceGroup => ({ op:'OR', join, tags:[] });
export const EducationAudienceBuilder: React.FC<Props> = React.memo(({value,onChange,teachers,schedules,memberships,managementOnly}: Props) => {
  const {t}=useLanguage();
  const [showPreview,setShowPreview] = useState(false);
  const update = (groups: AudienceGroup[]) => { onChange({all:false,groups}); setShowPreview(false); };
  const recipients = useMemo(()=>teachers.filter(t=>matchesEducationAudience(value,t,schedules,memberships)),[value,teachers,schedules,memberships]);
  const groupOptions = (kind: EducationTagKind) => tagOptions(kind,teachers,schedules);
  const selectTag = (i:number,j:number,kind:EducationTagKind,tagValue:string) => {
    const groups = value.groups.map(g=>({...g,tags:[...g.tags]}));
    groups[i].tags[j] = {kind,value:tagValue}; update(groups);
  };
  return <div className="space-y-3 rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-black text-slate-900 flex items-center gap-2"><Users className="w-4 h-4 text-indigo-600"/> <T>{"Smart Audience — Tag AND/OR"}</T></h3><span className="text-[10px] text-indigo-700 font-bold"><T>{"Target reminder"}</T></span></div>
    <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={value.all} onChange={e=>onChange(e.target.checked?{all:true,groups:[]}: {all:false,groups:[emptyGroup()]})}/>{t("Semua")} {managementOnly?t("Manajemen"):t("Guru")} {t("(tanpa filter tag)")}</label>
    {!value.all && <div className="space-y-3">{value.groups.map((group,i)=><React.Fragment key={i}>
      {i>0&&<div className="flex items-center justify-center gap-2 text-xs font-black"><select aria-label={`Hubungan grup ${i+1}`} className="rounded-lg border border-indigo-200 p-1 bg-white" value={group.join} onChange={e=>update(value.groups.map((g,k)=>k===i?{...g,join:e.target.value as BooleanOp}:g))}><option value="AND">AND</option><option value="OR">OR</option></select></div>}
      <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
        <div className="flex items-center justify-between"><span className="text-xs font-black">{t("Grup")} {i+1} {t("(dalam tanda kurung)")}</span><button type="button" className="text-xs text-red-600 hover:underline" onClick={()=>update(value.groups.filter((_,k)=>k!==i))}><Trash2 className="w-4 h-4"/></button></div>
        {group.tags.map((tag,j)=><div className="flex items-center gap-2 flex-wrap" key={`${i}-${j}`}>
          {j>0&&<select aria-label={`Operator dalam grup ${i+1}`} value={group.op} onChange={e=>update(value.groups.map((g,k)=>k===i?{...g,op:e.target.value as BooleanOp}:g))} className="w-18 rounded-lg border border-indigo-300 p-1 text-xs"><option>OR</option><option>AND</option></select>}
          <select aria-label={t("Jenis tag")} value={tag.kind} className={`${inputClass} w-30`} onChange={e=>{const kind=e.target.value as EducationTagKind;selectTag(i,j,kind,groupOptions(kind)[0]?.value||'');}}>
            <option value="CLASS">{t("Kelas")}</option><option value="SUBJECT">{t("Mapel")}</option><option value="ROLE">{t("Peran")}</option><option value="TEAM">{t("Tim/Jabatan")}</option><option value="TEACHER">{t("Guru")}</option>
          </select>
          <select aria-label={t("Nilai tag")} className={`${inputClass} flex-1 min-w-36`} value={tag.value} onChange={e=>selectTag(i,j,tag.kind,e.target.value)}>
            {groupOptions(tag.kind).map(opt=><option key={opt.value} value={opt.value}>{tag.kind === "CLASS" || tag.kind === "SUBJECT" || tag.kind === "TEAM" || tag.kind === "TEACHER" ? opt.label : t(opt.label)}</option>)}
          </select>
          <button type="button" aria-label={t("Hapus tag")} className="text-red-500" onClick={()=>update(value.groups.map((g,k)=>k===i?{...g,tags:g.tags.filter((_,x)=>x!==j)}:g))}><Trash2 className="w-4 h-4"/></button>
        </div>)}
        <button type="button" className="inline-flex gap-1 items-center text-xs text-indigo-700 font-bold" onClick={()=>update(value.groups.map((g,k)=>k===i?{...g,tags:[...g.tags,{kind:'CLASS',value:groupOptions('CLASS')[0]?.value||''}]}:g))}><Plus className="w-3 h-3"/> <T>{"Tambah Tag"}</T></button>
      </div>
    </React.Fragment>)}
    <button type="button" className="text-xs font-black text-indigo-700 flex gap-1 items-center" onClick={()=>update([...value.groups,emptyGroup()])}><Plus className="w-4 h-4"/> <T>{"Tambah Grup AND/OR"}</T></button></div>}
    <p className="text-[11px] text-slate-600">Contoh: (06 INTER OR 12 AE) <b>AND</b> Math <b>AND</b> Pengampu. Kelas, mapel, dan peran harus cocok pada satu baris penugasan, bukan dicocokkan terpisah.</p>
    {validateAudience(value)&&<p role="alert" className="text-xs text-red-700">{validateAudience(value)}</p>}
    <button type="button" onClick={()=>setShowPreview(!showPreview)} className="flex items-center gap-2 rounded-lg bg-indigo-700 text-white px-3 py-2 text-xs font-bold"><CheckCircle className="w-4 h-4"/> {t(showPreview?'Tutup Preview Penerima':'Preview Penerima')}</button>
    {showPreview&&<div className="bg-white p-3 rounded-xl border border-indigo-100 space-y-2"><p className="font-bold text-sm">{recipients.length} {t("kandidat guru berdasarkan tag")} {managementOnly&&<span className="text-[10px] text-red-700"><Lock className="w-3 h-3 inline"/>{t("Event rahasia tetap memerlukan login staf")}</span>}</p><div className="max-h-44 overflow-auto text-xs text-slate-700 divide-y">{recipients.map(t=><p className="py-1" key={t.id||t.nama}>{t.nama}</p>)}</div><p className="text-[10px] text-amber-700">{t("Preview berdasarkan master jadwal; kepemilikan akun dan RLS diperiksa kembali ketika event dibaca. Posisi guru2–6 diperlakukan sebagai guru tambahan/pendamping.")}</p></div>}
  </div>;
});
