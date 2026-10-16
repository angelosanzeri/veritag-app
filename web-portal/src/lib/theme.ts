import { useEffect, useState } from "react";

export type ThemePref = "system" | "light" | "dark";
const KEY = "veritag.theme";

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function useTheme(): [ThemePref, (t: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>(read);
  useEffect(() => {
    const el = document.documentElement;
    if (pref === "system") delete el.dataset.theme;
    else el.dataset.theme = pref;
    try {
      if (pref === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, pref);
    } catch {
      /* ignore */
    }
  }, [pref]);
  return [pref, setPref];
}
