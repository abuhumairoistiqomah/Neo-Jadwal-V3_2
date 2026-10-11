import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  DownloadCloud,
  LogIn,
  LogOut,
  Play,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import {
  getCurrentUserContext,
  signInWithPassword,
  signOut,
  type CurrentUserContext,
} from "../infrastructure/auth/supabaseAuthRepository";
import {
  buildLegacyMigrationPlan,
  migrationHasBlockers,
  type LegacyMigrationPlan,
} from "../infrastructure/migration/legacyMigration";
import {
  fetchLegacyMigrationSource,
  runLegacyMigration,
  verifyLegacyMigration,
  type MigrationProgress,
  type MigrationResultCounts,
  type MigrationVerification,
} from "../infrastructure/migration/legacyMigrationRepository";
import { isSupabaseConfigured } from "../infrastructure/supabase/client";

const emptyProgress: MigrationProgress = { phase: "idle", detail: "", completed: 0, total: 0 };

function countCards(plan: LegacyMigrationPlan): { label: string; value: number }[] {
  return [
    { label: "Guru", value: plan.teachers.length },
    { label: "Kelas", value: plan.classes.length },
    { label: "Ruangan", value: plan.rooms.length },
    { label: "Room Block", value: plan.roomUnavailability.length },
    { label: "Jadwal", value: plan.schedules.length },
    { label: "Insidental", value: plan.incidentals.length },
    { label: "Kalender", value: plan.academicEvents.length },
    { label: "Log Izin", value: plan.coverage.length },
  ];
}

