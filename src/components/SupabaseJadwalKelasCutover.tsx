import React, { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Database,
  LogIn,
  LogOut,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { JadwalKelas } from "./JadwalKelas";
import { isSupabaseConfigured } from "../infrastructure/supabase/client";
import {
  getCurrentUserContext,
  signInWithPassword,
  signOut,
  type CurrentUserContext,
} from "../infrastructure/auth/supabaseAuthRepository";
import { SupabaseScheduleRepository } from "../infrastructure/repositories/supabaseScheduleRepository";
import type { ScheduleDataSnapshot } from "../infrastructure/repositories/scheduleRepository";
import {
  buildLegacyMigrationPlan,
  migrationHasBlockers,
  sanitizeLegacyPayload,
} from "../infrastructure/migration/legacyMigration";
import { legacyPlanToScheduleSnapshot } from "../infrastructure/migration/legacyPlanSnapshot";
import {
  compareScheduleDataSnapshotSections,
  type SnapshotParityResult,
} from "../domain/schedule/snapshotParity";

const DEFAULT_API_URL = "https://script.google.com/macros/s/AKfycbweCcMn4d389P4vyTFf6qM17pxNWfjzqYnTcMEkAtjak8NFXzM0tqt7Nb5xDdx5hbn2jw/exec";

function migrationUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  return `${trimmed}${trimmed.includes("?") ? "&" : "?"}migration=1`;
}

const JADWAL_KELAS_SECTIONS = ["teachers", "schedules", "masterRuangan", "logs"] as const;

