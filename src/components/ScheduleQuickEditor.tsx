import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import type { JadwalInsidentalItem, KalenderAkademikItem, LogIzinItem, ScheduleItem } from "../domain/models";
import { buildDatedEditorAvailability } from "../domain/schedule/editorDatedAvailability";
import { SearchableSelect } from "./ui/SearchableSelect";
import { normalizeImportKey } from "../domain/scheduleImport";
import { rankScheduleEditorTeachers, scheduleEditorCandidateLabel } from "../domain/scheduleEditorCandidate";
import { ScheduleAdminRepository, type ScheduleAdminContext } from "../infrastructure/repositories/scheduleAdminRepository";
import { getCurrentUserContext } from "../infrastructure/auth/supabaseAuthRepository";
import { dateMatchesScheduleDay, nextOccurrenceISO, type ScheduleMutationMode } from "../domain/scheduleMutation";
import { parseScheduleClassMode, type ScheduleClassMode } from "../domain/schedule/classMode";
import { timeForInput, validateDatedTimeOverride } from "../domain/schedule/datedTimeOverride";

import { T } from '../i18n/LanguageProvider';
const DAY_OPTIONS = [
  { name: "Senin", value: 1 },
  { name: "Selasa", value: 2 },
  { name: "Rabu", value: 3 },
  { name: "Kamis", value: 4 },
  { name: "Jumat", value: 5 },
  { name: "Sabtu", value: 6 },
];

