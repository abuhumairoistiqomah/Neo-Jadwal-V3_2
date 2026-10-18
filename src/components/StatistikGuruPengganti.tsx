import React, { useState, useMemo } from "react";
import { LogIzinItem } from "../types";
import { 
  ArrowLeft, BarChart3, Award, HelpCircle, Users, 
  Activity, Heart, AlertCircle, CalendarRange, Filter, RotateCcw, Calendar 
} from "lucide-react";

import { T } from '../i18n/LanguageProvider';
interface StatistikGuruPenggantiProps {
  logs: LogIzinItem[];
  onBack: () => void;
}

// Helper functions for date range presets
const getTodayStr = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getThisWeekRange = () => {
  const d = new Date();
  const dayOfWeek = d.getDay(); // 0 is Sun, 1 is Mon...
  const distanceToMon = (dayOfWeek + 6) % 7;
  const monday = new Date(d);
  monday.setDate(d.getDate() - distanceToMon);
  
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const format = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  return { start: format(monday), end: format(sunday) };
};

const getThisMonthRange = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const lastDay = new Date(y, d.getMonth() + 1, 0).getDate();
  const lastDayStr = String(lastDay).padStart(2, "0");
  return { start: `${y}-${m}-01`, end: `${y}-${m}-${lastDayStr}` };
};

const formatIndoDateShort = (dateStr: string) => {
  if (!dateStr) return "";
  const parts = dateStr.split("-").map(Number);
  if (parts.length !== 3) return dateStr;
  const [year, month, day] = parts;
  const d = new Date(year, month - 1, day);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
};

