import React, { useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Clock3, KeyRound, Link2, MessageCircle, Paperclip, Send, UploadCloud, UserRound } from "lucide-react";
import type { LogIzinItem, Teacher } from "../domain/models";
import { syncTaskResourcesWithText } from "../domain/taskResources";
import { isTaskRecoveryDateActive } from "../domain/date";
import { findStoredTaskAccess, saveStoredTaskAccess, type StoredTaskAccess } from "../domain/taskRecovery";
import { uploadPublicLeaveTaskFile } from "../infrastructure/drive/publicLeaveTaskDriveBridge";
import { PublicLateTaskRepository } from "../infrastructure/repositories/publicLateTaskRepository";
import { buildLateTaskHandoffWhatsappMessage, findTeacherByName, whatsappDigits } from "../domain/whatsappTemplates";

import { T } from '../i18n/LanguageProvider';
interface LateTaskCompletionProps {
  teachers: Teacher[];
  logs: LogIzinItem[];
  selectedTeacher: string;
  setSelectedTeacher: (name: string) => void;
  driveBridgeUrl?: string;
  schoolToday: string;
  onTaskCompleted?: (args: { teacherName: string; scheduleDate: string; period: number; taskText: string }) => void;
  onBack: () => void;
}

interface MissingTaskSession {
  key: string;
  tanggal: string;
  jam_ke: number;
  guru_izin: string;
  guru_pengganti: string;
  kelas: string;
  mapel: string;
}

function norm(value: unknown): string {
  return String(value ?? "").trim().toLocaleLowerCase("id-ID");
}

function formatDate(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function groupMissingTasks(logs: LogIzinItem[], teacherName: string, schoolToday: string): MissingTaskSession[] {
  const teacherKey = norm(teacherName);
  if (!teacherKey) return [];
  const buckets = new Map<string, LogIzinItem[]>();
  for (const log of logs) {
    if (norm(log.guru_izin) !== teacherKey) continue;
    if (!isTaskRecoveryDateActive(log.tanggal, schoolToday)) continue;
    if (!String(log.guru_pengganti || "").trim()) continue;
    if (String(log.tugas || "").trim()) continue;
    const key = [log.tanggal, Number(log.jam_ke), norm(log.guru_pengganti), norm(log.mapel)].join("|");
    const bucket = buckets.get(key) || [];
    bucket.push(log);
    buckets.set(key, bucket);
  }
  return [...buckets.entries()].map(([key, rows]) => ({
    key,
    tanggal: rows[0].tanggal,
    jam_ke: Number(rows[0].jam_ke),
    guru_izin: rows[0].guru_izin,
    guru_pengganti: rows[0].guru_pengganti,
    kelas: [...new Set(rows.map((row) => row.kelas).filter(Boolean))].join(" + "),
    mapel: [...new Set(rows.map((row) => row.mapel).filter(Boolean))].join(" + "),
  })).sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.jam_ke - b.jam_ke);
}

