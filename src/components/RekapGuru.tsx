import React, { useState, useMemo } from "react";
import { Teacher, ScheduleItem } from "../types";
import { 
  ArrowLeft, Search, GraduationCap, Calendar, BookOpen, 
  Layers, ChevronUp, ChevronDown, Award, CheckCircle, Clock 
} from "lucide-react";

interface RekapGuruProps {
  teachers: Teacher[];
  schedules: ScheduleItem[];
  onBack: () => void;
  setSelectedTeacher: (name: string) => void;
  setActivePage: (page: any) => void;
}

type SortKey = "nama" | "totalJP" | "subjectsCount";
type SortOrder = "asc" | "desc";

// Helper to determine Level (Jenjang) of a class name
const getJenjangLabel = (kelas: string): "SD" | "SMP" | "SMA" | null => {
  if (!kelas) return null;
  const match = kelas.trim().match(/^(\d+)/);
  if (match) {
    const grade = parseInt(match[1], 10);
    if (grade >= 1 && grade <= 6) return "SD";
    if (grade >= 7 && grade <= 9) return "SMP";
    if (grade >= 10 && grade <= 12) return "SMA";
  }
  const upper = kelas.toUpperCase();
  if (upper.includes("SD") || upper.includes("PRIMARY")) return "SD";
  if (upper.includes("SMP") || upper.includes("JUNIOR")) return "SMP";
  if (upper.includes("SMA") || upper.includes("SENIOR") || upper.includes("IPA") || upper.includes("IPS")) return "SMA";
  
  const romanMatch = kelas.trim().match(/^(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)\b/i);
  if (romanMatch) {
    const rom = romanMatch[1].toUpperCase();
    if (["I", "II", "III", "IV", "V", "VI"].includes(rom)) return "SD";
    if (["VII", "VIII", "IX"].includes(rom)) return "SMP";
    if (["X", "XI", "XII"].includes(rom)) return "SMA";
  }
  return null;
};