interface ScheduleQuickEditorProps {
  items: ScheduleItem[];
  allSchedules: ScheduleItem[];
  incidentals?: JadwalInsidentalItem[];
  logs?: LogIzinItem[];
  kalenderAkademik?: KalenderAkademikItem[];
  initialDate?: string;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

function dayNumber(day: string): number {
  return DAY_OPTIONS.find((entry) => normalizeImportKey(entry.name) === normalizeImportKey(day))?.value || 1;
}

function inferRotationWeeks(note: string): number {
  const match = String(note || "").match(/(?:1\s*kali\s*\/\s*)?(2|3|4)\s*minggu/i);
  return match ? Number(match[1]) : 4;
}

export const ScheduleQuickEditor: React.FC<ScheduleQuickEditorProps> = ({ items, allSchedules, incidentals = [], logs = [], kalenderAkademik = [], initialDate, onClose, onSaved }) => {
  const primary = items[0];
  // Opening a dated effective slot must not leak its temporary clock into
  // the default permanent-edit fields.
  const canonicalMaster = allSchedules.find((row) =>
    row.id === (primary as (ScheduleItem & { masterId?: string }) | undefined)?.masterId
    || row.id === primary?.id);
  const masterStart = canonicalMaster?.mulai || primary?.mulai || "";
  const masterEnd = canonicalMaster?.selesai || primary?.selesai || "";
  const repo = useMemo(() => new ScheduleAdminRepository(), []);
  const [context, setContext] = useState<ScheduleAdminContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState(primary?.mapel || "");
  const [classId, setClassId] = useState<string>("");
  const [day, setDay] = useState(dayNumber(primary?.hari || "Senin"));
  const [period, setPeriod] = useState(Number(primary?.jam_ke || 1));
  const [startTime, setStartTime] = useState(masterStart);
  const [endTime, setEndTime] = useState(masterEnd);
  const [useDatedTime, setUseDatedTime] = useState(false);
  const [roomId, setRoomId] = useState(primary?.ruangan || "");
  const initialClassMode = parseScheduleClassMode(primary?.kelasgabung);
  const [combined, setCombined] = useState(initialClassMode === "ALTERNATING" ? false : items.length > 1 || initialClassMode === "COMBINED");
  const [alternating, setAlternating] = useState(initialClassMode === "ALTERNATING");
  const [specialNote, setSpecialNote] = useState(primary?.keterangan_khusus || "");
  const [rotationEveryWeeks, setRotationEveryWeeks] = useState(() => inferRotationWeeks(primary?.keterangan_khusus || ""));
  const [teacherIds, setTeacherIds] = useState<string[]>([]);
  const [mutationMode, setMutationMode] = useState<ScheduleMutationMode>("PERMANENT");
  const [incidentalDate, setIncidentalDate] = useState(() => {
    const candidate = String(initialDate || "").trim();
    return candidate && dateMatchesScheduleDay(candidate, primary?.hari || "")
      ? candidate
      : nextOccurrenceISO(primary?.hari || "Senin");
  });
  const [incidentalReason, setIncidentalReason] = useState("");
  const [incidentalType, setIncidentalType] = useState("Perubahan Jadwal");

  useEffect(() => {
    void getCurrentUserContext().then(async (auth) => {
      if (!auth?.roles.includes("ADMIN")) throw new Error("Quick Edit Jadwal hanya dapat dijalankan oleh role ADMIN.");
      return repo.loadContext();
    }).then((ctx) => {
      setContext(ctx);
      const currentClass = ctx.classes.find((row) => normalizeImportKey(row.display_name) === normalizeImportKey(primary?.kelas) || normalizeImportKey(row.code) === normalizeImportKey(primary?.kelas));
      setClassId(currentClass?.id || "");
      const currentNames = [primary?.guru1, primary?.guru2, primary?.guru3, primary?.guru4, primary?.guru5, primary?.guru6].filter(Boolean).map(String);
      const ids = currentNames.map((name) => ctx.teachers.find((teacher) => [teacher.full_name, teacher.short_name, teacher.legacy_name].some((candidate) => normalizeImportKey(candidate) === normalizeImportKey(name)))?.id).filter(Boolean) as string[];
      setTeacherIds(ids);
    }).catch((err) => setError(err instanceof Error ? err.message : "Gagal memuat editor jadwal.")).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (mutationMode !== "INCIDENTAL") return;
    const existing = incidentals.find((row) => row.tanggal === incidentalDate
      && Number(row.jam_ke) === Number(primary?.jam_ke)
      && normalizeImportKey(row.kelas) === normalizeImportKey(primary?.kelas));
    setUseDatedTime(Boolean(existing?.mulai && existing?.selesai));
    setStartTime(timeForInput(existing?.mulai || masterStart));
    setEndTime(timeForInput(existing?.selesai || masterEnd));
  }, [mutationMode, incidentalDate, incidentals, primary?.kelas, primary?.jam_ke, masterStart, masterEnd]);

  // A dated edit starts with the latest effective values for that class/JP.
  // Switching back to permanent must restore the canonical master, never
  // accidentally persist an incidental teacher/subject into the master.
  useEffect(() => {
    if (!context || !primary) return;
    const source = mutationMode === "INCIDENTAL"
      ? datedAvailability.find((row) =>
          normalizeImportKey(row.kelas) === normalizeImportKey(primary.kelas)
          && Number(row.jam_ke) === Number(primary.jam_ke))
      : canonicalMaster;
    const current = source || canonicalMaster || primary;
    setSubject(current.mapel || "");
    setRoomId(current.ruangan || "");
    setSpecialNote(current.keterangan_khusus || "");
    const currentMode = parseScheduleClassMode(current.kelasgabung);
    setAlternating(currentMode === "ALTERNATING");
    setCombined(currentMode === "COMBINED" || (items.length > 1 && currentMode !== "ALTERNATING"));
    const names = [current.guru1, current.guru2, current.guru3, current.guru4, current.guru5, current.guru6]
      .filter(Boolean).map(String);
    setTeacherIds(names.map((name) => context.teachers.find((teacher) =>
      [teacher.full_name, teacher.short_name, teacher.legacy_name].some((candidate) =>
        normalizeImportKey(candidate) === normalizeImportKey(name)))?.id).filter(Boolean) as string[]);
  // Intentional: only reinitialize when changing date or edit mode, not when
  // each field is typed or when external data re-renders this modal.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context, mutationMode, incidentalDate]);

  const selectedTeachers = useMemo(() => {
    if (!context) return [];
    return teacherIds.map((id) => context.teachers.find((teacher) => teacher.id === id)).filter(Boolean) as ScheduleAdminContext["teachers"];
  }, [context, teacherIds]);

  const targetClassNames = useMemo(() => {
    if (!context) return items.map((item) => item.kelas);
    const selectedClassName = items.length === 1 && classId
      ? context.classes.find((row) => row.id === classId)?.display_name || items[0]?.kelas
      : null;
    return selectedClassName ? [selectedClassName] : items.map((item) => item.kelas);
  }, [context, items, classId]);

  const datedAvailability = useMemo(() => buildDatedEditorAvailability({
    date: incidentalDate, schedules: allSchedules, incidentals, logs, kalenderAkademik,
  }), [incidentalDate, allSchedules, incidentals, logs, kalenderAkademik]);

  const teacherCandidates = useMemo(() => {
    if (!context) return [];
    const dayName = DAY_OPTIONS.find((option) => option.value === day)?.name || "Senin";
    return rankScheduleEditorTeachers({
      teachers: context.teachers,
      classNames: targetClassNames,
      schedules: mutationMode === "INCIDENTAL" ? datedAvailability : allSchedules,
      editingScheduleIds: items.map((item) => item.id),
      dayName,
      period,
      targetClassMode: mutationMode === "PERMANENT"
        ? (alternating ? "ALTERNATING" : combined ? "COMBINED" : "NORMAL")
        : undefined,
    });
  }, [context, targetClassNames, allSchedules, datedAvailability, items, day, period, alternating, combined, mutationMode]);

  const teacherWarnings = useMemo(() => {
    const selected = new Set(teacherIds);
    return teacherCandidates
      .filter((candidate) => selected.has(candidate.teacher.id) && candidate.hasConflict)
      .flatMap((candidate) => candidate.conflictLabels.map((label) => `Guru ${candidate.teacher.full_name} berpotensi bentrok dengan ${label}.`));
  }, [teacherCandidates, teacherIds]);

  const hardConflicts = useMemo(() => {
    const out: string[] = [];
    if (!context) return out;
    const editingIds = new Set(items.map((item) => item.id));
    const classNames = new Set(targetClassNames.map((name) => normalizeImportKey(name)));
    (mutationMode === "INCIDENTAL" ? datedAvailability : allSchedules).forEach((schedule) => {
      if (editingIds.has(schedule.id)) return;
      if (dayNumber(schedule.hari) !== day || Number(schedule.jam_ke) !== period) return;
      if ((mutationMode === "PERMANENT" && alternating) || parseScheduleClassMode(schedule.kelasgabung) === "ALTERNATING") return;
      if (classNames.has(normalizeImportKey(schedule.kelas))) out.push(`Kelas ${schedule.kelas} sudah punya jadwal pada slot ini.`);
      if (roomId && normalizeImportKey(schedule.ruangan) === normalizeImportKey(roomId)) out.push(`Ruangan ${roomId} sudah dipakai ${schedule.kelas} pada slot ini.`);
    });
    return [...new Set(out)];
  }, [context, items, allSchedules, datedAvailability, day, period, roomId, targetClassNames, alternating, mutationMode]);

  const classMode: ScheduleClassMode = alternating ? "ALTERNATING" : combined ? "COMBINED" : "NORMAL";
  const persistedSpecialNote = alternating && !specialNote.trim() ? `1 kali / ${rotationEveryWeeks} minggu` : specialNote;

  const save = async () => {
    if (!context) return;
    if (items.length === 1 && !classId) return setError("Kelas wajib dipilih.");
    if (!subject.trim()) return setError("Mata pelajaran wajib diisi.");
    if (!teacherIds.length) return setError("Minimal satu guru harus dipilih.");
    if (mutationMode === "INCIDENTAL") {
      if (!incidentalDate) return setError("Tanggal perubahan insidental wajib dipilih.");
      if (!dateMatchesScheduleDay(incidentalDate, primary?.hari || "")) return setError(`Tanggal insidental harus jatuh pada hari ${primary?.hari || "yang sama"} agar menggantikan sesi ini, bukan membuat sesi ganda.`);
      if (!incidentalReason.trim()) return setError("Alasan perubahan insidental wajib diisi.");
      if (useDatedTime) {
        const timeError = validateDatedTimeOverride(startTime, endTime);
        if (timeError) return setError(timeError);
        if (!startTime || !endTime) return setError("Isi kedua jam ketika perubahan waktu aktif.");
      }
    }
    // Master conflicts are blocking; dated incidentals are operational warnings.
    if (mutationMode === "PERMANENT" && hardConflicts.length) return setError("Selesaikan bentrok kelas/ruangan sebelum menyimpan.");
    const allowTeacherConflict = teacherWarnings.length > 0;
    if (allowTeacherConflict && !window.confirm(`Ada ${teacherWarnings.length} warning potensi bentrok guru:

${teacherWarnings.join("\n")}

Tetap simpan perubahan ini?`)) return;
    setBusy(true);
    setError(null);
    try {
      if (mutationMode === "PERMANENT") {
        await repo.updateScheduleMaster({
          scheduleIds: items.map((item) => item.id),
          classId: items.length === 1 ? (classId || null) : null,
          dayOfWeek: day,
          period,
          startTime,
          endTime,
          subject: subject.trim(),
          roomId: roomId || null,
          isCombined: classMode === "COMBINED",
          classMode,
          teacherIds,
          teacherNames: selectedTeachers.map((teacher) => teacher.full_name),
          specialNote: persistedSpecialNote,
          allowTeacherConflict,
        });
      } else {
        const rows = items.map((item) => {
          const targetClass = context.classes.find((row) => normalizeImportKey(row.display_name) === normalizeImportKey(item.kelas) || normalizeImportKey(row.code) === normalizeImportKey(item.kelas));
          if (!targetClass) throw new Error(`Kelas ${item.kelas} tidak ditemukan di Master Data.`);
          const existing = incidentals.find((row) => row.tanggal === incidentalDate && Number(row.jam_ke) === Number(item.jam_ke) && normalizeImportKey(row.kelas) === normalizeImportKey(item.kelas));
          return { incidentalId: existing?.id || null, classId: targetClass.id, period: Number(item.jam_ke) };
        });
        await repo.upsertScheduleIncidentalSession({
          rows, scheduleDate: incidentalDate, kind: "OVERRIDE", subject: subject.trim(),
          roomId: roomId || null, isCombined: classMode === "COMBINED", classMode, teacherIds,
          teacherNames: selectedTeachers.map((teacher) => teacher.full_name),
          specialNote: persistedSpecialNote, reason: incidentalReason.trim(), incidentalType, allowTeacherConflict,
          startTime: useDatedTime ? startTime : null, endTime: useDatedTime ? endTime : null,
        });
      }
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan jadwal.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 p-5 backdrop-blur">
          <div className="flex items-center gap-3"><div className="rounded-xl bg-blue-100 p-2 text-blue-700"><Pencil className="w-5 h-5" /></div><div><h2 className="font-black text-slate-900">Quick Edit Jadwal</h2><p className="text-xs text-slate-500">{items.map((item) => item.kelas).join(" + ")} • pilih perubahan permanen atau hanya satu tanggal.</p></div></div>
          <button onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>

        {loading ? <div className="p-12 text-center text-slate-500"><Loader2 className="mx-auto mb-2 w-5 h-5 animate-spin" />Memuat Master Data...</div> : (
          <div className="space-y-5 p-5">
            {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">{error}</div>}
            {items.length > 1 && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">Sesi ini terdiri dari {items.length} kelas. Save akan mengubah semua canonical row sesi gabung sekaligus.</div>}

            <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4">
              <div className="text-xs font-black uppercase tracking-wide text-blue-700">Jenis Perubahan</div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <button type="button" onClick={() => { setMutationMode("PERMANENT"); setStartTime(masterStart); setEndTime(masterEnd); }} className={`rounded-xl border p-3 text-left ${mutationMode === "PERMANENT" ? "border-blue-400 bg-white ring-2 ring-blue-100" : "border-slate-200 bg-white/70"}`}><div className="font-black text-sm text-slate-900">Ubah Jadwal Tetap</div><div className="mt-1 text-xs text-slate-500">Mengubah master dan berlaku pada minggu-minggu berikutnya.</div></button>
                <button type="button" onClick={() => setMutationMode("INCIDENTAL")} className={`rounded-xl border p-3 text-left ${mutationMode === "INCIDENTAL" ? "border-violet-400 bg-white ring-2 ring-violet-100" : "border-slate-200 bg-white/70"}`}><div className="font-black text-sm text-slate-900">Hanya Tanggal Ini</div><div className="mt-1 text-xs text-slate-500">Membuat override insidental; master tidak berubah.</div></button>
              </div>
              {mutationMode === "INCIDENTAL" && <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label={`Tanggal ${primary?.hari || ""}`}><input type="date" value={incidentalDate} onChange={(e) => setIncidentalDate(e.target.value)} className="input" /></Field>
                <Field label="Tipe Insidental"><input value={incidentalType} onChange={(e) => setIncidentalType(e.target.value)} className="input" /></Field>
                <div className="sm:col-span-2"><Field label="Alasan Perubahan"><input value={incidentalReason} onChange={(e) => setIncidentalReason(e.target.value)} placeholder="Contoh: Guru mengikuti pelatihan / perubahan kegiatan" className="input" /></Field></div>
                <div className="sm:col-span-2 rounded-xl bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-800">Quick Edit insidental mengubah isi sesi pada kelas dan JP yang sama untuk tanggal tersebut. Untuk menambah sesi baru di slot lain, gunakan menu Jadwal Insidental.</div>
              </div>}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Kelas">{items.length === 1 ? <SearchableSelect value={classId} onChange={setClassId} disabled={mutationMode === "INCIDENTAL"} placeholder="Cari kelas..." options={[{value: "", label: "— Pilih Kelas —"}, ...(context?.classes.filter((row) => row.is_active !== false).map((row) => ({value: row.id, label: row.display_name})) || [])]} /> : <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm font-bold text-slate-700">{items.map((item) => item.kelas).join(" + ")}</div>}</Field>
              <Field label="Mata Pelajaran"><input value={subject} onChange={(e) => setSubject(e.target.value)} className="input" /></Field>
              <Field label="Ruangan"><SearchableSelect value={roomId} onChange={setRoomId} placeholder="Cari ruangan..." options={[{value: "", label: "— Tanpa / belum ditentukan —"}, ...(context?.rooms.filter((room) => room.status === "ACTIVE").map((room) => ({value: room.id, label: `${room.name} (${room.id})`})) || [])]} /></Field>
              <Field label="Hari"><SearchableSelect value={String(day)} onChange={(next) => setDay(Number(next))} disabled={mutationMode === "INCIDENTAL"} placeholder="Cari hari..." options={DAY_OPTIONS.map((option) => ({value: String(option.value), label: option.name}))} /></Field>
              <Field label="JP"><SearchableSelect value={String(period)} onChange={(next) => setPeriod(Number(next))} disabled={mutationMode === "INCIDENTAL"} placeholder="Cari JP..." options={[0,1,2,3,4,5,6].map((jp) => ({value: String(jp), label: jp === 0 ? "JP-0 Homeroom" : `JP ${jp}`}))} /></Field>
              <Field label="Mulai"><input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} disabled={mutationMode === "INCIDENTAL" && !useDatedTime} className="input disabled:bg-slate-100 disabled:text-slate-500" /></Field>
              <Field label="Selesai"><input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} disabled={mutationMode === "INCIDENTAL" && !useDatedTime} className="input disabled:bg-slate-100 disabled:text-slate-500" /></Field>
            </div>

            {mutationMode === "INCIDENTAL" && <label className="flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs font-semibold text-violet-800">
              <input type="checkbox" checked={useDatedTime} onChange={(e) => setUseDatedTime(e.target.checked)} />
              Atur jam khusus tanggal ini (JP tidak berubah; master tetap). Contoh: JP2 09:20–10:20.
            </label>}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className={`flex items-start gap-3 rounded-2xl border p-3 ${combined ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
                <input type="checkbox" checked={combined} onChange={(e) => { setCombined(e.target.checked); if (e.target.checked) setAlternating(false); }} className="mt-0.5 h-4 w-4" />
                <div><div className="text-sm font-black text-slate-800">Kelas Gabung / Shared Session</div><div className="text-xs text-slate-500">Kelas-kelas pada sesi ini memang belajar bersama pada JP yang sama.</div></div>
              </label>
              <label className={`flex items-start gap-3 rounded-2xl border p-3 ${alternating ? "border-violet-200 bg-violet-50" : "border-slate-200 bg-slate-50"}`}>
                <input type="checkbox" checked={alternating} onChange={(e) => { setAlternating(e.target.checked); if (e.target.checked) setCombined(false); }} className="mt-0.5 h-4 w-4" />
                <div><div className="text-sm font-black text-slate-800">Pelajaran Bergantian / Rotasi</div><div className="text-xs text-slate-500">Untuk mapel/Syaikh yang hanya aktif setiap beberapa minggu, bukan kelas gabung.</div></div>
              </label>
            </div>

            {alternating && (
              <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4">
                <Field label="Pola Pergantian">
                  <SearchableSelect
                    value={String(rotationEveryWeeks)}
                    placeholder="Cari pola rotasi..."
                    options={[2,3,4].map((weeks) => ({value: String(weeks), label: `1 kali / ${weeks} minggu`}))}
                    onChange={(value) => {
                      const next = Number(value);
                      setRotationEveryWeeks(next);
                      setSpecialNote((current) => /^\s*(?:1\s*kali\s*\/\s*)?[234]\s*minggu\s*$/i.test(current) || !current.trim() ? `1 kali / ${next} minggu` : current);
                    }}
                  />
                </Field>
                <p className="mt-2 text-xs font-semibold text-violet-700">Mode ini disimpan sebagai <strong>ALTERNATING</strong>, sehingga engine kelas gabung tidak akan menggabungkannya secara otomatis.</p>
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between"><div><h3 className="font-black text-slate-900">Guru Pengampu</h3><p className="text-xs text-slate-500">Urutan pertama = guru utama.</p></div><span className="text-xs font-bold text-slate-400">{teacherIds.length}/6</span></div>
              <div className="mt-3 space-y-2">{teacherIds.map((teacherId, index) => <div key={`${teacherId}-${index}`} className="flex items-center gap-2"><SearchableSelect className="flex-1" value={teacherId} onChange={(next) => setTeacherIds((current) => current.map((value, i) => i === index ? next : value))} placeholder="Cari nama guru..." options={teacherCandidates.map((candidate) => ({value: candidate.teacher.id, label: scheduleEditorCandidateLabel(candidate)}))} /><button onClick={() => setTeacherIds((current) => current.filter((_, i) => i !== index))} className="rounded-lg bg-rose-50 p-2 text-rose-600"><Trash2 className="w-4 h-4" /></button></div>)}</div>
              {teacherIds.length < 6 && <button onClick={() => { const candidate = teacherCandidates.find((entry) => !teacherIds.includes(entry.teacher.id))?.teacher; if (candidate) setTeacherIds((current) => [...current, candidate.id]); }} className="mt-3 inline-flex items-center gap-1 rounded-lg bg-blue-50 px-3 py-2 text-xs font-black text-blue-700"><Plus className="w-4 h-4" /> Tambah Guru</button>}
            </div>

            <Field label="Catatan Khusus"><textarea value={specialNote} onChange={(e) => setSpecialNote(e.target.value)} rows={2} className="input" /></Field>

            {teacherWarnings.length > 0 && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center gap-2 font-black text-amber-900"><AlertTriangle className="w-5 h-5 text-amber-700" /><span>{teacherWarnings.length} warning potensi bentrok guru</span></div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs font-semibold text-amber-800">{teacherWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
              <p className="mt-2 text-xs text-amber-700">{mutationMode === "INCIDENTAL" ? "Dihitung dari jadwal efektif tanggal yang dipilih (termasuk Kalender Akademik dan izin/badal). " : "Dihitung dari jadwal master mingguan. "}Warning tidak mengunci editor; admin dapat menyimpan setelah konfirmasi.</p>
            </div>}

            <div className={`rounded-2xl border p-4 ${hardConflicts.length ? (mutationMode === "INCIDENTAL" ? "border-amber-200 bg-amber-50" : "border-rose-200 bg-rose-50") : "border-emerald-200 bg-emerald-50"}`}>
              <div className="flex items-center gap-2 font-black">{hardConflicts.length ? <AlertTriangle className="w-5 h-5 text-rose-700" /> : <CheckCircle2 className="w-5 h-5 text-emerald-700" />}<span className={hardConflicts.length ? "text-rose-900" : "text-emerald-900"}>{hardConflicts.length ? `${hardConflicts.length} potensi bentrok kelas/ruangan ${mutationMode === "INCIDENTAL" ? "(warning, tetap bisa disimpan)" : "(blocking)"}` : "Pre-save validation aman"}</span></div>
              {hardConflicts.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-xs font-semibold text-rose-800">{hardConflicts.map((conflict) => <li key={conflict}>{conflict}</li>)}</ul>}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600"><T>{"Batal"}</T></button><button onClick={() => void save()} disabled={busy || (mutationMode === "PERMANENT" && hardConflicts.length > 0)} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-black text-white disabled:bg-slate-300">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {mutationMode === "INCIDENTAL" ? "Simpan Hanya Tanggal Ini" : "Simpan Jadwal Tetap"}</button></div>
          </div>
        )}
      </div>
      <style>{`.input{width:100%;border:1px solid #e2e8f0;border-radius:.75rem;padding:.65rem .8rem;font-size:.875rem;background:white;outline:none}.input:focus{border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.1)}`}</style>
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => <label className="block"><span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">{label}</span>{children}</label>;
