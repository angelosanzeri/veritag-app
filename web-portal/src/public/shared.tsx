/**
 * Pieces shared by the visitor-facing pages: chrome, the ArtTrust seal, the
 * lead form and the device-local Private View passes.
 */
import { useId, useState, type ReactNode } from "react";
import { ArrowRight, CheckCircle2, Contact, Globe, Moon, ShieldAlert, ShieldCheck, ShieldQuestion, Sun, SunMoon } from "lucide-react";

import { useI18n } from "../lib/i18n.js";
import { Link } from "../lib/router.js";
import { useSession } from "../lib/session.js";
import { useTheme } from "../lib/theme.js";
import { errText } from "../lib/format.js";
import type { PassportVerdict } from "../portal.js";
import type { LeadKind } from "../studio-api.js";
import { Button, Input, Mark, Seg, Sheet, TextArea, toast } from "../ui/index.js";

// ── chrome ──────────────────────────────────────────────────────────────
export function LangToggle() {
  const { lang, setLang } = useI18n();
  return (
    <button className="btn btn-quiet btn-sm" onClick={() => setLang(lang === "it" ? "en" : "it")} aria-label="Language">
      <Globe />
      {lang.toUpperCase()}
    </button>
  );
}

export function ThemeToggle() {
  const [pref, setPref] = useTheme();
  const { t } = useI18n();
  const next = pref === "system" ? "dark" : pref === "dark" ? "light" : "system";
  const Icon = pref === "dark" ? Moon : pref === "light" ? Sun : SunMoon;
  return (
    <button className="btn btn-quiet btn-sm btn-icon" onClick={() => setPref(next)} aria-label={t("Tema", "Theme")} title={t("Tema", "Theme")}>
      <Icon />
    </button>
  );
}

export function PublicHeader({ transparent }: { transparent?: boolean }) {
  const { session } = useSession();
  const { t } = useI18n();
  return (
    <header className={`pub-header${transparent ? " transparent" : ""}`}>
      <div className="pub-wrap pub-header-in">
        <Link to="/" aria-label="Veritag">
          <Mark size={30} />
        </Link>
        <div className="spacer" />
        <LangToggle />
        <ThemeToggle />
        {session ? (
          <Link to="/studio" className="btn btn-ghost btn-sm">
            {t("Il tuo Studio", "Your Studio")}
            <ArrowRight />
          </Link>
        ) : (
          <Link to="/login" className="btn btn-ghost btn-sm">
            {t("Accedi", "Sign in")}
          </Link>
        )}
      </div>
    </header>
  );
}

export function PublicFooter() {
  const { t } = useI18n();
  return (
    <footer className="pub-footer">
      <div className="pub-wrap pub-footer-in">
        <Mark size={22} />
        <span className="faint">
          {t("Autenticità", "Authenticity")} <b className="muted">ArtTrust</b> · {t("tecnologia NFC", "NFC technology by")} <b className="muted">Exteryo</b>
        </span>
        <div className="spacer" />
        <a className="faint" href="https://veritag.art" target="_blank" rel="noreferrer">
          veritag.art
        </a>
      </div>
    </footer>
  );
}

// ── ArtTrust ────────────────────────────────────────────────────────────
export interface VerdictLook {
  tone: "green" | "amber" | "red" | "gold";
  title: string;
  line: string;
  icon: ReactNode;
}

export function useVerdictLook() {
  const { t } = useI18n();
  return (v: PassportVerdict): VerdictLook => {
    switch (v) {
      case "authentic":
        return { tone: "green", icon: <ShieldCheck />, title: t("Autentica", "Authentic"), line: t("Chip originale, lettura fresca, firma dell'artista garantita da un curatore.", "Genuine chip, fresh read, the artist's signature vouched for by a curator.") };
      case "unverified_artist":
        return { tone: "amber", icon: <ShieldQuestion />, title: t("Artista da verificare", "Artist not yet verified"), line: t("Il chip è originale, ma l'artista non ha ancora la garanzia di un curatore.", "The chip is genuine, but no curator has vouched for the artist yet.") };
      case "replayed":
        return { tone: "amber", icon: <ShieldAlert />, title: t("Lettura già usata", "Read already used"), line: t("Questo codice è già stato letto: avvicina di nuovo il telefono all'opera.", "This code was already read — tap the artwork again.") };
      case "counterfeit":
        return { tone: "red", icon: <ShieldAlert />, title: t("Non autentica", "Not authentic"), line: t("La firma del chip non corrisponde: non è il tag originale dell'opera.", "The chip's signature doesn't match — this is not the artwork's original tag.") };
      default:
        return { tone: "gold", icon: <ShieldCheck />, title: t("Scheda d'archivio", "Archive record"), line: t("La scheda dell'opera. Per la verifica dal vivo avvicina il telefono al tag.", "The artwork's record. For a live check, hold your phone to the tag.") };
    }
  };
}

/** The seal: a stamped rosette with ARTTRUST running round it. */
export function ArtTrustSeal({ verdict, size = 108 }: { verdict: PassportVerdict; size?: number }) {
  const look = useVerdictLook()(verdict);
  const { t } = useI18n();
  const pathId = `seal-${useId().replace(/:/g, "")}`;
  const ring = `ARTTRUST · ${look.title.toUpperCase()} · ARTTRUST · ${t("CERTIFICATO", "CERTIFIED")} · `;
  return (
    <div className={`seal seal-${look.tone}`} style={{ width: size, height: size }} aria-label={`ArtTrust — ${look.title}`}>
      <svg viewBox="0 0 120 120" className="seal-ring" aria-hidden>
        <defs>
          <path id={pathId} d="M60,60 m-47,0 a47,47 0 1,1 94,0 a47,47 0 1,1 -94,0" />
        </defs>
        <circle cx="60" cy="60" r="57" className="seal-outer" />
        <circle cx="60" cy="60" r="38" className="seal-inner" />
        <text className="seal-text">
          <textPath href={`#${pathId}`} startOffset="0">
            {ring}
          </textPath>
        </text>
      </svg>
      <div className="seal-core">{look.icon}</div>
    </div>
  );
}

