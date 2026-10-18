import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Building2, CheckCircle2, CircleOff, GraduationCap, Pencil, Plus, RefreshCw, Save, Search, ShieldAlert, Users, X } from "lucide-react";
import { getCurrentUserContext } from "../infrastructure/auth/supabaseAuthRepository";
import {
  AdminMasterDataRepository,
  type AdminClassRow,
  type AdminRoomRow,
  type AdminTeacherRow,
  type ClassWriteInput,
  type MasterGender,
  type RoomWriteInput,
  type TeacherWriteInput,
} from "../infrastructure/repositories/adminMasterDataRepository";

import { T } from '../i18n/LanguageProvider';
interface Props {
  onBack: () => void;
  onRefreshSnapshot?: () => Promise<void>;
}

type Tab = "teachers" | "classes" | "rooms";
type EditorState =
  | { type: "teacher"; row: AdminTeacherRow | null }
  | { type: "class"; row: AdminClassRow | null }
  | { type: "room"; row: AdminRoomRow | null }
  | null;

const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const labelClass = "block text-[11px] font-black uppercase tracking-wide text-slate-500 mb-1";

function activeBadge(active: boolean) {
  return active
    ? <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black text-emerald-700">AKTIF</span>
    : <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[10px] font-black text-slate-600">NONAKTIF</span>;
}

