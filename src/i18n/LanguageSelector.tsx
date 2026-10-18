import React from 'react';
import { Languages } from 'lucide-react';
import { useLanguage } from './LanguageProvider';
import { type Locale } from './translations';

/** Native select stays usable on a 256px mobile drawer and collapsed desktop sidebar. */
export function LanguageSelector({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage } = useLanguage();
  const id = React.useId();
  return <div className={compact ? 'flex justify-center py-2' : 'pb-3'}>
    {!compact && <label htmlFor={id} className="flex items-center gap-2 mb-1.5 text-xs font-semibold text-slate-500">
      <Languages className="h-4 w-4"/><span>Language / Bahasa / اللغة</span>
    </label>}
    <select
      id={id}
      aria-label="Language / Bahasa / اللغة"
      lang={language}
      dir="ltr"
      value={language}
      onChange={e => setLanguage(e.target.value as Locale)}
      title="Language / Bahasa / اللغة"
      className={`rounded-lg bg-slate-50 border border-slate-200 text-slate-800 text-xs font-semibold focus-visible:ring-2 focus-visible:ring-blue-500 ${compact ? 'w-14 px-1 py-2' : 'w-full min-w-0 px-2 py-2'}`}
    >
      <option value="id">{compact ? 'ID' : '🇮🇩 Bahasa Indonesia'}</option>
      <option value="en">{compact ? 'EN' : '🇬🇧 English'}</option>
      <option value="ar">{compact ? 'AR' : 'العربية'}</option>
    </select>
  </div>;
}
