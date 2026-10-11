import React, { useState, useMemo } from "react";
import { isGrade1Or2 } from "../domain/class";
import { Teacher, ScheduleItem, LogIzinItem, MasterRuanganItem, KalenderAkademikItem, JadwalInsidentalItem, getRoomDisplayName, normalizeDay, isSameDay } from "../types";
import { ArrowLeft, AlertCircle, Search, Users, Download, Loader2, X, Clock, User, Calendar, GraduationCap, Pencil } from "lucide-react";
import { JAM_TIME_MAP, SCHOOL_DAYS as HARI_LIST, TEACHING_JPS as JAM_LIST } from "../constants/schedule";
import { classifyJadwalKelasCell, JADWAL_KELAS_CELL_VISUALS } from "../domain/schedule/jadwalKelasVisualSemantics";
import { downloadElementAsPng } from "../infrastructure/browser/exportElementJpeg";
import { getErrorMessage } from "../domain/errorMessage";
import { buildClassWeekMap, type ClassWeekMap } from "../domain/schedule/classWeek";
import { getSchoolWeekDateStrings } from "../domain/date";
import { parseScheduleClassMode } from "../domain/schedule/classMode";
import { compactSubjectLabel } from "../domain/schedule/displayLabels";

interface JadwalKelasProps {
  teachers: Teacher[];
  schedules: ScheduleItem[];
  masterRuangan?: MasterRuanganItem[];
  kalenderAkademik?: KalenderAkademikItem[];
  jadwalInsidental?: JadwalInsidentalItem[];
  logs?: LogIzinItem[];
  weekReferenceDate?: string;
  schoolToday?: string;
  onBack: () => void;
  isAdmin?: boolean;
  onUpdateSchedules?: (data: ScheduleItem[]) => void;
  onEditSchedule?: (items: ScheduleItem[], options?: { initialDate?: string }) => void;
}


// Helper to check class type
export const getClassType = (className: string): "Ikhwan" | "Akhwat" | "Normal" => {
  if (!className) return "Normal";
  const name = className.trim().toLowerCase();
  if (name.endsWith("i") || name.endsWith("ikhwan") || name.includes("ikhwan") || name.includes(" ikhwan")) {
    return "Ikhwan";
  }
  if (name.endsWith("a") || name.endsWith("akhwat") || name.includes("akhwat") || name.includes(" akhwat")) {
    return "Akhwat";
  }
  return "Normal";
};

// Helper to check if Grade 12
export const isGrade12 = (className: string): boolean => {
  if (!className) return false;
  const name = className.trim().toLowerCase();
  return /^12\b|^12[a-z]|class\s*12|grade\s*12/i.test(name);
};

// Helper to get Friday-specific time ranges for teaching cells
export const getFridayTimeRange = (jpNumber: number, className: string, classType: "Ikhwan" | "Akhwat" | "Normal"): string => {
  const isAkhwat = classType === "Akhwat";
  const isG12 = isGrade1Or2(className);

  if (jpNumber === 1) {
    return "07:15 - 08:15";
  }
  if (jpNumber === 2) {
    return isAkhwat ? "08:30 - 09:30" : "08:15 - 09:15";
  }
  if (jpNumber === 3) {
    return isG12 ? "09:30 - 10:20" : "09:30 - 10:30";
  }
  if (jpNumber === 4) {
    return "13:00 - 14:00";
  }
  if (jpNumber === 5) {
    return "14:00 - 15:00";
  }
  return "";
};

// Helper to get Friday-specific labels and time ranges for breaks/ishoma
export const getFridayBreakInfo = (colType: "break" | "ishoma", className: string, classType: "Ikhwan" | "Akhwat" | "Normal") => {
  const isAkhwat = classType === "Akhwat";
  const isG12 = isGrade1Or2(className);

  if (colType === "break") {
    return {
      label: "Istirahat",
      timeRange: isAkhwat ? "08:15 - 08:30" : "09:15 - 09:30"
    };
  }

  // colType === "ishoma"
  if (isG12) {
    return {
      label: "Pulang Sekolah",
      timeRange: "10:20"
    };
  } else {
    return {
      label: "Al-Kahfi & Ishoma",
      timeRange: "10:30 - 13:00"
    };
  }
};

interface ColumnDef {
  type: "jp" | "break" | "ishoma";
  jpNumber?: number;
  label: string;
  timeRange: string;
}

// Columns definition based on classType and grade (isGrade1Or2)
const getColumns = (type: "Ikhwan" | "Akhwat" | "Normal", isG12: boolean): ColumnDef[] => {
  const isAkhwat = type === "Akhwat";
  const jp6Time = isG12 ? "14:00 - 14:20" : "14:00 - 15:00";

  if (isAkhwat) {
    return [
      { type: "jp", jpNumber: 1, label: "Jam ke-1", timeRange: "07:40 - 08:40" },
      { type: "break", label: "Istirahat", timeRange: "08:40 - 09:00" },
      { type: "jp", jpNumber: 2, label: "Jam ke-2", timeRange: "09:00 - 10:00" },
      { type: "jp", jpNumber: 3, label: "Jam ke-3", timeRange: "10:00 - 11:00" },
      { type: "jp", jpNumber: 4, label: "Jam ke-4", timeRange: "11:00 - 12:00" },
      { type: "ishoma", label: "Ishoma", timeRange: "12:00 - 13:00" },
      { type: "jp", jpNumber: 5, label: "Jam ke-5", timeRange: "13:00 - 14:00" },
      { type: "jp", jpNumber: 6, label: "Jam ke-6", timeRange: jp6Time },
    ];
  } else {
    // Ikhwan & Normal
    return [
      { type: "jp", jpNumber: 1, label: "Jam ke-1", timeRange: "07:40 - 08:40" },
      { type: "jp", jpNumber: 2, label: "Jam ke-2", timeRange: "08:40 - 09:40" },
      { type: "break", label: "Istirahat", timeRange: "09:40 - 10:00" },
      { type: "jp", jpNumber: 3, label: "Jam ke-3", timeRange: "10:00 - 11:00" },
      { type: "jp", jpNumber: 4, label: "Jam ke-4", timeRange: "11:00 - 12:00" },
      { type: "ishoma", label: "Ishoma", timeRange: "12:00 - 13:00" },
      { type: "jp", jpNumber: 5, label: "Jam ke-5", timeRange: "13:00 - 14:00" },
      { type: "jp", jpNumber: 6, label: "Jam ke-6", timeRange: jp6Time },
    ];
  }
};

// Helper to get Friday-specific columns
export const getFridayColumns = (type: "Ikhwan" | "Akhwat" | "Normal", isG12: boolean): ColumnDef[] => {
  const isAkhwat = type === "Akhwat";
  if (isAkhwat) {
    return [
      { type: "jp", jpNumber: 1, label: "JAM KE-1", timeRange: "07:15 - 08:15" },
      { type: "break", label: "ISTIRAHAT", timeRange: "08:15 - 08:30" },
      { type: "jp", jpNumber: 2, label: "JAM KE-2", timeRange: "08:30 - 09:30" },
      { type: "jp", jpNumber: 3, label: "JAM KE-3", timeRange: isG12 ? "09:30 - 10:20" : "09:30 - 10:30" },
      { type: "break", label: "Al-Kahfi", timeRange: "10:30 - 11:00" },
      { type: "ishoma", label: "Ishoma", timeRange: "11:00 - 13:00" },
      { type: "jp", jpNumber: 4, label: "JP 4", timeRange: "13:00 - 14:00" },
      { type: "jp", jpNumber: 5, label: "JP 5", timeRange: "14:00 - 15:00" },
    ];
  } else {
    // Ikhwan & Normal
    return [
      { type: "jp", jpNumber: 1, label: "JAM KE-1", timeRange: "07:15 - 08:15" },
      { type: "jp", jpNumber: 2, label: "JAM KE-2", timeRange: "08:15 - 09:15" },
      { type: "break", label: "ISTIRAHAT", timeRange: "09:15 - 09:30" },
      { type: "jp", jpNumber: 3, label: "JAM KE-3", timeRange: isG12 ? "09:30 - 10:20" : "09:30 - 10:30" },
      { type: "break", label: "Al-Kahfi", timeRange: "10:30 - 11:00" },
      { type: "ishoma", label: "Ishoma", timeRange: "11:00 - 13:00" },
      { type: "jp", jpNumber: 4, label: "JP 4", timeRange: "13:00 - 14:00" },
      { type: "jp", jpNumber: 5, label: "JP 5", timeRange: "14:00 - 15:00" },
    ];
  }
};

