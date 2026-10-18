import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Ban, CalendarDays, Edit3, Loader2, RefreshCw, RotateCcw, Save, ShieldAlert, ToggleLeft, ToggleRight, UserPlus, CheckCircle2, X } from "lucide-react";
import type { Teacher, JadwalInsidentalItem, KalenderAkademikItem, LogIzinItem, ScheduleItem } from "../domain/models";
import { findOfficialDutyNeeds, summarizeOfficialDutyCoverage, isOfficialDutyRuleDate, type OfficialDutyAssignment } from "../domain/officialDutyBadal";
import { OfficialDutyBadalRepository } from "../infrastructure/repositories/officialDutyBadalRepository";
import { InputGuruPengganti } from "./InputGuruPengganti";
import type { SubstituteConstraint } from "../domain/substituteAvailability";
import { getCurrentUserContext, type CurrentUserContext } from "../infrastructure/auth/supabaseAuthRepository";
import { getSchoolTodayISO } from "../domain/date";
import { filterOperationalHistory, isPastSubstituteRule } from "../domain/operationalHistoryVisibility";
import {
  OperationalRulesRepository,
  type OperationalTeacherRow,
  type OperationalClassRow,
  type SubstituteConstraintAdminRow,
} from "../infrastructure/repositories/operationalRulesRepository";

import { T } from '../i18n/LanguageProvider';
interface Props {
  schedules: ScheduleItem[];
  teacherDetails: Teacher[];
  incidentals: JadwalInsidentalItem[];
  logs: LogIzinItem[];
  calendar: KalenderAkademikItem[];
  substituteConstraints: SubstituteConstraint[];
  onBack?: () => void;
  onChanged?: () => void | Promise<void>;
}

const DAYS = [
  [1, "Senin"], [2, "Selasa"], [3, "Rabu"], [4, "Kamis"], [5, "Jumat"], [6, "Sabtu"], [7, "Minggu"],
] as const;

function dateLabel(value?: string | null): string {
  if (!value) return "-";
  const parts = value.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : value;
}