export const LateTaskCompletion: React.FC<LateTaskCompletionProps> = ({
  teachers,
  logs,
  selectedTeacher,
  setSelectedTeacher,
  driveBridgeUrl = "",
  schoolToday,
  onTaskCompleted,
  onBack,
}) => {
  const repository = useMemo(() => new PublicLateTaskRepository(), []);
  const missingSessions = useMemo(() => groupMissingTasks(logs, selectedTeacher, schoolToday), [logs, selectedTeacher, schoolToday]);
  const [activeKey, setActiveKey] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [requestCode, setRequestCode] = useState("");
  const [last4, setLast4] = useState("");
  const [access, setAccess] = useState<StoredTaskAccess | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [completedKeys, setCompletedKeys] = useState<Set<string>>(new Set());

  const active = missingSessions.find((item) => item.key === activeKey) || null;
  const visibleSessions = missingSessions.filter((item) => !completedKeys.has(item.key));

  const openSubstituteWhatsapp = (session: MissingTaskSession) => {
    const substitute = findTeacherByName(teachers, session.guru_pengganti);
    const phone = whatsappDigits(substitute?.whatsapp_e164);
    if (!phone) {
      window.alert(`Nomor WhatsApp ${session.guru_pengganti} belum tersedia di Master Guru.`);
      return;
    }
    const message = buildLateTaskHandoffWhatsappMessage({
      substituteName: session.guru_pengganti,
      substituteTeacher: substitute,
      absentTeacherName: session.guru_izin,
      dateLabel: formatDate(session.tanggal),
      period: session.jam_ke,
      subject: session.mapel,
      className: session.kelas,
    });
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  };

  const selectSession = (session: MissingTaskSession) => {
    setActiveKey(session.key);
    setDescription("");
    setFiles([]);
    setError("");
    setMessage("");
    const stored = findStoredTaskAccess(session.guru_izin, session.tanggal);
    setAccess(stored);
    setRequestCode(stored?.requestCode || "");
    setLast4("");
  };

  const recoverAccess = async () => {
    if (!active) return;
    if (!requestCode.trim()) {
      setError("Masukkan kode pengajuan izin terlebih dahulu.");
      return;
    }
    if (!/^\d{4}$/.test(last4.trim())) {
      setError("Masukkan 4 digit terakhir nomor WhatsApp guru yang terdaftar.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const recovered = await repository.recoverAccess({
        teacherName: active.guru_izin,
        requestCode,
        whatsappLast4: last4,
      });
      const next: StoredTaskAccess = {
        requestCode: recovered.requestCode,
        teacherName: recovered.teacherName,
        scheduleDate: recovered.scheduleDate,
        uploadToken: recovered.uploadToken,
        expiresAt: recovered.expiresAt,
      };
      saveStoredTaskAccess(next);
      setAccess(next);
      setMessage("Akses tugas berhasil dipulihkan. Silakan isi tugas atau upload file.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const submitTask = async () => {
    if (!active || !access) return;
    const resources = syncTaskResourcesWithText(description, []).filter((item) => item.resource_type === "LINK");
    if (!description.trim() && resources.length === 0 && files.length === 0) {
      setError("Isi teks/link tugas atau pilih minimal satu file.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await repository.completeTask({
        requestCode: access.requestCode,
        uploadToken: access.uploadToken,
        period: active.jam_ke,
        description,
        resources,
      });
      const uploadedUrls: string[] = [];
      for (const file of files) {
        const uploaded = await uploadPublicLeaveTaskFile({
          apiUrl: driveBridgeUrl,
          requestCode: access.requestCode,
          uploadToken: access.uploadToken,
          period: active.jam_ke,
          scheduleDate: active.tanggal,
          file,
        });
        if (uploaded.url) uploadedUrls.push(uploaded.url);
      }
      const taskText = [
        description.trim(),
        ...resources.map((resource) => resource.url),
        ...uploadedUrls,
      ].filter(Boolean).filter((value, index, values) => values.indexOf(value) === index).join("\n");
      onTaskCompleted?.({
        teacherName: active.guru_izin,
        scheduleDate: active.tanggal,
        period: active.jam_ke,
        taskText: taskText || "Tugas/material telah dikirim guru pengampu.",
      });
      setCompletedKeys((current) => new Set([...current, active.key]));
      setMessage(`Tugas JP ${active.jam_ke} berhasil dilengkapi dan langsung diteruskan ke data badal.`);
      setDescription("");
      setFiles([]);
      setActiveKey("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const sortedTeachers = [...teachers].filter((t) => t.nama).sort((a, b) => a.nama.localeCompare(b.nama, "id-ID", { sensitivity: "base" }));

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <button type="button" onClick={onBack} className="mt-1 p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-violet-700">V3.12.5 Task Recovery</div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">Lengkapi Tugas Badal</h2>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">Menu ini hanya dipakai ketika badal sudah tercatat tetapi tugas dari guru pengampu masih kosong.</p>
        </div>
      </div>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}
      {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{message}</div>}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="text-xs font-black uppercase tracking-wide text-slate-500"><T>{"Nama Guru"}</T></label>
        <div className="relative mt-2">
          <UserRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <select value={selectedTeacher} onChange={(e) => { setSelectedTeacher(e.target.value); setActiveKey(""); setAccess(null); }} className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-3 text-sm font-semibold">
            <option value="">Pilih guru...</option>
            {sortedTeachers.map((teacher) => <option key={teacher.id || teacher.nama} value={teacher.nama}>{teacher.nama}</option>)}
          </select>
        </div>
      </section>

      {!selectedTeacher ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">Pilih nama guru untuk mengecek tugas badal yang masih kosong.</div>
      ) : visibleSessions.length === 0 ? (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-10 text-center">
          <CheckCircle2 className="w-9 h-9 text-emerald-600 mx-auto" />
          <div className="font-black text-emerald-900 mt-2">Tidak ada tugas badal yang tertinggal</div>
          <div className="text-sm text-emerald-700 mt-1">Semua badal aktif untuk guru ini sudah memiliki tugas/material.</div>
        </div>
      ) : (
        <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-5 items-start">
          <section className="rounded-3xl border border-amber-200 bg-amber-50/50 p-4 space-y-3">
            <div className="font-black text-amber-950 flex items-center gap-2"><Clock3 className="w-5 h-5" /> {visibleSessions.length} tugas belum lengkap</div>
            {visibleSessions.map((session) => (
              <div key={session.key} className={`w-full rounded-2xl border p-4 transition-colors ${activeKey === session.key ? "border-violet-400 bg-violet-50" : "border-amber-200 bg-white hover:border-amber-300"}`}>
                <button type="button" onClick={() => selectSession(session)} className="w-full text-left">
                  <div className="flex items-center justify-between gap-2"><span className="font-black text-sm">{formatDate(session.tanggal)} • JP {session.jam_ke}</span><span className="text-[10px] font-black bg-amber-100 text-amber-800 px-2 py-1 rounded">BELUM ADA TUGAS</span></div>
                  <div className="font-bold text-slate-800 mt-2">{session.mapel}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{session.kelas}</div>
                  <div className="text-xs text-slate-600 mt-2">Badal: <strong>{session.guru_pengganti}</strong></div>
                </button>
                <button
                  type="button"
                  onClick={() => openSubstituteWhatsapp(session)}
                  className="mt-3 w-full rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 px-3 py-2 text-xs font-black text-emerald-700 flex items-center justify-center gap-2"
                  title={`Hubungi ${session.guru_pengganti} melalui WhatsApp`}
                >
                  <MessageCircle className="w-4 h-4" /> Hubungi Guru Badal
                </button>
              </div>
            ))}
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            {!active ? (
              <div className="py-12 text-center text-sm text-slate-400">Pilih salah satu JP di sebelah kiri.</div>
            ) : (
              <div className="space-y-5">
                <div>
                  <div className="font-black text-lg text-slate-900"><T>{"JP"}</T> {active.jam_ke} • {active.mapel}</div>
                  <div className="text-sm text-slate-500">{active.kelas} • {formatDate(active.tanggal)}</div>
                </div>

                {!access ? (
                  <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 space-y-3">
                    <div className="font-black text-violet-900 flex items-center gap-2"><KeyRound className="w-4 h-4" /> Pulihkan akses tugas</div>
                    <p className="text-xs text-violet-700">Masukkan kode pengajuan izin dan 4 digit terakhir WhatsApp guru. Jika pengajuan dibuat dari perangkat ini, kode biasanya sudah terisi otomatis.</p>
                    <input value={requestCode} onChange={(e) => setRequestCode(e.target.value.toUpperCase())} placeholder="IZN-20261009-ABC123" className="w-full rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm font-mono" />
                    <input value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="4 digit terakhir WA" inputMode="numeric" className="w-full rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm" />
                    <button disabled={busy} onClick={() => void recoverAccess()} className="w-full rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-black text-sm py-2.5 disabled:opacity-50">{busy ? "Memeriksa..." : "Buka Akses Tugas"}</button>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="text-xs font-black uppercase tracking-wide text-slate-500">Teks / Link Tugas</label>
                      <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} placeholder="Contoh: Kerjakan halaman 35–37 atau paste link Google Classroom/Drive." className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
                      {syncTaskResourcesWithText(description, []).some((item) => item.resource_type === "LINK") && <div className="mt-2 text-xs font-bold text-blue-700 flex items-center gap-1"><Link2 className="w-3.5 h-3.5" /> Link terdeteksi otomatis</div>}
                    </div>
                    <div>
                      <label className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 hover:bg-violet-100 text-violet-700 px-3 py-2.5 text-xs font-black cursor-pointer">
                        <UploadCloud className="w-4 h-4" /> <T>{"Pilih File Tugas"}</T>
                        <input type="file" multiple className="hidden" onChange={(e) => { const picked = Array.from(e.target.files || []); setFiles((current) => [...current, ...picked]); e.currentTarget.value = ""; }} />
                      </label>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {files.map((file, index) => <span key={`${file.name}-${index}`} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-800"><Paperclip className="w-3 h-3" /> {file.name}<button type="button" onClick={() => setFiles((current) => current.filter((_, i) => i !== index))} className="ml-1 text-red-600">×</button></span>)}
                      </div>
                    </div>
                    <button disabled={busy} onClick={() => void submitTask()} className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3 flex items-center justify-center gap-2 disabled:opacity-50"><Send className="w-4 h-4" /> {busy ? "Menyimpan..." : "Kirim Tugas ke Badal"}</button>
                  </>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};
