import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRightLeft, Loader2, Plus, Save, X } from "lucide-react";
import type { JadwalInsidentalItem, KalenderAkademikItem, MasterRuanganItem, ScheduleItem } from "../domain/models";
import { buildEffectiveScheduleForDate, type EffectiveScheduleItem } from "../domain/schedule/effectiveSchedule";
import { isCombinedClassValue } from "../domain/class";
import { matchRoomId } from "../domain/room";
import { normalizeImportKey } from "../domain/scheduleImport";
import { formatOperationalError } from "../domain/formatOperationalError";
import { getCurrentUserContext } from "../infrastructure/auth/supabaseAuthRepository";
import { ScheduleAdminRepository, type ScheduleAdminContext } from "../infrastructure/repositories/scheduleAdminRepository";

import { T } from '../i18n/LanguageProvider';
interface Props {
  date: string;
  period: number;
  initialRoomId: string;
  initialClass?: string;
  schedules: ScheduleItem[];
  incidentals: JadwalInsidentalItem[];
  calendar: KalenderAkademikItem[];
  rooms: MasterRuanganItem[];
  onChanged: () => Promise<void> | void;
  onClose: () => void;
}

function teachersOf(item: EffectiveScheduleItem): string[] {
  return [item.guru1, item.guru2, item.guru3, item.guru4, item.guru5, item.guru6].map(String).filter((x) => x.trim());
}
function sessionKey(item: EffectiveScheduleItem): string {
  return `${normalizeImportKey(item.mapel)}|${teachersOf(item).map(normalizeImportKey).sort().join("|")}|${normalizeImportKey(item.ruangan || "")}`;
}

