import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, Check, Edit3, Loader2, RefreshCw, RotateCcw, Save, Search, ShieldAlert, ToggleLeft, ToggleRight } from "lucide-react";
import { atomicClassChoices, expandCalendarClassIds } from "../domain/academicCalendarClasses";
import { getErrorMessage } from "../domain/errorMessage";
import { getCurrentUserContext, type CurrentUserContext } from "../infrastructure/auth/supabaseAuthRepository";
import {
  OperationalRulesRepository,
  type AcademicEventGroup,
  type OperationalClassRow,
} from "../infrastructure/repositories/operationalRulesRepository";

interface Props {
  onBack?: () => void;
  onChanged?: () => void | Promise<void>;
}

function dateLabel(value?: string | null): string {
  if (!value) return "-";
  const parts = value.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : value;
}

export const AcademicCalendarAdmin: React.FC<Props> = ({ onBack, onChanged }) => {
  const repository = useMemo(() => new OperationalRulesRepository(), []);
  const [context, setContext] = useState<CurrentUserContext | null>(null);
  const [classes, setClasses] = useState<OperationalClassRow[]>([]);
  const [groups, setGroups] = useState<AcademicEventGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<AcademicEventGroup | null>(null);

  const [eventName, setEventName] = useState("");
  const [eventType, setEventType] = useState("Kegiatan");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [scope, setScope] = useState<"ALL" | "CLASS">("CLASS");
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [unresolvedLegacyIds, setUnresolvedLegacyIds] = useState<string[]>([]);
  const [wholeDay, setWholeDay] = useState(true);
  const [periodStart, setPeriodStart] = useState(0);
  const [periodEnd, setPeriodEnd] = useState(6);
  const [classSearch, setClassSearch] = useState("");

  const canManage = Boolean(context?.roles.some((role) => role === "ADMIN" || role === "WAKASEK"));
  const atomicClasses = useMemo(() => atomicClassChoices(classes), [classes]);
  const combinedCount = classes.length - atomicClasses.length;
  const filteredClasses = useMemo(() => {
    const query = classSearch.trim().toLocaleLowerCase("id-ID");
    if (!query) return atomicClasses;
    return atomicClasses.filter((row) => `${row.display_name} ${row.code}`.toLocaleLowerCase("id-ID").includes(query));
  }, [atomicClasses, classSearch]);

  const resetForm = () => {
    setEditing(null);
    setEventName("");
    setEventType("Kegiatan");
    setDateStart("");
    setDateEnd("");
    setScope("CLASS");
    setSelectedClassIds([]);
    setUnresolvedLegacyIds([]);
    setWholeDay(true);
    setPeriodStart(0);
    setPeriodEnd(6);
    setClassSearch("");
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [ctx, classRows, eventGroups] = await Promise.all([
        getCurrentUserContext(),
        repository.listClasses(),
        repository.listAcademicEventGroups(),
      ]);
      setContext(ctx);
      setClasses(classRows);
      setGroups(eventGroups);
    } catch (err) {
      setError(getErrorMessage(err, "Gagal memproses Kalender Akademik."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const toggleClass = (id: string) => {
    setSelectedClassIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  };

  const startEdit = (group: AcademicEventGroup) => {
    setEditing(group);
    setEventName(group.eventName);
    setEventType(group.eventType);
    setDateStart(group.dateStart);
    setDateEnd(group.dateEnd);
    setScope(group.scope);
    const selection = expandCalendarClassIds(group.classIds, classes);
    setSelectedClassIds(selection.classIds);
    setUnresolvedLegacyIds(selection.unresolvedLegacyIds);
    setWholeDay(group.periodStart == null && group.periodEnd == null);
    setPeriodStart(group.periodStart ?? 0);
    setPeriodEnd(group.periodEnd ?? 6);
    setClassSearch("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const save = async () => {
    if (!canManage) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await repository.saveAcademicEventGroup({
        existingRowIds: editing?.rowIds,
        groupCode: editing?.groupCode,
        dateStart,
        dateEnd: dateEnd || dateStart,
        eventName,
        eventType,
        scope,
        classIds: scope === "CLASS" ? [...selectedClassIds, ...unresolvedLegacyIds] : [],
        periodStart: wholeDay ? null : periodStart,
        periodEnd: wholeDay ? null : periodEnd,
      });
      setMessage(editing ? "Kalender Akademik diperbarui sebagai revisi baru; versi lama dinonaktifkan untuk audit." : "Kegiatan Kalender Akademik berhasil ditambahkan.");
      resetForm();
      setGroups(await repository.listAcademicEventGroups());
      await onChanged?.();
    } catch (err) {
      setError(getErrorMessage(err, "Gagal memproses Kalender Akademik."));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (group: AcademicEventGroup) => {
    setError("");
    try {
      await repository.setAcademicEventGroupActive(group.rowIds, group.status !== "ACTIVE");
      setGroups(await repository.listAcademicEventGroups());
      await onChanged?.();
    } catch (err) {
      setError(getErrorMessage(err, "Gagal memproses Kalender Akademik."));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <button onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 mb-2"><ArrowLeft className="w-4 h-4" /> Kembali</button>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2"><CalendarDays className="w-7 h-7 text-teal-600" /> Kalender Akademik</h1>
          <p className="text-sm text-slate-500 mt-1">Libur, outing class, kegiatan, atau perubahan KBM per kelas. Data langsung memengaruhi jadwal efektif di seluruh E-Jadwal.</p>
        </div>
        <button disabled={loading} onClick={() => void load()} className="px-4 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-sm flex items-center gap-2 disabled:opacity-50"><RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh</button>
      </div>

      {!canManage && !loading && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 text-sm font-semibold flex items-start gap-2"><ShieldAlert className="w-5 h-5 mt-0.5" /> Login Supabase WAKASEK/ADMIN diperlukan untuk mengelola Kalender Akademik.</div>}
      {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800 text-sm font-semibold">{message}</div>}
      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-800 text-sm font-semibold">{error}</div>}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-3"><div><h2 className="font-black text-lg">{editing ? "Edit Kegiatan" : "Tambah Kegiatan / Libur"}</h2><p className="text-xs text-slate-500">Pilih kelas dasar; kegiatan akan berlaku juga pada sesi gabungan yang memuat kelas tersebut. Satu kegiatan tetap dikelola sebagai satu grup.</p></div>{editing && <button onClick={resetForm} className="text-xs font-bold text-slate-500 hover:text-slate-800 inline-flex items-center gap-1"><RotateCcw className="w-4 h-4" /> Batal Edit</button>}</div>

        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
          <label className="md:col-span-2"><span className="text-xs font-bold text-slate-600">Nama Kegiatan</span><input value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="Contoh: Outing Class Grade 7" className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" /></label>
          <label><span className="text-xs font-bold text-slate-600">Tipe</span><select value={eventType} onChange={(e) => setEventType(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white"><option>Libur</option><option>Kegiatan</option><option>Pulang Cepat</option><option>Ujian</option><option>Agenda Sekolah</option></select></label>
          <label><span className="text-xs font-bold text-slate-600">Cakupan</span><select value={scope} onChange={(e) => setScope(e.target.value as "ALL" | "CLASS")} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm bg-white"><option value="CLASS">Kelas tertentu</option><option value="ALL">Semua kelas</option></select></label>
          <label><span className="text-xs font-bold text-slate-600">Tanggal Mulai</span><input type="date" value={dateStart} onChange={(e) => { setDateStart(e.target.value); if (!dateEnd) setDateEnd(e.target.value); }} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" /></label>
          <label><span className="text-xs font-bold text-slate-600">Tanggal Selesai</span><input type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm" /></label>
          <label className="flex items-end"><button type="button" onClick={() => setWholeDay((value) => !value)} className={`w-full rounded-xl border px-3 py-2.5 text-sm font-black ${wholeDay ? "border-teal-200 bg-teal-50 text-teal-800" : "border-slate-200 bg-white text-slate-600"}`}>{wholeDay ? "✓ Sehari Penuh" : "Batasi JP Tertentu"}</button></label>
          {!wholeDay && <div className="grid grid-cols-2 gap-2"><label><span className="text-xs font-bold text-slate-600">JP Mulai</span><select value={periodStart} onChange={(e) => setPeriodStart(Number(e.target.value))} className="mt-1 w-full border border-slate-200 rounded-xl px-2 py-2.5 text-sm bg-white">{Array.from({ length: 7 }, (_, i) => <option key={i} value={i}>JP {i}</option>)}</select></label><label><span className="text-xs font-bold text-slate-600">JP Akhir</span><select value={periodEnd} onChange={(e) => setPeriodEnd(Number(e.target.value))} className="mt-1 w-full border border-slate-200 rounded-xl px-2 py-2.5 text-sm bg-white">{Array.from({ length: 7 }, (_, i) => <option key={i} value={i}>JP {i}</option>)}</select></label></div>}
        </div>

        {scope === "CLASS" && <div className="rounded-2xl border border-slate-200 p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3"><div><div className="font-black text-sm">Kelas Terdampak</div><div className="text-[11px] text-slate-500">{selectedClassIds.length} kelas dasar dipilih • {combinedCount} label gabungan disederhanakan</div></div><div className="relative sm:w-72"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" /><input value={classSearch} onChange={(e) => setClassSearch(e.target.value)} placeholder="Cari kelas..." className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-sm" /></div></div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 max-h-64 overflow-y-auto pr-1">{filteredClasses.map((row) => { const selected = selectedClassIds.includes(row.id); return <button type="button" key={row.id} onClick={() => toggleClass(row.id)} className={`text-left rounded-xl border px-3 py-2.5 text-sm flex items-center gap-2 ${selected ? "border-teal-300 bg-teal-50 text-teal-900" : "border-slate-200 bg-white hover:bg-slate-50"}`}><span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${selected ? "bg-teal-600 border-teal-600 text-white" : "border-slate-300"}`}>{selected && <Check className="w-3.5 h-3.5" />}</span><span className="font-bold truncate">{row.display_name}</span></button>; })}</div>
        </div>}

        {unresolvedLegacyIds.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900">{unresolvedLegacyIds.length} target kelas gabungan lama belum bisa diurai. Sistem mempertahankannya saat revisi agar jadwal lama tidak hilang. Periksa Master Data untuk melengkapi kelas dasarnya.</div>}
        <p className="text-xs text-slate-500">Kelas gabungan dikenali otomatis dari jadwal. Memilih satu kelas dasar juga memengaruhi sesi gabungan yang memuatnya.</p>
        {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">Gagal menyimpan kegiatan: {error}</div>}
        <div className="flex justify-end"><button disabled={!canManage || saving} onClick={() => void save()} className="px-5 py-3 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white font-black flex items-center gap-2">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {editing ? "Simpan Revisi" : "Tambahkan ke Kalender"}</button></div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100"><h2 className="font-black text-lg">Agenda Kalender</h2><p className="text-xs text-slate-500">Event aktif otomatis menekan KBM normal pada kelas/JP yang terdampak.</p></div>
        <div className="p-5 space-y-3">
          {loading ? <div className="py-10 text-center text-slate-500"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Memuat kalender...</div> : groups.length === 0 ? <div className="py-10 text-center text-slate-400">Belum ada data Kalender Akademik.</div> : groups.map((group) => <div key={group.key} className={`rounded-2xl border p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4 ${group.status === "ACTIVE" ? "border-teal-200 bg-teal-50/30" : "border-slate-200 bg-slate-50 opacity-70"}`}>
            <div className="min-w-0"><div className="flex flex-wrap gap-2 items-center"><span className="font-black text-slate-900">{group.eventName}</span><span className="text-[10px] font-black px-2 py-1 rounded-lg bg-teal-100 text-teal-800">{group.eventType}</span>{group.status !== "ACTIVE" && <span className="text-[10px] font-black px-2 py-1 rounded-lg bg-slate-200 text-slate-600">NONAKTIF</span>}</div><div className="text-sm text-slate-700 mt-1">{dateLabel(group.dateStart)}{group.dateEnd !== group.dateStart ? ` – ${dateLabel(group.dateEnd)}` : ""} • {group.periodStart == null ? "Sehari penuh" : `JP ${group.periodStart}–${group.periodEnd}`}</div><div className="text-xs text-slate-500 mt-1">{group.scope === "ALL" ? "Semua kelas" : group.classNames.join(" • ") || "Kelas tidak terbaca"}</div></div>
            <div className="flex gap-2 shrink-0"><button onClick={() => startEdit(group)} className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-bold flex items-center gap-1"><Edit3 className="w-4 h-4" /> Edit</button><button onClick={() => void toggleActive(group)} className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-bold flex items-center gap-1">{group.status === "ACTIVE" ? <ToggleRight className="w-5 h-5 text-emerald-600" /> : <ToggleLeft className="w-5 h-5 text-slate-400" />} {group.status === "ACTIVE" ? "Aktif" : "Nonaktif"}</button></div>
          </div>)}
        </div>
      </section>
    </div>
  );
};

export default AcademicCalendarAdmin;
