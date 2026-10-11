import React, { useState, useMemo } from "react";
import { DAY_ORDER as HARI_ORDER, JAM_TIME_MAP } from "../constants/schedule";
import { Teacher, ScheduleItem, normalizeDay, isClassMatch, checkIsITBA, isITBACoreSubject } from "../types";
import { 
  ArrowLeft, Users, Search, BookOpen, UserCheck, 
  ChevronUp, ChevronDown, GraduationCap, Filter, Clock, 
  HelpCircle, CheckCircle, Sparkles 
} from "lucide-react";

interface ListGuruKelasProps {
  teachers: Teacher[];
  schedules: ScheduleItem[];
  onBack: () => void;
  initialClass?: string;
}

interface TeacherRef {
  name: string;
  teacherObj?: Teacher;
  isPrimary: boolean;
  roleTag: "Guru Utama" | "Pendamping" | "Wali Kelas" | "Pendamping Kelas";
}

interface GroupedGuruKelasItem {
  id: string;
  mapel: string;
  teachers: TeacherRef[];
  teachersDisplay: string;
  hariDisplay: string;
  jamDisplay: string;
  waktuDisplay: string;
  totalJp: number;
  primaryRoleType: "Wali Kelas" | "Pendamping Kelas" | "Pendamping Guru Mapel" | "Guru Mapel Utama";
}

type SortKey = "guru" | "mapel" | "hari" | "jp";
type SortOrder = "asc" | "desc";

