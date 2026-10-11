import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BellRing,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  FileWarning,
  RefreshCw,
  ShieldAlert,
  UserRoundCheck,
} from "lucide-react";
import { isConflictHidden, readHiddenConflicts, CONFLICT_HIDE_STORAGE_KEY, type HiddenConflictRecords } from "../domain/conflictAcknowledgements";
import type { ActivePage, JadwalInsidentalItem, KalenderAkademikItem, LogIzinItem, ScheduleItem } from "../domain/models";
import { groupWaitingBadalRows, type LeaveReviewRequest, type WaitingBadalSession } from "../domain/leaveApproval";
import { detectScheduleConflicts, type ScheduleConflict } from "../domain/scheduleConflicts";
import {
  deriveMissingTaskActions,
  filterActionableConflicts,
  summarizeOperationalActions,
  type MissingTaskActionItem,
} from "../domain/actionCenter";
import { SupabaseLeaveApprovalRepository } from "../infrastructure/repositories/supabaseLeaveApprovalRepository";
import { getErrorMessage } from "../domain/errorMessage";

interface OperationalActionCenterProps {
  schedules: ScheduleItem[];
  incidentals: JadwalInsidentalItem[];
  kalenderAkademik?: KalenderAkademikItem[];
  logs: LogIzinItem[];
  schoolToday: string;
  onNavigate: (page: ActivePage) => void;
  onSelectTeacher: (teacherName: string) => void;
  onBack: () => void;
}

