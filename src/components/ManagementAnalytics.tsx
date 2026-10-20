import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  CalendarRange,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileCheck2,
  GraduationCap,
  RefreshCw,
  Search,
  ShieldCheck,
  TrendingUp,
  UserCheck,
  Users,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
} from "lucide-react";
import {
  buildTeacherAnalyticsCsv,
  getCoverageHealthLabel,
  type ManagementAnalyticsPayload,
  type ManagementTeacherAnalyticsRow,
  sortTeacherActivityRows,
  type TeacherActivitySortKey,
  type TeacherActivitySortDirection,
} from "../domain/managementAnalytics";
import { getSchoolTodayISO } from "../domain/date";
import { ManagementAnalyticsRepository } from "../infrastructure/repositories/managementAnalyticsRepository";
import { getErrorMessage } from "../domain/errorMessage";
import { getHorizontalScrollMetrics, getDraggedScrollLeft, syncHorizontalScroll } from "../domain/tableNavigation";

import { T } from '../i18n/LanguageProvider';
interface ManagementAnalyticsProps {
  onBack: () => void;
}

type Preset = "month" | "30d" | "90d" | "custom";

function formatDate(value: string): string {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value || "-";
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function subtractDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function KpiCard(props: {
  label: string;
  value: string | number;
  helper: string;
  icon: React.ElementType;
  tone?: "blue" | "emerald" | "amber" | "rose" | "violet" | "slate";
}) {
  const tone = props.tone || "blue";
  const styles = {
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    rose: "bg-rose-50 text-rose-700 border-rose-100",
    violet: "bg-violet-50 text-violet-700 border-violet-100",
    slate: "bg-slate-50 text-slate-700 border-slate-200",
  }[tone];
  const Icon = props.icon;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-400">{props.label}</p>
          <p className="mt-2 text-2xl font-black tracking-tight text-slate-900">{props.value}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">{props.helper}</p>
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${styles}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

export const ManagementAnalytics: React.FC<ManagementAnalyticsProps> = ({ onBack }) => {
  const schoolToday = getSchoolTodayISO();
  const [preset, setPreset] = useState<Preset>("month");
  const [startDate, setStartDate] = useState(`${schoolToday.slice(0, 7)}-01`);
  const [endDate, setEndDate] = useState(schoolToday);
  const [data, setData] = useState<ManagementAnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [teacherSort, setTeacherSort] = useState<TeacherActivitySortKey>('leaveSharePct');
  const [sortDirection, setSortDirection] = useState<TeacherActivitySortDirection>('desc');
  // RC2: two scrollbars share the same scrollLeft; scroll events never update React state.
  const topTableScrollRef = useRef<HTMLDivElement>(null);
  const bodyTableScrollRef = useRef<HTMLDivElement>(null);
  const teacherTableRef = useRef<HTMLTableElement>(null);
  const [tableGeometry, setTableGeometry] = useState({ viewportWidth: 0, contentWidth: 0, hasOverflow: false });
  const dragRef = useRef<{ pointerId: number; startX: number; startScrollLeft: number; moved: boolean } | null>(null);

  const onTopTableScroll = () => syncHorizontalScroll(topTableScrollRef.current, bodyTableScrollRef.current);
  const onBodyTableScroll = () => syncHorizontalScroll(bodyTableScrollRef.current, topTableScrollRef.current);

  const onTablePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // Native touch and pen scrolling remains untouched; header buttons stay clickable.
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    const viewport = bodyTableScrollRef.current;
    if (!viewport || viewport.scrollWidth <= viewport.clientWidth + 1) return;
    if (event.target instanceof Element && event.target.closest('thead,button,a,input,select,textarea,[role="button"],[data-no-table-drag]')) return;
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startScrollLeft: viewport.scrollLeft, moved: false };
    viewport.setPointerCapture(event.pointerId);
  };
  const onTablePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.moved && Math.abs(event.clientX - drag.startX) < 6) return; // preserve ordinary clicks
    drag.moved = true;
    const viewport = bodyTableScrollRef.current;
    if (!viewport) return;
    viewport.style.cursor = 'grabbing';
    viewport.style.userSelect = 'none';
    viewport.scrollLeft = getDraggedScrollLeft(drag.startScrollLeft, drag.startX, event.clientX);
    event.preventDefault();
  };
  const finishTableDrag = () => {
    dragRef.current = null;
    const viewport = bodyTableScrollRef.current;
    if (!viewport) return;
    viewport.style.removeProperty('cursor');
    viewport.style.removeProperty('user-select');
  };

  const chooseSort = (key: TeacherActivitySortKey) => {
    if (key === teacherSort) setSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc');
    else { setTeacherSort(key); setSortDirection(key === 'name' ? 'asc' : 'desc'); }
  };

  const applyPreset = (value: Exclude<Preset, "custom">) => {
    setPreset(value);
    if (value === "month") setStartDate(`${schoolToday.slice(0, 7)}-01`);
    if (value === "30d") setStartDate(subtractDays(schoolToday, 29));
    if (value === "90d") setStartDate(subtractDays(schoolToday, 89));
    setEndDate(schoolToday);
  };

  const load = async () => {
    if (!startDate || !endDate) return;
    if (endDate < startDate) {
      setError("Tanggal akhir tidak boleh lebih awal dari tanggal mulai.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const next = await new ManagementAnalyticsRepository().load(startDate, endDate);
      setData(next);
    } catch (err) {
      setData(null); // Never display stale/partial statistics after an RPC failure.
      setError(getErrorMessage(err, "Analytics gagal dimuat."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // Initial load only; custom dates are applied explicitly to avoid RPC spam while typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const teacherRows = useMemo(() => {
    if (!data) return [];
    const query = search.trim().toLocaleLowerCase("id-ID");
    const filtered = data.teachers.filter((row) => !query || row.teacherName.toLocaleLowerCase("id-ID").includes(query));
    return sortTeacherActivityRows(filtered, teacherSort, sortDirection);
  }, [data, search, teacherSort, sortDirection]);

  // Only geometry changes trigger a render. ResizeObserver also catches font/layout changes.
  // Hook runs again when the report first mounts after its asynchronous load.
  useLayoutEffect(() => {
    const viewport = bodyTableScrollRef.current;
    const table = teacherTableRef.current;
    if (!viewport || !table) return;
    const measure = () => {
      const next = getHorizontalScrollMetrics(viewport.clientWidth, viewport.scrollWidth);
      setTableGeometry((prev) => prev.viewportWidth === next.viewportWidth &&
        prev.contentWidth === next.contentWidth && prev.hasOverflow === next.hasOverflow ? prev : next);
      syncHorizontalScroll(viewport, topTableScrollRef.current);
    };
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(viewport);
    observer?.observe(table);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [data, teacherRows.length]);

  const sortableHeading = (label: string, field: TeacherActivitySortKey, title: string) => (
    <th scope="col" aria-sort={teacherSort === field ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
      className="min-w-[145px] px-3 py-3 text-center">
      <button type="button" title={title} onClick={() => chooseSort(field)}
        className="inline-flex items-center gap-1 rounded-md px-1 py-1 text-center hover:bg-indigo-50 hover:text-indigo-700 focus-visible:outline-2 focus-visible:outline-indigo-600">
        <span>{label}</span>
        {teacherSort !== field ? <ArrowUpDown className="h-3.5 w-3.5 shrink-0" />
          : sortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5 shrink-0" />
          : <ArrowDown className="h-3.5 w-3.5 shrink-0" />}
      </button>
    </th>
  );

  const maxDaily = useMemo(() => {
    if (!data?.daily.length) return 1;
    return Math.max(1, ...data.daily.flatMap((row) => [row.teachingAbsencePeriods, row.assignedCoveragePeriods]));
  }, [data]);

  const maxReason = useMemo(() => Math.max(1, ...(data?.reasons || []).map((row) => row.requestCount)), [data]);

  const exportCsv = () => {
    if (!data) return;
    const csv = `\uFEFF${buildTeacherAnalyticsCsv(teacherRows)}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `management-analytics_${data.dateStart}_${data.dateEnd}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  };

  const summary = data?.summary;
  const coverageHealth = getCoverageHealthLabel(summary?.coverageRatePct || 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <button
            onClick={onBack}
            className="mb-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 shadow-sm transition hover:border-blue-200 hover:text-blue-700"
          >
            <ArrowLeft className="h-4 w-4" /> <T>{"Kembali ke Dashboard"}</T>
          </button>
          <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight text-slate-900">
            <BarChart3 className="h-7 w-7 text-indigo-600" /> <T>{"Management Analytics"}</T>
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-500">
            Ringkasan manajemen untuk izin, JP kehadiran, badal, kesiapan tugas, dan beban operasional guru. Kelas gabung dihitung sebagai satu unit badal per guru/tanggal/JP.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button
            onClick={exportCsv}
            disabled={!data || loading}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-bold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> CSV Guru
          </button>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-black text-slate-800">
              <CalendarRange className="h-4 w-4 text-indigo-600" /> Rentang Analisis
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {([
                ["month", "Bulan Ini"],
                ["30d", "30 Hari"],
                ["90d", "90 Hari"],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => applyPreset(key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-black transition ${preset === key ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="text-xs font-bold text-slate-500">
              Dari
              <input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setPreset("custom"); }}
                className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"
              />
            </label>
            <label className="text-xs font-bold text-slate-500">
              Sampai
              <input
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setPreset("custom"); }}
                className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"
              />
            </label>
            <button
              onClick={() => void load()}
              disabled={loading}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-black text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Terapkan
            </button>
          </div>
        </div>
        {data && (
          <p className="mt-3 text-xs text-slate-400">
            Menampilkan {formatDate(data.dateStart)}–{formatDate(data.dateEnd)} • hanya izin APPROVED dihitung sebagai fakta kehadiran; data badal legacy tetap masuk beban badal historis.
          </p>
        )}
      </section>

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div><strong>Analytics gagal dimuat.</strong><div className="mt-1">{error}</div></div>
        </div>
      )}

      {loading && !data ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm font-bold text-slate-500">
          <RefreshCw className="mx-auto mb-3 h-6 w-6 animate-spin text-indigo-600" /> Memuat analytics dari Supabase…
        </div>
      ) : data && summary ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Permintaan Izin" value={summary.requestTotal} helper={`${summary.requestApproved} approved • ${summary.requestSubmitted} menunggu`} icon={ClipboardCheck} tone="blue" />
            <KpiCard label="JP Ketidakhadiran" value={summary.absencePeriodsTotal} helper={`${summary.teachingAbsencePeriods} mengajar • ${summary.freeAbsencePeriods} free`} icon={Users} tone="violet" />
            <KpiCard label="Coverage Badal" value={`${summary.coverageRatePct.toFixed(1)}%`} helper={`${summary.coverageAssignedPeriods}/${summary.coverageNeededPeriods} JP tertangani • ${coverageHealth}`} icon={ShieldCheck} tone={summary.coverageRatePct >= 95 ? "emerald" : summary.coverageRatePct >= 80 ? "amber" : "rose"} />
            <KpiCard label="Kesiapan Tugas" value={`${summary.taskReadinessPct.toFixed(1)}%`} helper={`${summary.taskReadyPeriods}/${summary.taskEligiblePeriods} JP punya tugas`} icon={FileCheck2} tone={summary.taskReadinessPct >= 95 ? "emerald" : summary.taskReadinessPct >= 80 ? "amber" : "rose"} />
            <KpiCard label="Hari Guru Tidak Hadir" value={summary.absentTeacherDays} helper={`${summary.uniqueAbsentTeachers} guru unik pada periode ini`} icon={GraduationCap} tone="slate" />
            <KpiCard label="Guru Menjadi Badal" value={summary.uniqueSubstituteTeachers} helper="Guru unik yang menerima assignment badal" icon={UserCheck} tone="emerald" />
            <KpiCard label="JP-0 Homeroom" value={summary.homeroomAbsencePeriods} helper="Ketidakhadiran wali/pendamping yang wajib coverage" icon={CheckCircle2} tone="violet" />
            <KpiCard label="Belum Tertangani" value={Math.max(summary.coverageNeededPeriods - summary.coverageAssignedPeriods, 0)} helper={`${summary.coverageWaitingPeriods} waiting • ${summary.coverageNoSubstitutePeriods} tanpa badal • ${summary.coverageExpiredPeriods} expired • ${summary.coverageMissingPeriods} tanpa row coverage`} icon={AlertCircle} tone="rose" />
          </div>

          <div className="grid gap-5 xl:grid-cols-3">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-black text-slate-900">Tren Operasional Harian</h2>
                  <p className="text-xs text-slate-500">JP izin mengajar dibanding JP yang sudah mendapatkan badal.</p>
                </div>
                <TrendingUp className="h-5 w-5 text-indigo-500" />
              </div>
              {data.daily.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-400">Belum ada aktivitas pada rentang ini.</div>
              ) : (
                <div className="space-y-3">
                  {data.daily.slice(-31).map((row) => (
                    <div key={row.date} className="grid grid-cols-[76px_1fr_46px] items-center gap-3">
                      <div className="text-xs font-bold text-slate-500">{formatDate(row.date).slice(0, 5)}</div>
                      <div className="space-y-1">
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-indigo-500" style={{ width: `${(row.teachingAbsencePeriods / maxDaily) * 100}%` }} />
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(row.assignedCoveragePeriods / maxDaily) * 100}%` }} />
                        </div>
                      </div>
                      <div className="text-right text-[11px] font-black text-slate-600">{row.assignedCoveragePeriods}/{row.teachingAbsencePeriods}</div>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-4 border-t border-slate-100 pt-3 text-[11px] font-bold text-slate-500">
                    <span><i className="mr-1 inline-block h-2 w-4 rounded bg-indigo-500" /> JP izin mengajar</span>
                    <span><i className="mr-1 inline-block h-2 w-4 rounded bg-emerald-500" /> JP sudah assigned</span>
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-black text-slate-900">Status Pengajuan</h2>
              <p className="mb-4 text-xs text-slate-500">Semua request yang overlap dengan rentang tanggal.</p>
              <div className="space-y-3">
                {data.requestStatuses.length === 0 ? <div className="py-8 text-center text-sm text-slate-400">Belum ada pengajuan.</div> : data.requestStatuses.map((row) => {
                  const total = Math.max(1, summary.requestTotal);
                  const label = ({ SUBMITTED: "Menunggu", APPROVED: "Disetujui", DECLINED: "Ditolak", CANCELLED: "Dibatalkan" } as Record<string, string>)[row.status] || row.status;
                  return (
                    <div key={row.status}>
                      <div className="mb-1 flex justify-between text-xs font-bold text-slate-600"><span>{label}</span><span>{row.count}</span></div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-700" style={{ width: `${(row.count / total) * 100}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          <div className="grid gap-5 xl:grid-cols-3">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-black text-slate-900">Beban Operasional Guru</h2>
                  <p className="text-xs text-slate-500">Akumulasi guru per rentang analisis. Klik judul kolom untuk mengurutkan (↑/↓).</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari guru…" className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm sm:w-48" />
                  </div>

                </div>
              </div>
              <div className="overflow-hidden rounded-xl border border-slate-200" data-testid="teacher-activity-table-frame">
                {/* RC2: native horizontal scrollbar above the frozen header. Width matches the
                    table viewport (minus its vertical scrollbar) so both ends align exactly. */}
                {tableGeometry.hasOverflow && (
                  <div className="border-b border-slate-200 bg-slate-50 pt-1">
                    <div className="mb-0.5 px-2 text-[10px] font-medium text-slate-500" aria-hidden="true">↔ Geser kolom dengan scrollbar ini atau drag isi tabel</div>
                    <div ref={topTableScrollRef} role="region" aria-label="Geser kolom tabel ke kanan atau kiri" tabIndex={0}
                      onScroll={onTopTableScroll} className="overflow-x-auto overflow-y-hidden"
                      style={{ width: tableGeometry.viewportWidth || '100%', maxWidth: '100%', height: 17 }}>
                      <div aria-hidden="true" style={{ width: tableGeometry.contentWidth, height: 1 }} />
                    </div>
                  </div>
                )}
                <div ref={bodyTableScrollRef} role="region" aria-label="Beban Operasional Guru — tabel dapat digulir" tabIndex={0}
                  className="relative max-h-[min(58vh,520px)] overflow-auto overscroll-contain"
                  onScroll={onBodyTableScroll} onPointerDown={onTablePointerDown} onPointerMove={onTablePointerMove}
                  onPointerUp={finishTableDrag} onPointerCancel={finishTableDrag} onLostPointerCapture={finishTableDrag}>
                <table ref={teacherTableRef} className="min-w-[1120px] w-full text-left text-xs">
                  <thead className="sticky top-0 z-30 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 shadow-sm">
                    <tr>
                      <th scope="col" aria-sort={teacherSort === 'name' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'} className="sticky left-0 z-40 min-w-[205px] bg-slate-50 px-3 py-3 text-left shadow-[3px_0_7px_-5px_rgba(15,23,42,0.35)]">
                        <button type="button" onClick={() => chooseSort('name')} className="inline-flex items-center gap-1 rounded px-1 py-1 hover:text-indigo-700">
                          Guru {teacherSort !== 'name' ? <ArrowUpDown className="h-3.5 w-3.5"/> : sortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5"/> : <ArrowDown className="h-3.5 w-3.5"/>}
                        </button>
                      </th>
                      {sortableHeading('Total JP Mengajar Efektif','effectiveTeachingJp','JP1–6 dari jadwal efektif, termasuk badal mengajar; satu guru/tanggal/JP dihitung sekali.')}
                      {sortableHeading('Total JP Izin','totalLeaveJp','JP1–6 izin mengajar APPROVED dan izin legacy; FREE, JP0, tugas resmi non-mengajar tidak dihitung.')}
                      {sortableHeading('Total Hari Mengajar Efektif','effectiveTeachingDays','Jumlah tanggal unik dengan minimal satu JP mengajar efektif.')}
                      {sortableHeading('Total Hari Izin','totalLeaveDays','Jumlah tanggal unik dengan izin tercatat, termasuk hari izin yang hanya memiliki JP FREE.')}
                      {sortableHeading('Persentase JP Mengajar','teachingSharePct','JP mengajar efektif ÷ (JP mengajar efektif + JP izin) × 100%.')}
                      {sortableHeading('Persentase JP Izin','leaveSharePct','JP izin ÷ (JP mengajar efektif + JP izin) × 100%.')}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {teacherRows.map((row: ManagementTeacherAnalyticsRow) => (
                      <tr key={row.teacherId} className="group hover:bg-slate-50/70">
                        <td className="sticky left-0 z-10 min-w-[205px] bg-white px-3 py-3 shadow-[3px_0_7px_-5px_rgba(15,23,42,0.35)] group-hover:bg-slate-50"><div className="font-black text-slate-800">{row.teacherName}</div></td>
                        <td className="px-3 py-3 text-center font-bold text-emerald-700">{row.effectiveTeachingJp ?? '—'}</td>
                        <td className="px-3 py-3 text-center font-bold text-rose-700">{row.totalLeaveJp ?? '—'}</td>
                        <td className="px-3 py-3 text-center font-medium">{row.effectiveTeachingDays ?? '—'}</td>
                        <td className="px-3 py-3 text-center font-medium">{row.totalLeaveDays ?? '—'}</td>
                        <td className="px-3 py-3 text-center font-black text-emerald-700">{row.teachingSharePct == null ? '—' : `${row.teachingSharePct.toFixed(1)}%`}</td>
                        <td className="px-3 py-3 text-center font-black text-rose-700">{row.leaveSharePct == null ? '—' : `${row.leaveSharePct.toFixed(1)}%`}</td>
                      </tr>
                    ))}
                    {teacherRows.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">Tidak ada guru yang cocok dengan pencarian.</td></tr>}
                  </tbody>
                </table>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-black text-slate-900">Alasan Izin Disetujui</h2>
              <p className="mb-4 text-xs text-slate-500">Diurutkan berdasarkan jumlah pengajuan approved.</p>
              <div className="space-y-3">
                {data.reasons.slice(0, 10).map((row) => (
                  <div key={row.reason}>
                    <div className="mb-1 flex items-start justify-between gap-2 text-xs"><span className="font-bold text-slate-600">{row.reason}</span><span className="shrink-0 font-black text-slate-800">{row.requestCount}</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-violet-500" style={{ width: `${(row.requestCount / maxReason) * 100}%` }} /></div>
                    <div className="mt-1 text-[10px] text-slate-400">{row.approvedPeriodCount} JP ketidakhadiran</div>
                  </div>
                ))}
                {data.reasons.length === 0 && <div className="py-8 text-center text-sm text-slate-400">Belum ada izin approved.</div>}
              </div>
            </section>
          </div>

          <section className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 text-xs leading-relaxed text-indigo-900">
            <strong>Definisi angka:</strong> Tabel Beban Operasional Guru menghitung JP1–6 dari jadwal efektif dan badal mengajar, lalu mengecualikan izin serta tugas non-mengajar yang tercatat. Kelas gabung dihitung satu JP per guru/tanggal/JP. JP izin hanya periode TEACHING APPROVED/legacy, sedangkan hari izin dapat mencakup FREE. Persentase = bagian dari (JP Mengajar Efektif + JP Izin), bukan persentase kehadiran absensi biometrik. Angka bergantung pada akurasi penugasan yang tercatat. Jika penyebut nol ditampilkan —. FREE tetap dihitung sebagai ketidakhadiran tetapi tidak masuk denominator coverage. JP-0 Homeroom masuk coverage namun tidak wajib tugas. Badal kelas gabung dideduplikasi per guru izin + tanggal + JP. Request yang ditolak/dibatalkan hanya muncul di status pengajuan dan tidak dihitung sebagai fakta ketidakhadiran.
          </section>
        </>
      ) : null}
    </div>
  );
};
