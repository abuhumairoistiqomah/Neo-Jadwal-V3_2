import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ShieldCheck as ShieldCheckIcon,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Send,
  UserRound,
  AlertTriangle,
  Paperclip,
  UploadCloud,
  Link2,
  MessageCircle,
} from "lucide-react";
import type {
  JadwalInsidentalItem,
  KalenderAkademikItem,
  LogIzinItem,
  ScheduleItem,
  Teacher,
} from "../domain/models";
import {
  buildPublicLeaveSubmission,
  buildTeacherLeaveSlots,
  resolvePartialLeaveSelection,
  type LeaveRequestType,
} from "../domain/leaveRequest";
import { syncTaskResourcesWithText } from "../domain/taskResources";
import { saveStoredTaskAccess } from "../domain/taskRecovery";
import { uploadPublicLeaveTaskFile, type PublicLeaveTaskUploadResult } from "../infrastructure/drive/publicLeaveTaskDriveBridge";
import { SupabasePublicLeaveRepository, submitStaffLeaveRequest, type ExistingLeaveFreeCorrection, type PendingManagementEvidence } from "../infrastructure/repositories/supabasePublicLeaveRepository";
import type { PublicLeaveSubmitResult } from "../infrastructure/repositories/publicLeaveRepository";
import { isSupabaseConfigured } from "../infrastructure/supabase/client";
import { SupabasePublicScheduleRepository } from "../infrastructure/repositories/supabasePublicScheduleRepository";
import { evidenceExtension } from "../domain/managementLeaveEvidence";
import { getCurrentUserContext } from "../infrastructure/auth/supabaseAuthRepository";

import { T, useLanguage } from '../i18n/LanguageProvider';
import { localeIntl } from '../i18n/translations';

interface LeaveRequestFormProps {
  teachers: Teacher[];
  schedules: ScheduleItem[];
  logs?: LogIzinItem[];
  jadwalInsidental?: JadwalInsidentalItem[];
  kalenderAkademik?: KalenderAkademikItem[];
  selectedTeacher: string;
  driveBridgeUrl?: string;
  onBack: () => void;
  onChanged?: () => void | Promise<void>;
}

function localDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateIndo(value: string, locale: string = "id-ID"): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function sourceLabel(source: string): string {
  if (source === "INCIDENTAL_ADDITIONAL") return "Insidental tambahan";
  if (source === "INCIDENTAL_OVERRIDE") return "Jadwal insidental";
  return "Jadwal reguler";
}

