import React, { useState, useEffect, useRef } from "react";
import { TeacherHeaderSearch } from "./components/ui/TeacherHeaderSearch";
import { AdminLoginModal } from "./components/ui/AdminLoginModal";
import { 
  Teacher, ScheduleItem, LogIzinItem, ActivePage, JadwalInsidentalItem, MasterRuanganItem, KalenderAkademikItem 
} from "./types";
import { Dashboard } from "./components/Dashboard";
import { JadwalLengkap } from "./components/JadwalLengkap";
import { JadwalKelas } from "./components/JadwalKelas";
import { JadwalRuangan } from "./components/JadwalRuangan";
import { ListMapel } from "./components/ListMapel";
import { ListGuruKelas } from "./components/ListGuruKelas";
import { JamKosongIndividu } from "./components/JamKosongIndividu";
import { JamKosongSemua } from "./components/JamKosongSemua";
import { InputGuruPengganti } from "./components/InputGuruPengganti";
import { LogGuruPengganti } from "./components/LogGuruPengganti";
import { StatistikGuruPengganti } from "./components/StatistikGuruPengganti";
import { RekapGuru } from "./components/RekapGuru";
import { TabelJamKosong } from "./components/TabelJamKosong";
import { LeaveRequestForm } from "./components/LeaveRequestForm";
import { LeaveApprovalAdmin } from "./components/LeaveApprovalAdmin";
import { ApprovedLeaveMaintenanceAdmin } from "./components/ApprovedLeaveMaintenanceAdmin";
import { LateTaskCompletion } from "./components/LateTaskCompletion";
import { AdminMasterData } from "./components/AdminMasterData";
import { ScheduleMassImporter } from "./components/ScheduleMassImporter";
import { SyaikhScheduleMassImporter } from "./components/SyaikhScheduleMassImporter";
import { ScheduleQuickEditor } from "./components/ScheduleQuickEditor";
import { SubstituteConstraintAdmin } from "./components/SubstituteConstraintAdmin";
import { AcademicCalendarAdmin } from "./components/AcademicCalendarAdmin";
import { OperationalCalendarV319Admin } from "./components/OperationalCalendarV319Admin";
import { EducationCalendar } from "./components/EducationCalendar";
import { EducationCalendarAdmin } from "./components/EducationCalendarAdmin";
import { IncidentalScheduleAdmin } from "./components/IncidentalScheduleAdmin";
import { ScheduleControlCenter } from "./components/ScheduleControlCenter";
import { OperationalActionCenter } from "./components/OperationalActionCenter";
import { ManagementAnalytics } from "./components/ManagementAnalytics";
import { TeacherIndividualStatistics } from "./components/TeacherIndividualStatistics";
import { 
  ShieldAlert, ShieldCheck, Database, LogOut, 
  HelpCircle, Wifi, WifiOff, RefreshCw, Layers,
  Menu, X, Home, Calendar, BookOpen, Clock, Users, UserPlus, 
  History, BarChart2, BarChart3, Upload, ClipboardList, Table, GraduationCap, Building2,
  ChevronLeft, ChevronRight, PanelLeft, PanelLeftClose, PanelLeftOpen, ClipboardCheck, FileUp, Ban, CalendarDays, CalendarPlus2, GitBranch, BellRing, CalendarRange
} from "lucide-react";
import { AdminAccount } from "./types";
import { isSupabaseConfigured } from "./infrastructure/supabase/client";
import { getCurrentUserContext, signInWithPassword, signOut } from "./infrastructure/auth/supabaseAuthRepository";
import { SupabaseScheduleRepository } from "./infrastructure/repositories/supabaseScheduleRepository";
import { SupabasePublicScheduleRepository } from "./infrastructure/repositories/supabasePublicScheduleRepository";
import { SupabaseSubstituteConstraintRepository } from "./infrastructure/repositories/supabaseSubstituteConstraintRepository";
import { SupabaseInvalWriteRepository } from "./infrastructure/repositories/supabaseInvalWriteRepository";
import { buildInvalWriteBundle, type InvalWriteMetadata } from "./domain/inval/invalWrite";
import { getSchoolTodayISO, isTaskRecoveryDateActive } from "./domain/date";
import type { SubstituteConstraint } from "./domain/substituteAvailability";

import { T, useLanguage } from './i18n/LanguageProvider';
import { LanguageSelector } from './i18n/LanguageSelector';
const DEFAULT_API_URL = "https://script.google.com/macros/s/AKfycbweCcMn4d389P4vyTFf6qM17pxNWfjzqYnTcMEkAtjak8NFXzM0tqt7Nb5xDdx5hbn2jw/exec";

const OLD_DEFAULT_API_URLS = [
  "https://script.google.com/macros/s/AKfycbyvr4Giwx_xWK8FxXAF38dO2ilNSTeS0A7BupO_bF4S7otg66Z_W1Kr6zL0J3Q7Ln3XZg/exec",
  "https://script.google.com/macros/s/AKfycbwJTUGhRvtfXTitbQcs0S6ACB3l_6VQt8BYxbJuOUh8zQiSKXYsIR0zFHmcoZt-8_Jj/exec",
  "https://script.google.com/macros/s/AKfycbyhxTnbSgDi8btZ4L4PKuUxaFvbQUzF-iqmaCgGTM_rCdXGHZubYe-S5qUf92tTkOhKlg/exec",
  "https://script.google.com/macros/s/AKfycbx-Gb7Nd2i0nprHxZ5I7D5qrmfVmnAikdhsFXhoAa-voWIsD2d7l-Cnn8iHjPCyeFi3oQ/exec",
  "https://script.google.com/macros/s/AKfycbyFzDIDUnJV5x3qCtOu5B7iW5ZsLTB7Dv4RWB-2mh3LqEhCN9ePlEG6TiVMUSck1blZag/exec",
  "https://script.google.com/macros/s/AKfycbykdgn4RIJ278Vi72882tBzscRStDgq3djQV1fMhuuoZlKyogbxjZaqwHY3sBW_bDaIgw/exec",
  "https://script.google.com/macros/s/AKfycbypksJLLcqS_unneCbLB06gcWYfW9QMrJHBnsn9LeE3KfyAzLsJ-k1sU3zTvUs1uMV2rQ/exec",
  "https://script.google.com/macros/s/AKfycbz7L-wryLIq0XAg9CPsFT3FvuRpegD8YjFut_Z6edLctqHfNP1xiRDM38P1PLSkecME/exec",
  "https://script.google.com/macros/s/AKfycbyqmK6N1Fzkm5irhbYKrA3knrOKllh8Acd4aYDkRD96pn6uGYCW7pFRjxNs-pvM13phSA/exec",
  "https://script.google.com/macros/s/AKfycbxr3Q2tdS8izTiXX4DNjaKapcRBNCPzdH9ETro9PeK_kt1pdkiL773lzm65zpopqMkXNQ/exec",
  "https://script.google.com/macros/s/AKfycbyimCptRKiJRqP5HjdTLCbWjNHPdr6mJ3iotPsY94-H_S5rl67AZeD0TqzSb8ZaGviQ7g/exec"
];

