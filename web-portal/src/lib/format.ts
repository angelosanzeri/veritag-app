export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase() || "·";

export function fmtDate(value: string | number | undefined | null, locale: string, opts?: Intl.DateTimeFormatOptions): string {
  if (value === undefined || value === null || value === "") return "";
  const d = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(locale, opts ?? { day: "numeric", month: "short", year: "numeric" });
}

export function fmtRange(a: string | undefined, b: string | undefined, locale: string): string {
  const x = fmtDate(a, locale);
  const y = fmtDate(b, locale);
  return [x, y].filter(Boolean).join(" – ");
}

export function relTime(epochSeconds: number, locale: string): string {
  const diff = epochSeconds * 1000 - Date.now();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const abs = Math.abs(diff);
  const min = 60_000, hour = 60 * min, day = 24 * hour;
  if (abs < hour) return rtf.format(Math.round(diff / min), "minute");
  if (abs < day) return rtf.format(Math.round(diff / hour), "hour");
  if (abs < 30 * day) return rtf.format(Math.round(diff / day), "day");
  return fmtDate(epochSeconds, locale);
}

export function money(value: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
}

export const num = (n: number, locale: string) => new Intl.NumberFormat(locale).format(n);

/** "1 opera" / "3 opere" — the count with the right form of the noun. */
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** A stable hash → hue, so artworks without a photo still get their own colour. */
export function hue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function artGradient(seed: string): string {
  const a = hue(seed);
  const b = (a + 48) % 360;
  return `radial-gradient(120% 90% at 20% 15%, hsl(${a} 70% 62% / .9), transparent 60%), radial-gradient(90% 90% at 85% 90%, hsl(${b} 65% 55% / .85), transparent 55%), linear-gradient(135deg, hsl(${a} 35% 18%), hsl(${b} 40% 12%))`;
}

export const shortUid = (uid: string) => (uid.length > 10 ? `${uid.slice(0, 4)}…${uid.slice(-4)}` : uid);

export function downloadText(filename: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function errText(e: unknown, t: (it: string, en: string) => string): string {
  const err = e as { status?: number; message?: string };
  if (err?.status === 0 || err?.message === "network") return t("Connessione non disponibile. Riprova tra poco.", "No connection. Try again in a moment.");
  if (err?.message === "studio") return t("Veritag Studio non è collegato.", "Veritag Studio is not connected.");
  if (err?.status === 401) return t("Credenziali non valide o sessione scaduta.", "Wrong credentials or expired session.");
  if (err?.status === 429) return t("Troppi tentativi: attendi qualche minuto.", "Too many attempts — wait a few minutes.");
  return err?.message || t("Qualcosa è andato storto.", "Something went wrong.");
}