export const AdminMasterData: React.FC<Props> = ({ onBack, onRefreshSnapshot }) => {
  const repo = useMemo(() => new AdminMasterDataRepository(), []);
  const [tab, setTab] = useState<Tab>("teachers");
  const [teachers, setTeachers] = useState<AdminTeacherRow[]>([]);
  const [classes, setClasses] = useState<AdminClassRow[]>([]);
  const [rooms, setRooms] = useState<AdminRoomRow[]>([]);
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isAdminRole, setIsAdminRole] = useState(false);
  const [editor, setEditor] = useState<EditorState>(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const context = await getCurrentUserContext();
      const admin = Boolean(context?.roles.includes("ADMIN"));
      setIsAdminRole(admin);
      if (!admin) {
        setTeachers([]); setClasses([]); setRooms([]);
        return;
      }
      const data = await repo.listAll();
      setTeachers(data.teachers);
      setClasses(data.classes);
      setRooms(data.rooms);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const refreshEverything = async (successMessage: string) => {
    await load();
    if (onRefreshSnapshot) await onRefreshSnapshot();
    setMessage(successMessage);
    window.setTimeout(() => setMessage(""), 3000);
  };

  const filteredTeachers = teachers.filter((row) => {
    if (!showInactive && !row.is_active) return false;
    const hay = [row.full_name, row.short_name, row.primary_subjects_text, row.subject_cluster, row.whatsapp_e164].join(" ").toLowerCase();
    return hay.includes(query.trim().toLowerCase());
  });
  const filteredClasses = classes.filter((row) => {
    if (!showInactive && !row.is_active) return false;
    return [row.code, row.display_name, row.program, row.gender].join(" ").toLowerCase().includes(query.trim().toLowerCase());
  });
  const filteredRooms = rooms.filter((row) => {
    if (!showInactive && row.status !== "ACTIVE") return false;
    return [row.id, row.name, ...(row.aliases || []), row.location, row.room_type].join(" ").toLowerCase().includes(query.trim().toLowerCase());
  });

  const mutate = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true); setError(""); setMessage("");
    try {
      await fn();
      setEditor(null);
      await refreshEverything(ok);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center font-bold text-slate-500">Memuat Master Data dari Supabase...</div>;
  }

  if (!isAdminRole) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600"><ArrowLeft className="w-4 h-4" /> Kembali</button>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
          <div className="flex items-center gap-2 font-black"><ShieldAlert className="w-5 h-5" /> Master Data hanya untuk role ADMIN</div>
          <p className="mt-2 text-sm">WAKASEK tetap dapat mengelola izin dan badal, tetapi perubahan data guru/kelas/ruangan dibatasi ke ADMIN agar referensi jadwal tetap aman.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50"><ArrowLeft className="w-5 h-5" /></button>
          <div><h2 className="text-xl font-black text-slate-900">Master Data</h2><p className="text-xs text-slate-500">Supabase source of truth • perubahan tercatat di Audit Log</p></div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600"><RefreshCw className="w-4 h-4" /> Refresh</button>
          <button onClick={() => setEditor(tab === "teachers" ? { type: "teacher", row: null } : tab === "classes" ? { type: "class", row: null } : { type: "room", row: null })} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-black text-white hover:bg-blue-700"><Plus className="w-4 h-4" /> Tambah</button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}
      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700"><CheckCircle2 className="mr-2 inline w-4 h-4" />{message}</div>}

      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => { setTab("teachers"); setQuery(""); }} className={`rounded-xl px-3 py-3 text-xs font-black ${tab === "teachers" ? "bg-blue-600 text-white" : "bg-slate-50 text-slate-600"}`}><Users className="mx-auto mb-1 w-4 h-4" /> Guru</button>
          <button onClick={() => { setTab("classes"); setQuery(""); }} className={`rounded-xl px-3 py-3 text-xs font-black ${tab === "classes" ? "bg-blue-600 text-white" : "bg-slate-50 text-slate-600"}`}><GraduationCap className="mx-auto mb-1 w-4 h-4" /> Kelas</button>
          <button onClick={() => { setTab("rooms"); setQuery(""); }} className={`rounded-xl px-3 py-3 text-xs font-black ${tab === "rooms" ? "bg-blue-600 text-white" : "bg-slate-50 text-slate-600"}`}><Building2 className="mx-auto mb-1 w-4 h-4" /> <T>{"Ruangan"}</T></button>
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari data..." className={`${inputClass} pl-9`} /></div>
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Tampilkan nonaktif</label>
        </div>
      </div>

      <div className="space-y-3">
        {tab === "teachers" && filteredTeachers.map((row) => (
          <div key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div><div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-slate-900">{row.full_name}</h3>{activeBadge(row.is_active)}</div><p className="mt-1 text-xs text-slate-500">{row.short_name || "—"} • {row.gender} • {row.whatsapp_e164 || "WA belum diisi"}</p><p className="mt-2 text-sm text-slate-700">{row.primary_subjects_text || "Mapel utama belum diisi"}</p></div>
              <div className="flex gap-2"><button onClick={() => setEditor({ type: "teacher", row })} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><Pencil className="w-4 h-4" /></button><button disabled={busy} onClick={() => void mutate(() => repo.setTeacherActive(row.id, !row.is_active), row.is_active ? "Guru dinonaktifkan." : "Guru diaktifkan kembali.")} className={`rounded-lg p-2 ${row.is_active ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{row.is_active ? <CircleOff className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}</button></div>
            </div>
          </div>
        ))}
        {tab === "classes" && filteredClasses.map((row) => (
          <div key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-slate-900">{row.display_name}</h3>{activeBadge(row.is_active)}</div><p className="mt-1 text-xs text-slate-500">Kode {row.code} • Grade {row.grade_level ?? "—"} • {row.program || "Program belum diisi"} • {row.gender}</p></div><div className="flex gap-2"><button onClick={() => setEditor({ type: "class", row })} className="rounded-lg border border-slate-200 p-2 text-slate-600"><Pencil className="w-4 h-4" /></button><button disabled={busy} onClick={() => void mutate(() => repo.setClassActive(row.id, !row.is_active), row.is_active ? "Kelas dinonaktifkan." : "Kelas diaktifkan kembali.")} className={`rounded-lg p-2 ${row.is_active ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{row.is_active ? <CircleOff className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}</button></div></div></div>
        ))}
        {tab === "rooms" && filteredRooms.map((row) => {
          const active = row.status === "ACTIVE";
          return <div key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-slate-900">{row.name}</h3>{activeBadge(active)}</div><p className="mt-1 text-xs text-slate-500">ID {row.id} • {row.location || "Lokasi belum diisi"} • kapasitas {row.capacity ?? "—"}</p><p className="mt-2 text-xs text-slate-500">Alias: {(row.aliases || []).join(", ") || "—"}</p></div><div className="flex gap-2"><button onClick={() => setEditor({ type: "room", row })} className="rounded-lg border border-slate-200 p-2 text-slate-600"><Pencil className="w-4 h-4" /></button><button disabled={busy} onClick={() => void mutate(() => repo.setRoomActive(row.id, !active), active ? "Ruangan dinonaktifkan." : "Ruangan diaktifkan kembali.")} className={`rounded-lg p-2 ${active ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{active ? <CircleOff className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}</button></div></div></div>;
        })}
      </div>

      {editor && <EditorModal state={editor} busy={busy} onClose={() => setEditor(null)} onTeacher={(row, input) => void mutate(() => row ? repo.updateTeacher(row.id, input) : repo.createTeacher(input), row ? "Data guru diperbarui." : "Guru baru ditambahkan.")} onClass={(row, input) => void mutate(() => row ? repo.updateClass(row.id, input) : repo.createClass(input), row ? "Data kelas diperbarui." : "Kelas baru ditambahkan.")} onRoom={(row, input) => void mutate(() => row ? repo.updateRoom(row.id, input) : repo.createRoom(input), row ? "Data ruangan diperbarui." : "Ruangan baru ditambahkan.")} />}
    </div>
  );
};

