import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Save,
  Upload,
  Users,
  WandSparkles,
} from "lucide-react";
import type { ScheduleItem } from "../domain/models";
import {
  buildImportPublishPayload,
  matrixFromPastedTsv,
  normalizeImportKey,
  parseOriScheduleMatrix,
  resolveScheduleImport,
  type OriParsedRow,
  type ImportIssue,
} from "../domain/scheduleImport";
import { ScheduleAdminRepository, type ScheduleAdminContext } from "../infrastructure/repositories/scheduleAdminRepository";
import { getCurrentUserContext } from "../infrastructure/auth/supabaseAuthRepository";

interface ScheduleMassImporterProps {
  currentSchedules: ScheduleItem[];
  onBack: () => void;
  onPublished: () => Promise<void> | void;
}

type ParsedState = {
  rows: OriParsedRow[];
  issues: ImportIssue[];
  sourceFile: string;
  sourceSheet: string;
};

export const ScheduleMassImporter: React.FC<ScheduleMassImporterProps> = ({ currentSchedules, onBack, onPublished }) => {
  const [context, setContext] = useState<ScheduleAdminContext | null>(null);
  const [parsed, setParsed] = useState<ParsedState | null>(null);
  const [manualTeacherMap, setManualTeacherMap] = useState<Record<string, string>>({});
  const [pasteText, setPasteText] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"REPLACE_ACTIVE" | "MERGE">("REPLACE_ACTIVE");

  const repo = useMemo(() => new ScheduleAdminRepository(), []);

  const loadContext = async () => {
    setLoading(true);
    setError(null);
    try {
      const auth = await getCurrentUserContext();
      if (!auth?.roles.includes("ADMIN")) throw new Error("Mass Import Jadwal hanya dapat dijalankan oleh role ADMIN.");
      setContext(await repo.loadContext());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membaca Master Data Supabase.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadContext(); }, []);

  const resolution = useMemo(() => {
    if (!context || !parsed) return null;
    return resolveScheduleImport({
      parsedRows: parsed.rows,
      parserIssues: parsed.issues,
      teachers: context.teachers,
      classes: context.classes,
      aliases: context.aliases,
      manualTeacherMap,
      currentSchedules,
    });
  }, [context, parsed, manualTeacherMap, currentSchedules]);

  const parseMatrix = (matrix: unknown[][], sourceFile: string, sourceSheet = "ori") => {
    const result = parseOriScheduleMatrix(matrix);
    setManualTeacherMap({});
    setParsed({ rows: result.rows, issues: result.issues, sourceFile, sourceSheet });
    setMessage(`Parser membaca ${result.rows.length} slot dari ${sourceSheet}.`);
  };

  const handleWorkbook = async (file: File) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheetName = workbook.SheetNames.find((name) => name.trim().toLocaleLowerCase("id-ID") === "ori");
      if (!sheetName) throw new Error("Workbook tidak memiliki tab 'ori'.");
      const sheet = workbook.Sheets[sheetName];
      const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as unknown[][];
      parseMatrix(matrix, file.name, sheetName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membaca XLSX.");
    } finally {
      setBusy(false);
    }
  };

  const handlePasteParse = () => {
    if (!pasteText.trim()) return setError("Paste area masih kosong.");
    setError(null);
    parseMatrix(matrixFromPastedTsv(pasteText), "clipboard.tsv", "ori-paste");
  };

  const publish = async () => {
    if (!resolution || !parsed || !context) return;
    if (resolution.summary.errorCount > 0) {
      setError("Masih ada error pada draft. Selesaikan Alias Resolver / konflik sebelum Publish.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const aliasMappings = Object.entries(manualTeacherMap)
        .map(([aliasKey, teacherId]) => {
          const original = parsed.rows.flatMap((row) => row.teacherTokens).find((token) => normalizeImportKey(token) === aliasKey) || aliasKey;
          return { alias: original, teacherId };
        })
        .filter((item) => item.teacherId);
      await repo.saveTeacherAliases(aliasMappings);
      const result = await repo.publishImport({
        rows: buildImportPublishPayload(resolution.rows),
        sourceFile: parsed.sourceFile,
        sourceSheet: parsed.sourceSheet,
        mode,
      });
      setMessage(`Publish selesai: ${result.inserted ?? resolution.rows.length} slot aktif dibuat; ${result.deactivated ?? 0} slot lama diarsipkan.`);
      await onPublished();
      await loadContext();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish gagal.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="min-h-[300px] flex items-center justify-center text-slate-500"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Membaca Master Data...</div>;
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={onBack} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 hover:text-blue-700"><ArrowLeft className="w-4 h-4" /> Kembali</button>
        <div className="text-right"><h1 className="text-2xl font-black text-slate-900">Mass Schedule Importer</h1><p className="text-sm text-slate-500">Template-aware parser untuk tab <strong>ori</strong>.</p></div>
      </div>

      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{error}</div>}
      {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{message}</div>}

      <div className="grid gap-4 lg:grid-cols-2">
        <label className="group cursor-pointer rounded-3xl border-2 border-dashed border-blue-200 bg-blue-50/60 p-6 hover:border-blue-400">
          <div className="flex items-start gap-4"><div className="rounded-2xl bg-blue-600 p-3 text-white"><Upload className="w-6 h-6" /></div><div><h2 className="font-black text-slate-900">Upload XLSX</h2><p className="mt-1 text-sm text-slate-600">Pilih workbook jadwal sekolah. Sistem otomatis mencari tab <strong>ori</strong>.</p><p className="mt-3 text-xs font-bold text-blue-700">Klik untuk memilih file .xlsx</p></div></div>
          <input type="file" accept=".xlsx,.xls" className="hidden" disabled={busy} onChange={(e) => { const file = e.target.files?.[0]; if (file) void handleWorkbook(file); e.currentTarget.value = ""; }} />
        </label>

        <div className="rounded-3xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-3"><FileSpreadsheet className="w-5 h-5 text-emerald-600" /><div><h2 className="font-black text-slate-900">Atau paste dari Excel / Google Sheets</h2><p className="text-xs text-slate-500">Copy area tab ori lalu paste di sini.</p></div></div>
          <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="Paste tabel TSV di sini..." className="mt-4 h-28 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs focus:border-blue-500 focus:outline-none" />
          <button onClick={handlePasteParse} disabled={busy} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white"><WandSparkles className="w-4 h-4" /> Analisis Paste</button>
        </div>
      </div>

      {parsed && resolution && context && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Metric label="Slot terbaca" value={resolution.summary.parsedRows} tone="blue" />
            <Metric label="Slot resolved" value={resolution.summary.resolvedRows} tone="emerald" />
            <Metric label="Kelas gabung" value={resolution.summary.inferredCombinedGroups} tone="violet" />
            <Metric label="Warning" value={resolution.summary.warningCount} tone="amber" />
            <Metric label="Error" value={resolution.summary.errorCount} tone={resolution.summary.errorCount ? "rose" : "emerald"} />
          </div>

          {resolution.unresolvedTeacherTokens.length > 0 && (
            <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
              <div className="flex items-center gap-2"><Users className="w-5 h-5 text-amber-700" /><h2 className="font-black text-amber-950">Alias Resolver Guru</h2></div>
              <p className="mt-1 text-sm text-amber-800">Pilih guru canonical untuk nama panggilan yang belum dikenali. Mapping akan disimpan agar import tahun depan otomatis.</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {resolution.unresolvedTeacherTokens.map((token) => {
                  const key = normalizeImportKey(token);
                  return <label key={token} className="rounded-2xl border border-amber-200 bg-white p-3"><span className="block text-xs font-black text-slate-800">{token}</span><select value={manualTeacherMap[key] || ""} onChange={(e) => setManualTeacherMap((current) => ({ ...current, [key]: e.target.value }))} className="mt-2 w-full rounded-lg border border-slate-200 p-2 text-xs"><option value="">— Pilih Master Guru —</option>{context.teachers.filter((teacher) => teacher.is_active !== false).map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.full_name}{teacher.short_name ? ` (${teacher.short_name})` : ""}</option>)}</select></label>;
                })}
              </div>
            </section>
          )}

          {resolution.issues.length > 0 && (
            <section className="rounded-3xl border border-slate-200 bg-white p-5">
              <h2 className="font-black text-slate-900">Validation Report</h2>
              <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
                {resolution.issues.slice(0, 200).map((issue, index) => <div key={`${issue.code}-${index}`} className={`rounded-xl border px-3 py-2 text-xs ${issue.severity === "ERROR" ? "border-rose-200 bg-rose-50 text-rose-800" : issue.severity === "WARNING" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-blue-200 bg-blue-50 text-blue-800"}`}><strong>{issue.severity}</strong> • {issue.code}{issue.sourceCell ? ` • ${issue.sourceCell}` : ""}<br />{issue.message}</div>)}
              </div>
            </section>
          )}

          <section className="rounded-3xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-black text-slate-900">Draft Preview</h2><p className="text-xs text-slate-500">Menampilkan 120 slot pertama. Seluruh {resolution.rows.length} slot tetap dipublish.</p></div><div className="flex items-center gap-2 text-xs"><span className="rounded-lg bg-emerald-100 px-2 py-1 font-bold text-emerald-800">COMBINED = inferred</span><span className="rounded-lg bg-slate-100 px-2 py-1 font-bold text-slate-700">Room lama dipertahankan bila ada</span></div></div>
            <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200"><table className="min-w-full text-xs"><thead className="bg-slate-50 text-left text-slate-500"><tr><th className="p-3">Cell</th><th className="p-3">Hari / JP</th><th className="p-3">Kelas</th><th className="p-3">Mapel</th><th className="p-3">Guru</th><th className="p-3">Mode</th></tr></thead><tbody className="divide-y divide-slate-100">{resolution.rows.slice(0, 120).map((row) => <tr key={row.sourceCell} className="align-top"><td className="p-3 font-mono text-slate-400">{row.sourceCell}</td><td className="p-3 font-bold">{row.dayName} • JP {row.period}<br /><span className="font-normal text-slate-500">{row.startTime}–{row.endTime}</span></td><td className="p-3">{row.classDisplayName}</td><td className="p-3 font-bold">{row.canonicalSubject}</td><td className="p-3">{row.teachers.map((teacher) => teacher.teacherName || `⚠ ${teacher.token}`).join(" / ") || "—"}</td><td className="p-3">{row.isCombined ? <span className="rounded-md bg-emerald-100 px-2 py-1 font-bold text-emerald-800">COMBINED</span> : "NORMAL"}</td></tr>)}</tbody></table></div>
          </section>

          <section className="rounded-3xl border border-blue-200 bg-blue-50 p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"><div><h2 className="font-black text-blue-950">Publish ke Canonical Schedule</h2><p className="mt-1 max-w-2xl text-sm text-blue-800">Tidak ada hard delete. Jadwal lama diarsipkan dengan soft-delete sehingga audit/history tetap ada. Room lama untuk slot yang sama dipertahankan karena tab ori tidak membawa data ruangan.</p></div><div className="flex flex-wrap items-end gap-3"><label className="text-xs font-bold text-blue-900">Mode<select value={mode} onChange={(e) => setMode(e.target.value as "REPLACE_ACTIVE" | "MERGE")} className="mt-1 block rounded-xl border border-blue-200 bg-white p-2.5 text-slate-800"><option value="REPLACE_ACTIVE">Ganti Jadwal Aktif</option><option value="MERGE">Merge Slot yang Ada</option></select></label><button onClick={() => void publish()} disabled={busy || resolution.summary.errorCount > 0} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Publish {resolution.rows.length} Slot</button></div></div>
            {resolution.summary.errorCount > 0 && <p className="mt-3 flex items-center gap-2 text-xs font-bold text-rose-700"><AlertTriangle className="w-4 h-4" /> Publish terkunci sampai semua ERROR selesai.</p>}
            {resolution.summary.errorCount === 0 && <p className="mt-3 flex items-center gap-2 text-xs font-bold text-emerald-700"><CheckCircle2 className="w-4 h-4" /> Draft siap publish.</p>}
          </section>
        </>
      )}

      <button onClick={() => void loadContext()} className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-blue-700"><RefreshCw className="w-4 h-4" /> Refresh Master Data</button>
    </div>
  );
};

const Metric: React.FC<{ label: string; value: number; tone: "blue" | "emerald" | "violet" | "amber" | "rose" }> = ({ label, value, tone }) => {
  const tones = {
    blue: "border-blue-200 bg-blue-50 text-blue-900",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
    violet: "border-violet-200 bg-violet-50 text-violet-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    rose: "border-rose-200 bg-rose-50 text-rose-900",
  };
  return <div className={`rounded-2xl border p-4 ${tones[tone]}`}><div className="text-2xl font-black">{value}</div><div className="text-xs font-bold opacity-70">{label}</div></div>;
};
