import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { DEFAULT_LOCALE, isLocale, LOCALE_STORAGE_KEY, tr, type Locale } from './translations';

interface LanguageContextValue {
  language: Locale;
  setLanguage: (language: Locale) => void;
  t: (text: string) => string;
}
const LanguageContext = createContext<LanguageContextValue>({
  language: DEFAULT_LOCALE,
  setLanguage: () => {},
  t: (text) => text,
});

function readStoredLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(stored) ? stored : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Locale>(readStoredLocale);
  useEffect(() => {
    try { window.localStorage.setItem(LOCALE_STORAGE_KEY, language); } catch { /* storage may be disabled */ }
    document.documentElement.lang = language;
    // The timetable grid, sidebar and periods stay LTR in every language.
    document.documentElement.dir = 'ltr';
  }, [language]);
  const value = useMemo<LanguageContextValue>(() => ({
    language, setLanguage, t: (text: string) => tr(text, language),
  }), [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}

/** Only for static UI copy. Never wrap database records or user-generated text. */
export function T({ children }: { children: string }) {
  const { language, t } = useLanguage();
  return <span lang={language} dir={language === 'ar' ? 'rtl' : undefined} style={language === 'ar' ? { unicodeBidi: 'isolate' } : undefined}>{t(children)}</span>;
}
