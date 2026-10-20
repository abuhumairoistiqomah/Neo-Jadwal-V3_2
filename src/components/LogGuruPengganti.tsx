import React, { useState, useMemo, useEffect } from "react";
import { LogIzinItem, Teacher, renderTaskWithLinks } from "../types";
import { 
  ArrowLeft, ClipboardList, Copy, Check, Search, Calendar, 
  Trash2, ShieldAlert, CheckCircle, HelpCircle, Bell, MessageCircle, Pencil, X, Loader2 
} from "lucide-react";
import { JAM_TIME_MAP } from "../constants/schedule";
import { buildSubstituteReminderWhatsappMessage, findTeacherByName } from "../domain/whatsappTemplates";
import { groupSubstituteLogsForBroadcast } from "../domain/inval/broadcastGrouping";
import { getPublicScheduleUrl } from "../domain/whatsappPublicUrl";
import { SearchableSelect } from "./ui/SearchableSelect";
import { getSchoolTodayISO } from "../domain/date";
import { partitionSubstituteHistory } from "../domain/substituteLogVisibility";

import { T } from '../i18n/LanguageProvider';


interface LogGuruPenggantiProps {
  logs: LogIzinItem[];
  teachers?: Teacher[];
  onDeleteLog?: (id: string) => void;
  onReplaceSubstitute?: (log: LogIzinItem, substituteTeacherId: string, constraintIds?: string[], overrideNote?: string) => Promise<void>;
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
  onReplaceSubstitute,
  onBack,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [showPastLogs, setShowPastLogs] = useState(false);
  // Re-evaluate on navigation/remount/refresh; school date is Asia/Jakarta.
  const [schoolToday, setSchoolToday] = useState(() => getSchoolTodayISO());
  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = getSchoolTodayISO();
      setSchoolToday((current) => current === next ? current : next);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const [copiedDate, setCopiedDate] = useState<string | null>(null);
  const [copiedIndividualId, setCopiedIndividualId] = useState<string | null>(null);
  const [editingLog, setEditingLog] = useState<LogIzinItem | null>(null);
  const [newTeacherId, setNewTeacherId] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");
  const [softConstraintIds, setSoftConstraintIds] = useState<string[]>([]);
  const [confirmSoftOverride, setConfirmSoftOverride] = useState(false);
  const [overrideNote, setOverrideNote] = useState("");
  const teacherOptions = useMemo(() => teachers.filter((teacher) => teacher.id).map((teacher) => ({
    value: String(teacher.id), label: teacher.nama,
  })).sort((a, b) => a.label.localeCompare(b.label, "id")), [teachers]);

  const openEditor = (log: LogIzinItem) => {
    const chosen = teachers.find((t) => t.id && (
      t.id === log.substitute_teacher_id || t.nama.trim().toLocaleLowerCase("id-ID") === log.guru_pengganti.trim().toLocaleLowerCase("id-ID")
    ));
    setEditingLog(log);
    setNewTeacherId(String(chosen?.id || ""));
    setEditError("");
    setSoftConstraintIds([]);
    setConfirmSoftOverride(false);
    setOverrideNote("");
  };

  const closeEditor = () => {
    if (savingEdit) return;
    setEditingLog(null);
    setEditError("");
  };