export default function App() {
  const { language, t } = useLanguage();
  // --- STATE ---
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [logs, setLogs] = useState<LogIzinItem[]>([]);
  const [jadwalInsidental, setJadwalInsidental] = useState<JadwalInsidentalItem[]>([]);

  const [masterRuangan, setMasterRuangan] = useState<MasterRuanganItem[]>([]);

  const [kalenderAkademik, setKalenderAkademik] = useState<KalenderAkademikItem[]>([]);

  const [selectedTeacher, setSelectedTeacherState] = useState<string>("");
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    const storedAdmin = localStorage.getItem("db_is_admin");
    return storedAdmin === "true";
  });

  // Keep admin status synced to localStorage
  useEffect(() => {
    localStorage.setItem("db_is_admin", isAdmin ? "true" : "false");
  }, [isAdmin]);
  const [activePage, setActivePage] = useState<ActivePage>("dashboard");
  const [scheduleEditorState, setScheduleEditorState] = useState<{ items: ScheduleItem[]; initialDate?: string } | null>(null);
  const [schoolToday, setSchoolToday] = useState<string>(() => getSchoolTodayISO());
  const [calendarAuthEpoch, setCalendarAuthEpoch] = useState(0);
  const [substituteConstraints, setSubstituteConstraints] = useState<SubstituteConstraint[]>([]);

  // Keep actionable task-recovery queues aligned with the Jakarta school date,
  // including when E-Jadwal stays open across midnight.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = getSchoolTodayISO();
      setSchoolToday((current) => current === next ? current : next);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // Admin Account & Login States
  const [adminUser, setAdminUser] = useState<AdminAccount | null>(() => {
    const stored = localStorage.getItem("db_admin_user");
    return stored ? JSON.parse(stored) : null;
  });
  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);

  // Sidebar & Global Header Search States
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const snapshotRequestRef = useRef(0);
  const [snapshotLoading, setSnapshotLoading] = useState(true);
  const [snapshotError, setSnapshotError] = useState("");

  // Legacy Apps Script URL retained ONLY for optional Google Drive task bridge
  const [apiUrl] = useState<string>(() => {
    const val = localStorage.getItem("db_api_url");
    if (val === null || OLD_DEFAULT_API_URLS.includes(val)) {
      localStorage.setItem("db_api_url", DEFAULT_API_URL);
      return DEFAULT_API_URL;
    }
    return val;
  });

  // Custom Confirmation Dialog State
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {}
  });

  const triggerConfirm = (title: string, message: string, onConfirmCallback: () => void) => {
    setConfirmDialog({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        onConfirmCallback();
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const applySupabaseSnapshot = (snapshot: Awaited<ReturnType<SupabaseScheduleRepository["loadSnapshot"]>>) => {
    setTeachers(snapshot.teachers);
    setSchedules(snapshot.schedules);
    setLogs(snapshot.logs);
    setJadwalInsidental(snapshot.jadwalInsidental);
    setMasterRuangan(snapshot.masterRuangan);
    setKalenderAkademik(snapshot.kalenderAkademik);
  };

  const clearRuntimeSnapshot = () => {
    setTeachers([]);
    setSchedules([]);
    setLogs([]);
    setJadwalInsidental([]);
    setMasterRuangan([]);
    setKalenderAkademik([]);
  };

  const refreshPublicSupabase = async () => {
    const requestId = ++snapshotRequestRef.current;
    setSnapshotLoading(true);
    setSnapshotError("");
    try {
      const { snapshot, constraints } = await new SupabasePublicScheduleRepository().loadPublicState();
      if (requestId !== snapshotRequestRef.current) return;
      applySupabaseSnapshot(snapshot);
      setSubstituteConstraints(constraints);
    } catch (error) {
      if (requestId !== snapshotRequestRef.current) return;
      clearRuntimeSnapshot(); // Fail closed: never resurrect old GAS/localStorage schedule.
      setSnapshotError(error instanceof Error ? error.message : "Gagal membaca jadwal Supabase.");
    } finally {
      if (requestId === snapshotRequestRef.current) setSnapshotLoading(false);
    }
  };

  const refreshFromSupabase = async () => {
    const requestId = ++snapshotRequestRef.current;
    setSnapshotLoading(true);
    setSnapshotError("");
    try {
      if (!isSupabaseConfigured) throw new Error("Supabase belum dikonfigurasi di .env.local.");
      const context = await getCurrentUserContext();
      if (!context || !context.roles.some((role) => role === "ADMIN" || role === "WAKASEK")) {
        throw new Error("Session ADMIN/WAKASEK Supabase diperlukan.");
      }
      const [snapshot, constraints] = await Promise.all([
        new SupabaseScheduleRepository().loadSnapshot(),
        new SupabaseSubstituteConstraintRepository().listActiveConstraints(),
      ]);
      if (requestId !== snapshotRequestRef.current) return { context, snapshot, constraints };
      applySupabaseSnapshot(snapshot);
      setSubstituteConstraints(constraints);
      return { context, snapshot, constraints };
    } catch (error) {
      if (requestId === snapshotRequestRef.current) {
        clearRuntimeSnapshot();
        setSnapshotError(error instanceof Error ? error.message : "Gagal membaca jadwal Supabase.");
      }
      throw error;
    } finally {
      if (requestId === snapshotRequestRef.current) setSnapshotLoading(false);
    }
  };

  const handleAdminLogout = async () => {
    setSnapshotLoading(true);
    try { await signOut(); } catch { /* local shell still exits even if network signout fails */ }
    ++snapshotRequestRef.current;
    clearRuntimeSnapshot();
    setIsAdmin(false);
    setAdminUser(null);
    setCalendarAuthEpoch(v => v + 1); // purge privileged calendar component state after sign-out
    setSubstituteConstraints([]); // Do not retain staff-only restriction data after logout.
    localStorage.removeItem("db_admin_user");
  };

  // --- SUPABASE-ONLY BOOT ---
  // No runtime read from Google Sheets, fixtures, or cached schedule data.
  // Admin ON/OFF only changes permissions; both modes use live Supabase.
  useEffect(() => {
    // Purge legacy browser snapshots to avoid exposing outdated or privileged
    // data after a login/logout transition. Only live Supabase state is used.
    for (const key of ["db_teachers", "db_schedules", "db_logs", "db_jadwal_insidental", "db_master_ruangan", "db_kalender_akademik"]) {
      localStorage.removeItem(key);
    }
    setSelectedTeacherState(localStorage.getItem("selectedTeacher") || "");
    const adminRouteRequested = window.location.pathname.includes("/admin")
      || window.location.hash.includes("admin")
      || window.location.search.includes("admin=true")
      || window.location.search.includes("role=admin");
    void getCurrentUserContext()
      .then(async (context) => {
        const staff = Boolean(context?.roles.some((role) => role === "ADMIN" || role === "WAKASEK"));
        if (staff && localStorage.getItem("db_is_admin") === "true") {
          setIsAdmin(true);
          setAdminUser({ id: context!.user.email || context!.user.id, password: "", nama: context!.displayName });
          await refreshFromSupabase();
        } else {
          setIsAdmin(false);
          // Public RPC provides only operational no-teaching flags, without
          // leaking private substitute restriction reasons/notes.
          if (adminRouteRequested) setShowLoginModal(true);
        }
      })
      .catch(() => {
        setIsAdmin(false);
        if (adminRouteRequested) setShowLoginModal(true);
      });
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      // Automatically refresh guest contacts when Jakarta changes date.
      // Previous-day phone numbers expire even in a browser left open overnight.
      setLogs((existing) => existing.map((log) => log.tanggal < schoolToday
        ? { ...log, whatsapp_guru_izin: null, whatsapp_guru_pengganti: null }
        : log));
      void refreshPublicSupabase();
    }
  }, [isAdmin, schoolToday]);

  // Requirement 1: Save selected teacher to localStorage so all page filters match
  const setSelectedTeacher = (name: string) => {
    setSelectedTeacherState(name);
    localStorage.setItem("selectedTeacher", name);
  };

  // Admin operational writes are Supabase-only in V3.12.4.
  const handleAddLogs = async (
    newLogsData: Omit<LogIzinItem, "id">[],
    roomIncidentalData?: {
      tanggal: string; kelas: string; jam_ke: number; mapel: string; ruangan: string; alasan: string; tipe_insidental: string;
    },
    metadata?: InvalWriteMetadata,
  ) => {
    const context = await getCurrentUserContext();
    if (!context || !context.roles.some((role) => role === "ADMIN" || role === "WAKASEK")) {
      throw new Error("Login Supabase ADMIN/WAKASEK diperlukan untuk menyimpan badal.");
    }
    const constraints = await new SupabaseSubstituteConstraintRepository().listActiveConstraints();
    const bundle = buildInvalWriteBundle({
      logs: newLogsData,
      roomIncidental: roomIncidentalData,
      metadata,
      teachers,
      constraints,
    });
    await new SupabaseInvalWriteRepository().saveBundle(bundle);
    await refreshFromSupabase();
  };

  // Delete operational coverage from Supabase; audit history is preserved.
  const handleDeleteLog = (id: string) => {
    triggerConfirm(
      "Hapus Catatan Log",
      "Batalkan catatan ini dari daftar operasional? Data asli (termasuk impor lama) dan jejak audit tetap tersimpan di Supabase. Tindakan ini tidak dapat dibatalkan dari layar ini.",
      async () => {
        try {
          await new SupabaseInvalWriteRepository().deleteAssignment({
            coverageSlotId: id,
            deleteNote: "Pembatalan administratif via Log Izin & WA (RC3.4.6)",
          });
          await refreshFromSupabase();
        } catch (err) {
          alert(err instanceof Error ? err.message : String(err));
        }
      },
    );
  };

  // Replace an existing substitute without touching the leave or attached task.
  const handleReplaceLogSubstitute = async (
    log: LogIzinItem,
    substituteTeacherId: string,
    constraintIds: string[] = [],
    overrideNote?: string,
  ) => {
    if (!isAdmin) throw new Error("Admin Mode diperlukan untuk mengubah log badal.");
    const auth = await getCurrentUserContext();
    if (!auth?.roles.some((role) => role === "ADMIN" || role === "WAKASEK")) {
      throw new Error("Login Supabase ADMIN/WAKASEK diperlukan untuk mengganti guru badal.");
    }
    await new SupabaseInvalWriteRepository().replaceSubstitute({
      coverageSlotId: log.id,
      substituteTeacherId,
      constraintIds,
      overrideNote,
    });
    await refreshFromSupabase();
  };

  const currentTeacherObj = teachers.find(t => t.nama === selectedTeacher);

  const missingTeacherTaskCount = new Set(logs.filter((log) =>
    selectedTeacher
    && log.guru_izin?.trim().toLocaleLowerCase("id-ID") === selectedTeacher.trim().toLocaleLowerCase("id-ID")
    && Boolean(String(log.guru_pengganti || "").trim())
    && !String(log.tugas || "").trim()
    && isTaskRecoveryDateActive(log.tanggal, schoolToday)
  ).map((log) => [log.tanggal, Number(log.jam_ke), String(log.mapel || "").trim().toLocaleLowerCase("id-ID"), String(log.guru_pengganti || "").trim().toLocaleLowerCase("id-ID")].join("|"))).size;

  // Category metadata is shared by desktop, collapsed, and mobile navigation.
  // Keep page IDs intact: renaming/reordering must never change existing routes.
  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: Home, adminOnly: false },

    // Guru / umum: first-use navigation is grouped around daily workflows.
    { id: "jadwal-lengkap", label: "Jadwal Pribadi", icon: Calendar, adminOnly: false, section: "Jadwal" },
    { id: "jadwal-kelas", label: "Jadwal Kelas", icon: Layers, adminOnly: false },
    { id: "jadwal-ruangan", label: "Jadwal Ruangan", icon: Building2, adminOnly: false },
    { id: "education-calendar", label: "Kalender Pendidikan", icon: CalendarDays, adminOnly: false },

    { id: "ajukan-izin", label: "Ajukan Izin", icon: ClipboardCheck, adminOnly: false, section: "Perizinan" },
    { id: "lengkapi-tugas", label: missingTeacherTaskCount > 0 ? `${t("Lengkapi Tugas")} (${missingTeacherTaskCount})` : t("Lengkapi Tugas"), icon: FileUp, adminOnly: false },

    { id: "guru-pengampu-kelas", label: "Guru per Kelas", icon: GraduationCap, adminOnly: false, section: "Statistik" },
    { id: "list-mapel", label: "List Mapel Diajar", icon: BookOpen, adminOnly: false },
    { id: "jam-kosong-individu", label: "Jam Kosong Indiv", icon: Clock, adminOnly: false },

    // Admin menu: by task rather than by the historical insertion order.
    { id: "approval-izin", label: "Persetujuan Izin", icon: ShieldCheck, adminOnly: true, section: "Administrasi" },
    { id: "approved-leave-list", label: "List Badal Pengajuan Badal", icon: ClipboardCheck, adminOnly: true },
    { id: "action-center", label: "Action Center", icon: BellRing, adminOnly: true },
    { id: "input-pengganti", label: "Input Inval (Admin)", icon: UserPlus, adminOnly: true },
    { id: "log-pengganti", label: "Log Izin & WA", icon: History, adminOnly: true },

    { id: "schedule-incidental", label: "Jadwal Insidental", icon: CalendarPlus2, adminOnly: true, section: "Kelola Jadwal & Kalender" },
    { id: "substitute-constraints", label: "Aturan Guru Badal", icon: Ban, adminOnly: true },
    { id: "academic-calendar", label: "Kalender Akademik", icon: CalendarDays, adminOnly: true },
    { id: "operational-calendar", label: "Kalender Operasional KBM", icon: CalendarRange, adminOnly: true },
    { id: "education-calendar-admin", label: "Input Kalender Pendidikan", icon: CalendarPlus2, adminOnly: true },
    { id: "schedule-control-center", label: "Versi & Konflik Jadwal", icon: GitBranch, adminOnly: true },

    { id: "management-analytics", label: "Management Analytics", icon: BarChart3, adminOnly: true, section: "Analitik & Rekap" },
    { id: "teacher-statistics", label: "Statistik Individu Guru", icon: BarChart2, adminOnly: true },
    { id: "tabel-jam-kosong", label: "Tabel Jam Kosong", icon: Table, adminOnly: true },
    { id: "jam-kosong-semua", label: "Jam Kosong Semua", icon: Users, adminOnly: true },
    { id: "rekap-guru", label: "Rekap Guru (Admin)", icon: ClipboardList, adminOnly: true },
    { id: "statistik", label: "Statistik Badal (Legacy)", icon: BarChart2, adminOnly: true },

    { id: "master-data", label: "Master Data", icon: Database, adminOnly: true, section: "Data & Impor" },
    { id: "schedule-import", label: "Import Jadwal Massal", icon: FileUp, adminOnly: true },
    { id: "schedule-syaikh-import", label: "Import Jadwal Syaikh", icon: Upload, adminOnly: true },
  ];

  return (
    <div className="flex h-screen w-full bg-slate-50 font-sans text-slate-900 overflow-hidden">
      
      {/* SIDEBAR NAVIGATION - DESKTOP & TABLET (COLLAPSIBLE) */}
      <aside className={`hidden lg:flex bg-white border-r border-slate-200 flex-col shrink-0 transition-all duration-300 min-h-0 ${isSidebarCollapsed ? "w-18" : "w-64"}`}>
        <div className={`flex flex-col h-full min-h-0 ${isSidebarCollapsed ? "p-3" : "p-6"}`}>
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-between mb-6">
              <div 
                onClick={() => {
                  setActivePage("dashboard");
                  setIsMobileMenuOpen(false);
                }}
                className={`flex items-center gap-3 cursor-pointer group ${isSidebarCollapsed ? "mx-auto justify-center" : ""}`}
                title="E-JADWAL AL-WILDAN 10"
              >
                <img 
                  src="https://raw.githubusercontent.com/abuhumairoistiqomah/neojadwal/13f1ed219dbb94a45cd51eedec99a80beaa2d5de/assets/image-removebg-preview%20(7).png" 
                  alt="Logo Al-Wildan" 
                  className="w-10 h-10 object-contain shrink-0 transition-transform group-hover:scale-105"
                  referrerPolicy="no-referrer"
                />
                {!isSidebarCollapsed && (
                  <div className="flex flex-col min-w-0">
                    <h1 className="text-lg font-black tracking-tight text-slate-800 leading-none">E-JADWAL</h1>
                    <span className="text-[9px] font-bold text-slate-500 tracking-tight leading-tight mt-1 uppercase">
                      AL-WILDAN INTERNASIONAL ISLAMIC SCHOOL 10 JAKARTA
                    </span>
                  </div>
                )}
              </div>

              {!isSidebarCollapsed && (
                <button
                  id="toggle-sidebar-collapse-btn"
                  onClick={() => setIsSidebarCollapsed(true)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors hidden lg:flex items-center justify-center shrink-0"
                  title={t("Sembunyikan Sidebar")}
                >
                  <PanelLeftClose className="w-5 h-5" />
                </button>
              )}
            </div>

            {isSidebarCollapsed && (
              <div className="mb-4 flex justify-center">
                <button
                  id="expand-sidebar-btn"
                  onClick={() => setIsSidebarCollapsed(false)}
                  className="p-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-600 transition-colors"
                  title={t("Tampilkan Sidebar")}
                >
                  <PanelLeftOpen className="w-5 h-5" />
                </button>
              </div>
            )}

            <nav className="space-y-1 flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1 pb-4">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activePage === item.id;
                // Soft hide if adminOnly and not admin, but keep selectable if they click on it
                const showItem = !item.adminOnly || isAdmin;
                
                return (
                  <React.Fragment key={item.id}>
                    {item.section && (
                      isSidebarCollapsed ? (
                        <div role="separator" aria-label={t(item.section)} title={t(item.section)} className="mx-2 my-3 border-t border-slate-200" />
                      ) : (
                        <div className="px-3 pb-1 pt-4 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400"><span lang={language} dir={language === "ar" ? "rtl" : undefined}>{t(item.section)}</span></div>
                      )
                    )}
                  <button
                    id={`sidebar-nav-${item.id}`}
                    onClick={() => {
                      setActivePage(item.id as ActivePage);
                      setIsMobileMenuOpen(false);
                    }}
                    title={isSidebarCollapsed ? t(item.label) : undefined}
                    className={`w-full flex items-center ${
                      isSidebarCollapsed ? "justify-center px-2 py-3" : "gap-3 px-3 py-2"
                    } rounded-xl font-medium text-sm transition-all ${
                      isActive
                        ? "bg-blue-50 text-blue-700 font-semibold shadow-xs"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    } ${!showItem ? "opacity-50 border-dashed border border-slate-100" : ""}`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-blue-600" : "text-slate-400"}`} />
                    {!isSidebarCollapsed && (
                      <>
                        <span className="truncate" lang={language} dir={language === "ar" ? "rtl" : undefined}>{t(item.label)}</span>
                        {item.adminOnly && !isAdmin && (
                          <span className="ml-auto text-[8px] bg-slate-100 text-slate-500 px-1 py-0.5 rounded uppercase font-bold shrink-0">Lock</span>
                        )}
                      </>
                    )}
                  </button>
                  </React.Fragment>
                );
              })}
            </nav>
          </div>

          <div className="shrink-0 pt-2 border-t border-slate-100"><LanguageSelector compact={isSidebarCollapsed} /></div>
          {/* Admin Toggle Area — fixed footer; navigation above it scrolls independently. */}
          <div className={`shrink-0 pt-4 border-t border-slate-100 bg-white ${isSidebarCollapsed ? "flex flex-col items-center" : ""}`}>
            {isSidebarCollapsed ? (
              <button
                id="sidebar-admin-toggle-compact"
                onClick={() => {
                  if (isAdmin) {
                    void handleAdminLogout();
                  } else {
                    setShowLoginModal(true);
                  }
                }}
                className={`p-2 rounded-xl transition-colors ${
                  isAdmin ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500 hover:text-slate-800"
                }`}
                title={isAdmin ? `Admin: ${adminUser?.nama || t("Aktif")} (Klik untuk keluar)` : t("Klik untuk Login Admin")}
              >
                <ShieldCheck className={`w-5 h-5 ${isAdmin ? "text-blue-600" : "text-slate-400"}`} />
              </button>
            ) : (
              <>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-500"><T>{"Admin Mode"}</T></span>
                  <button
                    id="sidebar-admin-toggle"
                    onClick={() => {
                      if (isAdmin) {
                        void handleAdminLogout();
                      } else {
                        setShowLoginModal(true);
                      }
                    }}
                    className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 outline-none ${
                      isAdmin ? "bg-blue-600" : "bg-slate-200"
                    }`}
                    title={isAdmin ? t("Matikan Mode Admin") : t("Aktifkan Mode Admin")}
                  >
                    <div className={`bg-white w-4 h-4 rounded-full shadow-sm transform duration-200 ${
                      isAdmin ? "translate-x-4" : "translate-x-0"
                    }`} />
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 font-medium truncate">
                  {isAdmin ? `Admin: ${adminUser?.nama || t("Aktif")}` : t("Mode tamu hanya baca")}
                </p>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* MOBILE SLIDE-OUT DRAWER */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          
          {/* Drawer content */}
          <div className="relative flex w-64 max-w-xs h-full min-h-0 flex-col bg-white p-6 shadow-2xl animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3 min-w-0">
                <img 
                  src="https://raw.githubusercontent.com/abuhumairoistiqomah/neojadwal/13f1ed219dbb94a45cd51eedec99a80beaa2d5de/assets/image-removebg-preview%20(7).png" 
                  alt="Logo Al-Wildan" 
                  className="w-10 h-10 object-contain shrink-0"
                  referrerPolicy="no-referrer"
                />
                <div className="flex flex-col min-w-0">
                  <h1 className="text-lg font-black tracking-tight text-slate-800 leading-none">E-JADWAL</h1>
                  <span className="text-[9px] font-bold text-slate-500 tracking-tight leading-tight mt-1 uppercase">
                    AL-WILDAN INTERNASIONAL ISLAMIC SCHOOL 10 JAKARTA
                  </span>
                </div>
              </div>
              <button
                id="close-mobile-menu-btn"
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="space-y-1.5 flex-1 min-h-0 overflow-y-auto overscroll-contain pr-1 pb-4">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activePage === item.id;
                const showItem = !item.adminOnly || isAdmin;
                
                return (
                  <React.Fragment key={item.id}>
                    {item.section && (
                      <div className="px-3 pb-1 pt-4 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400"><span lang={language} dir={language === "ar" ? "rtl" : undefined}>{t(item.section)}</span></div>
                    )}
                  <button
                    id={`mobile-nav-${item.id}`}
                    onClick={() => {
                      setActivePage(item.id as ActivePage);
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md font-medium text-sm transition-all ${
                      isActive
                        ? "bg-blue-50 text-blue-700 font-semibold"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    } ${!showItem ? "opacity-50" : ""}`}
                  >
                    <Icon className="w-4 h-4 text-slate-400" />
                    <span lang={language} dir={language === "ar" ? "rtl" : undefined}>{t(item.label)}</span>
                  </button>
                  </React.Fragment>
                );
              })}
            </nav>

            <div className="pt-3 border-t border-slate-100">
              <LanguageSelector />
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500"><T>{"Admin Mode"}</T></span>
                <button
                  id="mobile-admin-toggle"
                  onClick={() => {
                    if (isAdmin) {
                      void handleAdminLogout();
                    } else {
                      setShowLoginModal(true);
                      setIsMobileMenuOpen(false);
                    }
                  }}
                  className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 outline-none ${
                    isAdmin ? "bg-blue-600" : "bg-slate-200"
                  }`}
                >
                  <div className={`bg-white w-4 h-4 rounded-full shadow-sm transform duration-200 ${
                    isAdmin ? "translate-x-4" : "translate-x-0"
                  }`} />
                </button>
              </div>
              <p className="text-[10px] text-slate-400 font-medium">
                {isAdmin ? `Admin: ${adminUser?.nama || t("Aktif")}` : t("Mode tamu hanya baca")}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* MAIN VIEWPORT WRAPPER */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        
        {/* GLOBAL TOP HEADER */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 md:px-8 flex items-center justify-between gap-4 shrink-0 z-30">
          
          <div className="flex items-center gap-3">
            {/* Desktop / Tablet Sidebar Toggle Button */}
            <button
              id="topheader-toggle-sidebar-btn"
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="hidden lg:flex p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              title={isSidebarCollapsed ? t("Tampilkan Sidebar Kiri") : t("Sembunyikan Sidebar Kiri")}
            >
              <PanelLeft className="w-5 h-5 text-slate-600" />
            </button>

            {/* Mobile menu trigger */}
            <button
              id="open-mobile-menu-btn"
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100"
            >
              <Menu className="w-6 h-6" />
            </button>

            {/* Local autocomplete state: typing must never recalculate App-wide schedules. */}
            <TeacherHeaderSearch teachers={teachers} selectedTeacher={selectedTeacher} onSelectTeacher={setSelectedTeacher} />
          </div>

          {/* Header Right Content */}
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            
            {/* Supabase is the ONLY live schedule database, regardless of Admin Mode. */}
            <button
              id="header-refresh-supabase-btn"
              onClick={() => { void (isAdmin ? refreshFromSupabase() : refreshPublicSupabase()).catch(() => {}); }}
              disabled={snapshotLoading}
              className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 text-emerald-700 border border-emerald-200 shadow-xs transition-all"
              title={t("Segarkan jadwal langsung dari Supabase")}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${snapshotLoading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline"><T>{"Refresh Supabase"}</T></span>
            </button>
            <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border bg-indigo-50 text-indigo-700 border-indigo-200 text-xs font-semibold" title="Semua jadwal bersumber dari Supabase">
              <Database className="w-3.5 h-3.5" /> Supabase
            </span>

            {/* Selected Teacher Pill Info */}
            {currentTeacherObj ? (
              <div className="flex items-center gap-3 pl-2 sm:pl-3 border-l border-slate-200">
                <div className="hidden md:block text-right">
                  <p className="text-xs font-bold text-slate-800 line-clamp-1 max-w-[140px]">{currentTeacherObj.nama}</p>
                  <p className="text-[10px] text-slate-500 truncate max-w-[140px]">
                    {currentTeacherObj.mapel_utama} • {currentTeacherObj.jenjang}
                  </p>
                </div>
                <div 
                  className="w-8 h-8 rounded-full bg-blue-100 border border-blue-200 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0"
                  title={`${currentTeacherObj.nama} - ${currentTeacherObj.mapel_utama}`}
                >
                  {currentTeacherObj.nama[0]}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 pl-2 sm:pl-3 border-l border-slate-200 text-slate-400 text-xs italic hidden md:flex">
                <span>Pilih guru untuk memfilter</span>
              </div>
            )}

          </div>

        </header>

        {/* PAGE CONTENT CONTAINER */}
        <div className="flex-1 overflow-y-auto bg-slate-50 p-4 sm:p-6 md:p-8">
          <div className="max-w-6xl mx-auto space-y-8">
            {snapshotError && (
              <div role="alert" className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-red-800 text-sm">
                <strong>Jadwal Supabase belum dapat dimuat.</strong> {snapshotError}
                <p className="mt-1">Tidak ada fallback ke Google Sheets atau jadwal lama. Tekan Refresh Supabase untuk mencoba lagi.</p>
              </div>
            )}
            {snapshotLoading && <p role="status" className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-2 text-blue-800 text-sm">Memuat jadwal terkini dari Supabase…</p>}
            
            {/* Never render a stale/empty schedule as if it were the live school timetable. */}
            {!snapshotLoading && !snapshotError && (<>
            {/* Dynamic Page Routing */}
            {activePage === "dashboard" && (
              <Dashboard 
                calendarAuthEpoch={calendarAuthEpoch}
                teachers={teachers}
                schedules={schedules}
                logs={logs}
                jadwalInsidental={jadwalInsidental}
                masterRuangan={masterRuangan}
                kalenderAkademik={kalenderAkademik}
                substituteConstraints={substituteConstraints}
                selectedTeacher={selectedTeacher}
                setSelectedTeacher={setSelectedTeacher}
                isAdmin={isAdmin}
                onEditSchedule={(items, options) => setScheduleEditorState({ items, initialDate: options?.initialDate })}
                setPage={setActivePage}
              />
            )}

            {activePage === "ajukan-izin" && (
              <LeaveRequestForm
                teachers={teachers}
                schedules={schedules}
                logs={logs}
                jadwalInsidental={jadwalInsidental}
                kalenderAkademik={kalenderAkademik}
                selectedTeacher={selectedTeacher}
                driveBridgeUrl={apiUrl}
                onChanged={refreshFromSupabase}
                onBack={() => setActivePage("dashboard")}
              />
            )}

            {activePage === "lengkapi-tugas" && (
              <LateTaskCompletion
                teachers={teachers}
                logs={logs}
                selectedTeacher={selectedTeacher}
                setSelectedTeacher={setSelectedTeacher}
                driveBridgeUrl={apiUrl}
                schoolToday={schoolToday}
                onTaskCompleted={({ teacherName, scheduleDate, period, taskText }) => {
                  setLogs((current) => current.map((log) => (
                    log.tanggal === scheduleDate
                    && Number(log.jam_ke) === Number(period)
                    && log.guru_izin.trim().toLocaleLowerCase("id-ID") === teacherName.trim().toLocaleLowerCase("id-ID")
                      ? { ...log, tugas: taskText }
                      : log
                  )));
                }}
                onBack={() => setActivePage("dashboard")}
              />
            )}

            {activePage === "approval-izin" && (
              isAdmin ? (
                <LeaveApprovalAdmin
                  teachers={teachers}
                  schedules={schedules}
                  logs={logs}
                  jadwalInsidental={jadwalInsidental}
                  kalenderAkademik={kalenderAkademik}
                  masterRuangan={masterRuangan}
                  substituteConstraints={substituteConstraints}
                  onChanged={refreshFromSupabase}
                  onBack={() => setActivePage("dashboard")}
                />
              ) : (
                <AdminOnlyFallback onBack={() => setActivePage("dashboard")} />
              )
            )}

            {activePage === "approved-leave-list" && (
              isAdmin ? (
                <ApprovedLeaveMaintenanceAdmin onChanged={refreshFromSupabase} onBack={() => setActivePage("dashboard")} />
              ) : (
                <AdminOnlyFallback onBack={() => setActivePage("dashboard")} />
              )
            )}

            {activePage === "action-center" && (
              isAdmin ? (
                <OperationalActionCenter
                  schedules={schedules}
                  incidentals={jadwalInsidental}
                  kalenderAkademik={kalenderAkademik}
                  logs={logs}
                  schoolToday={schoolToday}
                  onNavigate={setActivePage}
                  onSelectTeacher={(teacherName) => {
                    setSelectedTeacher(teacherName);
                  }}
                  onBack={() => setActivePage("dashboard")}
                />
              ) : (
                <AdminOnlyFallback onBack={() => setActivePage("dashboard")} />
              )
            )}

            {activePage === "management-analytics" && (
              isAdmin ? (
                <ManagementAnalytics onBack={() => setActivePage("dashboard")} />
              ) : (
                <AdminOnlyFallback onBack={() => setActivePage("dashboard")} />
              )
            )}

            {activePage === "teacher-statistics" && (
              isAdmin ? (
                <TeacherIndividualStatistics
                  teachers={teachers}
                  schedules={schedules}
                  incidentals={jadwalInsidental}
                  academicEvents={kalenderAkademik}
                  logs={logs}
                  initialTeacher={selectedTeacher}
                  onBack={() => setActivePage("dashboard")}
                />
              ) : (
                <AdminOnlyFallback onBack={() => setActivePage("dashboard")} />
              )
            )}

            {activePage === "jadwal-lengkap" && (
              <JadwalLengkap 
                teachers={teachers}
                schedules={schedules}
                masterRuangan={masterRuangan}
                incidentals={jadwalInsidental}
                logs={logs}
                kalenderAkademik={kalenderAkademik}
                schoolToday={schoolToday}
                selectedTeacher={selectedTeacher}
                setSelectedTeacher={setSelectedTeacher}
                onBack={() => setActivePage("dashboard")}
              />
            )}

            {activePage === "jadwal-kelas" && (
              <JadwalKelas 
                teachers={teachers}
                schedules={schedules}
                masterRuangan={masterRuangan}
                kalenderAkademik={kalenderAkademik}
                jadwalInsidental={jadwalInsidental}
                logs={logs}
                schoolToday={schoolToday}
                isAdmin={isAdmin}
                onEditSchedule={(items, options) => setScheduleEditorState({ items, initialDate: options?.initialDate })}
                onBack={() => setActivePage("dashboard")}
              />
            )}

            {activePage === "jadwal-ruangan" && (
              <JadwalRuangan 
                schedules={schedules}
                jadwalInsidental={jadwalInsidental}
                masterRuangan={masterRuangan}
                kalenderAkademik={kalenderAkademik}
                onChanged={async () => { await refreshFromSupabase(); }}
                onBack={() => setActivePage("dashboard")}
              />
            )}

            {activePage === "guru-pengampu-kelas" && (
              <ListGuruKelas 
                teachers={teachers}
                schedules={schedules}
                onBack={() => setActivePage("dashboard")}
              />
            )}

            {activePage === "list-mapel" && (
              <ListMapel 
                teachers={teachers}
                schedules={schedules}
                selectedTeacher={selectedTeacher}
                setSelectedTeacher={setSelectedTeacher}
                onBack={() => setActivePage("dashboard")}
              />
            )}

            {activePage === "jam-kosong-individu" && (
              <JamKosongIndividu 
                teachers={teachers}
                schedules={schedules}
                selectedTeacher={selectedTeacher}
                setSelectedTeacher={setSelectedTeacher}
                onBack={() => setActivePage("dashboard")}
              />
            )}

            {activePage === "tabel-jam-kosong" && (
              isAdmin ? (
                <TabelJamKosong 
                  teachers={teachers}
                  schedules={schedules}
                  onBack={() => setActivePage("dashboard")}
                />
              ) : (
                <AdminOnlyFallback onBack={() => setActivePage("dashboard")} />
              )
            )}

            {activePage === "jam-kosong-semua" && (
              isAdmin ? (
                <JamKosongSemua 
                  teachers={teachers}
                  schedules={schedules}
                  onBack={() => setActivePage("dashboard")}
                />
              ) : (
                <AdminOnlyFallback onBack={() => setActivePage("dashboard")} />
              )
            )}

            {activePage === "rekap-guru" && (
              isAdmin ? (
                <RekapGuru 
                  teachers={teachers}
                  schedules={schedules}
                  onBack={() => setActivePage("dashboard")}
                  setSelectedTeacher={setSelectedTeacher}
                  setActivePage={setActivePage}
                />
              ) : (
                <AdminOnlyFallback onBack={() => setActivePage("dashboard")} />
              )
            )}

            {activePage === "master-data" && (
              isAdmin ? (
                <AdminMasterData
                  onBack={() => setActivePage("dashboard")}
                  onRefreshSnapshot={async () => { await refreshFromSupabase(); }}
                />
              ) : (
                <AdminOnlyFallback onBack={() => setActivePage("dashboard")} />
              )
            )}

            {activePage === "schedule-import" && (
              isAdmin ? (
                <ScheduleMassImporter
                  currentSchedules={schedules}
                  onBack={() => setActivePage("dashboard")}
                  onPublished={async () => { await refreshFromSupabase(); }}
                />
              ) : (
                <AdminOnlyFallback onBack={() => setActivePage("dashboard")} />
              )
            )}


            {activePage === "schedule-syaikh-import" && (
              isAdmin ? (
                <SyaikhScheduleMassImporter
                  schedules={schedules}
                  incidentals={jadwalInsidental}
                  onBack={() => setActivePage("dashboard")}
                  onPublished={async () => { await refreshFromSupabase(); }}
                />
              ) : (
                <AdminOnlyFallback onBack={() => setActivePage("dashboard")} />
              )
            )}


            {activePage === "schedule-incidental" && (
              isAdmin ? (
                <IncidentalScheduleAdmin
                  schedules={schedules}
                  incidentals={jadwalInsidental}
                  logs={logs}
                  kalenderAkademik={kalenderAkademik}
                  onChanged={async () => { await refreshFromSupabase(); }}
                  onBack={() => setActivePage("dashboard")}
                />
              ) : (
                <AdminOnlyFallback onBack={() => setActivePage("dashboard")} />
              )
            )}

            {activePage === "substitute-constraints" && (
              isAdmin ? (
                <SubstituteConstraintAdmin
                  teacherDetails={teachers}
                  schedules={schedules}
                  incidentals={jadwalInsidental}
                  logs={logs}
                  calendar={kalenderAkademik}
                  substituteConstraints={substituteConstraints}
                  onChanged={async () => {
                    const constraints = await new SupabaseSubstituteConstraintRepository().listActiveConstraints();
                    setSubstituteConstraints(constraints);
                    await refreshFromSupabase();
                  }}
                  onBack={() => setActivePage("dashboard")}
                />
              ) : (
                <AdminOnlyFallback onBack={() => setActivePage("dashboard")} />
              )
            )}

            {activePage === "education-calendar" && (
              <EducationCalendar key={`edu-cal-${calendarAuthEpoch}`} authEpoch={calendarAuthEpoch} onBack={() => setActivePage("dashboard")} />
            )}

            {activePage === "education-calendar-admin" && (
              isAdmin ? (
                <EducationCalendarAdmin teachers={teachers} schedules={schedules} onBack={() => setActivePage("dashboard")} />
              ) : (
                <AdminOnlyFallback onBack={() => setActivePage("dashboard")} />
              )
            )}

            {activePage === "operational-calendar" && (
              isAdmin ? (
                <OperationalCalendarV319Admin
                  teachers={teachers}
                  schedules={schedules}
                  incidentals={jadwalInsidental}
                  calendar={kalenderAkademik}
                  logs={logs}
                  onChanged={async () => { await refreshFromSupabase(); }}
                  onBack={() => setActivePage("dashboard")}
                />
              ) : (
                <AdminOnlyFallback onBack={() => setActivePage("dashboard")} />
              )
            )}

            {activePage === "academic-calendar" && (
              isAdmin ? (
                <AcademicCalendarAdmin
                  onChanged={async () => { await refreshFromSupabase(); }}
                  onBack={() => setActivePage("dashboard")}
                />
              ) : (
                <AdminOnlyFallback onBack={() => setActivePage("dashboard")} />
              )
            )}

            {activePage === "schedule-control-center" && (
              isAdmin ? (
                <ScheduleControlCenter
                  teachers={teachers}
                  logs={logs}
                  schoolToday={schoolToday}
                  schedules={schedules}
                  incidentals={jadwalInsidental}
                  kalenderAkademik={kalenderAkademik}
                  onChanged={async () => { await refreshFromSupabase(); }}
                  onBack={() => setActivePage("dashboard")}
                />
              ) : (
                <AdminOnlyFallback onBack={() => setActivePage("dashboard")} />
              )
            )}

            {activePage === "input-pengganti" && (
              isAdmin ? (
                <InputGuruPengganti 
                  teachers={teachers}
                  schedules={schedules}
                  logs={logs}
                  jadwalInsidental={jadwalInsidental}
                  masterRuangan={masterRuangan}
                  kalenderAkademik={kalenderAkademik}
                  substituteConstraints={substituteConstraints}
                  onAddLogs={handleAddLogs}
                  onBack={() => setActivePage("dashboard")}
                />
              ) : (
                <AdminOnlyFallback onBack={() => setActivePage("dashboard")} />
              )
            )}

            {activePage === "log-pengganti" && (
              isAdmin ? (
                <LogGuruPengganti 
                  logs={logs}
                  teachers={teachers}
                  onDeleteLog={handleDeleteLog}
                  onReplaceSubstitute={handleReplaceLogSubstitute}
                  onBack={() => setActivePage("dashboard")}
                />
              ) : (
                <AdminOnlyFallback onBack={() => setActivePage("dashboard")} />
              )
            )}

            {activePage === "statistik" && (
              isAdmin ? (
                <StatistikGuruPengganti 
                  logs={logs}
                  onBack={() => setActivePage("dashboard")}
                />
              ) : (
                <AdminOnlyFallback onBack={() => setActivePage("dashboard")} />
              )
            )}
            </>)}

          </div>

          {/* Minimalist Sub-Footer */}
          <div className="max-w-6xl mx-auto mt-12 pt-6 border-t border-slate-200/60 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-400">
            <p className="font-semibold text-slate-500">E-JADWAL © 2026 • Istiqomah's House of Harmony Team & AL-WILDAN INTERNASIONAL ISLAMIC SCHOOL 10 JAKARTA</p>
            <div className="flex items-center gap-3">
              <button 
                id="footer-btn-admin-route"
                onClick={() => setShowLoginModal(true)} 
                className="hover:text-blue-600 font-bold transition-colors"
              >
                Rute Login (/admin)
              </button>
            </div>
          </div>
        </div>

      </div>

      {scheduleEditorState && (
        <ScheduleQuickEditor
          items={scheduleEditorState.items}
          allSchedules={schedules}
          incidentals={jadwalInsidental}
          logs={logs}
          kalenderAkademik={kalenderAkademik}
          initialDate={scheduleEditorState.initialDate}
          onClose={() => setScheduleEditorState(null)}
          onSaved={async () => { await refreshFromSupabase(); }}
        />
      )}

      {/* Inputs stay inside their own component: typing must not rerender App's schedule tree. */}
      {showLoginModal && (
        <AdminLoginModal
          onClose={() => setShowLoginModal(false)}
          onLogin={async (email, password) => {
            try {
              await signInWithPassword({ email: email.trim(), password });
              const { context } = await refreshFromSupabase();
              const matched: AdminAccount = { id: context.user.email || context.user.id, password: "", nama: context.displayName };
              setIsAdmin(true);
              setCalendarAuthEpoch(v => v + 1);
              setAdminUser(matched);
              localStorage.setItem("db_admin_user", JSON.stringify(matched));
              setShowLoginModal(false);
            } catch (err) {
              try { await signOut(); } catch { /* preserve original login error */ }
              // Failed admin login must restore public data and clear privileged snapshot.
              try { await refreshPublicSupabase(); } catch { /* preserve original login error */ }
              throw err;
            }
          }}
        />
      )}

      {/* Custom Confirmation Modal */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-100 max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-50 text-amber-600 rounded-xl border border-amber-100">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">{confirmDialog.title}</h3>
                <p className="text-slate-500 text-xs mt-1.5 leading-relaxed">
                  {confirmDialog.message}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                id="confirm-cancel-btn"
                onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
                className="px-3.5 py-2 hover:bg-slate-100 text-slate-600 font-semibold text-xs rounded-xl transition-all"
              >
                <T>{"Batal"}</T>
              </button>
              <button
                id="confirm-ok-btn"
                onClick={confirmDialog.onConfirm}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl transition-all shadow-sm"
              >
                Ya, Lanjutkan
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function AdminOnlyFallback({ onBack }: { onBack: () => void }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center max-w-md mx-auto shadow-sm my-8">
      <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
        <ShieldAlert className="w-8 h-8" />
      </div>
      <h3 className="text-lg font-bold text-slate-800 mb-2">Akses Terbatas: Admin Only</h3>
      <p className="text-slate-500 text-sm mb-6 leading-relaxed">
        Halaman ini memerlukan hak akses Administrator. Silakan masuk terlebih dahulu melalui tombol Admin di menu navigasi sebelum membuka halaman ini.
      </p>
      <button
        onClick={onBack}
        className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 px-4 rounded-xl transition-all"
      >
        <T>{"Kembali ke Dashboard"}</T>
      </button>
    </div>
  );
}