/** The room editor is date-scoped by design; master schedule is never mutated. */
export const WeeklyRoomEditor: React.FC<Props> = ({
  date, period, initialRoomId, initialClass, schedules, incidentals, calendar, rooms, onChanged, onClose,
}) => {
  const repo = useMemo(() => new ScheduleAdminRepository(), []);
  const [context, setContext] = useState<ScheduleAdminContext | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"MOVE" | "ADDITIONAL">("MOVE");
  const [sourceKey, setSourceKey] = useState("");
  const [targetRoomId, setTargetRoomId] = useState(initialRoomId);
  const [extraClassId, setExtraClassId] = useState("");
  const [extraSubject, setExtraSubject] = useState("");
  const [extraTeacherIds, setExtraTeacherIds] = useState<string[]>([]);
  const [reason, setReason] = useState("Penyesuaian penggunaan ruangan minggu terpilih");

  useEffect(() => {
    let mounted = true;
    Promise.all([repo.loadContext(), getCurrentUserContext()])
      .then(([ctx, auth]) => {
        if (!mounted) return;
        setContext(ctx);
        setAuthorized(Boolean(auth?.roles.some((role) => role === "ADMIN" || role === "WAKASEK")));
      })
      .catch((err: unknown) => { if (mounted) setError(formatOperationalError(err)); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [repo]);

  const rows = useMemo(() => buildEffectiveScheduleForDate({
    date, schedules, jadwalInsidental: incidentals, kalenderAkademik: calendar,
  }).filter((row) => row.isActive && Number(row.jam_ke) === period), [date, period, schedules, incidentals, calendar]);
  const roomOptions = useMemo(() => rooms.filter((room) => (room.status || "Aktif").toLowerCase() === "aktif"), [rooms]);
  // Each distinct class is selectable. When multiple classes represent the same
  // combined teaching session, a single relocation updates the whole bundle.
  const options = useMemo(() => rows.map((row, index) => ({ row, key: `${index}:${row.kelas}` })), [rows]);
  useEffect(() => {
    const first = options.find(({ row }) => initialClass && normalizeImportKey(row.kelas) === normalizeImportKey(initialClass))
      || options.find(({ row }) => matchRoomId(row.ruangan, rooms) === initialRoomId)
      || options[0];
    setSourceKey(first?.key || "");
  }, [date, period, initialClass, initialRoomId, options, rooms]);

  const selected = options.find((option) => option.key === sourceKey)?.row;
  const group = useMemo(() => {
    if (!selected) return [];
    const partners = rows.filter((row) => sessionKey(row) === sessionKey(selected));
    if (partners.length > 1 || isCombinedClassValue(selected.kelasgabung)) return partners;
    return [selected];
  }, [selected, rows]);
  const groupClasses = new Set(group.map((row) => normalizeImportKey(row.kelas)));
  const targetOccupied = rows.filter((row) => matchRoomId(row.ruangan, rooms) === targetRoomId
    && !(mode === "MOVE" && groupClasses.has(normalizeImportKey(row.kelas))));
  const classesWithSession = new Set(rows.map((row) => normalizeImportKey(row.kelas)));
  const availableExtraClasses = context?.classes.filter((cls) => cls.is_active !== false && ![cls.display_name, cls.code].some((name) => classesWithSession.has(normalizeImportKey(name)))) || [];

  const save = async () => {
    if (!authorized || !context) return;
    setError(""); setMessage("");
    if (!targetRoomId) return setError("Pilih ruangan tujuan.");
    if (!reason.trim()) return setError("Alasan perubahan ruangan wajib diisi untuk audit.");
    if (targetOccupied.length) return setError(`Ruangan tujuan masih dipakai ${targetOccupied.map((row) => row.kelas).join(", ")} di slot ini. Pilih ruangan kosong, atau pindahkan kelas tersebut lebih dulu.`);
    const dbRoom = context.rooms.find((room) => room.id === targetRoomId && room.status === "ACTIVE");
    if (!dbRoom) return setError("Ruangan tujuan tidak ditemukan atau nonaktif di Supabase.");

    setBusy(true);
    try {
      if (mode === "MOVE") {
        if (!selected || !group.length) throw new Error("Pilih kelas yang akan direlokasi.");
        if (group.every((row) => matchRoomId(row.ruangan, rooms) === targetRoomId)) throw new Error("Kelas sudah menggunakan ruangan tersebut.");
        const dbClasses = group.map((row) => context.classes.find((cls) => [cls.display_name, cls.code].some((name) => normalizeImportKey(name) === normalizeImportKey(row.kelas))));
        if (dbClasses.some((cls) => !cls)) throw new Error(`Master kelas tidak ditemukan untuk ${group.map((row) => row.kelas).join(", ")}.`);
        // This new RPC changes only the dated room override (atomic for a bundle).
        const changed = await repo.relocateRoomForDate({
          scheduleDate: date, period, classIds: dbClasses.map((cls) => cls!.id),
          roomId: dbRoom.id, reason: reason.trim(),
        });
        setMessage(`${changed} kelas berhasil direlokasi hanya untuk ${date} JP ${period}.`);
      } else {
        if (!extraClassId || !extraSubject.trim() || !extraTeacherIds.length) throw new Error("Kelas, mata pelajaran, dan minimal satu guru wajib diisi.");
        if (extraTeacherIds.length > 6) throw new Error("Maksimal enam guru pengampu untuk satu sesi.");
        const cls = context.classes.find((row) => row.id === extraClassId);
        if (!cls || [cls.display_name, cls.code].some((name) => classesWithSession.has(normalizeImportKey(name)))) throw new Error("Kelas tersebut sudah punya jadwal di slot ini. Gunakan Relokasi Kelas, bukan Tambah Sesi.");
        const selectedTeachers = extraTeacherIds.map((id) => context.teachers.find((t) => t.id === id));
        if (selectedTeachers.some((teacher) => !teacher)) throw new Error("Guru pengampu tidak ditemukan di master.");
        await repo.addRoomSessionForDate({
          scheduleDate: date, classId: extraClassId, period,
          subject: extraSubject.trim(), roomId: dbRoom.id,
          teacherIds: extraTeacherIds,
          teacherNames: selectedTeachers.map((teacher) => teacher!.full_name),
          reason: reason.trim(), allowTeacherConflict: false,
        });
        setMessage(`Sesi tambahan berhasil ditambahkan untuk ${date} JP ${period}.`);
      }
      await onChanged();
      onClose();
    } catch (err) {
      setError(formatOperationalError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/70 p-3" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[93vh] overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-black text-slate-900"><ArrowRightLeft className="w-5 h-5 text-indigo-600" /> Edit Ruangan • Minggu Terpilih</h2>
            <p className="mt-1 text-xs text-slate-500">Perubahan berlaku untuk <strong>{date}, JP {period}</strong> saja. Jadwal master tidak diubah.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Tutup"><X className="h-5 w-5" /></button>
        </div>
        {loading ? <div className="py-8 text-center text-sm text-slate-500"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> Memuat izin dan data master...</div> : !authorized ? <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">Hanya ADMIN/WAKASEK yang dapat mengubah ruangan.</div> : (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
              <button onClick={() => { setMode("MOVE"); setError(""); }} className={`rounded-lg p-2 text-sm font-black ${mode === "MOVE" ? "bg-white text-indigo-700 shadow" : "text-slate-600"}`}>Relokasi kelas</button>
              <button onClick={() => { setMode("ADDITIONAL"); setError(""); }} className={`rounded-lg p-2 text-sm font-black ${mode === "ADDITIONAL" ? "bg-white text-indigo-700 shadow" : "text-slate-600"}`}><Plus className="mr-1 inline h-4 w-4" /> Tambah sesi</button>
            </div>
            {mode === "MOVE" ? <div className="space-y-2">
              <label className="block text-xs font-black text-slate-600">Pilih kelas yang sudah mempunyai sesi di tanggal/JP ini</label>
              <select value={sourceKey} onChange={(e) => setSourceKey(e.target.value)} className="w-full rounded-xl border border-slate-200 p-3 text-sm">
                {options.map(({ row, key }) => <option key={key} value={key}>{row.kelas} • {row.mapel} • {row.ruangan ? rooms.find((r) => r.id_ruangan === matchRoomId(row.ruangan, rooms))?.nama_ruangan || row.ruangan : "Belum ada ruangan"}</option>)}
              </select>
              {!options.length && <p className="text-xs text-amber-800">Belum ada sesi pada slot ini; gunakan Tambah Sesi untuk membuat kegiatan baru.</p>}
              {group.length > 1 && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">Kelas gabungan terdeteksi. Relokasi akan memindahkan {group.length} kelas sekaligus: <strong>{group.map((row) => row.kelas).join(" + ")}</strong>.</p>}
            </div> : <div className="space-y-3">
              <p className="rounded-xl bg-blue-50 p-3 text-xs text-blue-900">Tambah Sesi membuat kegiatan baru hanya pada tanggal/JP ini. Bila kelas sudah memiliki jadwal di ruangan lain, gunakan Relokasi Kelas.</p>
              <div><label className="text-xs font-black text-slate-600">Kelas</label><select value={extraClassId} onChange={(e) => setExtraClassId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm"><option value="">— Pilih kelas tanpa sesi —</option>{availableExtraClasses.map((cls) => <option key={cls.id} value={cls.id}>{cls.display_name}</option>)}</select></div>
              <div><label className="text-xs font-black text-slate-600">Mapel / Kegiatan</label><input value={extraSubject} onChange={(e) => setExtraSubject(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm" placeholder="Contoh: Gladi Resik" /></div>
              <div><label className="text-xs font-black text-slate-600">Guru Pengampu</label><select value="" onChange={(e) => { if (e.target.value) setExtraTeacherIds((ids) => ids.length < 6 && !ids.includes(e.target.value) ? [...ids, e.target.value] : ids); }} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm"><option value="">+ Tambah guru</option>{context?.teachers.filter((t) => t.is_active !== false && !extraTeacherIds.includes(t.id)).map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}</select><div className="mt-2 flex flex-wrap gap-2">{extraTeacherIds.map((id) => <button key={id} onClick={() => setExtraTeacherIds((list) => list.filter((v) => v !== id))} className="rounded-lg bg-blue-50 px-2 py-1 text-xs text-blue-800">{context?.teachers.find((t) => t.id === id)?.full_name} ×</button>)}</div></div>
            </div>}
            <div><label className="text-xs font-black text-slate-600">Ruangan Tujuan</label><select value={targetRoomId} onChange={(e) => setTargetRoomId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm">{roomOptions.map((room) => <option key={room.id_ruangan} value={room.id_ruangan}>{room.nama_ruangan} ({room.id_ruangan})</option>)}</select></div>
            {targetOccupied.length > 0 && <div className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800"><AlertTriangle className="h-4 w-4 shrink-0" /> Ruangan tujuan masih digunakan oleh {targetOccupied.map((row) => row.kelas).join(", ")} pada JP ini.</div>}
            <div><label className="text-xs font-black text-slate-600">Alasan (wajib untuk histori)</label><input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm" /></div>
            {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">{error}</div>}
            {message && <p className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-900">{message}</p>}
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button onClick={onClose} disabled={busy} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold"><T>{"Batal"}</T></button>
              <button onClick={() => void save()} disabled={busy || targetOccupied.length > 0 || (mode === "MOVE" && !selected)} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-black text-white disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Simpan untuk tanggal ini</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
