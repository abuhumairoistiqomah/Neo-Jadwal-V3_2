import React, { useState, useMemo } from "react";
import { 
  Teacher, ScheduleItem, LogIzinItem, JadwalInsidentalItem, MasterRuanganItem, KalenderAkademikItem,
  checkIsITBA, checkIsNative, isSameDay, isITBACoreSubject, isAlQuranOrTahsin, 
  getRoomDisplayName, resolveRoomInfo, matchRoomId,
  getSchoolWeekDateStrings, getAcademicCalendarEvent 
} from "../types";
import { 
  ArrowLeft, Calendar, UserCheck, HelpCircle, Save, 
  Trash2, Plus, Sparkles, CheckSquare, AlertTriangle, AlertCircle,
  Search, Eye, CheckCircle, Clock, User, X, MapPin, BookOpen, ExternalLink, Building2, TrendingUp, Info,
  ChevronDown, ChevronUp, Lock, Upload, Paperclip, Link2
} from "lucide-react";
import { JAM_TIME_MAP, RECOMMENDED_WEEKLY_JP_LIMIT } from "../constants/schedule";
import { loadApprovedLeavePeriodsForDate } from "../infrastructure/repositories/approvedLeaveAvailabilityRepository";
import type { ApprovedLeavePeriodAvailability } from "../domain/inval/recommendationPerformance";
import { buildEffectiveScheduleForDate } from "../domain/schedule/effectiveSchedule";
import { genderPreferenceRank, type GenderPreference } from "../domain/classGender";
import { resolveNormalTeachingBlock, type SubstituteAvailabilityStatus, type SubstituteConstraint } from "../domain/substituteAvailability";
import { evaluateSubstituteCandidatePolicy } from "../domain/inval/candidatePolicy";
import type { InvalTaskResourceInput, InvalWriteMetadata } from "../domain/inval/invalWrite";
import { normalizeTaskUrl, removeTaskUrlFromText, syncTaskResourcesWithText } from "../domain/taskResources";
import {
  buildFormAssignmentsByTeacher,
  buildInvalRecommendationDayIndex,
  buildRecommendationDependencyKey,
  normalizeTeacherKey,
} from "../domain/inval/recommendationPerformance";
import { expandInvalSessionRowsForPersistence, groupInvalScheduleItems } from "../domain/inval/sessionGrouping";
import { scopeInvalRowsToOfficialDuty, coversExactlyOfficialDutySlots } from "../domain/inval/officialDutySelection";
import { TEAM_TEACHING_NO_BADAL } from "../domain/officialDutyBadal";
import { buildApprovedLeaveOperatorRows } from "../domain/inval/approvedLeaveSelection";
import type { WaitingBadalSession } from "../domain/leaveApproval";

import { T } from '../i18n/LanguageProvider';
import { TeacherDutyV319Repository } from '../infrastructure/repositories/teacherDutyV319Repository';
import { resolveTeacherDutyBlock, type TeacherDutySnapshot } from '../domain/dutyResolutionV319';


interface InputGuruPenggantiProps {
  teachers: Teacher[];
  schedules: ScheduleItem[];
  logs: LogIzinItem[];
  jadwalInsidental?: JadwalInsidentalItem[];
  masterRuangan?: MasterRuanganItem[];
  kalenderAkademik?: KalenderAkademikItem[];
  substituteConstraints?: SubstituteConstraint[];
  readOnlyPreview?: boolean;
  initialDate?: string;
  initialTeacherName?: string;
  initialPeriods?: number[];
  initialReason?: string;
  /** Locks this existing smart recommender to uncovered official-duty coverage slots. */
  officialDutySlots?: ReadonlyArray<{ period: number; className: string }>;
  /** Locks the smart picker to already-approved LEAVE_WORKFLOW WAITING rows. */
  approvedWaitingSession?: WaitingBadalSession;
  taskOwnership?: "OPERATOR" | "LEAVE_TEACHER";
  onUploadTaskFile?: (file: File, context: { scheduleDate: string; period: number; classLabel: string; subject: string }) => Promise<InvalTaskResourceInput>;
  onAddLogs: (
    newLogs: Omit<LogIzinItem, "id">[],
    roomIncidental?: {
      tanggal: string;
      kelas: string;
      jam_ke: number;
      mapel: string;
      ruangan: string;
      alasan: string;
      tipe_insidental: string;
    },
    metadata?: InvalWriteMetadata,
  ) => void | Promise<void>;
  onBack: () => void;
}

const HARI_MAP_INDO: Record<number, "Senin" | "Selasa" | "Rabu" | "Kamis" | "Jumat"> = {
  1: "Senin",
  2: "Selasa",
  3: "Rabu",
  4: "Kamis",
  5: "Jumat"
};

interface CandidateRecommendation {
  teacher: Teacher;
  eligible: boolean;
  isAbsentAtPeriod: boolean;
  isPendamping: boolean;
  isPendampingOnDay: boolean;
  jpCount: number;
  mengajarJp: number;
  pendampingJp: number;
  dailyLoad: { jpAsli: number; jpKalender: number; jpIzin: number; jpBadal: number; jpEfektif: number; projectedJP: number };
  weeklyLoad: { jpAsli: number; jpKalender: number; jpIzin: number; jpBadal: number; jpEfektif: number; projectedJP: number };
  score: number;
  reasons: string[];
  genderPreference: GenderPreference;
  constraintStatus: SubstituteAvailabilityStatus;
  constraintReasons: string[];
  constraintIds: string[];
  requiresConstraintOverride: boolean;
}

interface CandidateSelectDropdownProps {
  allowTeamTeachingNoBadal?: boolean;
  id: string;
  rowIndex: number;
  value: string;
  onChange: (rowIndex: number, value: string, overrideConstraintIds?: string[]) => void;
  recommendations: CandidateRecommendation[];
}