export const StatistikGuruPengganti: React.FC<StatistikGuruPenggantiProps> = ({
  logs,
  onBack,
}) => {
  // Date Range Filter States
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [preset, setPreset] = useState<"all" | "today" | "this_week" | "this_month" | "custom">("all");

  // Filter logs based on date range
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      if (!log.tanggal) return true;
      if (startDate && log.tanggal < startDate) return false;
      if (endDate && log.tanggal > endDate) return false;
      return true;
    });
  }, [logs, startDate, endDate]);

  // Total JP tergantikan in filtered period
  const totalJPReplaced = filteredLogs.length;

  // Handle preset clicks
  const handleSelectPreset = (newPreset: "all" | "today" | "this_week" | "this_month") => {
    setPreset(newPreset);
    if (newPreset === "all") {
      setStartDate("");
      setEndDate("");
    } else if (newPreset === "today") {
      const today = getTodayStr();
      setStartDate(today);
      setEndDate(today);
    } else if (newPreset === "this_week") {
      const { start, end } = getThisWeekRange();
      setStartDate(start);
      setEndDate(end);
    } else if (newPreset === "this_month") {
      const { start, end } = getThisMonthRange();
      setStartDate(start);
      setEndDate(end);
    }
  };

  const handleStartDateChange = (val: string) => {
    setStartDate(val);
    setPreset("custom");
  };

  const handleEndDateChange = (val: string) => {
    setEndDate(val);
    setPreset("custom");
  };

  const handleResetFilter = () => {
    setStartDate("");
    setEndDate("");
    setPreset("all");
  };

  // Group stats
  const stats = useMemo(() => {
    const guruIzinCounts: Record<string, number> = {};
    const guruPenggantiCounts: Record<string, number> = {};
    const alasanCounts: Record<string, number> = {};

    filteredLogs.forEach(log => {
      // Guru Izin
      guruIzinCounts[log.guru_izin] = (guruIzinCounts[log.guru_izin] || 0) + 1;
      
      // Guru Pengganti
      guruPenggantiCounts[log.guru_pengganti] = (guruPenggantiCounts[log.guru_pengganti] || 0) + 1;
      
      // Alasan (Normalize a bit by grabbing main reason before parentheses if any)
      const cleanAlasan = log.alasan.split("(")[0].trim();
      alasanCounts[cleanAlasan] = (alasanCounts[cleanAlasan] || 0) + 1;
    });

    // Convert and sort
    const topIzin = Object.entries(guruIzinCounts)
      .map(([nama, count]) => ({ nama, count }))
      .sort((a, b) => b.count - a.count);

    const topPengganti = Object.entries(guruPenggantiCounts)
      .map(([nama, count]) => ({ nama, count }))
      .sort((a, b) => b.count - a.count);

    const topAlasan = Object.entries(alasanCounts)
      .map(([alasan, count]) => ({ alasan, count }))
      .sort((a, b) => b.count - a.count);

    return {
      topIzin,
      topPengganti,
      topAlasan,
      allGuruIzinNames: Object.keys(guruIzinCounts)
    };
  }, [filteredLogs]);

  // Max counts for relative bar widths in our custom bar charts
  const maxIzinCount = stats.topIzin[0]?.count || 1;
  const maxPenggantiCount = stats.topPengganti[0]?.count || 1;
  const maxAlasanCount = stats.topAlasan[0]?.count || 1;

  const isFiltered = Boolean(startDate || endDate);

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <button
          id="back-to-dashboard-btn"
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-indigo-600 bg-white px-4 py-2 rounded-xl border border-gray-100 hover:border-indigo-100 shadow-sm transition-all self-start cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <T>{"Kembali ke Dashboard"}</T>
        </button>

        <span className="text-sm font-semibold text-gray-400 flex items-center gap-1.5">
          <BarChart3 className="w-4 h-4 text-indigo-500" />
          Dashboard Analitik Guru Pengganti
        </span>
      </div>

      {/* Filter Rentang Tanggal Box */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Filter className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-base font-bold text-gray-800">Filter Rentang Tanggal</h3>
              <p className="text-xs text-gray-500">
                Pilih periode tanggal untuk memperbarui data statistik guru pengganti
              </p>
            </div>
          </div>

          {/* Preset Buttons */}
          <div className="flex flex-wrap gap-1.5 items-center">
            <button
              id="btn-preset-all"
              onClick={() => handleSelectPreset("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                preset === "all"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Semua Waktu
            </button>
            <button
              id="btn-preset-today"
              onClick={() => handleSelectPreset("today")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                preset === "today"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Hari Ini
            </button>
            <button
              id="btn-preset-this-week"
              onClick={() => handleSelectPreset("this_week")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                preset === "this_week"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Minggu Ini
            </button>
            <button
              id="btn-preset-this-month"
              onClick={() => handleSelectPreset("this_month")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                preset === "this_month"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Bulan Ini
            </button>
          </div>
        </div>

        {/* Date Inputs & Status Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label htmlFor="filter-start-date" className="text-xs font-semibold text-gray-500 whitespace-nowrap">
                Dari:
              </label>
              <input
                id="filter-start-date"
                type="date"
                value={startDate}
                onChange={(e) => handleStartDateChange(e.target.value)}
                className="bg-slate-50 border border-gray-200 text-gray-800 text-xs font-bold py-2 px-3 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none transition-all cursor-pointer shadow-2xs"
              />
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="filter-end-date" className="text-xs font-semibold text-gray-500 whitespace-nowrap">
                Sampai:
              </label>
              <input
                id="filter-end-date"
                type="date"
                value={endDate}
                onChange={(e) => handleEndDateChange(e.target.value)}
                className="bg-slate-50 border border-gray-200 text-gray-800 text-xs font-bold py-2 px-3 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none transition-all cursor-pointer shadow-2xs"
              />
            </div>

            {isFiltered && (
              <button
                id="btn-reset-date-filter"
                onClick={handleResetFilter}
                className="flex items-center gap-1 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 px-3 py-2 rounded-xl transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset Filter
              </button>
            )}
          </div>

          {/* Filter Status Badge */}
          <div className="text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl flex items-center gap-2 self-start sm:self-auto">
            <Calendar className="w-4 h-4 text-indigo-500 shrink-0" />
            <span>
              {startDate || endDate ? (
                <>
                  Rentang: <strong className="text-indigo-900">{startDate ? formatIndoDateShort(startDate) : "Awal"}</strong> s/d <strong className="text-indigo-900">{endDate ? formatIndoDateShort(endDate) : "Sekarang"}</strong> ({filteredLogs.length} dari {logs.length} data)
                </>
              ) : (
                <>Menampilkan semua data ({logs.length} data terekam)</>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        
        {/* Card 1: Total JP Replaced */}
        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm flex items-center gap-5">
          <div className="p-4 bg-indigo-50 text-indigo-600 rounded-2xl">
            <CalendarRange className="w-8 h-8" />
          </div>
          <div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Total JP Tergantikan</span>
            <span className="text-3xl font-black text-indigo-600 mt-1 block">{totalJPReplaced} <T>{"JP"}</T></span>
            <span className="text-[11px] text-gray-400 font-semibold block mt-0.5">
              {isFiltered ? "Periode Terfilter" : "Semester Berjalan"}
            </span>
          </div>
        </div>

        {/* Card 2: Teachers who have asked for leave */}
        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm flex items-center gap-5">
          <div className="p-4 bg-rose-50 text-rose-600 rounded-2xl">
            <Users className="w-8 h-8" />
          </div>
          <div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Guru Pernah Izin</span>
            <span className="text-3xl font-black text-rose-600 mt-1 block">{stats.allGuruIzinNames.length} Guru</span>
            <span className="text-[11px] text-gray-400 font-semibold block mt-0.5">Pernah berhalangan hadir</span>
          </div>
        </div>

        {/* Card 3: Top Hero Substitution count */}
        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm flex items-center gap-5 sm:col-span-2 lg:col-span-1">
          <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl">
            <Award className="w-8 h-8" />
          </div>
          <div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Pahlawan Inval Teratas</span>
            <span className="text-lg font-black text-emerald-700 mt-1.5 block truncate max-w-[200px]">
              {stats.topPengganti[0]?.nama || "-"}
            </span>
            <span className="text-xs text-emerald-600 font-bold block mt-0.5">
              {stats.topPengganti[0] ? `Berkontribusi ${stats.topPengganti[0].count} JP` : "Belum ada penggantian"}
            </span>
          </div>
        </div>

      </div>

      {/* Analytical Detail Grids */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Box 1: TOP 10 PAHLAWAN (Guru Pengganti Paling Sering) */}
        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
          <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-500" />
            Top 10 Pahlawan Inval (Guru Pengganti Teraktif)
          </h3>
          <p className="text-xs text-gray-500 mb-5">
            Daftar guru yang paling sering bersedia menggantikan kelas kosong rekan lainnya demi menjaga kestabilan kegiatan belajar siswa.
          </p>

          {stats.topPengganti.length > 0 ? (
            <div className="space-y-4">
              {stats.topPengganti.slice(0, 10).map((hero, index) => {
                const percentage = (hero.count / maxPenggantiCount) * 100;
                return (
                  <div key={hero.nama} className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2">
                        <span className={`w-5 h-5 rounded-md flex items-center justify-center font-extrabold text-[10px] ${
                          index === 0 
                            ? "bg-amber-100 text-amber-800" 
                            : index === 1 
                              ? "bg-slate-100 text-slate-800" 
                              : "bg-gray-100 text-gray-600"
                        }`}>
                          {index + 1}
                        </span>
                        <span className="font-bold text-gray-700 truncate max-w-[200px] sm:max-w-xs">{hero.nama}</span>
                      </div>
                      <span className="font-black text-emerald-600 shrink-0">{hero.count} <T>{"JP"}</T></span>
                    </div>
                    {/* Visual Meter bar */}
                    <div className="h-2 w-full bg-gray-50 rounded-full overflow-hidden">
                      <div 
                        style={{ width: `${percentage}%` }}
                        className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-gray-400 italic">
              Belum ada data penggantian terekam pada periode ini.
            </div>
          )}
        </div>

        {/* Box 2: TOP 10 GURU PALING SERING IZIN */}
        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
          <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-rose-500" />
            Top 10 Guru Paling Sering Izin (Berhalangan)
          </h3>
          <p className="text-xs text-gray-500 mb-5">
            Statistik frekuensi ketidakhadiran guru yang membutuhkan penunjukan guru inval selama periode terpilih.
          </p>

          {stats.topIzin.length > 0 ? (
            <div className="space-y-4">
              {stats.topIzin.slice(0, 10).map((item, index) => {
                const percentage = (item.count / maxIzinCount) * 100;
                return (
                  <div key={item.nama} className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 bg-rose-50 text-rose-700 rounded-md flex items-center justify-center font-extrabold text-[10px]">
                          {index + 1}
                        </span>
                        <span className="font-bold text-gray-700 truncate max-w-[200px] sm:max-w-xs">{item.nama}</span>
                      </div>
                      <span className="font-black text-rose-600 shrink-0">{item.count} <T>{"JP"}</T></span>
                    </div>
                    {/* Visual Meter bar */}
                    <div className="h-2 w-full bg-gray-50 rounded-full overflow-hidden">
                      <div 
                        style={{ width: `${percentage}%` }}
                        className="h-full bg-rose-500 rounded-full transition-all duration-500"
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-gray-400 italic">
              Belum ada data izin terekam pada periode ini.
            </div>
          )}
        </div>

        {/* Box 3: TOP ALASAN IZIN */}
        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
          <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Heart className="w-5 h-5 text-indigo-500" />
            Top Alasan Berhalangan Hadir
          </h3>
          <p className="text-xs text-gray-500 mb-5">
            Kategori penyebab utama guru berhalangan mengajar di kelas reguler.
          </p>

          {stats.topAlasan.length > 0 ? (
            <div className="space-y-4">
              {stats.topAlasan.map((item) => {
                const percentage = (item.count / maxAlasanCount) * 100;
                return (
                  <div key={item.alasan} className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-gray-700 truncate max-w-[200px] sm:max-w-xs">{item.alasan}</span>
                      <span className="font-black text-indigo-600 shrink-0">{item.count} kali</span>
                    </div>
                    <div className="h-2 w-full bg-gray-50 rounded-full overflow-hidden">
                      <div 
                        style={{ width: `${percentage}%` }}
                        className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-gray-400 italic">
              Belum ada data terekam pada periode ini.
            </div>
          )}
        </div>

        {/* Box 4: DAFTAR SEMUA GURU YANG PERNAH IZIN */}
        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-gray-500" />
              Daftar Lengkap Guru Pernah Izin
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Semua nama guru yang tercatat pernah mengambil izin minimal 1 JP pada periode ini.
            </p>

            <div className="flex flex-wrap gap-2 max-h-[160px] overflow-y-auto p-1">
              {stats.allGuruIzinNames.length > 0 ? (
                stats.allGuruIzinNames.map((nama) => (
                  <span 
                    key={nama}
                    className="text-[10px] bg-rose-50 text-rose-700 border border-rose-100 font-semibold px-2.5 py-1.5 rounded-lg shadow-sm"
                  >
                    {nama}
                  </span>
                ))
              ) : (
                <div className="text-xs text-gray-400 italic p-4 text-center w-full">
                  Belum ada nama guru terekam berhalangan pada periode ini.
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 p-3 bg-gray-50 rounded-xl border border-gray-100 flex items-center gap-2 text-[10px] text-gray-400 font-medium">
            <AlertCircle className="w-4 h-4 text-gray-400 shrink-0" />
            <span>Statistik ini diperbarui seketika setiap kali Anda menambahkan atau menghapus catatan di modul Input Guru Pengganti.</span>
          </div>
        </div>

      </div>
    </div>
  );
};

