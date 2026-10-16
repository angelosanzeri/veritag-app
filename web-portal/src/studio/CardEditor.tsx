/**
 * The artist's card — public profile and the vCard a visitor saves with a tap.
 * Shared by the artist (their own) and the curator (for artists they represent).
 */
import { useEffect, useState } from "react";
import { Contact, Download, Eye, Globe, AtSign, Mail, MapPin, Phone, Save } from "lucide-react";

import { useI18n } from "../lib/i18n.js";
import { invalidate, useQuery } from "../lib/query.js";
import { Link } from "../lib/router.js";
import { useSignedIn } from "../lib/session.js";
import { errText } from "../lib/format.js";
import type { CardEdit } from "../studio-api.js";
import { Avatar, Button, ImagePicker, Input, Notice, Skeleton, Switch, TextArea, toast } from "../ui/index.js";
import { StudioOff } from "./common.js";

export function CardEditor({ artistId }: { artistId: string }) {
  const { t } = useI18n();
  const { studio } = useSignedIn();
  const loaded = useQuery<CardEdit>(studio ? `s:card-edit:${artistId}` : null, () => studio!.cardForEdit(artistId), { staleMs: 0 });
  const [c, setC] = useState<CardEdit | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (loaded.data && !c) setC(loaded.data);
  }, [loaded.data, c]);

  if (!studio) return <StudioOff />;
  if (loaded.error) return <Notice tone="error">{errText(loaded.error, t)}</Notice>;
  if (!c) return <Skeleton h={420} r={22} />;

  const set = <K extends keyof CardEdit>(k: K, v: CardEdit[K]) => setC((x) => (x ? { ...x, [k]: v } : x));
  const dirty = JSON.stringify(c) !== JSON.stringify(loaded.data);
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const cleaned = { ...c, website: normUrl(c.website), booking_url: normUrl(c.booking_url), instagram: c.instagram.replace(/^@/, "").trim() };
      await studio.saveCard(artistId, cleaned);
      setC(cleaned);
      invalidate(`s:card`);
      await loaded.refresh();
      toast(t("Profilo salvato", "Profile saved"));
    } catch (e) {
      setError(errText(e, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card-editor">
      <div className="stack">
        <section className="card">
          <div className="card-head">
            <div>
              <h3>{t("Identità", "Identity")}</h3>
              <p>{t("Come appare nel passaporto e nella rubrica di chi salva il contatto.", "How it shows in the passport and in the contacts of whoever saves it.")}</p>
            </div>
          </div>
          <div className="identity-row">
            <div style={{ width: 132 }}>
              <ImagePicker round value={c.avatar} onChange={(v) => set("avatar", v)} maxKB={300} maxSide={640} />
            </div>
            <div className="stack" style={{ flex: 1, minWidth: 0 }}>
              <Input label={t("Nome d'arte", "Artist name")} value={c.display_name} maxLength={80} onChange={(e) => set("display_name", e.target.value)} />
              <Input label={t("Titolo breve", "Headline")} value={c.headline} maxLength={120} placeholder={t("Pittrice · Milano", "Painter · Milan")} onChange={(e) => set("headline", e.target.value)} />
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <TextArea label="Bio" rows={5} maxLength={1500} value={c.bio} placeholder={t("La tua ricerca in poche righe…", "Your practice in a few lines…")} onChange={(e) => set("bio", e.target.value)} hint={`${c.bio.length}/1500`} />
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <div>
              <h3>{t("Contatti e studio", "Contacts & studio")}</h3>
              <p>{t("Finiscono nella vCard: un tocco e sei in rubrica.", "They go into the vCard: one tap and you're in their contacts.")}</p>
            </div>
          </div>
          <div className="grid-2">
            <Input label="Email" type="email" value={c.email} onChange={(e) => set("email", e.target.value)} />
            <Input label={t("Telefono", "Phone")} type="tel" value={c.phone} onChange={(e) => set("phone", e.target.value)} />
            <Input label={t("Sito web", "Website")} value={c.website} placeholder="https://" onChange={(e) => set("website", e.target.value)} />
            <Input label="Instagram" value={c.instagram} placeholder="@" onChange={(e) => set("instagram", e.target.value)} />
            <Input label={t("Città", "City")} value={c.city} onChange={(e) => set("city", e.target.value)} />
            <Input label={t("Indirizzo dello studio", "Studio address")} value={c.studio_address} onChange={(e) => set("studio_address", e.target.value)} />
          </div>
          <div style={{ marginTop: 14 }}>
            <Input
              label={t("Link per prenotare (facoltativo)", "Booking link (optional)")}
              value={c.booking_url}
              placeholder="https://calendly.com/…"
              hint={t("Calendly, Google Calendar o simili: compare come “Calendario”.", "Calendly, Google Calendar or similar: shown as “Calendar”.")}
              onChange={(e) => set("booking_url", e.target.value)}
            />
          </div>
          <hr className="divider" />
          <div className="stack">
            <Switch checked={c.show_email} onChange={(v) => set("show_email", v)} title={t("Mostra l'email", "Show email")} sub={t("Nel profilo pubblico e nella vCard.", "On the public profile and in the vCard.")} />
            <Switch checked={c.show_phone} onChange={(v) => set("show_phone", v)} title={t("Mostra il telefono", "Show phone")} sub={t("Di solito riservato: le richieste arrivano comunque come lead.", "Usually private: requests still reach you as leads.")} />
          </div>
        </section>

        {error && <Notice tone="error">{error}</Notice>}
        <div className="save-bar">
          <span className="muted">{dirty ? t("Modifiche non salvate", "Unsaved changes") : t("Tutto salvato", "All saved")}</span>
          <Button busy={busy} disabled={!dirty} icon={<Save />} onClick={save}>
            {t("Salva profilo", "Save profile")}
          </Button>
        </div>
      </div>

      <aside className="card-preview">
        <span className="label">{t("Anteprima vCard", "vCard preview")}</span>
        <div className="vcard">
          <Avatar name={c.display_name || "?"} src={c.avatar} size={76} />
          <b className="serif">{c.display_name || t("Nome", "Name")}</b>
          {c.headline && <span className="muted">{c.headline}</span>}
          <div className="vcard-lines">
            {c.email && c.show_email && (
              <span>
                <Mail /> {c.email}
              </span>
            )}
            {c.phone && c.show_phone && (
              <span>
                <Phone /> {c.phone}
              </span>
            )}
            {c.website && (
              <span>
                <Globe /> {c.website.replace(/^https?:\/\//, "")}
              </span>
            )}
            {c.instagram && (
              <span>
                <AtSign /> @{c.instagram.replace(/^@/, "")}
              </span>
            )}
            {(c.city || c.studio_address) && (
              <span>
                <MapPin /> {[c.studio_address, c.city].filter(Boolean).join(", ")}
              </span>
            )}
          </div>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          <a className="btn btn-ghost btn-block" href={studio.vcardUrl(artistId)}>
            <Download /> {t("Scarica la vCard", "Download the vCard")}
          </a>
          <Link className="btn btn-quiet btn-block" to={`/a/${artistId}`} target="_blank">
            <Eye /> {t("Vedi la pagina pubblica", "See the public page")}
          </Link>
        </div>
        <p className="faint" style={{ fontSize: "0.78rem", display: "flex", gap: 6 }}>
          <Contact size={14} style={{ flex: "none", marginTop: 2 }} />
          {t("I visitatori la salvano dal passaporto dell'opera, dopo la verifica ArtTrust.", "Visitors save it from the artwork's passport, after the ArtTrust check.")}
        </p>
      </aside>
    </div>
  );
}

function normUrl(u: string): string {
  const v = u.trim();
  if (!v) return "";
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}
