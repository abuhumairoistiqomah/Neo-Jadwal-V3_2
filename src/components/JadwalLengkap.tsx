import React, { useMemo, useState } from "react";
import type { JadwalInsidentalItem, KalenderAkademikItem, LogIzinItem } from "../domain/models";
import { buildTeacherWeeklyView, teacherWeekDays, type TeacherWeekRow, type TeacherWeeklyMode } from "../domain/schedule/teacherWeeklyView";
import { getSchoolTodayISO } from "../domain/date";
import { getTeacherWeekSlotAnnotations } from "../domain/schedule/teacherWeeklyPresentation";
import { isGrade1Or2 } from "../domain/class";
import { Teacher, ScheduleItem, MasterRuanganItem, getRoomDisplayName, normalizeDay, checkIsITBA, isITBACoreSubject, isAlQuranOrTahsin } from "../types";
import { ArrowLeft, BookOpen, AlertCircle, HelpCircle, Search, X, Clock, User, Calendar, GraduationCap, Users, Download, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { downloadElementAsPng } from "../infrastructure/browser/exportElementJpeg";
import { getErrorMessage } from "../domain/errorMessage";
import { compactClassLabel, compactSubjectLabel } from "../domain/schedule/displayLabels";
import { JAM_TIME_MAP, SCHOOL_DAYS as HARI_LIST, TEACHING_JPS as JAM_LIST } from "../constants/schedule";

import { T, useLanguage } from '../i18n/LanguageProvider';
import { displaySchoolWeekRange } from '../i18n/translations';

interface JadwalLengkapProps {
  teachers: Teacher[];
  schedules: ScheduleItem[];
  masterRuangan?: MasterRuanganItem[];
  incidentals?: JadwalInsidentalItem[];
  logs?: LogIzinItem[];
  kalenderAkademik?: KalenderAkademikItem[];
  schoolToday?: string;
  selectedTeacher: string;
  setSelectedTeacher: (name: string) => void;
  onBack: () => void;
}


export const JadwalLengkap: React.FC<JadwalLengkapProps> = ({
  teachers,
  schedules,
  masterRuangan = [],
  incidentals = [],
  logs = [],
  kalenderAkademik = [],
  schoolToday = getSchoolTodayISO(),
  selectedTeacher,
  setSelectedTeacher,
  onBack,
}) => {
  const {t,language} = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");
  const [scheduleMode, setScheduleMode] = useState<TeacherWeeklyMode>("EFFECTIVE");
  const [weekOffset, setWeekOffset] = useState(0);
  const weekDays = useMemo(() => teacherWeekDays(schoolToday, weekOffset), [schoolToday, weekOffset]);
  const weekRange = displaySchoolWeekRange(weekDays[0].dateStr, weekDays[4].dateStr, language);
  const [isDownloadingTeacherPng, setIsDownloadingTeacherPng] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState<{
    hari: string;
    jam: number;
    waktu: string;
    isPendampingSlot: boolean;
    isSlotGabung: boolean;
    isSlotBergantian: boolean;
    isConflict: boolean;
    items: TeacherWeekRow[];
  } | null>(null);

  // Filter teachers for search inside this view
  const filteredTeachers = useMemo(() => searchQuery.trim() === ""
    ? []
    : teachers.filter(t => t.nama.toLowerCase().includes(searchQuery.toLowerCase())),
  [searchQuery, teachers]);

  // Active teacher
  const currentTeacher = teachers.find(t => t.nama === selectedTeacher);
  const isITBA = currentTeacher ? checkIsITBA(currentTeacher) : false;

  // MASTER never receives dated overrides. EFFECTIVE is derived from the canonical
  // dated schedule engine and uses the same weekend/week selection as Jadwal Ruangan.
  const teacherSchedules: TeacherWeekRow[] = useMemo(() => buildTeacherWeeklyView({
    teacher: selectedTeacher, mode: scheduleMode, weekDays,
    schedules, incidentals, logs, calendar: kalenderAkademik,
  }), [selectedTeacher, scheduleMode, weekDays, schedules, incidentals, logs, kalenderAkademik]);

  // Total JP (Jumlah Jam Pelajaran) in a week (counting unique slots as 1 JP)
  const uniqueSlots = new Set<string>();
  teacherSchedules.forEach(item => {
    if (!["IZIN", "TUGAS_RESMI", "KALENDER"].includes(item.weekStatus)) uniqueSlots.add(`${normalizeDay(item.hari)}-${item.jam_ke}`);
  });
  const totalJP = uniqueSlots.size;

  // Map schedules to 2D lookup [Hari][Jam_ke] -> ScheduleItem[]
  const scheduleMap: Record<string, Record<number, TeacherWeekRow[]>> = {};
  HARI_LIST.forEach(hari => {
    scheduleMap[hari] = {};
  });
  teacherSchedules.forEach(item => {
    const normH = normalizeDay(item.hari);
    if (scheduleMap[normH]) {
      if (!scheduleMap[normH][item.jam_ke]) {
        scheduleMap[normH][item.jam_ke] = [];
      }
      scheduleMap[normH][item.jam_ke].push(item);
    }
  });
  const selectedDetailAnnotations = selectedDetail
    ? getTeacherWeekSlotAnnotations(selectedDetail.items, scheduleMode)
    : null;

  // V3.14.5: Export the existing Jadwal Lengkap grid (not a second teacher
  // timetable). The staging clone is attached off-screen, never printed, and
  // keeps the full desktop table visible even when exporting from a phone.
  const handleDownloadTeacherPng = async () => {
    if (!selectedTeacher.trim() || isDownloadingTeacherPng) return;

    const summary = document.getElementById("teacher-timetable-summary");
    const legend = document.getElementById("teacher-timetable-legend");
    const grid = document.getElementById("teacher-timetable-grid");
    if (!(summary instanceof HTMLElement) || !(legend instanceof HTMLElement) || !(grid instanceof HTMLElement)) {
      alert("Tabel jadwal guru belum siap. Silakan coba lagi.");
      return;
    }

    setIsDownloadingTeacherPng(true);
    // Keep the off-screen positioning on a separate host. The PNG helper
    // copies computed positioning: capturing a fixed, -100000px element
    // directly would otherwise produce an empty image.
    const exportHost = document.createElement("div");
    exportHost.style.cssText = "position:fixed;left:-100000px;top:0;width:1300px;pointer-events:none;z-index:-1";
    const staging = document.createElement("section");
    staging.setAttribute("data-teacher-png-staging", "true");
    staging.style.cssText = [
      "width:1300px", "max-width:none", "box-sizing:border-box", "padding:32px",
      "background:#ffffff", "color:#0f172a", "display:flex", "flex-direction:column",
      "gap:22px", "font-family:Arial,sans-serif",
    ].join(";");

    try {
      const schoolHeader = document.createElement("header");
      schoolHeader.style.cssText = "text-align:center;border-bottom:2px solid #cbd5e1;padding:2px 0 20px";
      const schoolName = document.createElement("div");
      schoolName.textContent = "AL-WILDAN ISLAMIC SCHOOL 10 JAKARTA";
      schoolName.style.cssText = "font-size:13px;font-weight:800;color:#2563eb;letter-spacing:2px";
      const heading = document.createElement("h1");
      heading.textContent = "WEEKLY TEACHER TIMETABLE";
      heading.style.cssText = "font-size:28px;line-height:1.3;font-weight:900;color:#1e293b;margin:8px 0 3px";
      const context = document.createElement("p");
      context.textContent = scheduleMode === "MASTER" ? "JADWAL NORMAL / MASTER MINGGUAN" : `JADWAL EFEKTIF • ${weekRange}`;
      context.style.cssText = "font-size:12px;font-weight:700;color:#64748b;letter-spacing:1px;margin:0";
      schoolHeader.append(schoolName, heading, context);
      staging.appendChild(schoolHeader);

      const summaryClone = summary.cloneNode(true) as HTMLElement;
      summaryClone.removeAttribute("id");
      summaryClone.style.display = "flex";
      summaryClone.style.flexDirection = "row";
      summaryClone.style.alignItems = "center";
      staging.appendChild(summaryClone);

      const legendClone = legend.cloneNode(true) as HTMLElement;
      legendClone.removeAttribute("id");
      legendClone.style.display = "flex";
      legendClone.style.flexWrap = "wrap";
      staging.appendChild(legendClone);

      const gridClone = grid.cloneNode(true) as HTMLElement;
      gridClone.removeAttribute("id");
      // The live desktop grid is `hidden md:block`. Force the export-only
      // copy visible regardless of the browser viewport breakpoint.
      gridClone.style.display = "block";
      gridClone.style.width = "100%";
      gridClone.style.maxWidth = "none";
      gridClone.style.overflow = "visible";
      gridClone.setAttribute("data-export-expand-scroll", "true");
      const table = gridClone.querySelector("table");
      if (!(table instanceof HTMLTableElement)) throw new Error("Tabel jadwal guru tidak ditemukan.");
      table.style.width = "100%";
      table.style.minWidth = "1200px";
      table.style.tableLayout = "fixed";

      // Export-only text compaction; canonical rows and live timetable are intact.
      gridClone.querySelectorAll<HTMLElement>('[data-teacher-export-subject="true"]').forEach((element) => {
        element.textContent = (element.textContent || "").split(" & ").map(compactSubjectLabel).join(" & ");
      });
      gridClone.querySelectorAll<HTMLElement>('[data-teacher-export-class="true"]').forEach((element) => {
        element.textContent = compactClassLabel(element.textContent || "");
      });
      staging.appendChild(gridClone);
      exportHost.appendChild(staging);
      document.body.appendChild(exportHost);

      const safeName = selectedTeacher.trim().replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_").slice(0, 100);
      await downloadElementAsPng(staging, `Jadwal_Guru_${safeName}_${scheduleMode === "MASTER" ? "Normal" : `Insidental_${weekDays[0].dateStr}`}.png`);
    } catch (error) {
      console.error("Gagal mengunduh PNG jadwal guru:", error);
      alert(`Gagal mengunduh PNG jadwal guru. ${getErrorMessage(error, "Silakan coba lagi.")}`);
    } finally {
      exportHost.remove();
      setIsDownloadingTeacherPng(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Navigation Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <button
          id="back-to-dashboard-btn"
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-blue-600 bg-white px-4 py-2 rounded-xl border border-slate-200 hover:border-blue-100 shadow-sm transition-all self-start"
        >
          <ArrowLeft className="w-4 h-4" />
          <T>{"Kembali ke Dashboard"}</T>
        </button>

        <div className="flex items-center gap-2 text-sm font-medium text-slate-400">
          <span><T>{"Jadwal Pelajaran Lengkap"}</T></span>
        </div>
      </div>

      {/* Main Section */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        {/* Search Bar / Switcher */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-blue-600" />
              <T>{"Jadwal Pelajaran Mingguan"}</T>
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              <T>{"Gunakan bilah di samping untuk mengganti guru yang sedang ditinjau."}</T>
            </p>
          </div>

          <div className="relative w-full md:w-80">
            <div className="relative">
              <input
                id="jadwal-search-input"
                type="text"
                placeholder="Ganti Guru..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSuggestions(true);
                }}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 text-sm border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:outline-none transition-all"
              />
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            </div>

            {showSuggestions && filteredTeachers.length > 0 && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-100">
                {filteredTeachers.map(t => (
                  <button
                    key={t.nama}
                    id={`jadwal-suggest-${t.nama.replace(/\s+/g, '-').toLowerCase()}`}
                    onClick={() => {
                      setSelectedTeacher(t.nama);
                      setSearchQuery("");
                      setShowSuggestions(false);
                    }}
                    className="w-full text-left px-4 py-2.5 text-xs hover:bg-blue-50 text-slate-700 font-medium"
                  >
                    {t.nama}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {selectedTeacher ? (
          <div className="space-y-6">
            <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4 space-y-3">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Mode jadwal guru">
                <button type="button" onClick={() => setScheduleMode("MASTER")} aria-pressed={scheduleMode === "MASTER"} className={`rounded-xl px-4 py-2 text-sm font-bold ${scheduleMode === "MASTER" ? "bg-blue-600 text-white" : "bg-white text-slate-600 border border-slate-200"}`}>Jadwal Normal</button>
                <button type="button" onClick={() => setScheduleMode("EFFECTIVE")} aria-pressed={scheduleMode === "EFFECTIVE"} className={`rounded-xl px-4 py-2 text-sm font-bold ${scheduleMode === "EFFECTIVE" ? "bg-blue-600 text-white" : "bg-white text-slate-600 border border-slate-200"}`}><T>{"Jadwal Insidental"}</T></button>
              </div>
              {scheduleMode === "EFFECTIVE" && <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => setWeekOffset((value) => value - 1)} className="rounded-xl border border-slate-200 bg-white p-2" aria-label="Minggu sebelumnya"><ChevronLeft className="w-5 h-5" /></button>
                <span className="text-sm font-black text-slate-800" aria-live="polite">{weekRange}</span>
                <button type="button" onClick={() => setWeekOffset((value) => value + 1)} className="rounded-xl border border-slate-200 bg-white p-2" aria-label="Minggu berikutnya"><ChevronRight className="w-5 h-5" /></button>
                <button type="button" onClick={() => setWeekOffset(0)} className="text-xs font-bold text-blue-700 hover:underline"><T>{"Minggu default"}</T></button>
                <span className="text-xs text-slate-500"><T>{"Sabtu/Minggu otomatis menampilkan minggu depan • Zona Jakarta"}</T></span>
              </div>}
            </div>
            {/* Teacher Header and JP summary */}
            <div id="teacher-timetable-summary" className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-5 bg-slate-50 rounded-2xl gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-slate-800">{selectedTeacher}</h3>
                  {isITBA && (
                    <span className="text-[10px] bg-purple-100 text-purple-800 border border-purple-200 font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wider">
                      Mahasiswa ITBA
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  <T>{"Mata Pelajaran Utama:"}</T> {currentTeacher?.mapel_utama || "Tidak terdaftar"} | Rumpun: {currentTeacher?.rumpun || "-"}
                </p>
              </div>

              <div className="bg-blue-600 text-white px-5 py-3 rounded-xl shadow-sm text-center min-w-[120px]">
                <span className="block text-[10px] uppercase font-bold text-blue-200 tracking-wider"><T>{"Total Beban"}</T></span>
                <span className="text-2xl font-black">{totalJP} <T>{"JP"}</T></span>
                <span className="block text-[10px] text-blue-100">per minggu</span>
              </div>
            </div>

            {/* Legend */}
            <div id="teacher-timetable-legend" className="flex flex-wrap gap-4 text-xs font-medium text-slate-500 p-3 border border-slate-100 rounded-xl bg-slate-50/50">
              <span className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded bg-sky-100 border border-sky-200"></span>
                <T>{"Kelas Reguler (Biru Muda)"}</T>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded bg-pink-100 border border-pink-200"></span>
                <T>{"Kelas Bentrok (Pink)"}</T>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded bg-emerald-100 border border-emerald-200"></span>
                <T>{"Kelas Gabung (Hijau)"}</T>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded bg-teal-100 border border-teal-300"></span>
                <T>{"Kelas Bergantian (Tosca)"}</T>
              </span>
              {isITBA && (
                <span className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded bg-purple-100 border border-purple-200"></span>
                  <T>{"Pendamping Guru Mapel (Ungu)"}</T>
                </span>
              )}
              <span className="flex items-center gap-1.5 ml-auto">
                <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                <T>{"Dua kelas bersamaan diampu satu ustadz dihitung sebagai 1 JP"}</T>
              </span>
            </div>

            {/* Export is driven by the existing grid, not an additional schedule view. */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <p className="text-xs text-slate-500">
                <T>{"PNG mengikuti mode dan minggu yang dipilih (Senin–Jumat, JP1–JP6)."}</T>
              </p>
              <button
                id="download-teacher-timetable-png-btn"
                type="button"
                onClick={handleDownloadTeacherPng}
                disabled={isDownloadingTeacherPng}
                className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-sm transition-all cursor-pointer disabled:cursor-wait shrink-0"
              >
                {isDownloadingTeacherPng ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {isDownloadingTeacherPng ? "Menyiapkan PNG..." : "Unduh Jadwal Guru (PNG)"}
              </button>
            </div>

            {/* DESKTOP 2D GRID TABLE */}
            <div id="teacher-timetable-grid" className="hidden md:block overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full border-collapse text-left table-fixed min-w-[950px]">
                <colgroup>
                  <col className="w-28" />
                  <col />
                  <col />
                  <col />
                  <col />
                  <col />
                  <col />
                </colgroup>
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center w-28 border-r border-slate-200">
                      Hari \ Jam
                    </th>
                    {JAM_LIST.map(jam => (
                      <th key={jam} className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center border-r border-slate-200 last:border-0">
                        <div>Jam ke-{jam}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {HARI_LIST.map(hari => (
                    <tr key={hari} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 font-bold text-slate-700 bg-slate-50/50 text-center border-r border-slate-200">
                        {t(hari)}
                      </td>
                      {JAM_LIST.map(jam => {
                        const items = scheduleMap[hari][jam] || [];

                        if (items.length > 0) {
                          const isSlotGabung = items.some(item => 
                            item.kelasgabung && (
                              item.kelasgabung.trim().toLowerCase() === "ya" || 
                              item.kelasgabung.trim().toLowerCase() === "iya"
                            )
                          );
                          const isSlotBergantian = items.some(item => 
                            item.kelasgabung && item.kelasgabung.trim().toLowerCase() === "bergantian"
                          );
                          const isConflict = items.length >= 2 && !isSlotGabung && !isSlotBergantian;

                          const isPendampingSlot = items.some(item => {
                            if (isAlQuranOrTahsin(item.mapel)) {
                              return false;
                            }
                            const isGuru1 = item.guru1 && item.guru1.trim().toLowerCase() === currentTeacher?.nama.trim().toLowerCase();
                            if (isITBA) {
                              const sName = (item.mapel || "").trim().toLowerCase();
                              const isArabic = 
                                sName.includes("arabic") || 
                                sName.includes("bahasa arab") || 
                                sName.includes("arab") || 
                                sName.includes("b. arab") || 
                                sName.includes("b.arab");
                              if (isArabic) {
                                return !isGuru1;
                              }
                              return !isITBACoreSubject(item.mapel, currentTeacher?.nama);
                            } else {
                              const isSupervisingCol = item.selainguru1_mengawas && (item.selainguru1_mengawas.trim().toLowerCase() === "yes" || item.selainguru1_mengawas.trim().toLowerCase() === "ya");
                              return !isGuru1 && isSupervisingCol;
                            }
                          });

                          const uniqueMapels = [...new Set(items.map(i => i.mapel))];
                          const uniqueKelas = [...new Set(items.map(i => i.kelas))];
                          const displayMapel = uniqueMapels.join(" & ");
                          const displayKelas = uniqueKelas.join(" & ");
                          const firstItem = items[0];
                          const annotations = getTeacherWeekSlotAnnotations(items, scheduleMode);

                          let cellClasses = "";
                          let badge = null;

                          if (isPendampingSlot) {
                            cellClasses = "bg-purple-50 text-purple-900 border-l-2 border-l-purple-400 border-purple-100";
                            badge = (
                              <span className="mt-1.5 text-[8px] bg-purple-100 text-purple-800 border border-purple-200 font-bold px-1 py-0.5 rounded uppercase tracking-wider inline-block">
                                <T>{"Pendamping (1 JP)"}</T>
                              </span>
                            );
                          } else if (isSlotGabung) {
                            cellClasses = "bg-emerald-50 text-emerald-900 border-l-2 border-l-emerald-400 border-emerald-100";
                            badge = (
                              <span className="mt-1.5 text-[8px] bg-emerald-100 text-emerald-800 font-bold px-1 py-0.5 rounded uppercase tracking-wider inline-block">
                                <T>{"Gabung (1 JP)"}</T>
                              </span>
                            );
                          } else if (isSlotBergantian) {
                            cellClasses = "bg-teal-50 text-teal-950 border-l-2 border-l-teal-500 border-teal-200";
                            badge = (
                              <span className="mt-1.5 text-[8px] bg-teal-100 text-teal-900 border border-teal-300 font-bold px-1 py-0.5 rounded uppercase tracking-wider inline-block">
                                <T>{"Bergantian (1 JP)"}</T>
                              </span>
                            );
                          } else if (isConflict) {
                            cellClasses = "bg-pink-50 text-pink-900 border-l-2 border-l-pink-400 border-pink-100";
                            badge = (
                              <span className="mt-1.5 text-[8px] bg-pink-100 text-pink-700 font-bold px-1 py-0.5 rounded uppercase tracking-wider inline-block">
                                <T>{"Bentrok (1 JP)"}</T>
                              </span>
                            );
                          } else {
                            cellClasses = "bg-sky-50 text-sky-900 border-l-2 border-l-sky-400 border-sky-100";
                            badge = (
                              <span className="mt-1.5 text-[8px] bg-sky-100 text-sky-800 font-bold px-1 py-0.5 rounded uppercase tracking-wider inline-block">
                                <T>{"Reguler (1 JP)"}</T>
                              </span>
                            );
                          }

                          if (scheduleMode === "EFFECTIVE") {
                            if (items.some((item) => (item as TeacherWeekRow).weekStatus === "TUGAS_RESMI")) cellClasses = "bg-rose-100 text-red-900 border-l-4 border-l-red-600 border-red-300";
                            else if (items.some((item) => (item as TeacherWeekRow).weekStatus === "IZIN")) cellClasses = "bg-rose-50 text-rose-900 border-l-2 border-l-rose-500 border-rose-200";
                            else if (items.some((item) => (item as TeacherWeekRow).weekStatus === "KALENDER")) cellClasses = "bg-red-50 text-red-800 border-l-2 border-l-red-400 border-red-200";
                            else if (items.some((item) => (item as TeacherWeekRow).weekStatus === "BADAL")) cellClasses = "bg-amber-50 text-amber-900 border-l-2 border-l-amber-500 border-amber-200";
                            else if (items.some((item) => (item as TeacherWeekRow).weekStatus === "INSIDENTAL")) cellClasses = "bg-indigo-50 text-indigo-900 border-l-2 border-l-indigo-500 border-indigo-200";
                          }

                          return (
                            <td 
                              key={`jam-${jam}`} 
                              onClick={() => {
                                const formattedTime = (() => {
                                  const isMonToThu = ["Senin", "Selasa", "Rabu", "Kamis"].includes(hari);
                                  const hasG12 = items.some(i => isGrade1Or2(i.kelas));
                                  if (isMonToThu && jam === 6) {
                                    return hasG12 ? "14:00 - 14:20" : "14:00 - 15:00";
                                  }
                                  return firstItem.mulai && firstItem.selesai ? `${firstItem.mulai} - ${firstItem.selesai}` : "";
                                })();
                                setSelectedDetail({
                                  hari,
                                  jam,
                                  waktu: formattedTime,
                                  isPendampingSlot,
                                  isSlotGabung,
                                  isSlotBergantian,
                                  isConflict,
                                  items,
                                });
                              }}
                              data-export-cell="true"
                              className={`p-3 border-r border-slate-200 last:border-0 text-center transition-all cursor-pointer hover:bg-slate-100/90 hover:scale-[1.01] hover:shadow-xs active:scale-95 ${cellClasses}`}
                              title="Klik untuk detail pelajaran & pengampu"
                            >
                              <div data-teacher-export-subject="true" data-export-expand-text="true" className="font-extrabold text-xs sm:text-sm leading-tight">{displayMapel}</div>
                              {annotations.statusLabels.map((status) => <div key={status} className="mt-1 text-[9px] font-black uppercase break-words">{status}</div>)}
                              {annotations.operationalDetails.map((detail) => <div key={detail} className="text-[9px] leading-tight mt-1 break-words">{detail}</div>)}
                              {annotations.specialNotes.map((note) => <div key={note} className="text-[9px] leading-tight mt-1 break-words">Keterangan Khusus: {note}</div>)}
                              <div data-teacher-export-class="true" data-export-expand-text="true" className="text-xs font-bold mt-1 opacity-90">Kelas {displayKelas}</div>
                              <div className="text-[10px] mt-0.5 opacity-75">
                                {(() => {
                                  const isMonToThu = ["Senin", "Selasa", "Rabu", "Kamis"].includes(hari);
                                  const hasG12 = items.some(i => isGrade1Or2(i.kelas));
                                  if (isMonToThu && jam === 6) {
                                    return hasG12 ? "14:00 - 14:20" : "14:00 - 15:00";
                                  }
                                  return firstItem.mulai && firstItem.selesai ? `${firstItem.mulai} - ${firstItem.selesai}` : "";
                                })()}
                              </div>
                              <div className="block">{badge}</div>
                              
                              {/* Other Teachers Badge List if other teachers are teaching */}
                              {(() => {
                                const otherTeachersList: string[] = [];
                                items.forEach(scItem => {
                                  const scTeachers = [
                                    scItem.guru1,
                                    scItem.guru2,
                                    scItem.guru3,
                                    scItem.guru4,
                                    scItem.guru5,
                                    scItem.guru6
                                  ].map(g => g?.trim()).filter(Boolean);
                                  
                                  scTeachers.forEach(tName => {
                                    if (tName.toLowerCase() !== selectedTeacher.toLowerCase() && !otherTeachersList.includes(tName)) {
                                      otherTeachersList.push(tName);
                                    }
                                  });
                                });

                                if (otherTeachersList.length > 0) {
                                  return (
                                    <div className="mt-1.5 text-[8px] bg-white/70 border border-slate-200/50 p-1 rounded leading-normal font-medium text-slate-600 text-center">
                                      <div className="font-extrabold text-[7px] uppercase tracking-wider text-slate-400">Team Teaching:</div>
                                      <div data-export-expand-text="true" className="truncate" title={otherTeachersList.join(", ")}>{otherTeachersList.join(", ")}</div>
                                    </div>
                                  );
                                }
                                return null;
                              })()}
                            </td>
                          );
                        } else {
                          return (
                            <td key={`jam-${jam}`} className="p-3 border-r border-slate-200 last:border-0 bg-slate-50/20 text-center text-xs text-slate-300 italic">
                              Kosong
                            </td>
                          );
                        }
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* MOBILE LAYOUT (LIST CARD PER HARI) */}
            <div className="block md:hidden space-y-4">
              {HARI_LIST.map(hari => {
                const daySlots = JAM_LIST.map(jam => ({
                  jam,
                  items: scheduleMap[hari][jam] || []
                }));

                const hasSchedulesOnDay = daySlots.some(slot => slot.items.length > 0);

                return (
                  <div key={hari} className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
                      <span className="font-bold text-slate-800">{t(hari)}</span>
                      <span className="text-xs text-blue-600 bg-blue-50 font-semibold px-2 py-0.5 rounded-full">
                        {daySlots.filter(s => s.items.length > 0).length} Sesi
                      </span>
                    </div>

                    <div className="p-4 space-y-3 bg-white">
                      {daySlots.filter(s => s.items.length > 0).length > 0 ? (
                        daySlots
                          .filter(s => s.items.length > 0)
                          .map(({ jam, items }) => {
                            const isSlotGabung = items.some(item => 
                              item.kelasgabung && (
                                item.kelasgabung.trim().toLowerCase() === "ya" || 
                                item.kelasgabung.trim().toLowerCase() === "iya"
                              )
                            );
                            const isSlotBergantian = items.some(item => 
                              item.kelasgabung && item.kelasgabung.trim().toLowerCase() === "bergantian"
                            );
                            const isConflict = items.length >= 2 && !isSlotGabung && !isSlotBergantian;

                            const isPendampingSlot = items.some(item => {
                              if (isAlQuranOrTahsin(item.mapel)) {
                                return false;
                              }
                              const isGuru1 = item.guru1 && item.guru1.trim().toLowerCase() === currentTeacher?.nama.trim().toLowerCase();
                              if (isITBA) {
                                const sName = (item.mapel || "").trim().toLowerCase();
                                const isArabic = 
                                  sName.includes("arabic") || 
                                  sName.includes("bahasa arab") || 
                                  sName.includes("arab") || 
                                  sName.includes("b. arab") || 
                                  sName.includes("b.arab");
                                if (isArabic) {
                                  return !isGuru1;
                                }
                                return !isITBACoreSubject(item.mapel, currentTeacher?.nama);
                              } else {
                                const isSupervisingCol = item.selainguru1_mengawas && (item.selainguru1_mengawas.trim().toLowerCase() === "yes" || item.selainguru1_mengawas.trim().toLowerCase() === "ya");
                                return !isGuru1 && isSupervisingCol;
                              }
                            });

                            const uniqueMapels = [...new Set(items.map(i => i.mapel))];
                            const uniqueKelas = [...new Set(items.map(i => i.kelas))];
                            const displayMapel = uniqueMapels.join(" & ");
                            const displayKelas = uniqueKelas.join(" & ");
                            const firstItem = items[0];
                            const annotations = getTeacherWeekSlotAnnotations(items, scheduleMode);

                            let bgClasses = "";
                            let badge = null;

                            if (isPendampingSlot) {
                              bgClasses = "bg-purple-50 border-purple-100 text-purple-900";
                              badge = (
                                <span className="text-[8px] bg-purple-100 text-purple-800 border border-purple-200 font-bold px-1 py-0.5 rounded uppercase tracking-wider">
                                  <T>{"Pendamping (1 JP)"}</T>
                                </span>
                              );
                            } else if (isSlotGabung) {
                              bgClasses = "bg-emerald-50 border-emerald-100 text-emerald-900";
                              badge = (
                                <span className="text-[8px] bg-emerald-100 text-emerald-800 font-bold px-1 py-0.5 rounded uppercase tracking-wider">
                                  <T>{"Gabung (1 JP)"}</T>
                                </span>
                              );
                            } else if (isSlotBergantian) {
                              bgClasses = "bg-teal-50 border-teal-200 text-teal-950";
                              badge = (
                                <span className="text-[8px] bg-teal-100 text-teal-900 border border-teal-300 font-bold px-1 py-0.5 rounded uppercase tracking-wider">
                                  <T>{"Bergantian (1 JP)"}</T>
                                </span>
                              );
                            } else if (isConflict) {
                              bgClasses = "bg-pink-50 border-pink-100 text-pink-900";
                              badge = (
                                <span className="text-[8px] bg-pink-100 text-pink-700 font-bold px-1 py-0.5 rounded uppercase tracking-wider">
                                  <T>{"Bentrok (1 JP)"}</T>
                                </span>
                              );
                            } else {
                              bgClasses = "bg-sky-50 border-sky-100 text-sky-900";
                              badge = (
                                <span className="text-[8px] bg-sky-100 text-sky-800 font-bold px-1 py-0.5 rounded uppercase tracking-wider">
                                  {annotations.statusLabels.length ? "1 JP" : <T>{"Reguler (1 JP)"}</T>}
                                </span>
                              );
                            }

                            // The mobile card must reflect the same effective-state
                            // hierarchy as the desktop timetable, not just its base
                            // regular/team-teaching category.
                            if (scheduleMode === "EFFECTIVE") {
                              if (items.some((item) => (item as TeacherWeekRow).weekStatus === "TUGAS_RESMI")) bgClasses = "bg-rose-100 text-red-900 border-red-300 border-l-4 border-l-red-600";
                              else if (items.some((item) => (item as TeacherWeekRow).weekStatus === "IZIN")) bgClasses = "bg-rose-50 text-rose-900 border-rose-200 border-l-2 border-l-rose-500";
                              else if (items.some((item) => (item as TeacherWeekRow).weekStatus === "KALENDER")) bgClasses = "bg-red-50 text-red-800 border-red-200 border-l-2 border-l-red-400";
                              else if (items.some((item) => (item as TeacherWeekRow).weekStatus === "BADAL")) bgClasses = "bg-amber-50 text-amber-900 border-amber-200 border-l-2 border-l-amber-500";
                              else if (items.some((item) => (item as TeacherWeekRow).weekStatus === "INSIDENTAL")) bgClasses = "bg-indigo-50 text-indigo-900 border-indigo-200 border-l-2 border-l-indigo-500";
                            }

                            return (
                              <div 
                                key={jam}
                                onClick={() => {
                                  const formattedTime = (() => {
                                    const isMonToThu = ["Senin", "Selasa", "Rabu", "Kamis"].includes(hari);
                                    const hasG12 = items.some(i => isGrade1Or2(i.kelas));
                                    if (isMonToThu && jam === 6) {
                                      return hasG12 ? "14:00 - 14:20" : "14:00 - 15:00";
                                    }
                                    return firstItem.mulai && firstItem.selesai ? `${firstItem.mulai} - ${firstItem.selesai}` : JAM_TIME_MAP[jam];
                                  })();
                                  setSelectedDetail({
                                    hari,
                                    jam,
                                    waktu: formattedTime,
                                    isPendampingSlot,
                                    isSlotGabung,
                                    isSlotBergantian,
                                    isConflict,
                                    items,
                                  });
                                }}
                                className={`p-3 rounded-lg border flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-100/95 hover:ring-2 hover:ring-blue-400/30 transition-all active:scale-[0.98] ${bgClasses}`}
                                title="Klik untuk detail pelajaran & pengampu"
                              >
                                <div className="min-w-0 flex-1">
                                  <span className="text-[10px] font-extrabold uppercase bg-white/60 px-1.5 py-0.5 rounded mr-2">
                                    Jam {jam}
                                  </span>
                                  <span className="text-xs font-medium opacity-80">
                                    {(() => {
                                      const isMonToThu = ["Senin", "Selasa", "Rabu", "Kamis"].includes(hari);
                                      const hasG12 = items.some(i => isGrade1Or2(i.kelas));
                                      if (isMonToThu && jam === 6) {
                                        return hasG12 ? "14:00 - 14:20" : "14:00 - 15:00";
                                      }
                                      return firstItem.mulai && firstItem.selesai ? `${firstItem.mulai} - ${firstItem.selesai}` : JAM_TIME_MAP[jam];
                                    })()}
                                  </span>
                                  <h4 className="font-bold text-sm mt-1 break-words">{displayMapel}</h4>
                                  {/* Same operational facts as the desktop grid: do not hide
                                      supervisory notes or dated assignment reasons on mobile. */}
                                  {annotations.statusLabels.map((status) => (
                                    <div key={status} className="mt-1 text-[10px] font-extrabold uppercase leading-snug break-words">{status}</div>
                                  ))}
                                  {annotations.operationalDetails.map((detail) => (
                                    <p key={detail} className="mt-1 text-xs font-medium leading-relaxed whitespace-normal break-words">{detail}</p>
                                  ))}
                                  {annotations.specialNotes.map((note) => (
                                    <p key={note} className="mt-1 text-xs leading-relaxed whitespace-normal break-words">Keterangan Khusus: {note}</p>
                                  ))}
                                  <div className="mt-1">{badge}</div>

                                  {/* Other Teachers Badge List if other teachers are teaching */}
                                  {(() => {
                                    const otherTeachersList: string[] = [];
                                    items.forEach(scItem => {
                                      const scTeachers = [
                                        scItem.guru1,
                                        scItem.guru2,
                                        scItem.guru3,
                                        scItem.guru4,
                                        scItem.guru5,
                                        scItem.guru6
                                      ].map(g => g?.trim()).filter(Boolean);
                                      
                                      scTeachers.forEach(tName => {
                                        if (tName.toLowerCase() !== selectedTeacher.toLowerCase() && !otherTeachersList.includes(tName)) {
                                          otherTeachersList.push(tName);
                                        }
                                      });
                                    });

                                    if (otherTeachersList.length > 0) {
                                      return (
                                        <div className="mt-1.5 flex flex-wrap items-center gap-1 bg-white/60 border border-slate-200/50 px-2 py-1 rounded text-[10px]">
                                          <span className="font-bold text-slate-500 uppercase text-[8px] tracking-wider block mr-0.5">Team Teaching:</span>
                                          {otherTeachersList.map((tName, idx) => (
                                            <span key={idx} className="bg-white border border-slate-200 text-slate-700 px-1.5 py-0.25 rounded font-semibold">
                                              {tName}
                                            </span>
                                          ))}
                                        </div>
                                      );
                                    }
                                    return null;
                                  })()}
                                </div>
                                <div className="text-right text-xs min-w-0 max-w-[43%] shrink-0">
                                  <span className="block font-bold whitespace-normal break-words">Kelas {displayKelas}</span>
                                </div>
                              </div>
                            );
                          })
                      ) : (
                        <div className="text-center py-4 text-xs text-slate-400 italic">
                          <T>{"Tidak ada jadwal mengajar pada hari ini"}</T>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

          </div>
        ) : (
          <div className="text-center py-10">
            <AlertCircle className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-500 font-medium"><T>{"Belum memilih guru"}</T></p>
            <p className="text-xs text-slate-400 mt-1"><T>{"Silakan cari atau pilih nama guru di dashboard terlebih dahulu."}</T></p>
          </div>
        )}
      </div>

      {/* Detail Pop-up Modal */}
      {selectedDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-5 flex justify-between items-start shrink-0">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-widest bg-blue-600 px-2.5 py-0.5 rounded-full">
                  <T>{"Detail Pelajaran"}</T>
                </span>
                <h3 className="text-xl font-black mt-2 leading-tight flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-blue-400" />
                  {t("Hari")} {t(selectedDetail.hari)}, {t("Jam ke-")}{selectedDetail.jam}
                </h3>
                <p className="text-xs text-slate-400 font-medium mt-1 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <T>{"Waktu:"}</T> {selectedDetail.waktu}
                </p>
              </div>
              <button
                onClick={() => setSelectedDetail(null)}
                className="p-1 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 overflow-y-auto">
              {selectedDetailAnnotations && (selectedDetailAnnotations.statusLabels.length > 0 || selectedDetailAnnotations.operationalDetails.length > 0) && (
                <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 space-y-1 break-words">
                  {selectedDetailAnnotations.statusLabels.map((status) => (
                    <div key={status} className="text-xs font-black text-indigo-900 uppercase">{status}</div>
                  ))}
                  {selectedDetailAnnotations.operationalDetails.map((detail) => (
                    <p key={detail} className="text-sm text-indigo-900 whitespace-normal break-words">{detail}</p>
                  ))}
                </div>
              )}
              <div className="space-y-4">
                {(() => {
                  interface GroupedScheduleItem {
                    mapel: string;
                    kelasNames: string[];
                    ruangan?: string;
                    keterangan_khusus?: string;
                    kelasgabung: boolean;
                    isBergantian: boolean;
                    teachers: string[];
                    originalItem: ScheduleItem;
                  }
                  
                  const groupedItems: GroupedScheduleItem[] = [];
 
                  selectedDetail.items.forEach(item => {
                    const itemTeachers = [
                      item.guru1,
                      item.guru2,
                      item.guru3,
                      item.guru4,
                      item.guru5,
                      item.guru6
                    ].map(g => g?.trim()).filter(Boolean);
 
                    // Find if we already have a group with the same mapel and teachers
                    const existingGroup = groupedItems.find(g => {
                      const isSameMapel = g.mapel.trim().toLowerCase() === item.mapel.trim().toLowerCase();
                      const isSameTeachers = g.teachers.length === itemTeachers.length &&
                        g.teachers.every((t, i) => t.toLowerCase() === itemTeachers[i].toLowerCase());
                      return isSameMapel && isSameTeachers;
                    });
 
                    const isItemKelasGabung = item.kelasgabung && (
                      item.kelasgabung.trim().toLowerCase() === "ya" || 
                      item.kelasgabung.trim().toLowerCase() === "iya"
                    );
                    const isItemBergantian = item.kelasgabung && (
                      item.kelasgabung.trim().toLowerCase() === "bergantian"
                    );
 
                    if (existingGroup) {
                      if (!existingGroup.kelasNames.includes(item.kelas)) {
                        existingGroup.kelasNames.push(item.kelas);
                      }
                      if (isItemKelasGabung) {
                        existingGroup.kelasgabung = true;
                      }
                      if (isItemBergantian) {
                        existingGroup.isBergantian = true;
                      }
                      if (item.ruangan && !existingGroup.ruangan?.includes(item.ruangan)) {
                        existingGroup.ruangan = existingGroup.ruangan ? `${existingGroup.ruangan}, ${item.ruangan}` : item.ruangan;
                      }
                      if (item.keterangan_khusus && !existingGroup.keterangan_khusus?.includes(item.keterangan_khusus)) {
                        existingGroup.keterangan_khusus = existingGroup.keterangan_khusus ? `${existingGroup.keterangan_khusus}, ${item.keterangan_khusus}` : item.keterangan_khusus;
                      }
                    } else {
                      groupedItems.push({
                        mapel: item.mapel,
                        kelasNames: [item.kelas],
                        ruangan: item.ruangan,
                        keterangan_khusus: item.keterangan_khusus,
                        kelasgabung: isItemKelasGabung,
                        isBergantian: isItemBergantian,
                        teachers: itemTeachers,
                        originalItem: item
                      });
                    }
                  });

                  return groupedItems.map((group, idx) => {
                    return (
                      <div key={idx} className="p-4 bg-slate-50 border border-slate-200/60 rounded-xl space-y-4">
                        {/* Subject & Class Details */}
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="text-lg font-bold text-slate-800 flex items-center gap-1.5">
                              <GraduationCap className="w-5 h-5 text-blue-600 shrink-0" />
                              {group.mapel}
                            </h4>
                            <span className="bg-blue-100 text-blue-800 text-xs font-black px-2.5 py-1 rounded-lg text-right max-w-[200px]">
                              Kelas {group.kelasNames.join(", ")}
                            </span>
                          </div>
                          {group.ruangan && (
                            <span className="text-xs text-slate-500 font-medium mt-1 block">
                              <T>{"Ruangan:"}</T> <span className="font-semibold text-slate-700">{getRoomDisplayName(group.ruangan, masterRuangan)}</span>
                            </span>
                          )}
                          {group.keterangan_khusus && (
                            <span className="text-xs text-indigo-600 font-medium mt-1 block bg-indigo-50/50 p-2 rounded-lg border border-indigo-100/30">
                              Keterangan Khusus: <span className="font-bold text-indigo-700">{group.keterangan_khusus}</span>
                            </span>
                          )}
                          {group.kelasgabung && (
                            <span className="mt-1.5 text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded uppercase tracking-wider inline-block mr-1">
                              <T>{"Kelas Gabung"}</T>
                            </span>
                          )}
                          {group.isBergantian && (
                            <span className="mt-1.5 text-[10px] bg-teal-100 text-teal-900 border border-teal-200 font-bold px-2 py-0.5 rounded uppercase tracking-wider inline-block">
                              <T>{"Kelas Bergantian"}</T>
                            </span>
                          )}
                        </div>

                        {/* Teachers Info */}
                        <div className="space-y-2">
                          <span className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                            <Users className="w-3.5 h-3.5" />
                            <T>{"Guru Pengampu (Team Teaching)"}</T>
                          </span>

                          <div className="space-y-2">
                            {group.teachers.map((teacherName, tIdx) => {
                              const isMainTeacher = tIdx === 0;
                              return (
                                <div key={tIdx} className="flex items-center gap-3 bg-white p-2.5 rounded-lg border border-slate-100">
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                                    isMainTeacher ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "bg-blue-50 text-blue-600 border border-blue-200"
                                  }`}>
                                    {teacherName.charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <span className="text-xs font-bold text-slate-800 block">
                                      {teacherName}
                                    </span>
                                    <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wide">
                                      {isMainTeacher ? "Guru Utama (Main)" : `Guru Partner ${tIdx}`}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                            {group.teachers.length === 0 && (
                              <p className="text-xs text-slate-400 italic"><T>{"Tidak ada guru terdaftar"}</T></p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex justify-end shrink-0">
              <button
                onClick={() => setSelectedDetail(null)}
                className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-all"
              >
                <T>{"Tutup Detail"}</T>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