export const SubstituteConstraintAdmin: React.FC<Props> = ({ schedules, teacherDetails, incidentals, logs, calendar, substituteConstraints, onBack, onChanged }) => {
  const repository = useMemo(() => new OperationalRulesRepository(), []);
  const badalRepository = useMemo(() => new OfficialDutyBadalRepository(), []);
  const editorRef = useRef<HTMLElement>(null);
  const [context, setContext] = useState<CurrentUserContext | null>(null);
  const [teachers, setTeachers] = useState<OperationalTeacherRow[]>([]);
  const [classes, setClasses] = useState<OperationalClassRow[]>([]);
  const [allAssignments, setAllAssignments] = useState<Array<OfficialDutyAssignment & { official_duty_constraint_id: string }>>([]);
  const [activeRule, setActiveRule] = useState<SubstituteConstraintAdminRow | null>(null);
  const [coverageDate, setCoverageDate] = useState("");
  const [coverageSaving, setCoverageSaving] = useState(false);
  const [rows, setRows] = useState<SubstituteConstraintAdminRow[]>([]);
  const [showPastRules, setShowPastRules] = useState(false);
  const [schoolToday, setSchoolToday] = useState(getSchoolTodayISO);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const [teacherId, setTeacherId] = useState("");
  const [kind, setKind] = useState<"DATE" | "WEEKLY">("DATE");
  const [specificDate, setSpecificDate] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState<number>(3);
  const [periodStart, setPeriodStart] = useState(0);
  const [periodEnd, setPeriodEnd] = useState(6);
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [reason, setReason] = useState("");
  const [overrideAllowed, setOverrideAllowed] = useState(false);
  const [blocksNormalTeaching, setBlocksNormalTeaching] = useState(false);
  const [requiresBadal, setRequiresBadal] = useState(false);

  const canManage = Boolean(context?.roles.some((role) => role === "ADMIN" || role === "WAKASEK"));
  const teacherById = useMemo(() => new Map(teachers.map((teacher) => [teacher.id, teacher])), [teachers]);
  const classIdByName = useMemo(() => new Map<string, string>(classes.flatMap((cls): Array<[string, string]> => [
    [cls.display_name.toLocaleLowerCase("id-ID"), cls.id], [cls.code.toLocaleLowerCase("id-ID"), cls.id],
  ])), [classes]);
  const needsFor = (rule: SubstituteConstraintAdminRow, date: string) => findOfficialDutyNeeds({
    date, teacherName: teacherById.get(rule.teacher_id)?.full_name || "", rule,
    schedules, incidentals, logs, calendar,
    homeroomClasses: (() => {
      const teacher = teacherDetails.find((entry) => entry.id === rule.teacher_id);
      return String(teacher?.wali_kelas || teacher?.pendamping_kelas || "");
    })(),
  });
  const currentNeeds = activeRule ? needsFor(activeRule, coverageDate) : [];
  const currentAssignments = activeRule ? allAssignments.filter((a) => a.official_duty_constraint_id === activeRule.id && a.schedule_date === coverageDate) : [];
  const currentCoverage = summarizeOfficialDutyCoverage(currentNeeds, currentAssignments, classIdByName);
  const pastRulesCount = rows.filter((row) => isPastSubstituteRule(row, schoolToday)).length;
  const displayedRules = filterOperationalHistory<SubstituteConstraintAdminRow>(rows, (row) => isPastSubstituteRule(row, schoolToday), showPastRules);
  useEffect(() => {
    const timer = window.setInterval(() => setSchoolToday(getSchoolTodayISO()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setTeacherId("");
    setKind("DATE");
    setSpecificDate("");
    setDayOfWeek(3);
    setPeriodStart(0);
    setPeriodEnd(6);
    setValidFrom("");
    setValidUntil("");
    setReason("");
    setOverrideAllowed(false);
    setBlocksNormalTeaching(false);
    setRequiresBadal(false);
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [ctx, teacherRows, constraintRows, classRows, assignmentRows] = await Promise.all([
        getCurrentUserContext(),
        repository.listTeachers(),
        repository.listSubstituteConstraints(),
        repository.listClasses(),
        badalRepository.listAllAssignments(),
      ]);
      setContext(ctx);
      setTeachers(teacherRows);
      setClasses(classRows);
      setRows(constraintRows);
      setAllAssignments(assignmentRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const startEdit = (row: SubstituteConstraintAdminRow) => {
    setEditingId(row.id);
    setTeacherId(row.teacher_id);
    setKind(row.constraint_type);
    setSpecificDate(row.specific_date || "");
    setDayOfWeek(row.day_of_week || 3);
    setPeriodStart(Number(row.period_start));
    setPeriodEnd(Number(row.period_end));
    setValidFrom(row.valid_from || "");
    setValidUntil(row.valid_until || "");
    setReason(row.reason || "");
    setOverrideAllowed(Boolean(row.override_allowed));
    setBlocksNormalTeaching(Boolean(row.blocks_normal_teaching));
    setRequiresBadal(Boolean(row.requires_badal && row.blocks_normal_teaching));
    requestAnimationFrame(() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const save = async () => {
    if (!canManage) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await repository.saveSubstituteConstraint({
        id: editingId || undefined,
        teacherId,
        kind,
        specificDate: kind === "DATE" ? specificDate : null,
        dayOfWeek: kind === "WEEKLY" ? dayOfWeek : null,
        periodStart,
        periodEnd,
        validFrom: kind === "WEEKLY" ? validFrom || null : null,
        validUntil: kind === "WEEKLY" ? validUntil || null : null,
        reason,
        overrideAllowed,
        blocksNormalTeaching,
        requiresBadal: blocksNormalTeaching && requiresBadal,
        isActive: true,
      });
      setMessage(editingId ? "Restriksi guru diperbarui." : "Restriksi guru berhasil ditambahkan.");
      resetForm();
      setRows(await repository.listSubstituteConstraints());
      await onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (row: SubstituteConstraintAdminRow) => {
    setError("");
    try {
      await repository.setSubstituteConstraintActive(row.id, !row.is_active);
      setRows(await repository.listSubstituteConstraints());
      await onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const openBadal = (rule: SubstituteConstraintAdminRow) => {
    setActiveRule(rule);
    setError("");
    if (rule.constraint_type === "DATE") { setCoverageDate(rule.specific_date || ""); return; }
    // For a weekly rule, choose the first matching date in the next two weeks.
    const today = getSchoolTodayISO();
    const [y, m, d] = today.split("-").map(Number);
    for (let i=0; i<14; i++) {
      const candidate = new Date(Date.UTC(y, m-1, d+i)).toISOString().slice(0,10);
      if (isOfficialDutyRuleDate(rule, candidate)) { setCoverageDate(candidate); return; }
    }
    setCoverageDate(today);
  };
  // The smart Input Inval is the *only* teacher recommender. Its write action
  // is scoped to the uncovered official-duty slots and never creates a leave.
  const pendingNeeds = currentNeeds.filter((need) => !currentAssignments.some((assignment) =>
    assignment.schedule_date === need.date && assignment.period === need.period
    && assignment.class_id === classIdByName.get(need.className.toLocaleLowerCase("id-ID"))
    && ["ASSIGNED", "COMPLETED"].includes(assignment.status) && assignment.substitute_teacher_id));
  const saveOfficialDutySelections = async (newLogs: Omit<LogIzinItem, "id">[]) => {
    if (!activeRule || !canManage || coverageSaving) throw new Error("Penyimpanan sedang berlangsung atau akses tidak tersedia.");
    if (!isOfficialDutyRuleDate(activeRule, coverageDate)) throw new Error("Tanggal bukan tanggal restriksi yang berlaku.");
    const expected = new Map(pendingNeeds.map((need) => [`${need.period}|${need.className.toLocaleLowerCase("id-ID")}`, need]));
    const assignments: Array<{ period: number; classId: string; substituteTeacherId: string }> = [];
    const seen = new Set<string>();
    for (const row of newLogs) {
      const key = `${row.jam_ke}|${row.kelas.toLocaleLowerCase("id-ID")}`;
      if (row.tanggal !== coverageDate || !expected.has(key) || seen.has(key)) {
        throw new Error("Pilihan keluar dari slot restriksi atau tercatat lebih dari sekali. Periksa ulang daftar badal.");
      }
      const classId = classIdByName.get(row.kelas.toLocaleLowerCase("id-ID"));
      const substitute = teacherDetails.find((teacher) => teacher.nama.toLocaleLowerCase("id-ID") === row.guru_pengganti.toLocaleLowerCase("id-ID"));
      if (!classId || !substitute?.id || substitute.id === activeRule.teacher_id) {
        throw new Error(`Kelas atau guru badal tidak dikenali untuk JP${row.jam_ke}: ${row.kelas}.`);
      }
      seen.add(key);
      assignments.push({ period: row.jam_ke, classId, substituteTeacherId: substitute.id });
    }
    if (assignments.length !== expected.size) {
      throw new Error(`Penugasan belum lengkap: ${assignments.length}/${expected.size} slot. Jangan simpan sebagian tanpa konfirmasi.`);
    }
    setCoverageSaving(true);
    let saved = 0;
    try {
      for (const assignment of assignments) {
        await badalRepository.assign({
          constraintId: activeRule.id, date: coverageDate, ...assignment,
        });
        saved++;
      }
      setAllAssignments(await badalRepository.listAllAssignments());
      await onChanged?.();
      setMessage(`Berhasil menyimpan ${saved} slot badal tugas resmi: ${activeRule.reason}`);
    } catch (error) {
      // Assign RPC writes one slot at a time. A partial result must be shown,
      // not treated as an all-or-nothing transaction.
      try { setAllAssignments(await badalRepository.listAllAssignments()); } catch { /* surface original error */ }
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`${saved}/${assignments.length} slot sempat tersimpan. Refresh status sebelum mencoba lagi. ${detail}`);
    } finally {
      setCoverageSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <button onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 mb-2"><ArrowLeft className="w-4 h-4" /> Kembali</button>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2"><Ban className="w-7 h-7 text-red-600" /> Aturan Guru Badal</h1>
          <p className="text-sm text-slate-500 mt-1">Buat restriksi tanggal tertentu atau mingguan. HARD BLOCK berarti guru tidak dapat dipilih sebagai badal.</p>
        </div>
        <button disabled={loading} onClick={() => void load()} className="px-4 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-sm flex items-center gap-2 disabled:opacity-50"><RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh</button>
      </div>

      {!canManage && !loading && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 text-sm font-semibold flex items-start gap-2"><ShieldAlert className="w-5 h-5 mt-0.5" /> Login Supabase dengan role WAKASEK atau ADMIN diperlukan untuk mengelola restriksi badal.</div>
      )}
      {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800 text-sm font-semibold">{message}</div>}
      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-800 text-sm font-semibold">{error}</div>}

      <section ref={editorRef} style={{ scrollMarginTop: 90 }} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-black text-lg">{editingId ? "Edit Restriksi" : "Tambah Restriksi"}</h2>
            <p className="text-xs text-slate-500">Untuk panitia outing class, pilih Tanggal Tertentu + HARD BLOCK + JP0–JP6.</p>
          </div>
          {editingId && <button onClick={resetForm} className="text-xs font-bold text-slate-500 hover:text-slate-800 inline-flex items-center gap-1"><RotateCcw className="w-4 h-4" /> Batal Edit</button>}
        </div>

        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
          <label className="xl:col-span-2"><span className="text-xs font-bold text-slate-600">Guru</span><select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white"><option value="">Pilih guru...</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.full_name}</option>)}</select></label>
          <label><span className="text-xs font-bold text-slate-600">Jenis Aturan</span><select value={kind} onChange={(e) => setKind(e.target.value as "DATE" | "WEEKLY")} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white"><option value="DATE">Tanggal Tertentu</option><option value="WEEKLY">Mingguan</option></select></label>
          <label><span className="text-xs font-bold text-slate-600">Level</span><select value={overrideAllowed ? "SOFT" : "HARD"} onChange={(e) => setOverrideAllowed(e.target.value === "SOFT")} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white"><option value="HARD">HARD BLOCK • tidak bisa dipilih</option><option value="SOFT">WARNING • masih bisa override</option></select></label>

          {kind === "DATE" ? (
            <label><span className="text-xs font-bold text-slate-600"><T>{"Tanggal"}</T></span><input type="date" value={specificDate} onChange={(e) => setSpecificDate(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" /></label>
          ) : (
            <label><span className="text-xs font-bold text-slate-600">Hari</span><select value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white">{DAYS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          )}

          <label><span className="text-xs font-bold text-slate-600">JP Mulai</span><select value={periodStart} onChange={(e) => setPeriodStart(Number(e.target.value))} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white">{Array.from({ length: 7 }, (_, i) => <option key={i} value={i}>JP {i}</option>)}</select></label>
          <label><span className="text-xs font-bold text-slate-600">JP Selesai</span><select value={periodEnd} onChange={(e) => setPeriodEnd(Number(e.target.value))} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white">{Array.from({ length: 7 }, (_, i) => <option key={i} value={i}>JP {i}</option>)}</select></label>
          <button type="button" onClick={() => { setPeriodStart(0); setPeriodEnd(6); }} className="self-end border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold hover:bg-slate-50">Semua JP (0–6)</button>

          {kind === "WEEKLY" && <>
            <label><span className="text-xs font-bold text-slate-600">Berlaku Mulai (opsional)</span><input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" /></label>
            <label><span className="text-xs font-bold text-slate-600">Berlaku Sampai (opsional)</span><input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" /></label>
          </>}
          <label className={`md:col-span-2 xl:col-span-4 flex items-start gap-3 rounded-2xl border p-3 cursor-pointer ${blocksNormalTeaching ? "border-rose-300 bg-rose-50" : "border-slate-200 bg-slate-50"}`}>
            <input type="checkbox" checked={blocksNormalTeaching} onChange={(e) => {
              setBlocksNormalTeaching(e.target.checked);
              if (!e.target.checked) setRequiresBadal(false);
            }} className="mt-0.5 h-4 w-4 accent-rose-600" />
            <span><span className="block text-sm font-black text-slate-900">Guru juga tidak bisa mengajar jadwal normal</span><span className="mt-0.5 block text-xs text-slate-500">Aktifkan untuk panitia/kegiatan yang membuat guru benar-benar meninggalkan kelas. Di Input Guru Pengganti, JP terkait akan ditandai × Izin dan tetap membutuhkan badal.</span></span>
          </label>
          <label className={`md:col-span-2 xl:col-span-4 flex items-start gap-3 rounded-2xl border p-3 ${!blocksNormalTeaching ? "border-slate-200 bg-slate-100 cursor-not-allowed" : requiresBadal ? "border-indigo-300 bg-indigo-50 cursor-pointer" : "border-slate-200 bg-slate-50 cursor-pointer"}`}>
            <input type="checkbox" disabled={!blocksNormalTeaching} checked={blocksNormalTeaching && requiresBadal} onChange={(e) => setRequiresBadal(e.target.checked)} aria-describedby="requires-badal-help" className="mt-0.5 h-4 w-4 accent-indigo-600 disabled:cursor-not-allowed" />
            <span className={!blocksNormalTeaching ? "opacity-60" : ""}>
              <span className="block text-sm font-black text-slate-900">Kebutuhan Badal (Tugas Resmi Sekolah)</span>
              <span id="requires-badal-help" className="mt-1 block text-xs text-slate-600">
                {blocksNormalTeaching
                  ? "JP mengajar aktif yang terkena restriksi perlu pengganti. Alasannya otomatis mengikuti Alasan / Kegiatan, tanpa membuat izin pribadi."
                  : "Aktifkan 'Guru juga tidak bisa mengajar jadwal normal' terlebih dahulu untuk mengaktifkan Kebutuhan Badal."}
              </span>
            </span>
          </label>
          <label className="md:col-span-2 xl:col-span-4"><span className="text-xs font-bold text-slate-600">Alasan / Kegiatan</span><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Contoh: Panitia Outing Class" className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" /></label>
        </div>
        <div className="flex justify-end"><button disabled={!canManage || saving} onClick={() => void save()} className="px-5 py-3 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-black flex items-center gap-2">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {editingId ? "Simpan Perubahan" : "Tambah Restriksi"}</button></div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><div><h2 className="font-black text-lg">Daftar Restriksi</h2><p className="text-xs text-slate-500">Aturan aktif langsung dibaca engine rekomendasi badal. Histori tidak dihapus.</p></div><label className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer"><input type="checkbox" checked={showPastRules} onChange={(event) => setShowPastRules(event.target.checked)} className="h-4 w-4 accent-red-600" /> Lihat yang sudah lewat ({pastRulesCount})</label></div>
        <div className="p-5 space-y-3">
          {loading ? <div className="py-10 text-center text-slate-500"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Memuat restriksi...</div> : displayedRules.length === 0 ? <div className="py-10 text-center text-slate-400">{pastRulesCount > 0 && !showPastRules ? "Tidak ada aturan yang berlaku hari ini atau mendatang. Centang histori untuk melihat yang sudah lewat." : "Belum ada restriksi."}</div> : displayedRules.map((row) => {
            const teacher = teacherById.get(row.teacher_id);
            const dayLabel = DAYS.find(([value]) => value === row.day_of_week)?.[1] || "Semua Hari";
            return <div key={row.id} className={`rounded-2xl border p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 ${row.is_active ? "border-red-200 bg-red-50/40" : "border-slate-200 bg-slate-50 opacity-70"}`}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><span className="font-black text-slate-900">{teacher?.full_name || row.teacher_id}</span><span className={`text-[10px] font-black px-2 py-1 rounded-lg ${row.override_allowed ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>{row.override_allowed ? "SOFT WARNING" : "HARD BLOCK"}</span>{row.blocks_normal_teaching && <span className="text-[10px] font-black px-2 py-1 rounded-lg bg-rose-100 text-rose-800">× TIDAK MENGAJAR NORMAL</span>}{!row.is_active && <span className="text-[10px] font-black px-2 py-1 rounded-lg bg-slate-200 text-slate-600">NONAKTIF</span>}</div>
                <div className="text-sm text-slate-700 mt-1 flex flex-wrap gap-x-3 gap-y-1"><span><T>{"JP"}</T> {row.period_start}–{row.period_end}</span><span>•</span>{row.constraint_type === "DATE" ? <span><CalendarDays className="w-3.5 h-3.5 inline mr-1" />{dateLabel(row.specific_date)}</span> : <span>{dayLabel}{row.valid_from || row.valid_until ? ` • ${dateLabel(row.valid_from)} – ${dateLabel(row.valid_until)}` : ""}</span>}</div>
                <div className="text-xs text-slate-500 mt-1">{row.reason}</div>
                {row.requires_badal && row.is_active && <div className="mt-1 text-xs font-bold text-indigo-700">Kebutuhan Badal • Tugas Resmi Sekolah</div>}
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">{row.requires_badal && row.blocks_normal_teaching && row.is_active && (() => {
                const needs = row.constraint_type === "DATE" ? needsFor(row, row.specific_date || "") : [];
                const assigned = summarizeOfficialDutyCoverage(needs, allAssignments.filter((a) => a.official_duty_constraint_id === row.id && a.schedule_date === row.specific_date), classIdByName);
                const complete = row.constraint_type === "DATE" && assigned.total > 0 && assigned.pending === 0;
                return <button type="button" disabled={complete} onClick={() => openBadal(row)} className={`px-3 py-2 rounded-xl text-sm font-bold flex items-center gap-1 ${complete ? "bg-emerald-100 text-emerald-800 cursor-default" : "bg-indigo-600 text-white hover:bg-indigo-700"}`}>
                  {complete ? <CheckCircle2 className="w-4 h-4"/> : <UserPlus className="w-4 h-4"/>}
                  {complete ? "Badal Aman" : row.constraint_type === "DATE" ? `Tentukan Badal (${assigned.assigned}/${assigned.total})` : "Tentukan Badal per Tanggal"}
                </button>;
              })()}<button onClick={() => startEdit(row)} className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-bold flex items-center gap-1"><Edit3 className="w-4 h-4" /> Edit</button><button onClick={() => void toggleActive(row)} className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-bold flex items-center gap-1">{row.is_active ? <ToggleRight className="w-5 h-5 text-emerald-600" /> : <ToggleLeft className="w-5 h-5 text-slate-400" />} {row.is_active ? "Aktif" : "Nonaktif"}</button></div>
            </div>;
          })}
        </div>
      </section>
      {activeRule && <div className="fixed inset-0 z-[80] bg-slate-950/70 p-2 sm:p-5 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Pilih Badal Tugas Resmi Sekolah">
        <div className="max-w-6xl mx-auto bg-slate-50 rounded-2xl shadow-2xl p-3 sm:p-6 my-2">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4 mb-4">
            <div>
              <h2 className="text-lg font-black">Pemilihan Guru Badal Pintar • Tugas Resmi Sekolah</h2>
              <p className="text-sm text-slate-600">{teacherById.get(activeRule.teacher_id)?.full_name} • Alasan: <strong>{activeRule.reason}</strong></p>
              <p className="text-sm font-bold text-indigo-800 mt-1">Coverage {currentCoverage.assigned}/{currentCoverage.total} slot • {currentCoverage.pending} belum terisi</p>
            </div>
            <button type="button" onClick={() => setActiveRule(null)} className="flex items-center gap-2 border rounded-lg bg-white px-3 py-2 text-sm font-bold"><X className="w-4 h-4"/> Tutup</button>
          </div>
          {activeRule.constraint_type === "WEEKLY" && <label className="block mb-4 max-w-sm text-sm font-bold">Tanggal tugas resmi (sesuai restriksi)
            <input type="date" value={coverageDate} onChange={(event) => setCoverageDate(event.target.value)} className="block mt-1 w-full border rounded-xl p-2.5" />
          </label>}
          {!isOfficialDutyRuleDate(activeRule, coverageDate) ? <p className="rounded-xl bg-amber-50 p-4 text-amber-900">Tanggal tidak sesuai hari atau masa berlaku restriksi.</p>
            : currentCoverage.pending === 0 ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 font-bold text-emerald-800">{currentCoverage.total > 0 ? "Seluruh kebutuhan badal pada tanggal ini sudah aman." : "Tidak ada JP mengajar aktif yang membutuhkan badal pada tanggal ini."}</p>
              : <InputGuruPengganti
                  key={`${activeRule.id}|${coverageDate}`}
                  teachers={teacherDetails}
                  schedules={schedules}
                  logs={logs}
                  jadwalInsidental={incidentals}
                  kalenderAkademik={calendar}
                  substituteConstraints={substituteConstraints}
                  initialDate={coverageDate}
                  initialTeacherName={teacherById.get(activeRule.teacher_id)?.full_name || ""}
                  initialPeriods={[...new Set(pendingNeeds.map((need) => need.period))]}
                  initialReason={activeRule.reason}
                  officialDutySlots={pendingNeeds.map((need) => ({ period: need.period, className: need.className }))}
                  onAddLogs={saveOfficialDutySelections}
                  onBack={() => setActiveRule(null)}
                />}
        </div>
      </div>}
    </div>
  );
};

export default SubstituteConstraintAdmin;
