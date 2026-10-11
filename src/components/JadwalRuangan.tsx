import React, { useState, useMemo, useEffect } from "react";
import { buildRoomWeekDays } from "../domain/roomWeek";
import { classifyRoomOccupancy } from "../domain/roomOccupancy";
import { WeeklyRoomEditor } from "./WeeklyRoomEditor";
import { getCurrentUserContext } from "../infrastructure/auth/supabaseAuthRepository";
import { 
  ScheduleItem, 
  JadwalInsidentalItem, 
  MasterRuanganItem, 
  KalenderAkademikItem,
  normalizeDay,
  isCombinedClassValue,
  isClassMatch,
  matchRoomId,
  getRoomDisplayName,
  resolveRoomInfo,
  getAcademicCalendarEvent
} from "../types";
import { 
  Building2, 
  MapPin, 
  CalendarDays, 
  ChevronLeft, 
  ChevronRight, 
  Users, 
  Clock, 
  AlertTriangle, 
  ArrowLeft,
  RefreshCw,
  Pencil,
  Info,
  CheckCircle2,
  X
} from "lucide-react";

export { matchRoomId };

interface JadwalRuanganProps {
  schedules: ScheduleItem[];
  jadwalInsidental: JadwalInsidentalItem[];
  masterRuangan: MasterRuanganItem[];
  kalenderAkademik?: KalenderAkademikItem[];
  onBack: () => void;
  onChanged?: () => Promise<void> | void;
}


