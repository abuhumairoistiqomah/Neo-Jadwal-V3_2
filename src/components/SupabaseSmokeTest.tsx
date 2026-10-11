import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, Database, LogIn, LogOut, Play, ShieldCheck } from "lucide-react";
import {
  getCurrentUserContext,
  signInWithPassword,
  signOut,
  type CurrentUserContext,
} from "../infrastructure/auth/supabaseAuthRepository";
import { isSupabaseConfigured } from "../infrastructure/supabase/client";
import {
  runSupabaseSmokeSuite,
  type SmokeStepResult,
} from "../infrastructure/supabase/smoke";

function statusClasses(status: SmokeStepResult["status"]): string {
  if (status === "PASS") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (status === "FAIL") return "border-red-200 bg-red-50 text-red-900";
  return "border-amber-200 bg-amber-50 text-amber-900";
}

export function SupabaseSmokeTest() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [context, setContext] = useState<CurrentUserContext | null>(null);
  const [results, setResults] = useState<SmokeStepResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const passCount = useMemo(
    () => results.filter((item) => item.status === "PASS").length,
    [results],
  );

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

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setResults([]);

    try {
      await signInWithPassword({ email: email.trim(), password });
      setPassword("");
      await refreshContext();
      setMessage("Login berhasil. Jalankan smoke suite.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    setBusy(true);
    setMessage("");
    try {
      await signOut();
      setContext(null);
      setResults([]);
      setMessage("Session Supabase telah dihapus.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleRun = async () => {
    setBusy(true);
    setMessage("");
    try {
      setResults(await runSupabaseSmokeSuite());
      await refreshContext();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <header className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-emerald-500/15 border border-emerald-500/20 p-3">
              <ShieldCheck className="w-7 h-7 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">TRACE V3.5.1</p>
              <h1 className="text-2xl font-black mt-1">Live Supabase Smoke Test</h1>
              <p className="text-sm text-slate-400 mt-2 max-w-2xl">
                Staging-only diagnostic untuk Auth, RLS, reference-data read, anonymous denial, dan ADMIN write + cleanup.
                Halaman normal E-Jadwal tidak menggunakan panel ini.
              </p>
            </div>
          </div>
        </header>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="font-bold flex items-center gap-2"><Database className="w-5 h-5" /> Environment</h2>
              <p className="text-xs text-slate-400 mt-1">Publishable key boleh berada di browser; secret/service-role key tidak boleh.</p>
            </div>
            <span className={`px-3 py-1.5 rounded-full text-xs font-bold border ${
              isSupabaseConfigured
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                : "bg-red-500/10 border-red-500/30 text-red-300"
            }`}>
              {isSupabaseConfigured ? "CONFIGURED" : "NOT CONFIGURED"}
            </span>
          </div>

          {context ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl bg-slate-950/60 border border-slate-800 p-4">
              <div>
                <p className="font-bold">{context.displayName}</p>
                <p className="text-xs text-slate-400 mt-1">{context.user.email}</p>
                <p className="text-xs text-emerald-300 mt-1">Roles: {context.roles.join(", ") || "(none)"}</p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                disabled={busy}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-sm font-bold"
              >
                <LogOut className="w-4 h-4" /> Logout
              </button>
            </div>
          ) : (
            <form onSubmit={handleLogin} className="grid md:grid-cols-[1fr_1fr_auto] gap-3">
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Email Supabase Auth"
                autoComplete="username"
                required
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
              />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
                autoComplete="current-password"
                required
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                disabled={busy || !isSupabaseConfigured}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2.5 font-bold text-sm"
              >
                <LogIn className="w-4 h-4" /> Login
              </button>
            </form>
          )}

          {message && (
            <div className="mt-4 rounded-lg border border-slate-700 bg-slate-950/70 px-4 py-3 text-sm text-slate-300">
              {message}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
            <div>
              <h2 className="font-bold">Smoke Suite</h2>
              <p className="text-xs text-slate-400 mt-1">ADMIN write probe membuat satu room temporer lalu langsung menghapusnya.</p>
            </div>
            <button
              type="button"
              onClick={handleRun}
              disabled={busy || !context}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-2.5 font-bold text-sm"
            >
              <Play className="w-4 h-4" /> {busy ? "Running..." : "Run Smoke Test"}
            </button>
          </div>

          {results.length > 0 && (
            <div className="mb-4 text-sm font-bold text-slate-300">
              Result: {passCount}/{results.length} PASS
            </div>
          )}

          <div className="space-y-3">
            {results.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-500">
                Login sebagai ADMIN lalu jalankan smoke test.
              </div>
            ) : (
              results.map((result) => (
                <div key={result.id} className={`rounded-xl border p-4 ${statusClasses(result.status)}`}>
                  <div className="flex items-start gap-3">
                    {result.status === "PASS" ? (
                      <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0" />
                    ) : (
                      <CircleAlert className="w-5 h-5 mt-0.5 shrink-0" />
                    )}
                    <div>
                      <p className="font-black text-sm">{result.status} — {result.label}</p>
                      <p className="text-xs mt-1 opacity-80 break-words">{result.detail}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <p className="text-center text-[11px] text-slate-600">
          Do not use this panel in production. Open normal E-Jadwal without the <code>supabase-smoke=1</code> query parameter.
        </p>
      </div>
    </div>
  );
}

export default SupabaseSmokeTest;
