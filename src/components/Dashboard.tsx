import React, { useState, useEffect, useRef, useMemo } from "react";
import { isGrade1Or2 } from "../domain/class";
import { 
  Teacher, ScheduleItem, LogIzinItem, ActivePage, JadwalInsidentalItem, MasterRuanganItem, KalenderAkademikItem,
  isSameDay, checkIsITBA, isITBACoreSubject, isClassMatch, checkIsNative, isAlQuranOrTahsin,
  renderTaskWithLinks, getRoomDisplayName, resolveRoomInfo, hasMeaningfulValue,
  getAcademicCalendarEvent, getAcademicCalendarEventsForDate, isDateInRange
} from "../types";
import { JAM_TIME_MAP } from "../constants/schedule";
import { teachingSessionSignature } from "../domain/schedule/teachingSession";
import { collectPriorityDuties, resolveDisplacedTeacher } from "../domain/schedule/dutyResolution";
import { getTeacherUnavailableStatus } from "../domain/dashboardTeacherUnavailable";
import type { SubstituteConstraint } from "../domain/substituteAvailability";
import { buildDashboardEffectiveDay, getDashboardClassSlotItems, selectOperationalTeacherSchedules, type DashboardEffectiveItem } from "../domain/schedule/dashboardEffectiveDay";
import { 
  Search, Calendar, CalendarDays, BookOpen, Clock, Users, UserPlus, GraduationCap,
  History, BarChart2, Shield, User, ChevronRight, X, Table, ChevronDown, Bell, Eye, EyeOff, AlertTriangle, ClipboardCheck, Pencil 
} from "lucide-react";
import { getSchoolTodayISO } from "../domain/date";
import { EducationReminder } from "./EducationReminder";
import { buildTaskRequestWhatsappMessage, findTeacherByName, whatsappDigits } from "../domain/whatsappTemplates";

import { T, useLanguage } from '../i18n/LanguageProvider';
import { localeIntl } from '../i18n/translations';


