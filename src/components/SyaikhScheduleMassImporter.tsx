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
import type { JadwalInsidentalItem, ScheduleItem } from "../domain/models";
import {
  matrixLooksLikeSyaikhRotation,
  parseSyaikhRotationMatrix,
  resolveSyaikhRotationImport,
  rotationMatrixFromPastedTsv,
} from "../domain/syaikhRotationImport";
import { ScheduleAdminRepository, type ScheduleAdminContext } from "../infrastructure/repositories/scheduleAdminRepository";
import { getCurrentUserContext } from "../infrastructure/auth/supabaseAuthRepository";
import { explainSyaikhPublishError, isSyaikhTeacherConflictRequired } from "../domain/syaikhRotationPublishErrors";
import { SyaikhAlternatingLegacyImporter } from "./SyaikhAlternatingLegacyImporter";

import { T } from '../i18n/LanguageProvider';

interface Props {
  schedules: ScheduleItem[];
  incidentals: JadwalInsidentalItem[];
  onBack: () => void;
  onPublished: () => Promise<void> | void;
}

type SheetMatrix = { name: string; matrix: unknown[][] };

type ParsedSource = {
  matrix: unknown[][];
  sourceFile: string;
  sourceSheet: string;
};

function defaultYear(): number {
  return new Date().getFullYear();
}