function formatDate(value: string): string {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value || "-";
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function SectionHeader(props: {
  title: string;
  subtitle: string;
  count: number;
  onOpen: () => void;
  tone?: "amber" | "indigo" | "rose" | "sky";
}) {
  const tone = props.tone || "indigo";
  const badge = {
    amber: "bg-amber-100 text-amber-800",
    indigo: "bg-indigo-100 text-indigo-800",
    rose: "bg-rose-100 text-rose-800",
    sky: "bg-sky-100 text-sky-800",
  }[tone];
  return (
    <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="font-black text-slate-900">{props.title}</h2>
          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black ${badge}`}>{props.count}</span>
        </div>
        <p className="mt-0.5 text-xs text-slate-500">{props.subtitle}</p>
      </div>
      <button onClick={props.onOpen} className="inline-flex items-center gap-1 self-start rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 sm:self-auto">
        Buka workflow <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center gap-2 px-5 py-7 text-sm font-semibold text-slate-400">
      <CheckCircle2 className="h-4 w-4 text-emerald-500" /> {text}
    </div>
  );
}

export const OperationalActionCenter: React.FC<OperationalActionCenterProps> = ({
  schedules,
  incidentals,
  kalenderAkademik = [],
  logs,
  schoolToday,
  onNavigate,
  onSelectTeacher,
  onBack,
}) => {
  const repository = useMemo(() => new SupabaseLeaveApprovalRepository(), []);
  const [pendingRequests, setPendingRequests] = useState<LeaveReviewRequest[]>([]);
  const [waitingSessions, setWaitingSessions] = useState<WaitingBadalSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [hiddenConflicts, setHiddenConflicts] = useState<HiddenConflictRecords>(readHiddenConflicts);

  const missingTasks = useMemo(
    () => deriveMissingTaskActions(logs, schoolToday),
    [logs, schoolToday],
  );
  const conflicts = useMemo(
    () => filterActionableConflicts(detectScheduleConflicts(schedules, incidentals, kalenderAkademik), schoolToday)
      .filter((conflict) => !isConflictHidden(conflict, hiddenConflicts)),
    [schedules, incidentals, kalenderAkademik, schoolToday, hiddenConflicts],
  );
  const summary = useMemo(() => summarizeOperationalActions({
    pendingRequests,
    waitingSessions,
    missingTasks,
    conflicts,
    schoolToday,
  }), [pendingRequests, waitingSessions, missingTasks, conflicts, schoolToday]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [requests, waiting] = await Promise.all([
        repository.listSubmittedRequests(100),
        repository.listWaitingCoverage(500),
      ]);
      setPendingRequests(requests);
      setWaitingSessions(groupWaitingBadalRows(waiting));
      setLastUpdatedAt(new Date());
    } catch (err) {
      setError(getErrorMessage(err, "Action Center gagal dimuat."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    const sync = (event: StorageEvent) => {
      if (event.key === CONFLICT_HIDE_STORAGE_KEY) setHiddenConflicts(readHiddenConflicts());
    };
    window.addEventListener("storage", sync);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const openMissingTask = (item: MissingTaskActionItem) => {
    onSelectTeacher(item.absentTeacherName);
    onNavigate("lengkapi-tugas");
  };

  const topPending = pendingRequests.slice(0, 5);
  const topWaiting = waitingSessions.slice(0, 5);
  const topMissing = missingTasks.slice(0, 5);
  const topConflicts = [...conflicts]
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "BLOCKER" ? -1 : 1))
    .slice(0, 5);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 pb-12">
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <button onClick={onBack} className="mt-0.5 rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" title="Kembali">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <BellRing className="h-6 w-6 text-indigo-600" />
              <h1 className="text-2xl font-black tracking-tight text-slate-900">Operational Action Center</h1>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              Satu antrean kerja untuk izin, badal, tugas yang belum tersedia, dan conflict jadwal yang masih actionable.
            </p>
          </div>
        </div>
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
          {lastUpdatedAt && <span className="text-[11px] font-semibold text-slate-400">Update {lastUpdatedAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}</span>}
          <button onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">
          <AlertTriangle className="mr-2 inline h-4 w-4" />{error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <button onClick={() => onNavigate("approval-izin")} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <span className="text-[10px] font-black uppercase tracking-wider text-amber-600">Pending Approval</span>
          <div className="mt-1 text-3xl font-black text-amber-950">{summary.pendingApprovalCount}</div>
          <div className="mt-1 text-[11px] font-bold text-amber-700">{summary.overdueApprovalCount} lewat tanggal</div>
        </button>
        <button onClick={() => onNavigate("approval-izin")} className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600">Waiting Badal</span>
          <div className="mt-1 text-3xl font-black text-indigo-950">{summary.waitingBadalCount}</div>
          <div className="mt-1 text-[11px] font-bold text-indigo-700">{summary.waitingBadalTodayCount} untuk hari ini</div>
        </button>
        <button onClick={() => topMissing[0] ? openMissingTask(topMissing[0]) : onNavigate("log-pengganti")} className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <span className="text-[10px] font-black uppercase tracking-wider text-sky-600">Missing Task</span>
          <div className="mt-1 text-3xl font-black text-sky-950">{summary.missingTaskCount}</div>
          <div className="mt-1 text-[11px] font-bold text-sky-700">{summary.missingTaskTodayCount} untuk hari ini</div>
        </button>
        <button onClick={() => onNavigate("schedule-control-center")} className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
          <span className="text-[10px] font-black uppercase tracking-wider text-rose-600">Conflict Alerts</span>
          <div className="mt-1 text-3xl font-black text-rose-950">{summary.conflictCount}</div>
          <div className="mt-1 text-[11px] font-bold text-rose-700">{summary.blockerCount} blocker • {summary.warningCount} warning</div>
        </button>
        <div className="col-span-2 rounded-2xl border border-slate-800 bg-slate-900 p-4 text-white shadow-sm lg:col-span-1">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-300">Butuh Tindakan</span>
          <div className="mt-1 text-3xl font-black">{summary.totalActionCount}</div>
          <div className="mt-1 text-[11px] font-bold text-amber-300">{summary.urgentTodayCount} prioritas hari ini</div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <SectionHeader title="Pending Approval" subtitle="Pengajuan SUBMITTED yang belum diputuskan." count={pendingRequests.length} tone="amber" onOpen={() => onNavigate("approval-izin")} />
          {topPending.length === 0 ? <EmptyRow text="Tidak ada izin menunggu persetujuan" /> : (
            <div className="divide-y divide-slate-100">
              {topPending.map((request) => (
                <button key={request.id} onClick={() => onNavigate("approval-izin")} className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-slate-50">
                  <ClipboardCheck className="h-5 w-5 shrink-0 text-amber-500" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-black text-slate-900">{request.teacherName}</div>
                    <div className="mt-0.5 text-xs font-semibold text-slate-500">{formatDate(request.scheduleDate)} • {request.periods.length} JP • {request.requestCode}</div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300" />
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <SectionHeader title="Waiting Badal" subtitle="Izin APPROVED yang masih menunggu guru pengganti." count={waitingSessions.length} tone="indigo" onOpen={() => onNavigate("approval-izin")} />
          {topWaiting.length === 0 ? <EmptyRow text="Semua slot badal sudah tertangani" /> : (
            <div className="divide-y divide-slate-100">
              {topWaiting.map((session) => (
                <button key={session.key} onClick={() => onNavigate("approval-izin")} className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-slate-50">
                  <UserRoundCheck className="h-5 w-5 shrink-0 text-indigo-500" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-black text-slate-900">{session.absentTeacherName} • JP {session.period}</div>
                    <div className="mt-0.5 truncate text-xs font-semibold text-slate-500">{formatDate(session.scheduleDate)} • {session.classLabel} • {session.subject}</div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300" />
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <SectionHeader title="Missing Task" subtitle="Badal sudah assigned tetapi materi/tugas belum tersedia." count={missingTasks.length} tone="sky" onOpen={() => topMissing[0] ? openMissingTask(topMissing[0]) : onNavigate("log-pengganti")} />
          {topMissing.length === 0 ? <EmptyRow text="Tidak ada tugas yang perlu dilengkapi" /> : (
            <div className="divide-y divide-slate-100">
              {topMissing.map((item) => (
                <button key={item.key} onClick={() => openMissingTask(item)} className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-slate-50">
                  <FileWarning className="h-5 w-5 shrink-0 text-sky-500" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-black text-slate-900">{item.absentTeacherName} • JP {item.period}</div>
                    <div className="mt-0.5 truncate text-xs font-semibold text-slate-500">{formatDate(item.scheduleDate)} • {item.classLabel} • badal {item.substituteTeacherName}</div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300" />
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <SectionHeader title="Conflict Alerts" subtitle="Blocker dan warning dari effective schedule yang masih relevan." count={conflicts.length} tone="rose" onOpen={() => onNavigate("schedule-control-center")} />
          {topConflicts.length === 0 ? <EmptyRow text="Tidak ada conflict actionable" /> : (
            <div className="divide-y divide-slate-100">
              {topConflicts.map((conflict: ScheduleConflict) => (
                <button key={conflict.id} onClick={() => onNavigate("schedule-control-center")} className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-slate-50">
                  <ShieldAlert className={`h-5 w-5 shrink-0 ${conflict.severity === "BLOCKER" ? "text-rose-600" : "text-amber-500"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-black text-slate-900">{conflict.title}</div>
                    <div className="mt-0.5 truncate text-xs font-semibold text-slate-500">{conflict.dayOrDate} • JP {conflict.period} • {conflict.classes.join(" + ")}</div>
                  </div>
                  <span className={`rounded-md px-2 py-0.5 text-[9px] font-black ${conflict.severity === "BLOCKER" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800"}`}>{conflict.severity}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-xs font-semibold text-slate-500 shadow-sm">
        <Clock3 className="mr-1.5 inline h-4 w-4" /> Antrean badal kadaluarsa tetap dibersihkan oleh backend. Conflict insidental tanggal lampau tidak ditampilkan di Action Center, tetapi histori tetap ada di database/versioning.
      </div>
    </div>
  );
};