export default function SupabaseJadwalKelasCutover() {
  const [userContext, setUserContext] = useState<CurrentUserContext | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [legacyUrl, setLegacyUrl] = useState(() => localStorage.getItem("db_api_url") || DEFAULT_API_URL);
  const [supabaseSnapshot, setSupabaseSnapshot] = useState<ScheduleDataSnapshot | null>(null);
  const [parity, setParity] = useState<SnapshotParityResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [previewNotice, setPreviewNotice] = useState("");

  useEffect(() => {
    void getCurrentUserContext()
      .then(setUserContext)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const counts = useMemo(() => {
    if (!supabaseSnapshot) return [];
    return [
      ["Guru", supabaseSnapshot.teachers.length],
      ["Jadwal", supabaseSnapshot.schedules.length],
      ["Ruangan", supabaseSnapshot.masterRuangan.length],
      ["Log Izin", supabaseSnapshot.logs.length],
    ] as const;
  }, [supabaseSnapshot]);

  const handleLogin = async () => {
    setError("");
    setMessage("");
    try {
      await signInWithPassword({ email: email.trim(), password });
      const current = await getCurrentUserContext();
      setUserContext(current);
      setPassword("");
      setMessage("Login Supabase berhasil.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleLogout = async () => {
    await signOut();
    setUserContext(null);
    setSupabaseSnapshot(null);
    setParity(null);
    setMessage("Session Supabase ditutup.");
  };

  const handleCompare = async () => {
    setLoading(true);
    setError("");
    setMessage("");
    setParity(null);
    setPreviewNotice("");

    try {
      const context = await getCurrentUserContext();
      if (!context) throw new Error("Login Supabase diperlukan sebelum cutover Jadwal Kelas.");
      setUserContext(context);

      const response = await fetch(migrationUrl(legacyUrl));
      if (!response.ok) throw new Error(`Apps Script source returned HTTP ${response.status}.`);
      const raw = await response.json();
      const plan = buildLegacyMigrationPlan(sanitizeLegacyPayload(raw));
      if (migrationHasBlockers(plan)) {
        const blockers = plan.issues.filter((issue) => issue.severity === "BLOCKING");
        throw new Error(`Legacy source masih punya ${blockers.length} blocker. Jalankan preflight migrasi terlebih dahulu.`);
      }

      const legacy = legacyPlanToScheduleSnapshot(plan);
      const supabase = await new SupabaseScheduleRepository().loadSnapshot();
      const result = compareScheduleDataSnapshotSections(
        legacy,
        supabase,
        [...JADWAL_KELAS_SECTIONS],
      );

      setSupabaseSnapshot(supabase);
      setParity(result);
      setMessage(
        result.ok
          ? "Jadwal Kelas parity PASS. Preview di bawah sekarang memakai data Supabase."
          : `Jadwal Kelas parity menemukan ${result.differences.length} perbedaan. Preview tetap tersedia untuk inspeksi.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 px-4 py-8 md:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6 md:p-8 shadow-2xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div>
              <p className="text-cyan-400 text-xs font-black tracking-[0.2em] uppercase">TRACE V3.7.3</p>
              <h1 className="text-3xl font-black mt-2">Jadwal Kelas Consumer Cutover — Shadow Mode</h1>
              <p className="text-slate-400 mt-2 max-w-3xl">
                Halaman normal E-Jadwal belum berubah. Route ini membandingkan data yang dipakai Jadwal Kelas lalu merender komponen existing langsung dari Supabase.
              </p>
            </div>
            <div className={`px-4 py-2 rounded-xl text-sm font-black border ${isSupabaseConfigured ? "bg-emerald-950/60 text-emerald-300 border-emerald-800" : "bg-red-950/60 text-red-300 border-red-800"}`}>
              {isSupabaseConfigured ? "SUPABASE CONFIGURED" : "ENV MISSING"}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6 space-y-5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h2 className="font-black text-lg">Session & Source</h2>
          </div>

          {userContext ? (
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-2xl bg-slate-950 border border-slate-800 p-4">
              <div>
                <div className="font-black">{userContext.displayName}</div>
                <div className="text-sm text-slate-400">{userContext.user.email}</div>
                <div className="text-sm text-emerald-400 mt-1">Roles: {userContext.roles.join(", ") || "none"}</div>
              </div>
              <button onClick={handleLogout} className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 font-bold flex items-center gap-2 justify-center">
                <LogOut className="w-4 h-4" /> Logout
              </button>
            </div>
          ) : (
            <div className="grid md:grid-cols-[1fr_1fr_auto] gap-3">
              <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email Supabase Auth" className="bg-slate-950 border border-slate-700 rounded-xl px-4 py-3" />
              <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" type="password" className="bg-slate-950 border border-slate-700 rounded-xl px-4 py-3" />
              <button onClick={handleLogin} className="px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-black flex items-center gap-2 justify-center">
                <LogIn className="w-4 h-4" /> Login
              </button>
            </div>
          )}

          <div className="grid md:grid-cols-[1fr_auto] gap-3">
            <input value={legacyUrl} onChange={(event) => setLegacyUrl(event.target.value)} className="bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm" />
            <button disabled={loading || !userContext} onClick={handleCompare} className="px-5 py-3 rounded-xl bg-blue-600 disabled:opacity-40 hover:bg-blue-500 font-black flex items-center gap-2 justify-center">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Load + Compare
            </button>
          </div>

          {message && <div className="rounded-xl border border-emerald-800 bg-emerald-950/40 px-4 py-3 text-emerald-200">{message}</div>}
          {error && <div className="rounded-xl border border-red-800 bg-red-950/40 px-4 py-3 text-red-200">{error}</div>}
        </section>

        {parity && (
          <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6 space-y-5">
            <div className="flex items-center gap-3">
              {parity.ok ? <CheckCircle2 className="w-7 h-7 text-emerald-400" /> : <TriangleAlert className="w-7 h-7 text-amber-400" />}
              <div>
                <div className={`text-2xl font-black ${parity.ok ? "text-emerald-300" : "text-amber-300"}`}>
                  {parity.ok ? "JADWAL KELAS PARITY PASS" : "JADWAL KELAS PARITY NEEDS REVIEW"}
                </div>
                <div className="text-sm text-slate-400">Teachers, schedules, rooms, and Log Izin are compared because Jadwal Kelas now also marks active badal for the current week.</div>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {parity.sections.map((section) => (
                <div key={section.section} className={`rounded-2xl border p-4 ${section.ok ? "border-emerald-900 bg-emerald-950/20" : "border-amber-800 bg-amber-950/20"}`}>
                  <div className="text-xs uppercase tracking-wider text-slate-400 font-black">{section.section}</div>
                  <div className="mt-1 text-xl font-black">{section.actualCount} <span className="text-xs text-slate-500">/ expected {section.expectedCount}</span></div>
                  <div className={`text-xs mt-2 font-bold ${section.ok ? "text-emerald-400" : "text-amber-400"}`}>{section.ok ? "MATCH" : "DIFF"}</div>
                </div>
              ))}
            </div>

            {!parity.ok && (
              <div className="rounded-2xl bg-slate-950 border border-slate-800 p-4 max-h-72 overflow-auto text-xs font-mono whitespace-pre-wrap text-amber-200">
                {parity.differences.join("\n\n")}
              </div>
            )}
          </section>
        )}

        {supabaseSnapshot && (
          <section className="rounded-3xl overflow-hidden border border-cyan-800 bg-white text-slate-900">
            <div className="bg-cyan-950 text-white px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Database className="w-5 h-5 text-cyan-300" />
                <div>
                  <div className="font-black">LIVE JADWAL KELAS PREVIEW — DATA SOURCE: SUPABASE</div>
                  <div className="text-xs text-cyan-200">Read-only shadow cutover. Editing tetap dimatikan di preview ini.</div>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {counts.map(([label, count]) => (
                  <span key={label} className="text-[11px] bg-cyan-900 border border-cyan-700 rounded-lg px-2 py-1">{label}: {count}</span>
                ))}
              </div>
            </div>
            {previewNotice && <div className="bg-amber-50 text-amber-900 border-b border-amber-200 px-5 py-3 text-sm font-semibold">{previewNotice}</div>}
            <div className="p-4 md:p-6 bg-slate-50">
              <JadwalKelas
                teachers={supabaseSnapshot.teachers}
                schedules={supabaseSnapshot.schedules}
                masterRuangan={supabaseSnapshot.masterRuangan}
                kalenderAkademik={supabaseSnapshot.kalenderAkademik}
                logs={supabaseSnapshot.logs}
                isAdmin={false}
                onBack={() => setPreviewNotice("Preview V3.7.3 berada di route diagnostik; tombol kembali tidak mengubah halaman normal E-Jadwal.")}
              />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
