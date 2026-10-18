import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, ClipboardPaste, Loader2, Save, WandSparkles } from "lucide-react";
import type { JadwalInsidentalItem, ScheduleItem } from "../domain/models";
import { LEGACY_ROTATION_HEADER } from "../domain/syaikhAlternatingLegacyImport";
import {
  buildFlexibleDatedRotation, getFlexibleTemplateSlots, parseFlexibleDatedTSV,
  prepareFlexibleWeek, type FlexibleScenarioChoice,
} from "../domain/syaikhFlexibleDatedImport";
import { ScheduleAdminRepository, type ScheduleAdminContext } from "../infrastructure/repositories/scheduleAdminRepository";
import { getCurrentUserContext } from "../infrastructure/auth/supabaseAuthRepository";
import { explainSyaikhPublishError, isSyaikhTeacherConflictRequired } from "../domain/syaikhRotationPublishErrors";
import { SearchableSelect } from "./ui/SearchableSelect";

import { T } from '../i18n/LanguageProvider';
interface Props {
  schedules: ScheduleItem[];
  incidentals: JadwalInsidentalItem[];
  onBack: () => void;
  onPublished: () => Promise<void> | void;
}
function schoolMonday(): string {
  const now = new Date();
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(now).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const date = new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() || 7) - 1));
  return date.toISOString().slice(0, 10);
}
const dayNames = ["", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];