const CandidateSelectDropdown: React.FC<CandidateSelectDropdownProps> = React.memo(({
  allowTeamTeachingNoBadal = false,
  id,
  rowIndex,
  value,
  onChange,
  recommendations
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedCandidate = recommendations.find(c => c.teacher.nama === value);

  const filterCandidate = (c: (typeof recommendations)[0]) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.teacher.nama.toLowerCase().includes(q) ||
      (c.teacher.mapel_utama || "").toLowerCase().includes(q) ||
      c.reasons.some(r => r.toLowerCase().includes(q)) ||
      c.constraintReasons.some(r => r.toLowerCase().includes(q))
    );
  };

  const bestList = recommendations
    .filter(c => c.constraintStatus === "AVAILABLE" && c.eligible && !c.isAbsentAtPeriod && c.jpCount <= 5 && !(checkIsITBA(c.teacher) && !c.isPendampingOnDay))
    .filter(filterCandidate);

  const itbaList = recommendations
    .filter(c => c.constraintStatus === "AVAILABLE" && c.eligible && !c.isAbsentAtPeriod && c.jpCount <= 5 && (checkIsITBA(c.teacher) && !c.isPendampingOnDay))
    .filter(filterCandidate);

  const highLoadList = recommendations
    .filter(c => c.constraintStatus === "AVAILABLE" && c.eligible && !c.isAbsentAtPeriod && c.jpCount > 5)
    .filter(filterCandidate);

  const constrainedList = recommendations
    .filter(c => c.constraintStatus === "SOFT_BLOCKED" && c.eligible && !c.isAbsentAtPeriod)
    .filter(filterCandidate);

  const busyList = recommendations
    .filter(c => (!c.eligible || c.constraintStatus === "HARD_BLOCKED") && !c.isAbsentAtPeriod)
    .filter(filterCandidate);

  const absentList = recommendations
    .filter(c => c.isAbsentAtPeriod)
    .filter(filterCandidate);

  const renderCandidateRow = (c: (typeof recommendations)[0], isAbsent = false) => {
    const isSelected = value === c.teacher.nama;
    const score = c.score;
    const badge = score >= 100 ? "★ Semapel" : score >= 50 ? "✦ Serumpun" : "Sejenjang";
    const badgeStyle = score >= 100
      ? "bg-emerald-100 text-emerald-800 border-emerald-300"
      : score >= 50
        ? "bg-sky-100 text-sky-800 border-sky-300"
        : "bg-slate-100 text-slate-700 border-slate-300";

    const dl = c.dailyLoad;
    const wl = c.weeklyLoad;
    const isOverload = wl.projectedJP > RECOMMENDED_WEEKLY_JP_LIMIT;

    return (
      <button
        key={c.teacher.nama}
        type="button"
        disabled={isAbsent || c.constraintStatus === "HARD_BLOCKED"}
        onClick={() => {
          if (isAbsent || c.constraintStatus === "HARD_BLOCKED") return;
          if (c.requiresConstraintOverride) {
            const detail = c.constraintReasons.join("; ") || "Pembatasan badal aktif";
            const confirmed = window.confirm(`Guru ini memiliki pembatasan badal: ${detail}. Tetap pilih guru ini?`);
            if (!confirmed) return;
          }
          onChange(
            rowIndex,
            c.teacher.nama,
            c.requiresConstraintOverride ? c.constraintIds : [],
          );
          setIsOpen(false);
          setSearchQuery("");
        }}
        className={`w-full text-left p-2.5 border-b border-gray-100 transition-colors flex flex-col gap-1.5 ${
          isSelected
            ? "bg-indigo-50/90 border-indigo-200"
            : isAbsent || c.constraintStatus === "HARD_BLOCKED"
              ? "bg-gray-100/60 text-gray-400 cursor-not-allowed opacity-75"
              : c.constraintStatus === "SOFT_BLOCKED"
                ? "bg-amber-50/70 hover:bg-amber-100/70 text-amber-950"
                : "hover:bg-indigo-50/50 text-gray-800"
        }`}
      >
        {/* Baris 1: Informasi Utama Teacher */}
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 w-full">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`font-bold text-xs ${isAbsent ? "text-gray-500 line-through" : "text-gray-900"}`}>
              {c.teacher.nama}
            </span>
            {c.isPendamping && (
              <span className="text-[10px] bg-purple-100 text-purple-800 font-extrabold px-1.5 py-0.5 rounded border border-purple-200 shrink-0">
                PENDAMPING
              </span>
            )}
            {c.genderPreference === "MATCH" && (
              <span className="text-[10px] bg-fuchsia-50 text-fuchsia-800 font-extrabold px-1.5 py-0.5 rounded border border-fuchsia-200 shrink-0">
                GENDER SESUAI
              </span>
            )}
            {c.genderPreference === "MISMATCH" && (
              <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-1.5 py-0.5 rounded border border-slate-200 shrink-0">
                GENDER BERBEDA
              </span>
            )}
            {c.constraintStatus === "SOFT_BLOCKED" && (
              <span className="text-[10px] bg-amber-100 text-amber-900 font-extrabold px-1.5 py-0.5 rounded border border-amber-300 shrink-0">
                ⚠ PEMBATASAN BADAL
              </span>
            )}
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${badgeStyle}`}>
              {badge}
            </span>
            <span className="text-[11px] text-gray-500 font-medium">
              [Mapel: {c.teacher.mapel_utama || "-"}]
            </span>
            {!c.eligible && c.reasons.length > 0 && (
              <span className="text-[10px] bg-red-100 text-red-800 font-bold px-1.5 py-0.5 rounded border border-red-200">
                {c.reasons.join(", ")}
              </span>
            )}
            {c.constraintReasons.length > 0 && (
              <span className="text-[10px] bg-amber-100 text-amber-900 font-bold px-1.5 py-0.5 rounded border border-amber-300">
                {c.constraintReasons.join(", ")}
              </span>
            )}
          </div>

          {isOverload && !isAbsent && (
            <span className="text-[10px] bg-amber-100 text-amber-900 font-extrabold px-1.5 py-0.5 rounded border border-amber-300 shrink-0">
              ⚠️ Overload &gt;24 JP
            </span>
          )}
        </div>

        {/* Baris 2: Rincian Beban Harian & Mingguan */}
        <div className="text-[11px] text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-1 bg-slate-50 p-1.5 rounded-md border border-slate-200/80 w-full">
          <div className="shrink-0">
            <span className="text-slate-500 font-medium">Beban Hari Ini:</span>{" "}
            <strong className="text-slate-900 font-bold">{dl.jpEfektif} <T>{"JP"}</T></strong>
          </div>
          <div className="text-slate-300 shrink-0">|</div>
          <div className="shrink-0">
            <span className="text-slate-500 font-medium"><T>{"Beban Minggu Ini:"}</T></span>{" "}
            <strong className="text-slate-900 font-bold">{wl.jpAsli} <T>{"JP"}</T></strong>
            <span className="text-slate-500 text-[10px] ml-1">
              ({wl.jpKalender > 0 ? `-${wl.jpKalender} kal, ` : ""}-{wl.jpIzin} izn, +{wl.jpBadal} bdl = <strong className="text-slate-800 font-bold">{wl.jpEfektif} <T>{"JP"}</T></strong>)
            </span>
          </div>
          <div className="text-slate-300 shrink-0">|</div>
          <div className="shrink-0">
            <span className="text-indigo-700 font-bold">Proyeksi:</span>{" "}
            <strong className={isOverload ? "text-amber-800 font-extrabold" : "text-emerald-700 font-extrabold"}>
              Hari {dl.projectedJP} JP • Mggu {wl.projectedJP} <T>{"JP"}</T>
            </strong>
          </div>
        </div>
      </button>
    );
  };

  return (
    <div ref={dropdownRef} className="relative w-full">
      {/* Hidden Native Select for Accessibility / Select Queries */}
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(rowIndex, e.target.value, [])}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      >
        <option value="">-- Pilih Guru Pengganti --</option>
        {allowTeamTeachingNoBadal && <option value={TEAM_TEACHING_NO_BADAL}>Tidak perlu ada badal — ditangani team teaching</option>}
        {recommendations.map(c => (
          <option key={c.teacher.nama} value={c.teacher.nama}>
            {c.teacher.nama}
          </option>
        ))}
      </select>

      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full bg-white border text-left p-3 rounded-xl focus:outline-none shadow-2xs transition-all flex items-center justify-between gap-2 ${
          isOpen ? "border-indigo-500 ring-2 ring-indigo-100" : "border-gray-200 hover:border-indigo-300"
        }`}
      >
        {allowTeamTeachingNoBadal && value === TEAM_TEACHING_NO_BADAL ? (
          <div className="flex-1 min-w-0 space-y-1">
            <span className="font-bold text-emerald-800 text-sm">Tidak perlu ada badal</span>
            <p className="text-xs text-emerald-700">Ditangani team teaching yang tersedia • bukan guru badal tambahan</p>
          </div>
        ) : selectedCandidate ? (
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-gray-900 text-sm">
                {selectedCandidate.teacher.nama}
              </span>
              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-extrabold px-2 py-0.5 rounded-full border border-emerald-200 shrink-0">
                <T>{"Terpilih"}</T>
              </span>
              <span className="text-xs text-gray-500 font-medium">
                [Mapel: {selectedCandidate.teacher.mapel_utama}]
              </span>
            </div>
            <div className="text-[11px] font-semibold text-slate-600 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>Beban Hari Ini: <strong className="text-slate-900">{selectedCandidate.dailyLoad.jpEfektif} <T>{"JP"}</T></strong></span>
              <span className="text-slate-300">•</span>
              <span><T>{"Beban Minggu Ini:"}</T> <strong className="text-slate-900">{selectedCandidate.weeklyLoad.jpEfektif} <T>{"JP"}</T></strong></span>
              <span className="text-slate-300">•</span>
              <span className="text-indigo-700 font-bold">
                Proyeksi: Hari {selectedCandidate.dailyLoad.projectedJP} JP • Mggu {selectedCandidate.weeklyLoad.projectedJP} <T>{"JP"}</T>
              </span>
            </div>
          </div>
        ) : (
          <span className="text-gray-500 font-medium text-sm">
            -- Pilih Guru Pengganti (Klik untuk daftar 2 baris) --
          </span>
        )}

        <div className="flex items-center gap-1 shrink-0 text-gray-400">
          {(selectedCandidate || (allowTeamTeachingNoBadal && value === TEAM_TEACHING_NO_BADAL)) && (
            <span
              role="button"
              tabIndex={0}
              title="Reset Pilihan"
              onClick={(e) => {
                e.stopPropagation();
                onChange(rowIndex, "", []);
              }}
              className="p-1 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </span>
          )}
          {isOpen ? <ChevronUp className="w-5 h-5 text-indigo-600" /> : <ChevronDown className="w-5 h-5" />}
        </div>
      </button>

      {/* Popover Dropdown Panel */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-gray-200 rounded-xl shadow-xl z-50 max-h-96 overflow-hidden flex flex-col transition-all">
          {/* Search Bar */}
          <div className="p-2 border-b border-gray-100 bg-gray-50/80 sticky top-0 z-10">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Cari nama guru / mata pelajaran..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-indigo-500 font-medium"
                autoFocus
              />
            </div>
          </div>

          {/* List Options */}
          <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
            {allowTeamTeachingNoBadal && (
              <button type="button" className="w-full text-left px-3 py-3 border-b-2 border-emerald-200 bg-emerald-50 hover:bg-emerald-100"
                onClick={() => {
                  if (!window.confirm("Tidak perlu badal tambahan untuk slot ini? Pastikan guru team teaching yang tersisa benar-benar dapat menangani kelas. Sistem akan memverifikasinya sebelum menyimpan.")) return;
                  onChange(rowIndex, TEAM_TEACHING_NO_BADAL, []);
                  setIsOpen(false);
                  setSearchQuery("");
                }}>
                <span className="text-sm font-black text-emerald-900">✓ Tidak perlu ada badal</span>
                <span className="block text-xs text-emerald-800 mt-1">Ditangani team teaching yang tersedia (bukan nama guru pengganti)</span>
              </button>
            )}
            {/* 1. Best Recommendations */}
            {bestList.length > 0 && (
              <div>
                <div className="px-3 py-1.5 bg-emerald-50 text-emerald-900 text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1 sticky top-0">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  <span>✨ Rekomendasi Terbaik (Jam Kosong)</span>
                </div>
                {bestList.map(c => renderCandidateRow(c))}
              </div>
            )}

            {/* 2. ITBA Non-companion Today */}
            {itbaList.length > 0 && (
              <div>
                <div className="px-3 py-1.5 bg-amber-50 text-amber-900 text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1 sticky top-0">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  <span>⚠️ Tidak Diprioritaskan (Mahasiswa ITBA Bukan Pendamping)</span>
                </div>
                {itbaList.map(c => renderCandidateRow(c))}
              </div>
            )}

            {/* 3. Teaching workload > 5 JP Today */}
            {highLoadList.length > 0 && (
              <div>
                <div className="px-3 py-1.5 bg-orange-50 text-orange-900 text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1 sticky top-0">
                  <AlertCircle className="w-3.5 h-3.5 text-orange-600" />
                  <span>🚫 Beban Tinggi Hari Ini (&gt;5 JP)</span>
                </div>
                {highLoadList.map(c => renderCandidateRow(c))}
              </div>
            )}

            {/* 4. Soft substitute constraints — selectable only with explicit override */}
            {constrainedList.length > 0 && (
              <div>
                <div className="px-3 py-1.5 bg-amber-100 text-amber-950 text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1 sticky top-0">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                  <span>⚠️ Pembatasan Badal (Boleh Override)</span>
                </div>
                {constrainedList.map(c => renderCandidateRow(c))}
              </div>
            )}

            {/* 5. Ineligible / Busy Teachers (Override) */}
            {busyList.length > 0 && (
              <div>
                <div className="px-3 py-1.5 bg-slate-100 text-slate-800 text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1 sticky top-0">
                  <Lock className="w-3.5 h-3.5 text-slate-600" />
                  <span>🔒 Guru Sedang Mengajar / Bertugas Lain (Override)</span>
                </div>
                {busyList.map(c => renderCandidateRow(c))}
              </div>
            )}

            {/* 6. Teachers Currently On Leave (Bottom Priority) */}
            {absentList.length > 0 && (
              <div>
                <div className="px-3 py-1.5 bg-red-50 text-red-900 text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1 sticky top-0">
                  <X className="w-3.5 h-3.5 text-red-600" />
                  <span>🛑 Guru Izin pada JP Ini (Tidak Dapat Dipilih)</span>
                </div>
                {absentList.map(c => renderCandidateRow(c, true))}
              </div>
            )}

            {bestList.length === 0 && itbaList.length === 0 && highLoadList.length === 0 && constrainedList.length === 0 && busyList.length === 0 && absentList.length === 0 && (
              <div className="p-4 text-center text-xs text-gray-500 italic">
                Tidak ada guru yang cocok dengan pencarian "{searchQuery}"
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

export const InputGuruPengganti: React.FC<InputGuruPenggantiProps> = ({
  teachers,
  schedules,
  logs,
  jadwalInsidental = [],
  masterRuangan = [],
  kalenderAkademik = [],
  substituteConstraints = [],
  readOnlyPreview = false,
  initialDate,
  initialTeacherName,
  initialPeriods = [],
  initialReason,
  officialDutySlots,
  approvedWaitingSession,
  taskOwnership = "OPERATOR",
  onUploadTaskFile,
  onAddLogs,
  onBack,
}) => {
  const [tanggal, setTanggal] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });
  // RC3: date-keyed authoritative RC2 duty read. Fail closed while loading or on read errors.
  const dutyRepository = useMemo(() => new TeacherDutyV319Repository(), []);
  const [dutyState, setDutyState] = useState<{
    date:string;snapshot:TeacherDutySnapshot|null;error:string;
  }>({date:'',snapshot:null,error:''});
  React.useEffect(() => {
    if(readOnlyPreview) return;
    let cancelled=false;
    dutyRepository.listForDate(tanggal).then(snapshot=>{
      if(!cancelled)setDutyState({date:tanggal,snapshot,error:''});
    }).catch((error:unknown)=>{
      if(!cancelled)setDutyState({date:tanggal,snapshot:null,error:error instanceof Error?error.message:'Gagal membaca penugasan kegiatan.'});
    });
    return ()=>{cancelled=true;};
  },[tanggal,dutyRepository,readOnlyPreview]);
  const dutyReady = readOnlyPreview || (dutyState.date===tanggal && dutyState.snapshot!==null);
  const [guruIzin, setGuruIzin] = useState<string>("");
  const [searchTeacherQuery, setSearchTeacherQuery] = useState<string>("");
  const [showTeacherSuggestions, setShowTeacherSuggestions] = useState<boolean>(false);

  // Room relocation state
  const [enableRoomRelocation, setEnableRoomRelocation] = useState<boolean>(false);
  const [relocationRowIndex, setRelocationRowIndex] = useState<number>(0);
  const [relocationTargetRoom, setRelocationTargetRoom] = useState<string>("");
  const [relocationReason, setRelocationReason] = useState<string>("");
  
  // Filtered teachers for search-as-you-type suggestions
  const filteredTeacherSuggestions = useMemo(() => {
    const query = searchTeacherQuery.trim().toLowerCase();
    if (!query) {
      return teachers;
    }
    return teachers.filter(t => {
      const nama = (t.nama || "").toLowerCase();
      const mapel = (t.mapel_utama || "").toLowerCase();
      const tugas = (t.tugas_tambahan || "").toLowerCase();
      const ket = (t.keterangan || "").toLowerCase();
      return nama.includes(query) || mapel.includes(query) || tugas.includes(query) || ket.includes(query);
    });
  }, [teachers, searchTeacherQuery]);

  const [alasan, setAlasan] = useState<string>("");
  const [selectedHours, setSelectedHours] = useState<number[]>([]);
  const [generatedRows, setGeneratedRows] = useState<Array<{
    jam_ke: number;
    kelas: string;
    mapel: string;
    /** Only the subject for the selected date/classes/JP, never the master. */
    subjectOverride?: string;
    selectedPengganti: string;
    tugas?: string;
    taskResources: InvalTaskResourceInput[];
    constraintOverrideIds: string[];
    recommendationClassLabel?: string;
    targetSlots: Array<{ kelas: string; mapel: string }>;
    isCombinedGroup?: boolean;
  }>>([]);
  const [editingSubjectRows, setEditingSubjectRows] = useState<number[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // V3.12.2 Waiting List hand-off. The approval screen opens the canonical
  // Supabase Inval writer with date/teacher/JP already selected, but the Wakasek
  // still explicitly reviews recommendations and presses Save.
  React.useEffect(() => {
    if (initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate)) setTanggal(initialDate);
    if (initialTeacherName) {
      setGuruIzin(initialTeacherName);
      setSearchTeacherQuery(initialTeacherName);
    }
    if (initialPeriods.length > 0) {
      setSelectedHours([...new Set(initialPeriods.map(Number).filter((value) => Number.isInteger(value) && value >= 0 && value <= 6))].sort((a, b) => a - b));
    }
    if (initialReason) setAlasan(initialReason);
    setGeneratedRows([]);
  }, [initialDate, initialTeacherName, initialReason, JSON.stringify(initialPeriods)]);

  // Modal state for Verifikasi Jadwal Guru
  const [verificationModalData, setVerificationModalData] = useState<{
    isOpen: boolean;
    teacherName: string;
    targetJamKe: number;
    targetKelas: string;
    targetMapel: string;
    rowIndex?: number;
  } | null>(null);

  // Determine Day name of selected date
  const selectedDayName = useMemo(() => {
    if (!tanggal) return "Senin";
    const date = new Date(tanggal);
    const dayIndex = date.getDay(); // 0 = Sun, 1 = Mon, ..., 5 = Fri, 6 = Sat
    if (dayIndex === 0 || dayIndex === 6) {
      return "Senin"; // Fallback to Monday for weekends in mock database
    }
    return HARI_MAP_INDO[dayIndex] || "Senin";
  }, [tanggal]);

  // Canonical date schedule: Master -> Insidental -> Izin/Badal -> Kalender Akademik.
  // This replaces the former Input-Inval-specific merge so blank incidental teacher
  // fields inherit consistently with Dashboard/Jadwal Ruangan and the shared engine.
  const effectiveSchedulesForDate = useMemo(() => {
    return buildEffectiveScheduleForDate({
      date: tanggal,
      schedules,
      jadwalInsidental,
      logs,
      kalenderAkademik,
    });
  }, [tanggal, schedules, jadwalInsidental, logs, kalenderAkademik]);

  // Dates (Monday-Friday) for the selected week
  const schoolWeek = useMemo(() => {
    return getSchoolWeekDateStrings(tanggal);
  }, [tanggal]);

  // Calculate effective weekly and daily teaching workloads for all teachers
  const { teacherWeeklyLoads, teacherDailyLoads } = useMemo(() => {
    const weeklyMap = new Map<string, { jpAsli: number; jpKalender: number; jpIzin: number; jpBadal: number; jpEfektif: number }>();
    const dailyMap = new Map<string, { jpAsli: number; jpKalender: number; jpIzin: number; jpBadal: number; jpEfektif: number }>();

    if (schoolWeek.length === 0) {
      return { teacherWeeklyLoads: weeklyMap, teacherDailyLoads: dailyMap };
    }

    const baseSlotsMap = new Map<string, Map<string, { dateStr: string; jamKe: number; classes: string[] }>>();

    schoolWeek.forEach(({ dateStr }) => {
      const effectiveForDate = buildEffectiveScheduleForDate({
        date: dateStr,
        schedules,
        jadwalInsidental,
        logs,
        kalenderAkademik,
      });

      // scheduledTeachers intentionally reflects the assignment after incidental
      // inheritance but before izin/badal, exactly what jpAsli needs. One teacher
      // can count at most once per date+JP even in team teaching / combined rows.
      effectiveForDate.forEach((slot) => {
        if (Number(slot.jam_ke) === 0) return;
        slot.scheduledTeachers.forEach((teacherName) => {
          const norm = teacherName.trim().toLowerCase();
          if (!norm) return;
          if (!baseSlotsMap.has(norm)) {
            baseSlotsMap.set(norm, new Map<string, { dateStr: string; jamKe: number; classes: string[] }>());
          }
          const slotKey = `${dateStr}|${slot.jam_ke}`;
          const existing = baseSlotsMap.get(norm)!.get(slotKey);
          const className = slot.kelas || "";
          if (existing) {
            if (className && !existing.classes.some((item) => item.trim().toLowerCase() === className.trim().toLowerCase())) {
              existing.classes.push(className);
            }
          } else {
            baseSlotsMap.get(norm)!.set(slotKey, {
              dateStr,
              jamKe: Number(slot.jam_ke),
              classes: className ? [className] : [],
            });
          }
        });
      });
    });

    const weekDateSet = new Set(schoolWeek.map(w => w.dateStr));

    const izinSlotsMap = new Map<string, Set<string>>();
    const badalSlotsMap = new Map<string, Set<string>>();

    logs.forEach(log => {
      if (!log.tanggal || !weekDateSet.has(log.tanggal)) return;
      if (Number(log.jam_ke) === 0) return; // Skip JP-0

      if (log.guru_izin) {
        const normIzin = log.guru_izin.trim().toLowerCase();
        if (normIzin) {
          if (!izinSlotsMap.has(normIzin)) izinSlotsMap.set(normIzin, new Set<string>());
          izinSlotsMap.get(normIzin)!.add(`${log.tanggal}|${log.jam_ke}`);
        }
      }

      if (log.guru_pengganti) {
        const normPengganti = log.guru_pengganti.trim().toLowerCase();
        if (normPengganti) {
          if (!badalSlotsMap.has(normPengganti)) badalSlotsMap.set(normPengganti, new Set<string>());
          badalSlotsMap.get(normPengganti)!.add(`${log.tanggal}|${log.jam_ke}`);
        }
      }
    });

    teachers.forEach(t => {
      const norm = t.nama.trim().toLowerCase();
      
      const teacherBaseMap = baseSlotsMap.get(norm) || new Map<string, { dateStr: string; jamKe: number; classes: string[] }>();
      const teacherIzinSet = izinSlotsMap.get(norm) || new Set<string>();
      const teacherBadalSet = badalSlotsMap.get(norm) || new Set<string>();

      // Weekly loads
      const weeklyJpAsli = teacherBaseMap.size;
      let weeklyJpKalender = 0;
      const calendarSlotKeys = new Set<string>();

      teacherBaseMap.forEach(slot => {
        const slotKey = `${slot.dateStr}|${slot.jamKe}`;
        const isSuppressed = slot.classes.length > 0 && slot.classes.every((className) =>
          Boolean(getAcademicCalendarEvent(slot.dateStr, className, slot.jamKe, kalenderAkademik)),
        );
        if (isSuppressed) {
          weeklyJpKalender++;
          calendarSlotKeys.add(slotKey);
        }
      });

      // Avoid double subtracting: only count Izin if slot was NOT already cancelled by Kalender Akademik
      let weeklyJpIzin = 0;
      teacherIzinSet.forEach(slotKey => {
        if (!calendarSlotKeys.has(slotKey)) {
          weeklyJpIzin++;
        }
      });
      const weeklyJpBadal = teacherBadalSet.size;
      const weeklyJpEfektif = weeklyJpAsli - weeklyJpKalender - weeklyJpIzin + weeklyJpBadal;

      weeklyMap.set(norm, {
        jpAsli: weeklyJpAsli,
        jpKalender: weeklyJpKalender,
        jpIzin: weeklyJpIzin,
        jpBadal: weeklyJpBadal,
        jpEfektif: weeklyJpEfektif
      });

      // Daily loads for selected date (tanggal)
      let dailyJpAsli = 0;
      let dailyJpKalender = 0;
      const dailyCalendarSlotKeys = new Set<string>();

      teacherBaseMap.forEach(slot => {
        if (slot.dateStr === tanggal) {
          dailyJpAsli++;
          const slotKey = `${slot.dateStr}|${slot.jamKe}`;
          const isSuppressed = slot.classes.length > 0 && slot.classes.every((className) =>
            Boolean(getAcademicCalendarEvent(slot.dateStr, className, slot.jamKe, kalenderAkademik)),
          );
          if (isSuppressed) {
            dailyJpKalender++;
            dailyCalendarSlotKeys.add(slotKey);
          }
        }
      });

      let dailyJpIzin = 0;
      teacherIzinSet.forEach(slotKey => {
        if (slotKey.startsWith(`${tanggal}|`) && !dailyCalendarSlotKeys.has(slotKey)) {
          dailyJpIzin++;
        }
      });
      let dailyJpBadal = 0;
      teacherBadalSet.forEach(slotKey => {
        if (slotKey.startsWith(`${tanggal}|`)) dailyJpBadal++;
      });

      const dailyJpEfektif = dailyJpAsli - dailyJpKalender - dailyJpIzin + dailyJpBadal;

      dailyMap.set(norm, {
        jpAsli: dailyJpAsli,
        jpKalender: dailyJpKalender,
        jpIzin: dailyJpIzin,
        jpBadal: dailyJpBadal,
        jpEfektif: dailyJpEfektif
      });
    });

    return { teacherWeeklyLoads: weeklyMap, teacherDailyLoads: dailyMap };
  }, [schoolWeek, schedules, jadwalInsidental, logs, teachers, tanggal, kalenderAkademik]);

  // V3.11.1 performance indexes. These are rebuilt only when schedule/log inputs change,
  // never when the user types into the per-JP task textarea.
  const [approvedPeriodQuery, setApprovedPeriodQuery] = React.useState<{
    date: string; periods: ApprovedLeavePeriodAvailability[]; error: string | null;
  } | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    setApprovedPeriodQuery(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return;
    loadApprovedLeavePeriodsForDate(tanggal).then(periods => {
      if (!cancelled) setApprovedPeriodQuery({date:tanggal, periods, error:null});
    }).catch(err => {
      if (!cancelled) setApprovedPeriodQuery({date:tanggal, periods:[], error:err instanceof Error ? err.message : String(err)});
    });
    return () => { cancelled = true; };
  }, [tanggal]);
  const approvedPeriodsReady = approvedPeriodQuery?.date === tanggal && !approvedPeriodQuery.error;

  const recommendationDayIndex = useMemo(() => buildInvalRecommendationDayIndex({
    teachers,
    effectiveSchedulesForDate,
    logs,
    date: tanggal,
    approvedLeavePeriods: approvedPeriodQuery?.date === tanggal ? approvedPeriodQuery.periods : [],
  }), [teachers, effectiveSchedulesForDate, logs, tanggal, approvedPeriodQuery]);

  // Recommendation invalidation intentionally excludes `tugas`. This is the key
  // optimization that keeps free-text typing from re-running the 99-teacher ranker.
  const recommendationDependencyKey = useMemo(
    () => buildRecommendationDependencyKey(generatedRows),
    [generatedRows],
  );

  const formAssignmentsByTeacher = useMemo(
    () => buildFormAssignmentsByTeacher(generatedRows),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recommendationDependencyKey],
  );

  // Master Ruangan sorted priority
  const sortedMasterRuangan = useMemo(() => {
    if (!masterRuangan || masterRuangan.length === 0) return [];
    const activeRooms = masterRuangan.filter(r => {
      const status = (r.status || "Aktif").trim().toLowerCase();
      return status === "" || status === "aktif";
    });

    const priorityList = [
      "RSG", "LABKOM", "MQSMPSMAAKH", "MQSMPSMAIKH", "PERPUS", "MUSHALASD", "MUSHALLA4", "MUSHALLA2", "MQSDRENDAHIKH"
    ];

    return [...activeRooms].sort((a, b) => {
      const idA = (a.id_ruangan || "").trim().toUpperCase();
      const idB = (b.id_ruangan || "").trim().toUpperCase();
      const indexA = priorityList.indexOf(idA);
      const indexB = priorityList.indexOf(idB);
      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      return (a.nama_ruangan || "").localeCompare(b.nama_ruangan || "", undefined, { numeric: true, sensitivity: "base" });
    });
  }, [masterRuangan]);

  // Target row selected for relocation
  const targetRowForRelocation = useMemo(() => {
    if (generatedRows.length === 0) return null;
    const safeIdx = Math.min(Math.max(0, relocationRowIndex), generatedRows.length - 1);
    return generatedRows[safeIdx];
  }, [generatedRows, relocationRowIndex]);

  // Current room calculation for targetRowForRelocation
  const currentRoomInfo = useMemo(() => {
    if (!targetRowForRelocation) return { rawRoom: "-", displayName: "-", roomId: null };
    
    // Find master schedule item or incidental override
    const sched = effectiveSchedulesForDate.find(
      s => Number(s.jam_ke) === Number(targetRowForRelocation.jam_ke) &&
           s.kelas.trim().toLowerCase() === targetRowForRelocation.kelas.trim().toLowerCase()
    );

    const raw = sched ? (sched.ruangan || "").trim() : "";
    let roomId = raw ? matchRoomId(raw, masterRuangan || []) : null;
    
    if (roomId) {
      const roomObj = (masterRuangan || []).find(r => r.id_ruangan === roomId);
      const displayName = roomObj ? roomObj.nama_ruangan : getRoomDisplayName(raw, masterRuangan);
      return { rawRoom: raw, displayName, roomId };
    }

    return { rawRoom: raw || "-", displayName: raw || "Belum Ditentukan / Regular Class", roomId: null };
  }, [targetRowForRelocation, effectiveSchedulesForDate, masterRuangan]);

  // Check target room conflict status for relocation
  const relocationConflictCheck = useMemo(() => {
    if (!enableRoomRelocation || !targetRowForRelocation || !relocationTargetRoom) {
      return null;
    }

    if (currentRoomInfo.roomId && currentRoomInfo.roomId === relocationTargetRoom) {
      return { isConflict: false, isSameRoom: true, message: "Ruangan tujuan sama dengan ruangan saat ini." };
    }

    const daySchedules = schedules.filter(s => isSameDay(s.hari, selectedDayName));
    const todaysInc = (jadwalInsidental || []).filter(inc => inc.tanggal === tanggal);

    const otherUsages: Array<{ kelas: string; mapel: string }> = [];

    todaysInc.forEach(inc => {
      if (Number(inc.jam_ke) === Number(targetRowForRelocation.jam_ke) && inc.ruangan) {
        const incRoomId = matchRoomId(inc.ruangan, masterRuangan || []);
        if (incRoomId === relocationTargetRoom && inc.kelas?.trim().toLowerCase() !== targetRowForRelocation.kelas.trim().toLowerCase()) {
          otherUsages.push({ kelas: inc.kelas, mapel: inc.mapel || "Mata Pelajaran" });
        }
      }
    });

    if (otherUsages.length === 0) {
      daySchedules.forEach(s => {
        if (Number(s.jam_ke) === Number(targetRowForRelocation.jam_ke) && s.ruangan) {
          const sRoomId = matchRoomId(s.ruangan, masterRuangan || []);
          if (sRoomId === relocationTargetRoom && s.kelas?.trim().toLowerCase() !== targetRowForRelocation.kelas.trim().toLowerCase()) {
            const hasInc = todaysInc.some(inc => inc.kelas?.trim().toLowerCase() === s.kelas.trim().toLowerCase() && Number(inc.jam_ke) === Number(s.jam_ke));
            if (!hasInc) {
              otherUsages.push({ kelas: s.kelas, mapel: s.mapel });
            }
          }
        }
      });
    }

    const targetRoomObj = (masterRuangan || []).find(r => r.id_ruangan === relocationTargetRoom);
    const roomName = targetRoomObj ? targetRoomObj.nama_ruangan : relocationTargetRoom;

    if (otherUsages.length > 0) {
      const occText = otherUsages.map(u => `${u.kelas} (${u.mapel})`).join(", ");
      return {
        isConflict: true,
        isSameRoom: false,
        message: `⚠️ Ruangan ${roomName} sedang digunakan oleh ${occText} pada JP ${targetRowForRelocation.jam_ke}.`
      };
    }

    return {
      isConflict: false,
      isSameRoom: false,
      message: `✅ Ruangan ${roomName} TERSEDIA pada JP ${targetRowForRelocation.jam_ke}.`
    };
  }, [enableRoomRelocation, targetRowForRelocation, relocationTargetRoom, currentRoomInfo, schedules, jadwalInsidental, selectedDayName, tanggal, masterRuangan]);

  // Handle Hour checkbox change
  const handleHourToggle = (hour: number) => {
    setSelectedHours(prev => 
      prev.includes(hour) ? prev.filter(h => h !== hour) : [...prev, hour].sort((a, b) => a - b)
    );
  };

  // Handle Select All Hours
  const handleSelectAllHours = () => {
    if (selectedHours.length === 7) {
      setSelectedHours([]);
    } else {
      setSelectedHours([0, 1, 2, 3, 4, 5, 6]);
    }
  };

  // Generate operator-facing sessions for chosen hours. Explicit COMBINED
  // schedule rows are merged into one line, while persistence still expands
  // back to one coverage row per underlying class.
  const handleGenerate = () => {
    setEditingSubjectRows([]);
    if (!guruIzin) {
      setErrorMessage("Silakan pilih Guru yang Izin terlebih dahulu.");
      return;
    }
    const hours = approvedWaitingSession ? [approvedWaitingSession.period] : officialDutySlots
      ? [...new Set<number>(officialDutySlots.map((slot) => Number(slot.period)))].sort((a: number, b: number) => a - b)
      : selectedHours;
    if (hours.length === 0) {
      setErrorMessage("Tidak ada slot yang belum mendapatkan badal.");
      return;
    }

    setErrorMessage("");

    if (approvedWaitingSession) {
      if (tanggal !== approvedWaitingSession.scheduleDate ||
          guruIzin.trim().toLocaleLowerCase("id-ID") !== approvedWaitingSession.absentTeacherName.trim().toLocaleLowerCase("id-ID")) {
        setErrorMessage("Guru atau tanggal tidak sesuai dengan Waiting List Badal.");
        return;
      }
      try {
        setGeneratedRows(buildApprovedLeaveOperatorRows(approvedWaitingSession));
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : String(error));
        setGeneratedRows([]);
      }
      return;
    }

    const teacherSchedules = effectiveSchedulesForDate.filter(
      s => [s.guru1, s.guru2, s.guru3, s.guru4, s.guru5, s.guru6].some(
        g => g && g.trim().toLowerCase() === guruIzin.trim().toLowerCase()
      )
    );

    const existingTeacherTask = (hour: number, targetSlots: Array<{ kelas: string; mapel: string }>) => {
      if (taskOwnership !== "LEAVE_TEACHER") return "";
      const targetClasses = new Set(targetSlots.map((slot) => String(slot.kelas || "").trim().toLowerCase()).filter(Boolean));
      const parts: string[] = [];
      logs.forEach((log) => {
        if (String(log.tanggal || "") !== tanggal) return;
        if (Number(log.jam_ke) !== Number(hour)) return;
        if (String(log.guru_izin || "").trim().toLowerCase() !== guruIzin.trim().toLowerCase()) return;
        const logClass = String(log.kelas || "").trim().toLowerCase();
        if (targetClasses.size > 0 && logClass && !targetClasses.has(logClass)) return;
        const task = String(log.tugas || "").trim();
        if (task && !parts.includes(task)) parts.push(task);
      });
      return parts.join("\n").trim();
    };

    const rows = hours.flatMap(hour => {
      const matchingScheds = teacherSchedules.filter(s => Number(s.jam_ke) === Number(hour));
      const grouped = groupInvalScheduleItems(matchingScheds);

      if (grouped.length > 0) {
        return grouped.map(group => ({
          jam_ke: hour,
          kelas: group.kelas,
          mapel: group.mapel || "Mata Pelajaran",
          recommendationClassLabel: group.recommendationClassLabel,
          targetSlots: group.targetSlots,
          isCombinedGroup: group.isCombinedGroup,
          selectedPengganti: "",
          tugas: existingTeacherTask(hour, group.targetSlots),
          taskResources: [],
          constraintOverrideIds: [],
        }));
      }

      // JP free is an attendance/statistics concern, not a coverage need. Never
      // manufacture a fake badal row for JP1-6 when the absent teacher has no
      // active lesson. JP-0 keeps its legacy homeroom behavior.
      if (hour !== 0) return [];

      const targetTeacherObj = teachers.find(t => t.nama === guruIzin);
      const displayKelas = targetTeacherObj?.wali_kelas || targetTeacherObj?.pendamping_kelas || "Semua Kelas";
      const displayMapel = "JP-0 (Homeroom)";
      return [{
        jam_ke: hour,
        kelas: displayKelas,
        mapel: displayMapel,
        recommendationClassLabel: displayKelas,
        targetSlots: [{ kelas: displayKelas, mapel: displayMapel }],
        isCombinedGroup: false,
        selectedPengganti: "",
        tugas: "",
        taskResources: [],
        constraintOverrideIds: [],
      }];
    });

    // Reuse the same recommendation engine, but constrain its generated rows
    // to the specifically uncovered class/JP slots of this restriction.
    const scopedRows = officialDutySlots ? scopeInvalRowsToOfficialDuty(rows, officialDutySlots) : rows;
    // JP0 might not exist as a master row. Generate only the specifically
    // requested homeroom classes, not one synthetic combined class label.
    if (officialDutySlots?.some((slot) => slot.period === 0)) {
      const present = new Set(scopedRows.flatMap((row) => row.targetSlots.map((slot) =>
        `${row.jam_ke}|${slot.kelas.trim().toLocaleLowerCase("id-ID")}`)));
      for (const slot of officialDutySlots.filter((entry) => entry.period === 0)) {
        if (present.has(`0|${slot.className.trim().toLocaleLowerCase("id-ID")}`)) continue;
        scopedRows.push({
          jam_ke: 0, kelas: slot.className, mapel: "JP-0 (Homeroom)",
          recommendationClassLabel: slot.className,
          targetSlots: [{ kelas: slot.className, mapel: "JP-0 (Homeroom)" }],
          isCombinedGroup: false, selectedPengganti: "", tugas: "", taskResources: [], constraintOverrideIds: [],
        });
      }
    }
    if (scopedRows.length === 0 || (officialDutySlots && !coversExactlyOfficialDutySlots(scopedRows, officialDutySlots))) {
      setErrorMessage(officialDutySlots
        ? "Sebagian kelas/JP tugas resmi tidak cocok dengan jadwal efektif. Periksa tanggal dan restriksi sebelum menyimpan."
        : "JP yang dipilih adalah jam free/tidak memiliki kelas aktif. JP free dicatat melalui Form Izin untuk statistik dan tidak membutuhkan badal.");
      setGeneratedRows([]);
      return;
    }

    setGeneratedRows(scopedRows);
  };

  // ALGORITMA REKOMENDASI PENGGANTI (Sangat Penting)
  // V3.11.1 keeps the scoring rules intact, but reads from precomputed day indexes
  // instead of repeatedly scanning schedules/logs for every candidate on every render.
  const getRecommendedTeachers = (jam_ke: number, classLabel: string, subjectLabel: string, currentRowIndex?: number): CandidateRecommendation[] => {
    if (!guruIzin) return [];

    const targetTeacher = teachers.find(t => t.nama === guruIzin);
    if (!targetTeacher) return [];

    const absentJamKeByTeacher = recommendationDayIndex.absentJamKeByTeacher;
    const isJp0Slot = jam_ke === 0 || subjectLabel.toLowerCase().includes("jp-0") || subjectLabel.toLowerCase().includes("homeroom");

    const nativeTeachersToExclude = [
      "Syaikh Ali Ali Sinan",
      "Syeikhoh Muthmainnah",
      "Syaikh Abdul Manshur"
    ].map(name => name.trim().toLowerCase());

    const candidates = teachers.filter(t => {
      const isAbsent = t.nama === guruIzin;
      if (isJp0Slot) return !isAbsent;
      const normalized = normalizeTeacherKey(t.nama);
      const isNative = nativeTeachersToExclude.some(nativeName => normalized.includes(nativeName));
      return !isAbsent && !isNative;
    });

    const scoredCandidates = candidates.map(candidate => {
      let score = 0;
      const reasons: string[] = [];

      const isITBA = checkIsITBA(candidate);
      const normCandName = normalizeTeacherKey(candidate.nama);
      const dayStats = recommendationDayIndex.teacherStatsByName.get(normCandName);
      const regularTeachingJamKe = dayStats?.regularTeachingJamKe || new Set<number>();
      const savedSubstituteJamKe = recommendationDayIndex.savedSubstituteJamKeByTeacher.get(normCandName) || new Set<number>();
      const formAssignments = formAssignmentsByTeacher.get(normCandName) || [];
      const currentFormSubstituteJamKe = formAssignments
        .filter(ref => currentRowIndex !== undefined ? ref.rowIndex !== currentRowIndex : ref.jamKe !== jam_ke)
        .map(ref => ref.jamKe);
      const isAlreadySelectedInFormAtPeriod = formAssignments.some(
        ref => ref.jamKe === Number(jam_ke) && (currentRowIndex === undefined || ref.rowIndex !== currentRowIndex),
      );

      const allOccupiedJamKe = new Set<number>([
        ...regularTeachingJamKe,
        ...savedSubstituteJamKe,
        ...currentFormSubstituteJamKe,
      ]);
      const totalJpCount = Array.from(allOccupiedJamKe).filter(jk => jk !== 0).length;

      let mengajarJp = 0;
      let pendampingJp = 0;
      const currentFormPeriodSet = new Set(currentFormSubstituteJamKe);

      allOccupiedJamKe.forEach(jk => {
        if (jk === 0) return;
        const inSavedLogs = savedSubstituteJamKe.has(jk);
        const inCurrentForm = currentFormPeriodSet.has(jk);

        if (inSavedLogs || inCurrentForm) {
          mengajarJp++;
          return;
        }

        const dutyKind = dayStats?.periodDutyKind.get(jk);
        if (dutyKind === "PENDAMPING") pendampingJp++;
        if (dutyKind === "MENGAJAR") mengajarJp++;
      });

      const isPendampingOnDay = dayStats?.isPendampingOnDay || false;
      const isBusy = dayStats?.busyPeriods.has(Number(jam_ke)) || false;
      // Fail closed until the authoritative approved-period read succeeds.
      const isAbsentAtPeriod = !approvedPeriodsReady || (absentJamKeByTeacher.get(normCandName)?.has(Number(jam_ke)) || false);

      const daily = teacherDailyLoads.get(normCandName) || { jpAsli: 0, jpKalender: 0, jpIzin: 0, jpBadal: 0, jpEfektif: 0 };
      const weekly = teacherWeeklyLoads.get(normCandName) || { jpAsli: 0, jpKalender: 0, jpIzin: 0, jpBadal: 0, jpEfektif: 0 };

      const projectedFormPeriods = new Set<number>();
      generatedRows.forEach((r, rIdx) => {
        const isCurrentEvaluatedRow = currentRowIndex !== undefined ? rIdx === currentRowIndex : r.jam_ke === jam_ke;
        const isSelectedInRow = normalizeTeacherKey(r.selectedPengganti) === normCandName;
        if (!isCurrentEvaluatedRow && !isSelectedInRow) return;

        const period = Number(r.jam_ke);
        if (!savedSubstituteJamKe.has(period)) projectedFormPeriods.add(period);
      });
      const formAddedSlotsCount = projectedFormPeriods.size;

      const projectedDailyJP = daily.jpEfektif + formAddedSlotsCount;
      const projectedWeeklyJP = weekly.jpEfektif + formAddedSlotsCount;
      const dailyLoadObj = { ...daily, projectedJP: projectedDailyJP };
      const weeklyLoadObj = { ...weekly, projectedJP: projectedWeeklyJP };

      const policy = evaluateSubstituteCandidatePolicy({
        teacher: candidate,
        className: classLabel,
        date: tanggal,
        period: Number(jam_ke),
        constraints: substituteConstraints,
      });
      const genderPreference = policy.genderPreference;
      const constraintAvailability = {
        status: policy.constraintStatus,
        requiresOverride: policy.requiresConstraintOverride,
      };
      const constraintReasons = policy.constraintReasons;
      const constraintIds = policy.constraintIds;

      const dutyBlock = candidate.id && dutyState.date===tanggal && dutyState.snapshot
        ? resolveTeacherDutyBlock(dutyState.snapshot,candidate.id,tanggal) : null;
      if (!dutyReady || dutyBlock) {
        const dutyReason=dutyBlock?.reason || (dutyState.error || 'Memuat penugasan kegiatan RC3. Tunggu verifikasi.');
        return {
          teacher:candidate,eligible:false,isAbsentAtPeriod,isPendamping:false,isPendampingOnDay,
          jpCount:totalJpCount,mengajarJp,pendampingJp,dailyLoad:dailyLoadObj,weeklyLoad:weeklyLoadObj,
          score:-9999,reasons:[dutyReason],genderPreference,
          constraintStatus:'HARD_BLOCKED' as const,constraintReasons:[dutyReason],constraintIds:[],requiresConstraintOverride:false,
        };
      }

      if (constraintAvailability.status === "HARD_BLOCKED") {
        return {
          teacher: candidate, eligible: false, isAbsentAtPeriod, isPendamping: false, isPendampingOnDay,
          jpCount: totalJpCount, mengajarJp, pendampingJp, dailyLoad: dailyLoadObj, weeklyLoad: weeklyLoadObj,
          score: -9999, reasons: ["Pembatasan badal wajib — tidak dapat dioverride"], genderPreference,
          constraintStatus: constraintAvailability.status, constraintReasons, constraintIds, requiresConstraintOverride: true,
        };
      }

      if (isAlreadySelectedInFormAtPeriod) {
        return {
          teacher: candidate, eligible: false, isAbsentAtPeriod, isPendamping: false, isPendampingOnDay,
          jpCount: totalJpCount, mengajarJp, pendampingJp, dailyLoad: dailyLoadObj, weeklyLoad: weeklyLoadObj,
          score: -999, reasons: ["Sudah dipilih sebagai inval di sesi lain pada JP ini"], genderPreference,
          constraintStatus: constraintAvailability.status, constraintReasons, constraintIds,
          requiresConstraintOverride: constraintAvailability.requiresOverride,
        };
      }

      if (isBusy) {
        return {
          teacher: candidate, eligible: false, isAbsentAtPeriod, isPendamping: false, isPendampingOnDay,
          jpCount: totalJpCount, mengajarJp, pendampingJp, dailyLoad: dailyLoadObj, weeklyLoad: weeklyLoadObj,
          score: -999, reasons: ["Sedang mengajar kelas reguler"], genderPreference,
          constraintStatus: constraintAvailability.status, constraintReasons, constraintIds,
          requiresConstraintOverride: constraintAvailability.requiresOverride,
        };
      }

      const isAlreadySubbing = recommendationDayIndex.savedSubstituteTeachersByPeriod
        .get(Number(jam_ke))?.has(normCandName) || false;
      if (isAlreadySubbing) {
        return {
          teacher: candidate, eligible: false, isAbsentAtPeriod, isPendamping: false, isPendampingOnDay,
          jpCount: totalJpCount, mengajarJp, pendampingJp, dailyLoad: dailyLoadObj, weeklyLoad: weeklyLoadObj,
          score: -999, reasons: ["Sudah ditunjuk sebagai inval di kelas lain"], genderPreference,
          constraintStatus: constraintAvailability.status, constraintReasons, constraintIds,
          requiresConstraintOverride: constraintAvailability.requiresOverride,
        };
      }

      const isNative = checkIsNative(candidate) || nativeTeachersToExclude.some(
        nativeName => normCandName.includes(nativeName)
      );
      const isManajemen = Boolean(candidate.is_manajemen) || (candidate.tugas_tambahan || "").toLowerCase().includes("manajemen") || (candidate.keterangan || "").toLowerCase().includes("manajemen");
      const isWaliKelas = Boolean(candidate.wali_kelas) || (candidate.tugas_tambahan || "").toLowerCase().includes("wali kelas");
      const isPendampingKelas = Boolean(candidate.pendamping_kelas) || (candidate.tugas_tambahan || "").toLowerCase().includes("pendamping") || (candidate.keterangan || "").toLowerCase().includes("pendamping");

      if (isJp0Slot) {
        if (!isManajemen && !isWaliKelas && !isPendampingKelas && !isNative) {
          score += 300; reasons.push("Ranking 1 JP-0: Non-Manajemen, Bukan Wali Kelas, Bukan Pendamping (+300)");
        } else if (isPendampingKelas || isPendampingOnDay) {
          score += 200; reasons.push("Ranking 2 JP-0: Guru Pendamping Kelas (+200)");
        } else if (isManajemen) {
          score += 100; reasons.push("Ranking 3 JP-0: Tim Manajemen (+100)");
        } else if (isNative) {
          score += 50; reasons.push("Ranking 4 JP-0: Guru Native (+50)");
        } else {
          score += 120; reasons.push("Wali Kelas (+120)");
        }
      } else {
        const candidateMapel = (candidate.mapel_utama || "").toLowerCase();
        const subjectLower = subjectLabel.toLowerCase();
        const isSameMapel = candidateMapel === subjectLower || candidateMapel.includes(subjectLower) || subjectLower.includes(candidateMapel);
        if (isSameMapel) { score += 100; reasons.push("Mata Pelajaran Sama (+100)"); }

        const targetRumpunList = (targetTeacher.rumpun || "").split(",").map(r => r.trim().toLowerCase());
        const candidateRumpunList = (candidate.rumpun || "").split(",").map(r => r.trim().toLowerCase());
        const hasSharedRumpun = candidateRumpunList.some(r => targetRumpunList.includes(r));
        if (hasSharedRumpun) { score += 50; reasons.push("Rumpun Bidang Sama (+50)"); }

        if (candidate.jenjang === targetTeacher.jenjang) { score += 20; reasons.push("Jenjang Sama (+20)"); }
        if (candidate.wali_kelas) { score -= 15; reasons.push("Wali Kelas (-15)"); }
        if (candidate.is_manajemen) { score -= 100; reasons.push("Tim Manajemen (-100)"); }
      }

      if (isITBA) {
        const isAssistingNonCore = dayStats?.assistingNonCorePeriods.has(Number(jam_ke)) || false;
        if (isAssistingNonCore) { score += 15; reasons.push("Mahasiswa ITBA (Mendampingi Kelas Non-Wajib) (+15)"); }
        else { score += 5; reasons.push("Mahasiswa ITBA (Jam Kosong Murni) (+5)"); }
      }

      if (totalJpCount > 5) { score -= 150; reasons.push(`Beban mengajar tinggi: ${totalJpCount} JP hari ini (-150)`); }
      if (isITBA && !isPendampingOnDay) { score -= 50; reasons.push("Mahasiswa ITBA bukan pendamping hari ini (-50)"); }
      if (projectedWeeklyJP > RECOMMENDED_WEEKLY_JP_LIMIT) {
        score -= 250;
        reasons.push(`Melebihi batas disarankan ${RECOMMENDED_WEEKLY_JP_LIMIT} JP (Proyeksi: ${projectedWeeklyJP} JP) (-250)`);
      }

      if (isAbsentAtPeriod) {
        score = -9999;
        reasons.length = 0;
        reasons.push("Izin pada JP Ini (-9999)");
      }

      const isPendamping = dayStats?.pendampingPeriods.has(Number(jam_ke)) || false;

      return {
        teacher: candidate, eligible: true, isAbsentAtPeriod, isPendamping, isPendampingOnDay,
        jpCount: totalJpCount, mengajarJp, pendampingJp, dailyLoad: dailyLoadObj, weeklyLoad: weeklyLoadObj,
        score, reasons, genderPreference, constraintStatus: constraintAvailability.status, constraintReasons, constraintIds,
        requiresConstraintOverride: constraintAvailability.requiresOverride,
      };
    });

    const compareCandidates = (a: CandidateRecommendation, b: CandidateRecommendation) => {
      const genderDiff = genderPreferenceRank(b.genderPreference) - genderPreferenceRank(a.genderPreference);
      if (genderDiff !== 0) return genderDiff;
      if (b.score !== a.score) return b.score - a.score;
      if (a.dailyLoad.projectedJP !== b.dailyLoad.projectedJP) return a.dailyLoad.projectedJP - b.dailyLoad.projectedJP;
      if (a.weeklyLoad.projectedJP !== b.weeklyLoad.projectedJP) return a.weeklyLoad.projectedJP - b.weeklyLoad.projectedJP;
      return a.teacher.nama.localeCompare(b.teacher.nama);
    };

    const eligibleList = scoredCandidates.filter(c => c.eligible).sort(compareCandidates);
    const ineligibleList = scoredCandidates.filter(c => !c.eligible).sort(compareCandidates);
    return [...eligibleList, ...ineligibleList];
  };

  const recommendationsByRow = useMemo(() => {
    return generatedRows.map((row, index) =>
      getRecommendedTeachers(row.jam_ke, row.recommendationClassLabel || row.kelas, row.subjectOverride?.trim() || row.mapel, index),
    );
    // `tugas` is intentionally not an invalidator; see recommendationDependencyKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    recommendationDependencyKey,
    guruIzin,
    teachers,
    tanggal,
    recommendationDayIndex,
    formAssignmentsByTeacher,
    teacherDailyLoads,
    teacherWeeklyLoads,
    substituteConstraints,
    dutyState,
    dutyReady,
  ]);

  // Compute schedule breakdown and availability status for the verification modal
  const verificationScheduleDetail = useMemo(() => {
    if (!verificationModalData || !verificationModalData.isOpen || !verificationModalData.teacherName) {
      return null;
    }

    const { teacherName, targetJamKe, targetKelas, targetMapel, rowIndex } = verificationModalData;
    const normTeacherName = teacherName.trim().toLowerCase();

    const selectedTeacherObj = teachers.find(t => t.nama.trim().toLowerCase() === normTeacherName);

    // Formatted date string
    let formattedDateStr = `${selectedDayName}, ${tanggal}`;
    try {
      const dObj = new Date(tanggal);
      if (!isNaN(dObj.getTime())) {
        formattedDateStr = dObj.toLocaleDateString("id-ID", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric"
        });
      }
    } catch {
      // fallback
    }

    // Standard hours list
    const hours = [0, 1, 2, 3, 4, 5, 6];

    // Compute hourly details
    const hourlyDetails = hours.map(hour => {
      // Effective schedule items for this hour
      const scheds = effectiveSchedulesForDate.filter(s => 
        Number(s.jam_ke) === hour && 
        [s.guru1, s.guru2, s.guru3, s.guru4, s.guru5, s.guru6].some(
          g => g && g.trim().toLowerCase() === normTeacherName
        )
      );

      // Leave is period-scoped: absence in JP2 must not block JP4.
      const isAbsentAtPeriod = logs.some(l =>
        isSameDay(l.tanggal, tanggal) &&
        Number(l.jam_ke) === hour &&
        l.guru_izin &&
        l.guru_izin.trim().toLowerCase() === normTeacherName
      );

      // Existing badal logs for this hour
      const badalLogs = logs.filter(l => 
        isSameDay(l.tanggal, tanggal) && 
        Number(l.jam_ke) === hour && 
        l.guru_pengganti && 
        l.guru_pengganti.trim().toLowerCase() === normTeacherName
      );

      // Identify source of each schedule item (Master vs Incidental)
      const items = scheds.map(s => {
        const isIncidental = (jadwalInsidental || []).some(
          inc => inc.tanggal === tanggal && 
          inc.kelas && 
          inc.kelas.trim().toLowerCase() === s.kelas.trim().toLowerCase() && 
          Number(inc.jam_ke) === Number(s.jam_ke)
        );
        const isPrimary = s.guru1 && s.guru1.trim().toLowerCase() === normTeacherName;
        return {
          id: s.id,
          mapel: s.mapel,
          kelas: s.kelas,
          isIncidental,
          isPrimary,
          keterangan: s.keterangan_khusus
        };
      });

      // Homeroom duty check for JP 0
      let homeroomDuty: { mapel: string; kelas: string } | null = null;
      if (hour === 0 && items.length === 0 && badalLogs.length === 0 && selectedTeacherObj) {
        if (selectedTeacherObj.wali_kelas) {
          homeroomDuty = { mapel: "Wali Kelas (Homeroom)", kelas: selectedTeacherObj.wali_kelas };
        } else if (selectedTeacherObj.pendamping_kelas) {
          homeroomDuty = { mapel: "Pendamping Wali Kelas", kelas: selectedTeacherObj.pendamping_kelas };
        }
      }

      const isTarget = hour === targetJamKe;
      const isOccupied = isAbsentAtPeriod || items.length > 0 || badalLogs.length > 0 || homeroomDuty !== null;

      return {
        hour,
        timeStr: JAM_TIME_MAP[hour] || "",
        isTarget,
        isOccupied,
        items,
        badalLogs,
        homeroomDuty,
        isAbsentAtPeriod
      };
    });

    const targetDetail = hourlyDetails.find(h => h.hour === targetJamKe);

    // Check if target hour has ONLY companion duty (no primary teaching, no badal log, no absent, no primary homeroom)
    const isTargetCompanionOnly = (() => {
      if (!targetDetail) return false;
      if (targetDetail.isAbsentAtPeriod || targetDetail.badalLogs.length > 0) return false;
      
      // If homeroom duty is primary Wali Kelas
      if (targetDetail.homeroomDuty && targetDetail.homeroomDuty.mapel.includes("Wali Kelas (Homeroom)")) return false;

      if (targetDetail.items.length > 0) {
        const hasPrimaryTeaching = targetDetail.items.some(it => it.isPrimary);
        const hasCompanionTeaching = targetDetail.items.some(it => !it.isPrimary);
        return !hasPrimaryTeaching && hasCompanionTeaching;
      } else if (targetDetail.homeroomDuty && targetDetail.homeroomDuty.mapel.includes("Pendamping")) {
        return true;
      }

      return false;
    })();

    const isTargetConflict = targetDetail ? (targetDetail.isOccupied && !isTargetCompanionOnly) : false;

    // Discrepancy check: Did recommendations think this teacher was eligible/free?
    let recThinksEligible = false;
    if (rowIndex !== undefined && generatedRows[rowIndex]) {
      const recs = recommendationsByRow[rowIndex] || [];
      const cand = recs.find(c => c.teacher.nama.trim().toLowerCase() === normTeacherName);
      if (cand) {
        recThinksEligible = cand.eligible && !cand.isAbsentAtPeriod;
      }
    }

    const hasDiscrepancy = recThinksEligible && isTargetConflict;

    return {
      teacherName,
      selectedTeacherObj,
      formattedDateStr,
      targetJamKe,
      targetKelas,
      targetMapel,
      hourlyDetails,
      isTargetConflict,
      isTargetCompanionOnly,
      targetDetail,
      hasDiscrepancy
    };
  }, [verificationModalData, teachers, effectiveSchedulesForDate, logs, jadwalInsidental, tanggal, selectedDayName, recommendationsByRow]);

  const handleSubjectOverrideChange = React.useCallback((index: number, value: string) => {
    setGeneratedRows((current) => current.map((row, i) =>
      i === index ? { ...row, subjectOverride: value } : row));
  }, []);

  const toggleSubjectEditor = React.useCallback((index: number) => {
    setEditingSubjectRows((current) => current.includes(index)
      ? current.filter((i) => i !== index) : [...current, index]);
  }, []);

  // Handle individual replacement selection
  const handlePenggantiChange = React.useCallback((index: number, teacherName: string, overrideConstraintIds: string[] = []) => {
    setGeneratedRows((current) => current.map((row, rowIndex) =>
      rowIndex === index
        ? { ...row, selectedPengganti: teacherName, constraintOverrideIds: [...overrideConstraintIds] }
        : row,
    ));
  }, []);

  // Handle individual task/note per JP row. Functional update preserves object
  // identity for every other row so memoized dropdowns can skip re-rendering.
  const handleTugasChange = React.useCallback((index: number, taskValue: string) => {
    setGeneratedRows((current) => current.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      return {
        ...row,
        tugas: taskValue,
        taskResources: syncTaskResourcesWithText(taskValue, row.taskResources),
      };
    }));
  }, []);

  const handleTaskFileUpload = React.useCallback(async (index: number, file: File) => {
    if (!onUploadTaskFile) return;
    const row = generatedRows[index];
    if (!row) return;
    setErrorMessage("");
    try {
      const resource = await onUploadTaskFile(file, {
        scheduleDate: tanggal,
        period: row.jam_ke,
        classLabel: row.kelas,
        subject: row.subjectOverride?.trim() || row.mapel,
      });
      setGeneratedRows((current) => current.map((item, rowIndex) => {
        if (rowIndex !== index) return item;
        const currentText = String(item.tugas || "").trim();
        const nextText = currentText.includes(resource.url) ? currentText : [currentText, resource.url].filter(Boolean).join("\n");
        const uploadedUrl = normalizeTaskUrl(resource.url);
        const withoutSameUrl = item.taskResources.filter((existing) => normalizeTaskUrl(existing.url) !== uploadedUrl);
        return {
          ...item,
          tugas: nextText,
          taskResources: syncTaskResourcesWithText(nextText, [...withoutSameUrl, resource]),
        };
      }));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  }, [generatedRows, onUploadTaskFile, tanggal]);

  const removeTaskResource = React.useCallback((index: number, url: string) => {
    setGeneratedRows((current) => current.map((item, rowIndex) => {
      if (rowIndex !== index) return item;
      const normalizedTarget = normalizeTaskUrl(url);
      const nextText = removeTaskUrlFromText(item.tugas, normalizedTarget);
      const remaining = item.taskResources.filter((resource) => normalizeTaskUrl(resource.url) !== normalizedTarget);
      return {
        ...item,
        tugas: nextText,
        taskResources: syncTaskResourcesWithText(nextText, remaining),
      };
    }));
  }, []);

  // Submit and save replacement logs
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!readOnlyPreview && !dutyReady){
      setErrorMessage(dutyState.error || 'Belum selesai memverifikasi penugasan kegiatan RC3. Coba lagi.');
      return;
    }
    const dutyConflict=generatedRows.find(row=>{
      const selected=teachers.find(t=>normalizeTeacherKey(t.nama)===normalizeTeacherKey(row.selectedPengganti));
      return selected?.id && dutyState.snapshot && resolveTeacherDutyBlock(dutyState.snapshot,selected.id,tanggal);
    });
    if(dutyConflict){
      setErrorMessage(`Guru pengganti JP${dutyConflict.jam_ke} sedang bertugas atau libur pengganti. Pilih kandidat lain.`);
      return;
    }
    if (!approvedPeriodsReady) {
      setErrorMessage(approvedPeriodQuery?.error || 'Sedang memuat status izin APPROVED. Tunggu hingga verifikasi selesai.');
      return;
    }
    const selectedAbsent = generatedRows.find(row => {
      const teacher = teachers.find(t=>normalizeTeacherKey(t.nama) === normalizeTeacherKey(row.selectedPengganti));
      return teacher && recommendationDayIndex.absentJamKeByTeacher
        .get(normalizeTeacherKey(teacher.nama))?.has(Number(row.jam_ke));
    });
    if (selectedAbsent) {
      setErrorMessage(`Guru pengganti pada JP${selectedAbsent.jam_ke} sedang izin APPROVED. Silakan pilih kandidat lain.`);
      return;
    }

    if (readOnlyPreview) {
      setErrorMessage("Shadow preview V3.10 bersifat read-only. Simpan badal belum dipindahkan ke Supabase pada checkpoint ini.");
      return;
    }

    if (!tanggal || !guruIzin || !alasan) {
      setErrorMessage("Silakan lengkapi data Tanggal, Guru Izin, dan Alasan terlebih dahulu.");
      return;
    }

    if (generatedRows.length === 0) {
      setErrorMessage("Baris penggantian belum digenerate atau masih kosong.");
      return;
    }

    // Disallow blank/oversized edited subjects and unsupported special JP0.
    const invalidSubject = generatedRows.find((row) => row.subjectOverride !== undefined
      && (!row.subjectOverride.trim() || row.subjectOverride.trim().length > 120));
    if (invalidSubject) {
      setErrorMessage("Mapel badal tidak boleh kosong dan maksimal 120 karakter. Gunakan Kembalikan Mapel Asli untuk membatalkan perubahan.");
      return;
    }
    // Check if all rows have selected replacements
    const missingReplacement = generatedRows.some(row => !row.selectedPengganti);
    if (missingReplacement) {
      setErrorMessage("Harap pilih Guru Pengganti untuk seluruh jam pelajaran yang dicentang.");
      return;
    }

    // One operator row may represent multiple explicitly-combined classes.
    // Persist one coverage/log row per real class so Supabase identities, audit,
    // statistics, and legacy compatibility remain precise.
    const expandedRows = expandInvalSessionRowsForPersistence({
      rows: generatedRows,
      tanggal,
      guruIzin,
      alasan,
    });
    const newLogs: Omit<LogIzinItem, "id">[] = expandedRows.map((entry) => entry.log);

    // Check optional room relocation
    let roomIncidentalData;
    if (enableRoomRelocation) {
      if (!relocationTargetRoom) {
        setErrorMessage("Silakan pilih Ruangan Tujuan untuk relokasi kelas.");
        return;
      }
      if (!targetRowForRelocation) {
        setErrorMessage("Sesi relokasi ruangan tidak valid.");
        return;
      }
      if (targetRowForRelocation.targetSlots.length > 1) {
        setErrorMessage("Relokasi ruangan untuk sesi kelas gabungan belum disimpan sebagai satu bundle. Nonaktifkan relokasi atau lakukan relokasi kelas secara terpisah.");
        return;
      }
      roomIncidentalData = {
        tanggal,
        kelas: targetRowForRelocation.kelas,
        jam_ke: targetRowForRelocation.jam_ke,
        mapel: targetRowForRelocation.mapel,
        ruangan: relocationTargetRoom,
        alasan: relocationReason || alasan || "Relokasi Ruangan",
        tipe_insidental: "Relokasi Ruangan"
      };
    }

    try {
      setIsSubmitting(true);
      setErrorMessage("");
      await onAddLogs(
        newLogs,
        roomIncidentalData,
        {
          constraintOverrideIdsByRow: expandedRows.map((entry) => entry.constraintOverrideIds),
          subjectOverridesByRow: expandedRows.map((entry) => entry.subjectOverride),
          taskResourcesByRow: generatedRows.flatMap((row) => {
            const targetCount = row.targetSlots.length > 0 ? row.targetSlots.length : 1;
            return Array.from({ length: targetCount }, () => row.taskResources.map((resource) => ({ ...resource })));
          }),
          overrideNote: generatedRows.some((row) => row.constraintOverrideIds.length > 0)
            ? "Pembatasan badal dioverride secara eksplisit dari Input Inval."
            : undefined,
        },
      );

      // Reset only after the persistence layer confirms success.
      const groupedCount = generatedRows.filter((row) => row.targetSlots.length > 1).length;
      setSuccessMessage(`Berhasil menyimpan ${generatedRows.length} sesi Inval (${newLogs.length} slot kelas)${groupedCount > 0 ? `, termasuk ${groupedCount} sesi kelas gabungan` : ""}${enableRoomRelocation ? " & Relokasi Ruangan" : ""}!`);
      setGuruIzin("");
      setSearchTeacherQuery("");
      setShowTeacherSuggestions(false);
      setAlasan("");
      setSelectedHours([]);
      setGeneratedRows([]);
      setEditingSubjectRows([]);
      setEnableRoomRelocation(false);
      setRelocationTargetRoom("");
      setRelocationReason("");
      setRelocationRowIndex(0);

      setTimeout(() => {
        setSuccessMessage("");
      }, 4000);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <button
          id="back-to-dashboard-btn"
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-indigo-600 bg-white px-4 py-2 rounded-xl border border-gray-100 hover:border-indigo-100 shadow-sm transition-all self-start"
        >
          <ArrowLeft className="w-4 h-4" />
          {officialDutySlots ? "Kembali ke Aturan Guru Badal" : approvedWaitingSession ? "Kembali ke Persetujuan Izin" : "Kembali ke Dashboard"}
        </button>

        <span className="text-sm font-semibold text-gray-400 flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" />
          {officialDutySlots ? "Pemilihan Badal • Tugas Resmi Sekolah" : approvedWaitingSession ? "Pemilihan Badal • Pengajuan Izin" : "Penjadwalan Guru Pengganti Pintar"}
        </span>
      </div>

      {/* Main Container */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        <div className="mb-6 pb-6 border-b border-gray-50">
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-indigo-500" />
            {officialDutySlots ? "Tentukan Badal • Tugas Resmi Sekolah" : approvedWaitingSession ? "Tentukan Badal • Izin Disetujui" : "Input Guru Pengganti (Inval)"}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Gunakan asisten pintar ini untuk menjadwalkan guru pengganti yang paling relevan berdasarkan data jadwal harian dan prioritas bidang.
          </p>
          {readOnlyPreview && (
            <div className="mt-3 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-bold text-cyan-900">
              TRACE Supabase cutover — rekomendasi memakai data Supabase + gender preference + substitute constraints. Write mengikuti mode cutover aktif.
            </div>
          )}
        </div>

        {!approvedPeriodsReady && <div role="alert" className="mb-4 rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs font-bold text-rose-900">
          {approvedPeriodQuery?.error || 'Memverifikasi periode izin APPROVED termasuk JP FREE…'}
          {' '}Penyimpanan badal dikunci sampai verifikasi berhasil.
        </div>}

        {/* Feedback Messages */}
        {errorMessage && (
          <div className="p-4 bg-red-50 border border-red-100 text-red-800 rounded-xl text-sm font-medium flex items-center gap-2 mb-6">
            <AlertTriangle className="w-4.5 h-4.5 text-red-500 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="p-4 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl text-sm font-medium flex items-center gap-2 mb-6">
            <Sparkles className="w-4.5 h-4.5 text-emerald-500 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {officialDutySlots && <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900 mb-5">
          <strong>Penugasan Resmi Sekolah.</strong> Tanggal, guru, alasan restriksi, dan slot terkunci.
          Rekomendasi gender, konflik harian, dan beban mingguan memakai mesin Input Inval yang sama.
          Penyimpanan dilakukan sebagai OFFICIAL_DUTY, bukan izin pribadi.
        </div>}
        {approvedWaitingSession && <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900 mb-5">
          <strong>Badal Pengajuan Izin {approvedWaitingSession.requestCode}.</strong> Guru, tanggal, JP, dan kelas dikunci sesuai Waiting List. Rekomendasi gender, jadwal harian, dan beban mingguan tetap aktif. Tugas guru izin hanya dapat dilihat, tidak diubah.
        </div>}
        {/* Step 1: Input Permohonan Form */}
        {!readOnlyPreview && !dutyReady && <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
          {dutyState.error ? `Tidak dapat membaca penugasan kegiatan: ${dutyState.error}. Rekomendasi badal diblokir untuk keamanan.` : 'Memverifikasi penugasan kegiatan dan libur pengganti…'}
        </div>}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Field A: Tanggal */}
            <div className="space-y-2">
              <label className="block text-sm font-bold text-gray-700 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-gray-400" />
                Tanggal Izin
              </label>
              <input
                id="input-tanggal-izin"
                disabled={Boolean(officialDutySlots || approvedWaitingSession)}
                type="date"
                value={tanggal}
                onChange={(e) => {
                  if (officialDutySlots || approvedWaitingSession) return;
                  setTanggal(e.target.value);
                  setGeneratedRows([]); // reset generated rows to enforce regenerate
                }}
                className="w-full bg-gray-50 hover:bg-gray-100/50 focus:bg-white text-gray-800 border border-gray-200 focus:border-indigo-500 rounded-xl p-3 focus:outline-none transition-all text-sm font-semibold"
                required
              />
              <p className="text-xs text-gray-400">
                Jadwal yang ditinjau: Hari <strong className="text-indigo-600">{selectedDayName}</strong>
              </p>
            </div>

            {/* Field B: Guru yang Izin */}
            <div className="space-y-2 relative">
              <label className="block text-sm font-bold text-gray-700 flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-gray-400" />
                {officialDutySlots ? "Guru dengan Restriksi" : "Guru yang Izin"}
              </label>
              
              <div className="relative">
                <input
                  id="input-guru-izin-search"
                  disabled={Boolean(officialDutySlots || approvedWaitingSession)}
                  type="text"
                  placeholder="Ketik nama guru atau mata pelajaran..."
                  value={searchTeacherQuery}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSearchTeacherQuery(val);
                    setShowTeacherSuggestions(true);
                    
                    // If the user types, check if they matched exactly
                    const match = teachers.find(t => t.nama.toLowerCase() === val.trim().toLowerCase());
                    if (match) {
                      setGuruIzin(match.nama);
                    } else {
                      setGuruIzin(""); // Clear active selected teacher until explicit click
                    }
                    setGeneratedRows([]); // reset generated rows
                  }}
                  onFocus={() => {
                    setShowTeacherSuggestions(true);
                  }}
                  className="w-full bg-gray-50 hover:bg-gray-100/50 focus:bg-white text-gray-800 border border-gray-200 focus:border-indigo-500 rounded-xl p-3 pr-20 focus:outline-none transition-all text-sm font-semibold"
                  required
                  autoComplete="off"
                />

                {/* Status indicator badge inside the textbox */}
                {guruIzin && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-md">
                    <T>{"Terpilih"}</T>
                  </span>
                )}
              </div>

              {/* Backdrop to close the suggestion dropdown when clicked outside */}
              {showTeacherSuggestions && (
                <div 
                  className="fixed inset-0 z-10" 
                  onClick={() => setShowTeacherSuggestions(false)} 
                />
              )}

              {/* Suggestions List Container */}
              {showTeacherSuggestions && (
                <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-gray-100 rounded-xl shadow-lg max-h-60 overflow-y-auto z-20 divide-y divide-gray-50">
                  {filteredTeacherSuggestions.length > 0 ? (
                    filteredTeacherSuggestions.map((t) => {
                      const isSelected = guruIzin === t.nama;
                      const isITBA = checkIsITBA(t);
                      return (
                        <div
                          key={t.nama}
                          onClick={() => {
                            setGuruIzin(t.nama);
                            setSearchTeacherQuery(t.nama);
                            setShowTeacherSuggestions(false);
                            setGeneratedRows([]);
                          }}
                          className={`p-3 text-sm cursor-pointer transition-all flex items-center justify-between ${
                            isSelected 
                              ? "bg-indigo-50/70 text-indigo-900 font-bold" 
                              : "hover:bg-gray-50 text-gray-700"
                          }`}
                        >
                          <div className="flex flex-col">
                            <span className="font-semibold text-gray-800 flex items-center gap-1.5">
                              {t.nama}
                              {isITBA && (
                                <span className="text-[9px] bg-purple-100 text-purple-700 border border-purple-200 font-bold px-1.5 py-0.5 rounded uppercase tracking-wider scale-95">
                                  ITBA
                                </span>
                              )}
                            </span>
                            <span className="text-xs text-gray-400 mt-0.5 font-normal">
                              Mapel Utama: {t.mapel_utama || "-"}
                              {t.tugas_tambahan && ` • ${t.tugas_tambahan}`}
                            </span>
                          </div>
                          {isSelected && (
                            <span className="text-indigo-600 font-bold text-xs">✓</span>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-4 text-center text-xs text-gray-400 font-medium">
                      Tidak ada guru yang cocok dengan pencarian Anda
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Field C: Alasan */}
            <div className="space-y-2 md:col-span-2">
              <label className="block text-sm font-bold text-gray-700">
                Alasan Izin / Halangan Hadir
              </label>
              <input
                id="input-alasan-izin"
                type="text"
                placeholder="Contoh: Sakit (Demam), Dinas Luar ke LPMP, Cuti Bersalin..."
                value={alasan}
                readOnly={Boolean(officialDutySlots || approvedWaitingSession)}
                onChange={(e) => setAlasan(e.target.value)}
                className="w-full bg-gray-50 hover:bg-gray-100/50 focus:bg-white text-gray-800 border border-gray-200 focus:border-indigo-500 rounded-xl p-3 focus:outline-none transition-all text-sm font-medium"
                required
              />
            </div>

            {/* Field D: Checkbox Jam Ke- */}
            <div className="space-y-2 md:col-span-2">
              <div className="flex justify-between items-center">
                <label className="block text-sm font-bold text-gray-700">
                  {officialDutySlots ? "JP Tugas Resmi yang Butuh Badal (terkunci)" : approvedWaitingSession ? "JP Pengajuan Izin (terkunci)" : "Pilih Sesi Jam Pelajaran yang Kosong"}
                </label>
                {!officialDutySlots && !approvedWaitingSession && <button
                  type="button"
                  id="toggle-select-all-hours"
                  onClick={handleSelectAllHours}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1"
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  {selectedHours.length === 7 ? "Deselect All" : "Select All"}
                </button>}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 pt-1">
                {[0, 1, 2, 3, 4, 5, 6].map((hour) => {
                  let status: "free" | "mengajar" | "mendamping" | "izin" = "free";
                  let classText = "";
                  const targetTeacherObj = guruIzin ? teachers.find(t => t.nama === guruIzin) : undefined;

                  if (guruIzin) {
                    const isITBA = targetTeacherObj ? checkIsITBA(targetTeacherObj) : false;

                    const matchingScheds = effectiveSchedulesForDate.filter(
                      s => Number(s.jam_ke) === hour && [s.guru1, s.guru2, s.guru3, s.guru4, s.guru5, s.guru6].some(
                        g => g && g.trim().toLowerCase() === guruIzin.trim().toLowerCase()
                      )
                    );

                    if (matchingScheds.length > 0) {
                      const uniqueKelas = [...new Set(matchingScheds.map(s => s.kelas))].filter(Boolean);
                      classText = uniqueKelas.join(" & ");

                      // Check if there is any schedule in matchingScheds where they are primary teaching (not just accompanying)
                      const hasPrimaryTeaching = matchingScheds.some(s => {
                        const isGuru1 = s.guru1 && s.guru1.trim().toLowerCase() === guruIzin.trim().toLowerCase();
                        if (isAlQuranOrTahsin(s.mapel)) {
                          return true;
                        }
                        if (isITBA) {
                          return isITBACoreSubject(s.mapel, guruIzin);
                        }
                        return isGuru1;
                      });

                      if (hasPrimaryTeaching) {
                        status = "mengajar";
                      } else {
                        status = "mendamping";
                      }
                    } else if (hour === 0 && targetTeacherObj) {
                      if (targetTeacherObj.wali_kelas) {
                        status = "mengajar";
                        classText = targetTeacherObj.wali_kelas;
                      } else if (targetTeacherObj.pendamping_kelas) {
                        status = "mendamping";
                        classText = targetTeacherObj.pendamping_kelas;
                      }
                    }
                  }

                  let statusLabel = "× Free";
                  let statusClass = "text-gray-300 italic";

                  const calEvent = getAcademicCalendarEvent(tanggal, classText || undefined, hour, kalenderAkademik);
                  const normalTeachingBlock = targetTeacherObj?.id
                    ? resolveNormalTeachingBlock({
                        teacherId: targetTeacherObj.id,
                        date: tanggal,
                        period: hour,
                        constraints: substituteConstraints,
                      })
                    : { blocked: false, matchingConstraints: [] };

                  if (calEvent) {
                    statusLabel = `🎉 ${calEvent.tipe}: ${calEvent.nama_kegiatan}`;
                    statusClass = "text-emerald-700 font-bold bg-emerald-50 px-1 py-0.5 rounded";
                  } else if (normalTeachingBlock.blocked && (status === "mengajar" || status === "mendamping")) {
                    status = "izin";
                    statusLabel = `× Izin${classText ? ` (${classText})` : ""}`;
                    if (officialDutySlots) statusLabel = statusLabel.replace("× Izin", "× Tugas Resmi");
                    const reason = normalTeachingBlock.matchingConstraints.map((item) => item.reason).filter(Boolean).join(", ");
                    if (reason) statusLabel += ` • ${reason}`;
                    statusClass = "text-rose-600 font-black";
                  } else if (status === "mengajar") {
                    statusLabel = `✓ Mengajar${classText ? ` (${classText})` : ""}`;
                    statusClass = "text-indigo-600";
                  } else if (status === "mendamping") {
                    statusLabel = `× Pendamping${classText ? ` (${classText})` : ""}`;
                    statusClass = "text-gray-400 font-medium italic";
                  }

                  return (
                    <label 
                      key={hour}
                      className={`p-2.5 border rounded-xl flex flex-col justify-between cursor-pointer transition-all ${
                        (approvedWaitingSession ? approvedWaitingSession.period === hour : officialDutySlots ? officialDutySlots.some((slot) => slot.period === hour) : selectedHours.includes(hour))
                          ? "bg-indigo-50 border-indigo-300 text-indigo-900 shadow-sm"
                          : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-xs">
                          {hour === 0 ? "JP-0 (Homeroom)" : `Jam Ke-${hour}`}
                        </span>
                        <input
                          id={`hour-check-${hour}`}
                          type="checkbox"
                          className="accent-indigo-600 w-4 h-4"
                          checked={approvedWaitingSession ? approvedWaitingSession.period === hour : officialDutySlots ? officialDutySlots.some((slot) => slot.period === hour) : selectedHours.includes(hour)}
                          disabled={Boolean(officialDutySlots || approvedWaitingSession)}
                          onChange={() => {
                            handleHourToggle(hour);
                            setGeneratedRows([]);
                          }}
                        />
                      </div>
                      {guruIzin && (
                        <span className={`text-[9px] mt-1.5 font-bold ${statusClass}`}>
                          {statusLabel}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>

          </div>

          {/* Generate Button */}
          <div className="pt-2">
            <button
              type="button"
              id="generate-replacement-rows"
              onClick={handleGenerate}
              className="w-full sm:w-auto px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition-colors flex items-center justify-center gap-2 text-sm"
            >
              <Plus className="w-4 h-4" />
              {officialDutySlots ? "Analisis Kebutuhan Badal" : approvedWaitingSession ? "Analisis Badal Pengajuan Izin" : "Generate Baris Pengganti"}
            </button>
          </div>

          {/* Generated Replacement Section */}
          {generatedRows.length > 0 && (
            <div className="mt-8 border-t border-gray-100 pt-8 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-amber-500" />
                    Penempatan Inval Rekomendasi Pintar
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Silakan tentukan guru pengganti untuk setiap jam pelajaran yang telah diajukan di bawah.
                  </p>
                </div>
                
                <span className="text-xs font-semibold bg-amber-50 text-amber-700 px-3 py-1 rounded-full border border-amber-100">
                  {generatedRows.length} Sesi Terbentuk
                </span>
              </div>

              {/* Grid of Slots to fill */}
              <div className="space-y-4">
                {generatedRows.map((row, index) => {
                  // Get candidates recommendation ranking
                  const recommendations = recommendationsByRow[index] || [];

                  return (
                    <div 
                      key={`${row.jam_ke}-${row.kelas}-${index}`}
                      className="p-5 bg-gray-50 border border-gray-200/60 hover:border-indigo-100 rounded-2xl transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                    >
                      
                      {/* Left: Info about what's missing */}
                      <div className="space-y-1 lg:max-w-xs">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="bg-indigo-100 text-indigo-800 text-xs font-bold px-2.5 py-0.5 rounded">
                            {row.jam_ke === 0 ? "JP-0 (Homeroom)" : `Jam Ke-${row.jam_ke}`}
                          </span>
                          <span className="text-xs font-medium text-gray-400">
                            {JAM_TIME_MAP[row.jam_ke]}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-gray-800 text-base">{row.subjectOverride?.trim() || row.mapel}</h4>
                          {!approvedWaitingSession && !officialDutySlots && !readOnlyPreview && row.jam_ke > 0 && (
                            <button type="button" onClick={() => toggleSubjectEditor(index)}
                              className="rounded-lg border border-indigo-200 px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                              aria-label={`Edit mata pelajaran JP ${row.jam_ke} ${row.kelas}`}>
                              {editingSubjectRows.includes(index) ? "Tutup" : "✎ Edit Mapel"}
                            </button>
                          )}
                          {row.targetSlots.length > 1 && (
                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                              KELAS GABUNG • {row.targetSlots.length} <T>{"KELAS"}</T>
                            </span>
                          )}
                        </div>
                        {editingSubjectRows.includes(index) && !approvedWaitingSession && !officialDutySlots && !readOnlyPreview && row.jam_ke > 0 && (
                          <div className="mt-2 rounded-xl border border-indigo-200 bg-indigo-50 p-3 space-y-2">
                            <label htmlFor={`inval-mapel-${index}`} className="block text-xs font-bold text-indigo-900">
                              Mata pelajaran saat badal
                            </label>
                            <input id={`inval-mapel-${index}`} type="text" list={`inval-mapel-options-${index}`}
                              value={row.subjectOverride === undefined ? row.mapel : row.subjectOverride}
                              onChange={(event) => handleSubjectOverrideChange(index, event.target.value)}
                              maxLength={120}
                              className="w-full rounded-lg border border-indigo-200 bg-white p-2 text-sm text-gray-900"
                              placeholder="Ketik nama mata pelajaran aktual" />
                            <datalist id={`inval-mapel-options-${index}`}>
                              {[...new Set(schedules.map((s) => String(s.mapel || "").trim()).filter(Boolean))]
                                .sort((a, b) => a.localeCompare(b, "id-ID"))
                                .map((subject) => <option key={subject} value={subject} />)}
                            </datalist>
                            <div className="text-xs text-indigo-800">Mapel asli: <strong>{row.mapel}</strong></div>
                            {row.targetSlots.length > 1 && <div className="text-xs text-amber-800">
                              Perubahan berlaku untuk seluruh {row.targetSlots.length} kelas dalam sesi gabungan ini.
                            </div>}
                            <button type="button" onClick={() => handleSubjectOverrideChange(index, row.mapel)}
                              className="text-xs font-bold text-indigo-700 underline">Kembalikan Mapel Asli</button>
                            <p className="text-[11px] text-indigo-700">Hanya tanggal, kelas, dan JP ini; jadwal master tidak berubah.</p>
                          </div>
                        )}
                        <p className="text-xs text-gray-500">
                          Kelas Target: <strong className="text-gray-700">{row.kelas}</strong>
                        </p>
                      </div>

                      {/* Right: Recommendation Select Dropdown */}
                      <div className="flex-1 max-w-xl">
                        <label className="block text-[11px] uppercase font-bold text-gray-400 mb-1.5 tracking-wider">
                          Pilih Guru Pengganti (Inval)
                        </label>
                        <CandidateSelectDropdown
                          id={`select-pengganti-jam-${row.jam_ke}-${index}`}
                          rowIndex={index}
                          value={row.selectedPengganti}
                          onChange={handlePenggantiChange}
                          recommendations={recommendations}
                          allowTeamTeachingNoBadal={row.jam_ke > 0}
                        />

                        {/* Candidate Workload UI Card */}
                        {(() => {
                          const selectedCand = recommendations.find(c => c.teacher.nama === row.selectedPengganti);
                          if (selectedCand) {
                            const dl = selectedCand.dailyLoad;
                            const wl = selectedCand.weeklyLoad;
                            const isOverload = wl.projectedJP > RECOMMENDED_WEEKLY_JP_LIMIT;

                            return (
                              <div className={`mt-2.5 p-3 rounded-xl border text-xs transition-all ${
                                isOverload
                                  ? "bg-amber-50/90 border-amber-300 text-amber-950 shadow-2xs"
                                  : "bg-indigo-50/70 border-indigo-200 text-indigo-950 shadow-2xs"
                              }`}>
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                  <div className="space-y-1.5">
                                    <div className="flex items-center gap-2 font-bold">
                                      <UserCheck className="w-4 h-4 text-indigo-600 shrink-0" />
                                      <span className="text-sm font-bold text-gray-900">{selectedCand.teacher.nama}</span>
                                      <span className="text-[10px] bg-emerald-100 text-emerald-800 font-extrabold px-2 py-0.5 rounded-full border border-emerald-200">
                                        Available
                                      </span>
                                    </div>

                                    <div className="text-[11px] font-semibold text-slate-700 flex flex-wrap items-center gap-x-3 gap-y-1">
                                      <div>
                                        <span className="text-slate-500 font-bold">Beban Hari Terpilih: </span>
                                        <span className="font-extrabold text-slate-900 bg-white/90 px-2 py-0.5 rounded border border-slate-200">
                                          {dl.jpEfektif} <T>{"JP"}</T>
                                        </span>
                                      </div>
                                      <div className="text-slate-300 hidden sm:inline">|</div>
                                      <div>
                                        <span className="text-slate-500 font-bold"><T>{"Beban Minggu Ini:"}</T> </span>
                                        <span className="font-extrabold text-slate-900 bg-white/90 px-2 py-0.5 rounded border border-slate-200">
                                          {wl.jpAsli} JP | -{wl.jpIzin} izin | +{wl.jpBadal} badal = {wl.jpEfektif} <T>{"JP"}</T>
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="sm:text-right shrink-0 self-start sm:self-center">
                                    {isOverload ? (
                                      <div className="space-y-0.5">
                                        <span className="font-extrabold text-amber-900 bg-amber-200/90 px-2.5 py-1 rounded-lg border border-amber-400 inline-flex items-center gap-1">
                                          ⚠️ Jika dipilih → Hari: {dl.projectedJP} JP • Minggu: {wl.projectedJP} <T>{"JP"}</T>
                                        </span>
                                        <div className="text-[10px] font-bold text-amber-800">
                                          Melebihi batas {RECOMMENDED_WEEKLY_JP_LIMIT} <T>{"JP"}</T>
                                        </div>
                                      </div>
                                    ) : (
                                      <span className="font-extrabold text-emerald-800 bg-emerald-100/90 px-2.5 py-1 rounded-lg border border-emerald-300 inline-block">
                                        Jika dipilih → Hari: {dl.projectedJP} JP • Minggu: {wl.projectedJP} <T>{"JP"}</T>
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          // Preview card for top recommended candidate if none selected yet
                          const topCand = recommendations.find(c => c.eligible && !c.isAbsentAtPeriod && c.constraintStatus === "AVAILABLE");
                          if (topCand) {
                            const dl = topCand.dailyLoad;
                            const wl = topCand.weeklyLoad;
                            const isOverload = wl.projectedJP > RECOMMENDED_WEEKLY_JP_LIMIT;

                            return (
                              <div className="mt-2.5 p-3 rounded-xl border border-gray-200 bg-white text-xs text-slate-800 shadow-2xs">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                  <div className="space-y-1.5">
                                    <div className="flex items-center gap-1.5 text-gray-500 font-bold text-[10px] uppercase tracking-wider">
                                      <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                      <span>Rekomendasi Teratas</span>
                                    </div>
                                    <div className="flex items-center gap-2 font-bold">
                                      <span className="text-sm font-bold text-gray-900">{topCand.teacher.nama}</span>
                                      <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded border border-emerald-200">
                                        {topCand.score >= 100 ? "★ Semapel" : topCand.score >= 50 ? "✦ Serumpun" : "Sejenjang"}
                                      </span>
                                    </div>
                                    <div className="text-[11px] font-semibold text-slate-700 flex flex-wrap items-center gap-x-3 gap-y-1">
                                      <div>
                                        <span className="text-slate-500 font-bold">Beban Hari Terpilih: </span>
                                        <span className="font-extrabold text-slate-900 bg-gray-50 px-2 py-0.5 rounded border border-gray-200">
                                          {dl.jpEfektif} <T>{"JP"}</T>
                                        </span>
                                      </div>
                                      <div className="text-slate-300 hidden sm:inline">|</div>
                                      <div>
                                        <span className="text-slate-500 font-bold"><T>{"Beban Minggu Ini:"}</T> </span>
                                        <span className="font-extrabold text-slate-900 bg-gray-50 px-2 py-0.5 rounded border border-gray-200">
                                          {wl.jpAsli} JP | -{wl.jpIzin} izin | +{wl.jpBadal} badal = {wl.jpEfektif} <T>{"JP"}</T>
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="sm:text-right shrink-0 self-start sm:self-center">
                                    {isOverload ? (
                                      <div className="space-y-0.5">
                                        <span className="font-extrabold text-amber-800 bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-300 inline-block">
                                          ⚠️ Jika dipilih → Hari: {dl.projectedJP} JP • Minggu: {wl.projectedJP} <T>{"JP"}</T>
                                        </span>
                                        <div className="text-[10px] font-bold text-amber-700">Melebihi batas {RECOMMENDED_WEEKLY_JP_LIMIT} <T>{"JP"}</T></div>
                                      </div>
                                    ) : (
                                      <span className="font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 inline-block">
                                        Jika dipilih → Hari: {dl.projectedJP} JP • Minggu: {wl.projectedJP} <T>{"JP"}</T>
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          return null;
                        })()}

                        {/* Best recommendation helper display */}
                        {recommendations.length > 0 && (
                          <div className="mt-2 px-1 flex flex-wrap gap-1.5">
                            <span className="text-[10px] text-gray-400 font-semibold self-center">Faktor pendukung peringkat teratas:</span>
                            {recommendations[0] && recommendations[0].reasons.slice(0, 3).map((r, i) => (
                              <span key={i} className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-100 font-bold px-2 py-0.5 rounded-md">
                                {r}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Tombol Verifikasi Jadwal - tepat di atas area tugas/material. */}
                        <div className="mt-2.5">
                          <button
                            type="button"
                            id={`btn-verify-schedule-${row.jam_ke}`}
                            onClick={() => setVerificationModalData({
                              isOpen: true,
                              teacherName: row.selectedPengganti,
                              targetJamKe: row.jam_ke,
                              targetKelas: row.kelas,
                              targetMapel: row.mapel,
                              rowIndex: index,
                            })}
                            disabled={!row.selectedPengganti || row.selectedPengganti === TEAM_TEACHING_NO_BADAL}
                            className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 disabled:bg-slate-100 disabled:text-slate-400 font-bold text-xs rounded-xl border border-indigo-200/80 disabled:border-slate-200 flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:cursor-not-allowed shadow-2xs"
                            title={row.selectedPengganti ? `Verifikasi jadwal ${row.selectedPengganti}` : "Pilih guru pengganti terlebih dahulu"}
                          >
                            <Search className="w-3.5 h-3.5 text-indigo-600" />
                            <span>🔎 Verifikasi Jadwal Guru</span>
                          </button>
                        </div>

                        {/* Per-JP Task / Material Link input field */}
                        {(!officialDutySlots || row.selectedPengganti === TEAM_TEACHING_NO_BADAL) && <div className="mt-2.5">
                          <label className="block text-[11px] font-bold text-gray-500 mb-1">
                            📌 {taskOwnership === "LEAVE_TEACHER" ? "Tugas dari Guru Izin" : "Tugas / Link Materi"} ({row.jam_ke === 0 ? "JP-0" : `Jam Ke-${row.jam_ke}`}):
                          </label>
                          <textarea
                            rows={3}
                            placeholder={taskOwnership === "LEAVE_TEACHER" ? "Guru belum mengisi tugas untuk JP ini." : "Tulis instruksi, tempel link saja, atau kombinasikan keduanya. Contoh: Kerjakan LKS Hal 15 / https://classroom.google.com/..."}
                            value={row.tugas || ""}
                            readOnly={taskOwnership === "LEAVE_TEACHER"}
                            onChange={(e) => { if (taskOwnership !== "LEAVE_TEACHER") handleTugasChange(index, e.target.value); }}
                            className={`w-full border border-gray-200 focus:border-indigo-500 text-gray-800 text-xs font-medium p-2.5 rounded-xl focus:outline-none transition-colors resize-y ${taskOwnership === "LEAVE_TEACHER" ? "bg-slate-50 cursor-default" : "bg-white"}`}
                          />
                          {taskOwnership === "LEAVE_TEACHER" && (
                            <p className={`mt-1.5 text-[10px] font-semibold ${row.tugas ? "text-emerald-700" : "text-amber-700"}`}>
                              {row.tugas ? "✓ Tugas berasal dari pengajuan guru dan tidak perlu diketik ulang oleh Wakakur." : "⚠ Guru belum menyiapkan tugas pada pengajuan ini. Assignment badal tetap dapat diproses."}
                            </p>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {onUploadTaskFile && (
                              <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-bold cursor-pointer">
                                <Upload className="w-3.5 h-3.5" /> Upload ke Google Drive
                                <input
                                  type="file"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) void handleTaskFileUpload(index, file);
                                    e.currentTarget.value = "";
                                  }}
                                />
                              </label>
                            )}
                            {row.taskResources.map((resource) => (
                              <span
                                key={`${resource.resource_type}:${resource.url}`}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-bold max-w-full ${
                                  resource.resource_type === "DRIVE_FILE"
                                    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                                    : "bg-blue-50 border-blue-200 text-blue-800"
                                }`}
                              >
                                {resource.resource_type === "DRIVE_FILE"
                                  ? <Paperclip className="w-3 h-3 shrink-0" />
                                  : <Link2 className="w-3 h-3 shrink-0" />}
                                <span className="truncate max-w-[220px]">
                                  {resource.resource_type === "DRIVE_FILE"
                                    ? (resource.file_name || resource.label || "Lampiran Drive")
                                    : (resource.label || "Tautan materi")}
                                </span>
                                {taskOwnership !== "LEAVE_TEACHER" && (
                                  <button
                                    type="button"
                                    onClick={() => removeTaskResource(index, resource.url)}
                                    className={resource.resource_type === "DRIVE_FILE" ? "text-emerald-700 hover:text-red-600" : "text-blue-700 hover:text-red-600"}
                                    title={resource.resource_type === "DRIVE_FILE" ? "Lepas lampiran" : "Hapus tautan dari tugas"}
                                  >×</button>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>}
                      </div>

                    </div>
                  );
                })}
              </div>

              {/* Optional Room Relocation Card */}
              {!officialDutySlots && !approvedWaitingSession && <div className="bg-amber-50/60 border border-amber-200/80 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      id="checkbox-enable-room-relocation"
                      type="checkbox"
                      checked={enableRoomRelocation}
                      onChange={(e) => {
                        setEnableRoomRelocation(e.target.checked);
                        if (!e.target.checked) {
                          setRelocationTargetRoom("");
                          setRelocationReason("");
                        }
                      }}
                      className="w-4.5 h-4.5 accent-amber-600 rounded cursor-pointer"
                    />
                    <span className="font-bold text-sm text-slate-800 flex items-center gap-2">
                      <Building2 className="w-4.5 h-4.5 text-amber-600" />
                      Pindahkan Kelas ke Ruangan Lain (Relokasi Ruangan)
                    </span>
                  </label>
                  <span className="text-[11px] font-semibold text-amber-700 bg-amber-100/80 px-2.5 py-0.5 rounded-full border border-amber-200">
                    Opsional
                  </span>
                </div>

                {enableRoomRelocation && (
                  <div className="pt-3 border-t border-amber-200/60 space-y-4 animate-in fade-in duration-150">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Select Sesi / Kelas */}
                      {generatedRows.length > 1 ? (
                        <div className="space-y-1.5">
                          <label className="block text-xs font-bold text-slate-700">
                            Pilih Sesi / Jam Pelajaran yang Direlokasi:
                          </label>
                          <select
                            id="select-relocation-row-index"
                            value={relocationRowIndex}
                            onChange={(e) => setRelocationRowIndex(Number(e.target.value))}
                            className="w-full bg-white border border-amber-200 focus:border-amber-500 text-slate-800 text-xs font-bold p-2.5 rounded-xl focus:outline-none shadow-2xs"
                          >
                            {generatedRows.map((r, idx) => (
                              <option key={idx} value={idx}>
                                {r.jam_ke === 0 ? "JP-0" : `JP ${r.jam_ke}`} • Kelas {r.kelas} ({r.mapel})
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <label className="block text-xs font-bold text-slate-700">
                            Sesi Terpilih:
                          </label>
                          <div className="p-2.5 bg-white border border-amber-200 text-slate-800 text-xs font-bold rounded-xl">
                            {targetRowForRelocation?.jam_ke === 0 ? "JP-0" : `JP ${targetRowForRelocation?.jam_ke}`} • Kelas {targetRowForRelocation?.kelas} ({targetRowForRelocation?.mapel})
                          </div>
                        </div>
                      )}

                      {/* Current Room Info Display */}
                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-slate-700">
                          Ruangan Saat Ini:
                        </label>
                        <div className="p-2.5 bg-amber-100/60 border border-amber-200 text-amber-950 text-xs font-bold rounded-xl flex items-center justify-between">
                          <span>{currentRoomInfo.displayName}</span>
                          {currentRoomInfo.roomId && (
                            <span className="text-[10px] bg-amber-200 text-amber-900 font-black px-1.5 py-0.5 rounded">
                              {currentRoomInfo.roomId}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Target Room Dropdown */}
                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-slate-700 flex items-center justify-between">
                          <span>Pilih Ruangan Tujuan:</span>
                          <span className="text-[10px] text-amber-700 font-semibold">Master Ruangan ({sortedMasterRuangan.length})</span>
                        </label>
                        <select
                          id="select-relocation-target-room"
                          value={relocationTargetRoom}
                          onChange={(e) => setRelocationTargetRoom(e.target.value)}
                          className="w-full bg-white border border-amber-300 focus:border-amber-500 text-slate-800 text-xs font-bold p-2.5 rounded-xl focus:outline-none shadow-2xs"
                          required={enableRoomRelocation}
                        >
                          <option value="">-- Pilih Ruangan Tujuan --</option>
                          {sortedMasterRuangan.map(room => (
                            <option key={room.id_ruangan} value={room.id_ruangan}>
                              {room.nama_ruangan} ({room.id_ruangan}){room.kapasitas ? ` - Kap. ${room.kapasitas}` : ""}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Relocation Reason */}
                      <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-slate-700">
                          Alasan Relokasi Ruangan:
                        </label>
                        <input
                          id="input-relocation-reason"
                          type="text"
                          placeholder="Contoh: Labkom sedang dipakai Maintenance / Perbaikan Listrik"
                          value={relocationReason}
                          onChange={(e) => setRelocationReason(e.target.value)}
                          className="w-full bg-white border border-amber-200 focus:border-amber-500 text-slate-800 text-xs font-medium p-2.5 rounded-xl focus:outline-none shadow-2xs"
                        />
                      </div>
                    </div>

                    {/* Conflict Check Feedback Banner */}
                    {relocationConflictCheck && (
                      <div className={`p-3.5 rounded-xl text-xs font-bold border flex items-center justify-between ${
                        relocationConflictCheck.isConflict
                          ? "bg-red-50 text-red-900 border-red-200"
                          : relocationConflictCheck.isSameRoom
                            ? "bg-amber-100/80 text-amber-900 border-amber-300"
                            : "bg-emerald-50 text-emerald-900 border-emerald-200"
                      }`}>
                        <span>{relocationConflictCheck.message}</span>
                        {relocationConflictCheck.isConflict && (
                          <span className="text-[10px] uppercase tracking-wider font-black px-2 py-0.5 rounded bg-red-600 text-white shrink-0">
                            Konflik Ruangan
                          </span>
                        )}
                      </div>
                    )}

                    {/* Relocation Summary Banner */}
                    {relocationTargetRoom && targetRowForRelocation && (
                      <div className="p-3 bg-white border border-amber-200/80 rounded-xl text-xs flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-slate-800">Ringkasan Relokasi:</span>
                          <span className="text-slate-600">
                            Kelas <strong className="text-slate-900">{targetRowForRelocation.kelas}</strong> (JP {targetRowForRelocation.jam_ke})
                          </span>
                        </div>
                        <div className="flex items-center gap-2 font-bold">
                          <span className="text-slate-500 line-through">{currentRoomInfo.displayName}</span>
                          <span className="text-amber-600">➔</span>
                          <span className="text-emerald-700 underline">
                            {(sortedMasterRuangan.find(r => r.id_ruangan === relocationTargetRoom)?.nama_ruangan) || relocationTargetRoom}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>}

              {/* Submit Button */}
              <div className="pt-4 border-t border-gray-50 flex justify-end">
                <button
                  type="submit"
                  id="submit-replacement-logs"
                  disabled={readOnlyPreview || isSubmitting || !approvedPeriodsReady}
                  className="w-full sm:w-auto px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-md transition-colors flex items-center justify-center gap-2 text-sm"
                >
                  <Save className="w-4 h-4" />
                  {readOnlyPreview ? "Write Dikunci di Shadow Mode" : isSubmitting ? "Menyimpan ke Supabase..." : officialDutySlots ? "Simpan Badal Tugas Resmi" : approvedWaitingSession ? "Simpan Badal Pengajuan Izin" : "Simpan Log Pengganti"}
                </button>
              </div>

            </div>
          )}

        </form>
      </div>

      {/* MODAL VERIFIKASI JADWAL GURU */}
      {verificationModalData && verificationModalData.isOpen && verificationScheduleDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl my-auto overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-4 sm:p-5 flex items-start justify-between gap-4 shrink-0">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-indigo-500/20 text-indigo-300 rounded-lg">
                    <Search className="w-5 h-5" />
                  </span>
                  <h3 className="text-lg font-bold text-white tracking-tight">
                    Verifikasi Jadwal Guru
                  </h3>
                </div>
                <p className="text-xs text-slate-300">
                  Visual Safety Check Jadwal Efektif Sebelum Penetapan Badal
                </p>
              </div>

              <button
                type="button"
                onClick={() => setVerificationModalData(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
                title="Tutup"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
              
              {/* Info Guru & Date Header */}
              <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-indigo-950 font-extrabold text-base">
                    <User className="w-4 h-4 text-indigo-600" />
                    <span>{verificationScheduleDetail.teacherName}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-medium text-indigo-700">
                    <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                    <span>{verificationScheduleDetail.formattedDateStr}</span>
                  </div>
                </div>

                <div className="bg-white border border-indigo-200/80 rounded-lg p-2.5 shadow-2xs text-left sm:text-right">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-indigo-500 block">Target Badal:</span>
                  <div className="text-xs font-bold text-slate-800">
                    <T>{"JP"}</T> {verificationScheduleDetail.targetJamKe === 0 ? "0 (Homeroom)" : verificationScheduleDetail.targetJamKe} • {verificationScheduleDetail.targetKelas}
                  </div>
                  <div className="text-[11px] font-semibold text-slate-600">
                    {verificationScheduleDetail.targetMapel}
                  </div>
                </div>
              </div>

              {/* Verification Status Banner */}
              {verificationScheduleDetail.isTargetCompanionOnly ? (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-3">
                  <UserCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <h4 className="text-sm font-bold text-blue-900 flex items-center gap-2">
                      ℹ️ TERSEDIA — GURU ADA JADWAL MENDAMPINGI
                    </h4>
                    <p className="text-xs text-blue-800">
                      Guru tidak mengajar utama pada JP {verificationScheduleDetail.targetJamKe === 0 ? "0 (Homeroom)" : verificationScheduleDetail.targetJamKe}, melainkan bertugas sebagai Guru Pendamping. Guru tetap dapat ditugaskan sebagai guru pengganti (inval).
                    </p>
                  </div>
                </div>
              ) : !verificationScheduleDetail.isTargetConflict ? (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <h4 className="text-sm font-bold text-emerald-900 flex items-center gap-2">
                      ✅ TERDETEKSI TERSEDIA
                    </h4>
                    <p className="text-xs text-emerald-800">
                      Guru tidak memiliki jadwal mengajar, jadwal insidental, maupun tugas badal pada JP {verificationScheduleDetail.targetJamKe === 0 ? "0 (Homeroom)" : verificationScheduleDetail.targetJamKe}.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-rose-900 flex items-center gap-2">
                      ⚠️ TERDETEKSI BENTROK
                    </h4>
                    <p className="text-xs text-rose-800">
                      Guru terdeteksi memiliki jadwal mengajar utama atau tugas badal pada JP {verificationScheduleDetail.targetJamKe === 0 ? "0 (Homeroom)" : verificationScheduleDetail.targetJamKe}.
                    </p>
                  </div>
                </div>
              )}

              {/* Discrepancy Warning Banner if needed */}
              {verificationScheduleDetail.hasDiscrepancy && (
                <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl flex items-start gap-2.5 text-amber-900">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <span className="font-bold text-amber-950 block">⚠️ PERBEDAAN DATA TERDETEKSI</span>
                    <p>
                      Sistem rekomendasi menandai guru sebagai tersedia, tetapi verifikasi jadwal efektif menunjukkan bentrok pada JP {verificationScheduleDetail.targetJamKe}. Silakan periksa data sebelum menetapkan guru.
                    </p>
                  </div>
                </div>
              )}

              {/* Full Day Schedule Breakdown */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between px-1">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    Jadwal Efektif Hari Tersebut (JP 0 – JP 6)
                  </h4>
                  <span className="text-[10px] text-slate-400 italic">
                    Target JP di-highlight khusus
                  </span>
                </div>

                <div className="space-y-2">
                  {verificationScheduleDetail.hourlyDetails.map(detail => {
                    const { hour, timeStr, isTarget, isOccupied, items, badalLogs, homeroomDuty, isAbsentAtPeriod } = detail;

                    return (
                      <div
                        key={hour}
                        className={`p-3.5 rounded-xl border transition-all ${
                          isTarget
                            ? "border-amber-400 bg-amber-50/70 shadow-2xs ring-2 ring-amber-300/60"
                            : isOccupied
                              ? "border-slate-200 bg-white"
                              : "border-slate-100 bg-slate-50/50"
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          {/* Left: Hour & Target Badge */}
                          <div className="flex items-center gap-2.5">
                            <div className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                              isTarget ? "bg-amber-500 text-white" : "bg-slate-200 text-slate-700"
                            }`}>
                              {hour === 0 ? "JP 0" : `JP ${hour}`}
                            </div>
                            {timeStr && (
                              <span className="text-xs font-semibold text-slate-500">
                                {timeStr}
                              </span>
                            )}
                            {isTarget && (
                              <span className="text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded-md flex items-center gap-1">
                                🎯 TARGET BADAL
                              </span>
                            )}
                          </div>

                          {/* Right: Status Badges */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {!isOccupied && (
                              <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-lg flex items-center gap-1">
                                <CheckCircle className="w-3.5 h-3.5" />
                                — Kosong —
                              </span>
                            )}

                            {items.map((it, idx) => (
                              <span
                                key={idx}
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-md border flex items-center gap-1 ${
                                  it.isIncidental
                                    ? "bg-amber-100 text-amber-900 border-amber-200"
                                    : "bg-blue-100 text-blue-900 border-blue-200"
                                }`}
                              >
                                {it.isIncidental ? "📍 Insidental" : "🔵 Reguler"}
                                {!it.isPrimary && " (Pendamping)"}
                              </span>
                            ))}

                            {badalLogs.map((bLog, idx) => (
                              <span
                                key={idx}
                                className="text-[10px] font-bold bg-rose-100 text-rose-900 border border-rose-200 px-2 py-0.5 rounded-md flex items-center gap-1"
                              >
                                🚨 Badal
                              </span>
                            ))}

                            {homeroomDuty && (
                              <span className="text-[10px] font-bold bg-blue-100 text-blue-900 border border-blue-200 px-2 py-0.5 rounded-md">
                                🔵 Reguler (Wali Kelas)
                              </span>
                            )}

                            {isAbsentAtPeriod && (
                              <span className="text-[10px] font-bold bg-slate-200 text-slate-800 border border-slate-300 px-2 py-0.5 rounded-md">
                                🛑 Sedang Izin
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Body: Schedule detail text if occupied */}
                        {isOccupied && (
                          <div className="mt-2 pt-2 border-t border-slate-100/80 text-xs space-y-1">
                            {isAbsentAtPeriod && (
                              <div className="text-slate-600 italic font-medium">
                                Guru tercatat izin pada JP ini.
                              </div>
                            )}

                            {items.map((it, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-slate-800 font-medium">
                                <span className="font-bold text-slate-900">{it.mapel}</span>
                                <span className="text-slate-400">•</span>
                                <span className="text-slate-700">Kelas {it.kelas}</span>
                                {it.keterangan && (
                                  <span className="text-[11px] text-slate-500 italic">({it.keterangan})</span>
                                )}
                              </div>
                            ))}

                            {badalLogs.map((bLog, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-rose-900 font-medium">
                                <span>Menggantikan <strong className="font-bold">{bLog.guru_izin}</strong></span>
                                <span className="text-rose-300">•</span>
                                <span>{bLog.mapel} (Kelas {bLog.kelas})</span>
                              </div>
                            ))}

                            {homeroomDuty && (
                              <div className="text-slate-800 font-medium">
                                {homeroomDuty.mapel}: <strong className="font-bold">{homeroomDuty.kelas}</strong>
                              </div>
                            )}
                          </div>
                        )}

                      </div>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setVerificationModalData(null);
                  onBack();
                }}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Buka Dashboard Guru Lengkap</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setVerificationModalData(null)}
                className="w-full sm:w-auto px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl shadow-2xs transition-colors cursor-pointer"
              >
                Tutup Modal Verifikasi
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