  const saveEditedSubstitute = async () => {
    if (!editingLog || !onReplaceSubstitute || savingEdit) return;
    if (!newTeacherId) { setEditError("Pilih guru pengganti dari daftar."); return; }
    if (newTeacherId === editingLog.substitute_teacher_id ||
      teachers.find((teacher) => teacher.id === newTeacherId)?.nama.trim().toLocaleLowerCase("id-ID") === editingLog.guru_pengganti.trim().toLocaleLowerCase("id-ID")) {
      setEditError("Pilih guru yang berbeda dari pengganti saat ini."); return;
    }
    if (softConstraintIds.length && (!confirmSoftOverride || !overrideNote.trim())) {
      setEditError("Konfirmasi dan tulis alasan override sebelum melanjutkan."); return;
    }
    setSavingEdit(true);
    setEditError("");
    try {
      await onReplaceSubstitute(editingLog, newTeacherId, softConstraintIds,
        softConstraintIds.length ? overrideNote.trim() : undefined);
      setEditingLog(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const match = message.match(/SOFT_SUBSTITUTE_CONSTRAINT_ACK_REQUIRED:\s*([0-9a-f,\s-]+)/i);
      if (match) {
        const ids = match[1].split(",").map((id) => id.trim()).filter(Boolean);
        setSoftConstraintIds(ids);
        setEditError("Guru mempunyai aturan badal yang perlu konfirmasi. Tinjau alasannya sebelum menyimpan ulang.");
      } else {
        setEditError(message);
      }
    } finally {
      setSavingEdit(false);
    }
  };

  const teacherAlreadyAssigned = editingLog ? logs.filter((other) =>
    other.id !== editingLog.id && other.tanggal === editingLog.tanggal &&
    other.jam_ke === editingLog.jam_ke && other.substitute_teacher_id === newTeacherId
  ) : [];


  const visibility = useMemo(() => partitionSubstituteHistory(logs, schoolToday), [logs, schoolToday]);

  // Group only visible logs; historical logs remain intact for audit, editing and WA.
  const groupedLogs = useMemo(() => {
    // 1. Filter logs based on search query (guru_izin, guru_pengganti, mapel, kelas)
    const visibleLogs = showPastLogs ? logs : visibility.currentAndUpcoming;
    const query = searchQuery.trim().toLocaleLowerCase("id-ID");
    const filtered = visibleLogs.filter(log => {
      const q = query;
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
  }, [logs, visibility, searchQuery, showPastLogs]);

  // Generate WhatsApp text format for a specific date and copy to clipboard (Broadcast)
  const handleCopyWA = (tanggal: string, items: LogIzinItem[]) => {
    // Format date beautifully Indonesian style
    const dateFormatted = formatIndoDate(tanggal);

    let waText = `*Hal: Guru Pengganti*\n\nBismillah. Berikut nama - nama guru pengganti hari *${dateFormatted}*.\nInfo lebih lanjut, buka di situs jadwal digital: ${getPublicScheduleUrl()}\n\n`;
    
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
      {editingLog && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/60 p-3"
          role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeEditor(); }}>
          <div role="dialog" aria-modal="true" aria-label="Edit guru badal"
            className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div><h3 className="font-black text-lg text-slate-900">Ganti Guru Badal</h3>
                <p className="text-xs text-slate-500 mt-1">{formatIndoDate(editingLog.tanggal)} • JP {editingLog.jam_ke} • {editingLog.kelas}</p></div>
              <button type="button" aria-label="Tutup edit badal" onClick={closeEditor} disabled={savingEdit}
                className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm space-y-1">
              <p><span className="text-slate-500">Guru izin:</span> <strong>{editingLog.guru_izin}</strong></p>
              <p><span className="text-slate-500">Pengganti sekarang:</span> <strong>{editingLog.guru_pengganti || "Belum ditentukan"}</strong></p>
              <p className="text-xs text-slate-500">Materi tugas, link, tanggal, dan kelas tidak diubah.</p>
            </div>
            <div><label className="block text-sm font-bold mb-1.5">Guru pengganti baru</label>
              <SearchableSelect value={newTeacherId} onChange={(id) => {
                setNewTeacherId(id); setSoftConstraintIds([]); setConfirmSoftOverride(false); setEditError("");
              }} options={teacherOptions} placeholder="Pilih atau ketik nama guru" />
            </div>
            {teacherAlreadyAssigned.length > 0 && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              Perhatian: guru ini sudah ditunjuk sebagai badal pada tanggal/JP sama di {teacherAlreadyAssigned.map((item) => item.kelas).join(", ")}. Periksa apakah satu sesi gabungan atau bentrok nyata.
            </div>}
            {softConstraintIds.length > 0 && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2 text-xs">
              <p className="font-bold text-amber-900">Aturan ketersediaan guru membutuhkan override admin.</p>
              <label className="flex gap-2 items-start text-amber-900"><input type="checkbox" checked={confirmSoftOverride} onChange={(e) => setConfirmSoftOverride(e.target.checked)} /> Saya sudah memeriksa dan menyetujui override.</label>
              <textarea value={overrideNote} onChange={(e) => setOverrideNote(e.target.value)}
                placeholder="Alasan override wajib diisi" className="w-full border rounded-lg p-2" rows={2} />
            </div>}
            {editError && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 break-words">{editError}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={closeEditor} disabled={savingEdit} className="px-4 py-2 border rounded-xl font-semibold"><T>{"Batal"}</T></button>
              <button type="button" onClick={() => void saveEditedSubstitute()} disabled={savingEdit || !newTeacherId}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold disabled:opacity-50 flex gap-2 items-center">
                {savingEdit && <Loader2 className="w-4 h-4 animate-spin" />} Simpan Perubahan
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Back Button */}
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
              Default menampilkan hari ini dan mendatang (Asia/Jakarta). Histori lampau tetap tersimpan dan bisa ditampilkan kembali.
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

        <label className="mb-5 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-700">
          <input type="checkbox" checked={showPastLogs} onChange={(e) => setShowPastLogs(e.target.checked)}
            aria-label="Tampilkan yang sudah lewat" className="h-4 w-4 accent-indigo-600" />
          Tampilkan yang sudah lewat ({visibility.past.length})
        </label>
        {!showPastLogs && visibility.past.length > 0 && <p className="mb-4 text-xs text-slate-500">
          {visibility.past.length} record sebelum {schoolToday} disembunyikan dari tampilan, tidak dihapus dari database.
        </p>}

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
                <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-100">
                  <table className="w-full min-w-[1100px] text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50/50 text-[11px] font-bold text-gray-400 uppercase border-b border-gray-100">
                        <th className="p-3 w-16 text-center">Jam</th>
                        <th className="p-3">Guru Berhalangan</th>
                        <th className="p-3"><T>{"Alasan"}</T></th>
                        <th className="p-3"><T>{"Mata Pelajaran"}</T></th>
                        <th className="p-3">Kelas</th>
                        <th className="p-3">Tugas / Link</th>
                        <th className="p-3">Guru Pengganti (Inval)</th>
                        <th className="sticky right-0 z-10 min-w-[168px] w-[168px] p-2 text-center bg-slate-50 shadow-[-4px_0_8px_-6px_#64748b]">Aksi</th>
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
                          <td className="sticky right-0 z-10 min-w-[168px] w-[168px] p-2 bg-white text-center shadow-[-4px_0_8px_-6px_#64748b]">
                            <div className="flex flex-nowrap items-center justify-center gap-1">
                              {/* Compact icon actions: keep Edit/Delete reachable on narrow laptops */}
                              <button
                                id={`remind-indiv-${log.id}`}
                                onClick={() => handleCopyIndividualReminder(log)}
                                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-all ${
                                  copiedIndividualId === log.id
                                    ? "bg-emerald-600 text-white border-emerald-700"
                                    : "bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200/80 hover:border-amber-300"
                                }`}
                                title="Salin pengingat WA individual" aria-label={`Salin pengingat WA ${log.guru_pengganti}`}
                              >
                                {copiedIndividualId === log.id ? (
                                  <>
                                    <Check className="w-3.5 h-3.5" />
                                    <span className="sr-only">Pengingat Disalin</span>
                                  </>
                                ) : (
                                  <>
                                    <Bell className="w-3.5 h-3.5 text-amber-600" />
                                    <span className="sr-only">Ingatkan Individu</span>
                                  </>
                                )}
                              </button>

                              {teachers.some((item) => item.nama.trim().toLocaleLowerCase("id-ID") === log.guru_pengganti.trim().toLocaleLowerCase("id-ID") && Boolean(item.whatsapp_e164)) && (
                                <button
                                  onClick={() => handleOpenWhatsApp(log)}
                                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100"
                                  title="Buka WhatsApp dengan pesan badal terisi otomatis" aria-label={`Buka WhatsApp ${log.guru_pengganti}`}
                                >
                                  <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                                  <span className="sr-only">Buka WhatsApp</span>
                                </button>
                              )}

                              {onReplaceSubstitute && (
                                <button
                                  id={`edit-badal-${log.id}`}
                                  onClick={() => openEditor(log)}
                                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100"
                                  title="Ganti guru badal tanpa menghapus catatan atau tugas" aria-label={`Edit badal ${log.guru_pengganti}`}
                                ><Pencil className="w-4 h-4" /><span className="sr-only">Edit Badal</span></button>
                              )}
                              {onDeleteLog && (
                                <button
                                  id={`delete-log-${log.id}`}
                                  onClick={() => onDeleteLog(log.id)}
                                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-100 bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                                  title="Batalkan log (soft-delete; audit tetap tersimpan)" aria-label={`Batalkan log badal ${log.id}`}
                                >
                                  <Trash2 className="w-4 h-4" />
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
                            <T>{"Jam Ke-"}</T>{log.jam_ke} ({JAM_TIME_MAP[log.jam_ke]})
                          </span>
                          <h4 className="font-bold text-gray-800 text-xs">Izin: {log.guru_izin}</h4>
                          <span className="text-[10px] text-gray-400 italic">Alasan: {log.alasan}</span>
                        </div>

                        {(onReplaceSubstitute || onDeleteLog) && <div className="flex shrink-0 items-center gap-1">
                          {onReplaceSubstitute && <button id={`edit-badal-mob-${log.id}`} onClick={() => openEditor(log)}
                            title="Edit Badal" aria-label={`Edit badal ${log.guru_pengganti}`}
                            className="flex h-10 w-10 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700">
                            <Pencil className="w-4 h-4" />
                          </button>}
                          {onDeleteLog && <button id={`delete-log-mob-${log.id}`} onClick={() => onDeleteLog(log.id)}
                            title="Batalkan log" aria-label={`Batalkan log badal ${log.id}`}
                            className="flex h-10 w-10 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-600">
                            <Trash2 className="w-4 h-4" />
                          </button>}
                        </div>}
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
                      <div className="pt-2 border-t border-gray-100 flex flex-col sm:flex-row justify-end gap-2">
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
            <p className="font-semibold text-gray-700 text-sm">{!showPastLogs && visibility.past.length > 0 ? 'Tidak ada log aktif pada filter ini' : 'Belum Ada Log Terdaftar'}</p>
            <p className="text-xs text-gray-400 mt-1">{!showPastLogs && visibility.past.length > 0 ? 'Aktifkan “Tampilkan yang sudah lewat” untuk melihat histori.' : 'Data log guru pengganti kosong atau tidak cocok dengan filter pencarian.'}</p>
          </div>
        )}

      </div>
    </div>
  );
};