const getBreakColors = (type: "Ikhwan" | "Akhwat" | "Normal") => {
  if (type === "Akhwat") {
    return {
      bg: "bg-purple-100 border-purple-200 text-purple-800",
      bgMobile: "bg-purple-50 border-purple-100 text-purple-900 shadow-2xs",
      badge: "bg-purple-200 text-purple-800",
      pulse: "bg-purple-500",
    };
  } else {
    // Ikhwan & Normal: abu-abu muda
    return {
      bg: "bg-slate-100 border-slate-200 text-slate-800",
      bgMobile: "bg-slate-50 border-slate-100 text-slate-900 shadow-2xs",
      badge: "bg-slate-200 text-slate-800",
      pulse: "bg-slate-400",
    };
  }
};

export const JadwalKelas: React.FC<JadwalKelasProps> = ({
  teachers,
  schedules,
  masterRuangan = [],
  kalenderAkademik = [],
  jadwalInsidental = [],
  logs = [],
  weekReferenceDate,
  schoolToday,
  onBack,
  isAdmin = false,
  onUpdateSchedules,
  onEditSchedule,
}) => {
  const [selectedClass, setSelectedClass] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [scheduleViewMode, setScheduleViewMode] = useState<"MASTER" | "THIS_WEEK">("MASTER");

  // Companion edit state
  const [editingItem, setEditingItem] = useState<ScheduleItem | null>(null);
  const [editingError, setEditingError] = useState<string | null>(null);

  // Detail Pop-up state
  const [selectedDetail, setSelectedDetail] = useState<{
    hari: string;
    jam: number;
    waktu: string;
    items: ScheduleItem[];
  } | null>(null);

  // Compute total weekly JP for each teacher from schedules (detecting combined classes: count same day + period as 1 JP)
  const teacherJpMap = useMemo(() => {
    const map: Record<string, number> = {};
    const teacherSlots: Record<string, Set<string>> = {};

    teachers.forEach(t => {
      if (t && t.nama) {
        map[t.nama] = 0;
        teacherSlots[t.nama] = new Set<string>();
      }
    });

    schedules.forEach(s => {
      const dayKey = (s.hari || "").trim().toLowerCase();
      const periodKey = s.jam_ke;
      const slotKey = `${dayKey}-${periodKey}`;

      [s.guru1, s.guru2, s.guru3, s.guru4, s.guru5, s.guru6].forEach(g => {
        if (g) {
          const trimmed = g.trim();
          if (!teacherSlots[trimmed]) {
            teacherSlots[trimmed] = new Set<string>();
          }
          teacherSlots[trimmed].add(slotKey);
        }
      });
    });

    // Translate sets to count map
    Object.keys(teacherSlots).forEach(name => {
      map[name] = teacherSlots[name].size;
    });

    return map;
  }, [teachers, schedules]);

  // Sort available teachers for the dropdown
  const availableTeachers = useMemo(() => {
    return teachers
      .filter(t => {
        const nameLower = (t.nama || "").toLowerCase();
        const tugasLower = (t.tugas_tambahan || "").toLowerCase();
        const rumpunLower = (t.rumpun || "").toLowerCase();
        const ketLower = (t.keterangan || "").toLowerCase();
        
        // Exclude Manajemen & Komisi completely
        const isManajemen = t.is_manajemen === true || 
                            tugasLower.includes("manajemen") || 
                            nameLower.includes("manajemen") ||
                            rumpunLower.includes("manajemen") ||
                            ketLower.includes("manajemen");
        const isKomisi = tugasLower.includes("komisi") || 
                         nameLower.includes("komisi") ||
                         rumpunLower.includes("komisi") ||
                         ketLower.includes("komisi");
                         
        return !isManajemen && !isKomisi;
      })
      .map(t => {
        const jp = teacherJpMap[t.nama] || 0;
        return {
          nama: t.nama,
          jp,
          panggilan: t.panggilan || ""
        };
      })
      .sort((a, b) => {
        if (a.jp !== b.jp) return a.jp - b.jp;
        return a.nama.localeCompare(b.nama);
      });
  }, [teachers, teacherJpMap]);

  const handleAddCompanion = (scheduleId: string, teacherName: string) => {
    if (!onUpdateSchedules) return;
    let errorOccurred = false;
    const updatedSchedules = schedules.map(s => {
      if (s.id === scheduleId) {
        if (!s.guru2) return { ...s, guru2: teacherName };
        if (!s.guru3) return { ...s, guru3: teacherName };
        if (!s.guru4) return { ...s, guru4: teacherName };
        if (!s.guru5) return { ...s, guru5: teacherName };
        if (!s.guru6) return { ...s, guru6: teacherName };
        errorOccurred = true;
      }
      return s;
    });

    if (errorOccurred) {
      setEditingError("Batas maksimal 6 guru (1 utama + 5 pendamping) sudah tercapai.");
      return;
    }

    onUpdateSchedules(updatedSchedules);
    setEditingError(null);

    const newEditingItem = updatedSchedules.find(s => s.id === scheduleId);
    if (newEditingItem) {
      setEditingItem(newEditingItem);
    }
  };

  const handleRemoveCompanion = (scheduleId: string, fieldKey: 'guru2' | 'guru3' | 'guru4' | 'guru5' | 'guru6') => {
    if (!onUpdateSchedules) return;
    const updatedSchedules = schedules.map(s => {
      if (s.id === scheduleId) {
        const updated = { ...s, [fieldKey]: "" };
        const companions = [updated.guru2, updated.guru3, updated.guru4, updated.guru5, updated.guru6].filter(Boolean);
        return {
          ...updated,
          guru2: companions[0] || "",
          guru3: companions[1] || "",
          guru4: companions[2] || "",
          guru5: companions[3] || "",
          guru6: companions[4] || "",
        };
      }
      return s;
    });

    onUpdateSchedules(updatedSchedules);
    setEditingError(null);

    const newEditingItem = updatedSchedules.find(s => s.id === scheduleId);
    if (newEditingItem) {
      setEditingItem(newEditingItem);
    }
  };

  // Get all unique classes from schedule
  const uniqueClasses = useMemo(() => {
    const classes = schedules.map(s => (s.kelas || "").trim()).filter(Boolean);
    return [...new Set(classes)].sort();
  }, [schedules]);

  // Filter classes based on query
  const filteredClasses = useMemo(() => {
    if (searchQuery.trim() === "") return [];
    return uniqueClasses.filter(c => c.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [searchQuery, uniqueClasses]);

  // Filter schedules for the selected class
  const classSchedules = useMemo(() => {
    if (!selectedClass) return [];
    return schedules.filter(s => (s.kelas || "").trim().toLowerCase() === selectedClass.trim().toLowerCase());
  }, [selectedClass, schedules]);

  // Determine class type of selected class
  const classType = useMemo(() => {
    return getClassType(selectedClass);
  }, [selectedClass]);

  const isG12Class = useMemo(() => {
    return isGrade1Or2(selectedClass);
  }, [selectedClass]);

  const isGrade12Class = useMemo(() => {
    return isGrade12(selectedClass);
  }, [selectedClass]);

  // Columns specification for selected class
  const columns = useMemo(() => {
    return getColumns(classType, isG12Class);
  }, [classType, isG12Class]);

  const fridayColumns = useMemo(() => {
    return getFridayColumns(classType, isG12Class);
  }, [classType, isG12Class]);

  // Map schedules to 2D lookup [Hari][Jam_ke] -> ScheduleItem[]
  const scheduleMap = useMemo(() => {
    const map: Record<string, Record<number, ScheduleItem[]>> = {};
    HARI_LIST.forEach(hari => {
      map[hari] = {};
    });
    classSchedules.forEach(item => {
      const normH = normalizeDay(item.hari);
      // Requirement 2: Hari jum'at untuk kelas 1-11, setelah JP 3 tulis kosong (skip loading JP >= 4)
      if (normH === "Jumat" && !isGrade12Class && item.jam_ke >= 4) {
        return;
      }
      if (map[normH]) {
        if (!map[normH][item.jam_ke]) {
          map[normH][item.jam_ke] = [];
        }
        map[normH][item.jam_ke].push(item);
      }
    });
    return map;
  }, [classSchedules, isGrade12Class]);

  const effectiveWeekReference = weekReferenceDate || schoolToday || new Date().toISOString().slice(0, 10);
  const schoolWeekDates = useMemo(
    () => getSchoolWeekDateStrings(effectiveWeekReference),
    [effectiveWeekReference],
  );
  const classWeekMap = useMemo<ClassWeekMap>(() => (
    selectedClass
      ? buildClassWeekMap({
          referenceDate: effectiveWeekReference,
          className: selectedClass,
          schedules,
          incidentals: jadwalInsidental,
          logs,
          kalenderAkademik,
        })
      : {}
  ), [selectedClass, effectiveWeekReference, schedules, jadwalInsidental, logs, kalenderAkademik]);

  const weekDateByDay = useMemo(() => Object.fromEntries(schoolWeekDates.map((entry) => [entry.dayName, entry.dateStr])), [schoolWeekDates]);

  const weekRangeLabel = useMemo(() => {
    if (!schoolWeekDates.length) return "";
    const formatter = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" });
    const parse = (value: string) => {
      const [year, month, day] = value.split("-").map(Number);
      return new Date(year, month - 1, day);
    };
    return `${formatter.format(parse(schoolWeekDates[0].dateStr))} – ${formatter.format(parse(schoolWeekDates[schoolWeekDates.length - 1].dateStr))}`;
  }, [schoolWeekDates]);

  // Map full name to nickname ("Panggilan")
  const getTeacherDisplayName = (fullName: string): string => {
    if (!fullName) return "";
    
    // Normalize teacher name by stripping common titles & degrees and special characters to allow resilient matching
    const normalizeTeacherName = (name: string): string => {
      if (!name) return "";
      return name
        .toLowerCase()
        .replace(/(,?\s*(s\.pd|m\.pd|s\.h|lc|m\.s\.i|s\.si|s\.m\.gr|m\.pd\.i|s\.pd\.i|s\.kom|s\.e|s\.tp|s\.ag|b\.a)\.?)+$/gi, "")
        .replace(/[^a-z0-9]/g, "")
        .trim();
    };

    const cleanFull = normalizeTeacherName(fullName);
    const matchedTeacher = teachers.find(t => {
      const cleanTeacherName = normalizeTeacherName(t.nama);
      return cleanTeacherName === cleanFull || (t.nama || "").trim().toLowerCase() === (fullName || "").trim().toLowerCase();
    });

    if (matchedTeacher && matchedTeacher.panggilan) {
      return (matchedTeacher.panggilan || "").trim();
    }
    return (fullName || "").trim();
  };

  const incidentalVisual = {
    desktop: "bg-indigo-50/90 text-indigo-950 border-l-2 border-l-indigo-500 hover:bg-indigo-100/80",
    mobile: "border-indigo-200 bg-indigo-50/90 text-indigo-950 hover:bg-indigo-100/80 hover:ring-indigo-400/30",
    teacherText: "text-indigo-800",
    periodBadge: "border-indigo-200 text-indigo-800",
    label: "Insidental",
    legend: "Jadwal Insidental",
  };
  const academicEventVisual = {
    desktop: "bg-rose-50/90 text-rose-950 border-l-2 border-l-rose-500 hover:bg-rose-100/80",
    mobile: "border-rose-200 bg-rose-50/90 text-rose-950 hover:bg-rose-100/80 hover:ring-rose-400/30",
    teacherText: "text-rose-800",
    periodBadge: "border-rose-200 text-rose-800",
    label: "Kalender",
    legend: "Kalender Akademik",
  };

  const getClassCellData = (hari: string, jam: number) => {
    if (scheduleViewMode === "MASTER") {
      const items = scheduleMap[hari]?.[jam] || [];
      if (items.length === 0) return null;
      const displayMapel = items.map((item) => compactSubjectLabel(item.mapel)).join(" & ");
      const uniqueTeachers = [...new Set(items.flatMap((item) => [item.guru1, item.guru2, item.guru3, item.guru4, item.guru5, item.guru6]))].filter(Boolean) as string[];
      const semantic = classifyJadwalKelasCell({
        items,
        schedules,
        logs: [],
        selectedClass,
        day: hari,
        period: jam,
      });
      const visual = JADWAL_KELAS_CELL_VISUALS[semantic];
      const teacherDisplay = { text: uniqueTeachers.map((name) => getTeacherDisplayName(name)).join(", "), prefix: "" };
      return {
        items,
        editItems: items,
        displayMapel,
        displayMapelFull: items.map((item) => item.mapel).join(" & "),
        teacherDisplay,
        visual,
        date: undefined as string | undefined,
        editable: true,
      };
    }

    const cell = classWeekMap[hari]?.[jam];
    if (!cell || cell.items.length === 0) return null;
    const eventItem = cell.items.find((item) => item.isSuppressedByAcademicCalendar && item.academicEvent);
    if (eventItem?.academicEvent) {
      return {
        items: cell.baseItems,
        editItems: [],
        displayMapel: eventItem.academicEvent.nama_kegiatan,
        displayMapelFull: eventItem.academicEvent.nama_kegiatan,
        teacherDisplay: { text: eventItem.academicEvent.keterangan || eventItem.academicEvent.tipe || "KBM normal ditiadakan", prefix: "" },
        visual: academicEventVisual,
        date: cell.date,
        editable: false,
      };
    }

    const activeItems = cell.items.filter((item) => item.isActive);
    if (activeItems.length === 0) return null;
    const displayItems = activeItems.map((item) => {
      const teachers = item.effectiveTeachers || item.scheduledTeachers || [];
      return {
        ...item,
        guru1: teachers[0] || "",
        guru2: teachers[1] || "",
        guru3: teachers[2] || "",
        guru4: teachers[3] || "",
        guru5: teachers[4] || "",
        guru6: teachers[5] || "",
      } as ScheduleItem;
    });
    const displayMapel = [...new Set(activeItems.map((item) => compactSubjectLabel(item.mapel)).filter(Boolean))].join(" & ");
    const uniqueTeachers: string[] = [...new Set<string>(activeItems.flatMap((item) => item.effectiveTeachers || []).filter(Boolean))];
    let teacherDisplay = { text: uniqueTeachers.map((name) => getTeacherDisplayName(name)).join(", "), prefix: "" };
    let visual = JADWAL_KELAS_CELL_VISUALS.NORMAL;

    if (cell.hasSubstitute) {
      const substitutes: string[] = [...new Set<string>(activeItems.flatMap((item) => item.substituteTeachers || []).filter(Boolean))];
      teacherDisplay = { text: substitutes.map((name) => getTeacherDisplayName(name)).join(", "), prefix: "Badal: " };
      visual = JADWAL_KELAS_CELL_VISUALS.SUBSTITUTE;
    } else if (cell.hasMissingSubstitute) {
      teacherDisplay = { text: "Badal belum ditentukan", prefix: "⚠ " };
      visual = JADWAL_KELAS_CELL_VISUALS.SUBSTITUTE;
    } else if (displayItems.some((item) => parseScheduleClassMode(item.kelasgabung) === "ALTERNATING")) {
      visual = JADWAL_KELAS_CELL_VISUALS.ALTERNATING;
    } else if (cell.isIncidental) {
      visual = incidentalVisual;
    } else {
      const semantic = classifyJadwalKelasCell({
        items: displayItems,
        schedules,
        logs: [],
        selectedClass,
        day: hari,
        period: jam,
      });
      visual = JADWAL_KELAS_CELL_VISUALS[semantic];
    }

    const editable = !cell.isIncidental && cell.baseItems.length > 0;
    return {
      items: displayItems,
      editItems: cell.baseItems,
      displayMapel,
      displayMapelFull: activeItems.map((item) => item.mapel).join(" & "),
      teacherDisplay,
      visual,
      date: cell.date,
      editable,
    };
  };

  // Export an isolated, class-free clone so html2canvas never has to parse
  // Tailwind/Vite OKLCH styles from the live application document.
  const handleDownloadImage = async () => {
    const element = document.getElementById("timetable-capture-area");
    if (!(element instanceof HTMLElement)) return;

    setIsDownloading(true);
    try {
      await downloadElementAsPng(
        element,
        `Jadwal_Kelas_${selectedClass.replace(/\s+/g, "_")}_${scheduleViewMode === "MASTER" ? "Asli" : "Minggu_Ini"}.png`,
      );
    } catch (error) {
      console.error("Gagal mendownload gambar:", error);
      alert(`Gagal mengunduh PNG jadwal. ${getErrorMessage(error, "Silakan coba lagi.")}`);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Navigation Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <button
          id="back-to-dashboard-btn"
          onClick={onBack}
          className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-blue-600 bg-white px-4 py-2 rounded-xl border border-slate-200 hover:border-blue-100 shadow-sm transition-all self-start"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Dashboard
        </button>

        <div className="flex items-center gap-2 text-sm font-medium text-slate-400">
          <span>Jadwal Pelajaran per Kelas</span>
        </div>
      </div>

      {/* Main Section */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        {/* Selector & Search Header */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              Jadwal Lengkap per Kelas
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Pilih kelas lewat menu drop-down atau cari dengan mengetik untuk melihat jadwal mingguan lengkap.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch gap-2.5 w-full md:w-auto">
            {/* Dropdown Selector (Requirement 3) */}
            <div className="w-full sm:w-48">
              <select
                id="kelas-select-dropdown"
                value={selectedClass}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedClass(val);
                  setSearchQuery(val);
                }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-blue-500 focus:outline-none transition-all cursor-pointer font-bold text-slate-700"
              >
                <option value="">-- Pilih Kelas --</option>
                {uniqueClasses.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Existing Search bar with dynamic matching */}
            <div className="relative w-full sm:w-60">
              <div className="relative">
                <input
                  id="kelas-search-input"
                  type="text"
                  placeholder="Cari & Pilih Kelas..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 text-sm border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:outline-none transition-all"
                />
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              </div>

              {showSuggestions && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-100">
                  {filteredClasses.length > 0 ? (
                    filteredClasses.map(c => (
                      <button
                        key={c}
                        id={`kelas-suggest-${c.replace(/\s+/g, '-').toLowerCase()}`}
                        onClick={() => {
                          setSelectedClass(c);
                          setSearchQuery(c);
                          setShowSuggestions(false);
                        }}
                        className="w-full text-left px-4 py-2.5 text-xs hover:bg-blue-50 text-slate-700 font-bold"
                      >
                        {c}
                      </button>
                    ))
                  ) : (
                    searchQuery.trim() === "" && uniqueClasses.map(c => (
                      <button
                        key={c}
                        id={`kelas-suggest-${c.replace(/\s+/g, '-').toLowerCase()}`}
                        onClick={() => {
                          setSelectedClass(c);
                          setSearchQuery(c);
                          setShowSuggestions(false);
                        }}
                        className="w-full text-left px-4 py-2.5 text-xs hover:bg-blue-50 text-slate-700 font-bold"
                      >
                        {c}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {selectedClass ? (
          <div className="space-y-6">
            {/* Master vs effective-week selector */}
            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-xs font-black uppercase tracking-wider text-slate-500">Mode Jadwal Kelas</div>
                <div className="mt-1 text-sm font-semibold text-slate-700">
                  {scheduleViewMode === "MASTER" ? "Jadwal asli / master mingguan" : `Jadwal efektif minggu ini • ${weekRangeLabel}`}
                </div>
              </div>
              <div className="inline-flex rounded-xl bg-slate-100 p-1" role="group" aria-label="Pilih mode jadwal kelas">
                <button
                  type="button"
                  onClick={() => setScheduleViewMode("MASTER")}
                  className={`rounded-lg px-4 py-2 text-xs font-black transition ${scheduleViewMode === "MASTER" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                >
                  Jadwal Asli
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleViewMode("THIS_WEEK")}
                  className={`rounded-lg px-4 py-2 text-xs font-black transition ${scheduleViewMode === "THIS_WEEK" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                >
                  Minggu Ini
                </button>
              </div>
            </div>

            {/* Download Button Row */}
            <div className="flex justify-end gap-3 flex-wrap">
              <button
                id="download-timetable-png-btn"
                onClick={handleDownloadImage}
                disabled={isDownloading}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-sm transition-all cursor-pointer"
              >
                {isDownloading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Menyiapkan Berkas...
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    Unduh Jadwal Kelas (PNG)
                  </>
                )}
              </button>
            </div>

            {/* CAPTURE PORTION (TIMETABLE WRAPPER) */}
            <div 
              id="timetable-capture-area" 
              className="p-8 border border-slate-100 rounded-2xl bg-white space-y-6 shadow-xs"
            >
              {/* Prestigious Professional School Header (Requirement 6) */}
              <div className="text-center pb-6 border-b-2 border-slate-200">
                <div className="text-xs font-black text-blue-600 tracking-widest uppercase mb-1">
                  AL-WILDAN ISLAMIC SCHOOL 10 JAKARTA
                </div>
                <h1 className="text-2xl font-black text-slate-800 tracking-tight">
                  {scheduleViewMode === "MASTER" ? "SCHOOL TIMETABLE CLASS" : "EFFECTIVE WEEK TIMETABLE CLASS"} ({selectedClass.toUpperCase()})
                </h1>
                <div className="text-xs font-bold text-slate-500 tracking-wider mt-1">
                  {scheduleViewMode === "MASTER" ? "ACADEMIC YEAR 2026/2027" : `MINGGU ${weekRangeLabel.toUpperCase()}`}
                </div>
              </div>

              {/* Class Info Cards */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-5 bg-slate-50 rounded-2xl gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-slate-800">{selectedClass}</h3>
                    <span className={`text-xs font-extrabold px-2.5 py-0.5 rounded-full ${
                      classType === "Ikhwan" 
                        ? "bg-slate-200 text-slate-800 border border-slate-300" 
                        : classType === "Akhwat" 
                          ? "bg-purple-100 text-purple-800 border border-purple-200" 
                          : "bg-blue-100 text-blue-800 border border-blue-200"
                    }`}>
                      Kelas {classType}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-slate-500 mt-1.5">
                    Istirahat: {classType === "Ikhwan" ? "09:40 - 10:00" : classType === "Akhwat" ? "08:40 - 09:00" : "Ikhwan: 09:40 - 10:00, Akhwat: 08:40 - 09:00"}
                  </p>
                  <p className="text-xs font-medium text-slate-500">
                    Ishoma: 12:00 - 13:00 (Harian)
                  </p>
                </div>

                <div className="bg-slate-900 text-white px-5 py-3 rounded-xl shadow-xs text-center min-w-[120px]">
                  <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">Durasi</span>
                  <span className="text-2xl font-black">5 Hari</span>
                  <span className="block text-[10px] text-slate-400">Senin - Jumat</span>
                </div>
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-bold text-slate-500 p-3.5 border border-slate-100 rounded-xl bg-slate-50/50">
                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded bg-blue-50 border border-blue-200"></span>Normal</span>
                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded bg-emerald-50 border border-emerald-200"></span>Kelas Gabung</span>
                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded bg-violet-50 border border-violet-200"></span>Kelas Bergantian</span>
                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded bg-red-50 border border-red-200"></span>Bentrok</span>
                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded bg-yellow-50 border border-yellow-300"></span>Guru Badal (minggu berjalan)</span>
                {scheduleViewMode === "THIS_WEEK" && <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded bg-indigo-50 border border-indigo-300"></span>Jadwal Insidental</span>}
                {scheduleViewMode === "THIS_WEEK" && <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded bg-rose-50 border border-rose-300"></span>Kalender Akademik</span>}
                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded bg-slate-100 border border-slate-200"></span>Istirahat / Ishoma Ikhwan</span>
                <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded bg-purple-100 border border-purple-200"></span>Istirahat / Ishoma Akhwat</span>
              </div>

              {/* DESKTOP 2D GRID TABLE WITH DYNAMIC CHRONOLOGICAL COLUMNS */}
              <div data-export-expand-scroll="true" className="hidden md:block overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full border-collapse text-left table-fixed min-w-[1050px]">
                  <colgroup>
                    <col className="w-28" />
                    <col />
                    <col />
                    <col />
                    <col />
                    <col />
                    <col />
                    <col />
                    <col />
                  </colgroup>
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200">
                      <th className="p-4 text-xs font-extrabold text-slate-400 uppercase tracking-wider text-center w-28 border-r border-slate-200">
                        Hari \ Jam
                      </th>
                      {columns.map((col, idx) => (
                        <th 
                          key={`col-head-${idx}`} 
                          className={`p-4 text-xs font-extrabold uppercase tracking-wider text-center border-r border-slate-200 last:border-0 ${
                            col.type === "break" || col.type === "ishoma"
                              ? classType === "Akhwat"
                                ? "bg-purple-100/40 text-purple-900 border-r-purple-200"
                                : "bg-slate-100 text-slate-900 border-r-slate-200"
                              : "text-slate-600"
                          }`}
                        >
                          <div>{col.label}</div>
                          <div className="text-[10px] font-semibold mt-1 opacity-75">{col.timeRange}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {/* 1. Monday to Thursday Rows */}
                    {["Senin", "Selasa", "Rabu", "Kamis"].map(hari => (
                      <tr key={hari} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-4 font-black text-slate-700 bg-slate-100/50 text-center border-r border-slate-200">
                          <div>{hari}</div>
                          {scheduleViewMode === "THIS_WEEK" && weekDateByDay[hari] && <div className="mt-0.5 text-[9px] font-bold text-slate-400">{weekDateByDay[hari].split("-").reverse().join("/")}</div>}
                        </td>

                        {/* Render Cells chronologically */}
                        {columns.map((col, idx) => {
                          if (col.type === "jp" && col.jpNumber !== undefined) {
                            const jam = col.jpNumber;
                            const cellData = getClassCellData(hari, jam);

                            if (cellData) {
                              const { items, editItems, displayMapel, displayMapelFull, teacherDisplay, visual, date, editable } = cellData;
                              const displayGuru = teacherDisplay.text;

                              return (
                                <td 
                                  key={`cell-${idx}`} 
                                  onClick={() => setSelectedDetail({
                                    hari,
                                    jam,
                                    waktu: col.timeRange,
                                    items,
                                  })}
                                  className={`relative p-3 border-r border-slate-200 text-center transition-all align-middle cursor-pointer hover:scale-[1.01] hover:shadow-xs active:scale-[0.98] ${visual.desktop}`}
                                  data-export-cell="true"
                                  title={`${visual.legend} • Klik untuk detail pelajaran & pengampu`}
                                >
                                  {isAdmin && onEditSchedule && editable && (
                                    <button
                                      type="button"
                                      onClick={(event) => { event.stopPropagation(); onEditSchedule(editItems, { initialDate: date }); }}
                                      className="absolute right-1.5 top-1.5 rounded-lg border border-blue-200 bg-white/90 p-1 text-blue-700 shadow-sm hover:bg-blue-50"
                                      data-export-ignore="true"
                                      title="Quick Edit — permanen atau insidental"
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </button>
                                  )}
                                  <div className="font-extrabold text-xs sm:text-sm leading-tight text-slate-800" title={displayMapelFull}>{displayMapel}</div>
                                  <div className={`text-[10px] font-bold mt-1 line-clamp-2 ${visual.teacherText}`} data-export-expand-text="true" title={displayGuru}>
                                    {teacherDisplay.prefix}{displayGuru || "Tanpa Guru"}
                                  </div>
                                  {visual.label && <div className="text-[9px] mt-1 font-black uppercase tracking-wide opacity-75">{visual.label}</div>}
                                  <div className="text-[9px] mt-0.5 text-slate-400 font-bold">
                                    {col.timeRange}
                                  </div>
                                </td>
                              );
                            } else {
                              return (
                                <td key={`cell-${idx}`} className="p-3 border-r border-slate-200 bg-slate-50/20 text-center text-xs text-slate-300 italic align-middle">
                                  <div className="font-medium">Kosong</div>
                                  <div className="text-[9px] mt-0.5 text-slate-400">{col.timeRange}</div>
                                </td>
                              );
                            }
                          } else if (col.type === "break" || col.type === "ishoma") {
                            const colors = getBreakColors(classType);

                            return (
                              <td 
                                key={`cell-${idx}`} 
                                className={`p-3 border-r border-slate-200 text-center transition-all align-middle ${colors.bg}`}
                              >
                                <div className="text-[10px] font-extrabold tracking-tight uppercase">{col.label}</div>
                                <div className="text-[9px] font-bold opacity-80 mt-0.5">{col.timeRange}</div>
                              </td>
                            );
                          }
                          return null;
                        })}
                      </tr>
                    ))}

                    {/* 2. Special Separator for Friday */}
                    <tr className="bg-slate-200 border-y border-slate-300">
                      <td colSpan={9} className="p-3 font-black text-xs uppercase tracking-wider text-slate-800 text-center bg-slate-200 select-none">
                        KHUSUS HARI JUM'AT
                      </td>
                    </tr>

                    {/* 3. Friday Column Headers Row */}
                    <tr className="bg-slate-100 border-b border-slate-200">
                      <th className="p-3 text-xs font-extrabold text-slate-400 uppercase tracking-wider text-center w-28 border-r border-slate-200">
                        HARI/JAM
                      </th>
                      {fridayColumns.map((col, idx) => (
                        <th 
                          key={`fri-col-head-${idx}`} 
                          className={`p-3 text-xs font-extrabold uppercase tracking-wider text-center border-r border-slate-200 last:border-0 ${
                            col.type === "break" || col.type === "ishoma"
                              ? classType === "Akhwat"
                                ? "bg-purple-100/40 text-purple-900 border-r-purple-200"
                                : "bg-slate-100 text-slate-900 border-r-slate-200"
                              : "text-slate-600"
                          }`}
                        >
                          <div>{col.label}</div>
                          <div className="text-[10px] font-semibold mt-1 opacity-75">{col.timeRange}</div>
                        </th>
                      ))}
                    </tr>

                    {/* 4. Friday Row */}
                    <tr className="hover:bg-slate-50/50 transition-colors bg-blue-50/5">
                      <td className="p-4 font-black text-slate-700 bg-slate-100/50 text-center border-r border-slate-200">
                        <div>Jumat</div>
                        {scheduleViewMode === "THIS_WEEK" && weekDateByDay.Jumat && <div className="mt-0.5 text-[9px] font-bold text-slate-400">{weekDateByDay.Jumat.split("-").reverse().join("/")}</div>}
                      </td>
                      {fridayColumns.map((col, idx) => {
                        let showAsPulang = false;
                        
                        // Rule a: Untuk kelas 1 dan 2 (isG12Class): setelah jam ke-3, semua sel dikosongkan
                        if (isG12Class) {
                          if (col.label === "Al-Kahfi" || col.type === "ishoma" || (col.type === "jp" && col.jpNumber !== undefined && col.jpNumber >= 4)) {
                            showAsPulang = true;
                          }
                        }
                        
                        // Rule b: Untuk kelas 3 sampai 11 (!isG12Class && !isGrade12Class): setelah Al-Kahfi, semua sel dikosongkan
                        if (!isG12Class && !isGrade12Class) {
                          if (col.type === "ishoma" || (col.type === "jp" && col.jpNumber !== undefined && col.jpNumber >= 4)) {
                            showAsPulang = true;
                          }
                        }

                        if (showAsPulang) {
                          return (
                            <td key={`cell-fri-${idx}`} className="p-3 border-r border-slate-200 bg-slate-50/20 text-center text-xs text-slate-300 italic align-middle select-none">
                              <div className="font-semibold text-slate-400">Pulang</div>
                              <div className="text-[9px] mt-0.5 text-slate-400">{col.timeRange}</div>
                            </td>
                          );
                        }

                        if (col.type === "jp" && col.jpNumber !== undefined) {
                          const jam = col.jpNumber;
                          const cellData = getClassCellData("Jumat", jam);

                          if (cellData) {
                            const { items, editItems, displayMapel, displayMapelFull, teacherDisplay, visual, date, editable } = cellData;
                            const displayGuru = teacherDisplay.text;

                            return (
                              <td 
                                key={`cell-fri-${idx}`} 
                                onClick={() => setSelectedDetail({
                                  hari: "Jumat",
                                  jam,
                                  waktu: col.timeRange,
                                  items,
                                })}
                                className={`relative p-3 border-r border-slate-200 text-center transition-all align-middle cursor-pointer hover:scale-[1.01] hover:shadow-xs active:scale-[0.98] ${visual.desktop}`}
                                data-export-cell="true"
                                title={`${visual.legend} • Klik untuk detail pelajaran & pengampu`}
                              >
                                {isAdmin && onEditSchedule && editable && (
                                  <button
                                    type="button"
                                    onClick={(event) => { event.stopPropagation(); onEditSchedule(editItems, { initialDate: date }); }}
                                    className="absolute right-1.5 top-1.5 rounded-lg border border-blue-200 bg-white/90 p-1 text-blue-700 shadow-sm hover:bg-blue-50"
                                    data-export-ignore="true"
                                      title="Quick Edit — permanen atau insidental"
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                )}
                                <div className="font-extrabold text-xs sm:text-sm leading-tight text-slate-800" title={displayMapelFull}>{displayMapel}</div>
                                <div className={`text-[10px] font-bold mt-1 line-clamp-2 ${visual.teacherText}`} data-export-expand-text="true" title={displayGuru}>
                                  {teacherDisplay.prefix}{displayGuru || "Tanpa Guru"}
                                </div>
                                {visual.label && <div className="text-[9px] mt-1 font-black uppercase tracking-wide opacity-75">{visual.label}</div>}
                                <div className="text-[9px] mt-0.5 text-slate-400 font-bold">
                                  {col.timeRange}
                                </div>
                              </td>
                            );
                          } else {
                            return (
                              <td key={`cell-fri-${idx}`} className="p-3 border-r border-slate-200 bg-slate-50/20 text-center text-xs text-slate-300 italic align-middle">
                                <div className="font-medium">Kosong</div>
                                <div className="text-[9px] mt-0.5 text-slate-400">{col.timeRange}</div>
                              </td>
                            );
                          }
                        } else if (col.type === "break" || col.type === "ishoma") {
                          const colors = getBreakColors(classType);
                          return (
                            <td 
                              key={`cell-fri-${idx}`} 
                              className={`p-3 border-r border-slate-200 text-center transition-all align-middle ${colors.bg}`}
                            >
                              <div className="text-[10px] font-extrabold tracking-tight uppercase">{col.label}</div>
                              <div className="text-[9px] font-bold opacity-80 mt-0.5">{col.timeRange}</div>
                            </td>
                          );
                        }
                        return null;
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* MOBILE LAYOUT WITH CHRONOLOGICAL CARDS */}
              <div className="block md:hidden space-y-4">
                {HARI_LIST.map(hari => {
                  return (
                    <div key={hari} className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs bg-white">
                      <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex justify-between items-center">
                        <div>
                          <span className="font-bold text-slate-800">{hari}</span>
                          {scheduleViewMode === "THIS_WEEK" && weekDateByDay[hari] && <div className="text-[9px] font-bold text-slate-400">{weekDateByDay[hari].split("-").reverse().join("/")}</div>}
                        </div>
                        <span className="text-xs text-blue-600 bg-blue-50 font-black px-2.5 py-0.5 rounded-full">
                          {scheduleViewMode === "MASTER" ? "Jadwal Asli" : "Minggu Ini"}
                        </span>
                      </div>

                      <div className="p-4 space-y-3 bg-white">
                        {(() => {
                          const isFriday = hari === "Jumat";
                          const currentCols = isFriday ? fridayColumns : columns;
                          return currentCols.map((col, idx) => {
                            let showAsPulang = false;
                            if (isFriday) {
                              if (isG12Class) {
                                if (col.label === "Al-Kahfi" || col.type === "ishoma" || (col.type === "jp" && col.jpNumber !== undefined && col.jpNumber >= 4)) {
                                  showAsPulang = true;
                                }
                              }
                              if (!isG12Class && !isGrade12Class) {
                                if (col.type === "ishoma" || (col.type === "jp" && col.jpNumber !== undefined && col.jpNumber >= 4)) {
                                  showAsPulang = true;
                                }
                              }
                            }

                            if (showAsPulang) {
                              return (
                                <div 
                                  key={`mob-cell-${idx}`}
                                  className="p-2.5 rounded-lg border border-dashed border-slate-200 bg-slate-50/30 text-slate-400 text-xs italic flex justify-between"
                                >
                                  <span className="font-medium text-slate-400">
                                    {col.type === "jp" ? `Jam ${col.jpNumber}` : col.label} ({col.timeRange})
                                  </span>
                                  <span className="font-semibold text-slate-500">Pulang</span>
                                </div>
                              );
                            }

                            if (col.type === "jp" && col.jpNumber !== undefined) {
                              const jam = col.jpNumber;
                              const cellData = getClassCellData(hari, jam);

                              if (cellData) {
                                const { items, editItems, displayMapel, displayMapelFull, teacherDisplay, visual, date, editable } = cellData;
                                const displayGuru = teacherDisplay.text;

                                return (
                                  <div 
                                    key={`mob-cell-${idx}`}
                                    onClick={() => setSelectedDetail({
                                      hari,
                                      jam,
                                      waktu: col.timeRange,
                                      items,
                                    })}
                                    className={`relative p-3 rounded-lg border flex items-center justify-between gap-3 cursor-pointer hover:ring-2 transition-all active:scale-[0.98] ${visual.mobile}`}
                                    title={`${visual.legend} • Klik untuk detail pelajaran & pengampu`}
                                  >
                                    {isAdmin && onEditSchedule && editable && (
                                      <button
                                        type="button"
                                        onClick={(event) => { event.stopPropagation(); onEditSchedule(editItems, { initialDate: date }); }}
                                        className="absolute right-2 top-2 rounded-lg border border-blue-200 bg-white/90 p-1.5 text-blue-700 shadow-sm hover:bg-blue-50"
                                        data-export-ignore="true"
                                      title="Quick Edit — permanen atau insidental"
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                    <div>
                                      <span className={`text-[9px] font-extrabold uppercase bg-white px-1.5 py-0.5 rounded mr-2 border shadow-3xs ${visual.periodBadge}`}>
                                        Jam {jam}
                                      </span>
                                      <span className="text-xs font-semibold text-slate-500">
                                        {col.timeRange}
                                      </span>
                                      <h4 className="font-bold text-slate-800 text-sm mt-1" title={displayMapelFull}>{displayMapel}</h4>
                                      <p className="text-xs opacity-95 text-slate-600 mt-1 font-medium">
                                        {teacherDisplay.prefix || "Guru: "}<span className={`font-bold ${visual.teacherText}`}>{displayGuru || "Tanpa Guru"}</span>
                                      </p>
                                      {visual.label && <span className="mt-1 inline-block text-[9px] font-black uppercase tracking-wide opacity-75">{visual.label}</span>}
                                    </div>
                                  </div>
                                );
                              } else {
                                return (
                                  <div 
                                    key={`mob-cell-${idx}`}
                                    className="p-2.5 rounded-lg border border-dashed border-slate-200 bg-slate-50/30 text-slate-400 text-xs italic flex justify-between"
                                  >
                                    <span className="font-medium text-slate-400">Jam {jam} ({col.timeRange})</span>
                                    <span className="font-semibold text-slate-400">Kosong</span>
                                  </div>
                                );
                              }
                            } else if (col.type === "break" || col.type === "ishoma") {
                              const colors = getBreakColors(classType);

                              return (
                                <div 
                                  key={`mob-cell-${idx}`}
                                  className={`p-3 rounded-lg border flex items-center justify-between ${colors.bgMobile}`}
                                >
                                  <div className="flex items-center gap-2">
                                    <span className={`animate-pulse w-2 h-2 rounded-full ${colors.pulse}`}></span>
                                    <span className="text-xs font-black uppercase tracking-wide">{col.label}</span>
                                  </div>
                                  <span className={`text-xs font-extrabold px-2 py-0.5 rounded-md ${colors.badge}`}>
                                    {col.timeRange}
                                  </span>
                                </div>
                              );
                            }
                            return null;
                          });
                        })()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-10">
            <AlertCircle className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-slate-500 font-medium">Belum memilih kelas</p>
            <p className="text-xs text-slate-400 mt-1">Silakan pilih kelas melalui menu drop-down atau cari kelas pada kolom pencarian di atas.</p>
          </div>
        )}
      </div>

      {/* Edit Companion Teacher Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-100 overflow-hidden">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-5">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-widest bg-blue-600 px-2.5 py-0.5 rounded-full">
                    Atur Team Teaching
                  </span>
                  <h3 className="text-lg font-black mt-2 leading-tight">
                    {editingItem.kelas} &bull; {editingItem.mapel}
                  </h3>
                  <p className="text-xs text-slate-400 font-medium mt-1">
                    Hari {editingItem.hari}, Jam ke-{editingItem.jam_ke} ({editingItem.mulai} - {editingItem.selesai})
                  </p>
                </div>
                <button
                  onClick={() => {
                    setEditingItem(null);
                    setEditingError(null);
                  }}
                  className="p-1 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-white"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {/* Error Alert inside Modal */}
              {editingError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold p-3.5 rounded-xl flex items-center gap-2 animate-bounce">
                  <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0"></span>
                  <span>{editingError}</span>
                </div>
              )}

              {/* List of Teachers */}
              <div className="space-y-3">
                <h4 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">
                  Daftar Guru Aktif
                </h4>

                <div className="space-y-2 divide-y divide-slate-100">
                  {/* Guru 1: Main Teacher */}
                  <div className="flex justify-between items-center py-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                      <div>
                        <span className="text-xs font-bold text-slate-800">
                          {editingItem.guru1 || "Tanpa Guru Utama"}
                        </span>
                        <span className="block text-[10px] font-extrabold text-emerald-600 uppercase tracking-wide">
                          Guru Utama (Main Teacher)
                        </span>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">
                      {teacherJpMap[editingItem.guru1?.trim()] || 0} JP
                    </span>
                  </div>

                  {/* Guru 2 - Guru 6: Companions */}
                  {(['guru2', 'guru3', 'guru4', 'guru5', 'guru6'] as const).map((field, idx) => {
                    const name = editingItem[field]?.trim();
                    if (!name) return null;

                    return (
                      <div key={field} className="flex justify-between items-center py-2 pt-2.5">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                          <div>
                            <span className="text-xs font-bold text-slate-800">{name}</span>
                            <span className="block text-[10px] font-extrabold text-blue-600 uppercase tracking-wide">
                              Companion {idx + 1}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 animate-fade-in">
                          <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">
                            {teacherJpMap[name] || 0} JP
                          </span>
                          <button
                            onClick={() => handleRemoveCompanion(editingItem.id, field)}
                            className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                            title="Hapus Guru Pendamping"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Add Companion Teacher Select Input */}
              <div className="space-y-2">
                <label className="text-xs font-extrabold text-slate-400 uppercase tracking-wider block">
                  Tambah Guru Pendamping (Team Teaching)
                </label>
                <div className="relative">
                  <select
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 bg-slate-50 text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer text-slate-700 font-bold"
                    onChange={(e) => {
                      if (e.target.value) {
                        handleAddCompanion(editingItem.id, e.target.value);
                        e.target.value = ""; // reset
                      }
                    }}
                  >
                    <option value="">-- Pilih Guru --</option>
                    {availableTeachers
                      .filter(t => {
                        const currentTeachers = [
                          editingItem.guru1,
                          editingItem.guru2,
                          editingItem.guru3,
                          editingItem.guru4,
                          editingItem.guru5,
                          editingItem.guru6
                        ].map(name => name?.trim().toLowerCase());
                        
                        if (currentTeachers.includes((t.nama || "").trim().toLowerCase())) {
                          return false;
                        }

                        // Ensure teacher doesn't have teaching duties (as guru1-guru6) in other slots at the same day and period
                        const isTeachingAtSameTime = schedules.some(s => {
                          const sameDay = isSameDay(s.hari, editingItem.hari);
                          const samePeriod = Number(s.jam_ke) === Number(editingItem.jam_ke);
                          if (!sameDay || !samePeriod) return false;

                          const teachersInSlot = [s.guru1, s.guru2, s.guru3, s.guru4, s.guru5, s.guru6]
                            .map(name => name?.trim().toLowerCase())
                            .filter(Boolean);

                          return teachersInSlot.includes((t.nama || "").trim().toLowerCase());
                        });

                        return !isTeachingAtSameTime;
                      })
                      .map(t => (
                        <option key={t.nama} value={t.nama}>
                          {t.nama} {t.panggilan ? `(${t.panggilan})` : ""} &bull; {t.jp} JP
                        </option>
                      ))
                    }
                  </select>
                </div>
                <p className="text-[10px] text-slate-400 font-semibold">
                  Masing-masing nama guru dilengkapi dengan total JP mengajar minggu ini.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 px-6 py-4 flex justify-end">
              <button
                onClick={() => {
                  setEditingItem(null);
                  setEditingError(null);
                }}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Pop-up Modal */}
      {selectedDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-5 flex justify-between items-start shrink-0">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-widest bg-blue-600 px-2.5 py-0.5 rounded-full">
                  Detail Pelajaran
                </span>
                <h3 className="text-xl font-black mt-2 leading-tight flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-blue-400" />
                  Hari {selectedDetail.hari}, Jam ke-{selectedDetail.jam}
                </h3>
                <p className="text-xs text-slate-400 font-medium mt-1 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  Waktu: {selectedDetail.waktu}
                </p>
              </div>
              <button
                onClick={() => setSelectedDetail(null)}
                className="p-1 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 overflow-y-auto">
              <div className="space-y-4">
                {(() => {
                  interface GroupedScheduleItem {
                    mapel: string;
                    kelasNames: string[];
                    ruangan?: string;
                    keterangan_khusus?: string;
                    kelasgabung: boolean;
                    isBergantian: boolean;
                    teachers: string[];
                    originalItem: ScheduleItem;
                  }
                  
                  const groupedItems: GroupedScheduleItem[] = [];

                  selectedDetail.items.forEach(item => {
                    const itemTeachers = [
                      item.guru1,
                      item.guru2,
                      item.guru3,
                      item.guru4,
                      item.guru5,
                      item.guru6
                    ].map(g => g?.trim()).filter(Boolean);

                    // Find if we already have a group with the same mapel and teachers
                    const existingGroup = groupedItems.find(g => {
                      const isSameMapel = g.mapel.trim().toLowerCase() === item.mapel.trim().toLowerCase();
                      const isSameTeachers = g.teachers.length === itemTeachers.length &&
                        g.teachers.every((t, i) => t.toLowerCase() === itemTeachers[i].toLowerCase());
                      return isSameMapel && isSameTeachers;
                    });

                    const isItemKelasGabung = item.kelasgabung && (
                      item.kelasgabung.trim().toLowerCase() === "ya" || 
                      item.kelasgabung.trim().toLowerCase() === "iya"
                    );
                    const isItemBergantian = item.kelasgabung && (
                      item.kelasgabung.trim().toLowerCase() === "bergantian"
                    );

                    if (existingGroup) {
                      if (!existingGroup.kelasNames.includes(item.kelas)) {
                        existingGroup.kelasNames.push(item.kelas);
                      }
                      if (isItemKelasGabung) {
                        existingGroup.kelasgabung = true;
                      }
                      if (isItemBergantian) {
                        existingGroup.isBergantian = true;
                      }
                      if (item.ruangan && !existingGroup.ruangan?.includes(item.ruangan)) {
                        existingGroup.ruangan = existingGroup.ruangan ? `${existingGroup.ruangan}, ${item.ruangan}` : item.ruangan;
                      }
                      if (item.keterangan_khusus && !existingGroup.keterangan_khusus?.includes(item.keterangan_khusus)) {
                        existingGroup.keterangan_khusus = existingGroup.keterangan_khusus ? `${existingGroup.keterangan_khusus}, ${item.keterangan_khusus}` : item.keterangan_khusus;
                      }
                    } else {
                      groupedItems.push({
                        mapel: item.mapel,
                        kelasNames: [item.kelas],
                        ruangan: item.ruangan,
                        keterangan_khusus: item.keterangan_khusus,
                        kelasgabung: isItemKelasGabung,
                        isBergantian: isItemBergantian,
                        teachers: itemTeachers,
                        originalItem: item
                      });
                    }
                  });

                  return groupedItems.map((group, idx) => {
                    return (
                      <div key={idx} className="p-4 bg-slate-50 border border-slate-200/60 rounded-xl space-y-4">
                        {/* Subject & Class Details */}
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="text-lg font-bold text-slate-800 flex items-center gap-1.5">
                              <GraduationCap className="w-5 h-5 text-blue-600 shrink-0" />
                              {group.mapel}
                            </h4>
                            <span className="bg-blue-100 text-blue-800 text-xs font-black px-2.5 py-1 rounded-lg text-right max-w-[200px]">
                              Kelas {group.kelasNames.join(", ")}
                            </span>
                          </div>
                          {group.ruangan && (
                            <span className="text-xs text-slate-500 font-medium mt-1 block">
                              Ruangan: <span className="font-semibold text-slate-700">{getRoomDisplayName(group.ruangan, masterRuangan)}</span>
                            </span>
                          )}
                          {group.keterangan_khusus && (
                            <span className="text-xs text-indigo-600 font-medium mt-1 block bg-indigo-50/50 p-2 rounded-lg border border-indigo-100/30">
                              Keterangan Khusus: <span className="font-bold text-indigo-700">{group.keterangan_khusus}</span>
                            </span>
                          )}
                          {group.kelasgabung && (
                            <span className="mt-1.5 text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded uppercase tracking-wider inline-block mr-1">
                              Kelas Gabung
                            </span>
                          )}
                          {group.isBergantian && (
                            <span className="mt-1.5 text-[10px] bg-violet-100 text-violet-900 border border-violet-200 font-bold px-2 py-0.5 rounded uppercase tracking-wider inline-block">
                              Kelas Bergantian
                            </span>
                          )}
                        </div>

                        {/* Teachers Info */}
                        <div className="space-y-2">
                          <span className="text-xs font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                            <Users className="w-3.5 h-3.5 text-slate-400" />
                            Guru Pengampu (Team Teaching)
                          </span>

                          <div className="space-y-2">
                            {group.teachers.map((teacherName, tIdx) => {
                              const isMainTeacher = tIdx === 0;
                              const displayName = getTeacherDisplayName(teacherName);
                              return (
                                <div key={tIdx} className="flex items-center gap-3 bg-white p-2.5 rounded-lg border border-slate-100">
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                                    isMainTeacher ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "bg-blue-50 text-blue-600 border border-blue-200"
                                  }`}>
                                    {teacherName.charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <span className="text-xs font-bold text-slate-800 block">
                                      {teacherName} {displayName && displayName !== teacherName ? `(${displayName})` : ""}
                                    </span>
                                    <span className="text-[10px] font-bold text-slate-400 block uppercase tracking-wide">
                                      {isMainTeacher ? "Guru Utama (Main)" : `Guru Partner ${tIdx}`}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                            {group.teachers.length === 0 && (
                              <p className="text-xs text-slate-400 italic">Tidak ada guru terdaftar</p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex justify-between items-center shrink-0">
              {isAdmin ? (
                <button
                  onClick={() => {
                    onEditSchedule?.(selectedDetail.items);
                    setSelectedDetail(null);
                  }}
                  disabled={!onEditSchedule}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Quick Edit Jadwal
                </button>
              ) : (
                <div />
              )}
              <button
                onClick={() => setSelectedDetail(null)}
                className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition-all cursor-pointer"
              >
                Tutup Detail
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
