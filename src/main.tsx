import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { LanguageProvider } from "./i18n/LanguageProvider";
import "./index.css";

const root = createRoot(document.getElementById("root")!);
const params = new URLSearchParams(window.location.search);
const smokeMode = params.get("supabase-smoke") === "1";
const migrationMode = params.get("supabase-migrate") === "1";
const dashboardCutoverMode = params.get("supabase-dashboard") === "1";
const jadwalKelasCutoverMode = params.get("supabase-jadwal-kelas") === "1";
const jadwalRuanganCutoverMode = params.get("supabase-jadwal-ruangan") === "1";
const availabilityCutoverMode = params.get("supabase-availability") === "1";
const leaveApprovalMode = params.get("supabase-leave-approval") === "1";
const invalWriteCutoverMode = params.get("supabase-inval-write") === "1";
const invalCutoverMode = params.get("supabase-inval") === "1";

if (leaveApprovalMode) {
  void import("./components/LeaveApprovalAdmin.tsx").then(({ default: LeaveApprovalAdmin }) => {
    root.render(
      <StrictMode>
        <div className="min-h-screen bg-slate-50 p-4 sm:p-6 md:p-8">
          <div className="max-w-6xl mx-auto">
            <LeaveApprovalAdmin />
          </div>
        </div>
      </StrictMode>,
    );
  });
} else if (invalWriteCutoverMode) {
  void import("./components/SupabaseInvalCutover.tsx").then(({ default: SupabaseInvalCutover }) => {
    root.render(
      <StrictMode>
        <SupabaseInvalCutover writeEnabled />
      </StrictMode>,
    );
  });
} else if (invalCutoverMode) {
  void import("./components/SupabaseInvalCutover.tsx").then(({ default: SupabaseInvalCutover }) => {
    root.render(
      <StrictMode>
        <SupabaseInvalCutover />
      </StrictMode>,
    );
  });
} else if (availabilityCutoverMode) {
  void import("./components/SupabaseAvailabilityCutover.tsx").then(({ default: SupabaseAvailabilityCutover }) => {
    root.render(
      <StrictMode>
        <SupabaseAvailabilityCutover />
      </StrictMode>,
    );
  });
} else if (jadwalRuanganCutoverMode) {
  void import("./components/SupabaseJadwalRuanganCutover.tsx").then(({ default: SupabaseJadwalRuanganCutover }) => {
    root.render(
      <StrictMode>
        <SupabaseJadwalRuanganCutover />
      </StrictMode>,
    );
  });
} else if (jadwalKelasCutoverMode) {
  void import("./components/SupabaseJadwalKelasCutover.tsx").then(({ default: SupabaseJadwalKelasCutover }) => {
    root.render(
      <StrictMode>
        <SupabaseJadwalKelasCutover />
      </StrictMode>,
    );
  });
} else if (dashboardCutoverMode) {
  void import("./components/SupabaseDashboardCutover.tsx").then(({ default: SupabaseDashboardCutover }) => {
    root.render(
      <StrictMode>
        <SupabaseDashboardCutover />
      </StrictMode>,
    );
  });
} else if (migrationMode) {
  void import("./components/SupabaseMigrationTool.tsx").then(({ default: SupabaseMigrationTool }) => {
    root.render(
      <StrictMode>
        <SupabaseMigrationTool />
      </StrictMode>,
    );
  });
} else if (smokeMode) {
  void import("./components/SupabaseSmokeTest.tsx").then(({ default: SupabaseSmokeTest }) => {
    root.render(
      <StrictMode>
        <SupabaseSmokeTest />
      </StrictMode>,
    );
  });
} else {
  root.render(
    <StrictMode>
      <LanguageProvider><App /></LanguageProvider>
    </StrictMode>,
  );
}
