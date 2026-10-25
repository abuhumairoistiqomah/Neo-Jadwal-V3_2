import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowDownRight, ArrowUpRight, BarChart3, CalendarDays, Download,
  Info, RefreshCw, TrendingUp, Users } from 'lucide-react';
import { getSchoolTodayISO } from '../domain/date';
import { absenceCategoryLabel } from '../domain/leaveClassificationV320';
import { ManagementLeaveDaysRepository } from '../infrastructure/repositories/managementLeaveDaysRepository';
import { changeFromPrevious, defaultDayRange, leaveDayCsv, makeLeaveDayReport, previousWindow,
  validateLeaveDayRange, type LeaveDayEvent, type LeaveDayFilter, type LeaveDayMode } from '../domain/leaveDaysAnalyticsV320';
import { getErrorMessage } from '../domain/errorMessage';
import { teacherDayLeaveRate, type ExpectedTeacherDaysSummary } from '../domain/expectedTeacherDaysV320';

const MODE_OPTIONS: ReadonlyArray<{value:LeaveDayMode;label:string;unit:string}> = [
  {value:'weekly',label:'Mingguan',unit:'per hari'},
  {value:'monthly',label:'Bulanan',unit:'per bulan'},
  {value:'semester',label:'Semester',unit:'per semester akademik'},
  {value:'yearly',label:'Tahunan',unit:'per tahun'},
];
const FILTERS: ReadonlyArray<LeaveDayFilter> = ['ALL','PERSONAL','SCHOOL_DUTY','UNCLASSIFIED'];
const categoryName = (category:LeaveDayFilter) => category==='ALL'?'Semua Jenis':absenceCategoryLabel(category);
const countText = (value:number) => new Intl.NumberFormat('id-ID',{maximumFractionDigits:1}).format(value);

function StatCard({label,value,description,secondaryValue,tone='blue'}:{label:string;value:string;description:string;secondaryValue?:string;tone?:'blue'|'emerald'|'violet'|'rose'}) {
  const classes = {blue:'border-blue-100 bg-blue-50/70',emerald:'border-emerald-100 bg-emerald-50/70',
    violet:'border-violet-100 bg-violet-50/70',rose:'border-rose-100 bg-rose-50/70'};
  return <div className={`rounded-2xl border p-4 ${classes[tone]}`}>
    <p className="text-xs font-extrabold text-slate-600">{label}</p>
    <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <p className="text-3xl font-black tracking-tight text-slate-900">{value}</p>
      {secondaryValue&&<p className="text-lg font-black text-indigo-700">{secondaryValue}</p>}
    </div>
    <p className="mt-2 text-xs leading-relaxed text-slate-600">{description}</p>
  </div>;
}