export const ListGuruKelas: React.FC<ListGuruKelasProps> = ({
  teachers,
  schedules,
  onBack,
  initialClass
}) => {
  // Extract all unique class names from schedules
  const allClasses = useMemo(() => {
    const set = new Set<string>();
    schedules.forEach(s => {
      if (s.kelas && s.kelas.trim()) {
        set.add(s.kelas.trim());
      }
    });
    return Array.from(set).sort((a, b) => 
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    );
  }, [schedules]);

  // Selected Class State
  const [selectedClass, setSelectedClass] = useState<string>(() => {
    if (initialClass && allClasses.includes(initialClass)) {
      return initialClass;
    }
    const saved = localStorage.getItem("list_guru_kelas_selected");
    if (saved && allClasses.includes(saved)) {
      return saved;
    }
    return allClasses[0] || "";
  });

  // Save selected class to localStorage
  const handleSelectClass = (cls: string) => {
    setSelectedClass(cls);
    localStorage.setItem("list_guru_kelas_selected", cls);
  };

  // Teacher/Mapel Filter Search State within selected class
  const [inClassSearch, setInClassSearch] = useState("");

  // Sort States
  const [sortKey, setSortKey] = useState<SortKey>("mapel");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  // Find Wali Kelas & Pendamping Kelas for the selected class
  const waliKelasTeacher = useMemo(() => {
    if (!selectedClass) return null;
    return teachers.find(t => isClassMatch(t.wali_kelas, selectedClass));
  }, [teachers, selectedClass]);

  const pendampingKelasTeacher = useMemo(() => {
    if (!selectedClass) return null;
    return teachers.find(t => isClassMatch(t.pendamping_kelas, selectedClass));
  }, [teachers, selectedClass]);

  // Aggregate schedule data for selectedClass GROUPED BY MATA PELAJARAN
  const groupedData = useMemo(() => {
    if (!selectedClass) return [];

    // Filter schedules matching this class
    const classSchedules = schedules.filter(s => 
      s.kelas && (s.kelas.trim().toLowerCase() === selectedClass.trim().toLowerCase() || isClassMatch(s.kelas, selectedClass))
    );

    // Map key: `normMapelKey`
    const mapelGroupMap = new Map<string, {
      mapel: string;
      slots: {
        hari: string;
        jam_ke: number;
        mulai: string;
        selesai: string;
      }[];
      teachersMap: Map<string, {
        name: string;
        teacherObj?: Teacher;
        isPrimary: boolean;
      }>;
    }>();

    classSchedules.forEach(item => {
      const normalizedH = normalizeDay(item.hari);
      const mapelName = (item.mapel || "Tanpa Mapel").trim();
      const normMapelKey = mapelName.toLowerCase();

      let entry = mapelGroupMap.get(normMapelKey);
      if (!entry) {
        entry = {
          mapel: mapelName,
          slots: [],
          teachersMap: new Map()
        };
        mapelGroupMap.set(normMapelKey, entry);
      }

      // Add slot if unique to prevent double-counting JP for the same time slot in this mapel
      const slotExists = entry.slots.some(
        s => normalizeDay(s.hari) === normalizedH && s.jam_ke === item.jam_ke
      );

      if (!slotExists) {
        entry.slots.push({
          hari: normalizedH,
          jam_ke: item.jam_ke,
          mulai: item.mulai,
          selesai: item.selesai
        });
      }

      // Record all teachers for this mapel
      const allTeachersInItem = [
        item.guru1, item.guru2, item.guru3, item.guru4, item.guru5, item.guru6
      ].map(g => g?.trim()).filter(Boolean) as string[];

      const primaryTeacher = item.guru1 ? item.guru1.trim().toLowerCase() : "";

      allTeachersInItem.forEach(tName => {
        const normT = tName.toLowerCase();
        const existingT = entry!.teachersMap.get(normT);
        const isPrimaryInThisSlot = primaryTeacher === normT;

        if (!existingT) {
          const teacherObj = teachers.find(t => t.nama.trim().toLowerCase() === normT);
          entry!.teachersMap.set(normT, {
            name: tName,
            teacherObj,
            isPrimary: isPrimaryInThisSlot
          });
        } else if (isPrimaryInThisSlot) {
          existingT.isPrimary = true;
        }
      });
    });

    // Convert map to GroupedGuruKelasItem array
    const result: GroupedGuruKelasItem[] = [];
    let idx = 0;

    mapelGroupMap.forEach(entry => {
      const { mapel, slots, teachersMap } = entry;

      // Sort slots by day then jam_ke
      slots.sort((a, b) => {
        const orderA = HARI_ORDER[normalizeDay(a.hari)] || 99;
        const orderB = HARI_ORDER[normalizeDay(b.hari)] || 99;
        if (orderA !== orderB) return orderA - orderB;
        return a.jam_ke - b.jam_ke;
      });

      // Total JP is number of unique schedule slots for this mapel
      const totalJp = slots.length;

      // Unique Days List
      const uniqueDays = [...new Set(slots.map(s => normalizeDay(s.hari)))];
      const hariDisplay = uniqueDays.join(", ");

      // Days with Jam Ke details
      const daySlotsMap: Record<string, number[]> = {};
      slots.forEach(s => {
        const h = normalizeDay(s.hari);
        if (!daySlotsMap[h]) daySlotsMap[h] = [];
        if (!daySlotsMap[h].includes(s.jam_ke)) {
          daySlotsMap[h].push(s.jam_ke);
        }
      });

      const jamDisplayParts = Object.entries(daySlotsMap).map(([day, jams]) => {
        jams.sort((a, b) => a - b);
        const jamsStr = jams.map(j => `JP ${j}`).join(", ");
        return `${day} (${jamsStr})`;
      });
      const jamDisplay = jamDisplayParts.join(" • ");

      // Waktu Display
      const timeRanges = [...new Set(slots.map(s => {
        if (s.mulai && s.selesai) return `${s.mulai}-${s.selesai}`;
        if (JAM_TIME_MAP[s.jam_ke]) return JAM_TIME_MAP[s.jam_ke];
        return "";
      }).filter(Boolean))];
      const waktuDisplay = timeRanges.slice(0, 2).join(", ") + (timeRanges.length > 2 ? " ..." : "");

      // Process Teachers
      const teachersList: TeacherRef[] = Array.from(teachersMap.values()).map(t => {
        let roleTag: "Guru Utama" | "Pendamping" | "Wali Kelas" | "Pendamping Kelas" = "Guru Utama";
        if (t.teacherObj && isClassMatch(t.teacherObj.wali_kelas, selectedClass)) {
          roleTag = "Wali Kelas";
        } else if (t.teacherObj && isClassMatch(t.teacherObj.pendamping_kelas, selectedClass)) {
          roleTag = "Pendamping Kelas";
        } else if (!t.isPrimary) {
          roleTag = "Pendamping";
        } else {
          roleTag = "Guru Utama";
        }

        return {
          name: t.name,
          teacherObj: t.teacherObj,
          isPrimary: t.isPrimary,
          roleTag
        };
      });

      // Sort primary teachers first
      teachersList.sort((a, b) => {
        if (a.isPrimary && !b.isPrimary) return -1;
        if (!a.isPrimary && b.isPrimary) return 1;
        return a.name.localeCompare(b.name);
      });

      const teachersDisplay = teachersList.map(t => `${t.name} (${t.roleTag})`).join(", ");

      // Primary Role Type for row badge
      let primaryRoleType: "Wali Kelas" | "Pendamping Kelas" | "Pendamping Guru Mapel" | "Guru Mapel Utama" = "Guru Mapel Utama";
      if (teachersList.some(t => t.roleTag === "Wali Kelas")) {
        primaryRoleType = "Wali Kelas";
      } else if (teachersList.some(t => t.roleTag === "Pendamping Kelas")) {
        primaryRoleType = "Pendamping Kelas";
      } else if (!teachersList.some(t => t.isPrimary)) {
        primaryRoleType = "Pendamping Guru Mapel";
      } else {
        primaryRoleType = "Guru Mapel Utama";
      }

      result.push({
        id: `mapel-kelas-${idx++}`,
        mapel,
        teachers: teachersList,
        teachersDisplay,
        hariDisplay,
        jamDisplay,
        waktuDisplay,
        totalJp,
        primaryRoleType
      });
    });

    return result;
  }, [selectedClass, schedules, teachers]);

  // Filter groupedData by search query
  const filteredGroupedData = useMemo(() => {
    if (!inClassSearch.trim()) return groupedData;
    const query = inClassSearch.toLowerCase();
    return groupedData.filter(item => 
      item.mapel.toLowerCase().includes(query) ||
      item.teachersDisplay.toLowerCase().includes(query) ||
      item.teachers.some(t => t.name.toLowerCase().includes(query))
    );
  }, [groupedData, inClassSearch]);

  // Sort groupedData
  const sortedData = useMemo(() => {
    const data = [...filteredGroupedData];

    data.sort((a, b) => {
      let valA: any = "";
      let valB: any = "";

      if (sortKey === "mapel") {
        valA = a.mapel;
        valB = b.mapel;
      } else if (sortKey === "guru") {
        valA = a.teachers[0]?.name || "";
        valB = b.teachers[0]?.name || "";
      } else if (sortKey === "jp") {
        valA = a.totalJp;
        valB = b.totalJp;
      } else if (sortKey === "hari") {
        const firstDayA = a.hariDisplay.split(", ")[0] || "";
        const firstDayB = b.hariDisplay.split(", ")[0] || "";
        valA = HARI_ORDER[firstDayA] || 99;
        valB = HARI_ORDER[firstDayB] || 99;
      }

      if (typeof valA === "string") {
        return sortOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else {
        return sortOrder === "asc" ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
      }
    });

    return data;
  }, [filteredGroupedData, sortKey, sortOrder]);

  // Class Summary Statistics
  const totalClassJp = useMemo(() => {
    return groupedData.reduce((acc, curr) => acc + curr.totalJp, 0);
  }, [groupedData]);

  const totalDistinctTeachers = useMemo(() => {
    const names = new Set<string>();
    groupedData.forEach(item => {
      item.teachers.forEach(t => names.add(t.name.toLowerCase()));
    });
    return names.size;
  }, [groupedData]);

  const totalDistinctMapels = useMemo(() => {
    return groupedData.length;
  }, [groupedData]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder("asc");
    }
  };

  const SortIcon = ({ colKey }: { colKey: SortKey }) => {
    if (sortKey !== colKey) return null;
    return sortOrder === "asc" 
      ? <ChevronUp className="w-4 h-4 ml-1 inline text-indigo-600" />
      : <ChevronDown className="w-4 h-4 ml-1 inline text-indigo-600" />;
  };

  return (
    <div className="space-y-6">
      {/* Header & Back Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <button
          id="back-to-dashboard-btn-guru-kelas"
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-indigo-600 bg-white px-4 py-2 rounded-xl border border-gray-100 hover:border-indigo-100 shadow-xs transition-all self-start cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali ke Dashboard</span>
        </button>

        <span className="text-sm font-medium text-gray-400">Guru Pengampu per Kelas</span>
      </div>

      {/* Main Container Card */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 sm:p-6 shadow-xs space-y-6">
        
        {/* Title & Filter Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 pb-6 border-b border-gray-100">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2.5">
              <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <GraduationCap className="w-6 h-6" />
              </span>
              <span>Guru Pengampu per Kelas</span>
            </h2>
            <p className="text-xs text-gray-500">
              Pilih kelas untuk melihat alokasi JP per mata pelajaran, daftar guru pengampu, dan jadwal mengajar.
            </p>
          </div>

          {/* Class Selector Filter Dropdown & Search */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
            <div className="relative flex-1 sm:w-64">
              <label htmlFor="select-class-filter" className="sr-only">Pilih Kelas</label>
              <div className="relative">
                <select
                  id="select-class-filter"
                  value={selectedClass}
                  onChange={(e) => handleSelectClass(e.target.value)}
                  className="w-full bg-slate-50 border border-gray-200 focus:bg-white focus:border-indigo-500 text-gray-800 text-sm font-bold py-2.5 pl-3.5 pr-8 rounded-xl focus:outline-none transition-all cursor-pointer shadow-2xs"
                >
                  <option value="" disabled>-- Pilih Kelas --</option>
                  {allClasses.map(cls => (
                    <option key={cls} value={cls}>
                      Kelas {cls}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Quick Search within the selected class */}
            {selectedClass && (
              <div className="relative flex-1 sm:w-64">
                <input
                  id="search-in-class-input"
                  type="text"
                  placeholder="Cari mapel / guru di kelas ini..."
                  value={inClassSearch}
                  onChange={(e) => setInClassSearch(e.target.value)}
                  className="w-full pl-9 pr-8 py-2.5 bg-gray-50 text-xs border border-gray-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
                />
                <Search className="absolute left-3 top-3 w-3.5 h-3.5 text-gray-400" />
                {inClassSearch && (
                  <button
                    onClick={() => setInClassSearch("")}
                    className="absolute right-2.5 top-2.5 text-xs text-gray-400 hover:text-gray-600 font-bold"
                  >
                    ✕
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Selected Class Dashboard Banner */}
        {selectedClass ? (
          <div className="space-y-5">
            
            {/* Banner Info Box */}
            <div className="bg-gradient-to-r from-indigo-900 via-slate-900 to-indigo-950 text-white rounded-2xl p-5 shadow-sm border border-indigo-900/50 flex flex-col md:flex-row md:items-center justify-between gap-5">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 text-[10px] uppercase tracking-wider font-extrabold rounded-md">
                    Rincian Kelas
                  </span>
                </div>
                <h3 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
                  <span>Kelas {selectedClass}</span>
                </h3>

                {/* Wali & Pendamping Kelas badges */}
                <div className="flex flex-wrap gap-2 pt-1 text-xs">
                  {waliKelasTeacher ? (
                    <span className="bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 px-3 py-1 rounded-lg font-bold flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                      Wali Kelas: <strong className="text-white font-extrabold">{waliKelasTeacher.nama}</strong>
                    </span>
                  ) : (
                    <span className="bg-slate-800 text-slate-400 border border-slate-700 px-2.5 py-1 rounded-lg font-medium text-[11px]">
                      Wali Kelas: Belum ditentukan
                    </span>
                  )}

                  {pendampingKelasTeacher ? (
                    <span className="bg-teal-500/20 text-teal-200 border border-teal-400/30 px-3 py-1 rounded-lg font-bold flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5 text-teal-400" />
                      Pendamping: <strong className="text-white font-extrabold">{pendampingKelasTeacher.nama}</strong>
                    </span>
                  ) : null}
                </div>
              </div>

              {/* Class Stats Counter Badges */}
              <div className="grid grid-cols-3 gap-3 shrink-0">
                <div className="bg-white/10 backdrop-blur-xs border border-white/10 p-3 rounded-xl text-center min-w-[85px]">
                  <span className="text-[10px] text-indigo-200 font-bold uppercase tracking-wider block">Total JP</span>
                  <span className="text-xl font-black text-amber-300">{totalClassJp} JP</span>
                </div>

                <div className="bg-white/10 backdrop-blur-xs border border-white/10 p-3 rounded-xl text-center min-w-[85px]">
                  <span className="text-[10px] text-indigo-200 font-bold uppercase tracking-wider block">Guru</span>
                  <span className="text-xl font-black text-white">{totalDistinctTeachers}</span>
                </div>

                <div className="bg-white/10 backdrop-blur-xs border border-white/10 p-3 rounded-xl text-center min-w-[85px]">
                  <span className="text-[10px] text-indigo-200 font-bold uppercase tracking-wider block">Mapel</span>
                  <span className="text-xl font-black text-indigo-200">{totalDistinctMapels}</span>
                </div>
              </div>
            </div>

            {/* Color Legend / Explanation Box */}
            <div className="text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200/80 p-3.5 rounded-xl flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
              <div className="flex items-center gap-2 pb-2 sm:pb-0">
                <HelpCircle className="w-4 h-4 text-indigo-500 shrink-0" />
                <span>Keterangan Peran Pengampu:</span>
              </div>
              <div className="flex items-center gap-1.5 pt-2 sm:pt-0 sm:pl-3">
                <span className="w-2.5 h-2.5 rounded bg-emerald-500 shrink-0" />
                <span><strong className="text-emerald-900 font-bold">Wali Kelas</strong></span>
              </div>
              <div className="flex items-center gap-1.5 pt-1 sm:pt-0 sm:pl-3">
                <span className="w-2.5 h-2.5 rounded bg-teal-500 shrink-0" />
                <span><strong className="text-teal-900 font-bold">Pendamping Kelas</strong></span>
              </div>
              <div className="flex items-center gap-1.5 pt-1 sm:pt-0 sm:pl-3">
                <span className="w-2.5 h-2.5 rounded bg-purple-500 shrink-0" />
                <span><strong className="text-purple-900 font-bold">Pendamping Guru Mapel</strong></span>
              </div>
              <div className="flex items-center gap-1.5 pt-1 sm:pt-0 sm:pl-3">
                <span className="w-2.5 h-2.5 rounded bg-indigo-500 shrink-0" />
                <span><strong className="text-indigo-900 font-bold">Guru Mapel Utama</strong></span>
              </div>
            </div>

            {/* DESKTOP DATA TABLE */}
            <div className="hidden md:block overflow-hidden rounded-xl border border-gray-200/80 shadow-2xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-100/80 border-b border-gray-200 text-xs font-bold text-gray-600 uppercase tracking-wider">
                    <th className="p-4 w-12 text-center">No</th>
                    <th 
                      id="th-gk-mapel"
                      className="p-4 cursor-pointer hover:bg-slate-200/80 transition-colors"
                      onClick={() => handleSort("mapel")}
                    >
                      Mata Pelajaran <SortIcon colKey="mapel" />
                    </th>
                    <th 
                      id="th-gk-guru"
                      className="p-4 cursor-pointer hover:bg-slate-200/80 transition-colors"
                      onClick={() => handleSort("guru")}
                    >
                      Guru Pengampu <SortIcon colKey="guru" />
                    </th>
                    <th 
                      id="th-gk-hari"
                      className="p-4 cursor-pointer hover:bg-slate-200/80 transition-colors"
                      onClick={() => handleSort("hari")}
                    >
                      Jadwal Hari & Jam Ke <SortIcon colKey="hari" />
                    </th>
                    <th 
                      id="th-gk-jp"
                      className="p-4 cursor-pointer hover:bg-slate-200/80 transition-colors text-center w-28"
                      onClick={() => handleSort("jp")}
                    >
                      Alokasi JP <SortIcon colKey="jp" />
                    </th>
                    <th className="p-4">Status / Peran</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm bg-white">
                  {sortedData.length > 0 ? (
                    sortedData.map((item, index) => {
                      const isWali = item.primaryRoleType === "Wali Kelas";
                      const isPendampingKelas = item.primaryRoleType === "Pendamping Kelas";
                      const isPendampingMapel = item.primaryRoleType === "Pendamping Guru Mapel";

                      return (
                        <tr 
                          key={item.id}
                          className={`transition-colors ${
                            isWali
                              ? "bg-emerald-50/60 hover:bg-emerald-100/50"
                              : isPendampingKelas
                                ? "bg-teal-50/60 hover:bg-teal-100/50"
                                : isPendampingMapel
                                  ? "bg-purple-50/60 hover:bg-purple-100/50"
                                  : "hover:bg-slate-50/70"
                          }`}
                        >
                          {/* Index */}
                          <td className="p-4 text-center font-bold text-gray-400 text-xs">
                            {index + 1}
                          </td>

                          {/* Mapel Name */}
                          <td className="p-4">
                            <div className="font-extrabold text-slate-900 text-sm">
                              {item.mapel}
                            </div>
                          </td>

                          {/* Teachers List */}
                          <td className="p-4">
                            <div className="flex flex-wrap gap-1.5 items-center">
                              {item.teachers.map((t, idx) => (
                                <span 
                                  key={idx}
                                  className={`text-xs px-2.5 py-1 rounded-lg border font-semibold flex items-center gap-1 ${
                                    t.roleTag === "Wali Kelas"
                                      ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                                      : t.roleTag === "Pendamping Kelas"
                                        ? "bg-teal-100 text-teal-900 border-teal-300"
                                        : t.roleTag === "Guru Utama"
                                          ? "bg-indigo-50 text-indigo-900 border-indigo-200"
                                          : "bg-purple-50 text-purple-900 border-purple-200"
                                  }`}
                                >
                                  <strong>{t.name}</strong>
                                  <span className="text-[10px] opacity-80">({t.roleTag})</span>
                                </span>
                              ))}
                            </div>
                          </td>

                          {/* Days & Jam Ke */}
                          <td className="p-4">
                            <div className="font-bold text-slate-800 text-xs">
                              {item.hariDisplay}
                            </div>
                            <div className="text-[11px] font-semibold text-slate-600 mt-1">
                              {item.jamDisplay}
                            </div>
                            {item.waktuDisplay && (
                              <div className="text-[10px] text-gray-400 font-mono mt-0.5">
                                ⏱️ {item.waktuDisplay}
                              </div>
                            )}
                          </td>

                          {/* Total JP per Mata Pelajaran */}
                          <td className="p-4 text-center">
                            <span className="inline-block bg-indigo-600 text-white font-black text-xs px-3.5 py-1 rounded-xl shadow-2xs">
                              {item.totalJp} JP
                            </span>
                          </td>

                          {/* Primary Role Badge */}
                          <td className="p-4">
                            <span className={`text-[10px] font-black px-2.5 py-1 rounded-md uppercase tracking-wider ${
                              isWali
                                ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                                : isPendampingKelas
                                  ? "bg-teal-100 text-teal-900 border border-teal-300"
                                  : isPendampingMapel
                                    ? "bg-purple-100 text-purple-900 border border-purple-300"
                                    : "bg-indigo-50 text-indigo-800 border border-indigo-200"
                            }`}>
                              {item.primaryRoleType}
                            </span>
                          </td>

                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-gray-400 italic">
                        {inClassSearch 
                          ? `Tidak ada mata pelajaran yang cocok dengan kata kunci "${inClassSearch}"`
                          : `Belum ada mata pelajaran yang terdaftar untuk Kelas ${selectedClass}`
                        }
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* MOBILE CARD VIEW */}
            <div className="block md:hidden space-y-3">
              {sortedData.length > 0 ? (
                sortedData.map((item, index) => {
                  const isWali = item.primaryRoleType === "Wali Kelas";
                  const isPendampingKelas = item.primaryRoleType === "Pendamping Kelas";
                  const isPendampingMapel = item.primaryRoleType === "Pendamping Guru Mapel";

                  return (
                    <div 
                      key={item.id}
                      className={`p-4 rounded-xl border transition-all ${
                        isWali
                          ? "bg-emerald-50/80 border-emerald-200"
                          : isPendampingKelas
                            ? "bg-teal-50/80 border-teal-200"
                            : isPendampingMapel
                              ? "bg-purple-50/80 border-purple-200"
                              : "bg-white border-gray-200"
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold text-gray-400 uppercase"># {index + 1}</span>
                          <h4 className="font-extrabold text-slate-900 text-base leading-tight">
                            {item.mapel}
                          </h4>
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase inline-block ${
                            isWali
                              ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                              : isPendampingKelas
                                ? "bg-teal-100 text-teal-900 border border-teal-300"
                                : isPendampingMapel
                                  ? "bg-purple-100 text-purple-900 border border-purple-300"
                                  : "bg-indigo-50 text-indigo-800 border border-indigo-200"
                          }`}>
                            {item.primaryRoleType}
                          </span>
                        </div>

                        <span className="bg-indigo-600 text-white font-black text-xs px-2.5 py-1 rounded-lg shrink-0 shadow-2xs">
                          {item.totalJp} JP
                        </span>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-gray-200/60 text-xs space-y-2">
                        <div>
                          <span className="text-gray-500 font-medium block mb-1">Guru Pengampu:</span>
                          <div className="flex flex-wrap gap-1">
                            {item.teachers.map((t, idx) => (
                              <span key={idx} className="bg-white border border-gray-200 text-slate-800 px-2 py-0.5 rounded font-bold text-[11px]">
                                {t.name} <span className="text-[9px] font-normal text-slate-500">({t.roleTag})</span>
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-gray-500 font-medium">Jadwal:</span>
                          <span className="font-bold text-slate-800">{item.hariDisplay}</span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-gray-500 font-medium">Jam Ke:</span>
                          <span className="font-semibold text-slate-700 text-right">{item.jamDisplay}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-8 text-sm text-gray-400 italic bg-gray-50 rounded-xl">
                  {inClassSearch 
                    ? `Tidak ada mata pelajaran yang cocok dengan kata kunci "${inClassSearch}"`
                    : `Belum ada mata pelajaran yang terdaftar untuk Kelas ${selectedClass}`
                  }
                </div>
              )}
            </div>

          </div>
        ) : (
          <div className="text-center py-12 text-gray-400">
            Silakan pilih kelas dari daftar di atas.
          </div>
        )}

      </div>
    </div>
  );
};