export function JadwalRuangan({
  schedules,
  jadwalInsidental,
  masterRuangan,
  kalenderAkademik = [],
  onBack,
  onChanged = () => {},
}: JadwalRuanganProps) {
  const [canEditRooms, setCanEditRooms] = useState(false);
  const [roomEditMode, setRoomEditMode] = useState(false);
  const [editingRoomSlot, setEditingRoomSlot] = useState<{ date: string; period: number; initialClass?: string } | null>(null);

  useEffect(() => {
    let active = true;
    void getCurrentUserContext().then((ctx) => {
      if (active) setCanEditRooms(Boolean(ctx?.roles.some((role) => role === "ADMIN" || role === "WAKASEK")));
    }).catch(() => { if (active) setCanEditRooms(false); });
    return () => { active = false; };
  }, []);

  // --- FILTER ROOM SELECTION ---
  const [selectedRoomId, setSelectedRoomId] = useState<string>(() => {
    return localStorage.getItem("jadwal_ruangan_selected_room") || "";
  });

  // --- WEEK SELECTION OFFSET ---
  const [weekOffset, setWeekOffset] = useState<number>(0);

  // --- CELL DETAIL MODAL STATE ---
  const [cellDetailModal, setCellDetailModal] = useState<{
    dayName: string;
    dateStr: string;
    displayDate: string;
    jamLabel: string;
    jamKe: number;
    usages: any[];
    isConflict: boolean;
    isCombined: boolean;
  } | null>(null);

  // --- FILTER ACTIVE ROOMS ---
  const activeMasterRuangan = useMemo(() => {
    if (!masterRuangan || masterRuangan.length === 0) return [];
    return masterRuangan.filter(r => {
      const status = (r.status || "Aktif").trim().toLowerCase();
      return status === "" || status === "aktif";
    });
  }, [masterRuangan]);

  // --- PRIORITY SORTING ---
  const sortedMasterRuangan = useMemo(() => {
    const priorityList = [
      "RSG",
      "LABKOM",
      "MQSMPSMAAKH",
      "MQSMPSMAIKH",
      "PERPUS",
      "MUSHALASD",
      "MUSHALLA4",
      "MUSHALLA2",
      "MQSDRENDAHIKH"
    ];

    return [...activeMasterRuangan].sort((a, b) => {
      const idA = (a.id_ruangan || "").trim().toUpperCase();
      const idB = (b.id_ruangan || "").trim().toUpperCase();
      const nameA = (a.nama_ruangan || "").trim();
      const nameB = (b.nama_ruangan || "").trim();
      const aliasA = (a.alias || "").trim();
      const aliasB = (b.alias || "").trim();

      const isAeInterA = idA.includes("INTER") || idA.includes("AE") || nameA.toUpperCase().includes("INTER") || nameA.toUpperCase().includes("AE") || aliasA.toUpperCase().includes("INTER") || aliasA.toUpperCase().includes("AE");
      const isAeInterB = idB.includes("INTER") || idB.includes("AE") || nameB.toUpperCase().includes("INTER") || nameB.toUpperCase().includes("AE") || aliasB.toUpperCase().includes("INTER") || aliasB.toUpperCase().includes("AE");

      const indexA = priorityList.indexOf(idA);
      const indexB = priorityList.indexOf(idB);

      // Priority Group 1: Matches explicit priority list
      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;

      // Group 3: AE / Inter class rooms go to the very bottom
      if (!isAeInterA && isAeInterB) return -1;
      if (isAeInterA && !isAeInterB) return 1;

      // Group 2 & 3 natural sorting
      return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: "base" });
    });
  }, [activeMasterRuangan]);

  // Ensure default selected room exists in sorted list
  useEffect(() => {
    if (sortedMasterRuangan.length > 0) {
      if (!selectedRoomId || !sortedMasterRuangan.some(r => r.id_ruangan === selectedRoomId)) {
        const defaultId = sortedMasterRuangan[0].id_ruangan;
        setSelectedRoomId(defaultId);
        localStorage.setItem("jadwal_ruangan_selected_room", defaultId);
      }
    }
  }, [sortedMasterRuangan, selectedRoomId]);

  const handleSelectRoom = (id: string) => {
    setSelectedRoomId(id);
    localStorage.setItem("jadwal_ruangan_selected_room", id);
  };

  // Selected Room Object Metadata
  const currentRoomObj = useMemo(() => {
    return masterRuangan.find(r => r.id_ruangan === selectedRoomId) || null;
  }, [masterRuangan, selectedRoomId]);

  // --- CALCULATE WEEK DAYS (Senin–Jumat) ---
  const weekDays = useMemo(() => buildRoomWeekDays(new Date(), weekOffset), [weekOffset]);

  const weekRangeText = useMemo(() => {
    if (weekDays.length < 5) return "";
    const first = weekDays[0];
    const last = weekDays[4];
    const d1 = new Date(first.dateStr).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
    const d2 = new Date(last.dateStr).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
    return `${d1} – ${d2}`;
  }, [weekDays]);

  // --- EFFECTIVE ROOM SCHEDULE MATRIX CALCULATION ---
  const { scheduleGrid, totalWeeklySlots, totalConflicts, unknownRoomIds } = useMemo(() => {
    if (!selectedRoomId) {
      return { scheduleGrid: {}, totalWeeklySlots: 0, totalConflicts: 0, unknownRoomIds: [] };
    }

    // Grid structure: grid[dateStr][jam_ke] = Array of effective usage objects
    const grid: Record<string, Record<number, any[]>> = {};
    const unmappedIds = new Set<string>();

    weekDays.forEach(dayInfo => {
      grid[dayInfo.dateStr] = {};
      for (let jam = 0; jam <= 6; jam++) {
        grid[dayInfo.dateStr][jam] = [];
      }
    });

    // Track matched incidentals to avoid duplicating additional slots
    const pairedIncidentalIds = new Set<string>();

    // 1. Process Master Schedules for each week day
    weekDays.forEach(dayInfo => {
      const dayMasterSchedules = schedules.filter(s => normalizeDay(s.hari) === dayInfo.name);

      dayMasterSchedules.forEach(s => {
        const rawRoom = (s.ruangan || "").trim();
        if (rawRoom) {
          const masterRoomId = matchRoomId(rawRoom, masterRuangan);
          if (!masterRoomId) {
            unmappedIds.add(rawRoom);
          }
        }

        // Check if there is an incidental override for this class & jam_ke on this date
        const matchingIncidental = jadwalInsidental.find(inc => 
          inc.tanggal === dayInfo.dateStr && 
          Number(inc.jam_ke) === Number(s.jam_ke) && 
          isClassMatch(inc.kelas, s.kelas)
        );

        const targetClass = matchingIncidental ? (matchingIncidental.kelas || s.kelas) : s.kelas;
        // Check if slot is cancelled / replaced by Kalender Akademik
        const academicEvent = getAcademicCalendarEvent(dayInfo.dateStr, targetClass, Number(s.jam_ke), kalenderAkademik);
        if (academicEvent) {
          if (matchingIncidental) {
            pairedIncidentalIds.add(matchingIncidental.id);
          }
          return; // Room is not occupied because KBM is cancelled by Kalender Akademik
        }

        if (matchingIncidental) {
          pairedIncidentalIds.add(matchingIncidental.id);

          const incRawRoom = (matchingIncidental.ruangan || "").trim();
          let effectiveRoomId: string | null = null;

          if (incRawRoom) {
            effectiveRoomId = matchRoomId(incRawRoom, masterRuangan);
            if (!effectiveRoomId) unmappedIds.add(incRawRoom);
          } else {
            // Inherit master room if incidental room is empty
            effectiveRoomId = matchRoomId(rawRoom, masterRuangan);
          }

          // If effective room matches selected room, add to grid!
          if (effectiveRoomId === selectedRoomId) {
            const teachers = [
              matchingIncidental.guru1, matchingIncidental.guru2, matchingIncidental.guru3,
              matchingIncidental.guru4, matchingIncidental.guru5, matchingIncidental.guru6
            ].filter(Boolean).join(", ") || [s.guru1, s.guru2, s.guru3, s.guru4, s.guru5, s.guru6].filter(Boolean).join(", ");

            grid[dayInfo.dateStr][s.jam_ke].push({
              id: `effective_inc_${matchingIncidental.id}`,
              kelas: matchingIncidental.kelas || s.kelas,
              mapel: matchingIncidental.mapel || s.mapel,
              guru: teachers,
              mulai: matchingIncidental.mulai || s.mulai,
              selesai: matchingIncidental.selesai || s.selesai,
              source: "Insidental",
              tipe_insidental: matchingIncidental.tipe_insidental || "Perubahan Jadwal",
              alasan: matchingIncidental.alasan || matchingIncidental.keterangan_khusus || "",
              kelasgabung: matchingIncidental.kelasgabung !== undefined && matchingIncidental.kelasgabung !== null && String(matchingIncidental.kelasgabung).trim() !== "" ? matchingIncidental.kelasgabung : s.kelasgabung,
              isOverride: true
            });
          }
        } else {
          // No incidental override -> use master schedule baseline
          const masterRoomId = matchRoomId(rawRoom, masterRuangan);
          if (masterRoomId === selectedRoomId) {
            const teachers = [s.guru1, s.guru2, s.guru3, s.guru4, s.guru5, s.guru6].filter(Boolean).join(", ");
            grid[dayInfo.dateStr][s.jam_ke].push({
              id: `effective_master_${s.id}`,
              kelas: s.kelas,
              mapel: s.mapel,
              guru: teachers,
              mulai: s.mulai,
              selesai: s.selesai,
              source: "Reguler",
              kelasgabung: s.kelasgabung,
              isOverride: false
            });
          }
        }
      });
    });

    // 2. Process Unpaired Additional Incidentals for this week
    jadwalInsidental.forEach(inc => {
      if (pairedIncidentalIds.has(inc.id)) return;

      const dayInfo = weekDays.find(d => d.dateStr === inc.tanggal);
      if (!dayInfo) return; // Outside selected week

      const jam = Number(inc.jam_ke);
      // Check if slot is cancelled / replaced by Kalender Akademik
      const academicEvent = getAcademicCalendarEvent(dayInfo.dateStr, inc.kelas, jam, kalenderAkademik);
      if (academicEvent) return;

      const incRawRoom = (inc.ruangan || "").trim();
      if (!incRawRoom) return;

      const incRoomId = matchRoomId(incRawRoom, masterRuangan);
      if (!incRoomId) unmappedIds.add(incRawRoom);

      if (incRoomId === selectedRoomId) {
        const teachers = [inc.guru1, inc.guru2, inc.guru3, inc.guru4, inc.guru5, inc.guru6].filter(Boolean).join(", ");
        const jam = Number(inc.jam_ke);
        if (jam >= 0 && jam <= 6) {
          grid[dayInfo.dateStr][jam].push({
            id: `effective_inc_add_${inc.id}`,
            kelas: inc.kelas,
            mapel: inc.mapel,
            guru: teachers,
            mulai: inc.mulai || "",
            selesai: inc.selesai || "",
            source: "Insidental",
            tipe_insidental: inc.tipe_insidental || "Jadwal Tambahan",
            alasan: inc.alasan || inc.keterangan_khusus || "",
            kelasgabung: inc.kelasgabung,
            isOverride: true
          });
        }
      }
    });

    // 3. Sort classes within each cell and calculate stats
    let totalSlots = 0;
    let conflicts = 0;

    weekDays.forEach(dayInfo => {
      for (let jam = 0; jam <= 6; jam++) {
        const items = grid[dayInfo.dateStr][jam];
        if (items.length > 0) {
          totalSlots += items.length;
          // Sort classes in cell naturally
          items.sort((a, b) => a.kelas.localeCompare(b.kelas, undefined, { numeric: true, sensitivity: "base" }));
          
          if (classifyRoomOccupancy(items).conflict) conflicts += 1;
        }
      }
    });

    return {
      scheduleGrid: grid,
      totalWeeklySlots: totalSlots,
      totalConflicts: conflicts,
      unknownRoomIds: Array.from(unmappedIds)
    };
  }, [selectedRoomId, weekDays, schedules, jadwalInsidental, masterRuangan, kalenderAkademik]);

  // Default JP Time Range Labels
  const DEFAULT_JAM_TIMES: Record<number, { mulai: string; selesai: string; label: string }> = {
    0: { mulai: "07:00", selesai: "07:40", label: "Homeroom / Tahfizh" },
    1: { mulai: "07:40", selesai: "08:40", label: "JP 1" },
    2: { mulai: "08:40", selesai: "09:40", label: "JP 2" },
    3: { mulai: "09:40", selesai: "10:40", label: "JP 3" },
    4: { mulai: "10:40", selesai: "11:40", label: "JP 4" },
    5: { mulai: "11:40", selesai: "12:40", label: "JP 5" },
    6: { mulai: "12:40", selesai: "13:40", label: "JP 6" }
  };

  return (
    <div className="space-y-6">
      
      {/* TOP TITLE HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            title="Kembali ke Dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Jadwal Penggunaan Ruangan
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Visualisasi pemakaian ruang moving &amp; shared selama satu minggu pembelajaran
            </p>
          </div>
        </div>

        {/* Room Selection Dropdown */}
        <div className="flex flex-col gap-1 min-w-[240px] sm:max-w-xs">
          <label htmlFor="room-selector" className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-blue-600" />
            Pilih Ruangan:
          </label>
          <select
            id="room-selector"
            value={selectedRoomId}
            onChange={(e) => handleSelectRoom(e.target.value)}
            disabled={sortedMasterRuangan.length === 0}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all cursor-pointer"
          >
            {sortedMasterRuangan.length === 0 ? (
              <option value="">-- Data Ruangan Belum Ada --</option>
            ) : (
              sortedMasterRuangan.map((room) => (
                <option key={room.id_ruangan} value={room.id_ruangan}>
                  {room.nama_ruangan} ({room.id_ruangan})
                </option>
              ))
            )}
          </select>
        </div>
      </div>

      {/* MISSING MASTER RUANGAN WARNING */}
      {(!masterRuangan || masterRuangan.length === 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 sm:p-5 flex items-start gap-3 text-amber-800 text-xs sm:text-sm">
          <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block text-sm">Data Master Ruangan belum tersedia.</span>
            Pastikan tab <strong className="font-semibold">"Master Ruangan"</strong> sudah terhubung pada spreadsheet Google Sheets Anda dan lakukan <strong className="font-semibold">Refresh Data</strong> pada menu navigasi.
          </div>
        </div>
      )}

      {/* SELECTED ROOM METADATA BANNER & WEEK CONTROLLER */}
      {currentRoomObj && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          
          {/* Metadata Card */}
          <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-base sm:text-lg font-bold text-slate-900">{currentRoomObj.nama_ruangan}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  ID: {currentRoomObj.id_ruangan}
                </span>
                {currentRoomObj.status && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    currentRoomObj.status.toLowerCase() === "aktif"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-red-50 text-red-700 border-red-200"
                  }`}>
                    {currentRoomObj.status}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                {currentRoomObj.lokasi && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    {currentRoomObj.lokasi}
                  </span>
                )}
                {currentRoomObj.jenis && (
                  <span className="flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5 text-slate-400" />
                    {currentRoomObj.jenis}
                  </span>
                )}
                {currentRoomObj.kapasitas ? (
                  <span className="flex items-center gap-1 font-medium text-slate-700">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    Kapasitas: {currentRoomObj.kapasitas} siswa
                  </span>
                ) : null}
              </div>
            </div>

            {/* Quick Summary Badge */}
            <div className="flex items-center gap-3 border-l border-slate-100 pl-4">
              <div className="text-right">
                <span className="text-xs text-slate-400 font-medium block">Total Pemakaian</span>
                <span className="text-lg font-bold text-slate-800">{totalWeeklySlots} Slot / Minggu</span>
              </div>
            </div>
          </div>

          {/* Week Selector Controller Card */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-center items-center gap-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <CalendarDays className="w-4 h-4 text-blue-600" />
              Minggu Pembelajaran
            </span>
            <div className="flex items-center gap-2 w-full justify-between">
              <button
                onClick={() => setWeekOffset(prev => prev - 1)}
                className="p-1.5 sm:px-2 py-1 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 text-xs font-semibold flex items-center gap-1 transition-all"
                title="Minggu Sebelumnya"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Sebelumnya</span>
              </button>

              <div className="text-center">
                <span className="text-xs sm:text-sm font-extrabold text-slate-800 block">
                  {weekRangeText}
                </span>
                {weekOffset !== 0 && (
                  <button
                    onClick={() => setWeekOffset(0)}
                    className="text-[10px] font-bold text-blue-600 hover:underline mt-0.5"
                  >
                    Kembali ke Minggu Ini
                  </button>
                )}
              </div>

              <button
                onClick={() => setWeekOffset(prev => prev + 1)}
                className="p-1.5 sm:px-2 py-1 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 text-xs font-semibold flex items-center gap-1 transition-all"
                title="Minggu Berikutnya"
              >
                <span className="hidden sm:inline">Berikutnya</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

        </div>
      )}

      {canEditRooms && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-xs text-indigo-900">
        <div><strong>Edit ruangan hanya untuk minggu terpilih.</strong> Perubahan disimpan sebagai insidental per tanggal, tidak mengubah master. Slot kosong dapat dipakai untuk memindahkan kelas yang sudah terjadwal atau menambah sesi baru.</div>
        <button onClick={() => setRoomEditMode((value) => !value)} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 font-black ${roomEditMode ? "bg-indigo-700 text-white" : "border border-indigo-300 bg-white text-indigo-700"}`}><Pencil className="h-4 w-4" />{roomEditMode ? "✓ Mode edit aktif" : "Edit Ruangan Minggu Ini"}</button>
      </div>}

      {/* ROOM CONFLICT WARNING BANNER */}
      {totalConflicts > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3 text-red-900 text-xs sm:text-sm animate-pulse">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <strong className="font-bold text-sm block">⚠️ Konflik Penggunaan Ruangan!</strong>
            Terdapat <span className="font-extrabold underline">{totalConflicts} slot</span> jam pembelajaran di mana ruangan ini diperebutkan oleh lebih dari satu kelas pada waktu bersamaan. Periksa slot berwarna merah di bawah ini.
          </div>
        </div>
      )}

      {/* UNKNOWN ROOM IDS NOTICE */}
      {unknownRoomIds.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-800 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            <strong>Catatan Audit:</strong> Ditemukan ID ruangan tidak terdaftar di Master Ruangan:{" "}
            <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono font-bold text-amber-900">
              {unknownRoomIds.join(", ")}
            </code>
          </span>
        </div>
      )}

      {/* MAIN WEEKLY GRID SCHEDULE TABLE (DESKTOP) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse table-fixed min-w-[980px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 text-xs uppercase font-extrabold tracking-wider">
                <th className="p-3 w-32 min-w-[128px] max-w-[128px] border-r border-slate-200 text-center bg-slate-100/70">
                  Jam Ke (JP)
                </th>
                {weekDays.map(d => (
                  <th key={d.dateStr} className="p-3 border-r border-slate-200 last:border-r-0 w-[170px] min-w-[170px] max-w-[170px]">
                    <div className="flex flex-col text-center">
                      <span className="text-sm font-extrabold text-slate-900">{d.name}</span>
                      <span className="text-[11px] font-medium text-slate-500 lowercase">
                        {d.displayDate}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {[0, 1, 2, 3, 4, 5, 6].map(jam => {
                const timeDefault = DEFAULT_JAM_TIMES[jam];

                return (
                  <tr key={jam} className="hover:bg-slate-50/50 transition-colors">
                    {/* Time Column */}
                    <td className="p-2 border-r border-slate-200 bg-slate-50/50 text-center font-bold text-slate-700 align-middle w-28 min-w-[112px] max-w-[112px] h-[96px]">
                      <span className="block text-xs font-black text-slate-800">
                        {timeDefault.label}
                      </span>
                    </td>

                    {/* Day Columns - FIXED DIMENSIONS */}
                    {weekDays.map(dayInfo => {
                      const usages = scheduleGrid[dayInfo.dateStr]?.[jam] || [];
                      let isConflict = false;
                      let isCombined = false;

                      ({ conflict: isConflict, combined: isCombined } = classifyRoomOccupancy(usages));

                      const handleOpenCellDetail = () => {
                        if (roomEditMode && canEditRooms) {
                          setEditingRoomSlot({ date: dayInfo.dateStr, period: jam, initialClass: usages[0]?.kelas });
                          return;
                        }
                        setCellDetailModal({
                          dayName: dayInfo.name,
                          dateStr: dayInfo.dateStr,
                          displayDate: dayInfo.displayDate,
                          jamLabel: timeDefault.label,
                          jamKe: jam,
                          usages,
                          isConflict,
                          isCombined
                        });
                      };

                      return (
                        <td 
                          key={dayInfo.dateStr} 
                          onClick={handleOpenCellDetail}
                          className={`p-1.5 border-r border-slate-200 last:border-r-0 align-top transition-all cursor-pointer hover:bg-blue-50/40 w-[170px] min-w-[170px] max-w-[170px] h-[96px] max-h-[96px] overflow-hidden select-none ${
                            isConflict 
                              ? "bg-red-50/70 hover:bg-red-100/80" 
                              : isCombined
                                ? "bg-emerald-50/50 hover:bg-emerald-100/80"
                                : usages.length > 0 
                                  ? "bg-white" 
                                  : "bg-slate-50/20"
                          }`}
                        >
                          {usages.length === 0 ? (
                            <div className="h-full w-full flex flex-col items-center justify-center p-1.5 rounded-xl border border-dashed border-slate-200 text-slate-300 hover:text-blue-600 hover:border-blue-300 transition-all text-xs font-medium italic group">
                              <span>Kosong</span>
                              <span className="text-[9px] text-blue-600 font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                                🔍 Klik detail
                              </span>
                            </div>
                          ) : usages.length === 1 ? (
                            (() => {
                              const u = usages[0];
                              const isItemCombined = isCombined || isCombinedClassValue(u.kelasgabung);
                              return (
                                <div 
                                  className={`h-full w-full p-2 rounded-xl border shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between overflow-hidden ${
                                    u.source === "Insidental"
                                      ? "bg-indigo-50/90 border-indigo-200 text-indigo-950"
                                      : "bg-blue-50/90 border-blue-200 text-blue-950"
                                  }`}
                                >
                                  {/* Badge Header */}
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="font-black text-xs tracking-tight text-slate-900 truncate">
                                      {u.kelas}
                                    </span>
                                    <span className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded border shrink-0 ${
                                      u.source === "Insidental"
                                        ? "bg-indigo-100 text-indigo-800 border-indigo-300"
                                        : "bg-blue-100 text-blue-800 border-blue-300"
                                    }`}>
                                      {u.source === "Insidental" ? "Insidental" : "Reguler"}
                                    </span>
                                  </div>

                                  {/* Subject */}
                                  <div className="font-bold text-[11px] text-slate-800 truncate" title={u.mapel}>
                                    {u.mapel}
                                  </div>

                                  {u.source === "Insidental" && u.mulai && u.selesai && <span className="text-[10px] font-bold text-indigo-700">{u.mulai}–{u.selesai}</span>}
                                  {/* Teacher */}
                                  <div className="flex items-center justify-between text-[10px] text-slate-600 font-medium truncate">
                                    <span className="truncate" title={u.guru}>{u.guru || "-"}</span>
                                    {isItemCombined && (
                                      <span className="text-[9px] font-extrabold text-emerald-800 bg-emerald-100 px-1 rounded border border-emerald-200 shrink-0">
                                        Gabung
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })()
                          ) : (
                            /* Multiple usages (Conflict or Combined) */
                            <div 
                              className={`h-full w-full p-2 rounded-xl border shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between overflow-hidden ${
                                isConflict
                                  ? "bg-red-100/90 border-red-300 text-red-950"
                                  : "bg-emerald-100/90 border-emerald-300 text-emerald-950"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${
                                  isConflict ? "bg-red-600 text-white" : "bg-emerald-700 text-white"
                                }`}>
                                  {isConflict ? "⚠️ KONFLIK" : "✅ GABUNGAN"}
                                </span>
                                <span className="text-[10px] font-extrabold text-slate-800">
                                  {usages.length} Kelas
                                </span>
                              </div>

                              <div className="text-[11px] font-black text-slate-900 truncate">
                                {usages.map(u => u.kelas).join(" + ")}
                              </div>

                              <div className="text-[10px] font-semibold text-slate-700 truncate">
                                {usages[0]?.mapel || "Klik untuk detail"}
                              </div>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MOBILE STACKED VIEW PER DAY */}
      <div className="space-y-4 md:hidden">
        {weekDays.map(dayInfo => {
          return (
            <div key={dayInfo.dateStr} className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="bg-slate-100 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <span className="font-extrabold text-sm text-slate-900">{dayInfo.name}</span>
                <span className="text-xs text-slate-500 font-medium">{dayInfo.displayDate}</span>
              </div>

              <div className="p-3 divide-y divide-slate-100">
                {[0, 1, 2, 3, 4, 5, 6].map(jam => {
                  const usages = scheduleGrid[dayInfo.dateStr]?.[jam] || [];
                  const timeDefault = DEFAULT_JAM_TIMES[jam];
                  let isConflict = false;
                  let isCombined = false;

                  ({ conflict: isConflict, combined: isCombined } = classifyRoomOccupancy(usages));

                  const handleOpenCellDetail = () => {
                    if (roomEditMode && canEditRooms) {
                      setEditingRoomSlot({ date: dayInfo.dateStr, period: jam, initialClass: usages[0]?.kelas });
                      return;
                    }
                    setCellDetailModal({
                      dayName: dayInfo.name,
                      dateStr: dayInfo.dateStr,
                      displayDate: dayInfo.displayDate,
                      jamLabel: timeDefault.label,
                      jamKe: jam,
                      usages,
                      isConflict,
                      isCombined
                    });
                  };

                  return (
                    <div 
                      key={jam} 
                      onClick={handleOpenCellDetail}
                      className="py-2.5 first:pt-0 last:pb-0 cursor-pointer hover:bg-slate-50 p-2 rounded-xl transition-colors"
                    >
                      <div className="mb-1 text-xs font-bold text-slate-700 flex items-center justify-between">
                        <span>{timeDefault.label}</span>
                        <span className="text-[10px] text-blue-600 font-semibold">Detail 🔍</span>
                      </div>

                      {usages.length === 0 ? (
                        <div className="text-xs text-slate-400 italic py-1">Kosong</div>
                      ) : (
                        <div className="space-y-2 mt-1">
                          {usages.map((u, idx) => {
                            const isItemCombined = isCombined || isCombinedClassValue(u.kelasgabung);
                            return (
                              <div 
                                key={u.id || idx}
                                className={`p-2.5 rounded-xl border ${
                                  isConflict
                                    ? "bg-red-50 border-red-300 text-red-950"
                                    : isCombined
                                      ? "bg-emerald-50 border-emerald-200 text-emerald-950"
                                      : u.source === "Insidental"
                                        ? "bg-indigo-50 border-indigo-200 text-indigo-950"
                                        : "bg-blue-50 border-blue-200 text-blue-950"
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-black text-xs text-slate-900">{u.kelas}</span>
                                  <div className="flex items-center gap-1">
                                    {isConflict ? (
                                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-red-600 text-white">Konflik</span>
                                    ) : (
                                      <>
                                        {isItemCombined && (
                                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                                            ✅ Gabungan
                                          </span>
                                        )}
                                        <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-white/80 border border-slate-200 text-slate-700">
                                          {u.source}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                                <div className="font-bold text-xs mt-0.5 text-slate-800">{u.mapel}</div>
                                {u.source === "Insidental" && u.mulai && u.selesai && <div className="text-[11px] font-semibold text-indigo-700">Pukul {u.mulai}–{u.selesai}</div>}
                                {u.guru && <div className="text-[11px] text-slate-600 font-medium">{u.guru}</div>}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {editingRoomSlot && <WeeklyRoomEditor
        date={editingRoomSlot.date}
        period={editingRoomSlot.period}
        initialRoomId={selectedRoomId}
        initialClass={editingRoomSlot.initialClass}
        schedules={schedules}
        incidentals={jadwalInsidental}
        calendar={kalenderAkademik}
        rooms={masterRuangan}
        onChanged={onChanged}
        onClose={() => setEditingRoomSlot(null)}
      />}

      {/* CELL DETAIL POP-UP MODAL */}
      {cellDetailModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setCellDetailModal(null)}
        >
          <div 
            className="bg-white rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-5 flex items-start justify-between gap-3 relative">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30 font-bold text-xs">
                    {currentRoomObj?.id_ruangan || selectedRoomId}
                  </span>
                  {currentRoomObj?.kapasitas ? (
                    <span className="text-xs text-slate-300 font-medium">
                      Kapasitas: {currentRoomObj.kapasitas} Siswa
                    </span>
                  ) : null}
                </div>
                <h2 className="text-xl font-black tracking-tight text-white">
                  {currentRoomObj?.nama_ruangan || selectedRoomId}
                </h2>
                {currentRoomObj && (
                  <p className="text-xs text-slate-300 flex items-center gap-1.5 pt-0.5">
                    <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span>
                      {[currentRoomObj.lokasi, currentRoomObj.gedung, currentRoomObj.lantai].filter(Boolean).join(" • ") || "Lokasi Gedung / Lantai belum diisi"}
                    </span>
                  </p>
                )}
              </div>

              <button
                onClick={() => setCellDetailModal(null)}
                className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                title="Tutup"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Time & Day Header Banner */}
            <div className="bg-slate-100 px-5 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700 font-bold">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-blue-600 shrink-0" />
                <span>{cellDetailModal.dayName}, {cellDetailModal.displayDate}</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-800 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
                <Clock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>
                  {cellDetailModal.jamLabel}
                </span>
              </div>
            </div>

            {/* Modal Body Content */}
            <div className="p-5 overflow-y-auto space-y-4">
              {cellDetailModal.usages.length === 0 ? (
                <div className="py-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
                  <p className="text-sm font-bold text-slate-800">Ruangan Kosong (Tersedia)</p>
                  <p className="text-xs text-slate-500 max-w-xs mx-auto">
                    Tidak ada jadwal kegiatan atau kelas pembelajaran yang menggunakan ruangan ini pada {cellDetailModal.jamLabel}.
                  </p>
                </div>
              ) : (
                <>
                  {/* Conflict Notice Banner */}
                  {cellDetailModal.isConflict && (
                    <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-900 flex items-start gap-2.5">
                      <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                      <div>
                        <strong className="font-extrabold block text-red-950 text-sm">⚠️ Konflik Penggunaan Ruangan!</strong>
                        Terdapat {cellDetailModal.usages.length} kelas atau kegiatan yang terdaftar menggunakan ruangan ini secara bersamaan pada JP ini. Silakan atur relokasi atau penyesuaian jadwal.
                      </div>
                    </div>
                  )}

                  {/* Combined Class Notice Banner */}
                  {cellDetailModal.isCombined && (
                    <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-900 flex items-start gap-2.5">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <strong className="font-extrabold block text-emerald-950 text-sm">✅ Penggunaan Kelas Gabungan</strong>
                        Ruangan ini digunakan bersama oleh beberapa rombel/kelas dalam sesi pembelajaran gabungan.
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                      Rincian Kelas & Pengampu ({cellDetailModal.usages.length})
                    </span>

                    {cellDetailModal.usages.map((u, idx) => (
                      <div 
                        key={u.id || idx}
                        className={`p-4 rounded-2xl border shadow-2xs space-y-3 ${
                          cellDetailModal.isConflict
                            ? "bg-red-50/90 border-red-200"
                            : cellDetailModal.isCombined
                              ? "bg-emerald-50/90 border-emerald-200"
                              : u.source === "Insidental"
                                ? "bg-indigo-50/90 border-indigo-200"
                                : "bg-blue-50/90 border-blue-200"
                        }`}
                      >
                        {/* Header Badge */}
                        <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 pb-2.5">
                          <div>
                            <span className="text-[10px] font-extrabold text-slate-400 uppercase block">Rombel / Kelas</span>
                            <span className="text-base font-black text-slate-900">{u.kelas}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {isCombinedClassValue(u.kelasgabung) && (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300">
                                ✅ Gabungan
                              </span>
                            )}
                            <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md border ${
                              u.source === "Insidental"
                                ? "bg-indigo-100 text-indigo-800 border-indigo-300"
                                : "bg-blue-100 text-blue-800 border-blue-300"
                            }`}>
                              {u.source}
                            </span>
                          </div>
                        </div>

                        {/* Details */}
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <span className="text-[10px] font-bold text-slate-500 uppercase block">Mata Pelajaran</span>
                            <span className="font-extrabold text-slate-800 text-xs sm:text-sm">{u.mapel || "-"}</span>
                            {u.mulai && u.selesai && <span className="block text-xs text-indigo-700 font-bold">Pukul {u.mulai}–{u.selesai}</span>}
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-slate-500 uppercase block">Guru Pengajar</span>
                            <span className="font-bold text-slate-800 text-xs sm:text-sm">{u.guru || "-"}</span>
                          </div>
                        </div>

                        {/* Additional Reason Note */}
                        {u.alasan && (
                          <div className="text-xs bg-white/90 p-2.5 rounded-xl border border-indigo-100 text-indigo-950 shadow-2xs">
                            <span className="font-bold text-indigo-900 block text-[11px]">💡 Catatan / Alasan:</span>
                            <span className="italic">{u.alasan}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 px-5 py-3 border-t border-slate-200 flex justify-end gap-2">
              {canEditRooms && <button onClick={() => {
                setEditingRoomSlot({ date: cellDetailModal.dateStr, period: cellDetailModal.jamKe, initialClass: cellDetailModal.usages[0]?.kelas });
                setCellDetailModal(null);
              }} className="inline-flex items-center gap-1 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-black text-white"><Pencil className="h-4 w-4" /> Edit Ruangan</button>}
              <button
                onClick={() => setCellDetailModal(null)}
                className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-all shadow-2xs active:scale-95"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