const EditorModal: React.FC<{
  state: Exclude<EditorState, null>; busy: boolean; onClose: () => void;
  onTeacher: (row: AdminTeacherRow | null, input: TeacherWriteInput) => void;
  onClass: (row: AdminClassRow | null, input: ClassWriteInput) => void;
  onRoom: (row: AdminRoomRow | null, input: RoomWriteInput) => void;
}> = ({ state, busy, onClose, onTeacher, onClass, onRoom }) => {
  const isTeacher = state.type === "teacher";
  const isClass = state.type === "class";
  const teacher = isTeacher ? state.row : null;
  const classRow = isClass ? state.row : null;
  const room = state.type === "room" ? state.row : null;
  const [form, setForm] = useState<Record<string, string>>(() => {
    if (teacher) return { full_name: teacher.full_name, short_name: teacher.short_name || "", gender: teacher.gender, whatsapp: teacher.whatsapp_e164 || "", subjects: teacher.primary_subjects_text || "", cluster: teacher.subject_cluster || "", levels: teacher.levels_text || "", task: teacher.additional_task || "", notes: teacher.notes || "" };
    if (classRow) return { code: classRow.code, display_name: classRow.display_name, gender: classRow.gender, grade: classRow.grade_level?.toString() || "", program: classRow.program || "" };
    if (room) return { id: room.id, name: room.name, aliases: (room.aliases || []).join(", "), capacity: room.capacity?.toString() || "", location: room.location || "", room_type: room.room_type || "" };
    return isTeacher ? { gender: "UNKNOWN" } : isClass ? { gender: "UNKNOWN" } : {};
  });
  const set = (key: string, value: string) => setForm((old) => ({ ...old, [key]: value }));
  const save = () => {
    if (state.type === "teacher") onTeacher(state.row, { full_name: form.full_name || "", short_name: form.short_name, gender: (form.gender || "UNKNOWN") as MasterGender, whatsapp_e164: form.whatsapp, primary_subjects_text: form.subjects, subject_cluster: form.cluster, levels_text: form.levels, additional_task: form.task, notes: form.notes, is_active: state.row?.is_active ?? true });
    if (state.type === "class") onClass(state.row, { code: form.code || "", display_name: form.display_name || "", gender: (form.gender || "UNKNOWN") as MasterGender, grade_level: form.grade ? Number(form.grade) : null, program: form.program, is_active: state.row?.is_active ?? true });
    if (state.type === "room") onRoom(state.row, { id: state.row?.id || form.id || "", name: form.name || "", aliases: String(form.aliases || "").split(",").map((v) => v.trim()).filter(Boolean), capacity: form.capacity ? Number(form.capacity) : null, location: form.location, room_type: form.room_type, status: state.row?.status || "ACTIVE" });
  };
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4"><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"><div className="mb-4 flex items-center justify-between"><div><h3 className="font-black text-slate-900">{state.row ? "Edit" : "Tambah"} {state.type === "teacher" ? "Guru" : state.type === "class" ? "Kelas" : "Ruangan"}</h3><p className="text-xs text-slate-500">Perubahan langsung disimpan ke Supabase.</p></div><button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="w-5 h-5" /></button></div>
    <div className="grid gap-4 sm:grid-cols-2">
      {state.type === "teacher" && <><Field label="Nama Lengkap" value={form.full_name} onChange={(v) => set("full_name", v)} /><Field label="Nama Panggilan" value={form.short_name} onChange={(v) => set("short_name", v)} /><SelectGender value={form.gender} onChange={(v) => set("gender", v)} /><Field label="WhatsApp" value={form.whatsapp} placeholder="0812... / 62812... / +62812..." onChange={(v) => set("whatsapp", v)} /><Field label="Mapel Utama" value={form.subjects} onChange={(v) => set("subjects", v)} /><Field label="Rumpun" value={form.cluster} onChange={(v) => set("cluster", v)} /><Field label="Jenjang" value={form.levels} onChange={(v) => set("levels", v)} /><Field label="Tugas Tambahan" value={form.task} onChange={(v) => set("task", v)} /><div className="sm:col-span-2"><Field label="Keterangan" value={form.notes} onChange={(v) => set("notes", v)} /></div></>}
      {state.type === "class" && <><Field label="Kode Kelas" value={form.code} onChange={(v) => set("code", v)} /><Field label="Nama Tampilan" value={form.display_name} onChange={(v) => set("display_name", v)} /><SelectGender value={form.gender} onChange={(v) => set("gender", v)} /><Field label="Grade 1–12" value={form.grade} type="number" onChange={(v) => set("grade", v)} /><div className="sm:col-span-2"><Field label="Program" value={form.program} placeholder="INTER / MQ / AE" onChange={(v) => set("program", v)} /></div></>}
      {state.type === "room" && <><Field label="ID Ruangan" value={form.id} disabled={Boolean(state.row)} onChange={(v) => set("id", v)} /><Field label="Nama Ruangan" value={form.name} onChange={(v) => set("name", v)} /><Field label="Alias (pisahkan koma)" value={form.aliases} onChange={(v) => set("aliases", v)} /><Field label="Kapasitas" value={form.capacity} type="number" onChange={(v) => set("capacity", v)} /><Field label="Lokasi" value={form.location} onChange={(v) => set("location", v)} /><Field label="Jenis Ruangan" value={form.room_type} onChange={(v) => set("room_type", v)} /></>}
    </div>
    <div className="mt-5 flex justify-end gap-2"><button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600"><T>{"Batal"}</T></button><button disabled={busy} onClick={save} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white disabled:opacity-50"><Save className="w-4 h-4" /> Simpan</button></div></div></div>;
};

const Field: React.FC<{ label: string; value?: string; placeholder?: string; type?: string; disabled?: boolean; onChange: (value: string) => void }> = ({ label, value = "", placeholder, type = "text", disabled, onChange }) => <label><span className={labelClass}>{label}</span><input type={type} disabled={disabled} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={`${inputClass} disabled:bg-slate-100 disabled:text-slate-500`} /></label>;
const SelectGender: React.FC<{ value?: string; onChange: (value: string) => void }> = ({ value = "UNKNOWN", onChange }) => <label><span className={labelClass}>Gender</span><select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}><option value="UNKNOWN">UNKNOWN</option><option value="IKHWAN">IKHWAN</option><option value="AKHWAT">AKHWAT</option></select></label>;