/** Syaikh Ali: explicit dated decisions, NEVER automatic weekly A/B parity. */
export const SyaikhAlternatingLegacyImporter: React.FC<Props> = ({ schedules, incidentals, onBack, onPublished }) => {
  const repo = useMemo(() => new ScheduleAdminRepository(), []);
  const [context, setContext] = useState<ScheduleAdminContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [aText, setAText] = useState(LEGACY_ROTATION_HEADER + "\n");
  const [bText, setBText] = useState(LEGACY_ROTATION_HEADER + "\n");
  const [datedText, setDatedText] = useState(LEGACY_ROTATION_HEADER + "\n");
  const [monday, setMonday] = useState(schoolMonday);
  const [selections, setSelections] = useState<Record<string, FlexibleScenarioChoice>>({});
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const auth = await getCurrentUserContext();
        if (!auth?.roles.includes("ADMIN")) throw new Error("Hanya ADMIN yang dapat mempublish jadwal Syaikh.");
        const ctx = await repo.loadContext();
        if (!active) return;
        setContext(ctx);
        setTeacherId(ctx.teachers.find((t) => /ali.*sinan/i.test(t.full_name))?.id || "");
      } catch (err) { if (active) setError(err instanceof Error ? err.message : String(err)); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [repo]);

  const templates = useMemo(() => getFlexibleTemplateSlots(aText, bText), [aText, bText]);
  const resolution = useMemo(() => context ? buildFlexibleDatedRotation({
    datedText, selectedSyaikhId: teacherId, classes: context.classes,
    teachers: context.teachers, aliases: context.aliases, schedules, incidentals,
  }) : null, [datedText, teacherId, context, schedules, incidentals]);
  const errors = resolution?.issues.filter((issue) => issue.severity === "ERROR") || [];
  const warnings = resolution?.issues.filter((issue) => issue.severity === "WARNING") || [];

  const fillFromTemplate = () => {
    const result = prepareFlexibleWeek({ aText, bText, monday, selections });
    const blocking = result.issues.filter((issue) => issue.severity === "ERROR");
    if (blocking.length) { setError(blocking.map((issue) => `${issue.code}: ${issue.message}`).join("\n")); return; }
    if (!result.lines.length) { setError("Belum ada slot A/B yang dipilih. Pilih skenario per kelas/JP atau paste TSV bertanggal langsung."); return; }
    const old = datedText.trim().split(/\r?\n/).filter(Boolean);
    const merged = [old[0] || LEGACY_ROTATION_HEADER, ...old.slice(1), ...result.lines].join("\n") + "\n";
    const checked = parseFlexibleDatedTSV(merged);
    const duplicates = checked.issues.filter((issue) => issue.severity === "ERROR");
    if (duplicates.length) { setError(duplicates.map((issue) => `${issue.code}: ${issue.message}`).join("\n")); return; }
    setDatedText(merged);
    setError(""); setMessage(`${result.lines.length} baris ditambahkan untuk pekan ${monday}. ${result.skipped} slot dilewati. Silakan edit daftar bertanggal sebelum Analisis/Publish.`);
    setShowPreview(false);
    setSelections({}); // Do not assume the next week's plan or carry last week's choice.
  };

  const publish = async () => {
    if (!resolution || errors.length || !resolution.rows.length || busy) return;
    if (!window.confirm(`Publish ${resolution.rows.length} jadwal aktual bertanggal yang sudah dipilih?\n\nTidak ada rotasi otomatis di pekan lain. Master tidak berubah.\n\nWarning: ${warnings.length}. Periksa jadwal guru dan slot sebelum melanjutkan.`)) return;
    setBusy(true); setError(""); setMessage("");
    const rows = resolution.rows.map((row) => ({ scheduleDate: row.scheduleDate, classId: row.classId, period: row.period,
      subject: row.subject, isCombined: row.isCombined, teacherIds: row.teacherIds,
      teacherNames: row.teacherNames, specialNote: row.specialNote, reason: row.reason,
      rotationStatus: row.rotationStatus, sourceCell: row.sourceCell, groupKey: row.groupKey }));
    const submit = (allowTeacherConflict: boolean) => repo.publishSyaikhRotation({
      rows, sourceFile: "syaikh-ali-dated-flexible.tsv", sourceSheet: "Dated explicit",
      allowTeacherConflict,
    });
    try {
      let result;
      try { result = await submit(warnings.length > 0); }
      catch (err) {
        if (isSyaikhTeacherConflictRequired(err) && warnings.length === 0 && window.confirm("Supabase mendeteksi bentrok guru. Periksa gabungan/ruangan. Tetap lanjutkan?")) {
          result = await submit(true);
        } else throw err;
      }
      setMessage(`Publish berhasil: ${result.published ?? rows.length} jadwal insidental bertanggal. Tidak ada penjadwalan otomatis untuk tanggal lainnya.`);
      try { await onPublished(); }
      catch { setError("Publish berhasil tetapi refresh gagal. Klik Refresh Supabase."); }
    } catch (err) { setError(explainSyaikhPublishError(err, resolution.rows)); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="p-8 text-sm text-slate-600 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin"/> Membaca Master Guru dan Kelas...</div>;
  return <div className="space-y-5 pb-12">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <button type="button" onClick={onBack} className="px-4 py-2 rounded-xl border bg-white text-sm font-bold flex gap-2 items-center"><ArrowLeft className="w-4 h-4"/> Kembali ke Native/Normal</button>
      <div><h1 className="text-xl font-black text-slate-900">Import Fleksibel Syaikh Ali — TSV Bertanggal</h1>
        <p className="text-xs text-slate-600">Pilih jadwal nyata per tanggal. Template A/B hanya bantuan, tanpa pergantian otomatis.</p></div>
    </div>
    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 space-y-2">
      <p className="font-bold">Dua cara input, tetap 14 kolom TSV lama</p>
      <p><b>Cara tercepat:</b> langsung paste baris jadwal berisi tanggal sebenarnya pada daftar akhir. Atau isi template A dan B sekali, kemudian pilih <b>A / B / Lewati</b> untuk tiap kelas dan JP pada pekan yang diinginkan. Klik "Tambahkan ke Daftar" untuk meninjau/mengubahnya.</p>
      <p><b>LEWATI bukan pembatalan:</b> sistem tidak membuat insidental, sehingga jadwal master mungkin tetap tampil. Jika kelas libur, gunakan Kalender Akademik atau proses pembatalan yang sesuai.</p>
    </div>
    <div className="rounded-2xl border bg-white p-4 max-w-lg">
      <label className="text-xs font-bold text-slate-700">Syaikh
        <SearchableSelect value={teacherId} onChange={(value) => { setTeacherId(value); setShowPreview(false); }}
          options={(context?.teachers || []).filter((t) => t.is_active !== false).map((t) => ({ value: t.id, label: t.full_name }))} placeholder="Pilih Syaikh Ali" />
      </label>
    </div>
    <details className="rounded-2xl border bg-white p-4" open>
      <summary className="font-black text-slate-900 cursor-pointer">Opsional — gunakan template skenario A/B untuk mengisi per pekan</summary>
      <p className="text-xs text-slate-600 mt-2">Tanggal di template hanya penentu hari. Skenario A dan B tidak wajib lengkap berpasangan; cukup isi yang tersedia.</p>
      <div className="grid lg:grid-cols-2 gap-4 mt-3">
        {(["A", "B"] as const).map((scenario) => <div key={scenario}>
          <label className="text-sm font-bold">Template {scenario}</label>
          <textarea aria-label={`TSV skenario ${scenario}`} spellCheck={false} value={scenario === "A" ? aText : bText}
            onChange={(e) => { if (scenario === "A") setAText(e.target.value); else setBText(e.target.value); }}
            className="h-36 w-full border rounded-xl p-3 text-xs font-mono mt-1" />
        </div>)}
      </div>
      <div className="flex flex-wrap gap-3 items-end mt-3">
        <label className="text-xs font-bold text-slate-700">Senin pekan yang disiapkan
          <input type="date" value={monday} onChange={(e) => {setMonday(e.target.value); setSelections({});}} className="block mt-1 border rounded-xl px-3 py-2" />
        </label>
        <button type="button" onClick={() => setSelections(Object.fromEntries(templates.slots.map((slot) => [slot.key, slot.a ? "A" : "SKIP"])))} className="border rounded-lg px-3 py-2 text-xs font-bold">Pilih semua A yang tersedia</button>
        <button type="button" onClick={() => setSelections(Object.fromEntries(templates.slots.map((slot) => [slot.key, slot.b ? "B" : "SKIP"])))} className="border rounded-lg px-3 py-2 text-xs font-bold">Pilih semua B yang tersedia</button>
        <button type="button" onClick={() => setSelections({})} className="border rounded-lg px-3 py-2 text-xs font-bold">Lewati semua</button>
      </div>
      {templates.issues.map((issue, index) => <p key={index} className="mt-2 text-xs text-rose-700">{issue.code}: {issue.message}</p>)}
      {templates.slots.length > 0 && <div className="overflow-auto max-h-72 mt-3 border rounded-xl"><table className="w-full min-w-[600px] text-xs"><thead className="sticky top-0 bg-slate-100"><tr><th className="p-2 text-left">Kelas</th><th>Hari</th><th><T>{"JP"}</T></th><th>Pilih untuk pekan ini</th></tr></thead><tbody>{templates.slots.map((slot) => <tr key={slot.key} className="border-t"><td className="p-2 font-semibold">{slot.className}</td><td>{dayNames[slot.isoDay]}</td><td className="text-center">{slot.period}</td><td className="p-2"><select aria-label={`Pilihan ${slot.className} JP${slot.period}`} value={selections[slot.key] || "SKIP"} onChange={(e) => setSelections((old) => ({ ...old, [slot.key]: e.target.value as FlexibleScenarioChoice }))} className="border rounded-lg p-2 w-full"><option value="SKIP">Lewati — jangan ubah</option>{slot.a && <option value="A">A: {slot.a.subject}</option>}{slot.b && <option value="B">B: {slot.b.subject}</option>}</select></td></tr>)}</tbody></table></div>}
      <button type="button" disabled={!templates.slots.length || templates.issues.some((i) => i.severity === "ERROR")} onClick={fillFromTemplate}
        className="mt-3 px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-sm disabled:opacity-40">Tambahkan Pilihan Pekan Ini ke Daftar Bertanggal</button>
      <p className="mt-2 text-xs text-slate-500">Untuk pekan berikutnya, ubah Senin dan pilih ulang secara manual. Tidak ada pewarisan pilihan otomatis.</p>
    </details>
    <section className="rounded-2xl border bg-white p-4 space-y-3">
      <h2 className="font-black text-slate-900">Daftar jadwal aktual bertanggal — INI yang akan di-publish</h2>
      <p className="text-xs text-slate-600">Paste TSV 14 kolom lama langsung di sini, atau tambahkan dari pilihan A/B di atas. Edit/putuskan tiap tanggal sebelum Analisis.</p>
      <textarea aria-label="TSV jadwal aktual bertanggal" spellCheck={false} value={datedText} onChange={(e) => {setDatedText(e.target.value); setShowPreview(false);}}
        className="w-full h-56 border rounded-xl p-3 font-mono text-xs" />
      <button type="button" onClick={() => void navigator.clipboard.writeText(LEGACY_ROTATION_HEADER)} className="text-xs font-bold text-indigo-700 flex gap-2 items-center"><ClipboardPaste className="w-4 h-4"/> Salin header TSV</button>
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">Lewati baris = tidak ada override. Jangan masukkan dua baris untuk satu kelas/tanggal/JP.</p>
        <button type="button" onClick={() => {setShowPreview(true); setError(""); setMessage("");}}
          className="bg-slate-900 px-5 py-2.5 rounded-xl text-white text-sm font-bold flex gap-2 items-center"><WandSparkles className="w-4 h-4"/> Analisis Jadwal Aktual</button></div>
    </section>
    {showPreview && resolution && <>
      <div className="flex flex-wrap gap-3 text-sm font-bold"><span className="bg-blue-50 rounded-xl p-3">Baris TSV: {resolution.inputCount}</span><span className="bg-indigo-50 rounded-xl p-3">Siap Publish: {resolution.rows.length}</span><span className="bg-amber-50 rounded-xl p-3">Warning: {warnings.length}</span><span className="bg-rose-50 rounded-xl p-3">Error: {errors.length}</span></div>
      {!!resolution.issues.length && <div className="border rounded-xl p-3 max-h-64 overflow-auto space-y-1">{resolution.issues.slice(0,100).map((issue, i) => <p key={i} className={`text-xs rounded-md p-2 ${issue.severity === "ERROR" ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-900"}`}><b>{issue.severity} — {issue.code}</b> {issue.sourceCell}: {issue.message}</p>)}</div>}
      <div className="overflow-auto max-h-96 rounded-xl border"><table className="w-full min-w-[800px] text-xs text-left"><thead className="sticky top-0 bg-slate-100"><tr>{["Tanggal", "Kelas", "JP", "Mapel", "Guru", "Status"].map((col) => <th key={col} className="p-2">{col}</th>)}</tr></thead><tbody>{resolution.rows.slice(0,150).map((row, i) => <tr key={i} className="border-t"><td className="p-2">{row.scheduleDate}</td><td className="p-2">{row.className}</td><td className="p-2">{row.period}</td><td className="p-2">{row.subject}</td><td className="p-2">{row.teacherNames.join(" + ")}</td><td className="p-2">{row.rotationStatus}</td></tr>)}</tbody></table></div>
      <button type="button" onClick={() => void publish()} disabled={busy || errors.length > 0 || !resolution.rows.length}
        className="bg-violet-600 text-white font-bold px-5 py-3 rounded-xl disabled:opacity-40 flex gap-2 items-center">
        {busy ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>} Publish {resolution.rows.length} baris bertanggal
      </button>
    </>}
    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 whitespace-pre-wrap">{error}</p>}
    {message && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 flex gap-2"><CheckCircle2 className="w-5 h-5"/> {message}</p>}
  </div>;
};
