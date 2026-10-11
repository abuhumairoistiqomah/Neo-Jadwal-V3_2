import React, { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Database,
  History,
  LogIn,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { InputGuruPengganti } from "./InputGuruPengganti";
import { isSupabaseConfigured } from "../infrastructure/supabase/client";
import {
  getCurrentUserContext,
  signInWithPassword,
  signOut,
  type CurrentUserContext,
} from "../infrastructure/auth/supabaseAuthRepository";
import { SupabaseScheduleRepository } from "../infrastructure/repositories/supabaseScheduleRepository";
import { SupabaseSubstituteConstraintRepository } from "../infrastructure/repositories/supabaseSubstituteConstraintRepository";
import { SupabaseInvalWriteRepository } from "../infrastructure/repositories/supabaseInvalWriteRepository";
import type {
  AuditLogRow,
  RecentOperationalCoverageRow,
} from "../infrastructure/repositories/invalWriteRepository";
import type { ScheduleDataSnapshot } from "../infrastructure/repositories/scheduleRepository";
import type { SubstituteConstraint } from "../domain/substituteAvailability";
import type { LogIzinItem } from "../domain/models";
import {
  buildInvalWriteBundle,
  type InvalRoomRelocationInput,
  type InvalWriteMetadata,
} from "../domain/inval/invalWrite";

function hasStaffRole(context: CurrentUserContext | null): boolean {
  return Boolean(context?.roles.some((role) => role === "ADMIN" || role === "WAKASEK"));
}

export default function SupabaseInvalCutover({ writeEnabled = false }: { writeEnabled?: boolean }) {
  const handoff = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const period = Number(params.get("period") || "");
    return {
      date: params.get("date") || undefined,
      teacher: params.get("teacher") || undefined,
      periods: Number.isInteger(period) && period >= 0 && period <= 6 ? [period] : [],
      reason: params.get("reason") || undefined,
      leaveCode: params.get("leave") || undefined,
    };
  }, []);

  const [userContext, setUserContext] = useState<CurrentUserContext | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [snapshot, setSnapshot] = useState<ScheduleDataSnapshot | null>(null);
  const [constraints, setConstraints] = useState<SubstituteConstraint[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [previewNotice, setPreviewNotice] = useState("");
  const [recentCoverage, setRecentCoverage] = useState<RecentOperationalCoverageRow[]>([]);
  const [recentAudit, setRecentAudit] = useState<AuditLogRow[]>([]);

  const scheduleRepository = useMemo(() => new SupabaseScheduleRepository(), []);
  const constraintRepository = useMemo(() => new SupabaseSubstituteConstraintRepository(), []);
  const writeRepository = useMemo(() => new SupabaseInvalWriteRepository(), []);

  const refreshWriteEvidence = async () => {
    if (!writeEnabled) return;
    const [coverage, audits] = await Promise.all([
      writeRepository.listRecentOperationalCoverage(20),
      writeRepository.listRecentAuditLogs(30),
    ]);
    setRecentCoverage(coverage);
    setRecentAudit(audits);
  };

  const reloadSupabaseSnapshot = async () => {
    const context = await getCurrentUserContext();
    if (!hasStaffRole(context)) throw new Error("Input Inval membutuhkan role ADMIN atau WAKASEK.");
    setUserContext(context);
    const [freshSnapshot, freshConstraints] = await Promise.all([
      scheduleRepository.loadSnapshot(),
      constraintRepository.listActiveConstraints(),
    ]);
    setSnapshot(freshSnapshot);
    setConstraints(freshConstraints);
    await refreshWriteEvidence();
    return freshSnapshot;
  };

  useEffect(() => {
    void getCurrentUserContext()
      .then(async (context) => {
        setUserContext(context);
        if (hasStaffRole(context)) {
          setLoading(true);
          try {
            await reloadSupabaseSnapshot();
            setMessage("Runtime Input Inval dimuat langsung dari Supabase.");
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          } finally {
            setLoading(false);
          }
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const handleLogin = async () => {
    setError("");
    setMessage("");
    setLoading(true);
    try {
      await signInWithPassword({ email: email.trim(), password });
      const current = await getCurrentUserContext();
      if (!hasStaffRole(current)) {
        await signOut();
        throw new Error("Akun ini tidak memiliki role ADMIN/WAKASEK.");
      }
      setUserContext(current);
      setPassword("");
      await reloadSupabaseSnapshot();
      setMessage("Login berhasil. Input Inval sekarang memakai Supabase tanpa parity Apps Script.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    setUserContext(null);
    setSnapshot(null);
    setConstraints([]);
    setRecentCoverage([]);
    setRecentAudit([]);
    setMessage("Session Supabase ditutup.");
  };

  const handleRefresh = async () => {
    setLoading(true);
    setError("");
    try {
      await reloadSupabaseSnapshot();
      setMessage("Snapshot Supabase diperbarui.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handlePersist = async (
    newLogs: Omit<LogIzinItem, "id">[],
    roomIncidental?: InvalRoomRelocationInput,
    metadata?: InvalWriteMetadata,
  ) => {
    if (!writeEnabled) throw new Error("Route preview bersifat read-only.");
    const context = await getCurrentUserContext();
    if (!hasStaffRole(context)) throw new Error("Role ADMIN/WAKASEK diperlukan untuk menyimpan badal.");
    if (!snapshot) throw new Error("Snapshot Supabase belum dimuat.");

    const bundle = buildInvalWriteBundle({
      logs: newLogs,
      roomIncidental,
      metadata,
      teachers: snapshot.teachers,
      constraints,
    });
    const result = await writeRepository.saveBundle(bundle);
    await reloadSupabaseSnapshot();
    setPreviewNotice(
      `Supabase write berhasil. ${result.coverageSlotIds.length} coverage slot tersimpan.${result.roomIncidentalId ? ` • relokasi ${result.roomIncidentalId}` : ""}`,
    );
  };

  const handleDeleteOperational = async (coverageSlotId: string) => {
    const log = snapshot?.logs.find((item) => item.id === coverageSlotId);
    const label = log ? `${log.tanggal} • ${log.kelas} • JP ${log.jam_ke}` : coverageSlotId;
    if (!window.confirm(`Soft-delete badal operasional ini?\n${label}\n\nHistory audit tetap dipertahankan.`)) return;
    try {
      await writeRepository.deleteAssignment({
        coverageSlotId,
        deleteNote: "Soft-delete dari V3.12.4 Supabase runtime.",
      });
      await reloadSupabaseSnapshot();
      setPreviewNotice("Badal dihapus secara soft-delete dari Supabase.");
    } catch (err) {
      setPreviewNotice(err instanceof Error ? err.message : String(err));
    }
  };

  const runtimeReady = writeEnabled && hasStaffRole(userContext) && Boolean(snapshot);
  const counts = snapshot ? [
    ["Guru", snapshot.teachers.length],
    ["Jadwal", snapshot.schedules.length],
    ["Log Izin", snapshot.logs.length],
    ["Insidental", snapshot.jadwalInsidental.length],
    ["Constraint", constraints.length],
  ] as const : [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8 md:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6 md:p-8 shadow-2xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div>
              <p className="text-fuchsia-400 text-xs font-black tracking-[0.2em] uppercase">TRACE V3.12.4</p>
              <h1 className="text-3xl font-black mt-2">Input Inval — Supabase Runtime</h1>
              <p className="text-slate-400 mt-2 max-w-3xl">Tidak ada fetch/parity Google Apps Script pada runtime admin. Tugas berasal dari pengajuan guru dan ikut terbawa ke coverage setelah approval.</p>
            </div>
            <div className={`px-4 py-2 rounded-xl text-sm font-black border ${isSupabaseConfigured ? "bg-emerald-950/60 text-emerald-300 border-emerald-800" : "bg-red-950/60 text-red-300 border-red-800"}`}>
              {isSupabaseConfigured ? "SUPABASE RUNTIME" : "ENV MISSING"}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-indigo-900/70 bg-indigo-950/20 p-5 text-indigo-100">
          <div className="font-black flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-indigo-300" /> Admin cutover</div>
          <p className="text-sm mt-2 text-indigo-200/80">Apps Script hanya tersisa sebagai Drive bridge pada form guru. Login, read, approval, waiting list, badal, task persistence, dan audit admin berjalan melalui Supabase.</p>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6 space-y-5">
          <div className="flex items-center gap-2"><Database className="w-5 h-5 text-emerald-400" /><h2 className="font-black text-lg">Session & Data Source</h2></div>
          {userContext ? (
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-2xl bg-slate-950 border border-slate-800 p-4">
              <div>
                <div className="font-black">{userContext.displayName}</div>
                <div className="text-sm text-slate-400">{userContext.user.email}</div>
                <div className="text-sm text-emerald-400 mt-1">Roles: {userContext.roles.join(", ") || "none"}</div>
              </div>
              <div className="flex gap-2">
                <button disabled={loading || !hasStaffRole(userContext)} onClick={() => void handleRefresh()} className="px-4 py-2 rounded-xl bg-indigo-700 hover:bg-indigo-600 disabled:opacity-40 font-bold flex items-center gap-2"><RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh Supabase</button>
                <button onClick={() => void handleLogout()} className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 font-bold flex items-center gap-2"><LogOut className="w-4 h-4" /> Logout</button>
              </div>
            </div>
          ) : (
            <div className="grid md:grid-cols-[1fr_1fr_auto] gap-3">
              <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email Supabase Auth" className="bg-slate-950 border border-slate-700 rounded-xl px-4 py-3" />
              <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" type="password" className="bg-slate-950 border border-slate-700 rounded-xl px-4 py-3" />
              <button disabled={loading} onClick={() => void handleLogin()} className="px-5 py-3 rounded-xl bg-emerald-600 disabled:opacity-40 hover:bg-emerald-500 font-black flex items-center gap-2 justify-center"><LogIn className="w-4 h-4" /> Login</button>
            </div>
          )}
          {message && <div className="rounded-xl border border-emerald-800 bg-emerald-950/40 px-4 py-3 text-emerald-200">{message}</div>}
          {error && <div className="rounded-xl border border-red-800 bg-red-950/40 px-4 py-3 text-red-200 flex gap-2"><TriangleAlert className="w-5 h-5 shrink-0" /> {error}</div>}
        </section>

        {snapshot && (
          <section className="rounded-3xl overflow-hidden border border-fuchsia-800 bg-white text-slate-900">
            <div className="bg-fuchsia-950 text-white px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-300" />
                <div>
                  <div className="font-black">LIVE INPUT INVAL — DATA SOURCE: SUPABASE</div>
                  <div className="text-xs text-fuchsia-200">{runtimeReady ? "WRITE ENABLED • Apps Script independent" : "Read-only"}</div>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">{counts.map(([label, count]) => <span key={label} className="text-[11px] bg-fuchsia-900 border border-fuchsia-700 rounded-lg px-2 py-1">{label}: {count}</span>)}</div>
            </div>
            {previewNotice && <div className="bg-amber-50 text-amber-900 border-b border-amber-200 px-5 py-3 text-sm font-semibold">{previewNotice}</div>}
            <div className="p-4 md:p-6 bg-slate-50">
              <InputGuruPengganti
                teachers={snapshot.teachers}
                schedules={snapshot.schedules}
                logs={snapshot.logs}
                jadwalInsidental={snapshot.jadwalInsidental}
                masterRuangan={snapshot.masterRuangan}
                kalenderAkademik={snapshot.kalenderAkademik}
                substituteConstraints={constraints}
                readOnlyPreview={!runtimeReady}
                initialDate={handoff.date}
                initialTeacherName={handoff.teacher}
                initialPeriods={handoff.periods}
                initialReason={handoff.reason}
                taskOwnership={handoff.leaveCode ? "LEAVE_TEACHER" : "OPERATOR"}
                onAddLogs={handlePersist}
                onBack={() => { window.location.href = window.location.pathname; }}
              />
            </div>
          </section>
        )}

        {runtimeReady && snapshot && (
          <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6 space-y-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2"><History className="w-5 h-5 text-cyan-400" /><h2 className="font-black text-lg">Recent Supabase Write Evidence</h2></div>
              <button onClick={() => void refreshWriteEvidence()} className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold flex items-center gap-2"><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
            </div>
            <div className="grid lg:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 space-y-3">
                <div className="font-black text-sm text-cyan-300">Recent operational badal</div>
                {recentCoverage.length === 0 ? <div className="text-xs text-slate-500">Belum ada write operasional.</div> : recentCoverage.map((row) => {
                  const log = snapshot.logs.find((item) => item.id === row.id);
                  return (
                    <div key={row.id} className="rounded-xl border border-slate-800 bg-slate-900 p-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-black text-white">{log ? `${log.tanggal} • ${log.kelas} • JP ${log.jam_ke}` : row.id}</div>
                        <div className="text-xs text-slate-400 mt-1">{log ? `${log.guru_izin} → ${log.guru_pengganti || "WAITING"}` : `${row.source} • ${row.status}`}</div>
                      </div>
                      <button onClick={() => void handleDeleteOperational(row.id)} className="shrink-0 p-2 rounded-lg bg-red-950/50 border border-red-900 text-red-300 hover:bg-red-900/50" title="Soft-delete"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  );
                })}
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 space-y-3">
                <div className="font-black text-sm text-violet-300">Recent audit</div>
                {recentAudit.length === 0 ? <div className="text-xs text-slate-500">Belum ada audit.</div> : recentAudit.map((row) => (
                  <div key={row.id} className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                    <div className="text-xs font-black text-white">{row.action}</div>
                    <div className="text-[11px] text-slate-400 mt-1">{row.entityType} • {row.entityId}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