export default function SupabaseMigrationTool() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [context, setContext] = useState<CurrentUserContext | null>(null);
  const [sourceUrl, setSourceUrl] = useState(() => localStorage.getItem("db_api_url") || "");
  const [plan, setPlan] = useState<LegacyMigrationPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [progress, setProgress] = useState<MigrationProgress>(emptyProgress);
  const [result, setResult] = useState<MigrationResultCounts | null>(null);
  const [verification, setVerification] = useState<MigrationVerification | null>(null);

  const blockers = useMemo(
    () => plan?.issues.filter((issue) => issue.severity === "BLOCKING") || [],
    [plan],
  );
  const warnings = useMemo(
    () => plan?.issues.filter((issue) => issue.severity === "WARNING") || [],
    [plan],
  );
  const isAdmin = Boolean(context?.roles.includes("ADMIN"));

  const refreshContext = async () => {
    try {
      setContext(await getCurrentUserContext());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  useEffect(() => {
    void refreshContext();
  }, []);

  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await signInWithPassword({ email: email.trim(), password });
      setPassword("");
      await refreshContext();
      setMessage("Login berhasil. Fetch source Spreadsheet lalu review preflight.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setBusy(true);
    try {
      await signOut();
      setContext(null);
      setPlan(null);
      setResult(null);
      setVerification(null);
      setMessage("Session Supabase dihapus.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const analyze = async () => {
    setBusy(true);
    setMessage("");
    setResult(null);
    setVerification(null);
    try {
      const source = await fetchLegacyMigrationSource(sourceUrl);
      const nextPlan = buildLegacyMigrationPlan(source);
      setPlan(nextPlan);
      setConfirmation("");
      localStorage.setItem("db_api_url", sourceUrl.trim());
      setMessage(
        `Preflight selesai. ${nextPlan.issues.length} issue (${nextPlan.issues.filter((x) => x.severity === "BLOCKING").length} blocking). Legacy akun diabaikan: ${nextPlan.ignoredAccountCount}.`,
      );
    } catch (error) {
      setPlan(null);
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const migrate = async () => {
    if (!plan) return;
    setBusy(true);
    setMessage("");
    setVerification(null);
    try {
      const migrationResult = await runLegacyMigration(plan, setProgress);
      setResult(migrationResult);
      setMessage("Import selesai. Jalankan Verify untuk membandingkan count source vs Supabase.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!plan) return;
    setBusy(true);
    setMessage("");
    try {
      const next = await verifyLegacyMigration(plan);
      setVerification(next);
      setMessage(next.ok ? "Verification PASS — count source dan Supabase sesuai." : "Verification menemukan perbedaan count.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <p className="text-xs font-black tracking-[0.2em] text-cyan-400">TRACE V3.6.2</p>
          <h1 className="text-2xl sm:text-3xl font-black mt-1">Spreadsheet → Supabase Migration</h1>
          <p className="text-sm text-slate-400 mt-2 max-w-3xl">
            Staging-only tool. Fetch data dari Apps Script, normalize + validate, lalu import menggunakan ADMIN session dan RLS. Tidak memakai secret/service-role key.
          </p>
        </header>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-bold flex items-center gap-2"><Database className="w-5 h-5" /> Auth & Environment</h2>
              <p className="text-xs text-slate-400 mt-1">Migrasi wajib memakai role ADMIN.</p>
            </div>
            <span className={`text-xs font-black px-3 py-1 rounded-full border ${isSupabaseConfigured ? "text-emerald-300 border-emerald-500/30 bg-emerald-500/10" : "text-red-300 border-red-500/30 bg-red-500/10"}`}>
              {isSupabaseConfigured ? "SUPABASE READY" : "NOT CONFIGURED"}
            </span>
          </div>

          {context ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="font-bold">{context.displayName}</p>
                <p className="text-xs text-slate-400">{context.user.email}</p>
                <p className={`text-xs mt-1 font-bold ${isAdmin ? "text-emerald-300" : "text-red-300"}`}>Roles: {context.roles.join(", ") || "(none)"}</p>
              </div>
              <button type="button" onClick={logout} disabled={busy} className="inline-flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50">
                <LogOut className="w-4 h-4" /> Logout
              </button>
            </div>
          ) : (
            <form onSubmit={login} className="grid md:grid-cols-[1fr_1fr_auto] gap-3">
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email Supabase Auth" className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2.5 text-sm" />
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2.5 text-sm" />
              <button type="submit" disabled={busy || !isSupabaseConfigured} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-2.5 font-bold text-sm disabled:opacity-50">
                <LogIn className="w-4 h-4" /> Login
              </button>
            </form>
          )}
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="font-bold flex items-center gap-2"><DownloadCloud className="w-5 h-5" /> Source & Preflight</h2>
          <div className="mt-4 flex flex-col sm:flex-row gap-3">
            <input
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/.../exec"
              className="flex-1 rounded-lg bg-slate-950 border border-slate-700 px-3 py-2.5 text-sm"
            />
            <button type="button" onClick={analyze} disabled={busy || !isAdmin || !sourceUrl.trim()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 px-4 py-2.5 font-bold text-sm disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} /> Fetch + Analyze
            </button>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">V3.6.2 memakai <code>?migration=1</code> otomatis dan menambahkan parity check untuk stale legacy rows.</p>

          {plan && (
            <div className="mt-6 space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                {countCards(plan).map((item) => (
                  <div key={item.label} className="rounded-xl bg-slate-950 border border-slate-800 p-3">
                    <p className="text-[10px] uppercase font-bold text-slate-500">{item.label}</p>
                    <p className="text-xl font-black mt-1">{item.value}</p>
                  </div>
                ))}
              </div>

              <div className="grid lg:grid-cols-2 gap-4">
                <div className={`rounded-xl border p-4 ${blockers.length ? "border-red-500/30 bg-red-500/5" : "border-emerald-500/30 bg-emerald-500/5"}`}>
                  <h3 className="font-bold flex items-center gap-2">{blockers.length ? <ShieldAlert className="w-5 h-5 text-red-400" /> : <CheckCircle2 className="w-5 h-5 text-emerald-400" />} Blocking issues: {blockers.length}</h3>
                  <div className="mt-3 max-h-48 overflow-y-auto space-y-2 text-xs">
                    {blockers.length === 0 ? <p className="text-emerald-300">Tidak ada blocker. Plan boleh diimport.</p> : blockers.map((issue, idx) => <p key={`${issue.code}-${idx}`} className="text-red-200"><strong>{issue.code}</strong>{issue.rowId ? ` • ${issue.rowId}` : ""}: {issue.message}</p>)}
                  </div>
                </div>
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                  <h3 className="font-bold flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-400" /> Warnings: {warnings.length}</h3>
                  <div className="mt-3 max-h-48 overflow-y-auto space-y-2 text-xs">
                    {warnings.length === 0 ? <p className="text-slate-400">Tidak ada warning.</p> : warnings.map((issue, idx) => <p key={`${issue.code}-${idx}`} className="text-amber-100"><strong>{issue.code}</strong>{issue.rowId ? ` • ${issue.rowId}` : ""}: {issue.message}</p>)}
                  </div>
                </div>
              </div>

              <div className="text-xs text-slate-400">Empty rows skipped: {plan.skippedEmptyRows} • Legacy account rows ignored: {plan.ignoredAccountCount}</div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="font-bold flex items-center gap-2"><Play className="w-5 h-5" /> Import & Verify</h2>
          <p className="text-xs text-slate-400 mt-1">Import disabled sampai preflight bebas blocker dan kamu mengetik MIGRATE.</p>
          <div className="mt-4 grid sm:grid-cols-[1fr_auto_auto] gap-3">
            <input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} placeholder="Ketik MIGRATE" className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2.5 text-sm" />
            <button type="button" onClick={migrate} disabled={busy || !plan || migrationHasBlockers(plan) || confirmation !== "MIGRATE" || !isAdmin} className="rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2.5 font-bold text-sm disabled:opacity-50">Run Migration</button>
            <button type="button" onClick={verify} disabled={busy || !plan || !isAdmin} className="rounded-lg bg-violet-600 hover:bg-violet-500 px-4 py-2.5 font-bold text-sm disabled:opacity-50">Verify Parity</button>
          </div>

          {progress.phase !== "idle" && (
            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm">
              <p className="font-bold">{progress.detail}</p>
              <p className="text-xs text-slate-500 mt-1">Phase {progress.completed}/{progress.total} • {progress.phase}</p>
            </div>
          )}

          {result && (
            <div className="mt-4 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
              <p className="font-bold text-blue-200">Import result</p>
              <pre className="text-xs mt-2 overflow-x-auto text-slate-300">{JSON.stringify(result, null, 2)}</pre>
            </div>
          )}

          {verification && (
            <div className={`mt-4 rounded-xl border p-4 ${verification.ok ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"}`}>
              <p className={`font-black ${verification.ok ? "text-emerald-300" : "text-red-300"}`}>{verification.ok ? "VERIFY PASS" : "VERIFY FAIL"}</p>
              {verification.differences.length > 0 && <div className="text-xs mt-2 space-y-1 text-red-200">{verification.differences.map((line) => <p key={line}>{line}</p>)}</div>}
            </div>
          )}

          {message && <div className="mt-4 rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-slate-300">{message}</div>}
        </section>

        <p className="text-center text-[11px] text-slate-600">Staging only. Normal E-Jadwal tidak menjalankan tool ini tanpa query parameter <code>supabase-migrate=1</code>.</p>
      </div>
    </div>
  );
}
