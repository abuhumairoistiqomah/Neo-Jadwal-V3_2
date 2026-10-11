import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarPlus2, Edit3, Loader2, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import type { JadwalInsidentalItem, ScheduleItem } from "../domain/models";
import { dayNameFromISODate } from "../domain/scheduleMutation";
import { normalizeImportKey } from "../domain/scheduleImport";
import { rankScheduleEditorTeachers, scheduleEditorCandidateLabel } from "../domain/scheduleEditorCandidate";
import { getCurrentUserContext, type CurrentUserContext } from "../infrastructure/auth/supabaseAuthRepository";
import { ScheduleAdminRepository, type ScheduleAdminContext } from "../infrastructure/repositories/scheduleAdminRepository";

interface Props {
  schedules: ScheduleItem[];
  incidentals: JadwalInsidentalItem[];
  onChanged: () => void | Promise<void>;
  onBack?: () => void;
}

function labelDate(value: string): string {
  const [y, m, d] = value.split("-");
  return y && m && d ? `${d}/${m}/${y}` : value;
}

export const IncidentalScheduleAdmin: React.FC<Props> = ({ schedules, incidentals, onChanged, onBack }) => {
  const repo = useMemo(() => new ScheduleAdminRepository(), []);
  const [auth, setAuth] = useState<CurrentUserContext | null>(null);
  const [context, setContext] = useState<ScheduleAdminContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [classId, setClassId] = useState("");
  const [period, setPeriod] = useState(1);
  const [kind, setKind] = useState<"OVERRIDE" | "ADDITIONAL">("OVERRIDE");
  const [subject, setSubject] = useState("");
  const [roomId, setRoomId] = useState("");
  const [combined, setCombined] = useState(false);
  const [teacherIds, setTeacherIds] = useState<string[]>([]);
  const [specialNote, setSpecialNote] = useState("");
  const [reason, setReason] = useState("");
  const [incidentalType, setIncidentalType] = useState("Perubahan Jadwal");

  const canManage = Boolean(auth?.roles.some((role) => role === "ADMIN" || role === "WAKASEK"));
  const selectedClass = context?.classes.find((row) => row.id === classId);
  const dayName = dayNameFromISODate(date);
  const masterForSlot = useMemo(() => {
    if (!selectedClass || !dayName) return null;
    return schedules.find((row) => normalizeImportKey(row.hari) === normalizeImportKey(dayName)
      && Number(row.jam_ke) === period
      && [selectedClass.display_name, selectedClass.code].some((name) => normalizeImportKey(name) === normalizeImportKey(row.kelas))) || null;
  }, [schedules, selectedClass, dayName, period]);

  const teacherCandidates = useMemo(() => {
    if (!context || !selectedClass) return [];
    return rankScheduleEditorTeachers({
      teachers: context.teachers,
      classNames: [selectedClass.display_name],
      schedules,
      editingScheduleIds: masterForSlot ? [masterForSlot.id] : [],
      dayName: dayName || "Senin",
      period,
    });
  }, [context, selectedClass, schedules, masterForSlot, dayName, period]);

  const selectedTeachers = useMemo(() => {
    if (!context) return [];
    return teacherIds.map((id) => context.teachers.find((teacher) => teacher.id === id)).filter(Boolean) as ScheduleAdminContext["teachers"];
  }, [context, teacherIds]);

  const teacherWarnings = useMemo(() => {
    const selected = new Set(teacherIds);
    return teacherCandidates.filter((candidate) => selected.has(candidate.teacher.id) && candidate.hasConflict)
      .flatMap((candidate) => candidate.conflictLabels.map((label) => `${candidate.teacher.full_name}: ${label}`));
  }, [teacherCandidates, teacherIds]);

  const resetForm = () => {
    setEditingId(null);
    setDate("");
    setClassId("");
    setPeriod(1);
    setKind("OVERRIDE");
    setSubject("");
    setRoomId("");
    setCombined(false);
    setTeacherIds([]);
    setSpecialNote("");
    setReason("");
    setIncidentalType("Perubahan Jadwal");
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [user, ctx] = await Promise.all([getCurrentUserContext(), repo.loadContext()]);
      setAuth(user);
      setContext(ctx);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (editingId || kind !== "OVERRIDE" || !masterForSlot || !context) return;
    setSubject(masterForSlot.mapel || "");
    setRoomId(masterForSlot.ruangan || "");
    setCombined(["ya", "iya", "combined"].includes(normalizeImportKey(masterForSlot.kelasgabung)));
    const names = [masterForSlot.guru1, masterForSlot.guru2, masterForSlot.guru3, masterForSlot.guru4, masterForSlot.guru5, masterForSlot.guru6].filter(Boolean).map(String);
    setTeacherIds(names.map((name) => context.teachers.find((teacher) => [teacher.full_name, teacher.short_name, teacher.legacy_name].some((candidate) => normalizeImportKey(candidate) === normalizeImportKey(name)))?.id).filter(Boolean) as string[]);
  }, [masterForSlot?.id, kind, editingId, context]);

  const save = async () => {
    if (!canManage || !context) return;
    setError(""); setMessage("");
    if (!date || !classId) return setError("Tanggal dan kelas wajib dipilih.");
    if (!subject.trim()) return setError("Mata pelajaran wajib diisi.");
    if (!teacherIds.length) return setError("Minimal satu guru wajib dipilih.");
    if (!reason.trim()) return setError("Alasan jadwal insidental wajib diisi.");
    if (kind === "OVERRIDE" && !masterForSlot) return setError("Tidak ada jadwal master pada kelas/JP tersebut. Gunakan mode Tambah Sesi.");
    if (kind === "ADDITIONAL" && masterForSlot) return setError("Slot ini sudah punya jadwal master. Gunakan mode Timpa Jadwal Normal.");
    const allowTeacherConflict = teacherWarnings.length > 0;
    if (allowTeacherConflict && !window.confirm(`Ada ${teacherWarnings.length} potensi bentrok guru:\n\n${teacherWarnings.join("\n")}\n\nTetap simpan jadwal insidental ini?`)) return;
    setBusy(true);
    try {
      await repo.upsertScheduleIncidental({
        incidentalId: editingId,
        scheduleDate: date,
        classId,
        period,
        kind,
        subject: subject.trim(),
        roomId: roomId || null,
        isCombined: combined,
        teacherIds,
        teacherNames: selectedTeachers.map((teacher) => teacher.full_name),
        specialNote,
        reason: reason.trim(),
        incidentalType,
        allowTeacherConflict,
      });
      setMessage(editingId ? "Jadwal insidental berhasil diperbarui." : "Jadwal insidental berhasil ditambahkan.");
      resetForm();
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  };

  const startEdit = (row: JadwalInsidentalItem) => {
    if (!context) return;
    const cls = context.classes.find((item) => [item.display_name, item.code].some((name) => normalizeImportKey(name) === normalizeImportKey(row.kelas)));
    setEditingId(row.id);
    setDate(row.tanggal);
    setClassId(cls?.id || "");
    setPeriod(Number(row.jam_ke));
    setKind(row.kind === "ADDITIONAL" ? "ADDITIONAL" : "OVERRIDE");
    setSubject(row.mapel || "");
    setRoomId(row.ruangan || "");
    setCombined(["ya", "iya", "combined"].includes(normalizeImportKey(row.kelasgabung)));
    const names = [row.guru1, row.guru2, row.guru3, row.guru4, row.guru5, row.guru6].filter(Boolean).map(String);
    setTeacherIds(names.map((name) => context.teachers.find((teacher) => [teacher.full_name, teacher.short_name, teacher.legacy_name].some((candidate) => normalizeImportKey(candidate) === normalizeImportKey(name)))?.id).filter(Boolean) as string[]);
    setSpecialNote(row.keterangan_khusus || "");
    setReason(row.alasan || "");
    setIncidentalType(row.tipe_insidental || "Perubahan Jadwal");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const remove = async (row: JadwalInsidentalItem) => {
    if (!window.confirm(`Hapus jadwal insidental ${row.kelas} • ${labelDate(row.tanggal)} • JP ${row.jam_ke}?`)) return;
    setError("");
    try {
      await repo.deleteScheduleIncidental(row.id, "Dihapus dari editor Jadwal Insidental");
      if (editingId === row.id) resetForm();
      await onChanged();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  };

  const sortedIncidentals = useMemo(() => [...incidentals].sort((a, b) => `${b.tanggal}-${b.jam_ke}`.localeCompare(`${a.tanggal}-${a.jam_ke}`)), [incidentals]);

  return <div className="space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><button onClick={onBack} className="mb-2 inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-800"><ArrowLeft className="w-4 h-4"/> Kembali</button><h1 className="flex items-center gap-2 text-2xl font-black text-slate-900"><CalendarPlus2 className="w-7 h-7 text-violet-600"/> Jadwal Insidental</h1><p className="mt-1 text-sm text-slate-500">Perubahan tanggal tertentu tanpa menyentuh jadwal master. Override untuk mengganti sesi normal; Additional untuk menambah sesi di slot kosong.</p></div>
      <button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white"><RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}/> Refresh</button>
    </div>

    {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-800">{error}</div>}
    {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">{message}</div>}

    <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between"><div><h2 className="text-lg font-black">{editingId ? "Edit Insidental" : "Tambah Insidental"}</h2><p className="text-xs text-slate-500">WAKASEK/ADMIN dapat mengatur perubahan operasional harian.</p></div>{editingId && <button onClick={resetForm} className="text-xs font-black text-slate-500">Batal Edit</button>}</div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Field label="Tanggal"><input type="date" value={date} onChange={(e)=>setDate(e.target.value)} className="input"/></Field>
        <Field label="Kelas"><select value={classId} onChange={(e)=>setClassId(e.target.value)} className="input"><option value="">— Pilih Kelas —</option>{context?.classes.filter((row)=>row.is_active !== false).map((row)=><option key={row.id} value={row.id}>{row.display_name}</option>)}</select></Field>
        <Field label="JP"><select value={period} onChange={(e)=>setPeriod(Number(e.target.value))} className="input">{[0,1,2,3,4,5,6].map((jp)=><option key={jp} value={jp}>{jp===0?"JP-0 Homeroom":`JP ${jp}`}</option>)}</select></Field>
        <Field label="Jenis"><select value={kind} onChange={(e)=>setKind(e.target.value as "OVERRIDE"|"ADDITIONAL")} className="input"><option value="OVERRIDE">Timpa Jadwal Normal</option><option value="ADDITIONAL">Tambah Sesi</option></select></Field>
        <Field label="Mata Pelajaran"><input value={subject} onChange={(e)=>setSubject(e.target.value)} className="input"/></Field>
        <Field label="Ruangan"><select value={roomId} onChange={(e)=>setRoomId(e.target.value)} className="input"><option value="">— Tanpa / belum ditentukan —</option>{context?.rooms.filter((room)=>room.status === "ACTIVE").map((room)=><option key={room.id} value={room.id}>{room.name}</option>)}</select></Field>
        <Field label="Tipe Insidental"><input value={incidentalType} onChange={(e)=>setIncidentalType(e.target.value)} className="input"/></Field>
        <label className="flex items-end"><button type="button" onClick={()=>setCombined((v)=>!v)} className={`w-full rounded-xl border px-3 py-2.5 text-sm font-black ${combined?"border-emerald-300 bg-emerald-50 text-emerald-800":"border-slate-200 bg-white text-slate-600"}`}>{combined?"✓ Kelas Gabung":"Kelas Normal"}</button></label>
      </div>

      <div className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center justify-between"><div><div className="font-black">Guru Pengampu</div><div className="text-xs text-slate-500">Menggunakan ranking gender + warning bentrok seperti Quick Editor.</div></div><span className="text-xs font-bold text-slate-400">{teacherIds.length}/6</span></div><div className="mt-3 space-y-2">{teacherIds.map((id,index)=><div key={`${id}-${index}`} className="flex gap-2"><select value={id} onChange={(e)=>setTeacherIds((rows)=>rows.map((value,i)=>i===index?e.target.value:value))} className="input">{teacherCandidates.map((candidate)=><option key={candidate.teacher.id} value={candidate.teacher.id}>{scheduleEditorCandidateLabel(candidate)}</option>)}</select><button onClick={()=>setTeacherIds((rows)=>rows.filter((_,i)=>i!==index))} className="rounded-xl bg-rose-50 p-2 text-rose-600"><Trash2 className="w-4 h-4"/></button></div>)}</div>{teacherIds.length<6 && <button onClick={()=>{const candidate=teacherCandidates.find((entry)=>!teacherIds.includes(entry.teacher.id))?.teacher;if(candidate)setTeacherIds((rows)=>[...rows,candidate.id]);}} className="mt-3 inline-flex items-center gap-1 rounded-xl bg-blue-50 px-3 py-2 text-xs font-black text-blue-700"><Plus className="w-4 h-4"/> Tambah Guru</button>}</div>

      {teacherWarnings.length>0 && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">⚠ {teacherWarnings.join(" • ")}</div>}
      <div className="grid gap-3 md:grid-cols-2"><Field label="Alasan Perubahan"><input value={reason} onChange={(e)=>setReason(e.target.value)} placeholder="Wajib" className="input"/></Field><Field label="Catatan Khusus"><input value={specialNote} onChange={(e)=>setSpecialNote(e.target.value)} className="input"/></Field></div>
      <div className="rounded-2xl bg-slate-50 p-3 text-xs font-semibold text-slate-600">{kind === "OVERRIDE" ? (masterForSlot ? `Master ditemukan: ${masterForSlot.mapel} • ${masterForSlot.guru1 || "tanpa guru"}. Data di atas akan menggantikannya hanya pada ${labelDate(date)}.` : "Belum ada master pada slot ini. Pilih Tambah Sesi jika memang ingin membuat jadwal baru.") : (masterForSlot ? "Slot ini punya master; gunakan Timpa Jadwal Normal." : "Slot kosong pada master; aman untuk sesi tambahan.")}</div>
      <div className="flex justify-end"><button disabled={!canManage || busy || loading} onClick={()=>void save()} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-black text-white disabled:opacity-40">{busy?<Loader2 className="w-4 h-4 animate-spin"/>:<Save className="w-4 h-4"/>}{editingId?"Simpan Revisi":"Tambah Jadwal Insidental"}</button></div>
    </section>

    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4"><h2 className="text-lg font-black">Daftar Jadwal Insidental</h2><p className="text-xs text-slate-500">Histori tersimpan di Supabase; hapus di UI melakukan soft-delete untuk audit.</p></div><div className="space-y-3 p-5">{sortedIncidentals.length===0?<div className="py-8 text-center text-slate-400">Belum ada jadwal insidental.</div>:sortedIncidentals.map((row)=><div key={row.id} className="flex flex-col gap-3 rounded-2xl border border-violet-100 bg-violet-50/30 p-4 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="font-black text-slate-900">{row.kelas}</span><span className="rounded-lg bg-violet-100 px-2 py-1 text-[10px] font-black text-violet-800">{row.kind || "OVERRIDE"}</span></div><div className="mt-1 text-sm font-semibold text-slate-700">{labelDate(row.tanggal)} • JP {row.jam_ke} • {row.mapel}</div><div className="mt-1 text-xs text-slate-500">{[row.guru1,row.guru2,row.guru3,row.guru4,row.guru5,row.guru6].filter(Boolean).join(" / ") || "Tanpa guru"}{row.alasan?` • ${row.alasan}`:""}</div></div><div className="flex gap-2"><button onClick={()=>startEdit(row)} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black"><Edit3 className="w-4 h-4"/> Edit</button><button onClick={()=>void remove(row)} className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-black text-rose-700"><Trash2 className="w-4 h-4"/> Hapus</button></div></div>)}</div></section>
    <style>{`.input{width:100%;border:1px solid #e2e8f0;border-radius:.75rem;padding:.65rem .8rem;font-size:.875rem;background:white;outline:none}.input:focus{border-color:#8b5cf6;box-shadow:0 0 0 3px rgba(139,92,246,.1)}`}</style>
  </div>;
};

const Field: React.FC<{label:string;children:React.ReactNode}> = ({label,children}) => <label className="block"><span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-500">{label}</span>{children}</label>;

export default IncidentalScheduleAdmin;
