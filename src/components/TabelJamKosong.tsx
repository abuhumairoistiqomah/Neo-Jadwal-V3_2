import React, { useState, useMemo } from "react";
import { SCHOOL_DAYS as HARI_LIST, TEACHING_JPS as JAM_LIST } from "../constants/schedule";
import { Teacher, ScheduleItem, isSameDay, checkIsITBA, isITBACoreSubject } from "../types";
import { 
  ArrowLeft, Table, Calendar, CheckCircle2, XCircle, Search, 
  BookOpen, Clock, AlertCircle, Sparkles
} from "lucide-react";

interface TabelJamKosongProps {
  teachers: Teacher[];
  schedules: ScheduleItem[];
  onBack: () => void;
}


export const TabelJamKosong: React.FC<TabelJamKosongProps> = ({
  teachers,
  schedules,
  onBack,
}) => {
  const [selectedDay, setSelectedDay] = useState<typeof HARI_LIST[number]>("Senin");
  const [searchQuery, setSearchQuery] = useState("");

  // Filter teachers based on search query
  const filteredTeachers = useMemo(() => {
    if (!searchQuery.trim()) return teachers;
    const query = searchQuery.toLowerCase();
    return teachers.filter(t => 
      t.nama.toLowerCase().includes(query) ||
      (t.mapel_utama && t.mapel_utama.toLowerCase().includes(query)) ||
      (t.rumpun && t.rumpun.toLowerCase().includes(query))
    );
  }, [teachers, searchQuery]);

  // Compute teaching slots for each teacher on the selected day
  // Returns a map of: teacherName -> { jam_ke -> ScheduleItem[] }
  const teachingStatusMap = useMemo(() => {
    const map: Record<string, Record<number, ScheduleItem[]>> = {};

    teachers.forEach(t => {
      map[t.nama] = {
        1: [],
        2: [],
        3: [],
        4: [],
        5: [],
        6: [],
      };
    });

    schedules.forEach(item => {
      if (isSameDay(item.hari, selectedDay)) {
        const jam = item.jam_ke;
        if (jam >= 1 && jam <= 6) {
          const itemTeachers = [
            item.guru1,
            item.guru2,
            item.guru3,
            item.guru4,
            item.guru5,
            item.guru6
          ].map(g => g?.trim()?.toLowerCase()).filter(Boolean);

          teachers.forEach(t => {
            const tNameClean = t.nama.trim().toLowerCase();
            if (itemTeachers.includes(tNameClean)) {
              if (map[t.nama] && map[t.nama][jam]) {
                map[t.nama][jam].push(item);
              }
            }
          });
        }
      }
    });

    return map;
  }, [teachers, schedules, selectedDay]);

  // Compute statistics for the selected day
  const stats = useMemo(() => {
    let totalFreeSlots = 0;
    let totalTeachingSlots = 0;

    teachers.forEach(t => {
      const teacherSlots = teachingStatusMap[t.nama] || {};
      JAM_LIST.forEach(jam => {
        const slots = teacherSlots[jam] || [];
        if (slots.length === 0) {
          totalFreeSlots++;
        } else {
          totalTeachingSlots++;
        }
      });
    });

    return {
      totalFreeSlots,
      totalTeachingSlots,
      averageFreePerHour: (totalFreeSlots / JAM_LIST.length).toFixed(1)
    };
  }, [teachers, teachingStatusMap]);

  return (
    <div className="space-y-6">
      {/* Header Back & Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <button
          id="back-to-dashboard-btn"
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-indigo-600 bg-white px-4 py-2 rounded-xl border border-gray-100 hover:border-indigo-100 shadow-sm transition-all self-start"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Dashboard
        </button>

        <span className="text-sm font-medium text-gray-400">Peta Ketersediaan Guru Berdasarkan Jam Pelajaran</span>
      </div>

      {/* Main Container */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        
        {/* Title and Filters Header */}
        <div className="mb-6 flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-6 border-b border-gray-50">
          <div>
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <Table className="w-5 h-5 text-indigo-500" />
              Tabel Jam Kosong Guru
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Visualisasi ketersediaan mengajar guru di setiap Jam Pelajaran (JP) 1 s.d 6.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full xl:w-auto">
            {/* Day Filter */}
            <div className="flex bg-gray-100 p-1 rounded-xl gap-1 shrink-0">
              {HARI_LIST.map((day) => (
                <button
                  key={day}
                  id={`btn-day-filter-${day.toLowerCase()}`}
                  onClick={() => setSelectedDay(day)}
                  className={`px-3 py-1.5 text-xs sm:text-sm font-bold rounded-lg transition-all ${
                    selectedDay === day
                      ? "bg-white text-indigo-600 shadow-xs"
                      : "text-gray-500 hover:text-gray-900"
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative flex-1 sm:w-64">
              <input
                id="teacher-search-jam-kosong"
                type="text"
                placeholder="Cari nama atau mapel..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-10 py-2 bg-gray-50 text-xs sm:text-sm border border-gray-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
              />
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-2.5 text-xs text-gray-400 hover:text-gray-600 font-bold"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Quick Statistics Banner */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex items-center gap-3">
            <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-xl">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">Total Jam Kosong</div>
              <div className="text-xl font-black text-emerald-950 mt-0.5">{stats.totalFreeSlots} <span className="text-xs font-normal">JP</span></div>
            </div>
          </div>

          <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex items-center gap-3">
            <div className="p-2.5 bg-red-100 text-red-700 rounded-xl">
              <XCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] text-red-600 font-bold uppercase tracking-wider">Total Mengajar</div>
              <div className="text-xl font-black text-red-950 mt-0.5">{stats.totalTeachingSlots} <span className="text-xs font-normal">JP</span></div>
            </div>
          </div>

          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex items-center gap-3">
            <div className="p-2.5 bg-indigo-100 text-indigo-700 rounded-xl">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider">Rata-rata Guru Kosong</div>
              <div className="text-xl font-black text-indigo-950 mt-0.5">{stats.averageFreePerHour} <span className="text-xs font-normal">Guru / Jam</span></div>
            </div>
          </div>
        </div>

        {/* Guide and Legends */}
        <div className="mb-6 text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-xl p-3.5 flex flex-col md:flex-row items-start md:items-center gap-4">
          <div className="flex items-center gap-1.5 font-semibold text-slate-700 shrink-0">
            <AlertCircle className="w-4 h-4 text-indigo-500" />
            Petunjuk:
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 bg-emerald-100 border border-emerald-200 text-emerald-800 rounded flex items-center justify-center text-[10px] font-bold">
                ✓
              </div>
              <span><strong>Hijau (✓): Kosong</strong> (Guru tidak sedang mengajar)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 bg-red-100 border border-red-200 text-red-800 rounded flex items-center justify-center text-[10px] font-bold">
                ✗
              </div>
              <span><strong>Merah (✗): Mengajar</strong> (Menampilkan Kelas & Mapel)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 bg-purple-100 border border-purple-200 text-purple-800 rounded flex items-center justify-center text-[10px] font-bold">
                ?
              </div>
              <span><strong>Ungu (?): Pendamping</strong> (Sebagai pendamping guru mapel)</span>
            </div>
          </div>
        </div>

        {/* THE TABLE - DESKTOP ONLY */}
        <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-100 shadow-sm">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider">
                <th id="th-empty-no" className="p-4 text-center w-12">No</th>
                <th id="th-empty-guru" className="p-4 min-w-[200px]">Nama Guru</th>
                {JAM_LIST.map(jam => (
                  <th key={jam} id={`th-empty-jam-${jam}`} className="p-4 text-center min-w-[120px] border-l border-gray-100">
                    Jam Ke-{jam}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredTeachers.length > 0 ? (
                filteredTeachers.map((teacher, idx) => {
                  const teacherSlots = teachingStatusMap[teacher.nama] || {};

                  return (
                    <tr key={teacher.nama} className="hover:bg-gray-50/40 transition-colors">
                      {/* No */}
                      <td className="p-4 text-center font-bold text-gray-400">
                        {idx + 1}
                      </td>

                      {/* Nama Guru */}
                      <td className="p-4">
                        <div className="font-bold text-gray-800">{teacher.nama}</div>
                        <div className="text-[11px] text-gray-400 mt-0.5 font-medium truncate max-w-[220px]">
                          {teacher.mapel_utama} {teacher.wali_kelas ? `• Wali ${teacher.wali_kelas}` : ""}
                        </div>
                      </td>

                      {/* Jam 1 - 6 */}
                      {JAM_LIST.map(jam => {
                        const slots = teacherSlots[jam] || [];
                        const isFree = slots.length === 0;

                        if (isFree) {
                          return (
                            <td 
                              key={jam} 
                              className="p-3 text-center border-l border-gray-100 bg-emerald-50/50 hover:bg-emerald-100/40 transition-colors"
                            >
                              <div className="flex flex-col items-center justify-center gap-0.5">
                                <span className="text-emerald-700 bg-emerald-100/80 border border-emerald-200/50 w-6 h-6 rounded-full flex items-center justify-center font-bold text-sm shadow-xs animate-in zoom-in-50 duration-200">
                                  ✓
                                </span>
                                <span className="text-[9px] text-emerald-800 font-extrabold uppercase tracking-wide">
                                  Kosong
                                </span>
                              </div>
                            </td>
                          );
                        } else {
                          const isITBA = checkIsITBA(teacher);
                          const isPendamping = slots.some(item => {
                            const isGuru1 = item.guru1 && item.guru1.trim().toLowerCase() === teacher.nama.trim().toLowerCase();
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
                              return !isITBACoreSubject(item.mapel, teacher.nama);
                            } else {
                              const isSupervisingCol = item.selainguru1_mengawas && (item.selainguru1_mengawas.trim().toLowerCase() === "yes" || item.selainguru1_mengawas.trim().toLowerCase() === "ya");
                              return !isGuru1 && isSupervisingCol;
                            }
                          });

                          // Compile description of what they are teaching
                          const mapels = [...new Set(slots.map(s => s.mapel))].join(" & ");
                          const classes = [...new Set(slots.map(s => s.kelas))].join(" & ");

                          if (isPendamping) {
                            return (
                              <td 
                                key={jam} 
                                className="p-3 text-center border-l border-gray-100 bg-purple-50/50 hover:bg-purple-100/40 transition-colors"
                              >
                                <div className="flex flex-col items-center justify-center gap-1">
                                  <span className="text-purple-700 bg-purple-100/80 border border-purple-200/50 w-6 h-6 rounded-full flex items-center justify-center font-extrabold text-sm shadow-xs">
                                    ?
                                  </span>
                                  <div className="text-center leading-tight">
                                    <div className="text-[10px] font-extrabold text-purple-900 truncate max-w-[110px]" title={mapels}>
                                      {mapels}
                                    </div>
                                    <div className="text-[9px] font-semibold text-purple-700/80 mt-0.5 bg-purple-100/40 px-1 py-0.5 rounded border border-purple-200/30 inline-block">
                                      Pendamping ({classes})
                                    </div>
                                  </div>
                                </div>
                              </td>
                            );
                          }

                          return (
                            <td 
                              key={jam} 
                              className="p-3 text-center border-l border-gray-100 bg-red-50/50 hover:bg-red-100/40 transition-colors"
                            >
                              <div className="flex flex-col items-center justify-center gap-1">
                                <span className="text-red-700 bg-red-100/80 border border-red-200/50 w-6 h-6 rounded-full flex items-center justify-center font-extrabold text-xs shadow-xs">
                                  ✗
                                </span>
                                <div className="text-center leading-tight">
                                  <div className="text-[10px] font-extrabold text-red-900 truncate max-w-[110px]" title={mapels}>
                                    {mapels}
                                  </div>
                                  <div className="text-[9px] font-semibold text-red-700/80 mt-0.5 bg-red-100/40 px-1 py-0.5 rounded border border-red-200/30 inline-block">
                                    Kelas {classes}
                                  </div>
                                </div>
                              </div>
                            </td>
                          );
                        }
                      })}
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-gray-400 italic">
                    Tidak ada guru yang cocok dengan pencarian "{searchQuery}"
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* MOBILE VIEW - RESPONSIVE & COMPACT */}
        <div className="block md:hidden space-y-3">
          {filteredTeachers.length > 0 ? (
            filteredTeachers.map((teacher, idx) => {
              const teacherSlots = teachingStatusMap[teacher.nama] || {};

              return (
                <div 
                  key={teacher.nama} 
                  className="p-4 rounded-xl border border-gray-200 bg-gray-55/40 hover:bg-gray-50 transition-colors shadow-xs"
                >
                  <div className="pb-2 mb-2 border-b border-gray-100">
                    <div className="font-bold text-gray-800 text-sm">
                      {idx + 1}. {teacher.nama}
                    </div>
                    <div className="text-[11px] text-gray-400 font-medium">
                      {teacher.mapel_utama} {teacher.wali_kelas ? `• Wali ${teacher.wali_kelas}` : ""}
                    </div>
                  </div>

                  <div className="bg-white rounded-lg border border-gray-100 p-2.5">
                    {/* Jam numbers header */}
                    <div className="grid grid-cols-6 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 pb-1.5 mb-1.5">
                      {JAM_LIST.map(jam => (
                        <div key={jam}>Jam {jam}</div>
                      ))}
                    </div>
                    {/* v / x values */}
                    <div className="grid grid-cols-6 text-center">
                      {JAM_LIST.map(jam => {
                        const slots = teacherSlots[jam] || [];
                        const isFree = slots.length === 0;

                        if (isFree) {
                          return (
                            <div key={jam} className="flex flex-col items-center justify-center py-1">
                              <span className="text-emerald-800 bg-emerald-50 border border-emerald-100 w-6 h-6 rounded-md flex items-center justify-center font-black text-xs">
                                v
                              </span>
                              <span className="text-[7px] text-emerald-600 font-semibold mt-0.5">
                                Free
                              </span>
                            </div>
                          );
                        } else {
                          const isITBA = checkIsITBA(teacher);
                          const isPendamping = slots.some(item => {
                            const isGuru1 = item.guru1 && item.guru1.trim().toLowerCase() === teacher.nama.trim().toLowerCase();
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
                              return !isITBACoreSubject(item.mapel, teacher.nama);
                            } else {
                              const isSupervisingCol = item.selainguru1_mengawas && (item.selainguru1_mengawas.trim().toLowerCase() === "yes" || item.selainguru1_mengawas.trim().toLowerCase() === "ya");
                              return !isGuru1 && isSupervisingCol;
                            }
                          });

                          const classes = [...new Set(slots.map(s => s.kelas))].join("&");

                          if (isPendamping) {
                            return (
                              <div key={jam} className="flex flex-col items-center justify-center py-1">
                                <span className="text-purple-800 bg-purple-50 border border-purple-100 w-6 h-6 rounded-md flex items-center justify-center font-black text-xs">
                                  ?
                                </span>
                                <span className="text-[8px] text-purple-600 font-extrabold mt-0.5 truncate max-w-[48px]" title={classes}>
                                  Pndp {classes}
                                </span>
                              </div>
                            );
                          }

                          return (
                            <div key={jam} className="flex flex-col items-center justify-center py-1">
                              <span className="text-red-800 bg-red-50 border border-red-100 w-6 h-6 rounded-md flex items-center justify-center font-black text-xs">
                                x
                              </span>
                              <span className="text-[8px] text-red-500 font-extrabold mt-0.5 truncate max-w-[48px]" title={classes}>
                                Klst {classes}
                              </span>
                            </div>
                          );
                        }
                      })}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-6 text-center text-gray-400 italic text-xs">
              Tidak ada guru yang cocok dengan pencarian "{searchQuery}"
            </div>
          )}
        </div>

        {/* Small Notice */}
        <div className="mt-4 flex items-center gap-1.5 text-xs text-gray-400">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          <span>Tabel ini langsung diperbarui secara realtime apabila jadwal kelas diubah oleh admin.</span>
        </div>

      </div>
    </div>
  );
};
