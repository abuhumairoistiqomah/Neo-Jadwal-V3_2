import React, { useMemo, useState } from "react";
import { ClipboardCopy, Loader2 } from "lucide-react";
import type { JadwalInsidentalItem, ScheduleItem, LogIzinItem } from "../domain/models";
import type { ScheduleAdminContext } from "../infrastructure/repositories/scheduleAdminRepository";
import { ScheduleAdminRepository } from "../infrastructure/repositories/scheduleAdminRepository";
import { isClassMatch } from "../domain/class";
import { dayNameFromISODate } from "../domain/scheduleMutation";
import { previewIncidentalCopy } from "../domain/schedule/incidentalCopy";
import { formatOperationalError } from "../domain/formatOperationalError";

interface Props {
  schedules: ScheduleItem[];
  incidentals: JadwalInsidentalItem[];
  logs: LogIzinItem[];
  context: ScheduleAdminContext | null;
  canManage: boolean;
  onChanged: () => Promise<unknown> | unknown;
  onCopied: (incidentalIds: string[]) => void;
}

/** Copy date-scoped lesson content only; never blindly duplicate rooms or weekly master. */
export const IncidentalCopyPanel: React.FC<Props> = ({ schedules, incidentals, logs, context, canManage, onChanged, onCopied }) => {
  const repo = useMemo(() => new ScheduleAdminRepository(), []);
  const [date, setDate] = useState("");
  const [sourceClassId, setSourceClassId] = useState("");
  const [periods, setPeriods] = useState<number[]>([]);
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const [copySourceTeam, setCopySourceTeam] = useState(true);
  const [copyTimes, setCopyTimes] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const activeClasses = useMemo(() => (context?.classes || []).filter(c => c.is_active !== false), [context]);
  const sourceClass = activeClasses.find(c => c.id === sourceClassId);
  const sourceRows = incidentals.filter(row => row.tanggal === date
    && sourceClass && isClassMatch(row.kelas, sourceClass.display_name)
    && Number(row.jam_ke) >= 1 && Number(row.jam_ke) <= 6);
  const availableSources = activeClasses.filter(c => incidentals.some(row => row.tanggal === date
    && isClassMatch(c.display_name, row.kelas) && Number(row.jam_ke) >= 1 && Number(row.jam_ke) <= 6));
  const selectedTargets = activeClasses.filter(c => targetIds.includes(c.id) && c.id !== sourceClassId);
  const sourceDisplayDetails = (row: JadwalInsidentalItem): { mode: string; note: string } => {
    const day = dayNameFromISODate(row.tanggal);
    const master = schedules.find(item => item.hari === day
      && Number(item.jam_ke) === Number(row.jam_ke)
      && isClassMatch(item.kelas, row.kelas));
    const mode = row.classModeOverridden
      ? row.kelasgabung || "Tidak"
      : master?.kelasgabung || row.kelasgabung || "Tidak";
    return {
      mode: mode === "Ya" ? "Kelas Gabung" : mode === "Bergantian" ? "Kelas Bergantian" : "Kelas Normal",
      note: row.keterangan_khusus || master?.keterangan_khusus || "",
    };
  };
  const sourceTeachersFor = (row: JadwalInsidentalItem): string[] => {
    const day = dayNameFromISODate(row.tanggal);
    const master = schedules.find(item => item.hari === day && Number(item.jam_ke) === Number(row.jam_ke)
      && isClassMatch(item.kelas, row.kelas));
    const assigned = row.replaceTeachers || [row.guru1, row.guru2, row.guru3, row.guru4, row.guru5, row.guru6].some(Boolean)
      ? row : master || row;
    return [assigned.guru1, assigned.guru2, assigned.guru3, assigned.guru4, assigned.guru5, assigned.guru6].filter(Boolean).map(String);
  };
  const preview = useMemo(() => previewIncidentalCopy({
    date, sourceClass: sourceClass?.display_name || "", periods,
    targetClasses: selectedTargets.map(c => c.display_name), incidentals, schedules, logs,
    overwriteExisting: overwrite, copySourceTeam,
  }), [date, sourceClass?.display_name, periods, selectedTargets.map(c => c.id).join("|"), incidentals, schedules, logs, overwrite, copySourceTeam]);
  const blocked = preview.filter(row => row.status.startsWith("BLOCKED"));
  const chooseSource = (id: string) => {
    setSourceClassId(id); setPeriods([]); setTargetIds(old => old.filter(item => item !== id));
    setError(""); setResult("");
  };
  const copy = async () => {
    setError(""); setResult("");
    if (!canManage || !date || !sourceClassId || !periods.length || !selectedTargets.length || blocked.length) {
      setError("Pilih sumber, JP, dan kelas tujuan; selesaikan terlebih dahulu semua kendala dalam preview."); return;
    }
    const note = `${selectedTargets.length} kelas × ${periods.length} JP = ${preview.length} slot pada ${date}`;
    if (!window.confirm(`Salin jadwal insidental dari ${sourceClass?.display_name}?\n${note}\n\nMaster tidak berubah. ${copySourceTeam ? "Tim guru SUMBER ikut disalin ke semua target (dapat diedit setelahnya). " : "Tim guru tujuan dipertahankan. "}Ruangan tujuan tetap. ${overwrite ? "Insidental tujuan yang sudah ada akan diperbarui. " : ""}Potensi bentrok pengajar perlu diperiksa. Lanjutkan?`)) return;
    setBusy(true);
    try {
      const response = await repo.copyIncidentalLessons({
        date, sourceClassId, periods, targetClassIds: selectedTargets.map(c => c.id),
        overwriteExisting: overwrite, copySourceTeam, copyTimes,
      });
      setResult(`${response.copied} slot berhasil disalin. Jadwal master tidak berubah.`);
      try {
        await onChanged();
        onCopied(response.incidentalIds);
        setResult(`${response.copied} slot tersimpan. Hasil salinan sekarang ditampilkan di Daftar Jadwal Insidental; klik Edit untuk mengubah guru/mapel tiap kelas.`);
      } catch (refreshError) {
        setResult(`${response.copied} slot sudah tersimpan di Supabase, tetapi refresh layar gagal. Klik Refresh Supabase untuk melihatnya.`);
      }
    } catch (cause) { setError(formatOperationalError(cause)); }
    finally { setBusy(false); }
  };
  return <section className="rounded-3xl border border-indigo-200 bg-indigo-50/40 p-5 space-y-4" data-testid="incidental-copy-panel">
    <div><h2 className="flex items-center gap-2 font-black text-lg text-indigo-950"><ClipboardCopy className="w-5 h-5"/> Salin Jadwal Insidental ke Beberapa Kelas</h2>
      <p className="text-xs text-indigo-800 mt-1">Salin <strong>mapel, tim guru sumber, alasan, jenis kegiatan, catatan khusus, status kelas gabungan</strong>, dan opsional jam dari sumber. Keterangan yang terlihat di jadwal akan <strong>sama persis dengan sumber</strong>, tanpa label teknis copy. Hasil bisa diedit/hapus per kelas dan JP. Identitas kelas, ruangan tujuan, dan master tetap aman.</p></div>
    <div className="grid gap-3 md:grid-cols-2">
      <label className="text-xs font-bold text-slate-600">Tanggal sumber
        <input className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2" type="date" value={date} onChange={e => {setDate(e.target.value);chooseSource("");}} /></label>
      <label className="text-xs font-bold text-slate-600">Kelas sumber (yang sudah punya insidental)
        <select className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2" value={sourceClassId} onChange={e=>chooseSource(e.target.value)}>
          <option value="">— Pilih kelas sumber —</option>
          {availableSources.map(c=><option key={c.id} value={c.id}>{c.display_name}</option>)}
        </select></label>
    </div>
    {sourceClassId && <div className="rounded-xl border border-indigo-100 bg-white p-3 space-y-2">
      <div className="text-sm font-black">Pilih JP yang mau disalin</div>
      <div className="flex flex-wrap gap-2">{sourceRows.sort((a,b)=>Number(a.jam_ke)-Number(b.jam_ke)).map(row => {
        const jp=Number(row.jam_ke);return <label key={row.id} className="inline-flex items-center gap-2 rounded-lg border bg-slate-50 px-3 py-2 text-xs cursor-pointer">
          <input type="checkbox" checked={periods.includes(jp)} onChange={e=>setPeriods(old=>e.target.checked?[...old,jp]:old.filter(n=>n!==jp))}/>
          <span>JP {jp} • {row.mapel}
            <span className="block mt-0.5 font-normal text-slate-500">Guru sumber: {sourceTeachersFor(row).join(" / ") || "Belum tercatat"}</span>
            <span className="block mt-0.5 font-normal text-slate-500">{sourceDisplayDetails(row).mode}{sourceDisplayDetails(row).note ? ` • ${sourceDisplayDetails(row).note}` : ""}</span>
          </span>
        </label>;
      })}</div>
    </div>}
    {sourceClassId && <div className="rounded-xl border border-indigo-100 bg-white p-3 space-y-2">
      <div className="font-black text-sm">Kelas tujuan ({selectedTargets.length} dipilih)</div>
      <input className="w-full rounded-lg border border-slate-300 p-2 text-sm" placeholder="Cari kelas: 12 AE, 12 MQ..." value={filter} onChange={e=>setFilter(e.target.value)}/>
      <div className="max-h-44 overflow-y-auto grid sm:grid-cols-2 lg:grid-cols-3 gap-2">{activeClasses.filter(c=>c.id!==sourceClassId && c.display_name.toLowerCase().includes(filter.toLowerCase())).map(c=><label key={c.id} className="flex items-center gap-2 text-xs font-semibold text-slate-700">
        <input type="checkbox" checked={targetIds.includes(c.id)} onChange={e=>setTargetIds(old=>e.target.checked?[...old,c.id]:old.filter(id=>id!==c.id))}/>{c.display_name}
      </label>)}</div>
    </div>}
    {sourceClassId && <div className="space-y-2 text-xs text-slate-700">
      <label className="flex items-center gap-2"><input type="checkbox" checked={copyTimes} onChange={e=>setCopyTimes(e.target.checked)}/> Salin jam khusus tanggal ini (jika diatur di sumber)</label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={copySourceTeam} onChange={e=>setCopySourceTeam(e.target.checked)}/> <strong>Salin tim guru sumber ke SEMUA kelas tujuan</strong> (default ON; guru dapat diedit sesudah copy)</label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={overwrite} onChange={e=>setOverwrite(e.target.checked)}/> Perbarui hasil salin / insidental tujuan yang sudah ada (memerlukan konfirmasi)</label>
      {copySourceTeam && <p className="text-amber-800">⚠ Tim guru disalin sesuai sumber, termasuk jika sumber berisi "Guru belum ditentukan". Guru yang sama bisa tercatat di beberapa kelas/JP sekaligus; setelah copy, periksa dan sunting masing-masing melalui tombol Edit. Ruangan tidak ikut disalin.</p>}
    </div>}
    {preview.length>0 && <div className="rounded-xl border bg-white p-3 space-y-2">
      <div className="font-black text-sm">Preview {preview.length} slot • {blocked.length} butuh tindakan</div>
      <div className="max-h-60 overflow-y-auto space-y-1">{preview.map(row=><div key={`${row.className}-${row.period}`} className={`text-xs rounded-lg px-2 py-1.5 ${row.status.startsWith("BLOCKED") ? "bg-rose-50 text-rose-800" : "bg-emerald-50 text-emerald-900"}`}>
        <strong>{row.className} • JP{row.period} → {row.subject}</strong> — {row.explanation}
      </div>)}</div>
      <p className="text-xs text-slate-500">Pemeriksaan final dilakukan ulang di database. Slot dengan badal aktif tidak boleh ditimpa. Jika memilih perbarui, edit guru pada tujuan yang lama akan terganti oleh tim sumber.</p>
    </div>}
    {error && <div role="alert" className="text-sm text-rose-700 font-bold">{error}</div>}
    {result && <div role="status" className="text-sm text-emerald-700 font-bold">{result}</div>}
    <button disabled={!canManage || busy || !preview.length || blocked.length>0} onClick={()=>void copy()}
      className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-black text-white disabled:opacity-40">
      {busy?<Loader2 className="w-4 h-4 animate-spin"/>:<ClipboardCopy className="w-4 h-4"/>} Salin ke {selectedTargets.length} Kelas
    </button>
  </section>;
};