interface DashboardProps {
  teachers: Teacher[];
  schedules: ScheduleItem[];
  logs: LogIzinItem[];
  jadwalInsidental?: JadwalInsidentalItem[];
  masterRuangan?: MasterRuanganItem[];
  kalenderAkademik?: KalenderAkademikItem[];
  substituteConstraints?: SubstituteConstraint[];
  selectedTeacher: string;
  setSelectedTeacher: (name: string) => void;
  isAdmin: boolean;
  calendarAuthEpoch?: number;
  onEditSchedule?: (items: ScheduleItem[], options?: { initialDate?: string }) => void;
  setPage: (page: ActivePage) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  teachers,
  schedules,
  logs = [],
  jadwalInsidental = [],
  masterRuangan = [],
  kalenderAkademik = [],
  substituteConstraints = [],
  selectedTeacher,
  setSelectedTeacher,
  isAdmin,
  calendarAuthEpoch,
  onEditSchedule,
  setPage,
}) => {
  const {t, language}=useLanguage();
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedDay, setSelectedDay] = useState<"Senin" | "Selasa" | "Rabu" | "Kamis" | "Jumat">("Senin");
  const [dashboardType, setDashboardType] = useState<"guru" | "wali-kelas">("guru");
  const [showNotifications, setShowNotifications] = useState<boolean>(true);
  const [showCalendarDetails, setShowCalendarDetails] = useState<boolean>(true);
  const [selectedClass, setSelectedClass] = useState<string>(() => {
    return localStorage.getItem("dashboard_selected_class") || "";
  });
  const [taskModalData, setTaskModalData] = useState<{
    isOpen: boolean;
    kelas: string;
    mapel: string;
    guru_izin: string;
    tugas: string;
  } | null>(null);

  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Compute all unique classes from schedules
  const classesList = useMemo(() => {
    const unique = new Set<string>();
    schedules.forEach(s => {
      if (s.kelas) {
        unique.add(s.kelas.trim());
      }
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  }, [schedules]);

  // Sync selectedClass with localStorage when it changes
  useEffect(() => {
    if (selectedClass) {
      localStorage.setItem("dashboard_selected_class", selectedClass);
    }
  }, [selectedClass]);

  // Set default class if not set or if current selected class is invalid
  useEffect(() => {
    if (classesList.length > 0) {
      const saved = localStorage.getItem("dashboard_selected_class");
      if (saved && classesList.includes(saved)) {
        setSelectedClass(saved);
      } else if (!selectedClass || !classesList.includes(selectedClass)) {
        setSelectedClass(classesList[0]);
      }
    }
  }, [classesList]);

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  });

  // Automatically sync selectedDay when selectedDate changes
  useEffect(() => {
    if (!selectedDate) return;
    const d = new Date(selectedDate);
    if (isNaN(d.getTime())) return;
    const daysIndo = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    const dayName = daysIndo[d.getDay()];
    if (["Senin", "Selasa", "Rabu", "Kamis", "Jumat"].includes(dayName)) {
      setSelectedDay(dayName as any);
    } else {
      setSelectedDay("Senin"); // Default if weekend
    }
  }, [selectedDate]);

  // Helper to change both day and sync date to the current week's respective day
  const handleDaySelect = (dayName: "Senin" | "Selasa" | "Rabu" | "Kamis" | "Jumat") => {
    const daysIndo = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    const targetIdx = daysIndo.indexOf(dayName);
    const today = new Date();
    const currentIdx = today.getDay();
    const diff = targetIdx - currentIdx;
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + diff);
    
    const year = targetDate.getFullYear();
    const month = String(targetDate.getMonth() + 1).padStart(2, "0");
    const dVal = String(targetDate.getDate()).padStart(2, "0");
    
    setSelectedDate(`${year}-${month}-${dVal}`);
    setSelectedDay(dayName);
  };

  // Sync searchQuery with selectedTeacher on load
  useEffect(() => {
    setSearchQuery(selectedTeacher);
  }, [selectedTeacher]);

  // Click outside listener for suggestions dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Filter teachers for autocomplete
  const filteredTeachers = searchQuery.trim() === ""
    ? []
    : teachers.filter(t => 
        t.nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.mapel_utama.toLowerCase().includes(searchQuery.toLowerCase())
      );

  const handleSelectTeacher = (teacherName: string) => {
    setSelectedTeacher(teacherName);
    setSearchQuery(teacherName);
    setShowSuggestions(false);
  };

  const clearSelection = () => {
    setSelectedTeacher("");
    setSearchQuery("");
  };

  // Find current teacher details
  const currentTeacherObj = teachers.find(t => t.nama === selectedTeacher);
  const requestTaskViaWhatsapp = (item: { guru_izin: string; jam_ke: number; kelas: string; mapel: string; whatsapp_guru_izin?: string | null }) => {
    // Guest phone numbers are attached to a dated coverage slot, NEVER to the
    // public teacher directory. Old browser tabs cannot reuse expired contacts.
    if (!isAdmin && selectedDate < getSchoolTodayISO()) {
      window.alert("Kontak WhatsApp untuk penugasan yang sudah lewat tidak tersedia pada mode tamu.");
      return;
    }
    const absentTeacher = findTeacherByName(teachers, item.guru_izin);
    const phone = whatsappDigits(item.whatsapp_guru_izin || (isAdmin ? absentTeacher?.whatsapp_e164 : null));
    if (!phone) {
      window.alert(`Nomor WhatsApp ${item.guru_izin} tidak tersedia untuk penugasan pada tanggal ini.`);
      return;
    }
    const message = buildTaskRequestWhatsappMessage({
      recipientName: item.guru_izin,
      recipientTeacher: absentTeacher,
      senderName: selectedTeacher,
      dateLabel: formattedDateIndo || selectedDate,
      period: item.jam_ke,
      subject: item.mapel,
      className: item.kelas,
    });
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  };
  const isNativeTeacher = useMemo(() => checkIsNative(currentTeacherObj), [currentTeacherObj]);

  // Canonical dated schedule. The incidental owns class + date + JP; do not
  // union its teachers/subject with the master from an unrelated lesson.
  const processedMasterSchedulesForDay = useMemo(() => buildDashboardEffectiveDay({
    date: selectedDate,
    schedules,
    jadwalInsidental,
    logs,
    kalenderAkademik,
  }), [selectedDate, schedules, jadwalInsidental, logs, kalenderAkademik]);

  // A single dated duty projection drives both the displaced teacher's dashboard
  // AND the primary teacher's Team Teaching badges (badal + incidentals).
  const priorityDutiesForDay = useMemo(() => collectPriorityDuties({
    date: selectedDate, effective: processedMasterSchedulesForDay, logs,
  }), [selectedDate, processedMasterSchedulesForDay, logs]);

  // Formatted date string in Indonesian
  const formattedDateIndo = useMemo(() => {
    if (!selectedDate) return "";
    const parts = selectedDate.split("-").map(Number);
    if (parts.length !== 3) return "";
    const [year, month, day] = parts;
    if (!year || !month || !day) return "";
    const d = new Date(year, month - 1, day);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  }, [selectedDate]);

  // Display-only localized date. Leave the Indonesian label above unchanged for
  // existing WhatsApp templates and other business messages.
  const formattedDateForUI = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) return formattedDateIndo;
    const [year, month, day] = selectedDate.split('-').map(Number);
    const parsed = new Date(year, month - 1, day);
    return Number.isNaN(parsed.getTime()) ? formattedDateIndo : parsed.toLocaleDateString(localeIntl(language), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }, [selectedDate, formattedDateIndo, language]);

  // Compute effective daily class schedule for selectedClass on selectedDate
  const classTimetable = useMemo(() => {
    if (!selectedClass) return [];

    const periods = [1, 2, 3, 4, 5, 6];

    // All displayed rows already come from the dated effective engine.
    // In particular, a combined AE + MQ incidental replaces each class's
    // original Fisika/Ekonomi slot, rather than appearing beside it.
    const classSchedulesForDay = processedMasterSchedulesForDay.filter(s =>
      s.kelas && isClassMatch(s.kelas, selectedClass)
    );

    // 3. Log_Izin items matching selectedClass on selectedDate
    const classLogsForDate = (logs || []).filter(log =>
      log.tanggal === selectedDate && isClassMatch(log.kelas, selectedClass)
    );

    return periods.map(jamKe => {
      const periodMasterItems = getDashboardClassSlotItems(classSchedulesForDay, selectedClass, jamKe);
      // Do not show leave records for teachers replaced by an explicit new team.
      const explicitTeacherReplacement = periodMasterItems.some(item => item.teacherTeamReplaced);
      const slotTeachers = new Set(periodMasterItems.flatMap(item => item.scheduledTeachers.map(name => name.trim().toLowerCase())));
      const periodLogs = classLogsForDate.filter(log =>
        Number(log.jam_ke) === Number(jamKe) &&
        (!explicitTeacherReplacement || slotTeachers.has(String(log.guru_izin || "").trim().toLowerCase()))
      );

      const academicEvent = periodMasterItems.some((item) => item.isActive)
        ? null
        : getAcademicCalendarEvent(selectedDate, selectedClass, Number(jamKe), kalenderAkademik);

      const hasMaster = periodMasterItems.length > 0;
      const hasIncidental = periodMasterItems.some(item => item.isOverridden);
      const hasLogs = periodLogs.length > 0;

      if (!hasMaster && !hasIncidental && !hasLogs && !academicEvent) {
        return {
          jam_ke: jamKe,
          isEmpty: true,
          isAcademicEvent: false,
          academicEvent: null,
          mapel: "Jam Kosong / Mandiri / Istirahat",
          ruangan: "",
          keterangan_khusus: "",
          isIncidental: false,
          keterangan_insidental: "",
          alasan_insidental: "",
          tipe_insidental: "",
          teachersStatus: [] as Array<{
            name: string;
            isIzin: boolean;
            isReplacement: boolean;
            replacingWho?: string;
            alasanIzin?: string;
          }>,
          hasIzin: false,
          hasMissingReplacement: false,
          periodLogs: [] as LogIzinItem[],
          items: [] as ScheduleItem[]
        };
      }

      // Mapel
      let mapel = "";
      if (academicEvent) {
        mapel = academicEvent.nama_kegiatan;
      } else {
        mapel = [...new Set(periodMasterItems.map(i => i.mapel))].filter(Boolean).join(", ");
        if (!mapel && hasLogs) {
          mapel = [...new Set(periodLogs.map(l => l.mapel))].filter(Boolean).join(", ");
        }
      }

      // Ruangan & Keterangan Khusus
      let ruangan = [...new Set(periodMasterItems.map(i => i.ruangan || ""))].filter(Boolean).join(", ");

      let keterangan_khusus = [...new Set(periodMasterItems.map(i => i.keterangan_khusus || ""))].filter(Boolean).join(", ");

      const isIncidental = hasIncidental;
      const keterangan_insidental = [...new Set(periodMasterItems.map(i => i.keterangan_insidental || ""))].filter(Boolean).join(", ");
      const alasan_insidental = [...new Set(periodMasterItems.map(i => i.alasan_insidental || ""))].filter(Boolean).join(", ");
      const tipe_insidental = [...new Set(periodMasterItems.map(i => i.tipe_insidental || ""))].filter(Boolean).join(", ");

      // Collect original teachers list
      const rawOriginalTeachers: string[] = [];
      periodMasterItems.forEach(i => {
        [i.guru1, i.guru2, i.guru3, i.guru4, i.guru5, i.guru6].forEach(g => {
          if (g && g.trim() && !rawOriginalTeachers.some(t => t.toLowerCase() === g.trim().toLowerCase())) {
            rawOriginalTeachers.push(g.trim());
          }
        });
      });

      interface TeacherStatus {
        name: string;
        isIzin: boolean;
        isReplacement: boolean;
        replacingWho?: string;
        alasanIzin?: string;
      }

      const teachersStatus: TeacherStatus[] = [];
      let hasIzin = false;
      let hasMissingReplacement = false;

      // 1. Check original teachers against period logs
      rawOriginalTeachers.forEach(origTeacher => {
        const matchingLog = periodLogs.find(l =>
          l.guru_izin && l.guru_izin.trim().toLowerCase() === origTeacher.toLowerCase()
        );

        if (matchingLog) {
          hasIzin = true;
          teachersStatus.push({
            name: origTeacher,
            isIzin: true,
            isReplacement: false,
            alasanIzin: matchingLog.alasan
          });

          if (matchingLog.guru_pengganti && matchingLog.guru_pengganti.trim()) {
            const replName = matchingLog.guru_pengganti.trim();
            if (!teachersStatus.some(ts => ts.name.toLowerCase() === replName.toLowerCase() && ts.isReplacement)) {
              teachersStatus.push({
                name: replName,
                isIzin: false,
                isReplacement: true,
                replacingWho: origTeacher
              });
            }
          } else {
            hasMissingReplacement = true;
          }
        } else {
          teachersStatus.push({
            name: origTeacher,
            isIzin: false,
            isReplacement: false
          });
        }
      });

      // 2. Check period logs for any guru_izin not originally in master schedule
      periodLogs.forEach(log => {
        if (log.guru_izin && !rawOriginalTeachers.some(t => t.toLowerCase() === log.guru_izin.trim().toLowerCase())) {
          hasIzin = true;
          if (!teachersStatus.some(ts => ts.name.toLowerCase() === log.guru_izin.trim().toLowerCase())) {
            teachersStatus.push({
              name: log.guru_izin.trim(),
              isIzin: true,
              isReplacement: false,
              alasanIzin: log.alasan
            });
          }

          if (log.guru_pengganti && log.guru_pengganti.trim()) {
            const replName = log.guru_pengganti.trim();
            if (!teachersStatus.some(ts => ts.name.toLowerCase() === replName.toLowerCase() && ts.isReplacement)) {
              teachersStatus.push({
                name: replName,
                isIzin: false,
                isReplacement: true,
                replacingWho: log.guru_izin.trim()
              });
            }
          } else {
            hasMissingReplacement = true;
          }
        }
      });

      return {
        jam_ke: jamKe,
        isEmpty: false,
        isAcademicEvent: Boolean(academicEvent),
        academicEvent,
        mapel,
        ruangan,
        keterangan_khusus,
        isIncidental,
        keterangan_insidental,
        alasan_insidental,
        tipe_insidental,
        teachersStatus,
        hasIzin,
        hasMissingReplacement,
        periodLogs,
        items: periodMasterItems
      };
    });
  }, [selectedClass, processedMasterSchedulesForDay, logs, selectedDate, kalenderAkademik]);

  // 3. Filter regular schedules for selected teacher
  const teacherRegularSchedules = useMemo(() => {
    if (!selectedTeacher) return [];

    const sTeacherLower = selectedTeacher.trim().toLowerCase();

    let filtered = processedMasterSchedulesForDay.filter(s => {
      const gurus = [s.guru1, s.guru2, s.guru3, s.guru4, s.guru5, s.guru6];
      return gurus.some(g => g && g.trim().toLowerCase() === sTeacherLower)
        || s.absentTeachers.some((name) => name.trim().toLowerCase() === sTeacherLower);
    });

    // Layer 2: Native Speaker / Syaikh Filtering
    if (isNativeTeacher) {
      filtered = filtered.filter(s => {
        const ketKhusus = (s.keterangan_khusus || "").toLowerCase();
        const isRoutineNative = ketKhusus.includes("native");
        const isIncidentalNative = s.isOverridden === true; // guru1-6 is already checked in filtered
        return isRoutineNative || isIncidentalNative || s.absentTeachers.some((name) => name.trim().toLowerCase() === sTeacherLower);
      });
    }

    return filtered.sort((a, b) => Number(a.jam_ke) - Number(b.jam_ke));
  }, [processedMasterSchedulesForDay, selectedTeacher, isNativeTeacher]);

  // Group regular schedule items by jam_ke
  const groupedSchedules = useMemo(() => {
    // Never merge unrelated duties merely because they share a JP. A teacher
    // can be present in a normal lesson AND an incidental on that JP.
    const groups: Record<string, typeof teacherRegularSchedules> = {};
    selectOperationalTeacherSchedules(teacherRegularSchedules as DashboardEffectiveItem[]).forEach(item => {
      const sessionKey = teachingSessionSignature(item);
      const groupKey = `${Number(item.jam_ke)}::${sessionKey}`;
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(item);
    });

    return Object.keys(groups)
      .sort((a, b) => Number(a.split('::')[0]) - Number(b.split('::')[0]) || a.localeCompare(b))
      .map(groupKey => {
        const items = groups[groupKey];
        const jamKe = Number(items[0].jam_ke);
        const first = items[0];

        const mapel = [...new Set(items.map(i => i.mapel))].filter(Boolean).join(", ");
        const kelas = [...new Set(items.map(i => i.kelas))].filter(Boolean).join(", ");
        const ruangan = [...new Set(items.map(i => i.ruangan || "").filter(Boolean))].join(", ");
        const keterangan_khusus = [...new Set(items.map(i => i.keterangan_khusus || "").filter(Boolean))].join(", ");
        const keterangan_insidental = [...new Set(items.map(i => i.keterangan_insidental || "").filter(Boolean))].join(", ");
        const alasan_insidental = [...new Set(items.map(i => i.alasan_insidental || "").filter(Boolean))].join(", ");
        const tipe_insidental = [...new Set(items.map(i => i.tipe_insidental || "").filter(Boolean))].join(", ");
        const isOverridden = items.some(i => i.isOverridden);

        const isIya = items.some(i => {
          const kg = String(i.kelasgabung || "").trim().toLowerCase();
          return kg === "iya" || kg === "ya";
        });

        return {
          id: `merged-${jamKe}-${first.id}`,
          jam_ke: jamKe,
          mulai: first.mulai,
          selesai: first.selesai,
          mapel,
          kelas,
          ruangan,
          keterangan_khusus,
          keterangan_insidental,
          alasan_insidental,
          tipe_insidental,
          isOverridden,
          kelasgabung: isIya ? "Iya" : "Tidak",
          isConflict: items.length > 1,
          isInval: false,
          guru_izin: "",
          alasan: "",
          tugas: "",
          items
        };
      });
  }, [teacherRegularSchedules]);

  // Filter active logs (Tugas Inval) for the selected teacher on this date
  const activeInvalLogs = useMemo(() => {
    if (!selectedTeacher || !logs) return [];
    return logs.filter(log => {
      if (log.tanggal !== selectedDate || !log.guru_pengganti ||
          log.guru_pengganti.trim().toLowerCase() !== selectedTeacher.trim().toLowerCase()) return false;
      const matchedSlots = processedMasterSchedulesForDay.filter(s =>
        Number(s.jam_ke) === Number(log.jam_ke) && isClassMatch(s.kelas, log.kelas)
      );
      // A dated teacher-team replacement cancels earlier leave/badal assignments
      // for the displaced master teacher. Keep the log in history, not in today’s lesson.
      return !matchedSlots.some(s => s.teacherTeamReplaced) ||
        matchedSlots.some(s => s.scheduledTeachers.some(name =>
          name.trim().toLowerCase() === String(log.guru_izin || "").trim().toLowerCase()
        ));
    });
  }, [logs, selectedDate, selectedTeacher, processedMasterSchedulesForDay]);

  const invalSchedules = useMemo(() => {
    // Coverage is persisted per canonical class, but the dashboard must render
    // one operator-facing card per inferred teaching session. This mirrors the
    // V3.12.1 combined-session engine instead of leaking duplicate class rows.
    const buckets = new Map<string, Array<{ log: LogIzinItem; matchingSched: any }>>();

    activeInvalLogs.forEach((log) => {
      const matchingSched = processedMasterSchedulesForDay.find((s) =>
        s.kelas && s.kelas.trim().toLowerCase() === log.kelas.trim().toLowerCase() &&
        Number(s.jam_ke) === Number(log.jam_ke)
      );
      const sessionKey = matchingSched
        ? `${teachingSessionSignature(matchingSched)}|${String(log.guru_izin || "").trim().toLowerCase()}`
        : [`fallback`, log.tanggal, Number(log.jam_ke), String(log.mapel || "").trim().toLowerCase(), String(log.guru_izin || "").trim().toLowerCase()].join("|");
      const bucket = buckets.get(sessionKey) || [];
      bucket.push({ log, matchingSched });
      buckets.set(sessionKey, bucket);
    });

    return [...buckets.entries()].map(([sessionKey, rows]) => {
      const logsInSession = rows.map((row) => row.log);
      const schedulesInSession = rows.map((row) => row.matchingSched).filter(Boolean);
      const firstLog = logsInSession[0];
      const firstSched = schedulesInSession[0];
      const kelas = [...new Set(logsInSession.map((log) => log.kelas).filter(Boolean))].join(" + ");
      const mapel = [...new Set(logsInSession.map((log) => log.mapel || firstSched?.mapel || "").filter(Boolean))].join(" + ");
      const ruangan = [...new Set(schedulesInSession.map((item) => item.ruangan || "").filter(Boolean))].join(" + ");
      const taskValues = [...new Set(logsInSession.map((log) => String(log.tugas || "").trim()).filter(Boolean))];
      const explicitCombined = schedulesInSession.some((item) => {
        const mode = String(item.kelasgabung || "").trim().toLowerCase();
        return mode === "ya" || mode === "iya";
      });

      return {
        id: `inval-session-${sessionKey}`,
        jam_ke: Number(firstLog.jam_ke),
        mulai: firstSched?.mulai || JAM_TIME_MAP[firstLog.jam_ke]?.split(" - ")[0] || "",
        selesai: firstSched?.selesai || JAM_TIME_MAP[firstLog.jam_ke]?.split(" - ")[1] || "",
        mapel,
        kelas,
        ruangan,
        keterangan_khusus: schedulesInSession.map((item) => item.keterangan_khusus || "").filter(Boolean).join(" + "),
        keterangan_insidental: schedulesInSession.map((item) => item.keterangan_insidental || "").filter(Boolean).join(" + "),
        alasan_insidental: schedulesInSession.map((item) => item.alasan_insidental || "").filter(Boolean).join(" + "),
        tipe_insidental: schedulesInSession.map((item) => item.tipe_insidental || "").filter(Boolean).join(" + "),
        isOverridden: false,
        kelasgabung: logsInSession.length > 1 || explicitCombined ? "Iya" : (firstSched?.kelasgabung || "Tidak"),
        isConflict: false,
        isInval: true,
        guru_izin: firstLog.guru_izin,
        whatsapp_guru_izin: logsInSession.find((log) => log.whatsapp_guru_izin)?.whatsapp_guru_izin || null,
        alasan: firstLog.alasan,
        tugas: taskValues.join("\n"),
        items: schedulesInSession
      };
    }).sort((a, b) => a.jam_ke - b.jam_ke || a.kelas.localeCompare(b.kelas, "id-ID", { numeric: true, sensitivity: "base" }));
  }, [activeInvalLogs, processedMasterSchedulesForDay]);

  // Merge regular schedules and inval schedules with conflict handling (Inval vs Reguler, Kalender Akademik)
  const mergedAllSchedules = useMemo(() => {
    const invalJamSet = new Set(invalSchedules.map(inv => inv.jam_ke));

    const regularWithConflictFlags = groupedSchedules.map(reg => {
      const hasInvalConflict = invalJamSet.has(reg.jam_ke);
      const displacementStatuses = reg.items.map((slot) => resolveDisplacedTeacher({
        original: slot, teacherName: selectedTeacher, teacher: currentTeacherObj,
        priorityDuties: priorityDutiesForDay,
      }));
      const transferredAssistant = displacementStatuses.length > 0 && displacementStatuses.every(
        status => status?.kind === 'TRANSFERRED_ASSISTANT');
      const dutyConflict = displacementStatuses.some(status =>
        status?.kind === 'PRIMARY_CONFLICT' || status?.kind === 'MULTIPLE_HIGH_PRIORITY');
      const transferDestination = displacementStatuses.find(status => status)?.destination;
      // Calendar cancellation belongs to the effective rows, not any other
      // class represented in the same teacher's JP group.
      const calEvent = reg.items.find((row) => row.isSuppressedByAcademicCalendar)?.academicEvent
        || null;
      return {
        ...reg,
        teacherUnavailable: getTeacherUnavailableStatus({
          teacherId: currentTeacherObj?.id,
          teacherName: selectedTeacher,
          date: selectedDate,
          period: Number(reg.jam_ke),
          constraints: substituteConstraints,
          logs,
        }),
        // A primary teacher with conflicting badal is NOT silently cancelled.
        isCancelledForInval: transferredAssistant || (hasInvalConflict && !dutyConflict && displacementStatuses.every(status => status === null)),
        transferDestination: transferredAssistant ? transferDestination : undefined,
        dutyConflict,
        isCancelledForKalender: Boolean(calEvent),
        academicEvent: calEvent
      };
    });

    const invalWithFlags = invalSchedules.map(inv => {
      const calEvent = getAcademicCalendarEvent(selectedDate, inv.kelas, inv.jam_ke, kalenderAkademik);
      return {
        ...inv,
        teacherUnavailable: getTeacherUnavailableStatus({
          teacherId: currentTeacherObj?.id,
          teacherName: selectedTeacher,
          date: selectedDate,
          period: Number(inv.jam_ke),
          constraints: substituteConstraints,
          logs,
        }),
        isCancelledForInval: false,
        transferDestination: undefined,
        dutyConflict: false,
        isCancelledForKalender: Boolean(calEvent),
        academicEvent: calEvent
      };
    });

    const combined = [...regularWithConflictFlags, ...invalWithFlags];

    return combined.sort((a, b) => {
      if (a.jam_ke !== b.jam_ke) {
        return a.jam_ke - b.jam_ke;
      }
      // If same jam_ke, show regular schedule (dibatalkan) first, then inval schedule
      if (a.isInval !== b.isInval) {
        return a.isInval ? 1 : -1;
      }
      return 0;
    });
  }, [groupedSchedules, invalSchedules, selectedDate, kalenderAkademik, currentTeacherObj, selectedTeacher, substituteConstraints, logs, priorityDutiesForDay]);

  // Extract Wali kelas class name
  const waliClass = useMemo(() => {
    if (!currentTeacherObj) return null;
    const tugas = (currentTeacherObj.tugas_tambahan || "").toLowerCase().trim();
    const ket = (currentTeacherObj.keterangan || "").trim();
    const wk = (currentTeacherObj.wali_kelas || "").trim();

    if (tugas.includes("wali") || wk) {
      if (ket && ket !== "-" && wk && !ket.toLowerCase().includes(wk.toLowerCase())) {
        return `${wk}, ${ket}`;
      }
      return wk || (ket !== "-" ? ket : null);
    }
    return wk || null;
  }, [currentTeacherObj]);

  // Filter logs for Wali kelas notification
  const waliLogsToday = useMemo(() => {
    if (!waliClass || !logs) return [];
    return logs
      .filter(log => 
        log.tanggal === selectedDate && 
        isClassMatch(log.kelas, waliClass)
      )
      .sort((a, b) => Number(a.jam_ke || 0) - Number(b.jam_ke || 0));
  }, [logs, selectedDate, waliClass]);

  // Extract Pendamping kelas class name
  const pendampingClass = useMemo(() => {
    if (!currentTeacherObj) return null;
    const tugas = (currentTeacherObj.tugas_tambahan || "").toLowerCase().trim();
    const ket = (currentTeacherObj.keterangan || "").trim();
    const pk = (currentTeacherObj.pendamping_kelas || "").trim();

    if (tugas.includes("pendamping") || pk) {
      if (ket && ket !== "-" && pk && !ket.toLowerCase().includes(pk.toLowerCase())) {
        return `${pk}, ${ket}`;
      }
      return pk || (ket !== "-" ? ket : null);
    }
    return pk || null;
  }, [currentTeacherObj]);

  // Filter logs for Pendamping kelas notification
  const pendampingLogsToday = useMemo(() => {
    if (!pendampingClass || !logs) return [];
    return logs
      .filter(log => 
        log.tanggal === selectedDate && 
        isClassMatch(log.kelas, pendampingClass)
      )
      .sort((a, b) => Number(a.jam_ke || 0) - Number(b.jam_ke || 0));
  }, [logs, selectedDate, pendampingClass]);

  // Merged active academic calendar events for selectedDate (combines duplicate events with multiple classes into one cell)
  const mergedCalendarEventsToday = useMemo(() => {
    if (!kalenderAkademik || kalenderAkademik.length === 0 || !selectedDate) return [];
    
    // Filter active items for today
    const rawActive = kalenderAkademik.filter(item => {
      const status = (item.status || "Aktif").trim().toLowerCase();
      if (status !== "" && status !== "aktif") return false;
      return isDateInRange(selectedDate, item.tanggal_mulai, item.tanggal_selesai);
    });

    // Group items having identical activities (same nama_kegiatan, tipe, jp_mulai, jp_selesai, keterangan, cakupan)
    const groupsMap = new Map<string, {
      key: string;
      nama_kegiatan: string;
      tipe: string;
      cakupan: string;
      jp_mulai: number | null | undefined;
      jp_selesai: number | null | undefined;
      keterangan: string;
      classesSet: Set<string>;
    }>();

    rawActive.forEach(item => {
      const nama = (item.nama_kegiatan || "").trim();
      const tipe = (item.tipe || "").trim();
      const jpM = item.jp_mulai !== undefined && item.jp_mulai !== null && !isNaN(Number(item.jp_mulai)) ? Number(item.jp_mulai) : null;
      const jpS = item.jp_selesai !== undefined && item.jp_selesai !== null && !isNaN(Number(item.jp_selesai)) ? Number(item.jp_selesai) : null;
      const ket = (item.keterangan || "").trim();
      const cakupan = (item.cakupan || (item.kelas ? "Kelas" : "Semua")).trim();

      const groupKey = `${nama.toLowerCase()}|${tipe.toLowerCase()}|${jpM ?? "all"}|${jpS ?? "all"}|${ket.toLowerCase()}|${cakupan.toLowerCase()}`;

      if (!groupsMap.has(groupKey)) {
        groupsMap.set(groupKey, {
          key: groupKey,
          nama_kegiatan: nama,
          tipe,
          cakupan,
          jp_mulai: jpM,
          jp_selesai: jpS,
          keterangan: ket,
          classesSet: new Set<string>()
        });
      }

      const grp = groupsMap.get(groupKey)!;
      if (item.kelas) {
        // Support multiple comma or slash separated classes in a single row or across rows
        item.kelas.split(/[,;\n]+/).map(c => c.trim()).filter(Boolean).forEach(c => grp.classesSet.add(c));
      }
    });

    return Array.from(groupsMap.values()).map(grp => {
      const sortedClasses = Array.from(grp.classesSet).sort((a, b) => 
        a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
      );
      return {
        ...grp,
        kelasList: sortedClasses
      };
    });
  }, [kalenderAkademik, selectedDate]);

  return (
    <div className="space-y-6">
      {/* V3.16 independent 14-day agenda. Collapsed by default, never touches the timetable. */}
      <EducationReminder key={`education-reminder-${calendarAuthEpoch || 0}`}
        teachers={teachers} schedules={schedules} selectedTeacher={selectedTeacher}
        today={getSchoolTodayISO()} authEpoch={calendarAuthEpoch}
        onOpenCalendar={() => setPage("education-calendar")} />
      {/* Active Academic Calendar Notice Banner */}
      {mergedCalendarEventsToday.length > 0 && (
        <div className="bg-emerald-50/80 border border-emerald-300 rounded-2xl p-4 shadow-xs space-y-3 transition-all">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5 text-emerald-950 font-extrabold text-sm">
              <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow-xs shrink-0">
                <CalendarDays className="w-4 h-4" />
              </div>
              <div>
                <span className="text-emerald-900 font-extrabold">Informasi Kalender Akademik ({formattedDateForUI})</span>
                <p className="text-xs text-emerald-700 font-medium">
                  Terdapat {mergedCalendarEventsToday.length} agenda/kegiatan pada tanggal ini
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowCalendarDetails(!showCalendarDetails)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-emerald-100/50 text-emerald-900 border border-emerald-300 font-bold text-xs shadow-2xs transition-colors cursor-pointer"
              title={showCalendarDetails ? "Sembunyikan detail agenda" : "Tampilkan detail agenda"}
            >
              {showCalendarDetails ? (
                <>
                  <EyeOff className="w-3.5 h-3.5 text-emerald-700" />
                  <span><T>{"Sembunyikan"}</T></span>
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5 text-emerald-700" />
                  <span><T>{"Tampilkan Detail"}</T></span>
                </>
              )}
            </button>
          </div>

          {showCalendarDetails && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              {mergedCalendarEventsToday.map((ev) => (
                <div key={ev.key} className="bg-white/95 border border-emerald-200 p-3 rounded-xl text-xs space-y-1.5 shadow-2xs">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-extrabold text-slate-900 text-[13px] leading-snug">{ev.nama_kegiatan}</span>
                    <span className="bg-emerald-100 text-emerald-900 text-[10px] font-black px-2 py-0.5 rounded uppercase shrink-0 border border-emerald-200">
                      {ev.tipe}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600 font-medium leading-relaxed">
                    <span>Cakupan: </span>
                    <strong className="text-slate-800">
                      {ev.cakupan || (ev.kelasList.length > 0 ? "Kelas" : "Semua")}
                    </strong>
                    {ev.kelasList.length > 0 && (
                      <span className="text-slate-700 font-medium"> • {ev.kelasList.join(", ")}</span>
                    )}
                    {ev.jp_mulai !== null && ev.jp_mulai !== undefined
                      ? ` • Jam Ke-${ev.jp_mulai} s.d. ${ev.jp_selesai}`
                      : " • Seluruh Hari"}
                  </div>
                  {ev.keterangan && (
                    <p className="text-[11px] text-emerald-900/90 italic bg-emerald-50/60 p-1.5 rounded-lg border border-emerald-100">
                      {ev.keterangan}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Dashboard Sub-Tabs */}
      <div className="bg-white rounded-2xl border border-slate-200 p-2 shadow-xs flex gap-2">
        <button
          id="tab-dashboard-guru"
          onClick={() => setDashboardType("guru")}
          className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
            dashboardType === "guru"
              ? "bg-blue-600 text-white shadow-sm font-extrabold"
              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          }`}
        >
          <User className="w-5 h-5" />
          <span><T>{"Dashboard Guru"}</T></span>
        </button>
        <button
          id="tab-dashboard-wali-kelas"
          onClick={() => setDashboardType("wali-kelas")}
          className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
            dashboardType === "wali-kelas"
              ? "bg-blue-600 text-white shadow-sm font-extrabold"
              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          }`}
        >
          <Users className="w-5 h-5" />
          <span>Dashboard Wali Kelas</span>
        </button>
      </div>

      {/* Alert Banner Container for Wali Kelas & Pendamping Kelas with Hide/Show Toggle */}
      {selectedTeacher && (waliLogsToday.length > 0 || pendampingLogsToday.length > 0) && (
        <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-4 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold shadow-xs shrink-0 mt-0.5 sm:mt-0">
                <Bell className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-extrabold text-amber-950 text-sm flex items-center gap-2 flex-wrap">
                  <span><T>{"Warning Notifikasi Guru Ganti Hari Ini"}</T></span>
                  <span className="bg-amber-200 text-amber-900 text-xs px-2 py-0.5 rounded-full font-black">
                    {waliLogsToday.length + pendampingLogsToday.length} <T>{"Informasi"}</T>
                  </span>
                </h3>
                <p className="text-xs text-amber-800/90 font-medium mt-0.5">
                  Pengingat guru pengganti di kelas wali / dampingan Anda ({waliClass || pendampingClass})
                </p>
              </div>
            </div>

            <button
              id="btn-toggle-notifications"
              onClick={() => setShowNotifications(!showNotifications)}
              className="w-full sm:w-auto text-xs font-extrabold text-amber-950 bg-white hover:bg-amber-100 border border-amber-300 px-3 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs shrink-0"
            >
              {showNotifications ? (
                <>
                  <EyeOff className="w-4 h-4 text-amber-700" />
                  <span><T>{"Sembunyikan Warning"}</T></span>
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4 text-amber-700" />
                  <span>Tampilkan Warning ({waliLogsToday.length + pendampingLogsToday.length})</span>
                </>
              )}
            </button>
          </div>

          {showNotifications && (
            <div className="space-y-3 pt-2 border-t border-amber-200/60">
              {/* Alert for Wali Kelas */}
              {waliClass && waliLogsToday.length > 0 && (
                <div className="bg-white border-l-4 border-amber-500 rounded-xl p-3.5 shadow-2xs">
                  <div className="flex items-center gap-2 text-amber-900 font-extrabold text-xs mb-2.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span className="uppercase tracking-wider">INFO KELAS WALI ({waliClass}):</span>
                  </div>
                  <div className="text-slate-800 text-xs space-y-2">
                    {waliLogsToday.map((log) => (
                      <div key={log.id} className="flex items-start gap-2 bg-amber-50/80 p-2.5 rounded-lg border border-amber-100">
                        <span className="leading-relaxed">
                          🔔 Kelas <strong>{log.kelas}</strong> (Jam ke-{log.jam_ke} - <em>{log.mapel}</em>): Guru utama <strong>{log.guru_izin}</strong> izin. Digantikan oleh <strong className="text-amber-950 underline decoration-amber-400 font-extrabold">{log.guru_pengganti || "Belum Ditentukan"}</strong>.
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Alert for Pendamping Kelas */}
              {pendampingClass && pendampingLogsToday.length > 0 && (
                <div className="bg-white border-l-4 border-indigo-500 rounded-xl p-3.5 shadow-2xs">
                  <div className="flex items-center gap-2 text-indigo-950 font-extrabold text-xs mb-2.5">
                    <Bell className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span className="uppercase tracking-wider">INFO KELAS DAMPINGAN ({pendampingClass}):</span>
                  </div>
                  <div className="text-slate-800 text-xs space-y-2">
                    {pendampingLogsToday.map((log) => (
                      <div key={log.id} className="flex items-start gap-2 bg-indigo-50/80 p-2.5 rounded-lg border border-indigo-100">
                        <span className="leading-relaxed">
                          🔔 Kelas <strong>{log.kelas}</strong> (Jam ke-{log.jam_ke} - <em>{log.mapel}</em>): Guru utama <strong>{log.guru_izin}</strong> izin. Digantikan oleh <strong className="text-indigo-950 underline decoration-indigo-400 font-extrabold">{log.guru_pengganti || "Belum Ditentukan"}</strong>.
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {dashboardType === "guru" ? (
        <>
          {/* Teacher Search Section */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <Search className="w-5 h-5 text-blue-600" />
              Pencarian Guru
            </h2>
            <p className="text-sm text-slate-500 mb-4">
              Masukkan nama guru untuk menampilkan jadwal mengajar hari ini, jadwal lengkap mingguan, jam kosong, dan list mata pelajaran.
            </p>
            
            <div className="relative" ref={suggestionsRef}>
              <div className="relative">
                <input
                  id="teacher-search-input"
                  type="text"
                  className="w-full pl-11 pr-10 py-3.5 bg-slate-50 hover:bg-slate-100/75 focus:bg-white text-slate-800 border border-slate-200 focus:border-blue-500 rounded-xl outline-none transition-all font-medium text-base shadow-sm"
                  placeholder="Cari Nama Guru atau Mata Pelajaran..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                />
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <Search className="w-5 h-5" />
                </div>
                {selectedTeacher && (
                  <button
                    id="clear-search-btn"
                    onClick={clearSelection}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200 transition-colors"
                    title="Hapus pilihan"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Autocomplete Suggestions */}
              {showSuggestions && filteredTeachers.length > 0 && (
                <div className="absolute z-30 left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl max-h-64 overflow-y-auto divide-y divide-slate-100">
                  {filteredTeachers.map((teacher) => (
                    <button
                      key={teacher.nama}
                      id={`suggest-${teacher.nama.replace(/\s+/g, '-').toLowerCase()}`}
                      onClick={() => handleSelectTeacher(teacher.nama)}
                      className="w-full text-left px-5 py-3 hover:bg-blue-50/50 flex flex-col transition-colors group"
                    >
                      <span className="font-semibold text-slate-700 group-hover:text-blue-600 transition-colors">
                        {teacher.nama}
                      </span>
                      <span className="text-xs text-slate-400 mt-0.5">
                        Mapel Utama: {teacher.mapel_utama} | Rumpun: {teacher.rumpun} | {teacher.jenjang}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {showSuggestions && searchQuery.trim() !== "" && filteredTeachers.length === 0 && (
                <div className="absolute z-30 left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl p-5 text-center text-slate-500 text-sm">
                  Tidak menemukan guru dengan kata kunci "{searchQuery}"
                </div>
              )}
            </div>

            {/* Selected Teacher Status Card */}
            {currentTeacherObj && (
              <div className="mt-4 p-4 bg-blue-50/40 border border-blue-100/50 rounded-xl flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold">
                    {currentTeacherObj.nama[0]}
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800">{currentTeacherObj.nama}</h3>
                    <p className="text-xs text-slate-500">
                      {currentTeacherObj.mapel_utama} • {currentTeacherObj.jenjang} 
                      {currentTeacherObj.wali_kelas ? ` • Wali Kelas ${currentTeacherObj.wali_kelas}` : ""}
                      {currentTeacherObj.pendamping_kelas ? ` • Pendamping Kelas ${currentTeacherObj.pendamping_kelas}` : ""}
                      {currentTeacherObj.is_manajemen ? " • Tim Manajemen" : ""}
                    </p>
                  </div>
                </div>
                <div className="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded-full font-medium">
                  <T>{"Guru Terpilih"}</T>
                </div>
              </div>
            )}
          </div>

          {/* Today's Schedule (Timetable vertikal) */}
          {selectedTeacher ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 mb-6">
                <div>
                  <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-blue-600" />
                    <T>{"Jadwal Hari Ini"}</T>
                  </h2>
                  <p className="text-sm text-slate-500">
                    Menampilkan jadwal mengajar hari <span className="font-semibold text-blue-600">{t(selectedDay)}</span>
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
                  {/* Date Picker */}
                  <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
                    <span className="text-xs font-bold text-slate-500 uppercase"><T>{"Tanggal:"}</T></span>
                    <input
                      id="dashboard-date-picker"
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer"
                    />
                  </div>

                  {/* Day Switcher */}
                  <div className="flex flex-wrap gap-1 bg-slate-100 p-1 rounded-xl flex-1 sm:flex-initial">
                    {(["Senin", "Selasa", "Rabu", "Kamis", "Jumat"] as const).map((day) => (
                      <button
                        key={day}
                        id={`day-switch-${day}`}
                        onClick={() => handleDaySelect(day)}
                        className={`flex-1 sm:flex-initial text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${
                          selectedDay === day
                            ? "bg-white text-slate-900 shadow-xs font-bold"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        {t(day)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Schedule List */}
              {mergedAllSchedules.length > 0 ? (
                <div className="relative border-l border-blue-100 pl-6 ml-3 space-y-6">
                  {mergedAllSchedules.map((item) => {
                    const isConflict = item.isConflict;
                    const isGabung = item.kelasgabung === "Iya";
                    const isBergantian = item.kelasgabung === "Bergantian";
                    
                    const isITBA = currentTeacherObj ? checkIsITBA(currentTeacherObj) : false;
                    const isPendampingSlot = !item.isInval && item.items.some(scItem => {
                      if (isAlQuranOrTahsin(scItem.mapel)) {
                        return false;
                      }
                      const isGuru1 = scItem.guru1 && scItem.guru1.trim().toLowerCase() === selectedTeacher.trim().toLowerCase();
                      if (isITBA) {
                        const sName = (scItem.mapel || "").trim().toLowerCase();
                        const isArabic = 
                          sName.includes("arabic") || 
                          sName.includes("bahasa arab") || 
                          sName.includes("arab") || 
                          sName.includes("b. arab") || 
                          sName.includes("b.arab");
                        if (isArabic) {
                          return !isGuru1;
                        }
                        return !isITBACoreSubject(scItem.mapel, selectedTeacher);
                      } else {
                        const isSupervisingCol = scItem.selainguru1_mengawas && (scItem.selainguru1_mengawas.trim().toLowerCase() === "yes" || scItem.selainguru1_mengawas.trim().toLowerCase() === "ya");
                        return !isGuru1 && isSupervisingCol;
                      }
                    });

                    let cardBgClass = "bg-blue-50 hover:bg-blue-100/60 border-blue-200 text-blue-950";
                    let badgeClass = "bg-blue-100 text-blue-900 border border-blue-200";
                    let dotClass = "bg-blue-500";
                    let labelText = "Kelas Tunggal";
                    let tagClass = "bg-blue-200/70 text-blue-900 border border-blue-300";

                    if (item.teacherUnavailable.unavailable && !item.isInval) {
                      cardBgClass = "bg-rose-50 hover:bg-rose-100/60 border-rose-300 border-l-4 border-l-rose-600 text-rose-950";
                      badgeClass = "bg-rose-100 text-rose-900 border border-rose-300 font-bold";
                      dotClass = "bg-rose-600";
                      labelText = item.teacherUnavailable.cause === "ASSIGNMENT" ? "Tidak Mengajar • Penugasan" : "Izin Mengajar";
                      tagClass = "bg-rose-200 text-rose-950 border border-rose-300 font-extrabold";
                    } else if (item.isCancelledForKalender && item.academicEvent) {
                      cardBgClass = "bg-rose-50 hover:bg-rose-100/60 border-rose-200 text-rose-950 font-medium";
                      badgeClass = "bg-rose-100 text-rose-900 border border-rose-300 font-bold";
                      dotClass = "bg-rose-500";
                      labelText = item.academicEvent.nama_kegiatan;
                      tagClass = "bg-rose-200 text-rose-900 font-extrabold border border-rose-300";
                    } else if (item.isCancelledForInval) {
                      cardBgClass = "bg-slate-100 hover:bg-slate-200/60 border-slate-300 text-slate-600 opacity-75 font-medium";
                      badgeClass = "bg-slate-200 text-slate-800 border border-slate-300 font-bold";
                      dotClass = "bg-slate-400";
                      labelText = "❌ Dibatalkan";
                      tagClass = "bg-red-100 text-red-800 font-extrabold border border-red-300";
                    } else if (item.isInval) {
                      cardBgClass = "bg-yellow-50 hover:bg-yellow-100/70 border-yellow-300 border-l-4 border-l-yellow-500 text-yellow-950 shadow-xs";
                      badgeClass = "bg-yellow-200 text-yellow-900 border border-yellow-300 font-bold";
                      dotClass = "bg-yellow-500";
                      labelText = "🚨 Tugas Inval";
                      tagClass = "bg-yellow-300/75 text-yellow-950 font-extrabold border border-yellow-400";
                    } else if (item.isOverridden) {
                      cardBgClass = "bg-indigo-50/90 hover:bg-indigo-100/70 border-indigo-200 border-l-4 border-l-indigo-500 text-indigo-950 shadow-xs";
                      badgeClass = "bg-indigo-200 text-indigo-900 border border-indigo-300 font-bold";
                      dotClass = "bg-indigo-600";
                      labelText = item.tipe_insidental ? `📍 ${item.tipe_insidental}` : "📍 Insidental";
                      tagClass = "bg-indigo-200/80 text-indigo-950 font-extrabold border border-indigo-300";
                    } else if (isPendampingSlot) {
                      cardBgClass = "bg-purple-50 hover:bg-purple-100/60 border-purple-300 border-2 text-purple-950";
                      badgeClass = "bg-purple-100 text-purple-900 border border-purple-200";
                      dotClass = "bg-purple-500";
                      labelText = "Pendamping";
                      tagClass = "bg-purple-200/70 text-purple-900 border border-purple-300";
                    } else if (isConflict || isBergantian) {
                      if (isGabung) {
                        cardBgClass = "bg-emerald-50 hover:bg-emerald-100/60 border-emerald-200 text-emerald-950";
                        badgeClass = "bg-emerald-100 text-emerald-900 border border-emerald-200";
                        dotClass = "bg-emerald-500";
                        labelText = "Kelas Gabung (Iya)";
                        tagClass = "bg-emerald-200/70 text-emerald-900 border border-emerald-300";
                      } else if (isBergantian) {
                        cardBgClass = "bg-teal-50 hover:bg-teal-100/60 border-teal-200 text-teal-950";
                        badgeClass = "bg-teal-100 text-teal-900 border border-teal-200";
                        dotClass = "bg-teal-500";
                        labelText = "Kelas Bergantian";
                        tagClass = "bg-teal-200/70 text-teal-900 border border-teal-300";
                      } else {
                        cardBgClass = "bg-pink-50 hover:bg-pink-100/60 border-pink-200 text-pink-950";
                        badgeClass = "bg-pink-100 text-pink-900 border border-pink-200";
                        dotClass = "bg-pink-500";
                        labelText = "Bentrok! (Tidak Gabung)";
                        tagClass = "bg-pink-200/70 text-pink-900 border border-pink-300";
                      }
                    }

                    return (
                      <div key={item.id} className="relative group">
                        {/* Indicator Dot */}
                        <div className={`absolute -left-[31px] top-1.5 w-4 h-4 rounded-full border-4 border-white shadow-xs transition-transform group-hover:scale-125 duration-200 ${dotClass}`}></div>
                        
                        {/* Item Details */}
                        <div className={`${cardBgClass} border p-4 rounded-xl transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs`}>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-xs font-bold px-2.5 py-1 rounded-md ${badgeClass}`}>
                                <T>{"Jam Ke-"}</T>{item.jam_ke}
                              </span>
                              <span className="text-sm font-medium opacity-85">
                                {(() => {
                                  const isMonToThu = ["Senin", "Selasa", "Rabu", "Kamis"].includes(selectedDay);
                                  const hasG12 = item.items.some(i => isGrade1Or2(i.kelas));
                                  if (isMonToThu && item.jam_ke === 6 && !item.items.some(i => "source" in i && i.source !== "MASTER")) {
                                    return hasG12 ? "14:00 - 14:20" : "14:00 - 15:00";
                                  }
                                  return item.mulai && item.selesai ? `${item.mulai} - ${item.selesai}` : JAM_TIME_MAP[item.jam_ke];
                                })()}
                              </span>
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${tagClass}`}>
                                {labelText}
                              </span>
                            </div>

                            {item.isCancelledForKalender && item.academicEvent ? (
                              <div className="space-y-1.5 mt-1">
                                <h4 className="font-bold text-lg text-rose-950">{item.academicEvent.nama_kegiatan}</h4>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-bold text-rose-700 bg-white/90 border border-rose-200 px-3 py-1 rounded-lg w-fit shadow-2xs">
                                    🎉 {item.academicEvent.tipe}
                                  </span>
                                  <span className="text-xs font-semibold text-rose-600">
                                    <T>{"KBM Normal Ditiadakan"}</T>
                                  </span>
                                </div>
                                {item.academicEvent.keterangan && (
                                  <p className="text-xs text-rose-800 italic mt-0.5">{item.academicEvent.keterangan}</p>
                                )}
                              </div>
                            ) : (
                              <h4 className="font-bold text-lg">{item.mapel}</h4>
                            )}

                            {item.teacherUnavailable.unavailable && !item.isInval && (
                              <p className="mt-2 text-xs font-extrabold text-rose-900 bg-white/90 border border-rose-300 rounded-lg px-3 py-2 w-fit">
                                {item.teacherUnavailable.cause === "ASSIGNMENT"
                                  ? "⛔ Tidak mengajar normal pada JP ini karena penugasan/kegiatan sekolah."
                                  : "⛔ Guru izin pada JP ini. Jadwal normal tidak berlaku bagi guru tersebut."}
                              </p>
                            )}

                            {/* Cancelled Banner if conflict with Inval */}
                            {item.isCancelledForInval && (
                              <p className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg mt-1 w-fit shadow-2xs flex items-center gap-1.5">
                                <span>{item.transferDestination
                                  ? `❌ Tugas pendampingan dibatalkan karena dialihkan pada JP${item.jam_ke}.`
                                  : `❌ Dibatalkan. Utamakan tugas inval di jam ke-${item.jam_ke}.`}</span>
                              </p>
                            )}

                            {item.transferDestination && !item.isInval && (
                              <p className="text-xs font-bold text-red-800 bg-red-50 border border-red-200 px-3 py-2 rounded-lg mt-1 w-fit">
                                Batal mendampingi. Dialihkan ke {item.transferDestination.kind === 'BADAL' ? 'badal' : 'tugas insidental'}
                                {' '}{item.transferDestination.subject} di {item.transferDestination.className} (JP{item.transferDestination.period}).
                              </p>
                            )}
                            {item.dutyConflict && !item.isInval && (
                              <p className="text-xs font-bold text-red-800 bg-red-50 border border-red-300 px-3 py-2 rounded-lg mt-1 w-fit" role="alert">
                                Konflik penugasan! Guru pengampu atau beberapa tugas prioritas beririsan. Perlu tindak lanjut manajemen.
                              </p>
                            )}

                            {/* Inval Info Banner */}
                            {item.isInval && (
                              <div className="mt-1 space-y-1">
                                <p className="text-xs font-bold text-amber-800 flex items-center gap-1.5 bg-white/90 border border-amber-200 px-3 py-1.5 rounded-lg w-fit shadow-2xs">
                                  <span><T>{"Menggantikan:"}</T> <strong>{item.guru_izin}</strong></span>
                                  {item.alasan && <span className="text-xs text-amber-700 font-medium">({item.alasan})</span>}
                                </p>
                                {item.tugas ? (
                                  <div className="mt-2">
                                    <button
                                      onClick={() => setTaskModalData({
                                        isOpen: true,
                                        kelas: item.kelas,
                                        mapel: item.mapel,
                                        guru_izin: item.guru_izin,
                                        tugas: item.tugas
                                      })}
                                      className="bg-blue-100 hover:bg-blue-200 text-blue-800 text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm border border-blue-300 transition-colors flex items-center gap-1.5 cursor-pointer"
                                    >
                                      <span>📋 Lihat Kegiatan Siswa / Tugas</span>
                                    </button>
                                  </div>
                                ) : (
                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <span className="text-[11px] font-bold text-amber-800 bg-amber-100 border border-amber-200 rounded-lg px-2.5 py-1.5">⚠ Tugas belum dikirim guru pengampu</span>
                                    {!isAdmin && selectedDate < getSchoolTodayISO() ? (
                                      <span className="text-[11px] font-bold text-slate-500 bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1.5">
                                        <T>{"Kontak WA sudah kedaluwarsa"}</T>
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => requestTaskViaWhatsapp(item)}
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-1.5 px-3 rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
                                      >
                                        <span>💬 Minta Tugas via WhatsApp</span>
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Incidental Override Info */}
                            {item.isOverridden && item.alasan_insidental && !item.isCancelledForKalender && (
                              <div className="mt-1.5 space-y-1">
                                <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 bg-white/90 border border-indigo-100 px-3 py-1 rounded-lg w-fit">
                                  <span>💡 Info: {item.alasan_insidental}</span>
                                </p>
                              </div>
                            )}
                            
                            {/* Other Teachers Badge List if other teachers are teaching */}
                            {!item.isInval && !item.isCancelledForKalender && (() => {
                              const otherTeachersList: string[] = [];
                              item.items.forEach(scItem => {
                                const scTeachers = [
                                  scItem.guru1,
                                  scItem.guru2,
                                  scItem.guru3,
                                  scItem.guru4,
                                  scItem.guru5,
                                  scItem.guru6
                                ].map(g => g?.trim()).filter(Boolean);
                                
                                scTeachers.forEach(tName => {
                                  if (tName.toLowerCase() !== selectedTeacher.toLowerCase() && !otherTeachersList.includes(tName)) {
                                    otherTeachersList.push(tName);
                                  }
                                });
                              });

                              if (otherTeachersList.length > 0) {
                                return (
                                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5 bg-white/60 border border-slate-200/50 px-3 py-1.5 rounded-lg text-xs">
                                    <span className="font-bold text-slate-500 uppercase text-[9px] tracking-wider block mr-1">Team Teaching:</span>
                                    {otherTeachersList.map((tName, idx) => {
                                      const peer = teachers.find(t => t.nama.trim().toLowerCase() === tName.toLowerCase());
                                      const status = item.items
                                        .map(slot => resolveDisplacedTeacher({
                                          original: slot, teacherName: tName, teacher: peer,
                                          priorityDuties: priorityDutiesForDay,
                                        }))
                                        .find(Boolean);
                                      const isTransfer = status?.kind === 'TRANSFERRED_ASSISTANT';
                                      return (
                                        <span key={idx} className="inline-flex flex-col gap-1">
                                          <span className={`bg-white border px-2 py-0.5 rounded-md font-semibold shadow-2xs ${isTransfer ? 'line-through text-red-700 border-red-200' : 'border-slate-200 text-slate-700'}`}>
                                            {tName}
                                          </span>
                                          {isTransfer && <span className="text-[10px] text-red-800 font-bold max-w-72" role="status">
                                            Batal mendampingi; {status?.destination.kind === 'BADAL' ? 'badal' : 'tugas insidental'} {status?.destination.subject} di {status?.destination.className} (JP{status?.destination.period}).
                                          </span>}
                                          {status && !isTransfer && <span className="text-[10px] text-red-800 font-bold max-w-72" role="alert">
                                            Konflik tugas: {status.destination.subject} di {status.destination.className}. Perlu pemeriksaan manajemen.
                                          </span>}
                                        </span>
                                      );
                                    })}
                                  </div>
                                );
                              }
                              return null;
                            })()}
                          </div>

                          <div className="flex flex-wrap items-center gap-3 text-sm">
                            {isAdmin && onEditSchedule && !item.isInval && !item.isOverridden && !item.isCancelledForKalender && !item.isCancelledForInval && (
                              <button
                                type="button"
                                onClick={() => onEditSchedule(isGabung ? item.items : [item.items[0]], { initialDate: selectedDate })}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white/90 px-2.5 py-1.5 text-[11px] font-black text-blue-700 shadow-sm hover:bg-blue-50"
                                title="Edit canonical schedule"
                              >
                                <Pencil className="w-3.5 h-3.5" /> Edit
                              </button>
                            )}
                            <div>
                              <span className="block text-[10px] uppercase font-bold opacity-60">Kelas</span>
                              <span className="font-semibold">{item.kelas}</span>
                              {item.keterangan_khusus && (
                                <span className="block text-[11px] font-medium text-indigo-600 mt-0.5">
                                  Keterangan Khusus: {item.keterangan_khusus}
                                </span>
                              )}
                            </div>
                            {item.ruangan && (
                              <div>
                                <span className="block text-[10px] uppercase font-bold opacity-60"><T>{"Ruangan"}</T></span>
                                <span className="font-semibold text-slate-800">📍 {getRoomDisplayName(item.ruangan, masterRuangan)}</span>
                                {(() => {
                                  const resolved = resolveRoomInfo(item.ruangan, masterRuangan);
                                  if (resolved?.lokasi) {
                                    return <span className="block text-[10px] text-slate-500 font-normal">{resolved.lokasi}</span>;
                                  }
                                  return null;
                                })()}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-8 text-center text-slate-500 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
                  <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="font-medium text-slate-600"><T>{"Tidak ada jadwal mengajar pada hari"}</T> {selectedDay}</p>
                  <p className="text-xs text-slate-400 mt-1"><T>{"Hari ini adalah Jam Kosong (Free Period) bagi guru yang bersangkutan."}</T></p>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm text-center">
              <User className="w-12 h-12 text-blue-300 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-slate-800 mb-1"><T>{"Informasi Jadwal Guru"}</T></h3>
              <p className="text-slate-500 text-sm max-w-md mx-auto">
                Silakan cari dan pilih nama guru terlebih dahulu untuk memuat jadwal, list mata pelajaran, dan analisis jam kosong secara interaktif.
              </p>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Class Selection Section */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <Table className="w-5 h-5 text-blue-600" />
              <T>{"Pilih Kelas"}</T>
            </h2>
            <p className="text-sm text-slate-500 mb-4">
              Pilih kelas untuk menampilkan jadwal harian lengkap, wali kelas, pendamping kelas, dan urutan mata pelajaran per jam.
            </p>
            
            <div className="relative max-w-xs">
              <select
                id="class-select-dropdown"
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="w-full pl-4 pr-10 py-3 bg-slate-50 hover:bg-slate-100/75 focus:bg-white text-slate-800 border border-slate-200 focus:border-blue-500 rounded-xl outline-none transition-all font-bold text-base shadow-sm appearance-none cursor-pointer"
              >
                {classesList.map((cls) => (
                  <option key={cls} value={cls}>
                    Kelas {cls}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-slate-500">
                <ChevronDown className="w-5 h-5" />
              </div>
            </div>

            {/* Class Metadata: Wali Kelas & Pendamping Kelas */}
            {selectedClass && (
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 pt-5 border-t border-slate-100">
                <div className="p-4 rounded-xl bg-indigo-50/40 border border-indigo-100/50 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold">
                    WK
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-slate-400"><T>{"Wali Kelas"}</T></span>
                    <span className="font-bold text-slate-800 text-sm">
                      {teachers.find(t => isClassMatch(t.wali_kelas, selectedClass))?.nama || "Belum Ditentukan"}
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-purple-50/40 border border-purple-100/50 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold">
                    PK
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-slate-400">Pendamping Kelas</span>
                    <span className="font-bold text-slate-800 text-sm">
                      {teachers.find(t => isClassMatch(t.pendamping_kelas, selectedClass))?.nama || "Belum Ditentukan"}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Today's Schedule for Class */}
          {selectedClass ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6 pb-4 border-b border-slate-100">
                <div>
                  <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-blue-600" />
                    <T>{"Jadwal Harian Kelas"}</T> {selectedClass}
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Menampilkan jadwal aktual: <span className="font-semibold text-blue-600">{formattedDateForUI || t(selectedDay)}</span>
                  </p>
                </div>

                <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 w-full lg:w-auto">
                  {/* Date Picker Input */}
                  <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs">
                    <span className="font-bold text-slate-600"><T>{"Tanggal:"}</T></span>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    />
                  </div>

                  {/* Day Switcher */}
                  <div className="flex flex-wrap gap-1 bg-slate-100 p-1 rounded-xl flex-1 sm:flex-initial">
                    {(["Senin", "Selasa", "Rabu", "Kamis", "Jumat"] as const).map((day) => (
                      <button
                        key={day}
                        id={`class-day-switch-${day}`}
                        onClick={() => handleDaySelect(day)}
                        className={`flex-1 sm:flex-initial text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${
                          selectedDay === day
                            ? "bg-white text-slate-900 shadow-xs font-bold"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        {t(day)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Timetable List */}
              <div className="relative border-l border-blue-100 pl-6 ml-3 space-y-6">
                {classTimetable.map((period) => {
                  const isMonToThu = ["Senin", "Selasa", "Rabu", "Kamis"].includes(selectedDay);
                  const hasG12 = isGrade1Or2(selectedClass);

                  const matchingScheduleForTime = schedules.find(
                    s => isSameDay(s.hari, selectedDay) && 
                         s.jam_ke === period.jam_ke && 
                         isGrade1Or2(s.kelas) === hasG12 &&
                         s.mulai && s.selesai
                  );
                  const dbTime = matchingScheduleForTime ? `${matchingScheduleForTime.mulai} - ${matchingScheduleForTime.selesai}` : null;

                  const datedSlot = period.items.find(item => item.mulai && item.selesai && "source" in item && item.source !== "MASTER");
                  const datedTime = datedSlot ? `${datedSlot.mulai} - ${datedSlot.selesai}` : null;
                  const timeLabel = datedTime || ((isMonToThu && period.jam_ke === 6)
                    ? (hasG12 ? "14:00 - 14:20" : "14:00 - 15:00")
                    : dbTime 
                      ? dbTime
                      : JAM_TIME_MAP[period.jam_ke]);

                  if (period.isEmpty) {
                    return (
                      <div key={period.jam_ke} className="relative group">
                        <div className="absolute -left-[31px] top-1.5 w-4 h-4 rounded-full border-4 border-white bg-slate-300 shadow-xs"></div>
                        <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-slate-200 text-slate-600 border border-slate-300">
                                <T>{"Jam Ke-"}</T>{period.jam_ke}
                              </span>
                              <span className="text-sm font-medium text-slate-500">
                                {timeLabel}
                              </span>
                            </div>
                            <h4 className="font-semibold text-slate-400 italic">Jam Kosong / Istirahat / Belum Ada Jadwal</h4>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // Determine card accent styling
                  let cardBg = "bg-blue-50/50 hover:bg-blue-100/40 border-blue-100";
                  let dotBg = "bg-blue-500";
                  if (period.isAcademicEvent && period.academicEvent) {
                    cardBg = "bg-rose-50/80 hover:bg-rose-100/60 border-rose-200";
                    dotBg = "bg-rose-500";
                  } else if (period.hasMissingReplacement) {
                    cardBg = "bg-rose-50/60 hover:bg-rose-100/50 border-rose-200";
                    dotBg = "bg-rose-500";
                  } else if (period.hasIzin) {
                    cardBg = "bg-amber-50/60 hover:bg-amber-100/50 border-amber-200";
                    dotBg = "bg-amber-500";
                  } else if (period.isIncidental) {
                    cardBg = "bg-indigo-50/60 hover:bg-indigo-100/50 border-indigo-200";
                    dotBg = "bg-indigo-500";
                  }

                  return (
                    <div key={period.jam_ke} className="relative group">
                      <div className={`absolute -left-[31px] top-1.5 w-4 h-4 rounded-full border-4 border-white ${dotBg} shadow-xs transition-transform group-hover:scale-125 duration-200`}></div>
                      
                      <div className={`${cardBg} border p-4.5 rounded-xl transition-all flex flex-col justify-between gap-4 shadow-xs`}>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-white text-slate-800 border border-slate-200 shadow-2xs">
                              <T>{"Jam Ke-"}</T>{period.jam_ke}
                            </span>
                            <span className="text-sm font-medium text-slate-700 bg-white/80 px-2.5 py-1 rounded-md border border-slate-200/60">
                              {timeLabel}
                            </span>
                            {period.isAcademicEvent && period.academicEvent && (
                              <span className="text-xs font-extrabold px-2.5 py-1 rounded-md bg-rose-100 text-rose-900 border border-rose-300 flex items-center gap-1 shadow-2xs">
                                🎉 {period.academicEvent.nama_kegiatan}
                              </span>
                            )}
                            {period.isIncidental && !period.isAcademicEvent && (
                              <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-indigo-100 text-indigo-900 border border-indigo-200 flex items-center gap-1 shadow-2xs">
                                📍 Insidental
                              </span>
                            )}
                            {period.hasIzin && !period.hasMissingReplacement && !period.isAcademicEvent && (
                              <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1 shadow-2xs">
                                🚨 Guru Pengganti
                              </span>
                            )}
                            {period.hasMissingReplacement && !period.isAcademicEvent && (
                              <span className="text-xs font-bold px-2.5 py-1 rounded-md bg-rose-100 text-rose-900 border border-rose-300 flex items-center gap-1 shadow-2xs">
                                ⚠️ Pengganti Belum Ditentukan
                              </span>
                            )}
                            {isAdmin && onEditSchedule && !period.isAcademicEvent && !period.isIncidental && period.items.length > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const canonicalItems = period.items.map((item) => schedules.find((source) => source.id === item.id) || item);
                                  onEditSchedule(canonicalItems, { initialDate: selectedDate });
                                }}
                                className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white/95 px-2.5 py-1 text-[11px] font-black text-blue-700 shadow-sm hover:bg-blue-50"
                                title="Quick Edit jadwal kelas — permanen atau hanya tanggal ini"
                              >
                                <Pencil className="h-3.5 w-3.5" /> Quick Edit
                              </button>
                            )}
                          </div>

                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            {period.isAcademicEvent && period.academicEvent ? (
                              <div className="space-y-1">
                                <h4 className="font-bold text-lg text-rose-950">{period.academicEvent.nama_kegiatan}</h4>
                                <span className="inline-block text-xs font-semibold text-rose-700 bg-white/90 border border-rose-200 px-2.5 py-0.5 rounded-lg shadow-2xs">
                                  {period.academicEvent.tipe}
                                </span>
                              </div>
                            ) : (
                              <h4 className="font-bold text-lg text-slate-900">{period.mapel}</h4>
                            )}

                            <div className="flex flex-wrap items-center gap-4 text-xs">
                              {period.ruangan && (
                                <div className="bg-white/80 px-2.5 py-1 rounded-md border border-slate-200">
                                  <span className="font-bold text-slate-400 uppercase text-[9px] mr-1"><T>{"Ruangan:"}</T></span>
                                  <span className="font-bold text-slate-800">{getRoomDisplayName(period.ruangan, masterRuangan)}</span>
                                </div>
                              )}
                              {period.keterangan_khusus && (
                                <div className="bg-white/80 px-2.5 py-1 rounded-md border border-slate-200 max-w-[220px]">
                                  <span className="font-bold text-slate-400 uppercase text-[9px] mr-1">Ket:</span>
                                  <span className="font-semibold text-slate-700 truncate inline-block align-bottom max-w-[160px]" title={period.keterangan_khusus}>
                                    {period.keterangan_khusus}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                          
                          {/* Active Teachers Display (Only for regular KBM) */}
                          {!period.isAcademicEvent && (
                            <div className="mt-2 flex flex-wrap items-center gap-1.5 bg-white/80 border border-slate-200/60 p-2 rounded-xl text-xs">
                              <span className="font-bold text-slate-500 uppercase text-[9px] tracking-wider block mr-1"><T>{"Guru Mengajar:"}</T></span>
                              {period.teachersStatus
                                .filter(ts => !ts.isIzin)
                                .map((ts, idx) => {
                                  if (ts.isReplacement) {
                                    return (
                                      <span
                                        key={idx}
                                        className="px-2.5 py-1 rounded-lg font-bold shadow-2xs border bg-amber-100 text-amber-950 border-amber-300 flex items-center gap-1"
                                      >
                                        👤 {ts.name} <span className="text-[10px] font-extrabold text-amber-800 bg-amber-200/80 px-1 rounded"><T>{"(Pengganti)"}</T></span>
                                      </span>
                                    );
                                  }

                                  const isTeacherITBA = checkIsITBA({ nama: ts.name } as any);
                                  const relevantItem = period.items.find(i => 
                                    [i.guru1, i.guru2, i.guru3, i.guru4, i.guru5, i.guru6].some(g => g && g.trim().toLowerCase() === ts.name.trim().toLowerCase())
                                  );
                                  const isGuru1 = relevantItem?.guru1?.trim().toLowerCase() === ts.name.trim().toLowerCase();
                                  
                                  let isPendampingRole = false;
                                  if (relevantItem) {
                                    if (isAlQuranOrTahsin(relevantItem.mapel)) {
                                      isPendampingRole = false;
                                    } else if (isTeacherITBA) {
                                      const sName = (relevantItem.mapel || "").trim().toLowerCase();
                                      const isArabic = 
                                        sName.includes("arabic") || 
                                        sName.includes("bahasa arab") || 
                                        sName.includes("arab") || 
                                        sName.includes("b. arab") || 
                                        sName.includes("b.arab");
                                      if (isArabic) {
                                        isPendampingRole = !isGuru1;
                                      } else {
                                        isPendampingRole = !isITBACoreSubject(relevantItem.mapel, ts.name);
                                      }
                                    } else {
                                      const isSupervisingCol = relevantItem.selainguru1_mengawas && (relevantItem.selainguru1_mengawas.trim().toLowerCase() === "yes" || relevantItem.selainguru1_mengawas.trim().toLowerCase() === "ya");
                                      isPendampingRole = !isGuru1 && isSupervisingCol;
                                    }
                                  }

                                  return (
                                    <span 
                                      key={idx} 
                                      className={`px-2.5 py-1 rounded-lg font-semibold shadow-2xs border ${
                                        isPendampingRole
                                          ? "bg-purple-100 text-purple-900 border-purple-200"
                                          : "bg-blue-100 text-blue-900 border-blue-200"
                                      }`}
                                    >
                                      {ts.name} {isPendampingRole ? "(Pendamping)" : ""}
                                    </span>
                                  );
                                })}
                            </div>
                          )}

                          {/* Leave / Replacement Notification Box */}
                          {!period.isAcademicEvent && period.hasIzin && (
                            <div className="mt-3 p-3.5 rounded-xl bg-amber-500/10 border border-amber-300/80 text-xs text-amber-950 space-y-2">
                              {period.teachersStatus.filter(ts => ts.isIzin).map((ts, idx) => {
                                const matchingLog = period.periodLogs.find(l => l.guru_izin && l.guru_izin.trim().toLowerCase() === ts.name.toLowerCase());
                                const hasRepl = matchingLog?.guru_pengganti && matchingLog.guru_pengganti.trim();

                                return (
                                  <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                                    <div className="space-y-0.5">
                                      <div>
                                        <span className="font-extrabold text-amber-900">🚨 Guru Utama Izin:</span>{" "}
                                        <span className="line-through font-bold text-slate-600">{ts.name}</span>
                                        {ts.alasanIzin && <span className="italic font-medium text-amber-800"> ({ts.alasanIzin})</span>}
                                      </div>
                                      {hasRepl ? (
                                        <div className="text-amber-950 font-medium">
                                          👉 Digantikan oleh: <strong className="text-amber-950 font-bold bg-amber-200/70 px-1.5 py-0.5 rounded">{matchingLog.guru_pengganti}</strong>
                                        </div>
                                      ) : (
                                        <div className="text-rose-700 font-bold flex items-center gap-1">
                                          ⚠️ Guru pengganti belum ditentukan
                                        </div>
                                      )}
                                    </div>

                                    {/* Task Button */}
                                    {matchingLog?.tugas && matchingLog.tugas.trim() !== "" && (
                                      <button
                                        onClick={() => setTaskModalData({
                                          isOpen: true,
                                          kelas: matchingLog.kelas || selectedClass,
                                          mapel: period.mapel,
                                          guru_izin: matchingLog.guru_izin,
                                          tugas: matchingLog.tugas
                                        })}
                                        className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs shrink-0 cursor-pointer text-xs"
                                      >
                                        📋 Lihat Kegiatan Siswa / Tugas
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Incidental Schedule Details Box */}
                          {!period.isAcademicEvent && period.isIncidental && (period.keterangan_insidental || period.alasan_insidental || period.tipe_insidental) && (
                            <div className="mt-2 text-xs bg-indigo-50 border border-indigo-200 p-2.5 rounded-xl text-indigo-950">
                              <span className="font-bold text-indigo-900">💡 Detail Jadwal Insidental:</span>
                              {period.tipe_insidental && <span className="ml-1 font-semibold">[{period.tipe_insidental}]</span>}
                              {period.keterangan_insidental && period.keterangan_insidental !== period.keterangan_khusus && <span className="ml-1">{period.keterangan_insidental}</span>}
                              {period.alasan_insidental && <span className="ml-1 italic">({period.alasan_insidental})</span>}
                            </div>
                          )}

                          {/* Academic Calendar Details Box */}
                          {period.isAcademicEvent && period.academicEvent && (
                            <div className="mt-2 text-xs bg-white/90 border border-rose-200 p-2.5 rounded-xl text-rose-950 flex items-start gap-2 shadow-2xs">
                              <span className="font-extrabold text-rose-900 shrink-0">🎉 Kalender Akademik:</span>
                              <div>
                                <strong className="text-rose-950 font-bold">{period.academicEvent.nama_kegiatan}</strong>
                                <span className="text-rose-800 ml-1 font-semibold">({period.academicEvent.tipe})</span>
                                {period.academicEvent.keterangan && (
                                  <p className="text-rose-800 text-[11px] mt-0.5">{period.academicEvent.keterangan}</p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm text-center">
              <Users className="w-12 h-12 text-blue-300 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-slate-800 mb-1"><T>{"Informasi Jadwal Kelas"}</T></h3>
              <p className="text-slate-500 text-sm max-w-md mx-auto">
                Silakan pilih kelas terlebih dahulu untuk memuat jadwal pelajaran harian lengkap.
              </p>
            </div>
          )}
        </>
      )}

      {/* Grid Menu Button */}
      <div>
        <h3 className="text-base font-bold text-slate-400 uppercase tracking-wider mb-4"><T>{"Navigasi Fitur Sistem"}</T></h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

          {/* Public teacher leave form — V3.12 */}
          <button
            id="menu-ajukan-izin"
            onClick={() => setPage("ajukan-izin")}
            className="group relative bg-emerald-50/50 border border-emerald-200 hover:border-emerald-300 p-5 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex items-start gap-4"
          >
            <div className="p-3 bg-emerald-100 text-emerald-700 rounded-xl group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <ClipboardCheck className="w-6 h-6" />
            </div>
            <div className="space-y-1 pr-6 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h4 className="font-bold text-slate-800 group-hover:text-emerald-700 transition-colors">
                  <T>{"Ajukan Izin Mengajar"}</T>
                </h4>
                <span className="text-[9px] bg-emerald-200 text-emerald-800 font-bold px-1.5 py-0.5 rounded-md uppercase">
                  <T>{"Tanpa Login"}</T>
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Ajukan izin berdasarkan jadwal aktif. Nama otomatis mengikuti guru terakhir yang sedang dilihat dan tetap bisa diganti.
              </p>
            </div>
            <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-300 group-hover:text-emerald-600 group-hover:translate-x-1 transition-all" />
          </button>
          
          {/* Menu a: Jadwal Pelajaran Lengkap */}
          <button
            id="menu-jadwal-lengkap"
            onClick={() => setPage("jadwal-lengkap")}
            className="group relative bg-white border border-slate-200 hover:border-blue-100 p-5 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex items-start gap-4"
          >
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <Calendar className="w-6 h-6" />
            </div>
            <div className="space-y-1 pr-6 flex-1">
              <h4 className="font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
                <T>{"Jadwal Pelajaran Lengkap"}</T>
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Menampilkan jadwal mengajar guru seminggu penuh (Senin - Jumat) dalam bentuk grid/card.
              </p>
            </div>
            <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
          </button>

          {/* Menu b: List Mapel yang Diajar */}
          <button
            id="menu-list-mapel"
            onClick={() => setPage("list-mapel")}
            className="group relative bg-white border border-slate-200 hover:border-blue-100 p-5 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex items-start gap-4"
          >
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <BookOpen className="w-6 h-6" />
            </div>
            <div className="space-y-1 pr-6 flex-1">
              <h4 className="font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
                <T>{"Mata Pelajaran Diampu"}</T>
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Daftar mata pelajaran yang diajar, kelas, dan jumlah Jam Pelajaran (JP) dengan fitur sorting.
              </p>
            </div>
            <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
          </button>

          {/* Menu b2: Guru Pengampu per Kelas */}
          <button
            id="menu-guru-pengampu-kelas"
            onClick={() => setPage("guru-pengampu-kelas")}
            className="group relative bg-white border border-slate-200 hover:border-indigo-100 p-5 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex items-start gap-4"
          >
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div className="space-y-1 pr-6 flex-1">
              <h4 className="font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">
                <T>{"Guru Pengampu per Kelas"}</T>
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Filter per kelas untuk melihat setiap guru pengampu, mata pelajaran, jadwal, dan alokasi JP.
              </p>
            </div>
            <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all" />
          </button>

          {/* Menu c: Jam Kosong Individu */}
          <button
            id="menu-jam-kosong-individu"
            onClick={() => setPage("jam-kosong-individu")}
            className="group relative bg-white border border-slate-200 hover:border-amber-100 p-5 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex items-start gap-4"
          >
            <div className="p-3 bg-amber-50 text-amber-600 rounded-xl group-hover:bg-amber-500 group-hover:text-white transition-colors">
              <Clock className="w-6 h-6" />
            </div>
            <div className="space-y-1 pr-6 flex-1">
              <h4 className="font-bold text-slate-800 group-hover:text-amber-600 transition-colors">
                <T>{"Jam Kosong Individu"}</T>
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Melihat slot waktu mengajar kosong untuk guru terpilih guna penjadwalan mandiri.
              </p>
            </div>
            <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-hover:text-amber-500 group-hover:translate-x-1 transition-all" />
          </button>

          {/* ADMIN ONLY SECTIONS */}
          {isAdmin ? (
            <>
              {/* Menu: Tabel Jam Kosong */}
              <button
                id="menu-tabel-jam-kosong"
                onClick={() => setPage("tabel-jam-kosong")}
                className="group relative bg-blue-50/30 border border-blue-100/70 hover:border-blue-200 p-5 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex items-start gap-4"
              >
                <div className="p-3 bg-blue-100 text-blue-700 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <Table className="w-6 h-6" />
                </div>
                <div className="space-y-1 pr-6 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h4 className="font-bold text-slate-800 group-hover:text-blue-700 transition-colors">
                      Tabel Jam Kosong Guru
                    </h4>
                    <span className="text-[9px] bg-blue-200 text-blue-800 font-bold px-1.5 py-0.5 rounded-md uppercase">
                      Admin
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    <T>{"Peta ketersediaan (matrix tabel) ketersediaan jam kosong seluruh guru per hari."}</T>
                  </p>
                </div>
                <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
              </button>

              {/* Menu d: Jam Kosong Semua Guru */}
              <button
                id="menu-jam-kosong-semua"
                onClick={() => setPage("jam-kosong-semua")}
                className="group relative bg-blue-50/30 border border-blue-100/70 hover:border-blue-200 p-5 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex items-start gap-4"
              >
                <div className="p-3 bg-blue-100 text-blue-700 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <Users className="w-6 h-6" />
                </div>
                <div className="space-y-1 pr-6 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h4 className="font-bold text-slate-800 group-hover:text-blue-700 transition-colors">
                      Jam Kosong Semua Guru
                    </h4>
                    <span className="text-[9px] bg-blue-200 text-blue-800 font-bold px-1.5 py-0.5 rounded-md uppercase">
                      Admin
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Menampilkan daftar seluruh guru yang kosong pada hari dan jam pelajaran tertentu.
                  </p>
                </div>
                <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
              </button>

              {/* Menu e: Input Guru Pengganti */}
              <button
                id="menu-input-pengganti"
                onClick={() => setPage("input-pengganti")}
                className="group relative bg-blue-50/30 border border-blue-100/70 hover:border-blue-200 p-5 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex items-start gap-4"
              >
                <div className="p-3 bg-blue-100 text-blue-700 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <UserPlus className="w-6 h-6" />
                </div>
                <div className="space-y-1 pr-6 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h4 className="font-bold text-slate-800 group-hover:text-blue-700 transition-colors">
                      Input Guru Pengganti (Inval)
                    </h4>
                    <span className="text-[9px] bg-blue-200 text-blue-800 font-bold px-1.5 py-0.5 rounded-md uppercase">
                      Admin
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Input guru izin dan rekomendasikan guru pengganti pintar otomatis berdasarkan 5 kriteria.
                  </p>
                </div>
                <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
              </button>

              {/* Menu f: Log Guru Pengganti */}
              <button
                id="menu-log-pengganti"
                onClick={() => setPage("log-pengganti")}
                className="group relative bg-blue-50/30 border border-blue-100/70 hover:border-blue-200 p-5 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex items-start gap-4"
              >
                <div className="p-3 bg-blue-100 text-blue-700 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <History className="w-6 h-6" />
                </div>
                <div className="space-y-1 pr-6 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h4 className="font-bold text-slate-800 group-hover:text-blue-700 transition-colors">
                      Log Guru Pengganti
                    </h4>
                    <span className="text-[9px] bg-blue-200 text-blue-800 font-bold px-1.5 py-0.5 rounded-md uppercase">
                      Admin
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Histori lengkap data izin & penggantian. Dilengkapi tombol salin teks format siaran WhatsApp.
                  </p>
                </div>
                <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
              </button>

              {/* Menu g: Statistik Guru Pengganti */}
              <button
                id="menu-statistik"
                onClick={() => setPage("statistik")}
                className="group relative bg-blue-50/30 border border-blue-100/70 hover:border-blue-200 p-5 rounded-2xl shadow-sm hover:shadow-md transition-all text-left flex items-start gap-4"
              >
                <div className="p-3 bg-blue-100 text-blue-700 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <BarChart2 className="w-6 h-6" />
                </div>
                <div className="space-y-1 pr-6 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h4 className="font-bold text-slate-800 group-hover:text-blue-700 transition-colors">
                      Statistik Guru Pengganti
                    </h4>
                    <span className="text-[9px] bg-blue-200 text-blue-800 font-bold px-1.5 py-0.5 rounded-md uppercase">
                      Admin
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Dashboard analitik total JP, top guru izin, top alasan, dan 10 pahlawan guru pengganti.
                  </p>
                </div>
                <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
              </button>
            </>
          ) : (
            <div className="border border-dashed border-slate-200 rounded-2xl p-5 flex flex-col justify-center items-center text-center bg-slate-50 sm:col-span-2 lg:col-span-3">
              <Shield className="w-8 h-8 text-slate-300 mb-2" />
              <h4 className="font-bold text-slate-700 text-sm">Akses Fitur Khusus Admin Terkunci</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                Fitur tambahan (Jam Kosong Semua Guru, Rekomendasi Pintar Inval, Log Izin & Analytics) hanya dapat diakses oleh Admin. Aktifkan mode Admin lewat navigasi atas atau ketik URL tersembunyi.
              </p>
            </div>
          )}

        </div>
      </div>

      {/* MODAL TUGAS INVAL */}
      {taskModalData?.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col border border-slate-200 animate-in fade-in zoom-in duration-200">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <div>
                <h3 className="font-extrabold text-slate-800 text-lg">📝 Detail Kegiatan / Tugas</h3>
                <p className="text-xs font-medium text-slate-500 mt-0.5">
                  Kelas {taskModalData.kelas} • {taskModalData.mapel}
                </p>
              </div>
              <button 
                onClick={() => setTaskModalData(null)}
                className="p-1.5 bg-slate-200 hover:bg-red-100 text-slate-600 hover:text-red-600 rounded-full transition-colors cursor-pointer"
              >
                <X className="w-5 h-5"/>
              </button>
            </div>
            <div className="p-5 max-h-[60vh] overflow-y-auto">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Pesan dari {taskModalData.guru_izin}:</p>
              <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-xl text-sm text-slate-700 leading-relaxed">
                {renderTaskWithLinks(taskModalData.tugas)}
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button 
                onClick={() => setTaskModalData(null)}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-xl transition-colors shadow-sm cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
