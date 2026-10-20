import React, { useEffect, useMemo, useRef, useState, useDeferredValue } from "react";
import { Search, X } from "lucide-react";
import type { Teacher } from "../../types";

interface Props {
  teachers: Teacher[];
  selectedTeacher: string;
  onSelectTeacher: (name: string) => void;
}

/** Keeps typing and the autocomplete inside a small subtree, away from Dashboard calculations. */
export const DashboardTeacherSearch: React.FC<Props> = ({ teachers, selectedTeacher, onSelectTeacher }) => {
  const [query, setQuery] = useState(selectedTeacher);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const deferredQuery = useDeferredValue(query);
  const isStale = deferredQuery !== query;
  useEffect(() => { setQuery(selectedTeacher); }, [selectedTeacher]);
  useEffect(() => {
    const closeOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOutside);
    return () => document.removeEventListener("mousedown", closeOutside);
  }, []);
  const indexedTeachers = useMemo(() => teachers.map(teacher => ({
    teacher, search: `${teacher.nama} ${teacher.mapel_utama}`.toLocaleLowerCase("id-ID"),
  })), [teachers]);
  const filtered = useMemo(() => {
    const term = deferredQuery.trim().toLocaleLowerCase("id-ID");
    return term ? indexedTeachers.filter(({ search }) => search.includes(term)).map(({ teacher }) => teacher) : [];
  }, [indexedTeachers, deferredQuery]);
  const choose = (name: string) => { onSelectTeacher(name); setQuery(name); setOpen(false); };
  return <div className="relative" ref={containerRef}>
    <div className="relative">
      <input id="teacher-search-input" type="text"
        className="w-full pl-11 pr-10 py-3.5 bg-slate-50 hover:bg-slate-100/75 focus:bg-white text-slate-800 border border-slate-200 focus:border-blue-500 rounded-xl outline-none transition-all font-medium text-base shadow-sm"
        placeholder="Cari Nama Guru atau Mata Pelajaran..."
        value={query} onChange={event => { setQuery(event.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)} />
      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><Search className="w-5 h-5" /></div>
      {selectedTeacher && <button type="button" id="clear-search-btn" onClick={() => choose("")}
        className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200 transition-colors" title="Hapus pilihan">
        <X className="w-4 h-4" />
      </button>}
    </div>
    {open && !isStale && filtered.length > 0 && <div className="absolute z-30 left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl max-h-64 overflow-y-auto divide-y divide-slate-100">
      {filtered.map(teacher => <button type="button" key={teacher.nama}
        id={`suggest-${teacher.nama.replace(/\s+/g, '-').toLowerCase()}`}
        onClick={() => choose(teacher.nama)}
        className="w-full text-left px-5 py-3 hover:bg-blue-50/50 flex flex-col transition-colors group">
        <span className="font-semibold text-slate-700 group-hover:text-blue-600 transition-colors">{teacher.nama}</span>
        <span className="text-xs text-slate-400 mt-0.5">Mapel Utama: {teacher.mapel_utama} | Rumpun: {teacher.rumpun} | {teacher.jenjang}</span>
      </button>)}
    </div>}
    {open && !isStale && query.trim() && filtered.length === 0 && <div className="absolute z-30 left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl p-5 text-center text-slate-500 text-sm">
      Tidak menemukan guru dengan kata kunci "{query}"
    </div>}
  </div>;
};
