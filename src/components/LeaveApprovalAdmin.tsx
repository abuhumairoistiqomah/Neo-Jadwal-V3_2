import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock3,
  ClipboardCheck,
  LogIn,
  LogOut,
  RefreshCw,
  ExternalLink,
  Paperclip,
  ShieldCheck,
  TriangleAlert,
  UserRound,
  XCircle,
  MessageCircle,
  Copy,
} from "lucide-react";
import {
  buildBadalProcessingUrl,
  groupWaitingBadalRows,
  summarizeLeaveRequest,
  type LeaveReviewRequest,
  type WaitingCoverageRow,
} from "../domain/leaveApproval";
import {
  getCurrentUserContext,
  signInWithPassword,
  signOut,
  type CurrentUserContext,
} from "../infrastructure/auth/supabaseAuthRepository";
import { SupabaseLeaveApprovalRepository } from "../infrastructure/repositories/supabaseLeaveApprovalRepository";
import { isSupabaseConfigured } from "../infrastructure/supabase/client";
import type { Teacher } from "../domain/models";
import { buildDeclineLeaveWhatsappMessage, buildLeaveReviewWhatsappMessage, findTeacherByName } from "../domain/whatsappTemplates";
import { getSchoolTodayISO } from "../domain/date";

interface LeaveApprovalAdminProps {
  teachers?: Teacher[];
  onBack?: () => void;
}

function formatDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || "-";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function formatSubmittedAt(value: string): string {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("id-ID", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export const LeaveApprovalAdmin: React.FC<LeaveApprovalAdminProps> = ({ teachers = [], onBack }) => {
  const repository = useMemo(() => new SupabaseLeaveApprovalRepository(), []);
  const [userContext, setUserContext] = useState<CurrentUserContext | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [requests, setRequests] = useState<LeaveReviewRequest[]>([]);
  const [waitingRows, setWaitingRows] = useState<WaitingCoverageRow[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [declineHandoff, setDeclineHandoff] = useState<{ teacherName: string; requestCode: string; scheduleDate: string; note: string; phone: string; message: string } | null>(null);

  const isStaff = Boolean(userContext?.roles.some((role) => role === "WAKASEK" || role === "ADMIN"));
  const waitingSessions = useMemo(() => groupWaitingBadalRows(waitingRows), [waitingRows]);

  const loadData = useCallback(async () => {
    if (!isStaff) return;
    setLoading(true);
    setError("");
    try {
      const [queue, waiting] = await Promise.all([
        repository.listSubmittedRequests(150),
        repository.listWaitingCoverage(500),
      ]);
      setRequests(queue);
      setWaitingRows(waiting);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [isStaff, repository]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    void getCurrentUserContext()
      .then(setUserContext)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(() => {
    if (isStaff) void loadData();
  }, [isStaff, loadData]);

  // If the approval screen stays open across Jakarta midnight, refresh exactly
  // when the school date changes so yesterday's WAITING rows disappear without
  // requiring an operator refresh.
  useEffect(() => {
    if (!isStaff) return;
    let lastSchoolDate = getSchoolTodayISO();
    const timer = window.setInterval(() => {
      const nextSchoolDate = getSchoolTodayISO();
      if (nextSchoolDate !== lastSchoolDate) {
        lastSchoolDate = nextSchoolDate;
        void loadData();
      }
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [isStaff, loadData]);

  const openManagementEvidence = async (path: string) => {
    // Reserve a tab within the user click; browsers often block window.open
    // after awaiting a signed URL.
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    try {
      const url = await repository.getManagementEvidenceUrl(path);
      if (tab && !tab.closed) tab.location.replace(url);
      else window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      if (tab && !tab.closed) tab.close();
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleLogin = async () => {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await signInWithPassword({ email: email.trim(), password });
      const context = await getCurrentUserContext();
      setUserContext(context);
      setPassword("");
      if (!context?.roles.some((role) => role === "WAKASEK" || role === "ADMIN")) {
        setError("Login berhasil, tetapi akun ini bukan WAKASEK/ADMIN sehingga tidak boleh memutuskan izin.");
      } else {
        setMessage("Login Supabase berhasil. Antrean izin siap ditinjau.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    setError("");
    try {
      await signOut();
      setUserContext(null);
      setRequests([]);
      setWaitingRows([]);
      setMessage("Session Supabase ditutup.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const normalizedPhoneForTeacher = (teacherName: string): string => {
    const teacher = teachers.find((item) => item.nama.trim().toLocaleLowerCase("id-ID") === teacherName.trim().toLocaleLowerCase("id-ID"));
    return String(teacher?.whatsapp_e164 || "").replace(/[^0-9]/g, "");
  };

  const buildDeclineMessage = (request: LeaveReviewRequest, note: string): string => buildDeclineLeaveWhatsappMessage({
    teacherName: request.teacherName,
    teacher: findTeacherByName(teachers, request.teacherName),
    requestCode: request.requestCode,
    dateLabel: formatDate(request.scheduleDate),
    note,
  });

  const contactBeforeDecision = (request: LeaveReviewRequest) => {
    const phone = normalizedPhoneForTeacher(request.teacherName);
    if (!phone) {
      setError(`Nomor WhatsApp ${request.teacherName} belum tersedia di Master Guru.`);
      return;
    }
    const periods = request.periods.map((period) => `JP ${period.period}`).join(", ") || "-";
    const text = buildLeaveReviewWhatsappMessage({
      teacherName: request.teacherName,
      teacher: findTeacherByName(teachers, request.teacherName),
      requestCode: request.requestCode,
      dateLabel: formatDate(request.scheduleDate),
      reason: request.reason,
      periodLabel: periods,
      adminNote: notes[request.id] || "",
    });
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };

  const decide = async (request: LeaveReviewRequest, decision: "APPROVE" | "DECLINE") => {
    const verb = decision === "APPROVE" ? "MENYETUJUI" : "MENOLAK";
    const decisionNote = String(notes[request.id] || "").trim();
    if (decision === "DECLINE" && !decisionNote) {
      setError("Isi alasan/catatan penolakan terlebih dahulu agar dapat langsung dikirim ke guru.");
      return;
    }
    const confirmed = window.confirm(
      `${verb} pengajuan ${request.requestCode} dari ${request.teacherName}?${decision === "APPROVE" ? "\n\nJP mengajar akan otomatis masuk Waiting List Badal." : ""}`,
    );
    if (!confirmed) return;

    setDecidingId(request.id);
    setError("");
    setMessage("");
    try {
      const result = await repository.decideRequest({
        leaveRequestId: request.id,
        decision,
        note: decisionNote || undefined,
      });
      if (decision === "APPROVE") {
        setMessage(
          `${result.requestCode || request.requestCode} APPROVED. ${result.waitingCount} slot kelas masuk Waiting List Badal; ${result.freePeriodCount} JP free tetap statistik-only.`,
        );
      } else {
        const phone = normalizedPhoneForTeacher(request.teacherName);
        const declineMessage = buildDeclineMessage(request, decisionNote);
        setMessage(`${result.requestCode || request.requestCode} DECLINED. Tidak ada coverage/badal yang dibuat.`);
        setDeclineHandoff({
          teacherName: request.teacherName,
          requestCode: result.requestCode || request.requestCode,
          scheduleDate: request.scheduleDate,
          note: decisionNote,
          phone,
          message: declineMessage,
        });
      }
      setNotes((current) => ({ ...current, [request.id]: "" }));
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDecidingId(null);
    }
  };

  const goBack = () => {
    if (onBack) onBack();
    else window.location.href = "/";
  };

  if (!isSupabaseConfigured) {
    return (
      <div className="max-w-4xl mx-auto rounded-3xl border border-red-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3 text-red-700">
          <TriangleAlert className="w-6 h-6 mt-0.5" />
          <div>
            <h2 className="font-black text-lg">Supabase belum dikonfigurasi</h2>
            <p className="text-sm mt-1">Isi VITE_SUPABASE_URL dan VITE_SUPABASE_PUBLISHABLE_KEY di .env.local sebelum membuka Approval Izin.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <button onClick={goBack} className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 mb-2">
            <ArrowLeft className="w-4 h-4" /> Kembali
          </button>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <ClipboardCheck className="w-7 h-7 text-indigo-600" /> Persetujuan Izin & Waiting List Badal
          </h1>
          <p className="text-sm text-slate-500 mt-1">V3.13.3 • approval + waiting auto-expiry + shortcut WhatsApp pra-keputusan.</p>
        </div>
        {isStaff && (
          <button disabled={loading} onClick={() => void loadData()} className="px-4 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        )}
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="w-5 h-5 text-emerald-600" />
          <h2 className="font-black text-slate-900">Otorisasi Wakakur</h2>
        </div>
        {userContext ? (
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-2xl bg-slate-50 border border-slate-200 p-4">
            <div>
              <div className="font-black text-slate-900">{userContext.displayName}</div>
              <div className="text-sm text-slate-500">{userContext.user.email}</div>
              <div className={`text-xs font-bold mt-1 ${isStaff ? "text-emerald-700" : "text-red-600"}`}>Roles: {userContext.roles.join(", ") || "none"}</div>
            </div>
            <button onClick={() => void handleLogout()} className="px-4 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 font-bold text-sm flex items-center justify-center gap-2">
              <LogOut className="w-4 h-4" /> Logout Supabase
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-[1fr_1fr_auto] gap-3">
            <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email Supabase Auth Wakakur/Admin" className="border border-slate-200 rounded-xl px-4 py-3 text-sm" />
            <input value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void handleLogin()} placeholder="Password" type="password" className="border border-slate-200 rounded-xl px-4 py-3 text-sm" />
            <button disabled={loading || !email || !password} onClick={() => void handleLogin()} className="px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-black flex items-center gap-2 justify-center">
              <LogIn className="w-4 h-4" /> Login
            </button>
          </div>
        )}
      </section>

      {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800 text-sm font-semibold">{message}</div>}
      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-800 text-sm font-semibold">{error}</div>}

      {userContext && !isStaff && (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
          <div className="font-black flex items-center gap-2"><TriangleAlert className="w-5 h-5" /> Akses keputusan ditolak</div>
          <p className="text-sm mt-1">Backend hanya menerima akun Supabase dengan role WAKASEK atau ADMIN.</p>
        </div>
      )}

      {isStaff && (
        <>
          <section className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="font-black text-lg text-slate-900">Antrean Persetujuan</h2>
                <p className="text-xs text-slate-500 mt-0.5">SUBMITTED belum memengaruhi coverage sampai tombol Setujui ditekan.</p>
              </div>
              <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-black">{requests.length} MENUNGGU</span>
            </div>

            <div className="p-5 space-y-4">
              {loading && requests.length === 0 ? (
                <div className="text-sm text-slate-500 py-8 text-center">Memuat antrean...</div>
              ) : requests.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 border border-dashed border-slate-200 py-10 text-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                  <div className="font-black text-slate-700 mt-2">Tidak ada izin menunggu persetujuan</div>
                </div>
              ) : requests.map((request) => {
                const summary = summarizeLeaveRequest(request);
                const slotByPeriod = new Map<number, typeof request.slots>();
                for (const slot of request.slots) {
                  const list = slotByPeriod.get(slot.period) || [];
                  list.push(slot);
                  slotByPeriod.set(slot.period, list);
                }
                return (
                  <article key={request.id} className="rounded-2xl border border-slate-200 p-4 md:p-5 space-y-4">
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-black bg-slate-100 px-2 py-1 rounded-lg">{request.requestCode}</span>
                          <span className="text-[10px] font-black px-2 py-1 rounded-lg bg-amber-100 text-amber-800">SUBMITTED</span>
                          <span className="text-[10px] font-black px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700">{request.requestType}</span>
                        </div>
                        <div className="font-black text-lg text-slate-900 mt-2 flex items-center gap-2"><UserRound className="w-4 h-4 text-slate-400" /> {request.teacherName}</div>
                        <div className="text-sm text-slate-600 mt-1">{formatDate(request.scheduleDate)} • {request.reason}</div>
                        {request.detail && <div className="text-xs text-slate-500 mt-1">Catatan guru: {request.detail}</div>}
                        <div className="text-[11px] text-slate-400 mt-2">Diajukan {formatSubmittedAt(request.submittedAt)}</div>
                        {request.evidencePath && request.evidenceUploadedAt ? (
                          <button type="button" onClick={() => void openManagementEvidence(request.evidencePath)}
                            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800">
                            <Paperclip className="w-3.5 h-3.5" /> Lihat Bukti Izin Manajemen
                          </button>
                        ) : (
                          <div className="text-[11px] text-amber-700 font-semibold mt-2">Pengajuan lama — tidak ada bukti digital tercatat. Periksa manual sebelum memutuskan.</div>
                        )}
                        <p className="text-[10px] text-slate-400 mt-1">Screenshot adalah lampiran; keasliannya tetap harus diverifikasi oleh petugas.</p>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-2 text-center min-w-[240px]">
                        <div className="rounded-xl bg-slate-50 p-2"><div className="text-lg font-black">{summary.periodCount}</div><div className="text-[10px] text-slate-500">JP IZIN</div></div>
                        <div className="rounded-xl bg-indigo-50 p-2"><div className="text-lg font-black text-indigo-700">{summary.teachingPeriodCount}</div><div className="text-[10px] text-indigo-600">TEACHING</div></div>
                        <div className="rounded-xl bg-sky-50 p-2"><div className="text-lg font-black text-sky-700">{summary.freePeriodCount}</div><div className="text-[10px] text-sky-600">JP FREE</div></div>
                        <div className="rounded-xl bg-violet-50 p-2"><div className="text-lg font-black text-violet-700">{summary.teachingClassCount}</div><div className="text-[10px] text-violet-600">SLOT KELAS</div></div>
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {request.periods.map((period) => {
                        const periodSlots = slotByPeriod.get(period.period) || [];
                        const periodTask = request.tasks.find((task) => task.period === period.period);
                        const classLabel = periodSlots.map((slot) => slot.classCode).filter(Boolean).join(" + ");
                        const subjects = [...new Set(periodSlots.map((slot) => slot.subject).filter(Boolean))].join(" + ");
                        return (
                          <div key={period.id} className={`rounded-xl border p-3 ${period.periodType === "TEACHING" ? "border-indigo-200 bg-indigo-50/60" : "border-sky-200 bg-sky-50/60"}`}>
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-black text-sm">JP {period.period}</span>
                              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${period.periodType === "TEACHING" ? "bg-indigo-200 text-indigo-900" : "bg-sky-200 text-sky-900"}`}>{period.periodType}</span>
                            </div>
                            {period.periodType === "TEACHING" ? (
                              <div className="mt-1.5">
                                <div className="text-xs font-bold text-slate-800">{classLabel || "Kelas tidak terbaca"}</div>
                                <div className="text-[11px] text-slate-500">{subjects || "Mata pelajaran"}</div>
                                {(periodTask?.description || periodTask?.resources.length) ? (
                                  <div className="mt-2 rounded-lg border border-indigo-200 bg-white/80 p-2 space-y-1">
                                    <div className="text-[10px] font-black text-indigo-700 flex items-center gap-1"><BookOpen className="w-3 h-3" /> TUGAS DARI GURU</div>
                                    {periodTask.description && <div className="text-[11px] text-slate-700 whitespace-pre-wrap">{periodTask.description}</div>}
                                    {periodTask.resources.map((resource) => (
                                      <a key={resource.url} href={resource.url} target="_blank" rel="noreferrer" className="text-[10px] text-blue-700 hover:underline flex items-center gap-1 break-all">
                                        {resource.resourceType === "DRIVE_FILE" ? <Paperclip className="w-3 h-3 shrink-0" /> : <ExternalLink className="w-3 h-3 shrink-0" />}
                                        {resource.label || resource.fileName || resource.url}
                                      </a>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="mt-2 text-[10px] font-bold text-amber-700">⚠ Guru belum mengisi tugas untuk JP ini.</div>
                                )}
                              </div>
                            ) : (
                              <div className="text-[11px] text-sky-700 mt-1.5">Tidak membuat badal • statistik ketidakhadiran saja</div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="grid lg:grid-cols-[1fr_auto_auto_auto] gap-2 items-end pt-1">
                      <div>
                        <label className="text-[11px] font-bold text-slate-500">Catatan keputusan <span className="text-red-500">(wajib jika ditolak)</span></label>
                        <input
                          value={notes[request.id] || ""}
                          onChange={(event) => setNotes((current) => ({ ...current, [request.id]: event.target.value }))}
                          placeholder="Contoh: Disetujui sesuai informasi wali kelas"
                          className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm"
                        />
                      </div>
                      <button type="button" onClick={() => contactBeforeDecision(request)} className="px-4 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-black text-sm flex items-center justify-center gap-2">
                        <MessageCircle className="w-4 h-4" /> Hubungi Guru
                      </button>
                      <button disabled={decidingId === request.id} onClick={() => void decide(request, "DECLINE")} className="px-4 py-2.5 rounded-xl border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 font-black text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                        <XCircle className="w-4 h-4" /> Tolak
                      </button>
                      <button disabled={decidingId === request.id} onClick={() => void decide(request, "APPROVE")} className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                        <CheckCircle2 className="w-4 h-4" /> Setujui
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="font-black text-lg text-slate-900">Waiting List Badal</h2>
                <p className="text-xs text-slate-500 mt-0.5">Hanya approval TEACHING hari ini + ke depan. Yang tanggalnya sudah lewat otomatis diarsipkan EXPIRED; kelas gabungan tetap satu sesi operator.</p>
              </div>
              <span className="px-3 py-1 rounded-full bg-indigo-100 text-indigo-800 text-xs font-black">{waitingSessions.length} SESI</span>
            </div>
            <div className="p-5 space-y-3">
              {waitingSessions.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 border border-dashed border-slate-200 py-10 text-center text-slate-500 text-sm">Belum ada coverage berstatus WAITING.</div>
              ) : waitingSessions.map((session) => (
                <div key={session.key} className="rounded-2xl border border-slate-200 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {session.requestCode && <span className="font-mono text-[10px] font-black bg-slate-100 px-2 py-1 rounded-lg">{session.requestCode}</span>}
                      <span className="text-[10px] font-black bg-amber-100 text-amber-800 px-2 py-1 rounded-lg">WAITING</span>
                      {session.isCombinedSession && <span className="text-[10px] font-black bg-violet-100 text-violet-800 px-2 py-1 rounded-lg">KELAS GABUNG • {session.classCodes.length} KELAS</span>}
                    </div>
                    <div className="font-black text-slate-900 mt-2">{session.absentTeacherName}</div>
                    <div className="text-sm text-slate-700 mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>{formatDate(session.scheduleDate)}</span><span>•</span><span className="font-bold">JP {session.period}</span><span>•</span><span>{session.classLabel}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">{session.subject || "Mata pelajaran"} • {session.reason || "Izin"}</div>
                    {(session.taskText || session.taskUrls.length > 0) ? (
                      <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-2.5 max-w-2xl">
                        <div className="text-[10px] font-black text-emerald-800 flex items-center gap-1"><BookOpen className="w-3 h-3" /> TUGAS SUDAH DISIAPKAN GURU</div>
                        {session.taskText && <div className="text-xs text-slate-700 mt-1 whitespace-pre-wrap">{session.taskText}</div>}
                        {session.taskUrls.map((url) => (
                          <a key={url} href={url} target="_blank" rel="noreferrer" className="text-[10px] text-blue-700 hover:underline mt-1 flex items-center gap-1 break-all"><ExternalLink className="w-3 h-3 shrink-0" />{url}</a>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[10px] font-bold text-amber-700 mt-2">⚠ Tidak ada tugas dari guru untuk sesi ini.</div>
                    )}
                    <div className="text-[10px] text-slate-400 mt-1">Database: {session.coverageSlotIds.length} coverage row{session.coverageSlotIds.length > 1 ? "s" : ""}</div>
                  </div>
                  <a
                    href={buildBadalProcessingUrl(session)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Buka pengisian guru pengganti di tab baru; halaman persetujuan tetap terbuka"
                    className="shrink-0 px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm flex items-center justify-center gap-2"
                  >
                    <Clock3 className="w-4 h-4" /> Proses Badal ↗
                  </a>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
      {declineHandoff && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 bg-red-50">
              <div className="font-black text-red-900 text-lg">Pengajuan Ditolak</div>
              <div className="text-xs text-red-700 mt-1">Kirim alasan penolakan ke {declineHandoff.teacherName}.</div>
            </div>
            <div className="p-5 space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 whitespace-pre-wrap">{declineHandoff.message}</div>
              {!declineHandoff.phone && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">Nomor WhatsApp guru belum tersedia di Master Guru. Pesan tetap bisa disalin.</div>}
              <div className="flex flex-col sm:flex-row gap-2">
                <button type="button" onClick={() => void navigator.clipboard.writeText(declineHandoff.message)} className="flex-1 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-4 py-2.5 text-sm font-black text-slate-700 flex items-center justify-center gap-2"><Copy className="w-4 h-4" /> Salin Pesan</button>
                <button type="button" disabled={!declineHandoff.phone} onClick={() => window.open(`https://wa.me/${declineHandoff.phone}?text=${encodeURIComponent(declineHandoff.message)}`, "_blank", "noopener,noreferrer")} className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-4 py-2.5 text-sm font-black text-white flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"><MessageCircle className="w-4 h-4" /> Buka WhatsApp</button>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button type="button" onClick={() => setDeclineHandoff(null)} className="rounded-xl bg-slate-900 text-white px-4 py-2.5 text-sm font-black">Tutup</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeaveApprovalAdmin;
