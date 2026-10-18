import React, { useState, useMemo } from "react";
import { Teacher, ScheduleItem, isSameDay, checkIsITBA, isITBACoreSubject } from "../types";
import { ArrowLeft, Users, Clock, Calendar, CheckSquare, Search, AlertCircle, ShieldAlert } from "lucide-react";
import { JAM_TIME_MAP, SCHOOL_DAYS as HARI_LIST, TEACHING_JPS as JAM_LIST } from "../constants/schedule";

import { T } from '../i18n/LanguageProvider';
interface JamKosongSemuaProps {
  teachers: Teacher[];
  schedules: ScheduleItem[];
  onBack: () => void;
}


export const JamKosongSemua: React.FC<JamKosongSemuaProps> = ({
  teachers,
  schedules,
  onBack,
}) => {
  const [selectedDay, setSelectedDay] = useState<typeof HARI_LIST[number]>("Senin");
  const [selectedJam, setSelectedJam] = useState<number>(1);
  const [searchQuery, setSearchQuery] = useState("");

  // Compute which teachers are free at selectedDay and selectedJam
  const freeTeachers = useMemo(() => {
    const list: Array<{
      teacher: Teacher;
      isExtraTask: boolean;
      extraTaskLabel: string;
    }> = [];

    teachers.forEach(teacher => {
      const scheduledSlots = schedules.filter(item => 
        isSameDay(item.hari, selectedDay) && 
        item.jam_ke === selectedJam &&
        [item.guru1, item.guru2, item.guru3, item.guru4, item.guru5, item.guru6].some(
          g => g && g.trim().toLowerCase() === teacher.nama.trim().toLowerCase()
        )
      );

      if (scheduledSlots.length === 0) {
        list.push({
          teacher,
          isExtraTask: false,
          extraTaskLabel: ""
        });
      } else {
        const isITBA = checkIsITBA(teacher);
        
        const hasCoreOrNonSupervising = scheduledSlots.some(s => {
          const isGuru1 = s.guru1 && s.guru1.trim().toLowerCase() === teacher.nama.trim().toLowerCase();
          
          if (isITBA) {
            return isITBACoreSubject(s.mapel, teacher.nama);
          }

          if (isGuru1) return true;

          const isSupervisingCol = s.selainguru1_mengawas && (s.selainguru1_mengawas.trim().toLowerCase() === "yes" || s.selainguru1_mengawas.trim().toLowerCase() === "ya");
          return !isSupervisingCol;
        });

        if (!hasCoreOrNonSupervising) {
          const tasks = scheduledSlots.map(s => `${s.mapel} (Kelas ${s.kelas})`).join(", ");
          list.push({
            teacher,
            isExtraTask: true,
            extraTaskLabel: `Sedang Mendampingi: ${tasks}`
          });
        }
      }
    });

    return list;
  }, [teachers, schedules, selectedDay, selectedJam]);

  // Apply search query filter
  const filteredFreeTeachers = useMemo(() => {
    if (searchQuery.trim() === "") return freeTeachers;
    const query = searchQuery.toLowerCase();
    return freeTeachers.filter(item => 
      item.teacher.nama.toLowerCase().includes(query) || 
      item.teacher.mapel_utama.toLowerCase().includes(query) ||
      item.teacher.rumpun.toLowerCase().includes(query) ||
      item.extraTaskLabel.toLowerCase().includes(query)
    );
  }, [freeTeachers, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Navigation Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <button
          id="back-to-dashboard-btn"
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-indigo-600 bg-white px-4 py-2 rounded-xl border border-gray-100 hover:border-indigo-100 shadow-sm transition-all self-start"
        >
          <ArrowLeft className="w-4 h-4" />
          <T>{"Kembali ke Dashboard"}</T>
        </button>

        <span className="text-sm font-semibold text-gray-400 flex items-center gap-1.5">
          <ShieldAlert className="w-4 h-4 text-indigo-500" />
          Menu Khusus Admin (Jam Kosong Semua Guru)
        </span>
      </div>

      {/* Main Panel */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        
        {/* Title */}
        <div className="mb-6 pb-6 border-b border-gray-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-500" />
              Jam Kosong Semua Guru
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Mencari daftar guru yang berstatus longgar/kosong pada hari dan jam pelajaran tertentu.
            </p>
          </div>

          <span className="text-xs font-bold px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg">
            Total {freeTeachers.length} Guru Kosong
          </span>
        </div>

        {/* Filters Panel */}
        <div className="p-5 bg-gray-50 rounded-2xl gap-4 grid grid-cols-1 md:grid-cols-3">
          
          {/* Day Selector */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-gray-400" />
              Pilih Hari
            </label>
            <select
              id="select-filter-day"
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value as any)}
              className="w-full bg-white border border-gray-200 text-gray-800 text-sm font-semibold p-2.5 rounded-xl focus:border-indigo-500 focus:outline-none shadow-sm transition-colors"
            >
              {HARI_LIST.map(hari => (
                <option key={hari} value={hari}>{hari}</option>
              ))}
            </select>
          </div>

          {/* Hour Selector */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-gray-400" />
              Pilih Jam Ke-
            </label>
            <select
              id="select-filter-jam"
              value={selectedJam}
              onChange={(e) => setSelectedJam(Number(e.target.value))}
              className="w-full bg-white border border-gray-200 text-gray-800 text-sm font-semibold p-2.5 rounded-xl focus:border-indigo-500 focus:outline-none shadow-sm transition-colors"
            >
              {JAM_LIST.map(jam => (
                <option key={jam} value={jam}>Jam Ke-{jam} ({JAM_TIME_MAP[jam]})</option>
              ))}
            </select>
          </div>

          {/* Search Query inside Free Teachers */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Search className="w-3.5 h-3.5 text-gray-400" />
              Cari Nama / Mapel
            </label>
            <input
              id="filter-free-search"
              type="text"
              placeholder="Cari guru yang kosong..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-gray-200 text-gray-800 text-sm p-2.5 rounded-xl focus:border-indigo-500 focus:outline-none shadow-sm transition-colors"
            />
          </div>

        </div>

        {/* Summary Bar */}
        <div className="mt-4 p-3.5 bg-indigo-50/50 border border-indigo-100/50 text-indigo-900 text-xs font-semibold rounded-xl flex items-center gap-2">
          <CheckSquare className="w-4 h-4 text-indigo-500 shrink-0" />
          <span>Menampilkan guru yang tidak memiliki jam mengajar pada hari <strong>{selectedDay}</strong> jam ke-<strong>{selectedJam} ({JAM_TIME_MAP[selectedJam]})</strong>.</span>
        </div>

        {/* Free Teachers Cards List */}
        {filteredFreeTeachers.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
            {filteredFreeTeachers.map((item) => {
              const { teacher, isExtraTask, extraTaskLabel } = item;
              return (
                <div 
                  key={teacher.nama}
                  className="bg-white border border-gray-100 hover:border-indigo-100 p-5 rounded-2xl shadow-sm hover:shadow transition-all flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                        {teacher.nama[0]}
                      </div>
                      
                      <div className="flex flex-col items-end gap-1 text-[10px] font-bold">
                        <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full uppercase border border-emerald-100">
                          {teacher.jenjang}
                        </span>
                        {teacher.is_manajemen && (
                          <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full uppercase border border-amber-100">
                            Manajemen
                          </span>
                        )}
                        {isExtraTask && (
                          <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full uppercase border border-purple-100 animate-pulse">
                            ITBA (Tugas Tambahan)
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <h4 className="font-bold text-gray-800 text-sm leading-snug">{teacher.nama}</h4>
                      <p className="text-xs text-gray-400 font-medium mt-0.5">Mapel Utama: {teacher.mapel_utama}</p>
                    </div>

                    {isExtraTask && (
                      <div className="text-[11px] font-semibold text-purple-700 bg-purple-50/70 border border-purple-100/50 rounded-lg p-2 mt-2 leading-relaxed">
                        📌 {extraTaskLabel}
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-gray-50 space-y-1.5 text-[11px] text-gray-500">
                    <div className="flex justify-between">
                      <span>Rumpun:</span>
                      <strong className="text-gray-700">{teacher.rumpun}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Wali Kelas:</span>
                      <strong className="text-gray-700">{teacher.wali_kelas || "Bukan"}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Pendamping:</span>
                      <strong className="text-gray-700">{teacher.pendamping_kelas || "Tidak ada"}</strong>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-12 text-center bg-gray-50 border border-dashed border-gray-200 rounded-2xl mt-6">
            <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="font-semibold text-gray-700 text-sm">Semua Guru Sedang Mengajar</p>
            <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
              Tidak ada satu pun guru yang kosong pada hari {selectedDay} jam ke-{selectedJam}. Semua guru terdaftar sedang mengajar di kelasnya masing-masing.
            </p>
          </div>
        )}

      </div>
    </div>
  );
};
