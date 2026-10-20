import React, { useState } from "react";
import { LogIn } from "lucide-react";
import { T } from "../../i18n/LanguageProvider";

interface AdminLoginModalProps {
  onClose: () => void;
  onLogin: (email: string, password: string) => Promise<void>;
}

/** Local input state: a keystroke here never schedules a rerender of App's large schedule tree. */
export const AdminLoginModal: React.FC<AdminLoginModalProps> = ({ onClose, onLogin }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  return <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
    <div className="bg-white rounded-xl max-w-sm w-full border border-slate-200 p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
      <div className="flex justify-between items-center pb-2 border-b border-slate-100">
        <h3 className="font-bold text-slate-800 text-sm sm:text-base flex items-center gap-2">
          <LogIn className="w-4 h-4 text-blue-600" />Login Administrator
        </h3>
        <button type="button" id="close-login-modal-btn" disabled={busy} onClick={onClose}
          className="text-slate-400 hover:text-slate-600 text-lg font-bold disabled:opacity-50">×</button>
      </div>
      <form onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        setError(""); setBusy(true);
        try { await onLogin(email, password); }
        catch (err) { setError(err instanceof Error ? err.message : "Login Supabase gagal."); }
        finally { setBusy(false); }
      }} className="space-y-4 text-xs">
        <div className="space-y-1">
          <label htmlFor="login-id-input" className="block font-bold text-slate-600">Email Supabase Admin / Wakasek</label>
          <input id="login-id-input" type="text" required autoComplete="username" placeholder="Masukkan ID..."
            value={email} onChange={(event) => setEmail(event.target.value)}
            className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-500 rounded-lg p-2.5 focus:outline-none transition-colors" />
        </div>
        <div className="space-y-1">
          <label htmlFor="login-password-input" className="block font-bold text-slate-600">Kata Sandi (Password)</label>
          <input id="login-password-input" type="password" required autoComplete="current-password" placeholder="Masukkan password..."
            value={password} onChange={(event) => setPassword(event.target.value)}
            className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-500 rounded-lg p-2.5 focus:outline-none transition-colors" />
        </div>
        {error && <p role="alert" className="text-[11px] text-red-600 font-semibold bg-red-50 border border-red-100 p-2 rounded-lg">⚠️ {error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button id="cancel-login-btn" type="button" disabled={busy} onClick={onClose}
            className="px-3 py-1.5 hover:bg-slate-100 text-slate-500 font-semibold rounded-lg transition-colors disabled:opacity-50"><T>{"Batal"}</T></button>
          <button id="submit-login-btn" type="submit" disabled={busy}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors shadow-sm disabled:opacity-50">Masuk</button>
        </div>
      </form>
    </div>
  </div>;
};
