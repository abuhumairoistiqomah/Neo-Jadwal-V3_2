import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { Teacher } from "../../types";
import { useLanguage } from "../../i18n/LanguageProvider";

interface TeacherHeaderSearchProps {
  teachers: Teacher[];
  selectedTeacher: string;
  onSelectTeacher: (name: string) => void;
}

/**
 * The global search is deliberately state-local. Keystrokes must not rerender
 * App/Dashboard or rebuild the dated effective timetable until a teacher is
 * actually selected.
 */
export const TeacherHeaderSearch: React.FC<TeacherHeaderSearchProps> = ({ teachers, selectedTeacher, onSelectTeacher }) => {
  const { t, language } = useLanguage();
  const [query, setQuery] = useState(selectedTeacher);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(selectedTeacher); }, [selectedTeacher]);
  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setShowSuggestions(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  const suggestions = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("id-ID");
    if (!search) return [];
    return teachers.filter((teacher) =>
      teacher.nama.toLocaleLowerCase("id-ID").includes(search)
      || teacher.mapel_utama.toLocaleLowerCase("id-ID").includes(search),
    );
  }, [query, teachers]);

  const selectTeacher = (name: string) => {
    setQuery(name);
    setShowSuggestions(false);
    onSelectTeacher(name);
  };

  return (
    <div className="relative w-64 sm:w-80 md:w-96" ref={rootRef}>
      <span className="absolute inset-y-0 left-3 flex items-center text-slate-400">
        <Search className="w-4 h-4" />
      </span>
      <input
        id="global-teacher-search-input"
        type="text"
        placeholder={t("Cari Nama Guru... (Autocomplete)")}
        className="w-full pl-9 pr-8 py-2 border border-slate-200 rounded-lg text-xs sm:text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:bg-white text-slate-800 transition-all"
        value={query}
        onChange={(event) => { setQuery(event.target.value); setShowSuggestions(true); }}
        onFocus={() => setShowSuggestions(true)}
      />
      {query && (
        <button
          id="clear-global-search-btn"
          onClick={() => selectTeacher("")}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200 transition-all"
          title={t("Bersihkan pilihan")}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto divide-y divide-slate-100">
          {suggestions.map((teacher) => (
            <button
              key={teacher.nama}
              id={`global-suggest-${teacher.nama.replace(/\s+/g, "-").toLowerCase()}`}
              onClick={() => selectTeacher(teacher.nama)}
              className="w-full text-left px-4 py-2.5 hover:bg-blue-50/50 flex flex-col transition-colors group"
            >
              <span className="font-semibold text-xs sm:text-sm text-slate-700 group-hover:text-blue-600 transition-colors">
                {teacher.nama}
              </span>
              <span className="text-[10px] text-slate-400 mt-0.5">
                {teacher.mapel_utama} | {teacher.jenjang} {teacher.wali_kelas ? `| Wali ${teacher.wali_kelas}` : ""}
              </span>
            </button>
          ))}
        </div>
      )}
      {showSuggestions && query.trim() !== "" && suggestions.length === 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-lg p-4 text-center text-slate-500 text-xs">
          <span lang={language} dir={language === "ar" ? "rtl" : undefined}>{t("Tidak ada guru")}</span> "{query}"
        </div>
      )}
    </div>
  );
};
