import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Eye,
  EyeOff,
  GitBranch,
  History,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import { isConflictHidden, readHiddenConflicts, updateHiddenConflict, writeHiddenConflicts, CONFLICT_HIDE_STORAGE_KEY, type HiddenConflictRecords } from "../domain/conflictAcknowledgements";
import type { JadwalInsidentalItem, KalenderAkademikItem, ScheduleItem } from "../domain/models";
import { detectScheduleConflicts } from "../domain/scheduleConflicts";
import { localISODate, visibleScheduleConflicts } from "../domain/operationalConflictVisibility";
import {
  ScheduleVersionRepository,
  type ScheduleVersionRow,
} from "../infrastructure/repositories/scheduleVersionRepository";

interface ScheduleControlCenterProps {
  schedules: ScheduleItem[];
  incidentals: JadwalInsidentalItem[];
  kalenderAkademik?: KalenderAkademikItem[];
  onChanged: () => Promise<void> | void;
  onBack: () => void;
}

function actionLabel(action: string): string {
  switch (action) {
    case "VERSIONING_BASELINE": return "Baseline V3.13.6";
    case "SCHEDULE_MASTER_QUICK_EDIT": return "Quick Edit Permanen";
    case "SCHEDULE_INCIDENTAL_INSERT": return "Insidental Baru";
    case "SCHEDULE_INCIDENTAL_UPDATE": return "Update Insidental";
    case "SCHEDULE_INCIDENTAL_DELETE": return "Hapus Insidental";
    case "SCHEDULE_IMPORT_PUBLISH": return "Publish Import Jadwal Massal";
    case "SYAIKH_ROTATION_IMPORT_PUBLISH": return "Publish Rotasi Syaikh";
    case "SCHEDULE_VERSION_ROLLBACK": return "Rollback Jadwal";
    case "OPERATIONAL_RULE_INSERT": return "Tambah Kalender Akademik";
    case "OPERATIONAL_RULE_UPDATE": return "Update Kalender Akademik";
    case "OPERATIONAL_RULE_DELETE": return "Hapus Kalender Akademik";
    case "ACADEMIC_EVENT_GROUP_PUBLISH": return "Publish Kalender Akademik (Batch)";
    case "ACADEMIC_EVENT_GROUP_STATUS": return "Aktif/Nonaktif Kalender Akademik";
    default: return action.replaceAll("_", " ");
  }
}

function formatDateTime(value: string): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function metadataSummary(version: ScheduleVersionRow): string | null {
  const after = (version.metadata?.after_data || {}) as Record<string, unknown>;
  if (version.sourceAction === "SCHEDULE_IMPORT_PUBLISH") {
    const inserted = Number(after.inserted || 0);
    const deactivated = Number(after.deactivated || 0);
    return `${inserted} slot masuk • ${deactivated} slot dinonaktifkan`;
  }
  if (version.sourceAction === "SYAIKH_ROTATION_IMPORT_PUBLISH") {
    const published = Number(after.published || 0);
    const nativeRows = Number(after.native_rows || 0);
    const normalRows = Number(after.normal_rows || 0);
    return `${published} perubahan • ${nativeRows} Native • ${normalRows} Normal`;
  }
  if (version.sourceAction === "SCHEDULE_VERSION_ROLLBACK") {
    const target = Number(after.rolled_back_to_version_no || 0);
    const reason = String(after.reason || "").trim();
    return `Kembali ke v${target || "?"}${reason ? ` • ${reason}` : ""}`;
  }
  const reason = String(after.reason || "").trim();
  if (reason) return reason;
  return null;
}

