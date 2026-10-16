/** The artist's public page: their card (saved as a vCard), works and contact. */
import { useEffect, useState } from "react";
import { CalendarClock, Contact, Globe, AtSign, Mail, MapPin, Palette, Phone, UserRound } from "lucide-react";

import { useI18n } from "../lib/i18n.js";
import { useQuery } from "../lib/query.js";
import { Link } from "../lib/router.js";
import { useSession } from "../lib/session.js";
import { errText } from "../lib/format.js";
import type { Artist, Artwork } from "../portal.js";
import type { Card } from "../studio-api.js";
import { ArtImage, Avatar, BlueCheck, Button, Empty, Skeleton } from "../ui/index.js";
import { LeadSheet, PublicFooter, PublicHeader } from "./shared.js";

export function ArtistPage({ id }: { id: string }) {
  const { t } = useI18n();
  const { core, studio } = useSession();
  const artist = useQuery<Artist>(`pub:artist:${id}`, () => core.artist(id));
  const works = useQuery<Artwork[]>(`pub:works:${id}`, () => core.artistArtworks(id));
  const card = useQuery<Card | null>(studio ? `pub:card:${id}` : null, () => (studio ? studio.card(id) : Promise.resolve(null)));
  const [lead, setLead] = useState(false);

  const a = artist.data;
  const c = card.data ?? null;
  const name = c?.display_name || a?.name || "";
  useEffect(() => {
    if (name) document.title = `${name} · Veritag`;
  }, [name]);

  if (artist.error) {
    return (
      <div className="pub">
        <PublicHeader />
        <main className="pub-wrap pub-narrow" style={{ padding: "60px 0" }}>
          <Empty icon={<UserRound />} title={t("Artista non trovato", "Artist not found")}>
            {errText(artist.error, t)}
          </Empty>
        </main>
        <PublicFooter />
      </div>
    );
  }

  const vcard = studio ? studio.vcardUrl(id) : undefined;
  return (
    <div className="pub">
      <PublicHeader />
      <main className="pub-wrap pub-narrow artist-page">
        <section className="ap-hero enter">
          {a ? <Avatar name={name} src={c?.avatar} size={112} /> : <Skeleton w={112} h={112} r={56} />}
          <div className="ap-id">
            <span className="eyebrow">{t("Artista", "Artist")}</span>
            <h1 className="serif">
              {name || <Skeleton w={220} h={40} />} {a?.verified && <BlueCheck lg title={t("Garantito da un curatore", "Vouched for by a curator")} />}
            </h1>
            {c?.headline && <p className="ap-headline">{c.headline}</p>}
            <div className="row wrap ap-meta">
              {c?.city && (
                <span>
                  <MapPin size={14} /> {c.city}
                </span>
              )}
              {a?.verified && (
                <span className="trust-text">
                  {t("Spunta blu", "Blue check")}: {a.verified_by.map((x) => x.name).join(", ")}
                </span>
              )}
            </div>
          </div>
        </section>

        {studio && (
          <div className="ap-actions enter" style={{ animationDelay: "60ms" }}>
            <a className="btn btn-primary btn-lg" href={vcard}>
              <Contact />
              {t("Salva contatto", "Save contact")}
            </a>
            <Button variant="gold" size="lg" icon={<CalendarClock />} onClick={() => setLead(true)}>
              {t("Prenota una studio visit", "Book a studio visit")}
            </Button>
          </div>
        )}

        {c && (c.email || c.phone || c.website || c.instagram || c.bio) && (
          <section className="pp-section">
            {c.bio && <p className="pp-lead pre-line">{c.bio}</p>}
            <div className="row wrap" style={{ gap: 8, marginTop: c.bio ? 18 : 0 }}>
              {c.email && (
                <a className="chip" href={`mailto:${c.email}`}>
                  <Mail /> {c.email}
                </a>
              )}
              {c.phone && (
                <a className="chip" href={`tel:${c.phone.replace(/\s+/g, "")}`}>
                  <Phone /> {c.phone}
                </a>
              )}
              {c.website && (
                <a className="chip" href={c.website} target="_blank" rel="noreferrer">
                  <Globe /> {c.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                </a>
              )}
              {c.instagram && (
                <a className="chip" href={`https://instagram.com/${c.instagram.replace(/^@/, "")}`} target="_blank" rel="noreferrer">
                  <AtSign /> @{c.instagram.replace(/^@/, "")}
                </a>
              )}
              {c.booking_url && (
                <a className="chip" href={c.booking_url} target="_blank" rel="noreferrer">
                  <CalendarClock /> {t("Calendario", "Calendar")}
                </a>
              )}
            </div>
          </section>
        )}

        <section className="pp-section">
          <h3 className="pp-h">
            <Palette />
            {t("Opere certificate", "Certified works")}
          </h3>
          {works.loading && !works.data ? (
            <div className="work-grid">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} h={260} r={18} />
              ))}
            </div>
          ) : (works.data ?? []).length === 0 ? (
            <p className="muted">{t("Nessuna opera ancora certificata.", "No certified works yet.")}</p>
          ) : (
            <div className="work-grid">
              {works.data!.map((w) => (
                <Link key={w.uid} to={`/t/${w.uid}`} className="work-tile">
                  <ArtImage src={w.image_data_url} seed={w.title} alt={w.title} className="work-tile-img" />
                  <div className="work-tile-label">
                    <b>{w.title}</b>
                    <span>ArtTrust · {w.uid.slice(-6)}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
      <PublicFooter />
      {a && <LeadSheet open={lead} onClose={() => setLead(false)} kind="studio_visit" artistId={id} artistName={name} vcardUrl={vcard} />}
    </div>
  );
}
