import React, { useState, useEffect, useRef } from "react";
import { 
  Teacher, ScheduleItem, LogIzinItem, ActivePage, JadwalInsidentalItem, MasterRuanganItem, KalenderAkademikItem 
} from "./types";
import { 
  INITIAL_TEACHERS, INITIAL_SCHEDULES, INITIAL_LOGS, INITIAL_ACCOUNTS, INITIAL_INCIDENTALS, INITIAL_MASTER_RUANGAN, INITIAL_KALENDER_AKADEMIK 
} from "./mockData";
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
import { LateTaskCompletion } from "./components/LateTaskCompletion";
import { AdminMasterData } from "./components/AdminMasterData";
import { ScheduleMassImporter } from "./components/ScheduleMassImporter";
import { SyaikhScheduleMassImporter } from "./components/SyaikhScheduleMassImporter";
import { ScheduleQuickEditor } from "./components/ScheduleQuickEditor";
import { SubstituteConstraintAdmin } from "./components/SubstituteConstraintAdmin";
import { AcademicCalendarAdmin } from "./components/AcademicCalendarAdmin";
import { IncidentalScheduleAdmin } from "./components/IncidentalScheduleAdmin";
import { ScheduleControlCenter } from "./components/ScheduleControlCenter";
import { OperationalActionCenter } from "./components/OperationalActionCenter";
import { ManagementAnalytics } from "./components/ManagementAnalytics";
import { 
  ShieldAlert, ShieldCheck, Database, LogIn, LogOut, 
  HelpCircle, Wifi, WifiOff, RefreshCw, Layers,
  Menu, X, Home, Calendar, BookOpen, Clock, Users, UserPlus, 
  History, BarChart2, BarChart3, Search, Upload, ClipboardList, Table, GraduationCap, Building2,
  ChevronLeft, ChevronRight, PanelLeft, PanelLeftClose, PanelLeftOpen, ClipboardCheck, FileUp, Ban, CalendarDays, CalendarPlus2, GitBranch, BellRing
} from "lucide-react";
import { AdminAccount } from "./types";
import { isSupabaseConfigured } from "./infrastructure/supabase/client";
import { getCurrentUserContext, signInWithPassword, signOut } from "./infrastructure/auth/supabaseAuthRepository";
import { SupabaseScheduleRepository } from "./infrastructure/repositories/supabaseScheduleRepository";
import { SupabaseSubstituteConstraintRepository } from "./infrastructure/repositories/supabaseSubstituteConstraintRepository";
import { SupabaseInvalWriteRepository } from "./infrastructure/repositories/supabaseInvalWriteRepository";
import { buildInvalWriteBundle, type InvalWriteMetadata } from "./domain/inval/invalWrite";
import { getSchoolTodayISO, isTaskRecoveryDateActive } from "./domain/date";
import type { SubstituteConstraint } from "./domain/substituteAvailability";

