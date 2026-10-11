import React, { useState, useMemo } from "react";
import { Teacher, ScheduleItem, normalizeDay, checkIsITBA, isSameDay, isITBACoreSubject } from "../types";
import { ArrowLeft, Clock, Calendar, CheckCircle, Search, HelpCircle } from "lucide-react";
import { JAM_TIME_MAP, SCHOOL_DAYS as HARI_LIST, TEACHING_JPS as JAM_LIST } from "../constants/schedule";

interface JamKosongIndividuProps {
  teachers: Teacher[];
  schedules: ScheduleItem[];
  selectedTeacher: string;
  setSelectedTeacher: (name: string) => void;
  onBack: () => void;
}


export const JamKosongIndividu: React.FC<JamKosongIndividuProps> = ({
  teachers,
  schedules,
  selectedTeacher,
  setSelectedTeacher,
  onBack,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [dayFilter, setDayFilter] = useState<string>("Semua");

  const currentTeacher = teachers.find(t => t.nama === selectedTeacher);

  const filteredTeachers = searchQuery.trim() === ""
    ? []
    : teachers.filter(t => t.nama.toLowerCase().includes(searchQuery.toLowerCase()));

  // Compute free slots
  const freeSlots = useMemo(() => {
    if (!selectedTeacher || !currentTeacher) return [];

    const isITBA = checkIsITBA(currentTeacher);

    const slots: Array<{
      id: string;
      hari: typeof HARI_LIST[number];
      jam_ke: number;
      waktu: string;
      isExtraTask: boolean;
      extraTaskLabel: string;
    }> = [];

    HARI_LIST.forEach(hari => {
      JAM_LIST.forEach(jam => {
        // Skip Friday Jam 6 completely
        if (hari === "Jumat" && jam === 6) {
          return;
        }

        // Find if they are scheduled in this slot
        const scheduledSlots = schedules.filter(s => 
          isSameDay(s.hari, hari) && 
          s.jam_ke === jam &&
          [s.guru1, s.guru2, s.guru3, s.guru4, s.guru5, s.guru6].some(
            g => g && g.trim().toLowerCase() === selectedTeacher.trim().toLowerCase()
          )
        );

        const scheduleAtJamForTime = schedules.find(s => isSameDay(s.hari, hari) && s.jam_ke === jam && s.mulai && s.selesai);
        const waktu = scheduleAtJamForTime ? `${scheduleAtJamForTime.mulai} - ${scheduleAtJamForTime.selesai}` : JAM_TIME_MAP[jam];

        if (scheduledSlots.length === 0) {
          slots.push({
            id: `free-${hari}-${jam}`,
            hari,
            jam_ke: jam,
            waktu,
            isExtraTask: false,
            extraTaskLabel: ""
          });
        } else {
          const hasCoreOrNonSupervising = scheduledSlots.some(s => {
            const isGuru1 = s.guru1 && s.guru1.trim().toLowerCase() === selectedTeacher.trim().toLowerCase();
            
            if (isITBA) {
              return isITBACoreSubject(s.mapel, selectedTeacher);
            }

            if (isGuru1) return true;

            const isSupervisingCol = s.selainguru1_mengawas && (s.selainguru1_mengawas.trim().toLowerCase() === "yes" || s.selainguru1_mengawas.trim().toLowerCase() === "ya");
            return !isSupervisingCol;
          });

          if (!hasCoreOrNonSupervising) {
            const tasks = scheduledSlots.map(s => `${s.mapel} (Kelas ${s.kelas})`).join(", ");
            slots.push({
              id: `free-${hari}-${jam}`,
              hari,
              jam_ke: jam,
              waktu,
              isExtraTask: true,
              extraTaskLabel: `Sedang Mendampingi: ${tasks}`
            });
          }
        }
      });
    });

    return slots;
  }, [selectedTeacher, currentTeacher, schedules]);

  // Filter free slots by day
  const filteredFreeSlots = useMemo(() => {
    if (dayFilter === "Semua") return freeSlots;
    return freeSlots.filter(s => s.hari === dayFilter);
  }, [freeSlots, dayFilter]);

  // Calculate percentage of free time
  const freePercentage = useMemo(() => {
    const totalSlots = 29;
    const freeCount = freeSlots.length;
    return Math.round((freeCount / totalSlots) * 100);
  }, [freeSlots]);

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <button
          id="back-to-dashboard-btn"
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-indigo-600 bg-white px-4 py-2 rounded-xl border border-gray-100 hover:border-indigo-100 shadow-sm transition-all self-start"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Dashboard
        </button>

        <span className="text-sm font-medium text-gray-400">Analisis Jam Kosong Individu</span>
      </div>

      {/* Main Panel */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        
        {/* Switcher & Title */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-gray-50">
          <div>
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-500" />
              Slot Jam Kosong Individu
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Slot jam pelajaran sekolah (1-6) di mana guru tidak memiliki kelas mengajar.
            </p>
          </div>

          <div className="relative w-full md:w-80">
            <div className="relative">
              <input
                id="jam-search-input"
                type="text"
                placeholder="Ganti Guru..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSuggestions(true);
                }}
                className="w-full pl-10 pr-4 py-2 bg-gray-50 text-sm border border-gray-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
              />
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            </div>

            {showSuggestions && filteredTeachers.length > 0 && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-100 rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-gray-50">
                {filteredTeachers.map(t => (
                  <button
                    key={t.nama}
                    id={`jam-suggest-${t.nama.replace(/\s+/g, '-').toLowerCase()}`}
                    onClick={() => {
                      setSelectedTeacher(t.nama);
                      setSearchQuery("");
                      setShowSuggestions(false);
                    }}
                    className="w-full text-left px-4 py-2.5 text-xs hover:bg-indigo-50 text-gray-700 font-medium"
                  >
                    {t.nama}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {selectedTeacher && currentTeacher ? (
          <div className="space-y-6">
            
            {/* Teacher and Statistics summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 p-5 bg-gray-50 rounded-2xl flex flex-col justify-center">
                <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Guru Penerima</span>
                <h3 className="text-lg font-bold text-gray-800 mt-0.5">{selectedTeacher}</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Mata Pelajaran: {currentTeacher.mapel_utama} | Rumpun: {currentTeacher.rumpun}
                </p>
              </div>

              <div className="p-5 bg-amber-50/50 border border-amber-100/50 rounded-2xl flex flex-col items-center justify-center text-center">
                <span className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-1">Availabilitas</span>
                <span className="text-3xl font-black text-amber-600">{freeSlots.length} / 29 JP</span>
                <span className="text-xs text-amber-700 font-semibold mt-1">({freePercentage}% Jam Kosong)</span>
              </div>
            </div>

            {/* Filter Tabs by Day */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
              <span className="text-sm font-bold text-gray-700">Filter Berdasarkan Hari:</span>
              <div className="flex flex-wrap gap-1 bg-gray-100 p-1 rounded-xl">
                <button
                  id="tab-day-all"
                  onClick={() => setDayFilter("Semua")}
                  className={`text-xs font-semibold px-3.5 py-2 rounded-lg transition-all ${
                    dayFilter === "Semua" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  Semua Hari
                </button>
                {HARI_LIST.map(hari => (
                  <button
                    key={hari}
                    id={`tab-day-${hari}`}
                    onClick={() => setDayFilter(hari)}
                    className={`text-xs font-semibold px-3.5 py-2 rounded-lg transition-all ${
                      dayFilter === hari ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"
                    }`}
                  >
                    {hari}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-xs font-semibold text-amber-800 bg-amber-50/70 border border-amber-100/50 p-3 rounded-xl flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-amber-500 shrink-0" />
              <span>Jam kosong ini merupakan waktu potensial di mana guru bersangkutan dapat ditunjuk menjadi <strong>Guru Pengganti (Inval)</strong> jika ada rekan guru lain yang berhalangan hadir.</span>
            </div>

            {/* LIST OF FREE SLOTS */}
            {filteredFreeSlots.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredFreeSlots.map((slot) => (
                  <div 
                    key={slot.id}
                    className={`p-4 bg-white border rounded-xl shadow-sm hover:shadow transition-all flex flex-col justify-between gap-3 group ${
                      slot.isExtraTask 
                        ? "border-purple-200 hover:border-purple-300 bg-purple-50/20" 
                        : "border-gray-100 hover:border-amber-200"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 w-full">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Calendar className={`w-3.5 h-3.5 ${slot.isExtraTask ? "text-purple-500" : "text-indigo-500"}`} />
                          <span className="font-bold text-gray-800 text-sm">{slot.hari}</span>
                          {slot.isExtraTask && (
                            <span className="bg-purple-100 text-purple-700 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">
                              ITBA Tugas Tambahan
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 flex items-center gap-1">
                          <span>Sesi Jam ke-{slot.jam_ke}</span>
                        </div>
                        <div className={`text-xs font-semibold ${slot.isExtraTask ? "text-purple-600" : "text-amber-600"}`}>
                          {slot.waktu}
                        </div>
                      </div>
                      
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-all ${
                        slot.isExtraTask
                          ? "bg-purple-100 text-purple-700 group-hover:bg-purple-500 group-hover:text-white"
                          : "bg-amber-50 text-amber-600 group-hover:bg-amber-500 group-hover:text-white"
                      }`}>
                        {slot.jam_ke}
                      </div>
                    </div>

                    {slot.isExtraTask && (
                      <div className="text-[10px] font-semibold text-purple-700 bg-purple-50 border border-purple-100 rounded-lg p-2 leading-relaxed w-full">
                        📌 {slot.extraTaskLabel}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="font-semibold text-gray-700">Tidak ada jam kosong</p>
                <p className="text-xs text-gray-400 mt-1">Seluruh slot waktu untuk hari {dayFilter} telah terisi oleh jadwal mengajar.</p>
              </div>
            )}

          </div>
        ) : (
          <div className="text-center py-10 text-gray-400">
            Silakan pilih nama guru di Dashboard terlebih dahulu.
          </div>
        )}
      </div>
    </div>
  );
};
