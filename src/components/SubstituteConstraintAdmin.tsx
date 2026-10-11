import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Ban, CalendarDays, Edit3, Loader2, RefreshCw, RotateCcw, Save, ShieldAlert, ToggleLeft, ToggleRight } from "lucide-react";
import { getCurrentUserContext, type CurrentUserContext } from "../infrastructure/auth/supabaseAuthRepository";
import { getSchoolTodayISO } from "../domain/date";
import { filterOperationalHistory, isPastSubstituteRule } from "../domain/operationalHistoryVisibility";
import {
  OperationalRulesRepository,
  type OperationalTeacherRow,
  type SubstituteConstraintAdminRow,
} from "../infrastructure/repositories/operationalRulesRepository";

interface Props {
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

export const SubstituteConstraintAdmin: React.FC<Props> = ({ onBack, onChanged }) => {
  const repository = useMemo(() => new OperationalRulesRepository(), []);
  const [context, setContext] = useState<CurrentUserContext | null>(null);
  const [teachers, setTeachers] = useState<OperationalTeacherRow[]>([]);
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

  const canManage = Boolean(context?.roles.some((role) => role === "ADMIN" || role === "WAKASEK"));
  const teacherById = useMemo(() => new Map(teachers.map((teacher) => [teacher.id, teacher])), [teachers]);
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
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [ctx, teacherRows, constraintRows] = await Promise.all([
        getCurrentUserContext(),
        repository.listTeachers(),
        repository.listSubstituteConstraints(),
      ]);
      setContext(ctx);
      setTeachers(teacherRows);
      setRows(constraintRows);
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
    window.scrollTo({ top: 0, behavior: "smooth" });
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

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
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
            <label><span className="text-xs font-bold text-slate-600">Tanggal</span><input type="date" value={specificDate} onChange={(e) => setSpecificDate(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" /></label>
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
            <input type="checkbox" checked={blocksNormalTeaching} onChange={(e) => setBlocksNormalTeaching(e.target.checked)} className="mt-0.5 h-4 w-4 accent-rose-600" />
            <span><span className="block text-sm font-black text-slate-900">Guru juga tidak bisa mengajar jadwal normal</span><span className="mt-0.5 block text-xs text-slate-500">Aktifkan untuk panitia/kegiatan yang membuat guru benar-benar meninggalkan kelas. Di Input Guru Pengganti, JP terkait akan ditandai × Izin dan tetap membutuhkan badal.</span></span>
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
                <div className="text-sm text-slate-700 mt-1 flex flex-wrap gap-x-3 gap-y-1"><span>JP {row.period_start}–{row.period_end}</span><span>•</span>{row.constraint_type === "DATE" ? <span><CalendarDays className="w-3.5 h-3.5 inline mr-1" />{dateLabel(row.specific_date)}</span> : <span>{dayLabel}{row.valid_from || row.valid_until ? ` • ${dateLabel(row.valid_from)} – ${dateLabel(row.valid_until)}` : ""}</span>}</div>
                <div className="text-xs text-slate-500 mt-1">{row.reason}</div>
              </div>
              <div className="flex gap-2 shrink-0"><button onClick={() => startEdit(row)} className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-bold flex items-center gap-1"><Edit3 className="w-4 h-4" /> Edit</button><button onClick={() => void toggleActive(row)} className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-bold flex items-center gap-1">{row.is_active ? <ToggleRight className="w-5 h-5 text-emerald-600" /> : <ToggleLeft className="w-5 h-5 text-slate-400" />} {row.is_active ? "Aktif" : "Nonaktif"}</button></div>
            </div>;
          })}
        </div>
      </section>
    </div>
  );
};

export default SubstituteConstraintAdmin;