export const ScheduleControlCenter: React.FC<ScheduleControlCenterProps> = ({
  schedules,
  incidentals,
  kalenderAkademik = [],
  onChanged,
  onBack,
}) => {
  const repo = useMemo(() => new ScheduleVersionRepository(), []);
  const [tab, setTab] = useState<"history" | "conflict">("history");
  const [showExpired, setShowExpired] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [hiddenConflicts, setHiddenConflicts] = useState<HiddenConflictRecords>(readHiddenConflicts);
  const [versions, setVersions] = useState<ScheduleVersionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyVersionId, setBusyVersionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allConflicts = useMemo(() => detectScheduleConflicts(schedules, incidentals, kalenderAkademik), [schedules, incidentals, kalenderAkademik]);
  const todayISO = localISODate();
  const actionableConflicts = useMemo(() => visibleScheduleConflicts(allConflicts, todayISO, showExpired), [allConflicts, todayISO, showExpired]);
  const hiddenCount = actionableConflicts.filter((item) => isConflictHidden(item, hiddenConflicts)).length;
  const conflicts = useMemo(() => actionableConflicts.filter((item) => showHidden || !isConflictHidden(item, hiddenConflicts)), [actionableConflicts, hiddenConflicts, showHidden]);
  const toggleHidden = (conflict: (typeof allConflicts)[number], hide: boolean) => {
    setHiddenConflicts((current) => {
      const next = updateHiddenConflict(current, conflict, hide);
      writeHiddenConflicts(next);
      return next;
    });
  };
  const expiredCount = allConflicts.length - visibleScheduleConflicts(allConflicts, todayISO).length;
  const blockers = conflicts.filter((item) => item.severity === "BLOCKER");
  const warnings = conflicts.filter((item) => item.severity === "WARNING");

  const loadHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      setVersions(await repo.listVersions(80));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat riwayat versi jadwal.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadHistory();
  }, []);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === CONFLICT_HIDE_STORAGE_KEY) setHiddenConflicts(readHiddenConflicts());
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const rollback = async (version: ScheduleVersionRow) => {
    if (versions[0]?.versionId === version.versionId) return;
    const reason = window.prompt(
      `Rollback jadwal ke versi v${version.versionNo}?\n\nAlasan rollback (wajib untuk audit):`,
      `Rollback ke v${version.versionNo}`,
    );
    if (reason === null) return;
    if (!reason.trim()) {
      window.alert("Alasan rollback wajib diisi.");
      return;
    }
    if (!window.confirm(
      `Konfirmasi rollback ke v${version.versionNo}.\n\nMaster schedule, jadwal insidental, dan Kalender Akademik akan dikembalikan ke snapshot versi tersebut. Data izin, badal, dan tugas TIDAK ikut diputar mundur.`,
    )) return;

    setBusyVersionId(version.versionId);
    setError(null);
    try {
      const result = await repo.rollback(version.versionId, reason.trim());
      await onChanged();
      await loadHistory();
      window.alert(
        `Rollback selesai ke v${result.rolledBackToVersionNo}.\n${result.masterRowsRestored} master row, ${result.incidentalsRestored} insidental, ${result.academicEventsRestored} event kalender dipulihkan.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rollback gagal.");
    } finally {
      setBusyVersionId(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 pb-12">
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <button onClick={onBack} className="mt-0.5 rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" title="Kembali">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <GitBranch className="h-6 w-6 text-indigo-600" />
              <h1 className="text-2xl font-black tracking-tight text-slate-900">Versi & Konflik Jadwal</h1>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              Riwayat publish, rollback canonical schedule, dan pusat deteksi bentrok. Rollback hanya memutar data jadwal; histori izin/badal/tugas tetap utuh.
            </p>
          </div>
        </div>
        <button onClick={() => void loadHistory()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Versi tersimpan</span>
          <div className="mt-1 text-3xl font-black text-slate-900">{versions.length}</div>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 shadow-sm">
          <span className="text-[10px] font-black uppercase tracking-wider text-rose-500">Blocker</span>
          <div className="mt-1 text-3xl font-black text-rose-900">{blockers.length}</div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 shadow-sm">
          <span className="text-[10px] font-black uppercase tracking-wider text-amber-600">Warning</span>
          <div className="mt-1 text-3xl font-black text-amber-900">{warnings.length}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
        <div className="grid grid-cols-2 gap-1">
          <button onClick={() => setTab("history")} className={`rounded-xl px-4 py-3 text-sm font-black transition ${tab === "history" ? "bg-indigo-600 text-white shadow" : "text-slate-600 hover:bg-slate-50"}`}>
            <span className="inline-flex items-center gap-2"><History className="h-4 w-4" /> Publish History</span>
          </button>
          <button onClick={() => setTab("conflict")} className={`rounded-xl px-4 py-3 text-sm font-black transition ${tab === "conflict" ? "bg-indigo-600 text-white shadow" : "text-slate-600 hover:bg-slate-50"}`}>
            <span className="inline-flex items-center gap-2"><ShieldAlert className="h-4 w-4" /> Conflict Center ({conflicts.length})</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">
          <AlertTriangle className="mr-2 inline h-4 w-4" />{error}
        </div>
      )}

      {tab === "history" ? (
        <div className="space-y-3">
          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500"><Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />Memuat versi jadwal...</div>
          ) : versions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">Belum ada versi. Migration V3.13.6 akan membuat satu baseline otomatis.</div>
          ) : versions.map((version, index) => {
            const latest = index === 0;
            const summary = metadataSummary(version);
            return (
              <div key={version.versionId} className={`rounded-2xl border bg-white p-5 shadow-sm ${latest ? "border-emerald-200 ring-1 ring-emerald-100" : "border-slate-200"}`}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-black text-white">v{version.versionNo}</span>
                      {latest && <span className="rounded-lg bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-800">CURRENT</span>}
                      <span className="font-black text-slate-900">{actionLabel(version.sourceAction)}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{formatDateTime(version.createdAt)}</span>
                      <span>{version.actorLabel}</span>
                      <span>{version.masterCount} master</span>
                      <span>{version.activeIncidentalCount} insidental aktif</span>
                      <span>{version.activeCalendarCount} event aktif</span>
                    </div>
                    {summary && <p className="mt-2 text-sm font-semibold text-indigo-700">{summary}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => void rollback(version)}
                    disabled={latest || busyVersionId !== null}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-black text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
                    title={latest ? "Versi ini sudah menjadi versi aktif" : `Kembalikan jadwal ke v${version.versionNo}`}
                  >
                    {busyVersionId === version.versionId ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                    Rollback
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-600">
            <span>Konflik lampau otomatis tersembunyi. Tombol Sudah Ditangani hanya menyembunyikan di browser ini, bukan menghapus konflik di Supabase.</span>
            <div className="flex flex-wrap gap-4">
              <label className="inline-flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={showHidden} onChange={(event) => setShowHidden(event.target.checked)} /> Lihat yang disembunyikan ({hiddenCount})</label>
              <label className="inline-flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={showExpired} onChange={(event) => setShowExpired(event.target.checked)} /> Lihat histori konflik ({expiredCount})</label>
            </div>
          </div>
          {conflicts.length === 0 ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-10 text-center">
              <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-600" />
              <h3 className="font-black text-emerald-900">{hiddenCount > 0 && !showHidden ? "Semua konflik yang relevan disembunyikan" : "Tidak ada bentrok terdeteksi"}</h3>
              <p className="mt-1 text-sm text-emerald-700">{hiddenCount > 0 && !showHidden ? `${hiddenCount} peringatan disembunyikan di browser ini. Buka 'Lihat yang disembunyikan' untuk meninjau kembali; data jadwal tidak berubah.` : "Master schedule dan jadwal insidental aktif terlihat konsisten."}</p>
            </div>
          ) : conflicts.map((conflict) => (
            <div key={conflict.id} className={`rounded-2xl border p-5 shadow-sm ${conflict.severity === "BLOCKER" ? "border-rose-200 bg-rose-50/70" : "border-amber-200 bg-amber-50/70"}`}>
              <div className="flex items-start gap-3">
                <AlertTriangle className={`mt-0.5 h-5 w-5 shrink-0 ${conflict.severity === "BLOCKER" ? "text-rose-600" : "text-amber-600"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-black ${conflict.severity === "BLOCKER" ? "bg-rose-200 text-rose-900" : "bg-amber-200 text-amber-900"}`}>{conflict.severity}</span>
                    <span className="rounded-md bg-white/80 px-2 py-0.5 text-[10px] font-black text-slate-500">{conflict.kind}</span>
                    <h3 className="font-black text-slate-900">{conflict.title}</h3>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-slate-700">{conflict.detail}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-500">
                    <span className="rounded-lg bg-white/80 px-2.5 py-1">{conflict.dayOrDate}</span>
                    <span className="rounded-lg bg-white/80 px-2.5 py-1">JP {conflict.period}</span>
                    {conflict.room && <span className="rounded-lg bg-white/80 px-2.5 py-1">📍 {conflict.room}</span>}
                    {conflict.classes.map((name) => <span key={name} className="rounded-lg bg-white/80 px-2.5 py-1">{name}</span>)}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => toggleHidden(conflict, !isConflictHidden(conflict, hiddenConflicts))}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                      title="Mengubah tampilan di browser ini; tidak menghapus data atau memperbaiki bentrok jadwal">
                      {isConflictHidden(conflict, hiddenConflicts) ? <><Eye className="h-3.5 w-3.5" /> Tampilkan Lagi</> : <><EyeOff className="h-3.5 w-3.5" /> Sembunyikan / Sudah Ditangani</>}
                    </button>
                    {isConflictHidden(conflict, hiddenConflicts) && <span className="text-xs text-slate-500">Disembunyikan di browser ini</span>}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