/** Executive view: a teacher/date is one day, regardless of how many periods or classes were affected. */
export function ManagementLeaveDaysAnalytics() {
  const today = getSchoolTodayISO();
  const [mode,setMode] = useState<LeaveDayMode>('monthly');
  const initial = useMemo(()=>defaultDayRange('monthly',today),[today]);
  const [draftStart,setDraftStart] = useState(initial.start);
  const [draftEnd,setDraftEnd] = useState(initial.end);
  const [applied,setApplied] = useState({start:initial.start,end:initial.end});
  const [filter,setFilter] = useState<LeaveDayFilter>('ALL');
  const [events,setEvents] = useState<LeaveDayEvent[]|null>(null);
  const [previousEvents,setPreviousEvents] = useState<LeaveDayEvent[]|null>(null);
  const [expectedDays,setExpectedDays] = useState<ExpectedTeacherDaysSummary|null>(null);
  const [expectedError,setExpectedError] = useState('');
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const requestId = useRef(0);

  const loadRange = async (start:string,end:string,modeValue:LeaveDayMode) => {
    const request = ++requestId.current;
    const validation = validateLeaveDayRange(modeValue,start,end,today);
    if(validation) {setLoading(false);setError(validation);setEvents(null);setPreviousEvents(null);setExpectedDays(null);return;}
    setLoading(true);setError('');setEvents(null);setPreviousEvents(null);setExpectedDays(null);setExpectedError('');
    const previous = previousWindow(start,end);
    try {
      const repository = new ManagementLeaveDaysRepository();
      const [current,earlier,obligations] = await Promise.all([
        repository.load(start,end),repository.load(previous.start,previous.end),
        repository.loadExpectedDays(start,end).then(value=>({value,error:''}))
          .catch(cause=>({value:null,error:getErrorMessage(cause,'Kewajiban terjadwal belum tersedia.')})),
      ]);
      if(request!==requestId.current) return;
      setApplied({start,end});setEvents(current);setPreviousEvents(earlier);
      setExpectedDays(obligations.value);setExpectedError(obligations.error);
    } catch (cause) {
      if(request!==requestId.current) return;
      setError(getErrorMessage(cause,'Gagal mengambil statistik hari izin.'));
    } finally {
      if(request===requestId.current) setLoading(false);
    }
  };
  useEffect(()=>{void loadRange(initial.start,initial.end,'monthly');
    // Load once; date typing does not make network requests.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  const selectMode = (value:LeaveDayMode) => {
    const range = defaultDayRange(value,today);
    setMode(value);setDraftStart(range.start);setDraftEnd(range.end);
    void loadRange(range.start,range.end,value);
  };
  const report = useMemo(()=>events===null?null:makeLeaveDayReport(events,applied.start,applied.end,mode,filter),
    [events,applied,mode,filter]);
  const previousReport = useMemo(()=>{
    if(previousEvents===null)return null;
    const prev=previousWindow(applied.start,applied.end);
    return makeLeaveDayReport(previousEvents,prev.start,prev.end,mode,filter);
  },[previousEvents,applied,mode,filter]);
  const expectedRate = report?teacherDayLeaveRate(report.totalDays,expectedDays):null;
  const delta = report && previousReport?changeFromPrevious(report.totalDays,previousReport.totalDays):null;
  const maxBar = Math.max(1,...(report?.buckets.map(bucket=>bucket.teacherDays)||[]));
  const maxRank = Math.max(1,report?.teacherRanking[0]?.days||0);
  const filterChange=(next:LeaveDayFilter)=>setFilter(next);
  const exportCsv = () => {
    if(!report)return;
    const content=`\uFEFF${leaveDayCsv(report,applied.start,applied.end,mode,filter,expectedDays)}`;
    const blob=new Blob([content],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement('a');
    anchor.href=url;anchor.download=`statistik-hari-izin_${mode}_${filter}_${applied.start}_${applied.end}.csv`;
    document.body.appendChild(anchor);anchor.click();anchor.remove();URL.revokeObjectURL(url);
  };

  return <div className="space-y-5" data-testid="management-leave-days-tab">
    <div className="flex flex-col gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-black text-slate-900"><CalendarDays className="h-5 w-5 text-indigo-600"/> Statistik Hari Izin Guru</h2>
        <p className="mt-1 text-xs text-slate-600">Tren ketidaktersediaan guru berdasarkan tanggal, bukan JP. Satu guru pada satu tanggal = satu guru-hari.</p>
      </div>
      <div className="flex max-w-sm items-start gap-2 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-xs text-indigo-900">
        <Info className="h-4 w-4 shrink-0"/>
        <span>Lima guru tidak mengajar pada tanggal yang sama = <strong>5 guru-hari</strong>, bukan 1 hari kalender. Ini bukan absensi fisik.</span>
      </div>
    </div>

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1" role="group" aria-label="Granularitas statistik hari izin">
          {MODE_OPTIONS.map(option=><button key={option.value} type="button" onClick={()=>selectMode(option.value)}
            aria-pressed={mode===option.value}
            className={`rounded-lg px-3 py-2 text-xs font-black transition ${mode===option.value?'bg-indigo-600 text-white shadow-sm':'text-slate-600 hover:bg-slate-200'}`}>
            {option.label}
          </button>)}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block text-xs font-bold text-slate-500">Dari
            <input type="date" value={draftStart} max={today} onChange={event=>setDraftStart(event.target.value)}
              className="mt-1 block rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-800"/>
          </label>
          <label className="block text-xs font-bold text-slate-500">Sampai
            <input type="date" value={draftEnd} max={today} onChange={event=>setDraftEnd(event.target.value)}
              className="mt-1 block rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-800"/>
          </label>
          <button onClick={()=>void loadRange(draftStart,draftEnd,mode)} disabled={loading}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-extrabold text-white hover:bg-indigo-700 disabled:opacity-50">Terapkan</button>
        </div>
        <label className="text-xs font-bold text-slate-500">Jenis Izin
          <select value={filter} onChange={event=>filterChange(event.target.value as LeaveDayFilter)}
            className="mt-1 block min-w-[170px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
            {FILTERS.map(value=><option key={value} value={value}>{categoryName(value)}</option>)}
          </select>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span><strong>{MODE_OPTIONS.find(option=>option.value===mode)?.label}</strong>: bar {MODE_OPTIONS.find(option=>option.value===mode)?.unit} • Rentang diterapkan: {applied.start} s.d. {applied.end}</span>
        <div className="flex gap-2">
          <button type="button" onClick={()=>void loadRange(draftStart,draftEnd,mode)} disabled={loading}
            className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 font-bold hover:bg-slate-50 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${loading?'animate-spin':''}`}/> Refresh</button>
          <button type="button" onClick={exportCsv} disabled={!report||loading}
            className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 font-bold hover:bg-slate-50 disabled:opacity-50"><Download className="h-3.5 w-3.5"/> Ekspor CSV</button>
        </div>
      </div>
    </section>

    {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><AlertCircle className="h-5 w-5 shrink-0"/><div><strong>Statistik tidak dapat dimuat.</strong><p className="mt-1">{error}</p></div></div>}
    {loading ? <div className="rounded-2xl border bg-white p-10 text-center text-sm text-slate-500"><RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin text-indigo-600"/> Mengambil data hari izin dari Supabase...</div> : null}
    {!loading&&report&&previousReport&&<>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Guru-Hari Izin" value={countText(report.totalDays)}
          secondaryValue={expectedRate!==null?`(${countText(expectedRate)}%)`:'(—%)'} tone="blue"
          description={expectedRate!==null
            ? `${countText(expectedRate)}% dari ${countText(expectedDays!.expectedTeacherDays)} guru-hari kewajiban terjadwal (estimasi). Akumulasi tanggal unik per guru.`
            : `Persentase belum tersedia; ${expectedDays?`${countText(expectedDays.expectedTeacherDays)} guru-hari kewajiban terdata, tetapi kalender operasional belum lengkap.`:'data kewajiban belum dapat dimuat.'}`}/>
        <StatCard label="Guru Terdampak" value={countText(report.affectedTeachers)} tone="emerald" description="Jumlah guru unik yang memiliki minimal satu tanggal izin." />
        <StatCard label="Rata-rata per Guru" value={countText(report.averageDays)} tone="violet" description="Guru-hari izin ÷ jumlah guru terdampak (bukan seluruh pegawai)." />
        <StatCard label="Perubahan vs Rentang Sebelumnya" tone="rose"
          value={delta?`${delta.difference>0?'+':''}${countText(delta.difference)} hari`:'—'}
          description={delta?`${countText(previousReport.totalDays)} → ${countText(report.totalDays)} guru-hari • ${delta.percent===null?'Persentase tidak tersedia (baseline 0)':`${delta.percent>0?'+':''}${countText(delta.percent)}%`}`:'Data belum tersedia'} />
      </div>
      {(expectedError||expectedDays?.status==='PARTIAL'||expectedDays?.status==='UNAVAILABLE')&&
        <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
          <strong>Rasio Guru-Hari Izin belum dapat dihitung akurat.</strong>{' '}
          {expectedError|| (expectedDays?.status==='UNAVAILABLE'
            ? 'Belum ada rentang Kalender Operasional KBM aktif yang cocok.'
            : `${countText(expectedDays?.leaveDaysOutsideCalendar||0)} guru-hari izin berada di luar rentang kalender operasional.`)}
          {' '}Lengkapi kalender operasional sebelum menggunakan persentase untuk keputusan direktur.
        </div>}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,1fr)]">
        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div><h3 className="flex items-center gap-2 font-black text-slate-900"><BarChart3 className="h-5 w-5 text-indigo-600"/> Tren Hari Izin</h3>
              <p className="mt-1 text-xs text-slate-500">Bar {MODE_OPTIONS.find(option=>option.value===mode)?.unit} • {categoryName(filter)}</p></div>
            {delta&&<div className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold ${delta.difference>0?'bg-rose-50 text-rose-700':delta.difference<0?'bg-emerald-50 text-emerald-700':'bg-slate-100 text-slate-600'}`}>
              {delta.difference>0?<ArrowUpRight className="h-4 w-4"/>:delta.difference<0?<ArrowDownRight className="h-4 w-4"/>:<TrendingUp className="h-4 w-4"/>}
              {delta.difference>0?'Naik':delta.difference<0?'Turun':'Tetap'} {countText(Math.abs(delta.difference))} hari
            </div>}
          </div>
          <div className="overflow-x-auto pb-2" role="region" aria-label="Grafik tren jumlah guru-hari izin">
            <div className="flex h-64 min-w-full items-end gap-2 border-b border-slate-200 px-2 pt-3" style={{width:`max(100%,${report.buckets.length*73}px)`}}>
              {report.buckets.map(bucket=><div key={bucket.key} className="flex h-full min-w-[58px] flex-1 flex-col items-center justify-end gap-1" title={`${bucket.label}: ${bucket.teacherDays} guru-hari izin, ${bucket.affectedTeachers} guru`}>
                <span className="text-xs font-black text-indigo-900">{bucket.teacherDays}</span>
                <div className="flex h-[190px] w-full items-end justify-center rounded-t bg-slate-50/60 px-1">
                  <div className={`w-full max-w-[54px] rounded-t-md transition-all ${bucket.teacherDays?'bg-gradient-to-t from-indigo-600 to-blue-400':'bg-slate-200'}`}
                    style={{height:`${bucket.teacherDays ? Math.max(10,(bucket.teacherDays/maxBar)*100) : 2}%`}} />
                </div>
                <span className="min-h-8 text-center text-[10px] font-semibold leading-tight text-slate-600">{bucket.label}</span>
              </div>)}
            </div>
          </div>
          <p className="mt-3 text-[11px] text-slate-500">Bar menunjukkan total <strong>guru-hari</strong>. Pada pilihan Semua, guru yang tercatat dalam dua kategori pada hari sama hanya dihitung satu kali.</p>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-black text-slate-900">Guru dengan Hari Izin Terbanyak</h3>
          <p className="mt-1 text-xs text-slate-500">Peringkat berdasarkan tanggal unik per guru • {categoryName(filter)}</p>
          <div className="mt-5 space-y-4">
            {report.teacherRanking.slice(0,8).map((row,index)=><div key={row.teacherId}>
              <div className="mb-1 flex items-center gap-2 text-xs">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-50 font-black text-indigo-700">{index+1}</span>
                <span className="min-w-0 flex-1 break-words font-bold text-slate-800">{row.teacherName}</span>
                <span className="font-black tabular-nums text-slate-800">{row.days} hari</span>
              </div>
              <div className="ml-8 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-violet-500" style={{width:`${row.days/maxRank*100}%`}}/>
              </div>
            </div>)}
            {!report.teacherRanking.length&&<p className="py-8 text-center text-sm text-slate-500">Belum ada data izin pada periode ini.</p>}
          </div>
        </section>
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-black text-slate-900">Rincian Periode</h3>
        <p className="mt-1 text-xs text-slate-500">Rincian bar {MODE_OPTIONS.find(option=>option.value===mode)?.unit} • kategori dominan hanya ditampilkan jika tidak seri.</p>
        <div className="mt-4 max-h-[460px] overflow-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="sticky top-0 bg-slate-50 text-slate-500"><tr>
              <th className="px-3 py-3">Periode</th><th className="px-3 py-3">Tanggal</th>
              <th className="px-3 py-3 text-right">Guru-Hari Izin</th><th className="px-3 py-3 text-right">Guru Terdampak</th>
              <th className="px-3 py-3 text-right">Rata-rata / Guru</th><th className="px-3 py-3">Jenis Dominan</th>
              <th className="px-3 py-3 text-right">Porsi Total</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {report.buckets.map(bucket=><tr key={bucket.key} className="hover:bg-indigo-50/40">
                <td className="px-3 py-3 font-bold text-slate-800">{bucket.label}</td>
                <td className="px-3 py-3 text-slate-500">{bucket.firstDay} – {bucket.lastDay}</td>
                <td className="px-3 py-3 text-right font-black text-indigo-700">{bucket.teacherDays}</td>
                <td className="px-3 py-3 text-right">{bucket.affectedTeachers}</td>
                <td className="px-3 py-3 text-right">{countText(bucket.affectedTeachers?bucket.teacherDays/bucket.affectedTeachers:0)}</td>
                <td className="px-3 py-3">{bucket.dominantCategory?absenceCategoryLabel(bucket.dominantCategory):'—'}</td>
                <td className="px-3 py-3 text-right font-semibold">{report.totalDays?countText(bucket.teacherDays/report.totalDays*100):'0'}%</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </section>
      <section className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-xs leading-relaxed text-indigo-900">
        <strong>Definisi & sumber:</strong> satu guru/tanggal dihitung satu hari walaupun memiliki banyak kelas, JP, atau kategori.
        Data berasal dari izin APPROVED, tugas sekolah resmi yang masih aktif, dan histori impor/manual yang belum dibatalkan.
        Identitas duplikat dihindari menggunakan ID guru atau nama unik yang tervalidasi. Guru dummy dikecualikan.
        Grafik bukan pengukuran absensi fisik. Semester = Juli–Desember dan Januari–Juni. Perbandingan memakai rentang kalender sebelumnya dengan jumlah hari yang sama.
        Angka kategori dapat beririsan pada tanggal yang sama sehingga tidak selalu dapat dijumlah langsung.
        Rasio (%) memakai penyebut <strong>guru-hari kewajiban terjadwal (estimasi)</strong>, bukan total hari kalender atau absensi fisik.
        Penyebut mempertimbangkan jadwal master pada kalender operasional aktif, override guru, penugasan resmi, serta izin tercatat;
        karena tidak ada histori kontrak kerja/perubahan jadwal per tanggal, angka ini bukan total kehadiran wajib yang definitif.
        <strong> Perhatikan:</strong> bulan, semester, atau tahun yang masih berjalan hanya memuat data sampai tanggal akhir pilihan, sehingga bar periode parsial tidak boleh langsung dibandingkan dengan periode penuh.
      </section>
    </>}
  </div>;
}
