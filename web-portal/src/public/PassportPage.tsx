/**
 * The Art Passport — what a visitor sees after tapping a work.
 *
 * One call to Studio's /experience verifies the tap with veritag-core and
 * returns, alongside the ArtTrust verdict, the work's story, the artist's card
 * and any Private View the tap has opened. Without Studio it falls back to the
 * core passport. A verified tap is cached for the tab, so a refresh shows the
 * original verdict instead of flagging your own tap as a replay.
 */
import { lazy, Suspense, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  CalendarClock,
  Contact,
  Cpu,
  Fingerprint,
  Globe,
  AtSign,
  KeyRound,
  Link2,
  Lock,
  MapPin,
  Maximize2,
  PlayCircle,
  RefreshCcw,
  Sparkles,
  UserCheck,
  X,
} from "lucide-react";

import { useI18n } from "../lib/i18n.js";
import { useQuery } from "../lib/query.js";
import { Link, navigate, useQueryParams } from "../lib/router.js";
import { useSession } from "../lib/session.js";
import { errText, fmtRange, plural } from "../lib/format.js";
import type { Passport } from "../portal.js";
import type { Experience } from "../studio-api.js";
import { ArtImage, Avatar, Badge, BlueCheck, Button, Empty, Skeleton } from "../ui/index.js";
import { ArtTrustSeal, LeadSheet, PublicFooter, PublicHeader, rememberPass, useVerdictLook } from "./shared.js";

const TrailMap = lazy(() => import("../map.js").then((m) => ({ default: m.TrailMap })));

const CACHE = "veritag.exp:";

function cached(key: string): Checked | null {
  try {
    const raw = sessionStorage.getItem(CACHE + key);
    return raw ? (JSON.parse(raw) as Checked) : null;
  } catch {
    return null;
  }
}

function keep(key: string, exp: Checked) {
  try {
    sessionStorage.setItem(CACHE + key, JSON.stringify(exp));
  } catch {
    /* quota — big photos; the page still works */
  }
}

const fromPassport = (p: Passport): Experience => ({ passport: p, extras: null, card: null, unlock: null, views: [] });

/** An experience plus when this device checked it (kept with the cached verdict). */
type Checked = Experience & { checked_at: number };

export function PassportPage({ uid }: { uid?: string }) {
  const { t, locale } = useI18n();
  const { core, studio } = useSession();
  const q = useQueryParams();
  const u = (uid ?? q.get("u") ?? "").toUpperCase();
  const c = uid ? 0 : Number(q.get("c") ?? "0") || 0;
  const m = uid ? "" : (q.get("m") ?? "").toLowerCase();
  const kv = Number(q.get("kv") ?? "1") || 1;
  const key = `${u}:${c}:${m}`;

  const { data, error, loading, refresh } = useQuery<Checked>(
    u ? `exp:${key}` : null,
    async () => {
      const hit = m ? cached(key) : null;
      if (hit) return hit;
      let got: Experience;
      if (studio) {
        try {
          got = await studio.experience(u, c, m, kv);
        } catch (e) {
          if ((e as { status?: number }).status !== 0) throw e;
          got = fromPassport(await core.passport(u, c, m, kv)); // Studio unreachable: the core still verifies
        }
      } else got = fromPassport(await core.passport(u, c, m, kv));
      const exp: Checked = { ...got, checked_at: Date.now() };
      if (m) keep(key, exp);
      if (exp.unlock) rememberPass(exp.views.filter((v) => !v.locked).map((v) => v.id), exp.unlock.token, exp.unlock.expires_at);
      return exp;
    },
    { staleMs: Number.POSITIVE_INFINITY },
  );

  if (!u) {
    return (
      <Frame>
        <Empty icon={<Fingerprint />} title={t("Nessun tag da leggere", "No tag to read")} action={<Link className="btn btn-primary" to="/">{t("Verifica un'opera", "Check an artwork")}</Link>}>
          {t("Questo link non contiene i dati di un tag Veritag.", "This link doesn't carry a Veritag tag.")}
        </Empty>
      </Frame>
    );
  }
  if (loading && !data) return <PassportSkeleton />;
  if (error || !data) {
    const status = (error as { status?: number } | undefined)?.status;
    return (
      <Frame>
        <Empty
          icon={<Fingerprint />}
          title={status === 404 ? t("Tag non ancora associato", "Tag not linked yet") : t("Verifica non riuscita", "Couldn't verify")}
          action={
            status === 404 ? (
              <Link className="btn btn-ghost" to="/">
                {t("Torna alla home", "Back home")}
              </Link>
            ) : (
              <Button variant="ghost" icon={<RefreshCcw />} onClick={() => refresh()}>
                {t("Riprova", "Try again")}
              </Button>
            )
          }
        >
          {status === 404
            ? t("Questo chip non porta ancora un'opera. L'artista lo associa dall'app Veritag.", "This chip doesn't carry an artwork yet. The artist links it from the Veritag app.")
            : errText(error, t)}
        </Empty>
      </Frame>
    );
  }
  return <PassportView exp={data} locale={locale} />;
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="pub">
      <PublicHeader />
      <main className="pub-wrap pub-narrow" style={{ paddingTop: 60, paddingBottom: 80 }}>
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}