export const RekapGuru: React.FC<RekapGuruProps> = ({
  teachers,
  schedules,
  onBack,
  setSelectedTeacher,
  setActivePage,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("nama");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [selectedLevelFilter, setSelectedLevelFilter] = useState<string>("Semua");

  // Calculate detailed data for each teacher
  const rekapData = useMemo(() => {
    return teachers.map((teacher) => {
      // Find all schedule slots assigned to this teacher
      const teacherSchedules = schedules.filter((s) =>
        [s.guru1, s.guru2, s.guru3, s.guru4, s.guru5, s.guru6].some(
          (g) => g && g.trim().toLowerCase() === teacher.nama.trim().toLowerCase()
        )
      );

      // Total JP (Concurrent or merged classes taught on the same day and period are counted as 1 JP)
      const uniqueTimeSlots = new Set<string>();
      teacherSchedules.forEach((s) => {
        const slotKey = `${s.hari.trim().toLowerCase()}|${s.jam_ke}`;
        uniqueTimeSlots.add(slotKey);
      });
      const totalJP = uniqueTimeSlots.size;

      // Collect all unique subjects taught
      const subjectsSet = new Set<string>();
      if (teacher.mapel_utama) {
        teacher.mapel_utama.split(",").forEach((s) => {
          if (s.trim()) subjectsSet.add(s.trim());
        });
      }
      teacherSchedules.forEach((s) => {
        if (s.mapel && s.mapel.trim()) {
          subjectsSet.add(s.mapel.trim());
        }
      });
      const subjects = Array.from(subjectsSet);

      // Collect all unique levels (Jenjang) taught
      const levelsSet = new Set<"SD" | "SMP" | "SMA">();
      
      // Add levels from teacher's profile
      if (teacher.jenjang) {
        teacher.jenjang.split(",").forEach((j) => {
          const trimmed = j.trim().toUpperCase();
          if (trimmed === "SD") levelsSet.add("SD");
          if (trimmed === "SMP") levelsSet.add("SMP");
          if (trimmed === "SMA") levelsSet.add("SMA");
        });
      }

      // Add levels parsed from scheduled classes
      teacherSchedules.forEach((s) => {
        const parsed = getJenjangLabel(s.kelas);
        if (parsed) {
          levelsSet.add(parsed);
        }
      });

      // Sort levels in standard school order: SD -> SMP -> SMA
      const orderedLevels: ("SD" | "SMP" | "SMA")[] = [];
      if (levelsSet.has("SD")) orderedLevels.push("SD");
      if (levelsSet.has("SMP")) orderedLevels.push("SMP");
      if (levelsSet.has("SMA")) orderedLevels.push("SMA");

      return {
        teacher,
        totalJP,
        subjects,
        levels: orderedLevels,
      };
    });
  }, [teachers, schedules]);

  // Overall stats for summary cards
  const stats = useMemo(() => {
    const totalTeachers = teachers.length;
    const totalJPAllocated = rekapData.reduce((acc, curr) => acc + curr.totalJP, 0);
    const averageJP = totalTeachers > 0 ? (totalJPAllocated / totalTeachers).toFixed(1) : "0";
    const teachersWithJP = rekapData.filter(r => r.totalJP > 0).length;

    return {
      totalTeachers,
      totalJPAllocated,
      averageJP,
      teachersWithJP
    };
  }, [teachers, rekapData]);

  // Handle sorting
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortOrder(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder("asc");
    }
  };

  // Filter and sort the final output
  const processedData = useMemo(() => {
    let result = [...rekapData];

    // Search query filter (by teacher name, subjects, or notes)
    if (searchQuery.trim() !== "") {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          r.teacher.nama.toLowerCase().includes(query) ||
          r.subjects.some((s) => s.toLowerCase().includes(query)) ||
          (r.teacher.panggilan && r.teacher.panggilan.toLowerCase().includes(query))
      );
    }

    // Level category filter (SD, SMP, SMA)
    if (selectedLevelFilter !== "Semua") {
      result = result.filter((r) => r.levels.includes(selectedLevelFilter as any));
    }

    // Sort execution
    result.sort((a, b) => {
      let valA: any;
      let valB: any;

      if (sortKey === "nama") {
        valA = a.teacher.nama;
        valB = b.teacher.nama;
      } else if (sortKey === "totalJP") {
        valA = a.totalJP;
        valB = b.totalJP;
      } else {
        valA = a.subjects.length;
        valB = b.subjects.length;
      }

      if (typeof valA === "string") {
        return sortOrder === "asc" 
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      } else {
        // numbers
        return sortOrder === "asc"
          ? (valA as number) - (valB as number)
          : (valB as number) - (valA as number);
      }
    });

    return result;
  }, [rekapData, searchQuery, selectedLevelFilter, sortKey, sortOrder]);

  const SortIcon = ({ colKey }: { colKey: SortKey }) => {
    if (sortKey !== colKey) return null;
    return sortOrder === "asc" 
      ? <ChevronUp className="w-4 h-4 ml-1 inline text-blue-600" />
      : <ChevronDown className="w-4 h-4 ml-1 inline text-blue-600" />;
  };

  const getLevelBadgeStyles = (level: "SD" | "SMP" | "SMA") => {
    switch (level) {
      case "SD":
        return "bg-rose-50 text-rose-700 border-rose-200/60";
      case "SMP":
        return "bg-sky-50 text-sky-700 border-sky-200/60";
      case "SMA":
        return "bg-emerald-50 text-emerald-700 border-emerald-200/60";
    }
  };

  const getLevelBadgeLabel = (level: "SD" | "SMP" | "SMA") => {
    switch (level) {
      case "SD":
        return "1-6 SD";
      case "SMP":
        return "7-9 SMP";
      case "SMA":
        return "10-12 SMA";
    }
  };

  return (
    <div className="space-y-6">
      {/* Top action and page context */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <button
          id="back-to-dashboard-btn"
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-blue-600 bg-white px-4 py-2 rounded-xl border border-slate-100 hover:border-blue-100 shadow-sm transition-all self-start"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Dashboard
        </button>
        <span className="text-xs sm:text-sm font-semibold text-slate-400 bg-slate-100 px-3 py-1 rounded-full uppercase tracking-wider self-start sm:self-auto">
          Halaman Admin (Rekap Mengajar)
        </span>
      </div>

      {/* Brief Header */}
      <div>
        <h2 className="text-xl sm:text-2xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
          <GraduationCap className="w-6 h-6 text-blue-600" />
          Rekap Beban Mengajar Guru
        </h2>
        <p className="text-sm text-slate-500 mt-1 leading-relaxed">
          Daftar seluruh guru dalam database, rincian mata pelajaran diampu, jenjang kelas yang diajar, serta kalkulasi total jam pelajaran (JP).
        </p>
      </div>

      {/* Quick Summary Stats Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-150 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Guru</p>
            <h4 className="text-base sm:text-lg font-bold text-slate-800">{stats.totalTeachers}</h4>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-150 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total JP Jadwal</p>
            <h4 className="text-base sm:text-lg font-bold text-slate-800">{stats.totalJPAllocated} JP</h4>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-150 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
            <Award className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Rata-rata JP</p>
            <h4 className="text-base sm:text-lg font-bold text-slate-800">{stats.averageJP} JP / Guru</h4>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-150 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
            <CheckCircle className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Guru Aktif Mengajar</p>
            <h4 className="text-base sm:text-lg font-bold text-slate-800">{stats.teachersWithJP} <span className="text-xs text-slate-400 font-normal">guru</span></h4>
          </div>
        </div>
      </div>

      {/* Filter and Search Box */}
      <div className="bg-white rounded-xl border border-slate-150 p-4 shadow-xs flex flex-col md:flex-row gap-4 items-center justify-between">
        
        {/* Search Input */}
        <div className="relative w-full md:w-96">
          <span className="absolute inset-y-0 left-3 flex items-center text-slate-400">
            <Search className="w-4 h-4" />
          </span>
          <input
            id="rekap-search-input"
            type="text"
            placeholder="Cari guru atau pelajaran..."
            className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:bg-white text-slate-800 transition-all"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Filter Badges for Jenjang */}
        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 scrollbar-none shrink-0">
          <span className="text-xs font-semibold text-slate-400 shrink-0">Filter Jenjang:</span>
          {["Semua", "SD", "SMP", "SMA"].map((level) => (
            <button
              key={level}
              id={`filter-jenjang-${level.toLowerCase()}`}
              onClick={() => setSelectedLevelFilter(level)}
              className={`px-3 py-1 rounded-full text-xs font-bold border transition-all shrink-0 ${
                selectedLevelFilter === level
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                  : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
              }`}
            >
              {level === "Semua" ? "Semua" : getLevelBadgeLabel(level as any)}
            </button>
          ))}
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-2xl border border-slate-150 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="bg-slate-50/75 border-b border-slate-150 text-slate-500 text-xs font-bold uppercase tracking-wider select-none">
                <th className="py-4 px-4 w-16 text-center">No</th>
                <th className="py-4 px-5 cursor-pointer hover:bg-slate-100/50 transition-colors" onClick={() => handleSort("nama")}>
                  Nama Lengkap Guru <SortIcon colKey="nama" />
                </th>
                <th className="py-4 px-5">Pelajaran Diampu</th>
                <th className="py-4 px-5 text-center">Jenjang Diajar</th>
                <th className="py-4 px-5 text-center cursor-pointer hover:bg-slate-100/50 transition-colors" onClick={() => handleSort("totalJP")}>
                  Total JP <SortIcon colKey="totalJP" />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {processedData.length > 0 ? (
                processedData.map((row, index) => {
                  const { teacher, totalJP, subjects, levels } = row;
                  const isWali = !!teacher.wali_kelas;
                  const isCo = !!teacher.pendamping_kelas;

                  return (
                    <tr 
                      key={teacher.nama} 
                      className="hover:bg-slate-50/50 transition-colors group"
                    >
                      {/* 1. Nomor urut data */}
                      <td className="py-3.5 px-4 text-center font-mono text-xs font-bold text-slate-400">
                        {String(index + 1).padStart(2, "0")}
                      </td>

                      {/* 2. Nama keseluruhan guru dalam database */}
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => {
                              setSelectedTeacher(teacher.nama);
                              setActivePage("dashboard");
                            }}
                            className="w-8 h-8 rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100 flex items-center justify-center font-bold text-xs border border-blue-100 shrink-0 transition-all shadow-xs group-hover:scale-105"
                            title="Klik untuk melihat di Dashboard"
                          >
                            {teacher.nama[0]}
                          </button>
                          <div>
                            <button
                              onClick={() => {
                                setSelectedTeacher(teacher.nama);
                                setActivePage("dashboard");
                              }}
                              className="font-bold text-slate-800 text-sm hover:text-blue-600 transition-colors text-left block"
                            >
                              {teacher.nama}
                            </button>
                            
                            {/* Tags under the name */}
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              {teacher.panggilan && (
                                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-semibold">
                                  Panggilan: {teacher.panggilan}
                                </span>
                              )}
                              {teacher.is_manajemen && (
                                <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-100 px-1.5 py-0.5 rounded font-bold">
                                  Manajemen
                                </span>
                              )}
                              {isWali && (
                                <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded font-semibold" title={`Wali Kelas ${teacher.wali_kelas}`}>
                                  Wali: {teacher.wali_kelas}
                                </span>
                              )}
                              {isCo && (
                                <span className="text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-100 px-1.5 py-0.5 rounded font-semibold" title={`Pendamping Kelas ${teacher.pendamping_kelas}`}>
                                  Co: {teacher.pendamping_kelas}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 3. Semua pelajaran yang diampu */}
                      <td className="py-3.5 px-5 max-w-[320px]">
                        {subjects.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {subjects.map((sub) => {
                              const isUtama = teacher.mapel_utama?.toLowerCase().includes(sub.toLowerCase());
                              return (
                                <span 
                                  key={sub} 
                                  className={`text-[10px] sm:text-xs px-2 py-0.5 rounded-md font-medium border transition-colors ${
                                    isUtama 
                                      ? "bg-slate-100 text-slate-800 border-slate-200 font-semibold"
                                      : "bg-slate-50 text-slate-500 border-slate-150/60"
                                  }`}
                                >
                                  {sub} {isUtama && <span className="text-[8px] text-slate-400 font-bold ml-0.5">⭐</span>}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Tidak ada mapel aktif</span>
                        )}
                      </td>

                      {/* 4. Semua jenjang yang diajar */}
                      <td className="py-3.5 px-5 text-center">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          {levels.length > 0 ? (
                            levels.map((lvl) => (
                              <span 
                                key={lvl} 
                                className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${getLevelBadgeStyles(lvl)}`}
                              >
                                {getLevelBadgeLabel(lvl)}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-slate-400 italic">-</span>
                          )}
                        </div>
                      </td>

                      {/* 5. Total keseluruhan JP yang didapat */}
                      <td className="py-3.5 px-5 text-center">
                        <div className="inline-flex flex-col items-center">
                          <span className={`text-sm font-extrabold px-3 py-1 rounded-lg border shadow-xs min-w-[55px] block text-center ${
                            totalJP > 0 
                              ? totalJP >= 24 
                                ? "bg-emerald-500 text-white border-emerald-500" 
                                : "bg-blue-50 text-blue-700 border-blue-200"
                              : "bg-slate-100 text-slate-400 border-slate-200 italic"
                          }`}>
                            {totalJP} <span className="text-[10px] font-bold uppercase ml-0.5">JP</span>
                          </span>
                          {totalJP >= 24 && (
                            <span className="text-[8px] text-emerald-600 font-bold mt-1 uppercase tracking-wider">Full load</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-500 text-sm">
                    Tidak ada data guru yang cocok dengan filter atau kata kunci "{searchQuery}"
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Custom Info Footer inside card */}
        <div className="p-4 bg-slate-50/50 border-t border-slate-150 flex items-center justify-between text-xs text-slate-500">
          <p>
            Menampilkan <strong>{processedData.length}</strong> dari total <strong>{teachers.length}</strong> guru.
          </p>
          <div className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-md bg-slate-100 border border-slate-200" />
            <span>⭐ Mapel Utama</span>
          </div>
        </div>
      </div>
    </div>
  );
};