export const SyaikhScheduleMassImporter: React.FC<Props> = ({ schedules, incidentals, onBack, onPublished }) => {
  const repo = useMemo(() => new ScheduleAdminRepository(), []);
  const [context, setContext] = useState<ScheduleAdminContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [baseYear, setBaseYear] = useState(defaultYear());
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [subjectMatcher, setSubjectMatcher] = useState("NATIVE ARABIC");
  const [annotateSpecialNote, setAnnotateSpecialNote] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [alternatingMode, setAlternatingMode] = useState(false);
  const [workbookSheets, setWorkbookSheets] = useState<SheetMatrix[]>([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [parsedSource, setParsedSource] = useState<ParsedSource | null>(null);

  const loadContext = async () => {
    setLoading(true);
    setError(null);
    try {
      const auth = await getCurrentUserContext();
      if (!auth?.roles.includes("ADMIN")) throw new Error("Mass Import Jadwal Syaikh hanya dapat dijalankan oleh role ADMIN.");
      const ctx = await repo.loadContext();
      setContext(ctx);
      if (!selectedTeacherId) {
        const preferred = ctx.teachers.find((teacher) => /syaikh|syaikhoh/i.test(`${teacher.full_name} ${teacher.short_name || ""}`)) || ctx.teachers[0];
        if (preferred) setSelectedTeacherId(preferred.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data Supabase.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadContext(); }, []);

  const parsed = useMemo(() => {
    if (!parsedSource) return null;
    return parseSyaikhRotationMatrix(parsedSource.matrix, baseYear);
  }, [parsedSource, baseYear]);

  const resolution = useMemo(() => {
    if (!parsed || !context) return null;
    return resolveSyaikhRotationImport({
      parsed,
      schedules,
      incidentals,
      teachers: context.teachers,
      classes: context.classes,
      selectedSyaikhId: selectedTeacherId,
      subjectMatcher,
      annotateSpecialNote,
    });
  }, [parsed, context, schedules, incidentals, selectedTeacherId, subjectMatcher, annotateSpecialNote]);

  const selectParsedSheet = (name: string, sheets = workbookSheets) => {
    const sheet = sheets.find((entry) => entry.name === name);
    if (!sheet) return;
    setSelectedSheet(name);
    setParsedSource({ matrix: sheet.matrix, sourceFile: parsedSource?.sourceFile || "workbook.xlsx", sourceSheet: name });
    if (/quran/i.test(name)) setSubjectMatcher("TAHSIN");
    else if (/arabic/i.test(name)) setSubjectMatcher("NATIVE ARABIC");
  };

  const handleWorkbook = async (file: File) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheets = workbook.SheetNames.map((name) => ({
        name,
        matrix: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: false, defval: "" }) as unknown[][],
      })).filter((entry) => matrixLooksLikeSyaikhRotation(entry.matrix));
      if (!sheets.length) throw new Error("Tidak ditemukan sheet dengan header 'KELAS/ PEKAN'. Contoh yang didukung: N.ARABIC / N.QURAN.");
      setWorkbookSheets(sheets);
      const preferred = sheets.find((entry) => /n\.arabic/i.test(entry.name)) || sheets[0];
      setSelectedSheet(preferred.name);
      setParsedSource({ matrix: preferred.matrix, sourceFile: file.name, sourceSheet: preferred.name });
      if (/quran/i.test(preferred.name)) setSubjectMatcher("TAHSIN");
      else if (/arabic/i.test(preferred.name)) setSubjectMatcher("NATIVE ARABIC");
      setMessage(`Workbook terbaca. ${sheets.length} sheet rotasi ditemukan: ${sheets.map((entry) => entry.name).join(", ")}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membaca workbook.");
    } finally {
      setBusy(false);
    }
  };

  const handlePaste = () => {
    if (!pasteText.trim()) return setError("Paste area masih kosong.");
    setError(null);
    setWorkbookSheets([]);
    setSelectedSheet("clipboard");
    setParsedSource({ matrix: rotationMatrixFromPastedTsv(pasteText), sourceFile: "clipboard.tsv", sourceSheet: "clipboard" });
    setMessage("Tabel rotasi dari clipboard siap dianalisis.");
  };

  const publish = async () => {
    if (!resolution || !parsedSource) return;
    if (resolution.summary.errorCount > 0) return setError("Masih ada error pada preview. Selesaikan error sebelum Publish.");
    if (!resolution.rows.length) return setError("Tidak ada baris rotasi yang dapat dipublish.");
    if (resolution.summary.warningCount > 0 && !window.confirm(`Preview memiliki ${resolution.summary.warningCount} warning. Warning guru akan di-override secara eksplisit untuk batch ini. Tetap Publish?`)) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const rows = resolution.rows.map((row) => ({
        scheduleDate: row.scheduleDate,
        classId: row.classId,
        period: row.period,
        subject: row.subject,
        isCombined: row.isCombined,
        teacherIds: row.teacherIds,
        teacherNames: row.teacherNames,
        specialNote: row.specialNote,
        reason: row.reason,
        rotationStatus: row.rotationStatus,
        sourceCell: row.sourceCell,
        groupKey: row.groupKey,
      }));
      // Preview knows the planned rotation, but only Supabase knows all existing
      // master/incidental assignments. Never silently bypass its conflict checks.
      const submit = (allowTeacherConflict: boolean) => repo.publishSyaikhRotation({
        rows,
        sourceFile: parsedSource.sourceFile,
        sourceSheet: parsedSource.sourceSheet,
        allowTeacherConflict,
      });
      const initiallyConfirmed = resolution.summary.warningCount > 0;
      let result;
      try {
        result = await submit(initiallyConfirmed);
      } catch (initialError) {
        // The DB can find conflicts missed by the client preview, especially
        // when publishing two intentionally joined classes sequentially.
        if (!initiallyConfirmed && isSyaikhTeacherConflictRequired(initialError)) {
          const accepted = window.confirm(
            "Supabase mendeteksi guru yang terjadwal pada slot sama. Hal ini bisa terjadi pada kelas gabungan, tetapi bisa juga bentrok nyata.\n\n" +
            "Lanjutkan publish 1 batch dengan konfirmasi konflik guru? Periksa Jadwal Ruangan / Conflict Center setelahnya.\n\n" +
            "Batal = tidak ada perubahan tersimpan."
          );
          if (!accepted) {
            setError("Publish dibatalkan karena konflik guru belum dikonfirmasi. Tidak ada perubahan batch yang tersimpan.");
            return;
          }
          result = await submit(true);
        } else {
          throw initialError;
        }
      }
      setMessage(`Publish selesai: ${result.published ?? resolution.rows.length} incidental dibuat/diperbarui (${result.native_rows ?? resolution.summary.nativeRows} Native, ${result.normal_rows ?? resolution.summary.normalRows} Normal).`);
      try {
        await onPublished();
      } catch (refreshError) {
        setError(`Publish berhasil, tetapi refresh tampilan gagal: ${explainSyaikhPublishError(refreshError, resolution.rows)}. Gunakan tombol Refresh Supabase.`);
      }
    } catch (err) {
      setError(explainSyaikhPublishError(err, resolution.rows));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="min-h-[300px] flex items-center justify-center text-slate-500"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Membaca Master Data...</div>;
  }

  if (alternatingMode) return <SyaikhAlternatingLegacyImporter schedules={schedules} incidentals={incidentals} onBack={() => setAlternatingMode(false)} onPublished={onPublished} />;

  const activeTeachers = (context?.teachers || []).filter((teacher) => teacher.is_active !== false);
  const prioritizedTeachers = [...activeTeachers].sort((a, b) => {
    const aS = /syaikh|syaikhoh/i.test(`${a.full_name} ${a.short_name || ""}`) ? 0 : 1;
    const bS = /syaikh|syaikhoh/i.test(`${b.full_name} ${b.short_name || ""}`) ? 0 : 1;
    return aS - bS || a.full_name.localeCompare(b.full_name);
  });

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={onBack} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 hover:text-blue-700"><ArrowLeft className="w-4 h-4" /> Kembali</button>
        <div className="text-right"><h1 className="text-2xl font-black text-slate-900">Mass Import Jadwal Syaikh</h1><p className="text-sm text-slate-500">Rotation matrix → batch incidental. Native menambahkan/menjaga Syaikh; Normal melepas Syaikh tetapi mempertahankan guru pendamping.</p></div>
      </div>

      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{error}</div>}
      {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{message}</div>}

      <button type="button" onClick={() => setAlternatingMode(true)} className="w-full rounded-2xl border-2 border-violet-200 bg-violet-50 p-4 text-left text-sm font-bold text-violet-800 hover:bg-violet-100">↔ Mode fleksibel: Import Syaikh Ali dari TSV bertanggal (A/B opsional, tanpa rotasi otomatis)</button>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <label className="group cursor-pointer rounded-3xl border-2 border-dashed border-violet-200 bg-violet-50/60 p-6 hover:border-violet-400">
          <div className="flex items-start gap-4"><div className="rounded-2xl bg-violet-600 p-3 text-white"><Upload className="w-6 h-6" /></div><div><h2 className="font-black text-slate-900">Upload Workbook Rotasi</h2><p className="mt-1 text-sm text-slate-600">Sistem mencari sheet dengan format <strong>KELAS/ PEKAN</strong>, termasuk <strong>N.ARABIC</strong> dan <strong>N.QURAN</strong>.</p><p className="mt-3 text-xs font-bold text-violet-700">Klik untuk memilih .xlsx</p></div></div>
          <input type="file" accept=".xlsx,.xls" className="hidden" disabled={busy} onChange={(e) => { const file = e.target.files?.[0]; if (file) void handleWorkbook(file); e.currentTarget.value = ""; }} />
        </label>

        <div className="rounded-3xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-3"><FileSpreadsheet className="w-5 h-5 text-emerald-600" /><div><h2 className="font-black text-slate-900">Atau paste tabel rotasi</h2><p className="text-xs text-slate-500">Copy dari Excel / Google Sheets.</p></div></div>
          <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="KELAS/ PEKAN    12 - 16 OCT ..." className="mt-4 h-24 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs focus:border-violet-500 focus:outline-none" />
          <button onClick={handlePaste} disabled={busy} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white"><WandSparkles className="w-4 h-4" /> Analisis Paste</button>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5">
        <h2 className="font-black text-slate-900">Konfigurasi Rotasi</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {workbookSheets.length > 0 && <label className="text-xs font-bold text-slate-600">Sheet Rotasi<select value={selectedSheet} onChange={(e) => selectParsedSheet(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-sm">{workbookSheets.map((sheet) => <option key={sheet.name} value={sheet.name}>{sheet.name}</option>)}</select></label>}
          <label className="text-xs font-bold text-slate-600">Syaikh / Syaikhoh<select value={selectedTeacherId} onChange={(e) => setSelectedTeacherId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-sm"><option value="">— Pilih Guru —</option>{prioritizedTeachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.full_name}</option>)}</select></label>
          <label className="text-xs font-bold text-slate-600">Pencocokan Mapel<input value={subjectMatcher} onChange={(e) => setSubjectMatcher(e.target.value)} placeholder="mis. NATIVE ARABIC / TAHSIN" className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-sm" /></label>
          <label className="text-xs font-bold text-slate-600">Tahun Awal Tabel<input type="number" min={2020} max={2100} value={baseYear} onChange={(e) => setBaseYear(Number(e.target.value) || defaultYear())} className="mt-1 w-full rounded-xl border border-slate-200 p-2.5 text-sm" /></label>
        </div>
        <label className="mt-4 flex items-center gap-2 text-xs font-semibold text-slate-600"><input type="checkbox" checked={annotateSpecialNote} onChange={(e) => setAnnotateSpecialNote(e.target.checked)} /> Tambahkan label “Rotasi Syaikh: NATIVE/NORMAL” ke Keterangan Khusus.</label>
        <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800"><strong>Companion teacher otomatis:</strong> guru-guru pada jadwal master dipertahankan. Saat status NORMAL, Syaikh/Syaikhoh yang dipilih dilepas dari override; saat NATIVE, ia dipastikan ada. Mapel dan ruangan tetap mewarisi master.</div>
      </section>

      {resolution && parsedSource && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <Metric label="Sel rotasi" value={resolution.summary.parsedCells} tone="blue" />
            <Metric label="Baris publish" value={resolution.summary.publishRows} tone="violet" />
            <Metric label="Native" value={resolution.summary.nativeRows} tone="emerald" />
            <Metric label="Normal" value={resolution.summary.normalRows} tone="slate" />
            <Metric label="Warning" value={resolution.summary.warningCount} tone="amber" />
            <Metric label="Error" value={resolution.summary.errorCount} tone={resolution.summary.errorCount ? "rose" : "emerald"} />
          </div>

          {resolution.issues.length > 0 && <section className="rounded-3xl border border-slate-200 bg-white p-5"><h2 className="font-black text-slate-900">Preview Validation</h2><div className="mt-3 max-h-64 space-y-2 overflow-auto">{resolution.issues.map((issue, index) => <div key={`${issue.code}-${index}`} className={`rounded-xl border p-3 text-xs ${issue.severity === "ERROR" ? "border-rose-200 bg-rose-50 text-rose-800" : issue.severity === "WARNING" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-blue-200 bg-blue-50 text-blue-800"}`}><strong>{issue.severity} • {issue.code}</strong>{issue.sourceCell ? ` • ${issue.sourceCell}` : ""}<div className="mt-1">{issue.message}</div></div>)}</div></section>}

          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-5"><div><h2 className="font-black text-slate-900">Preview Incidentals</h2><p className="text-xs text-slate-500">Menampilkan maksimum 150 baris pertama. Publish tetap memproses seluruh batch.</p></div><span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">{parsedSource.sourceFile} • {parsedSource.sourceSheet}</span></div>
            <div className="max-h-[520px] overflow-auto"><table className="min-w-full text-left text-xs"><thead className="sticky top-0 bg-slate-100 text-slate-600"><tr><th className="p-3"><T>{"Tanggal"}</T></th><th className="p-3">Kelas</th><th className="p-3"><T>{"JP"}</T></th><th className="p-3">Status</th><th className="p-3"><T>{"Mapel"}</T></th><th className="p-3">Guru Effective</th></tr></thead><tbody className="divide-y divide-slate-100">{resolution.rows.slice(0, 150).map((row, index) => <tr key={`${row.groupKey}-${row.classId}-${index}`}><td className="p-3 font-bold whitespace-nowrap">{row.scheduleDate}</td><td className="p-3">{row.className}{row.isCombined ? <span className="ml-1 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">GABUNG</span> : null}</td><td className="p-3 font-black"><T>{"JP"}</T>{row.period}</td><td className="p-3"><span className={`rounded-lg px-2 py-1 font-black ${row.rotationStatus === "NATIVE" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>{row.rotationStatus}</span></td><td className="p-3">{row.subject}</td><td className="p-3">{row.teacherNames.join(" + ")}</td></tr>)}</tbody></table></div>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-5">
            <div className="text-xs text-slate-600">Publish bersifat <strong>idempotent</strong> untuk slot bertipe <code>SYAIKH_ROTATION</code>. Perubahan insidental lain pada slot yang sama akan diblokir, bukan ditimpa. <strong>0 warning pada preview tidak menjamin bebas bentrok di Supabase.</strong></div>
            <div className="flex gap-2"><button onClick={() => { setParsedSource(null); setWorkbookSheets([]); setMessage(null); setError(null); }} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-xs font-black text-slate-600"><RefreshCw className="w-4 h-4" /> Reset</button><button onClick={() => void publish()} disabled={busy || resolution.summary.errorCount > 0 || !resolution.rows.length} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-xs font-black text-white disabled:opacity-40"><Save className="w-4 h-4" /> {busy ? "Publishing..." : `Publish ${resolution.rows.length} Perubahan`}</button></div>
          </div>
          {error && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800 whitespace-pre-wrap">Gagal publish: {error}</div>}
          {message && <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{message}</div>}
        </>
      )}
    </div>
  );
};

const TONES: Record<string, string> = {
  blue: "border-blue-200 bg-blue-50 text-blue-900",
  violet: "border-violet-200 bg-violet-50 text-violet-900",
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
  amber: "border-amber-200 bg-amber-50 text-amber-900",
  rose: "border-rose-200 bg-rose-50 text-rose-900",
  slate: "border-slate-200 bg-slate-50 text-slate-900",
};

const Metric: React.FC<{ label: string; value: number; tone: string }> = ({ label, value, tone }) => (
  <div className={`rounded-2xl border p-4 ${TONES[tone] || TONES.slate}`}><div className="text-2xl font-black">{value}</div><div className="mt-1 text-[10px] font-black uppercase tracking-wider opacity-70">{label}</div></div>
);
