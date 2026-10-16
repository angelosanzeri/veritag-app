/**
 * Two languages, written side by side where they are used: `t("Ciao", "Hello")`.
 * No key files to drift apart, no missing translations — the compiler sees both.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Lang = "it" | "en";
const KEY = "veritag.lang";

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "it" || saved === "en") return saved;
  } catch {
    /* private mode */
  }
  return (navigator.language || "it").toLowerCase().startsWith("it") ? "it" : "en";
}

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (it: string, en: string) => string;
  locale: string;
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(KEY, l);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const value = useMemo<I18n>(
    () => ({ lang, setLang, t: (it, en) => (lang === "it" ? it : en), locale: lang === "it" ? "it-IT" : "en-GB" }),
    [lang, setLang],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n outside I18nProvider");
  return v;
}