// ── Private View passes (device-local, 24h) ─────────────────────────────
const PASSES = "veritag.passes";
type PassMap = Record<string, { token: string; exp: number }>;

function readPasses(): PassMap {
  try {
    const all = JSON.parse(localStorage.getItem(PASSES) || "{}") as PassMap;
    const now = Date.now() / 1000;
    return Object.fromEntries(Object.entries(all).filter(([, p]) => p.exp > now));
  } catch {
    return {};
  }
}

export function rememberPass(viewIds: string[], token: string, exp: number) {
  const all = readPasses();
  viewIds.forEach((id) => (all[id] = { token, exp }));
  try {
    localStorage.setItem(PASSES, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

export function passFor(viewId: string): string | undefined {
  return readPasses()[viewId]?.token;
}

// ── lead form ───────────────────────────────────────────────────────────
export function LeadSheet({
  open,
  onClose,
  kind: initialKind,
  artistId,
  artistName,
  viewId,
  itemId,
  itemTitle,
  uid,
  vcardUrl,
}: {
  open: boolean;
  onClose: () => void;
  kind: LeadKind;
  artistId?: string | null;
  artistName?: string;
  viewId?: string;
  itemId?: string;
  itemTitle?: string;
  uid?: string;
  vcardUrl?: string;
}) {
  const { t } = useI18n();
  const { studio } = useSession();
  const [kind, setKind] = useState<LeadKind>(initialKind);
  const [f, setF] = useState({ name: "", email: "", phone: "", company: "", message: "", website: "" });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const submit = async () => {
    if (!studio) return;
    setBusy(true);
    try {
      await studio.sendLead({ kind, artist_id: artistId, view_id: viewId, item_id: itemId, uid, consent, ...f });
      setDone(true);
    } catch (e) {
      toast(errText(e, t), "err");
    } finally {
      setBusy(false);
    }
  };
  const close = () => {
    onClose();
    setTimeout(() => setDone(false), 300);
  };
  const who = artistName || t("l'artista", "the artist");
  const valid = f.name.trim().length >= 2 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim()) && consent;

  return (
    <Sheet
      open={open}
      onClose={close}
      title={done ? t("Richiesta inviata", "Request sent") : itemTitle ? t(`Richiedi “${itemTitle}”`, `Ask about “${itemTitle}”`) : t(`Contatta ${who}`, `Contact ${who}`)}
      sub={done ? undefined : t("Il tuo contatto arriva direttamente all'artista e al suo curatore.", "Your details go straight to the artist and their curator.")}
      footer={
        done ? (
          <Button onClick={close}>{t("Fatto", "Done")}</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={close}>
              {t("Annulla", "Cancel")}
            </Button>
            <Button busy={busy} disabled={!valid} onClick={submit}>
              {t("Invia richiesta", "Send request")}
            </Button>
          </>
        )
      }
    >
      {done ? (
        <div className="lead-done">
          <CheckCircle2 />
          <p>{t(`Grazie! ${who} ti ricontatterà a breve.`, `Thank you! ${who} will be in touch shortly.`)}</p>
          {vcardUrl && (
            <a className="btn btn-ghost" href={vcardUrl}>
              <Contact />
              {t("Salva intanto il contatto", "Save the contact meanwhile")}
            </a>
          )}
        </div>
      ) : (
        <div className="stack">
          {!itemId && (
            <Seg<LeadKind>
              block
              value={kind}
              onChange={setKind}
              options={[
                { value: "studio_visit", label: t("Studio visit", "Studio visit") },
                { value: "info", label: t("Informazioni", "Information") },
                { value: "purchase", label: t("Acquisto", "Purchase") },
              ]}
            />
          )}
          <div className="grid-2">
            <Input label={t("Nome e cognome", "Full name")} autoComplete="name" value={f.name} onChange={set("name")} />
            <Input label={t("Azienda", "Company")} autoComplete="organization" value={f.company} onChange={set("company")} />
          </div>
          <div className="grid-2">
            <Input label="Email" type="email" autoComplete="email" inputMode="email" value={f.email} onChange={set("email")} />
            <Input label={t("Telefono (facoltativo)", "Phone (optional)")} type="tel" autoComplete="tel" value={f.phone} onChange={set("phone")} />
          </div>
          <TextArea
            label={t("Messaggio", "Message")}
            rows={3}
            value={f.message}
            onChange={set("message")}
            placeholder={kind === "studio_visit" ? t("Quando ti piacerebbe visitare lo studio?", "When would you like to visit the studio?") : t("Scrivi qui la tua richiesta…", "Write your request here…")}
          />
          <input className="hp" tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} aria-hidden placeholder="website" />
          <label className="consent">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>
              {t(
                "Acconsento a condividere i miei dati con l'artista e il curatore per essere ricontattato su questa richiesta.",
                "I agree to share my details with the artist and the curator so they can get back to me about this request.",
              )}
            </span>
          </label>
        </div>
      )}
    </Sheet>
  );
}

export function PageLoader() {
  return (
    <div className="page-loader" aria-busy>
      <img src="/mark.svg" alt="" />
    </div>
  );
}