export const LeaveRequestForm: React.FC<LeaveRequestFormProps> = ({
  teachers,
  schedules,
  logs = [],
  jadwalInsidental = [],
  kalenderAkademik = [],
  selectedTeacher,
  driveBridgeUrl = "",
  onBack, onChanged,
}) => {
  const {t, language}=useLanguage();
  const sortedTeachers = useMemo(
    () => [...teachers]
      .filter((teacher) => String(teacher.nama || "").trim())
      .sort((a, b) => a.nama.localeCompare(b.nama, "id-ID", { sensitivity: "base" })),
    [teachers],
  );

  const selectedTeacherExists = useMemo(
    () => sortedTeachers.some((teacher) => teacher.nama === selectedTeacher),
    [sortedTeachers, selectedTeacher],
  );

  const [teacherName, setTeacherName] = useState(() => selectedTeacherExists ? selectedTeacher : "");
  const [teacherTouched, setTeacherTouched] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(localDateString);
  const [requestType, setRequestType] = useState<LeaveRequestType>("FULL_DAY");
  const [reason, setReason] = useState("");
  const [detail, setDetail] = useState("");
  const [explicitSelectedKeys, setExplicitSelectedKeys] = useState<Set<string>>(new Set());
  // Form-local authoritative snapshot: does not unmount the parent form when refreshed.
  const [freshSchedule, setFreshSchedule] = useState<{
    schedules: ScheduleItem[]; jadwalInsidental: JadwalInsidentalItem[];
    logs: LogIzinItem[]; kalenderAkademik: KalenderAkademikItem[];
  } | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [scheduleError, setScheduleError] = useState("");
  const [scheduleRefresh, setScheduleRefresh] = useState(0);
  const [scheduleChanged, setScheduleChanged] = useState(false);
  const lastScheduleFingerprint = useRef("");
  const [taskTextByPeriod, setTaskTextByPeriod] = useState<Record<number, string>>({});
  const [uploadedByPeriod, setUploadedByPeriod] = useState<Record<number, PublicLeaveTaskUploadResult[]>>({});
  const [pendingFilesByPeriod, setPendingFilesByPeriod] = useState<Record<number, File[]>>({});
  const [uploadingPeriod, setUploadingPeriod] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidenceModalOpen, setEvidenceModalOpen] = useState(false);
  const [pendingEvidenceDraft, setPendingEvidenceDraft] = useState<PendingManagementEvidence | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [freeCorrection, setFreeCorrection] = useState<ExistingLeaveFreeCorrection | null>(null);
  const [correctionSelected, setCorrectionSelected] = useState<number[]>([]);
  const [correctionBusy, setCorrectionBusy] = useState(false);
  const [isStaffForCorrection, setIsStaffForCorrection] = useState(false);
  const [staffApproveNow, setStaffApproveNow] = useState(false);
  const [staffOralNote, setStaffOralNote] = useState("");
  const [correctionSuccess, setCorrectionSuccess] = useState("");
  const [success, setSuccess] = useState<{
    requestId: string;
    status: string;
    requestCode: string;
    slotCount: number;
    teachingSlotCount: number;
    freePeriodCount: number;
    taskUploadToken: string;
    taskUploadExpiresAt: string;
    scheduleDate: string;
    teachingPeriods: Array<{ period: number; classCode: string; subject: string }>;
  } | null>(null);

  const repository = useMemo(() => new SupabasePublicLeaveRepository(), []);

  useEffect(() => {
    void getCurrentUserContext().then((auth) => {
      setIsStaffForCorrection(Boolean(auth?.roles.some((role) => role === "ADMIN" || role === "WAKASEK")));
    }).catch(() => setIsStaffForCorrection(false));
  }, []);


  useEffect(() => {
    if (teacherTouched) return;
    if (selectedTeacher && sortedTeachers.some((teacher) => teacher.nama === selectedTeacher)) {
      setTeacherName(selectedTeacher);
    } else if (!selectedTeacher) {
      setTeacherName("");
    }
  }, [selectedTeacher, sortedTeachers, teacherTouched]);

  // A new date or manual refresh reads live Supabase, including dated incidental
  // teachers/subjects. Do not silently submit using a stale parent snapshot.
  useEffect(() => {
    let cancelled = false;
    setScheduleLoading(true);
    setScheduleError("");
    setFreshSchedule(null);
    void new SupabasePublicScheduleRepository().loadPublicState().then(({ snapshot }) => {
      if (cancelled) return;
      setFreshSchedule({
        schedules: snapshot.schedules, jadwalInsidental: snapshot.jadwalInsidental,
        logs: snapshot.logs, kalenderAkademik: snapshot.kalenderAkademik,
      });
    }).catch((reason: unknown) => {
      if (!cancelled) setScheduleError(`Gagal membaca jadwal terbaru: ${reason instanceof Error ? reason.message : String(reason)}`);
    }).finally(() => { if (!cancelled) setScheduleLoading(false); });
    return () => { cancelled = true; };
  }, [scheduleDate, scheduleRefresh]);

  const availableSlots = useMemo(
    () => freshSchedule ? buildTeacherLeaveSlots({
      teacherName,
      teacher: sortedTeachers.find((teacher) => teacher.nama === teacherName),
      scheduleDate,
      schedules: freshSchedule.schedules,
      jadwalInsidental: freshSchedule.jadwalInsidental,
      logs: freshSchedule.logs,
      kalenderAkademik: freshSchedule.kalenderAkademik,
    }) : [],
    [teacherName, scheduleDate, freshSchedule, sortedTeachers],
  );

  // Explicit clicks and automatically bridged FREE JPs are separate. Releasing
  // an endpoint removes its formerly automatic FREE selection as well.
  const selectedSlotKeys = useMemo(
    () => requestType === "FULL_DAY"
      ? new Set(availableSlots.map(slot => slot.key))
      : resolvePartialLeaveSelection(availableSlots, explicitSelectedKeys),
    [availableSlots, explicitSelectedKeys, requestType],
  );

  const selectedSlots = useMemo(
    () => availableSlots.filter((slot) => selectedSlotKeys.has(slot.key)),
    [availableSlots, selectedSlotKeys],
  );

  useEffect(() => {
    // Explicit choices on a different date or for a different teacher are unsafe.
    lastScheduleFingerprint.current = "";
    setScheduleChanged(false);
    setExplicitSelectedKeys(new Set());
    setTaskTextByPeriod({});
  }, [teacherName, scheduleDate]);

  useEffect(() => {
    if (!freshSchedule) return;
    const signature = JSON.stringify(availableSlots.map(slot => [slot.key,slot.classCode,slot.subject,
      slot.periodType,slot.source,...slot.assignments.map(a => `${a.classCode}:${a.subject}:${a.source}`)]));
    if (lastScheduleFingerprint.current && lastScheduleFingerprint.current !== signature) {
      // A date/teacher is unchanged but the authoritative assignments changed.
      // Never carry tasks for an old class or subject into a new one.
      setExplicitSelectedKeys(new Set());
      setTaskTextByPeriod({});
      setPendingFilesByPeriod({});
      setScheduleChanged(true);
    }
    lastScheduleFingerprint.current = signature;
  }, [availableSlots, freshSchedule]);

  const toggleSlot = (key: string) => {
    if (requestType === "FULL_DAY") return;
    const slot = availableSlots.find(item => item.key === key);
    if (!slot) return;
    // Automatically bridged FREE JPs must stay selected while between two
    // selected teaching JPs. Change the endpoints to release that FREE JP.
    if (slot.periodType === "FREE" && selectedSlotKeys.has(key) && !explicitSelectedKeys.has(key)) return;
    setExplicitSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleRequestType = (type: LeaveRequestType) => {
    if (type === requestType) return;
    setRequestType(type);
    // Moving from full-day to partial ALWAYS begins with no boxes checked.
    setExplicitSelectedKeys(new Set());
  };

  useEffect(() => {
    setFreeCorrection(null);
    setCorrectionSelected([]);
    setCorrectionSuccess("");
  }, [teacherName, scheduleDate]);

  const handleFindExistingFreePeriods = async () => {
    if (!teacherName || !scheduleDate) return;
    setCorrectionBusy(true);
    setError("");
    setCorrectionSuccess("");
    try {
      const existing = await repository.findExistingFreeCorrection(teacherName, scheduleDate);
      setFreeCorrection(existing);
      setCorrectionSelected([]);
      if (!existing) setError("Tidak ditemukan izin SUBMITTED/APPROVED untuk guru dan tanggal ini.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCorrectionBusy(false);
    }
  };

  const handleAppendFreePeriods = async () => {
    if (!freeCorrection || correctionSelected.length === 0) return;
    setCorrectionBusy(true);
    setError("");
    try {
      const added = await repository.appendExistingFreePeriods(freeCorrection.requestId, correctionSelected);
      setCorrectionSuccess(`JP ${added.join(", ")} ditambahkan pada izin ${freeCorrection.requestCode || "sebelumnya"} sebagai JP FREE. Tidak ada badal baru.`);
      const fresh = await repository.findExistingFreeCorrection(teacherName, scheduleDate);
      setFreeCorrection(fresh);
      setCorrectionSelected([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCorrectionBusy(false);
    }
  };

  const finishSubmittedRequest = async (draft: PublicLeaveSubmitResult) => {
    setPendingEvidenceDraft(null);
    if (draft.status === 'SUBMITTED' && draft.taskUploadToken) saveStoredTaskAccess({
      requestCode: draft.requestCode,
      teacherName,
      scheduleDate,
      uploadToken: draft.taskUploadToken,
      expiresAt: draft.taskUploadExpiresAt,
    });
    // Existing teacher-owned learning task uploads remain separate from
    // the private management authorization screenshot.
    const autoUploaded: Record<number, PublicLeaveTaskUploadResult[]> = {};
    const uploadFailures: string[] = [];
    for (const [periodKey, files] of Object.entries(pendingFilesByPeriod) as Array<[string, File[]]>) {
      const period = Number(periodKey);
      for (const taskFile of files || []) {
        try {
          const uploaded = await uploadPublicLeaveTaskFile({
            apiUrl: driveBridgeUrl,
            requestCode: draft.requestCode,
            uploadToken: draft.taskUploadToken,
            period, scheduleDate, file: taskFile,
          });
          autoUploaded[period] = [...(autoUploaded[period] || []), uploaded];
        } catch (uploadErr) {
          uploadFailures.push(`JP ${period} • ${taskFile.name}: ${uploadErr instanceof Error ? uploadErr.message : String(uploadErr)}`);
        }
      }
    }
    setUploadedByPeriod(autoUploaded);
    setUploadError(uploadFailures.length > 0
      ? `Izin sudah SUBMITTED, tetapi ${uploadFailures.length} lampiran tugas gagal. Upload ulang pada panel bawah. ${uploadFailures.join(" | ")}`
      : "");
    setPendingFilesByPeriod({});
    setSuccess({
      requestId: draft.requestId,
      status: draft.status,
      requestCode: draft.requestCode,
      slotCount: draft.slotCount,
      teachingSlotCount: draft.teachingSlotCount,
      freePeriodCount: draft.freePeriodCount,
      taskUploadToken: draft.taskUploadToken,
      taskUploadExpiresAt: draft.taskUploadExpiresAt,
      scheduleDate,
      teachingPeriods: selectedSlots
        .filter((slot) => slot.periodType === "TEACHING" && slot.period > 0)
        .map((slot) => ({ period: slot.period, classCode: slot.classCode, subject: slot.subject })),
    });
    setEvidenceFile(null);
    setReason("");
    setDetail("");
  };

  const completeEvidenceSubmission = async (draft: PendingManagementEvidence, file: File) => {
    await repository.uploadEvidence(draft, file);
    await repository.finalizeEvidence(draft);
    await finishSubmittedRequest({...draft,status:'SUBMITTED'});
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    const staffDirect=isStaffForCorrection&&!pendingEvidenceDraft;
    if (!staffDirect && !evidenceFile) {
      setEvidenceModalOpen(true); // Anonymous and pending drafts always require evidence.
      return;
    }
    if (!staffDirect && evidenceFile) {
      try { evidenceExtension(evidenceFile); }
      catch (err) { setError(err instanceof Error ? err.message : String(err)); return; }
    }
    if (staffDirect && staffApproveNow && !staffOralNote.trim()) {
      setError("Catatan persetujuan lisan wajib diisi untuk approval langsung.");return;
    }
    if (staffDirect && staffApproveNow && Object.values(pendingFilesByPeriod as Record<number,File[]>).some(files=>files.length>0)) {
      setError("Upload file tugas sebelum approval langsung tidak tersedia. Gunakan link tugas, atau kirim dahulu ke antrean persetujuan.");return;
    }
    if (!isSupabaseConfigured) {
      setError("Supabase belum dikonfigurasi. Pengajuan tidak dikirim.");
      return;
    }
    if (!pendingEvidenceDraft && (scheduleLoading || scheduleError || !freshSchedule)) {
      setError("Jadwal efektif belum diverifikasi. Tunggu atau klik Perbarui jadwal.");
      return;
    }
    setSubmitting(true);
    try {
      if (pendingEvidenceDraft) {
        // Retry on the original draft: never create a second leave request.
        await completeEvidenceSubmission(pendingEvidenceDraft, evidenceFile);
        return;
      }
      const tasks = selectedSlots
        .filter((slot) => slot.periodType === "TEACHING" && slot.period > 0)
        .map((slot) => {
          const description = taskTextByPeriod[slot.period] || "";
          const resources = syncTaskResourcesWithText(description, [])
            .filter((resource) => resource.resource_type === "LINK")
            .map((resource) => ({ resource_type: "LINK" as const, label: resource.label, url: resource.url }));
          return { period: slot.period, description, resources };
        });
      const payload = buildPublicLeaveSubmission({
        teacherName, scheduleDate, requestType, reason, detail,
        slots: selectedSlots, tasks,
      });
      if (staffDirect) {
        // RPC verifies auth.uid() + server-side staff role, never Admin Mode alone.
        const submitted=await submitStaffLeaveRequest(payload,staffApproveNow,staffOralNote);
        await finishSubmittedRequest(submitted);
        if (submitted.status === "APPROVED") {
          try { await onChanged?.(); }
          catch { setUploadError("Izin berhasil disetujui, tetapi refresh jadwal gagal. Klik Refresh Supabase untuk memuat penugasan terbaru."); }
        }
      } else {
        if (!evidenceFile) throw new Error("Bukti izin diperlukan.");
        const draft = await repository.createEvidenceDraft(payload, evidenceFile);
        setPendingEvidenceDraft(draft);
        await completeEvidenceSubmission(draft, evidenceFile);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      if (message.includes("sudah memiliki pengajuan izin aktif")) {
        try {
          const auth = await getCurrentUserContext();
          if (auth?.roles.some((role) => role === "ADMIN" || role === "WAKASEK")) {
            const existing = await repository.findExistingFreeCorrection(teacherName, scheduleDate);
            setFreeCorrection(existing);
          }
        } catch (correctionError) {
          setError(`${message} Koreksi JP Free membutuhkan login ADMIN/WAKASEK. ${correctionError instanceof Error ? correctionError.message : ""}`);
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const resetForAnother = () => {
    setSuccess(null);
    setError("");
    setUploadError("");
    setEvidenceFile(null);
    setStaffApproveNow(false);
    setStaffOralNote("");
    setPendingEvidenceDraft(null);
    setEvidenceModalOpen(false);
    setUploadedByPeriod({});
    setPendingFilesByPeriod({});
    setTaskTextByPeriod({});
    setRequestType("FULL_DAY");
    setExplicitSelectedKeys(new Set());
  };

  const handleTaskFileUpload = async (period: number, file: File) => {
    if (!success) return;
    setUploadError("");
    setUploadingPeriod(period);
    try {
      const result = await uploadPublicLeaveTaskFile({
        apiUrl: driveBridgeUrl,
        requestCode: success.requestCode,
        uploadToken: success.taskUploadToken,
        period,
        scheduleDate: success.scheduleDate,
        file,
      });
      setUploadedByPeriod((current) => ({
        ...current,
        [period]: [...(current[period] || []), result],
      }));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploadingPeriod(null);
    }
  };

  return (
    <div className="space-y-6">
      {evidenceModalOpen && (
        <div role="presentation" className="fixed inset-0 z-[100] bg-slate-950/60 flex items-center justify-center p-4">
          <div role="alertdialog" aria-modal="true" aria-labelledby="required-evidence-title" aria-describedby="required-evidence-description" className="w-full max-w-md rounded-2xl bg-white shadow-2xl p-6 space-y-3">
            <div className="flex gap-2 items-center text-red-700 font-black" id="required-evidence-title"><AlertTriangle className="w-5 h-5" /> <T>{"Bukti izin wajib dilampirkan"}</T></div>
            <p id="required-evidence-description" className="text-sm text-slate-700">Harus upload bukti izin dari manajemen. Pengajuan belum dikirim dan tidak akan masuk antrean persetujuan sampai screenshot berhasil diunggah.</p>
            <button type="button" autoFocus onClick={() => setEvidenceModalOpen(false)} className="w-full rounded-xl bg-emerald-600 text-white py-2.5 font-bold"><T>{"Mengerti, saya akan upload"}</T></button>
          </div>
        </div>
      )}
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onBack}
          className="mt-1 p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors"
          title={t("Kembali")}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <div className="flex items-center gap-2 text-emerald-700 text-xs font-extrabold uppercase tracking-[0.14em]">
            <ClipboardCheck className="w-4 h-4" /> V3.12.5 Teacher-Owned Leave & Task
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mt-1"><T>{"Ajukan Izin Mengajar"}</T></h2>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Tidak perlu login. Ketidakhadiran dimulai dari JP-0 Homeroom Session. JP mengajar menghasilkan badal; JP free tetap dicatat hanya untuk statistik kehadiran.
          </p>
        </div>
      </div>

      {!isSupabaseConfigured && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex gap-2 items-start">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>Mode form tersedia, tetapi pengiriman membutuhkan konfigurasi Supabase V3 di <code>.env.local</code>.</span>
        </div>
      )}

      {success ? (
        <div className="bg-white rounded-3xl border border-emerald-200 shadow-sm p-6 sm:p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-black text-slate-900 mt-4"><T>{"Pengajuan berhasil dikirim"}</T></h3>
          <p className="text-sm text-slate-500 mt-1">Status: <strong>{success.status}</strong> {success.status==='APPROVED'?'— Disetujui langsung oleh akun staf terverifikasi.':'— Menunggu pemeriksaan Wakakur.'}</p>
          <div className="mt-5 inline-flex flex-col items-center rounded-2xl border border-slate-200 bg-slate-50 px-6 py-4">
            <span className="text-[11px] uppercase tracking-widest font-bold text-slate-400"><T>{"Kode Pengajuan"}</T></span>
            <strong className="font-mono text-xl text-slate-900 mt-1 select-all">{success.requestCode}</strong>
            <span className="text-xs text-slate-500 mt-2">{success.slotCount} <T>{"JP ketidakhadiran tercatat"}</T></span>
            <span className="text-[11px] text-slate-400 mt-1">{success.teachingSlotCount} <T>{"kelas butuh coverage •"}</T> {success.freePeriodCount} <T>{"JP free"}</T></span>
          </div>
          {success.status !== "APPROVED" && success.teachingPeriods.length > 0 && (
            <div className="mt-6 text-left rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4 sm:p-5">
              <div className="flex items-center gap-2 font-black text-indigo-900"><UploadCloud className="w-5 h-5" /> <T>{"Lampiran Tugas"}</T></div>
              <p className="text-xs text-indigo-700 mt-1">File yang dipilih di form tadi otomatis dicoba upload setelah pengajuan dibuat. Di sini guru bisa menambah file atau retry bila ada upload yang gagal; token hanya berlaku sementara untuk pengajuan ini.</p>
              <div className="mt-4 space-y-3">
                {success.teachingPeriods.map((item) => (
                  <div key={`upload-${item.period}`} className="rounded-xl border border-indigo-100 bg-white p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-black text-slate-900"><T>{"JP"}</T> {item.period} • {item.classCode}</div>
                      <div className="text-[11px] text-slate-500">{item.subject || "Mata pelajaran"}</div>
                      {(uploadedByPeriod[item.period] || []).map((resource) => (
                        <a key={resource.resourceId || resource.url} href={resource.url} target="_blank" rel="noreferrer" className="mt-1 block text-[11px] text-emerald-700 font-bold truncate">📎 {resource.fileName}</a>
                      ))}
                    </div>
                    <label className={`shrink-0 px-3 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-2 cursor-pointer ${uploadingPeriod === item.period ? "bg-slate-200 text-slate-500" : "bg-indigo-600 hover:bg-indigo-700 text-white"}`}>
                      <UploadCloud className="w-4 h-4" /> {uploadingPeriod === item.period ? "Mengupload..." : "Pilih File"}
                      <input
                        type="file"
                        className="hidden"
                        disabled={uploadingPeriod !== null}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void handleTaskFileUpload(item.period, file);
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                  </div>
                ))}
              </div>
              {uploadError && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 font-semibold">{uploadError}</div>}
            </div>
          )}
          <p className="text-xs text-slate-400 mt-4"><T>{"Simpan atau screenshot kode ini bila perlu dikonfirmasi ke Wakakur."}</T></p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={resetForAnother} className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm">
              <T>{"Buat Pengajuan Lain"}</T>
            </button>
            <button type="button" onClick={onBack} className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm">
              <T>{"Kembali ke Dashboard"}</T>
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="grid lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)] gap-6 items-start">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6 space-y-5">
            <div>
              <label className="text-xs font-extrabold uppercase tracking-wider text-slate-500"><T>{"Nama Guru"}</T></label>
              <div className="relative mt-2">
                <UserRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <select
                  value={teacherName}
                  onChange={(event) => {
                    setTeacherTouched(true);
                    setTeacherName(event.target.value);
                    setError("");
                  }}
                  className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                >
                  <option value="">{t("Pilih nama guru...")}</option>
                  {sortedTeachers.map((teacher) => (
                    <option key={teacher.id || teacher.nama} value={teacher.nama}>{teacher.nama}</option>
                  ))}
                </select>
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5">
                <T>{"Mengganti nama di sini tidak mengubah guru terakhir yang sedang dilihat pada E-Jadwal."}</T>
              </p>
            </div>

            <div>
              <label className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Tanggal Izin</label>
              <div className="relative mt-2">
                <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={(event) => {
                    setScheduleDate(event.target.value);
                    setError("");
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-3 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                />
              </div>
              {scheduleDate && <p className="text-[11px] text-slate-400 mt-1.5">{formatDateIndo(scheduleDate,localeIntl(language))}</p>}
            </div>

            <div>
              <label className="text-xs font-extrabold uppercase tracking-wider text-slate-500"><T>{"Jenis Izin"}</T></label>
              <div className="grid sm:grid-cols-2 gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => handleRequestType("FULL_DAY")}
                  className={`rounded-xl border px-4 py-3 text-left transition-colors ${requestType === "FULL_DAY" ? "border-emerald-400 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700"}`}
                >
                  <div className="font-extrabold text-sm"><T>{"Sehari penuh"}</T></div>
                  <div className="text-[11px] opacity-70 mt-0.5"><T>{"Semua JP sekolah aktif, termasuk JP free, otomatis dipilih."}</T></div>
                </button>
                <button
                  type="button"
                  onClick={() => handleRequestType("PARTIAL")}
                  className={`rounded-xl border px-4 py-3 text-left transition-colors ${requestType === "PARTIAL" ? "border-emerald-400 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700"}`}
                >
                  <div className="font-extrabold text-sm"><T>{"Sebagian JP"}</T></div>
                  <div className="text-[11px] opacity-70 mt-0.5">Centang dimulai kosong; JP FREE di antara dua JP izin dipilih otomatis.</div>
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-extrabold uppercase tracking-wider text-slate-500"><T>{"Alasan"}</T></label>
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={t("Contoh: sakit, keperluan keluarga, dinas...")}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
              />
            </div>

            <div>
              <label className="text-xs font-extrabold uppercase tracking-wider text-slate-500"><T>{"Catatan"}</T> <span className="font-normal normal-case"><T>{"(opsional)"}</T></span></label>
              <textarea
                value={detail}
                onChange={(event) => setDetail(event.target.value)}
                rows={3}
                placeholder={t("Keterangan tambahan tentang izin bila diperlukan.")}
                className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
              />
            </div>

            {isStaffForCorrection&&!pendingEvidenceDraft&&<div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 space-y-3">
              <div className="font-black text-sm text-emerald-900 flex items-center gap-2"><ShieldCheckIcon className="w-5 h-5"/> <T>{"Mode Pengajuan Staf Terautentikasi"}</T></div>
              <p className="text-xs text-emerald-800">Akun ADMIN/WAKASEK dapat mengirim pengajuan tanpa screenshot. Akses diverifikasi ulang oleh RPC Supabase, seluruh tindakan dicatat di audit. Persetujuan lisan dapat diproses langsung bila diperlukan.</p>
              <label className="flex gap-2 items-start text-xs font-bold text-emerald-900"><input type="checkbox" checked={staffApproveNow} onChange={e=>setStaffApproveNow(e.target.checked)} className="mt-0.5"/> <T>{"Setujui langsung — sudah mendapat persetujuan lisan manajemen"}</T></label>
              {staffApproveNow&&<textarea value={staffOralNote} onChange={e=>setStaffOralNote(e.target.value)} rows={2} placeholder="Catatan otorisasi lisan: oleh siapa, kapan, dan alasan mendesak (wajib)" className="w-full rounded-lg border border-emerald-300 p-2 text-xs"/>}
              <p className="text-[11px] text-emerald-700">Default: hanya SUBMITTED. Centang persetujuan langsung jika benar-benar telah mendapat otorisasi.</p>
            </div>}
            {!isStaffForCorrection&&<div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 space-y-3">
              <div className="flex items-center gap-2 font-black text-amber-950 text-sm">
                <ShieldCheckIcon /> <T>{"Bukti Izin dari Manajemen"}</T> <span className="text-red-600"><T>{"(wajib)"}</T></span>
              </div>
              <p className="text-xs text-amber-900"><T>{"Upload screenshot WhatsApp dari manajemen yang menyatakan izin diberikan. JPG, PNG, atau WEBP (maksimal 5 MB). Bukti disimpan privat dan hanya petugas berwenang yang dapat melihatnya."}</T></p>
              <a
                href="https://wa.me/6281325245959?text=Assalamu%27alaikum%2C%20saya%20ingin%20meminta%20persetujuan%20izin%20kepada%20manajemen."
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-800 hover:bg-emerald-100"
              >
                <MessageCircle className="h-4 w-4"/> <T>{"Hubungi Manajemen via WA"}</T>
              </a>
              <p className="text-[11px] text-amber-900"><T>{"Nomor manajemen: +62 813-2524-5959. Dapatkan persetujuan terlebih dahulu, lalu unggah screenshot-nya di bawah."}</T></p>
              <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-amber-300 text-sm font-bold text-amber-900 cursor-pointer hover:bg-amber-100">
                <UploadCloud className="w-4 h-4" /> {t(evidenceFile ? "Ganti Bukti Izin" : "Pilih Screenshot Persetujuan")}
                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      try {
                        evidenceExtension(file);
                        setEvidenceFile(file);
                        setError("");
                        setEvidenceModalOpen(false);
                      } catch (err) {
                        setError(err instanceof Error ? err.message : String(err));
                      }
                    }
                    event.currentTarget.value = "";
                  }} />
              </label>
              {evidenceFile && <p className="text-xs text-emerald-800 font-semibold break-all">✓ {evidenceFile.name} ({Math.ceil(evidenceFile.size / 1024)} KB)</p>}
              {pendingEvidenceDraft && (
                <div className="rounded-xl border border-amber-400 bg-white p-3 text-xs text-amber-900">
                  <strong><T>{"Menunggu Bukti —"}</T> {pendingEvidenceDraft.requestCode}</strong>
                  <p className="mt-1">Draft sudah tercatat, tetapi belum masuk Persetujuan Izin. Klik Kirim lagi untuk mencoba upload/verifikasi ulang (bukan membuat izin kedua). Jangan tutup tab sebelum selesai.</p>
                </div>
              )}
            </div>}

            <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4 space-y-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-black text-indigo-900"><Paperclip className="w-4 h-4" /> <T>{"Tugas untuk Guru Badal"}</T></div>
                <p className="text-[11px] text-indigo-700 mt-1"><T>{"Isi tugas untuk JP pelajaran (JP1–JP6). JP-0 Homeroom tetap membutuhkan badal tetapi tidak memerlukan materi tugas. Link yang ditempel otomatis disimpan sebagai resource."}</T></p>
              </div>
              {selectedSlots.filter((slot) => slot.periodType === "TEACHING" && slot.period > 0).length === 0 ? (
                <div className="text-xs text-slate-500 rounded-xl bg-white/70 border border-indigo-100 p-3"><T>{"Pilih minimal satu JP mengajar untuk menyiapkan tugas."}</T></div>
              ) : selectedSlots.filter((slot) => slot.periodType === "TEACHING" && slot.period > 0).map((slot) => (
                <div key={`task-${slot.period}`} className="rounded-xl bg-white border border-indigo-100 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-black text-slate-900"><T>{"JP"}</T> {slot.period} • {slot.classCode}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{slot.subject || "Mata pelajaran"}</div>
                    </div>
                    {syncTaskResourcesWithText(taskTextByPeriod[slot.period] || "", []).length > 0 && (
                      <span className="text-[9px] font-black rounded bg-blue-100 text-blue-700 px-2 py-1 flex items-center gap-1"><Link2 className="w-3 h-3" /> LINK</span>
                    )}
                  </div>
                  <textarea
                    value={taskTextByPeriod[slot.period] || ""}
                    onChange={(event) => setTaskTextByPeriod((current) => ({ ...current, [slot.period]: event.target.value }))}
                    rows={3}
                    placeholder="Contoh: Kerjakan halaman 35–37 nomor 1–10, atau paste link Google Classroom/Drive di sini."
                    className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-black cursor-pointer">
                      <UploadCloud className="w-3.5 h-3.5" /> <T>{"Pilih File Tugas"}</T>
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(event) => {
                          const files = Array.from(event.target.files || []);
                          if (files.length) setPendingFilesByPeriod((current) => ({ ...current, [slot.period]: [...(current[slot.period] || []), ...files] }));
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                    {(pendingFilesByPeriod[slot.period] || []).map((file, fileIndex) => (
                      <span key={`${file.name}-${file.size}-${fileIndex}`} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[10px] font-bold text-emerald-800 max-w-full">
                        <Paperclip className="w-3 h-3 shrink-0" />
                        <span className="truncate max-w-[220px]">{file.name}</span>
                        <button
                          type="button"
                          onClick={() => setPendingFilesByPeriod((current) => ({ ...current, [slot.period]: (current[slot.period] || []).filter((_, index) => index !== fileIndex) }))}
                          className="text-emerald-700 hover:text-red-600"
                          title="Hapus file dari antrean upload"
                        >×</button>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden lg:sticky lg:top-4">
            <div className="px-5 py-4 bg-slate-900 text-white">
              <div className="flex items-center gap-2 font-black"><Clock3 className="w-5 h-5 text-emerald-300" /> <T>{"JP Ketidakhadiran"}</T></div>
              <div className="text-xs text-slate-300 mt-1"><T>{"JP-0 Homeroom wajib digantikan bila wali/pendamping kelas tidak hadir. JP mengajar menghasilkan badal; JP free hanya dicatat untuk statistik."}</T></div>
            </div>

            <div className="px-4 pt-3 flex items-center justify-between gap-2">
              <p className="text-[11px] text-slate-600">{scheduleLoading ? "Memuat jadwal efektif terbaru…" : scheduleError ? "Jadwal belum terverifikasi" : "Jadwal efektif Supabase • insidental termasuk"}</p>
              <button type="button" disabled={scheduleLoading || submitting} onClick={() => setScheduleRefresh(n => n + 1)}
                className="text-xs font-bold text-emerald-700 disabled:text-slate-400 underline">Perbarui jadwal</button>
            </div>
            {scheduleChanged && <p role="status" className="mx-4 mt-2 rounded-lg bg-amber-50 border border-amber-200 p-2 text-xs text-amber-800">Jadwal efektif berubah sejak pilihan sebelumnya. Pilihan JP dan materi tugas dikosongkan demi mencegah salah pengajuan.</p>}
            {scheduleError && <p role="alert" className="mx-4 mt-2 rounded-lg bg-red-50 border border-red-200 p-2 text-xs text-red-700">{scheduleError}. Pengajuan dinonaktifkan sampai jadwal berhasil dimuat.</p>}
            <div className="p-4 space-y-2 max-h-[460px] overflow-y-auto">
              {scheduleLoading ? (<div role="status" className="text-sm text-slate-500 p-4">Mengambil jadwal terbaru dari Supabase…</div>) :
              scheduleError ? (<div className="text-sm text-red-700 p-4">Gagal memuat jadwal. Tekan Perbarui jadwal.</div>) :
              !teacherName ? (
                <div className="p-5 text-center text-sm text-slate-400"><T>{"Pilih guru terlebih dahulu."}</T></div>
              ) : availableSlots.length === 0 ? (
                <div className="p-5 text-center text-sm text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
                  <T>{"Tidak ada JP sekolah aktif yang dapat diajukan pada tanggal ini. Hari/libur penuh dan JP yang sudah tercatat izin tidak ditampilkan."}</T>
                </div>
              ) : (
                availableSlots.map((slot) => {
                  const checked = selectedSlotKeys.has(slot.key);
                  return (
                    <label
                      key={slot.key}
                      className={`block rounded-xl border p-3 transition-colors ${slot.period === 0 && slot.periodType === "TEACHING"
                        ? (checked ? "border-violet-500 bg-violet-100/90 ring-1 ring-violet-200" : "border-violet-300 bg-violet-50/80")
                        : slot.periodType === "FREE"
                          ? (checked ? "border-sky-500 bg-sky-100/90 ring-1 ring-sky-200" : "border-sky-300 bg-sky-50/80")
                          : (checked ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white")} ${requestType === "FULL_DAY" ? "cursor-default" : slot.period === 0 && slot.periodType === "TEACHING" ? "cursor-pointer hover:border-violet-400 hover:bg-violet-100/70" : slot.periodType === "FREE" ? "cursor-pointer hover:border-sky-400 hover:bg-sky-100/70" : "cursor-pointer hover:border-emerald-200"}`}
                    >
                      <div className="flex gap-3 items-start">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={requestType === "FULL_DAY" || (slot.periodType === "FREE" && checked && !explicitSelectedKeys.has(slot.key))}
                          onChange={() => toggleSlot(slot.key)}
                          className="mt-1 w-4 h-4 accent-emerald-600"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-black text-sm text-slate-900">{slot.period === 0 ? "JP-0" : `JP ${slot.period}`} • {slot.classCode}</span>
                            <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded ${slot.period === 0 && slot.periodType === "TEACHING" ? "bg-violet-200 text-violet-900" : slot.periodType === "FREE" ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-500"}`}>
                              {slot.period === 0 && slot.periodType === "TEACHING" ? "HOMEROOM • WAJIB BADAL" : slot.periodType === "FREE" ? "JP FREE • Statistik" : sourceLabel(slot.source)}
                            </span>
                          </div>
                          <div className={`text-sm font-semibold mt-1 ${slot.period === 0 && slot.periodType === "TEACHING" ? "text-violet-800" : slot.periodType === "FREE" ? "text-sky-700" : "text-slate-700"}`}>{slot.subject || "(Mapel belum terisi)"}</div>
                          {slot.isCombinedSession && slot.periodType === "TEACHING" && (
                            <div className="text-[10px] font-extrabold uppercase tracking-wide text-emerald-700 mt-1">Kelas gabungan • {slot.assignments.length} kelas</div>
                          )}
                          {(slot.startTime || slot.endTime) && <div className="text-[11px] text-slate-400 mt-0.5">{slot.startTime}{slot.startTime && slot.endTime ? " – " : ""}{slot.endTime}</div>}
                        </div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>

            <div className="border-t border-slate-100 p-4 bg-slate-50">
              <div className="flex justify-between text-xs font-semibold text-slate-500 mb-3">
                <span><T>{"JP dipilih"}</T></span>
                <span className="text-slate-900 font-black">{selectedSlots.length} / {availableSlots.length}</span>
              </div>
              {error && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</div>}
              {correctionSuccess && <div className="mb-3 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">{correctionSuccess}</div>}
              {isStaffForCorrection && !freeCorrection && (
                <button type="button" onClick={() => void handleFindExistingFreePeriods()} disabled={correctionBusy || !teacherName || !scheduleDate}
                  className="mb-3 w-full px-3 py-2 text-xs font-bold rounded-lg border border-indigo-200 text-indigo-800 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50">
                  {correctionBusy ? "Mencari Pengajuan Lama..." : "Admin: Tambahkan JP Free ke Pengajuan Lama"}
                </button>
              )}
              {freeCorrection && (
                <div className="mb-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3 space-y-2 text-sm">
                  <div className="font-bold text-indigo-900">Perbaiki izin yang sudah ada — {freeCorrection.requestCode || "Pengajuan aktif"}</div>
                  <div className="text-xs text-indigo-800">Status: {freeCorrection.status}. JP tercatat: {freeCorrection.recordedPeriods.map((p) => `JP${p}`).join(", ") || "–"}. Perubahan hanya untuk JP kosong; pengajuan lama, persetujuan, dan badal tetap utuh.</div>
                  {freeCorrection.missingFreePeriods.length === 0 ? (
                    <div className="text-xs font-semibold text-indigo-700">Tidak ada JP FREE yang masih bisa ditambahkan. Jika jam tersebut sebenarnya mengajar, gunakan koreksi admin tersendiri.</div>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-3">
                        {freeCorrection.missingFreePeriods.map((period) => (
                          <label key={period} className="flex items-center gap-1.5 text-xs font-semibold text-indigo-900 cursor-pointer">
                            <input type="checkbox" checked={correctionSelected.includes(period)} onChange={(event) => setCorrectionSelected((current) => event.target.checked ? [...current, period].sort((a, b) => a - b) : current.filter((jp) => jp !== period))} /> <T>{"JP"}</T>{period} Free
                          </label>
                        ))}
                      </div>
                      <button type="button" onClick={() => void handleAppendFreePeriods()} disabled={correctionBusy || correctionSelected.length === 0} className="px-3 py-2 text-xs font-black rounded-lg bg-indigo-600 disabled:opacity-40 text-white hover:bg-indigo-500">
                        {correctionBusy ? "Menyimpan Koreksi..." : "Tambahkan JP Free ke Izin Lama"}
                      </button>
                    </>
                  )}
                </div>
              )}
              <button
                type="submit"
                disabled={submitting || (!pendingEvidenceDraft && (scheduleLoading || Boolean(scheduleError) || !freshSchedule || !teacherName || !reason.trim() || selectedSlots.length === 0 || !isSupabaseConfigured))}
                className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-black px-4 py-3 flex items-center justify-center gap-2 transition-colors"
              >
                <Send className="w-4 h-4" /> {submitting ? "Mengirim Izin & Tugas..." : "Kirim Pengajuan Izin"}
              </button>
              <p className="text-[10px] text-slate-400 text-center mt-2">{isStaffForCorrection?'Staf login: screenshot tidak wajib, persetujuan langsung hanya dengan catatan otorisasi.':'Tanpa bukti manajemen, izin tidak masuk antrean approval.'} JP free hanya untuk statistik dan tidak menghasilkan badal.</p>
            </div>
          </div>
        </form>
      )}
    </div>
  );
};
