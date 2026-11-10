import { useEffect, useMemo, useState, type ReactNode } from "react";
import { LanguageContext, translator, type Language } from "./language-store";

const STORAGE_KEY = "school_admission_language";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "bn" ? "bn" : "en";
    } catch {
      return "en";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      /* Language still works for this session. */
    }
  }, [language]);
  const value = useMemo(
    () => ({ language, setLanguage, t: translator(language) }),
    [language],
  );
  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}
