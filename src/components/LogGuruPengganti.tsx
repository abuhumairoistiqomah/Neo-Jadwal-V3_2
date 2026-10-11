import React, { useState, useMemo } from "react";
import { LogIzinItem, Teacher, renderTaskWithLinks } from "../types";
import { 
  ArrowLeft, ClipboardList, Copy, Check, Search, Calendar, 
  Trash2, ShieldAlert, CheckCircle, HelpCircle, Bell, MessageCircle 
} from "lucide-react";
import { JAM_TIME_MAP } from "../constants/schedule";
import { buildSubstituteReminderWhatsappMessage, findTeacherByName } from "../domain/whatsappTemplates";
import { groupSubstituteLogsForBroadcast } from "../domain/inval/broadcastGrouping";

interface LogGuruPenggantiProps {
  logs: LogIzinItem[];
  teachers?: Teacher[];
  onDeleteLog?: (id: string) => void;
  onBack: () => void;
}

// Safely format date YYYY-MM-DD into Indonesian string
const formatIndoDate = (dateStr: string) => {
  if (!dateStr) return "";
  const parts = dateStr.split("-").map(Number);
  if (parts.length !== 3) return dateStr;
  const [year, month, day] = parts;
  const d = new Date(year, month - 1, day);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
};

export const LogGuruPengganti: React.FC<LogGuruPenggantiProps> = ({
  logs,
  teachers = [],
  onDeleteLog,
  onBack,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedDate, setCopiedDate] = useState<string | null>(null);
  const [copiedIndividualId, setCopiedIndividualId] = useState<string | null>(null);

  // Group logs by Date
  const groupedLogs = useMemo(() => {
    // 1. Filter logs based on search query (guru_izin, guru_pengganti, mapel, kelas)
    const filtered = logs.filter(log => {
      const q = searchQuery.toLowerCase();
      return (
        log.guru_izin.toLowerCase().includes(q) ||
        log.guru_pengganti.toLowerCase().includes(q) ||
        log.mapel.toLowerCase().includes(q) ||
        log.kelas.toLowerCase().includes(q) ||
        log.alasan.toLowerCase().includes(q)
      );
    });

    // 2. Group by date
    const groups: Record<string, LogIzinItem[]> = {};
    filtered.forEach(log => {
      if (!groups[log.tanggal]) {
        groups[log.tanggal] = [];
      }
      groups[log.tanggal].push(log);
    });

    // 3. Convert to array and sort by date descending
    return Object.entries(groups)
      .map(([tanggal, items]) => ({
        tanggal,
        // Sort items in a date by jam_ke ascending
        items: items.sort((a, b) => a.jam_ke - b.jam_ke)
      }))
      .sort((a, b) => b.tanggal.localeCompare(a.tanggal));
  }, [logs, searchQuery]);

  // Generate WhatsApp text format for a specific date and copy to clipboard (Broadcast)
  const handleCopyWA = (tanggal: string, items: LogIzinItem[]) => {
    // Format date beautifully Indonesian style
    const dateFormatted = formatIndoDate(tanggal);

    let waText = `*Hal: Guru Pengganti*\n\nBismillah. Berikut nama - nama guru pengganti hari *${dateFormatted}*.\nInfo lebih lanjut, buka di situs jadwal digital: https://neojadwalv1.vercel.app/\n\n`;
    
    // Group items by Teacher Izin first so they appear neatly
    const teacherMap: Record<string, LogIzinItem[]> = {};
    items.forEach(item => {
      if (!teacherMap[item.guru_izin]) {
        teacherMap[item.guru_izin] = [];
      }
      teacherMap[item.guru_izin].push(item);
    });

    const teacherSections: string[] = [];

    Object.entries(teacherMap).forEach(([guruIzin, logsList]) => {
      const alasan = logsList[0].alasan;
      let section = `*${guruIzin}* - ${alasan}\n`;
      
      const sessions = groupSubstituteLogsForBroadcast(logsList);
      sessions.forEach((session, index) => {
        const kelas = session.kelasList.join(" + ");
        section += `${index + 1}. *JP ${session.jam_ke}* (*${kelas}* - *${session.mapel}*) digantikan oleh *${session.guru_pengganti}*\n`;
      });
      
      teacherSections.push(section.trimEnd());
    });

    waText += teacherSections.join("\n\n");

    // Copy to clipboard
    navigator.clipboard.writeText(waText).then(() => {
      setCopiedDate(tanggal);
      setTimeout(() => {
        setCopiedDate(null);
      }, 2500);
    });
  };

  const buildIndividualReminder = (log: LogIzinItem) => buildSubstituteReminderWhatsappMessage({
    substituteName: log.guru_pengganti.trim(),
    substituteTeacher: findTeacherByName(teachers, log.guru_pengganti),
    absentTeacherName: log.guru_izin.trim(),
    dateLabel: formatIndoDate(log.tanggal),
    period: log.jam_ke,
    subject: log.mapel.trim(),
    className: log.kelas.trim(),
    task: log.tugas,
  });

  const handleCopyIndividualReminder = (log: LogIzinItem) => {
    navigator.clipboard.writeText(buildIndividualReminder(log)).then(() => {
      setCopiedIndividualId(log.id);
      setTimeout(() => setCopiedIndividualId(null), 2000);
    }).catch((err) => console.error("Gagal menyalin ke clipboard:", err));
  };

  const handleOpenWhatsApp = (log: LogIzinItem) => {
    const teacher = teachers.find((item) => item.nama.trim().toLocaleLowerCase("id-ID") === log.guru_pengganti.trim().toLocaleLowerCase("id-ID"));
    const phone = String(teacher?.whatsapp_e164 || "").replace(/[^0-9]/g, "");
    if (!phone) return;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(buildIndividualReminder(log))}`, "_blank", "noopener,noreferrer");
  };

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

        <span className="text-sm font-semibold text-gray-400 flex items-center gap-1.5">
          <ShieldAlert className="w-4 h-4 text-indigo-500" />
          Menu Khusus Admin (Log Guru Pengganti)
        </span>
      </div>

      {/* Main Container */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        
        {/* Header & Search */}
        <div className="mb-6 pb-6 border-b border-gray-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-indigo-500" />
              Histori Log Guru Pengganti
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Daftar guru pengganti yang pernah dijadwalkan, diurutkan dari tanggal terbaru.
            </p>
          </div>

          <div className="relative w-full md:w-80">
            <div className="relative">
              <input
                id="search-log-input"
                type="text"
                placeholder="Cari guru izin, pengganti, kelas, mapel..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-gray-50 text-sm border border-gray-200 rounded-xl focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
              />
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            </div>
          </div>
        </div>

        {/* Info Banner */}
        <div className="text-xs font-semibold text-indigo-800 bg-indigo-50/75 border border-indigo-100/50 p-4 rounded-xl flex items-start gap-2.5 mb-6">
          <HelpCircle className="w-4.5 h-4.5 text-indigo-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">Fitur WhatsApp Guru Pengganti:</p>
            <p className="text-indigo-700/90 font-medium">
              • <strong>Broadcast Siaran:</strong> Klik <strong>"Salin Format WA"</strong> untuk menyalin draf laporan rekap harian.<br />
              • <strong>Pengingat Individu:</strong> Klik <strong>"🔔 Ingatkan Individu"</strong> pada tiap baris record untuk menyalin pesan pengingat sopan yang ditujukan langsung ke guru pengganti terkait.
            </p>
          </div>
        </div>

        {/* Logs grouped by date */}
        {groupedLogs.length > 0 ? (
          <div className="space-y-8">
            {groupedLogs.map((group) => (
              <div key={group.tanggal} className="space-y-3">
                
                {/* Date Header Group */}
                <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-50 p-3 rounded-xl border border-gray-100">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4.5 h-4.5 text-indigo-500" />
                    <span className="font-bold text-gray-800 text-sm sm:text-base">
                      {formatIndoDate(group.tanggal)}
                    </span>
                    <span className="text-xs bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded-md">
                      {group.items.length} Inval
                    </span>
                  </div>

                  {/* Copy Broadcast Button */}
                  <button
                    id={`copy-wa-${group.tanggal}`}
                    onClick={() => handleCopyWA(group.tanggal, group.items)}
                    className={`flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg transition-all shadow-sm ${
                      copiedDate === group.tanggal
                        ? "bg-emerald-600 text-white"
                        : "bg-white hover:bg-gray-100 text-indigo-600 border border-gray-200 hover:border-indigo-200"
                    }`}
                  >
                    {copiedDate === group.tanggal ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Disalin ke WA Clipboard!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Salin Format WA
                      </>
                    )}
                  </button>
                </div>

                {/* Desktop view table for each group */}
                <div className="hidden md:block overflow-hidden rounded-xl border border-gray-100">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50/50 text-[11px] font-bold text-gray-400 uppercase border-b border-gray-100">
                        <th className="p-3 w-16 text-center">Jam</th>
                        <th className="p-3">Guru Berhalangan</th>
                        <th className="p-3">Alasan</th>
                        <th className="p-3">Mata Pelajaran</th>
                        <th className="p-3">Kelas</th>
                        <th className="p-3">Tugas / Link</th>
                        <th className="p-3">Guru Pengganti (Inval)</th>
                        <th className="p-3 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-xs text-gray-700">
                      {group.items.map((log) => (
                        <tr key={log.id} className="hover:bg-gray-50/30 transition-colors">
                          <td className="p-3 text-center">
                            <span className="bg-indigo-50 text-indigo-800 font-extrabold px-2 py-0.5 rounded">
                              {log.jam_ke}
                            </span>
                          </td>
                          <td className="p-3 font-semibold text-gray-800">{log.guru_izin}</td>
                          <td className="p-3 text-gray-500 italic font-medium">{log.alasan}</td>
                          <td className="p-3 font-medium">{log.mapel}</td>
                          <td className="p-3 font-bold text-gray-800">{log.kelas}</td>
                          <td className="p-3 text-xs max-w-xs">
                            {log.tugas ? (
                              <span className="text-blue-900 font-medium break-words">
                                {renderTaskWithLinks(log.tugas)}
                              </span>
                            ) : (
                              <span className="text-gray-300 italic">-</span>
                            )}
                          </td>
                          <td className="p-3">
                            <span className="font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded">
                              {log.guru_pengganti}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {/* Individual WA Reminder Button */}
                              <button
                                id={`remind-indiv-${log.id}`}
                                onClick={() => handleCopyIndividualReminder(log)}
                                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 border whitespace-nowrap ${
                                  copiedIndividualId === log.id
                                    ? "bg-emerald-600 text-white border-emerald-700"
                                    : "bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200/80 hover:border-amber-300"
                                }`}
                                title="Salin pesan pengingat WA individual"
                              >
                                {copiedIndividualId === log.id ? (
                                  <>
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Pengingat Disalin</span>
                                  </>
                                ) : (
                                  <>
                                    <Bell className="w-3.5 h-3.5 text-amber-600" />
                                    <span>Ingatkan Individu</span>
                                  </>
                                )}
                              </button>

                              {teachers.some((item) => item.nama.trim().toLocaleLowerCase("id-ID") === log.guru_pengganti.trim().toLocaleLowerCase("id-ID") && Boolean(item.whatsapp_e164)) && (
                                <button
                                  onClick={() => handleOpenWhatsApp(log)}
                                  className="px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 border whitespace-nowrap bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200"
                                  title="Buka WhatsApp dengan pesan badal terisi otomatis"
                                >
                                  <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>Buka WhatsApp</span>
                                </button>
                              )}

                              {onDeleteLog && (
                                <button
                                  id={`delete-log-${log.id}`}
                                  onClick={() => onDeleteLog(log.id)}
                                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Hapus log"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile view cards for each group */}
                <div className="block md:hidden space-y-2.5">
                  {group.items.map((log) => (
                    <div key={log.id} className="bg-white border border-gray-100 p-4 rounded-xl space-y-3 shadow-sm">
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <span className="bg-indigo-50 text-indigo-800 font-extrabold text-[10px] px-2 py-0.5 rounded block w-max mb-1">
                            Jam Ke-{log.jam_ke} ({JAM_TIME_MAP[log.jam_ke]})
                          </span>
                          <h4 className="font-bold text-gray-800 text-xs">Izin: {log.guru_izin}</h4>
                          <span className="text-[10px] text-gray-400 italic">Alasan: {log.alasan}</span>
                        </div>

                        {onDeleteLog && (
                          <button
                            id={`delete-log-mob-${log.id}`}
                            onClick={() => onDeleteLog(log.id)}
                            className="p-1 text-gray-300 hover:text-red-500 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {log.tugas && (
                        <div className="p-2 bg-blue-50/70 border border-blue-100 rounded-lg text-[11px] text-blue-950 font-medium">
                          <strong className="text-blue-800 block text-[10px] mb-0.5">📌 Tugas / Link:</strong>
                          <div className="break-words">
                            {renderTaskWithLinks(log.tugas)}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-50/50 text-[10px] text-gray-500">
                        <div>
                          <span className="block text-gray-400">Mapel / Kelas</span>
                          <span className="font-bold text-gray-700">{log.mapel} (Kelas {log.kelas})</span>
                        </div>
                        <div>
                          <span className="block text-emerald-600 font-bold">PENGGANTI (INVAL)</span>
                          <span className="font-bold text-emerald-800">{log.guru_pengganti}</span>
                        </div>
                      </div>

                      {/* Mobile Individual Reminder Button */}
                      <div className="pt-2 border-t border-gray-100 flex justify-end">
                        <button
                          id={`remind-indiv-mob-${log.id}`}
                          onClick={() => handleCopyIndividualReminder(log)}
                          className={`w-full py-2 rounded-lg text-xs font-bold transition-all shadow-2xs flex items-center justify-center gap-1.5 border ${
                            copiedIndividualId === log.id
                              ? "bg-emerald-600 text-white border-emerald-700"
                              : "bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200"
                          }`}
                        >
                          {copiedIndividualId === log.id ? (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>Pengingat Disalin ke Clipboard</span>
                            </>
                          ) : (
                            <>
                              <Bell className="w-3.5 h-3.5 text-amber-600" />
                              <span>Ingatkan Individu</span>
                            </>
                          )}
                        </button>
                        {teachers.some((item) => item.nama.trim().toLocaleLowerCase("id-ID") === log.guru_pengganti.trim().toLocaleLowerCase("id-ID") && Boolean(item.whatsapp_e164)) && (
                          <button
                            onClick={() => handleOpenWhatsApp(log)}
                            className="w-full py-2 rounded-lg text-xs font-bold border bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200 flex items-center justify-center gap-1.5"
                          >
                            <MessageCircle className="w-3.5 h-3.5" /> Buka WhatsApp
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

              </div>
            ))}
          </div>
        ) : (
          <div className="py-12 text-center bg-gray-50 border border-dashed border-gray-200 rounded-2xl">
            <CheckCircle className="w-8 h-8 text-indigo-300 mx-auto mb-2" />
            <p className="font-semibold text-gray-700 text-sm">Belum Ada Log Terdaftar</p>
            <p className="text-xs text-gray-400 mt-1">Data log guru pengganti kosong atau tidak cocok dengan filter pencarian.</p>
          </div>
        )}

      </div>
    </div>
  );
};