const sanitizeTime = (timeStr: any): string => {
  if (!timeStr) return "";
  const s = String(timeStr).trim();
  if (s.includes("1899-12-30") || s.includes("1900-01-01")) {
    const match = s.match(/(\d{2}):(\d{2})/);
    if (match) {
      return `${match[1]}:${match[2]}`;
    }
  }
  if (s.length > 10 && (s.includes("T") || s.includes(" "))) {
    const match = s.match(/(?:T|\s)(\d{2}):(\d{2})/);
    if (match) {
      return `${match[1]}:${match[2]}`;
    }
  }
  return s;
};

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
  // --- STATE ---
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [logs, setLogs] = useState<LogIzinItem[]>([]);
  const [jadwalInsidental, setJadwalInsidental] = useState<JadwalInsidentalItem[]>(() => {
    const stored = localStorage.getItem("db_jadwal_insidental");
    return stored ? JSON.parse(stored) : INITIAL_INCIDENTALS;
  });

  const saveJadwalInsidental = (data: JadwalInsidentalItem[]) => {
    setJadwalInsidental(data);
    localStorage.setItem("db_jadwal_insidental", JSON.stringify(data));
  };

  const [masterRuangan, setMasterRuangan] = useState<MasterRuanganItem[]>(() => {
    const stored = localStorage.getItem("db_master_ruangan");
    return stored ? JSON.parse(stored) : INITIAL_MASTER_RUANGAN;
  });

  const saveMasterRuangan = (data: MasterRuanganItem[]) => {
    setMasterRuangan(data);
    localStorage.setItem("db_master_ruangan", JSON.stringify(data));
  };

  const [kalenderAkademik, setKalenderAkademik] = useState<KalenderAkademikItem[]>(() => {
    const stored = localStorage.getItem("db_kalender_akademik");
    return stored ? JSON.parse(stored) : INITIAL_KALENDER_AKADEMIK;
  });

  const saveKalenderAkademik = (data: KalenderAkademikItem[]) => {
    setKalenderAkademik(data);
    localStorage.setItem("db_kalender_akademik", JSON.stringify(data));
  };
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
  const [accounts, setAccounts] = useState<AdminAccount[]>(() => {
    const stored = localStorage.getItem("db_accounts");
    return stored ? JSON.parse(stored) : INITIAL_ACCOUNTS;
  });
  const [adminUser, setAdminUser] = useState<AdminAccount | null>(() => {
    const stored = localStorage.getItem("db_admin_user");
    return stored ? JSON.parse(stored) : null;
  });
  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);
  const [loginId, setLoginId] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [adminAuthLoading, setAdminAuthLoading] = useState(false);

  // Sidebar & Global Header Search States
  const [headerSearch, setHeaderSearch] = useState("");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [showHeaderSuggestions, setShowHeaderSuggestions] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const headerSuggestionsRef = useRef<HTMLDivElement>(null);
  const publicGasBootstrappedRef = useRef(false);

  // Google Apps Script API configuration
  const [apiUrl, setApiUrl] = useState<string>(() => {
    const val = localStorage.getItem("db_api_url");
    if (val === null || OLD_DEFAULT_API_URLS.includes(val)) {
      localStorage.setItem("db_api_url", DEFAULT_API_URL);
      return DEFAULT_API_URL;
    }
    return val;
  });
  const [apiConnected, setApiConnected] = useState<boolean>(() => {
    const val = localStorage.getItem("db_api_url");
    if (val === null || OLD_DEFAULT_API_URLS.includes(val)) return true;
    return val !== "";
  });
  const [isLoadingApi, setIsLoadingApi] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string>("");

  const [showConfigModal, setShowConfigModal] = useState<boolean>(false);

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
    localStorage.setItem("db_teachers", JSON.stringify(snapshot.teachers));
    localStorage.setItem("db_schedules", JSON.stringify(snapshot.schedules));
    localStorage.setItem("db_logs", JSON.stringify(snapshot.logs));
    localStorage.setItem("db_jadwal_insidental", JSON.stringify(snapshot.jadwalInsidental));
    localStorage.setItem("db_master_ruangan", JSON.stringify(snapshot.masterRuangan));
    localStorage.setItem("db_kalender_akademik", JSON.stringify(snapshot.kalenderAkademik));
  };

  const refreshFromSupabase = async () => {
    if (!isSupabaseConfigured) throw new Error("Supabase belum dikonfigurasi di .env.local.");
    const context = await getCurrentUserContext();
    if (!context || !context.roles.some((role) => role === "ADMIN" || role === "WAKASEK")) {
      throw new Error("Session ADMIN/WAKASEK Supabase diperlukan.");
    }
    const [snapshot, constraints] = await Promise.all([
      new SupabaseScheduleRepository().loadSnapshot(),
      new SupabaseSubstituteConstraintRepository().listActiveConstraints(),
    ]);
    applySupabaseSnapshot(snapshot);
    setSubstituteConstraints(constraints);
    return { context, snapshot, constraints };
  };

  const handleAdminLogout = async () => {
    try { await signOut(); } catch { /* local shell still exits even if network signout fails */ }
    setIsAdmin(false);
    setAdminUser(null);
    localStorage.removeItem("db_admin_user");
  };

  // --- INITIAL LOAD & PERSISTENCE ---
  useEffect(() => {
    // 1. Load lists from localStorage or fall back to mock data
    const storedTeachers = localStorage.getItem("db_teachers");
    const storedSchedules = localStorage.getItem("db_schedules");
    const storedLogs = localStorage.getItem("db_logs");
    
    let storedApiUrl = localStorage.getItem("db_api_url");
    if (storedApiUrl === null || OLD_DEFAULT_API_URLS.includes(storedApiUrl)) {
      storedApiUrl = DEFAULT_API_URL;
      localStorage.setItem("db_api_url", DEFAULT_API_URL);
    }

    if (storedTeachers) {
      setTeachers(JSON.parse(storedTeachers));
    } else {
      setTeachers(INITIAL_TEACHERS);
      localStorage.setItem("db_teachers", JSON.stringify(INITIAL_TEACHERS));
    }

    if (storedSchedules) {
      try {
        const parsed = JSON.parse(storedSchedules) as ScheduleItem[];
        const sanitized = parsed.map(item => ({
          ...item,
          mulai: sanitizeTime(item.mulai),
          selesai: sanitizeTime(item.selesai)
        }));
        setSchedules(sanitized);
      } catch (e) {
        setSchedules(INITIAL_SCHEDULES);
      }
    } else {
      const sanitized = INITIAL_SCHEDULES.map(item => ({
        ...item,
        mulai: sanitizeTime(item.mulai),
        selesai: sanitizeTime(item.selesai)
      }));
      setSchedules(sanitized);
      localStorage.setItem("db_schedules", JSON.stringify(sanitized));
    }

    if (storedLogs) {
      setLogs(JSON.parse(storedLogs));
    } else {
      setLogs(INITIAL_LOGS);
      localStorage.setItem("db_logs", JSON.stringify(INITIAL_LOGS));
    }

    const storedMasterRuangan = localStorage.getItem("db_master_ruangan");
    if (storedMasterRuangan) {
      try {
        setMasterRuangan(JSON.parse(storedMasterRuangan));
      } catch (e) {
        setMasterRuangan(INITIAL_MASTER_RUANGAN);
      }
    } else {
      setMasterRuangan(INITIAL_MASTER_RUANGAN);
      localStorage.setItem("db_master_ruangan", JSON.stringify(INITIAL_MASTER_RUANGAN));
    }

    const storedKalender = localStorage.getItem("db_kalender_akademik");
    if (storedKalender) {
      try {
        setKalenderAkademik(JSON.parse(storedKalender));
      } catch (e) {
        setKalenderAkademik(INITIAL_KALENDER_AKADEMIK);
      }
    } else {
      setKalenderAkademik(INITIAL_KALENDER_AKADEMIK);
      localStorage.setItem("db_kalender_akademik", JSON.stringify(INITIAL_KALENDER_AKADEMIK));
    }

    if (storedApiUrl) {
      setApiUrl(storedApiUrl);
      setApiConnected(true);
    }

    // 2. Load selected teacher from localStorage (Requirement 1)
    const storedSelected = localStorage.getItem("selectedTeacher") || "";
    setSelectedTeacherState(storedSelected);

    // 3. Hidden Admin Route Detection (Requirement 2)
    // Checks if path contains '/admin', hash is '#admin', or search query contains 'admin=true' or 'role=admin'
    const currentUrl = window.location.href;
    const adminRouteRequested =
      currentUrl.includes("/admin") ||
      window.location.hash.includes("admin") ||
      window.location.search.includes("admin=true") ||
      window.location.search.includes("role=admin");

    void getCurrentUserContext()
      .then(async (context) => {
        const staff = context?.roles.some((role) => role === "ADMIN" || role === "WAKASEK");
        if (staff && localStorage.getItem("db_is_admin") === "true") {
          setIsAdmin(true);
          setAdminUser({ id: context!.user.email || context!.user.id, password: "", nama: context!.displayName });
          const [snapshot, constraints] = await Promise.all([
            new SupabaseScheduleRepository().loadSnapshot(),
            new SupabaseSubstituteConstraintRepository().listActiveConstraints(),
          ]);
          applySupabaseSnapshot(snapshot);
          setSubstituteConstraints(constraints);
        } else {
          if (!staff) setIsAdmin(false);
          if (adminRouteRequested) setShowLoginModal(true);
        }
      })
      .catch(() => {
        setIsAdmin(false);
        if (adminRouteRequested) setShowLoginModal(true);
      });
  }, []);

  // --- SAVE WRAPPERS ---
  const saveTeachers = (data: Teacher[]) => {
    setTeachers(data);
    localStorage.setItem("db_teachers", JSON.stringify(data));
  };

  const saveSchedules = (data: ScheduleItem[]) => {
    const sanitized = data.map(item => ({
      ...item,
      mulai: sanitizeTime(item.mulai),
      selesai: sanitizeTime(item.selesai)
    }));
    setSchedules(sanitized);
    localStorage.setItem("db_schedules", JSON.stringify(sanitized));
  };

  const saveLogs = (data: LogIzinItem[]) => {
    setLogs(data);
    localStorage.setItem("db_logs", JSON.stringify(data));
  };

  // Requirement 1: Save selected teacher to localStorage so all page filters match
  const setSelectedTeacher = (name: string) => {
    setSelectedTeacherState(name);
    localStorage.setItem("selectedTeacher", name);
  };

  // Sync headerSearch when selectedTeacher changes
  useEffect(() => {
    setHeaderSearch(selectedTeacher);
  }, [selectedTeacher]);

  // Click outside listener for header autocomplete
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (headerSuggestionsRef.current && !headerSuggestionsRef.current.contains(event.target as Node)) {
        setShowHeaderSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // --- API SYNC FUNCTION (Google Apps Script integration) ---
  const fetchFromAppsScript = async (customUrl?: string) => {
    const targetUrl = (customUrl !== undefined ? customUrl : apiUrl)?.trim();
    if (!targetUrl) return false;

    setIsLoadingApi(true);
    setApiError("");

    // 1. Validasi Tipe URL Google Apps Script agar user tidak bingung
    if (!targetUrl.startsWith("https://script.google.com/")) {
      setApiError("⚠️ Tautan tidak valid. URL harus dimulai dengan 'https://script.google.com/'.");
      setIsLoadingApi(false);
      setApiConnected(false);
      return false;
    }

    if (targetUrl.includes("/edit") || targetUrl.includes("/home")) {
      setApiError("⚠️ Salah Salin Tautan! Anda memasukkan URL Editor Skrip (berakhiran '/edit'). Di editor Apps Script, silakan klik 'Terapkan' (Deploy) -> 'Penerapan baru' (New deployment), lalu salin 'URL Aplikasi Web' yang berakhiran '/exec'.");
      setIsLoadingApi(false);
      setApiConnected(false);
      return false;
    }

    if (!targetUrl.endsWith("/exec") && !targetUrl.includes("/exec?")) {
      setApiError("⚠️ Tautan Kurang Tepat. URL Aplikasi Web Google Apps Script yang valid harus diakhiri dengan '/exec'.");
      setIsLoadingApi(false);
      setApiConnected(false);
      return false;
    }

    try {
      // Perform GET request
      const response = await fetch(targetUrl);
      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }
      
      const data = await response.json();

      // Tangani error spesifik dari kode Google Apps Script backend
      if (data && data.status === "error") {
        throw new Error(data.message || "Kesalahan internal di Google Apps Script.");
      }
      
      // Structure verification
      // Needs: Jadwal, Master_Guru, Log_Izin
      if (data && (data.Master_Guru || data.Jadwal || data.Log_Izin)) {
        const masterGuru = data.Master_Guru || [];
        const jadwal = data.Jadwal || [];
        const logIzin = data.Log_Izin || [];

        // Derive properties from spreadsheet columns to keep backward compatibility
        const mappedTeachers = masterGuru.map((t: any) => {
          const rawNama = t.nama !== undefined ? t.nama : (t["Nama Guru"] !== undefined ? t["Nama Guru"] : (t.nama_guru !== undefined ? t.nama_guru : (t.namaGuru !== undefined ? t.namaGuru : "")));
          const rawPanggilan = t.panggilan !== undefined ? t.panggilan : (t["Panggilan"] !== undefined ? t["Panggilan"] : (t.Panggilan !== undefined ? t.Panggilan : ""));
          const rawMapel = t.mapel_utama !== undefined ? t.mapel_utama : (t["Mapel"] !== undefined ? t["Mapel"] : (t.mapel !== undefined ? t.mapel : ""));
          const rawRumpun = t.rumpun !== undefined ? t.rumpun : (t["Rumpun"] !== undefined ? t["Rumpun"] : "");
          const rawJenjang = t.jenjang !== undefined ? t.jenjang : (t["Jenjang"] !== undefined ? t["Jenjang"] : "");
          const rawTugas = t.tugas_tambahan !== undefined ? t.tugas_tambahan : (t["Tugas Tambahan"] !== undefined ? t["Tugas Tambahan"] : (t.tugas_tambahan_pns_nonpns !== undefined ? t.tugas_tambahan_pns_nonpns : ""));
          const rawKeterangan = t.keterangan !== undefined ? t.keterangan : (t["Keterangan"] !== undefined ? t["Keterangan"] : "");

          const nameStr = typeof rawNama === "string" ? rawNama.trim() : String(rawNama || "");
          const panggilanStr = typeof rawPanggilan === "string" ? rawPanggilan.trim() : (rawPanggilan ? String(rawPanggilan).trim() : null);
          const mapelStr = typeof rawMapel === "string" ? rawMapel.trim() : String(rawMapel || "");
          const rumpunStr = typeof rawRumpun === "string" ? rawRumpun.trim() : String(rawRumpun || "");
          const jenjangStr = typeof rawJenjang === "string" ? rawJenjang.trim() : String(rawJenjang || "");
          const tugasStr = typeof rawTugas === "string" ? rawTugas.trim() : String(rawTugas || "");
          const keteranganStr = typeof rawKeterangan === "string" ? rawKeterangan.trim() : String(rawKeterangan || "");

          return {
            nama: nameStr,
            panggilan: panggilanStr,
            mapel_utama: mapelStr,
            rumpun: rumpunStr,
            jenjang: jenjangStr,
            tugas_tambahan: tugasStr,
            keterangan: keteranganStr,
            wali_kelas: t.wali_kelas !== undefined ? t.wali_kelas : (t.waliKelas !== undefined ? t.waliKelas : (tugasStr.toLowerCase().includes("wali") ? keteranganStr : null)),
            pendamping_kelas: t.pendamping_kelas !== undefined ? t.pendamping_kelas : (t.pendampingKelas !== undefined ? t.pendampingKelas : (tugasStr.toLowerCase().includes("pendamping") ? keteranganStr : null)),
            is_manajemen: t.is_manajemen !== undefined ? t.is_manajemen : (t.isManajemen !== undefined ? t.isManajemen : (tugasStr.toLowerCase().includes("manajemen") || false))
          };
        });

        saveTeachers(mappedTeachers);
        
        const mappedJadwal = (jadwal || []).map((item: any) => ({
          ...item,
          ruangan: String(item.ruangan || item.room || item.id_ruangan || "").trim(),
          mulai: sanitizeTime(item.mulai),
          selesai: sanitizeTime(item.selesai)
        }));
        saveSchedules(mappedJadwal);
        
        // Map Log_Izin to ensure they have correct, unique IDs and types mapped from the spreadsheet rows
        const mappedLogIzin = logIzin.map((log: any, index: number) => {
          let tanggalStr = "";
          if (log.tanggal) {
            try {
              const d = new Date(log.tanggal);
              if (!isNaN(d.getTime())) {
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                tanggalStr = `${year}-${month}-${day}`;
              } else {
                tanggalStr = String(log.tanggal).trim().split("T")[0];
              }
            } catch (e) {
              tanggalStr = String(log.tanggal).trim().split("T")[0];
            }
          }

          return {
            id: log.id || `Log_Izin_${index + 1}`,
            tanggal: tanggalStr || log.tanggal || "",
            guru_izin: String(log.guru_izin || "").trim(),
            alasan: String(log.alasan || "").trim(),
            jam_ke: Number(log.jam_ke || 0),
            kelas: String(log.kelas || "").trim(),
            mapel: String(log.mapel || "").trim(),
            guru_pengganti: String(log.guru_pengganti || "").trim(),
            tugas: String(log.tugas || log.task || log.link || log["keterangan tugas"] || log["keterangan_tugas"] || "").trim(),
            created_at: log.created_at || new Date().toISOString()
          };
        });

        saveLogs(mappedLogIzin);

        if (data.Jadwal_Insidental && Array.isArray(data.Jadwal_Insidental)) {
          const mappedInsidental = data.Jadwal_Insidental.map((item: any, idx: number) => {
            let tanggalStr = "";
            if (item.tanggal) {
              try {
                const d = new Date(item.tanggal);
                if (!isNaN(d.getTime())) {
                  const year = d.getFullYear();
                  const month = String(d.getMonth() + 1).padStart(2, '0');
                  const day = String(d.getDate()).padStart(2, '0');
                  tanggalStr = `${year}-${month}-${day}`;
                } else {
                  tanggalStr = String(item.tanggal).trim().split("T")[0];
                }
              } catch (e) {
                tanggalStr = String(item.tanggal).trim().split("T")[0];
              }
            }
            return {
              id: item.id || `inc_${idx + 1}`,
              tanggal: tanggalStr || item.tanggal || "",
              kelas: String(item.kelas || "").trim(),
              jam_ke: Number(item.jam_ke || 0),
              mapel: String(item.mapel || "").trim(),
              guru1: String(item.guru1 || "").trim(),
              guru2: String(item.guru2 || "").trim(),
              guru3: String(item.guru3 || "").trim(),
              guru4: String(item.guru4 || "").trim(),
              guru5: String(item.guru5 || "").trim(),
              guru6: String(item.guru6 || "").trim(),
              ruangan: String(item.ruangan || item.room || item.id_ruangan || "").trim(),
              keterangan_khusus: String(item.keterangan_khusus || item.keterangan || "").trim(),
              alasan: String(item.alasan || "").trim(),
              tipe_insidental: String(item.tipe_insidental || item.tipe || "").trim()
            };
          });
          saveJadwalInsidental(mappedInsidental);
        }

        if (data.Master_Ruangan && Array.isArray(data.Master_Ruangan)) {
          const mappedMasterRuangan = data.Master_Ruangan.map((item: any) => ({
            id_ruangan: String(item.id_ruangan || item.id || "").trim(),
            nama_ruangan: String(item.nama_ruangan || item.ruangan || item.nama || "").trim(),
            alias: String(item.alias || "").trim(),
            kapasitas: Number(item.kapasitas || item.capacity || 0),
            lokasi: String(item.lokasi || item.location || "").trim(),
            jenis: String(item.jenis || item.type || "").trim(),
            status: String(item.status || "Aktif").trim()
          }));
          saveMasterRuangan(mappedMasterRuangan);
        }

        if (data.Kalender_Akademik && Array.isArray(data.Kalender_Akademik)) {
          const mappedKalender = data.Kalender_Akademik.map((item: any, idx: number) => {
            let startStr = "";
            let endStr = "";
            if (item.tanggal_mulai) {
              try {
                const d = new Date(item.tanggal_mulai);
                if (!isNaN(d.getTime())) {
                  const year = d.getFullYear();
                  const month = String(d.getMonth() + 1).padStart(2, "0");
                  const day = String(d.getDate()).padStart(2, "0");
                  startStr = `${year}-${month}-${day}`;
                } else {
                  startStr = String(item.tanggal_mulai).trim().split("T")[0];
                }
              } catch (e) {
                startStr = String(item.tanggal_mulai).trim().split("T")[0];
              }
            }
            if (item.tanggal_selesai) {
              try {
                const d = new Date(item.tanggal_selesai);
                if (!isNaN(d.getTime())) {
                  const year = d.getFullYear();
                  const month = String(d.getMonth() + 1).padStart(2, "0");
                  const day = String(d.getDate()).padStart(2, "0");
                  endStr = `${year}-${month}-${day}`;
                } else {
                  endStr = String(item.tanggal_selesai).trim().split("T")[0];
                }
              } catch (e) {
                endStr = String(item.tanggal_selesai).trim().split("T")[0];
              }
            }

            const parseJpNumber = (val: any) => {
              if (val === undefined || val === null || val === "" || String(val).trim() === "") return null;
              const num = Number(val);
              return !isNaN(num) ? num : null;
            };

            const rawId = String(item.id || `kal_${idx + 1}`).trim();
            const rawKelas = String(item.kelas || "").trim();
            const rawCakupan = String(item.cakupan || item.scope || "").trim();
            // Don't assume empty cakupan as Semua; fallback to Kelas if kelas column is filled
            const finalCakupan = rawCakupan || (rawKelas ? "Kelas" : "");
            const jpM = parseJpNumber(item.jp_mulai !== undefined ? item.jp_mulai : item.jp_start);
            const jpS = parseJpNumber(item.jp_selesai !== undefined ? item.jp_selesai : item.jp_end);

            return {
              id: `${rawId}_${rawKelas}_${startStr}_${jpM ?? 'all'}_${idx}`,
              tanggal_mulai: startStr || item.tanggal_mulai || "",
              tanggal_selesai: endStr || item.tanggal_selesai || startStr || item.tanggal_mulai || "",
              nama_kegiatan: String(item.nama_kegiatan || item.kegiatan || item.nama || item.event || "").trim(),
              tipe: String(item.tipe || item.jenis || "Kegiatan Selain KBM Normal").trim(),
              cakupan: finalCakupan,
              kelas: rawKelas,
              jp_mulai: jpM,
              jp_selesai: jpS,
              status: String(item.status || "Aktif").trim()
            };
          });
          saveKalenderAkademik(mappedKalender);
        }

        if (data.akun && Array.isArray(data.akun)) {
          setAccounts(data.akun);
          localStorage.setItem("db_accounts", JSON.stringify(data.akun));
        }

        setApiConnected(true);
        if (customUrl) {
          setApiUrl(customUrl);
          localStorage.setItem("db_api_url", customUrl);
        }
        return true;
      } else {
        throw new Error("Struktur data kosong atau format JSON tidak dikenal. Pastikan nama Sheet di Google Sheets Anda sesuai.");
      }
    } catch (err: any) {
      console.error("API Fetch Error:", err);
      
      let msg = err.message || "Gagal menghubungi Google Apps Script API.";
      if (msg.includes("Failed to fetch")) {
        msg = "Gagal memuat data (Failed to Fetch). Kemungkinan penyebab:\n" +
              "1. Anda belum memilih akses 'Siapa Saja' (Anyone) ketika menerapkan Apps Script.\n" +
              "2. Kebijakan CORS atau pembatasan pihak ketiga di browser Anda memblokir request.\n" +
              "3. Aplikasi Web belum berhasil dideploy ulang sebagai penerapan baru.";
      }
      setApiError(msg);
      setApiConnected(false);
      return false;
    } finally {
      setIsLoadingApi(false);
    }
  };

  // V3.12.4: Admin never bootstraps from Apps Script. Public/guest mode keeps
  // the legacy automatic refresh during the transition so a fresh browser still
  // receives current school data. Switching into Admin does not trigger GAS.
  useEffect(() => {
    if (publicGasBootstrappedRef.current || isAdmin) return;
    const currentUrl = window.location.href;
    const adminRouteRequested =
      currentUrl.includes("/admin") ||
      window.location.hash.includes("admin") ||
      window.location.search.includes("admin=true") ||
      window.location.search.includes("role=admin");
    if (adminRouteRequested) return;
    const storedApiUrl = localStorage.getItem("db_api_url") || "";
    if (!storedApiUrl.trim()) return;
    publicGasBootstrappedRef.current = true;
    void fetchFromAppsScript(storedApiUrl);
  }, [isAdmin]);

  // Reset local database back to default initial mock data
  const handleResetLocalDB = () => {
    triggerConfirm(
      "Setel Ulang Database",
      "Apakah Anda yakin ingin menyetel ulang seluruh database ke data bawaan sekolah? Tindakan ini akan menghapus semua log kustom, jadwal kustom, daftar guru, serta tautan Google Apps Script yang tersimpan.",
      () => {
        saveTeachers(INITIAL_TEACHERS);
        saveSchedules(INITIAL_SCHEDULES);
        saveLogs(INITIAL_LOGS);
        saveJadwalInsidental(INITIAL_INCIDENTALS);
        saveMasterRuangan(INITIAL_MASTER_RUANGAN);
        saveKalenderAkademik(INITIAL_KALENDER_AKADEMIK);
        setSelectedTeacher("");
        setApiUrl("");
        setApiConnected(false);
        localStorage.removeItem("db_api_url");
      }
    );
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
      "Badal ini akan di-soft-delete dari Supabase. Audit history tetap disimpan.",
      async () => {
        try {
          await new SupabaseInvalWriteRepository().deleteAssignment({
            coverageSlotId: id,
            deleteNote: "Soft-delete dari E-Jadwal Admin V3.12.4",
          });
          await refreshFromSupabase();
        } catch (err) {
          alert(err instanceof Error ? err.message : String(err));
        }
      },
    );
  };

  const filteredHeaderTeachers = headerSearch.trim() === ""
    ? []
    : teachers.filter(t => 
        t.nama.toLowerCase().includes(headerSearch.toLowerCase()) ||
        t.mapel_utama.toLowerCase().includes(headerSearch.toLowerCase())
      );

  const currentTeacherObj = teachers.find(t => t.nama === selectedTeacher);

  const missingTeacherTaskCount = new Set(logs.filter((log) =>
    selectedTeacher
    && log.guru_izin?.trim().toLocaleLowerCase("id-ID") === selectedTeacher.trim().toLocaleLowerCase("id-ID")
    && Boolean(String(log.guru_pengganti || "").trim())
    && !String(log.tugas || "").trim()
    && isTaskRecoveryDateActive(log.tanggal, schoolToday)
  ).map((log) => [log.tanggal, Number(log.jam_ke), String(log.mapel || "").trim().toLocaleLowerCase("id-ID"), String(log.guru_pengganti || "").trim().toLocaleLowerCase("id-ID")].join("|"))).size;

  const navItems = [
    // Menu yang dapat digunakan guru diprioritaskan di atas.
    { id: "dashboard", label: "Dashboard", icon: Home, adminOnly: false },
    { id: "ajukan-izin", label: "Ajukan Izin", icon: ClipboardCheck, adminOnly: false },
    { id: "lengkapi-tugas", label: missingTeacherTaskCount > 0 ? `Lengkapi Tugas (${missingTeacherTaskCount})` : "Lengkapi Tugas", icon: FileUp, adminOnly: false, disabled: missingTeacherTaskCount === 0 },
    { id: "jadwal-lengkap", label: "Jadwal Lengkap", icon: Calendar, adminOnly: false },
    { id: "jadwal-kelas", label: "Jadwal Kelas", icon: Layers, adminOnly: false },
    { id: "jadwal-ruangan", label: "Jadwal Ruangan", icon: Building2, adminOnly: false },
    { id: "guru-pengampu-kelas", label: "Guru per Kelas", icon: GraduationCap, adminOnly: false },
    { id: "list-mapel", label: "List Mapel Diajar", icon: BookOpen, adminOnly: false },
    { id: "jam-kosong-individu", label: "Jam Kosong Indiv", icon: Clock, adminOnly: false },

    // Workflow dan konfigurasi operasional/admin dikumpulkan di bawah.
    { id: "approval-izin", label: "Persetujuan Izin", icon: ShieldCheck, adminOnly: true },
    { id: "action-center", label: "Action Center", icon: BellRing, adminOnly: true },
    { id: "management-analytics", label: "Management Analytics", icon: BarChart3, adminOnly: true },
    { id: "tabel-jam-kosong", label: "Tabel Jam Kosong", icon: Table, adminOnly: true },
    { id: "jam-kosong-semua", label: "Jam Kosong Semua", icon: Users, adminOnly: true },
    { id: "rekap-guru", label: "Rekap Guru (Admin)", icon: ClipboardList, adminOnly: true },
    { id: "master-data", label: "Master Data", icon: Database, adminOnly: true },
    { id: "schedule-import", label: "Import Jadwal Massal", icon: FileUp, adminOnly: true },
    { id: "schedule-syaikh-import", label: "Import Jadwal Syaikh", icon: Upload, adminOnly: true },
    { id: "schedule-incidental", label: "Jadwal Insidental", icon: CalendarPlus2, adminOnly: true },
    { id: "substitute-constraints", label: "Aturan Guru Badal", icon: Ban, adminOnly: true },
    { id: "academic-calendar", label: "Kalender Akademik", icon: CalendarDays, adminOnly: true },
    { id: "schedule-control-center", label: "Versi & Konflik Jadwal", icon: GitBranch, adminOnly: true },
    { id: "input-pengganti", label: "Input Inval (Admin)", icon: UserPlus, adminOnly: true },
    { id: "log-pengganti", label: "Log Izin & WA", icon: History, adminOnly: true },
    { id: "statistik", label: "Statistik Badal (Legacy)", icon: BarChart2, adminOnly: true },
  ];

  const handleSelectHeaderTeacher = (teacherName: string) => {
    setSelectedTeacher(teacherName);
    setHeaderSearch(teacherName);
    setShowHeaderSuggestions(false);
  };

  const handleClearHeaderTeacher = () => {
    setSelectedTeacher("");
    setHeaderSearch("");
    setShowHeaderSuggestions(false);
  };

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
                  title="Sembunyikan Sidebar"
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
                  title="Tampilkan Sidebar"
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
                    {item.id === "approval-izin" && !isSidebarCollapsed && (
                      <div className="px-3 pb-1 pt-4 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Administrasi</div>
                    )}
                  <button
                    id={`sidebar-nav-${item.id}`}
                    onClick={() => {
                      if (item.disabled) return;
                      setActivePage(item.id as ActivePage);
                      setIsMobileMenuOpen(false);
                    }}
                    title={item.disabled ? "Aktif ketika guru terpilih punya badal tanpa tugas" : isSidebarCollapsed ? item.label : undefined}
                    className={`w-full flex items-center ${
                      isSidebarCollapsed ? "justify-center px-2 py-3" : "gap-3 px-3 py-2"
                    } rounded-xl font-medium text-sm transition-all ${
                      isActive
                        ? "bg-blue-50 text-blue-700 font-semibold shadow-xs"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    } ${!showItem ? "opacity-50 border-dashed border border-slate-100" : ""} ${item.disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-blue-600" : "text-slate-400"}`} />
                    {!isSidebarCollapsed && (
                      <>
                        <span className="truncate">{item.label}</span>
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
                title={isAdmin ? `Admin: ${adminUser?.nama || "Aktif"} (Klik untuk keluar)` : "Klik untuk Login Admin"}
              >
                <ShieldCheck className={`w-5 h-5 ${isAdmin ? "text-blue-600" : "text-slate-400"}`} />
              </button>
            ) : (
              <>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-500">Admin Mode</span>
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
                    title={isAdmin ? "Matikan Mode Admin" : "Aktifkan Mode Admin"}
                  >
                    <div className={`bg-white w-4 h-4 rounded-full shadow-sm transform duration-200 ${
                      isAdmin ? "translate-x-4" : "translate-x-0"
                    }`} />
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 font-medium truncate">
                  {isAdmin ? `Admin: ${adminUser?.nama || "Aktif"}` : "Mode tamu hanya baca"}
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
                    {item.id === "approval-izin" && (
                      <div className="px-3 pb-1 pt-4 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Administrasi</div>
                    )}
                  <button
                    id={`mobile-nav-${item.id}`}
                    onClick={() => {
                      if (item.disabled) return;
                      setActivePage(item.id as ActivePage);
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md font-medium text-sm transition-all ${
                      isActive
                        ? "bg-blue-50 text-blue-700 font-semibold"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    } ${!showItem ? "opacity-50" : ""} ${item.disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                  >
                    <Icon className="w-4 h-4 text-slate-400" />
                    <span>{item.label}</span>
                  </button>
                  </React.Fragment>
                );
              })}
            </nav>

            <div className="pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-500">Admin Mode</span>
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
                {isAdmin ? `Admin: ${adminUser?.nama || "Aktif"}` : "Mode tamu hanya baca"}
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
              title={isSidebarCollapsed ? "Tampilkan Sidebar Kiri" : "Sembunyikan Sidebar Kiri"}
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

            {/* Global Search Autocomplete Bar */}
            <div className="relative w-64 sm:w-80 md:w-96" ref={headerSuggestionsRef}>
              <span className="absolute inset-y-0 left-3 flex items-center text-slate-400">
                <Search className="w-4 h-4" />
              </span>
              <input 
                id="global-teacher-search-input"
                type="text" 
                placeholder="Cari Nama Guru... (Autocomplete)" 
                className="w-full pl-9 pr-8 py-2 border border-slate-200 rounded-lg text-xs sm:text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:bg-white text-slate-800 transition-all"
                value={headerSearch}
                onChange={(e) => {
                  setHeaderSearch(e.target.value);
                  setShowHeaderSuggestions(true);
                }}
                onFocus={() => setShowHeaderSuggestions(true)}
              />
              {headerSearch && (
                <button
                  id="clear-global-search-btn"
                  onClick={handleClearHeaderTeacher}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200 transition-all"
                  title="Bersihkan pilihan"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Suggestions dropdown */}
              {showHeaderSuggestions && filteredHeaderTeachers.length > 0 && (
                <div className="absolute z-50 left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto divide-y divide-slate-100">
                  {filteredHeaderTeachers.map((teacher) => (
                    <button
                      key={teacher.nama}
                      id={`global-suggest-${teacher.nama.replace(/\s+/g, '-').toLowerCase()}`}
                      onClick={() => handleSelectHeaderTeacher(teacher.nama)}
                      className="w-full text-left px-4 py-2.5 hover:bg-blue-50/50 flex flex-col transition-colors group"
                    >
                      <span className="font-semibold text-xs sm:text-sm text-slate-700 group-hover:text-blue-600 transition-colors">
                        {teacher.nama}
                      </span>
                      <span className="text-[10px] text-slate-400 mt-0.5">
                        {teacher.mapel_utama} | {teacher.jenjang} {teacher.wali_kelas ? `| Wali ${teacher.wali_kelas}` : ""}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {showHeaderSuggestions && headerSearch.trim() !== "" && filteredHeaderTeachers.length === 0 && (
                <div className="absolute z-50 left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-lg p-4 text-center text-slate-500 text-xs">
                  Tidak ada guru "{headerSearch}"
                </div>
              )}
            </div>
          </div>

          {/* Header Right Content */}
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            
            {/* Database Refresh Button */}
            {!isAdmin && apiUrl && (
              <button
                id="header-refresh-db-btn"
                onClick={async () => {
                  const success = await fetchFromAppsScript(apiUrl);
                  if (success) {
                    alert("Database berhasil disinkronkan dan diperbarui dari Google Sheets!");
                  } else {
                    alert("Gagal menyegarkan database. Silakan periksa koneksi Anda.");
                  }
                }}
                disabled={isLoadingApi}
                className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg bg-blue-50 hover:bg-blue-100 disabled:bg-slate-50 text-blue-700 disabled:text-slate-400 border border-blue-200 disabled:border-slate-200 shadow-xs transition-all cursor-pointer"
                title="Segarkan Data dari Google Sheets"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${isLoadingApi ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Refresh Data</span>
              </button>
            )}

            {isAdmin && (
              <button
                id="header-refresh-supabase-btn"
                onClick={async () => {
                  try { await refreshFromSupabase(); }
                  catch (err) { alert(err instanceof Error ? err.message : String(err)); }
                }}
                className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 shadow-xs transition-all"
                title="Refresh data runtime dari Supabase"
              >
                <RefreshCw className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Refresh Supabase</span>
              </button>
            )}

            {/* Admin runtime source indicator */}
            {isAdmin && (
              <button
                id="header-sync-api-btn"
                onClick={() => {}}
                className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg border bg-indigo-50 text-indigo-700 border-indigo-200 cursor-default"
                title="Admin runtime memakai Supabase; Apps Script tidak dipakai sebagai database runtime"
              >
                <Database className="w-3.5 h-3.5 text-indigo-600" />
                <span className="hidden sm:inline">Supabase</span>
              </button>
            )}

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
            
            {/* Dynamic Page Routing */}
            {activePage === "dashboard" && (
              <Dashboard 
                teachers={teachers}
                schedules={schedules}
                logs={logs}
                jadwalInsidental={jadwalInsidental}
                masterRuangan={masterRuangan}
                kalenderAkademik={kalenderAkademik}
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
                <LeaveApprovalAdmin teachers={teachers} onBack={() => setActivePage("dashboard")} />
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
                    setHeaderSearch(teacherName);
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

            {activePage === "jadwal-lengkap" && (
              <JadwalLengkap 
                teachers={teachers}
                schedules={schedules}
                masterRuangan={masterRuangan}
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
                  onChanged={async () => {
                    const constraints = await new SupabaseSubstituteConstraintRepository().listActiveConstraints();
                    setSubstituteConstraints(constraints);
                  }}
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

          </div>

          {/* Minimalist Sub-Footer */}
          <div className="max-w-6xl mx-auto mt-12 pt-6 border-t border-slate-200/60 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-400">
            <p className="font-semibold text-slate-500">E-JADWAL © 2026 • Istiqomah's House of Harmony Team & AL-WILDAN INTERNASIONAL ISLAMIC SCHOOL 10 JAKARTA</p>
            <div className="flex items-center gap-3">
              {isAdmin && (
                <>
                  <button 
                    id="footer-btn-reset" 
                    onClick={handleResetLocalDB} 
                    className="hover:text-red-600 text-red-500 transition-colors font-bold"
                  >
                    Setel Ulang DB
                  </button>
                  <span>•</span>
                </>
              )}
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

      {/* Configuration / Sync API modal */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full border border-slate-200 p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-sm sm:text-base flex items-center gap-2">
                <Database className="w-4 h-4 text-blue-600" />
                Integrasi REST API Google Apps Script
              </h3>
              <button 
                id="close-sync-modal-btn"
                onClick={() => setShowConfigModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ×
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              Integrasikan database aplikasi ini langsung ke Google Sheets sekolah via Google Apps Script Web App URL. JSON harus mengandung array: <strong>Master_Guru</strong>, <strong>Jadwal</strong>, dan <strong>Log_Izin</strong>.
            </p>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="block text-xs font-bold text-slate-600">Web App API URL</label>
                <button
                  id="reset-to-default-api-btn"
                  type="button"
                  onClick={() => {
                    setApiUrl(DEFAULT_API_URL);
                    localStorage.setItem("db_api_url", DEFAULT_API_URL);
                  }}
                  className="text-[10px] text-blue-600 hover:text-blue-800 font-bold hover:underline transition-all"
                >
                  Gunakan URL Default Baru
                </button>
              </div>
              <input
                id="api-url-input"
                type="url"
                placeholder="https://script.google.com/macros/s/.../exec"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                className="w-full bg-slate-50 text-xs border border-slate-200 focus:bg-white focus:border-blue-500 rounded-lg p-2.5 focus:outline-none transition-colors"
              />
            </div>

            {apiError && (
              <p className="text-[11px] text-red-600 font-semibold bg-red-50 border border-red-100 p-2 rounded-lg">
                ⚠️ Error: {apiError}
              </p>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 text-xs">
              <div className="flex gap-2 ml-auto">
                <button
                  id="disconnect-api-btn"
                  type="button"
                  onClick={() => {
                    setApiUrl("");
                    setApiConnected(false);
                    localStorage.setItem("db_api_url", "");
                    setShowConfigModal(false);
                  }}
                  className="px-3 py-1.5 hover:bg-slate-100 text-slate-500 font-semibold rounded-lg transition-colors"
                >
                  Putuskan Sambungan
                </button>

                <button
                  id="connect-api-btn"
                  type="button"
                  onClick={async () => {
                    if (apiUrl) {
                      const success = await fetchFromAppsScript(apiUrl);
                      if (success) {
                        setShowConfigModal(false);
                        alert("Database berhasil terhubung dan disinkronkan dengan Google Sheets!");
                      }
                    } else {
                      alert("Masukkan URL API terlebih dahulu.");
                    }
                  }}
                  disabled={isLoadingApi}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold rounded-lg transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  {isLoadingApi && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  {isLoadingApi ? "Menghubungkan..." : "Hubungkan & Ambil Data"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {scheduleEditorState && (
        <ScheduleQuickEditor
          items={scheduleEditorState.items}
          allSchedules={schedules}
          incidentals={jadwalInsidental}
          initialDate={scheduleEditorState.initialDate}
          onClose={() => setScheduleEditorState(null)}
          onSaved={async () => { await refreshFromSupabase(); }}
        />
      )}

      {/* Admin Login Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-sm w-full border border-slate-200 p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-sm sm:text-base flex items-center gap-2">
                <LogIn className="w-4 h-4 text-blue-600" />
                Login Administrator
              </h3>
              <button 
                id="close-login-modal-btn"
                onClick={() => {
                  setShowLoginModal(false);
                  setLoginError("");
                }}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ×
              </button>
            </div>

            <form 
              onSubmit={async (e) => {
                e.preventDefault();
                setLoginError("");
                setAdminAuthLoading(true);
                try {
                  await signInWithPassword({ email: loginId.trim(), password: loginPassword });
                  const { context } = await refreshFromSupabase();
                  const matched: AdminAccount = { id: context.user.email || context.user.id, password: "", nama: context.displayName };
                  setIsAdmin(true);
                  setAdminUser(matched);
                  localStorage.setItem("db_admin_user", JSON.stringify(matched));
                  setShowLoginModal(false);
                  setLoginId("");
                  setLoginPassword("");
                } catch (err) {
                  try { await signOut(); } catch {}
                  setLoginError(err instanceof Error ? err.message : "Login Supabase gagal.");
                } finally {
                  setAdminAuthLoading(false);
                }
              }} 
              className="space-y-4 text-xs"
            >
              <div className="space-y-1">
                <label className="block font-bold text-slate-600">Email Supabase Admin / Wakasek</label>
                <input
                  id="login-id-input"
                  type="text"
                  required
                  placeholder="Masukkan ID..."
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-500 rounded-lg p-2.5 focus:outline-none transition-colors"
                />
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-slate-600">Kata Sandi (Password)</label>
                <input
                  id="login-password-input"
                  type="password"
                  required
                  placeholder="Masukkan password..."
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-500 rounded-lg p-2.5 focus:outline-none transition-colors"
                />
              </div>

              {loginError && (
                <p className="text-[11px] text-red-600 font-semibold bg-red-50 border border-red-100 p-2 rounded-lg">
                  ⚠️ {loginError}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  id="cancel-login-btn"
                  type="button"
                  onClick={() => {
                    setShowLoginModal(false);
                    setLoginError("");
                  }}
                  className="px-3 py-1.5 hover:bg-slate-100 text-slate-500 font-semibold rounded-lg transition-colors"
                >
                  Batal
                </button>

                <button
                  id="submit-login-btn" disabled={adminAuthLoading}
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors shadow-sm"
                >
                  Masuk
                </button>
              </div>
            </form>
          </div>
        </div>
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
                Batal
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
        Kembali ke Dashboard
      </button>
    </div>
  );
}