function PassportSkeleton() {
  const { t } = useI18n();
  return (
    <div className="pub">
      <PublicHeader transparent />
      <div className="pp-hero">
        <div className="skel" style={{ position: "absolute", inset: 0, borderRadius: 0 }} />
        <div className="pp-scan">
          <span className="pp-scan-ring" />
          <span className="pp-scan-ring d2" />
          <Fingerprint />
          <b>{t("Verifica ArtTrust in corso…", "ArtTrust check in progress…")}</b>
        </div>
      </div>
      <div className="pub-wrap pub-narrow pp-body">
        <Skeleton h={40} w="70%" />
        <Skeleton h={18} w="40%" style={{ marginTop: 14 }} />
        <Skeleton h={160} style={{ marginTop: 28 }} r={22} />
      </div>
    </div>
  );
}

function PassportView({ exp, locale }: { exp: Checked; locale: string }) {
  const { t } = useI18n();
  const { studio } = useSession();
  const look = useVerdictLook();
  const p = exp.passport;
  const art = p.artwork;
  const v = look(p.verdict);
  const extras = exp.extras;
  const card = exp.card;
  const artistName = card?.display_name || p.artist?.name || t("Artista", "Artist");
  const [zoom, setZoom] = useState<string | null>(null);
  const [lead, setLead] = useState(false);
  const live = p.verdict !== "record";
  const verifiedAt = new Date(exp.checked_at).toLocaleString(locale, { dateStyle: "long", timeStyle: "short" });

  useEffect(() => {
    document.title = art ? `${art.title} — ${artistName} · Veritag` : "Veritag";
  }, [art, artistName]);

  const stops = p.exhibitions
    .filter((e) => e.lat != null && e.lng != null)
    .map((e) => ({ lat: e.lat as number, lng: e.lng as number, title: e.venue || e.title }));
  const facts = extras
    ? ([
        [t("Anno", "Year"), extras.year],
        [t("Tecnica", "Medium"), extras.medium],
        [t("Dimensioni", "Dimensions"), extras.dimensions],
        [t("Edizione", "Edition"), extras.edition],
      ].filter(([, val]) => val) as [string, string][])
    : [];
  const vcard = studio && p.artist ? studio.vcardUrl(p.artist.artist_id) : undefined;

  return (
    <div className="pub pp">
      <PublicHeader transparent />
      <section className="pp-hero">
        <ArtImage src={art?.image_data_url} seed={art?.title ?? p.uid} alt={art?.title} className="pp-hero-img" />
        <div className="pp-hero-shade" />
        {art?.image_data_url && (
          <button className="pp-zoom" onClick={() => setZoom(art.image_data_url!)} aria-label={t("Ingrandisci", "Enlarge")}>
            <Maximize2 />
          </button>
        )}
      </section>

      <main className="pub-wrap pub-narrow pp-body">
        <div className={`pp-verdict tone-${v.tone} enter`}>
          <ArtTrustSeal verdict={p.verdict} size={92} />
          <div className="pp-verdict-text">
            <span className="eyebrow">{live ? t("Verifica ArtTrust dal vivo", "Live ArtTrust check") : "ArtTrust"}</span>
            <h2>{v.title}</h2>
            <p>{v.line}</p>
          </div>
        </div>

        <div className="pp-title enter" style={{ animationDelay: "60ms" }}>
          <h1 className="serif">{art?.title ?? t("Opera", "Artwork")}</h1>
          <div className="pp-by">
            {t("di", "by")}{" "}
            {p.artist ? (
              <Link to={`/a/${p.artist.artist_id}`} className="pp-artist-link">
                {artistName}
              </Link>
            ) : (
              artistName
            )}
            {p.artist_verified && <BlueCheck title={t("Garantito da un curatore", "Vouched for by a curator")} />}
          </div>
        </div>

        {/* Private Views this tap opened — the reason to tap, up top */}
        {exp.views.length > 0 && (
          <div className="pp-views enter" style={{ animationDelay: "120ms" }}>
            {exp.views.map((pv) => (
              <ViewTeaserCard key={pv.id} pv={pv} />
            ))}
          </div>
        )}

        <section className="pp-section">
          <h3 className="pp-h">
            <Fingerprint />
            {t("Certificato ArtTrust", "ArtTrust certificate")}
          </h3>
          <div className="trust-list">
            <TrustRow
              icon={<Cpu />}
              ok={live ? p.chip_authentic : null}
              title={t("Chip NFC originale", "Original NFC chip")}
              sub={live ? (p.chip_authentic ? t("NTAG 424 DNA: firma crittografica del chip valida", "NTAG 424 DNA: the chip's cryptographic signature checks out") : t("La firma del chip non è valida", "The chip's signature is not valid")) : t("Si verifica toccando l'opera", "Checked when you tap the artwork")}
            />
            <TrustRow
              icon={<RefreshCcw />}
              ok={live ? p.not_replayed : null}
              title={t("Lettura irripetibile", "One-time read")}
              sub={live ? (p.not_replayed ? t(`Tocco n. ${p.ctr}: codice nuovo, non copiabile`, `Tap #${p.ctr}: a fresh code that can't be copied`) : t("Codice già visto: possibile copia del link", "Code seen before: possibly a copied link")) : t("Ogni tocco genera un codice nuovo", "Every tap generates a new code")}
            />
            <TrustRow
              icon={<KeyRound />}
              ok={live ? p.issuer_verified : p.artist ? true : null}
              title={t("Firma dell'artista", "Artist's signature")}
              sub={p.issuer_verified || !live ? t("Opera firmata con la chiave privata dell'artista, custodita sul suo telefono", "Signed with the artist's private key, kept on their phone") : t("Firma non riconosciuta o revocata", "Signature unknown or revoked")}
            />
            <TrustRow
              icon={<UserCheck />}
              ok={p.artist_verified}
              title={t("Garanzia del curatore", "Curator's guarantee")}
              sub={p.artist_verified ? t(`Spunta blu di ${p.verified_by.map((c) => c.name).join(", ")}`, `Blue check from ${p.verified_by.map((c) => c.name).join(", ")}`) : t("Nessun curatore ha ancora garantito l'artista", "No curator has vouched for the artist yet")}
            />
          </div>
          <div className="pp-meta mono">
            <span>UID {p.uid}</span>
            {art?.binding_id && <span>· binding {art.binding_id.slice(0, 12)}…</span>}
          </div>
        </section>

        {(art?.description || extras?.story || facts.length > 0) && (
          <section className="pp-section">
            <h3 className="pp-h">
              <Sparkles />
              {t("L'opera", "The work")}
            </h3>
            {facts.length > 0 && (
              <dl className="facts">
                {facts.map(([k, val]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{val}</dd>
                  </div>
                ))}
              </dl>
            )}
            {art?.description && <p className="pp-lead pre-line">{art.description}</p>}
            {extras?.story && <p className="pp-story pre-line">{extras.story}</p>}
            {(extras?.images.length ?? 0) > 0 && (
              <div className="pp-gallery">
                {extras!.images.map((src, i) => (
                  <button key={i} onClick={() => setZoom(src)} aria-label={t("Ingrandisci", "Enlarge")}>
                    <img src={src} alt="" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
            <div className="row wrap" style={{ marginTop: 16 }}>
              {extras?.audio_url && (
                <a className="chip" href={extras.audio_url} target="_blank" rel="noreferrer">
                  <AudioLines /> {t("Audioguida", "Audio guide")}
                </a>
              )}
              {art?.video_url && (
                <a className="chip" href={art.video_url} target="_blank" rel="noreferrer">
                  <PlayCircle /> {t("Video", "Video")}
                </a>
              )}
              {extras?.links.map((l) => (
                <a key={l.url} className="chip" href={l.url} target="_blank" rel="noreferrer">
                  <Link2 /> {l.label}
                </a>
              ))}
            </div>
          </section>
        )}

        {/* the artist — save the contact, book a visit */}
        <section className="pp-section">
          <h3 className="pp-h">
            <Contact />
            {t("L'artista", "The artist")}
          </h3>
          <div className="artist-card">
            <div className="artist-card-top">
              <Avatar name={artistName} src={card?.avatar} size={64} />
              <div style={{ minWidth: 0 }}>
                <b className="row" style={{ gap: 6 }}>
                  {artistName} {p.artist_verified && <BlueCheck />}
                </b>
                {card?.headline && <span className="muted">{card.headline}</span>}
                {card?.city && (
                  <span className="faint row" style={{ gap: 4 }}>
                    <MapPin size={13} /> {card.city}
                  </span>
                )}
              </div>
            </div>
            {card?.bio && <p className="artist-bio clamp-3">{card.bio}</p>}
            {studio && p.artist ? (
              <div className="artist-actions">
                <a className="btn btn-primary" href={vcard}>
                  <Contact />
                  {t("Salva contatto", "Save contact")}
                </a>
                <Button variant="gold" icon={<CalendarClock />} onClick={() => setLead(true)}>
                  {t("Prenota una studio visit", "Book a studio visit")}
                </Button>
              </div>
            ) : null}
            <div className="row wrap" style={{ gap: 8 }}>
              {card?.website && (
                <a className="chip" href={card.website} target="_blank" rel="noreferrer">
                  <Globe /> {t("Sito", "Website")}
                </a>
              )}
              {card?.instagram && (
                <a className="chip" href={`https://instagram.com/${card.instagram.replace(/^@/, "")}`} target="_blank" rel="noreferrer">
                  <AtSign /> {card.instagram.startsWith("@") ? card.instagram : `@${card.instagram}`}
                </a>
              )}
              {p.artist && (
                <Link className="chip" to={`/a/${p.artist.artist_id}`}>
                  {t("Profilo completo", "Full profile")} <ArrowRight />
                </Link>
              )}
            </div>
          </div>
        </section>

        {p.exhibitions.length > 0 && (
          <section className="pp-section">
            <h3 className="pp-h">
              <MapPin />
              {t("Provenienza", "Provenance")}
              <Badge>{p.exhibitions.length}</Badge>
            </h3>
            <div className="timeline">
              {p.exhibitions.map((e, i) => (
                <div className="tl" key={e.exhibition_id}>
                  <div className="tl-rail">
                    <span className="tl-node">{i + 1}</span>
                    {i < p.exhibitions.length - 1 && <span className="tl-line" />}
                  </div>
                  <div className="tl-body">
                    <b>{e.title}</b>
                    <span>
                      {[fmtRange(e.starts_at, e.ends_at, locale), e.venue, e.curator_name].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            {stops.length > 0 && (
              <Suspense fallback={<div className="map map-trail skel" />}>
                <TrailMap stops={stops} />
              </Suspense>
            )}
          </section>
        )}

        <p className="pp-fine faint">
          {live
            ? t(`Verificato il ${verifiedAt}.`, `Verified on ${verifiedAt}.`)
            : t("Per la verifica crittografica completa avvicina il telefono al tag dell'opera.", "For the full cryptographic check, hold your phone to the artwork's tag.")}
        </p>
      </main>
      <PublicFooter />

      {zoom && (
        <div className="zoom" onClick={() => setZoom(null)} role="dialog" aria-modal="true">
          <img src={zoom} alt="" />
          <button className="btn btn-ghost btn-icon zoom-x" aria-label={t("Chiudi", "Close")}>
            <X />
          </button>
        </div>
      )}
      {p.artist && (
        <LeadSheet
          open={lead}
          onClose={() => setLead(false)}
          kind="studio_visit"
          artistId={p.artist.artist_id}
          artistName={artistName}
          uid={p.uid}
          vcardUrl={vcard}
        />
      )}
    </div>
  );
}

function TrustRow({ icon, ok, title, sub }: { icon: React.ReactNode; ok: boolean | null; title: string; sub: string }) {
  return (
    <div className={`trust-row ${ok === null ? "pending" : ok ? "ok" : "bad"}`}>
      <span className="trust-ic">{icon}</span>
      <div>
        <b>{title}</b>
        <span>{sub}</span>
      </div>
      <span className="trust-state" aria-hidden>
        {ok === null ? "—" : ok ? "✓" : "✕"}
      </span>
    </div>
  );
}

function ViewTeaserCard({ pv }: { pv: Experience["views"][number] }) {
  const { t } = useI18n();
  if (pv.locked) {
    return (
      <div className="pv-teaser locked">
        <span className="pv-teaser-ic">
          <Lock />
        </span>
        <div className="pv-teaser-text">
          <span className="eyebrow">Private View</span>
          <b>{pv.title}</b>
          <span>
            {pv.item_count === 1 ? t("Un'opera riservata — si apre toccando l'opera dal vivo.", "One reserved work — opens when you tap the artwork in person.") : t(`${pv.item_count} opere riservate — si apre toccando l'opera dal vivo.`, `${pv.item_count} reserved works — opens when you tap the artwork in person.`)}
          </span>
        </div>
      </div>
    );
  }
  return (
    <button className="pv-teaser" onClick={() => navigate(`/v/${pv.id}`)}>
      <ArtImage src={pv.cover} seed={pv.id} className="pv-teaser-cover" />
      <div className="pv-teaser-text">
        <span className="eyebrow">
          <Sparkles size={12} /> {t("Private View sbloccata", "Private View unlocked")}
        </span>
        <b>{pv.title}</b>
        <span className="clamp-2">{pv.intro || t(`${plural(pv.item_count, "opera riservata", "opere riservate")}, solo per te.`, `${plural(pv.item_count, "reserved work", "reserved works")}, just for you.`)}</span>
      </div>
      <span className="pv-teaser-go">
        <ArrowRight />
      </span>
    </button>
  );
}

export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="btn btn-quiet btn-sm" style={{ marginLeft: -10 }}>
      <ArrowLeft />
      {label}
    </Link>
  );
}

