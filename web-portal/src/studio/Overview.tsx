/** The Studio's front page: what the taps are doing, and what needs you. */
import { useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Contact,
  Fingerprint,
  Frame,
  Inbox,
  MapPinned,
  Plus,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
} from "lucide-react";

import { useI18n } from "../lib/i18n.js";
import { useQuery } from "../lib/query.js";
import { Link } from "../lib/router.js";
import { useSignedIn } from "../lib/session.js";
import { fmtDate, num, relTime, plural } from "../lib/format.js";
import type { Artist } from "../portal.js";
import type { Insights } from "../studio-api.js";
import { ArtImage, Avatar, Badge, Bars, BlueCheck, Kpi, Seg, Skeleton } from "../ui/index.js";
import { PageHead, useArtists, useLeads, usePending, useViews, useWorks } from "./common.js";

const APK = "https://github.com/angesanze/veritag-app/releases/latest/download/app-release.apk";

export function Overview() {
  const { t, locale } = useI18n();
  const { session, studio, core } = useSignedIn();
  const [days, setDays] = useState<"7" | "30" | "90">("30");
  const insights = useQuery<Insights>(studio ? `s:insights:${days}` : null, () => studio!.insights(Number(days)), { staleMs: 30_000 });
  const works = useWorks();
  const artists = useArtists();
  const pending = usePending();
  const views = useViews();
  const leads = useLeads();
  const me = useQuery<Artist>(session.kind === "artist" ? "s:me-artist" : null, () => core.artist(session.id));
  const curator = session.kind === "curator";

  const hour = new Date().getHours();
  const hello = hour < 12 ? t("Buongiorno", "Good morning") : hour < 18 ? t("Buon pomeriggio", "Good afternoon") : t("Buonasera", "Good evening");
  const ins = insights.data;
  const titleOf = (uid: string) => works.data?.find((w) => w.artwork.uid === uid)?.artwork;
  const liveViews = (views.data ?? []).filter((v) => v.status === "live").length;
  const openLeads = (leads.data ?? []).filter((l) => l.status === "new");

  return (
    <>
      <PageHead
        title={`${hello}, ${session.name.split(" ")[0]}`}
        sub={curator ? t("Ecco cosa succede attorno alle tue opere.", "Here's what's happening around your works.") : t("Il tuo studio, opera per opera.", "Your studio, work by work.")}
        actions={
          <Link to="/studio/views" className="btn btn-primary">
            <Plus />
            {t("Nuova Private View", "New Private View")}
          </Link>
        }
      />

      {!curator && me.data && !me.data.verified && (
        <div className="callout">
          <span className="callout-ic">
            <BadgeCheck />
          </span>
          <div>
            <b>{t("Ottieni la spunta blu", "Get the blue check")}</b>
            <span>{t("Dall'app Veritag chiedi la verifica a un curatore: finché non arriva, i visitatori vedono l'avviso “Artista da verificare”.", "From the Veritag app, ask a curator to verify you: until then, visitors see an “Artist not yet verified” notice.")}</span>
          </div>
          <a className="btn btn-ghost btn-sm" href={APK}>
            <Smartphone /> {t("App Android", "Android app")}
          </a>
        </div>
      )}

      {curator && (pending.data?.length ?? 0) > 0 && (
        <Link to="/studio/verifications" className="callout callout-link">
          <span className="callout-ic">
            <BadgeCheck />
          </span>
          <div>
            <b>{pending.data!.length === 1 ? t("Un artista chiede la spunta blu", "An artist is asking for the blue check") : t(`${pending.data!.length} artisti chiedono la spunta blu`, `${pending.data!.length} artists are asking for the blue check`)}</b>
            <span>{pending.data!.map((r) => r.artist_name ?? r.artist_id).join(", ")}</span>
          </div>
          <ArrowRight />
        </Link>
      )}

      <section className="ov-section">
        <div className="ov-head">
          <h2>{t("Attività dei tag", "Tag activity")}</h2>
          {studio && <Seg value={days} onChange={setDays} options={[{ value: "7", label: t("7g", "7d") }, { value: "30", label: t("30g", "30d") }, { value: "90", label: t("90g", "90d") }]} />}
        </div>
        {studio ? (
          <div className="kpis">
            <Kpi icon={<Fingerprint />} label={t("Tocchi", "Taps")} value={ins ? num(ins.totals.taps, locale) : <Skeleton w={60} h={30} />} sub={ins ? t(`${num(ins.totals.authentic, locale)} autentici dal vivo`, `${num(ins.totals.authentic, locale)} authentic live taps`) : undefined} />
            <Kpi icon={<Contact />} tone="trust" label={t("Contatti salvati", "Contacts saved")} value={ins ? num(ins.totals.vcards, locale) : <Skeleton w={60} h={30} />} sub="vCard" />
            <Kpi icon={<Sparkles />} tone="gold" label={t("Private View aperte", "Private Views opened")} value={ins ? num(ins.totals.views, locale) : <Skeleton w={60} h={30} />} sub={t(`${liveViews} pubblicate`, `${liveViews} live`)} />
            <Kpi icon={<Inbox />} tone="green" label="Lead" value={ins ? num(ins.totals.leads, locale) : <Skeleton w={60} h={30} />} sub={t(`${openLeads.length} da gestire`, `${openLeads.length} to handle`)} />
            {(ins?.totals.alerts ?? 0) > 0 && <Kpi icon={<ShieldCheck />} tone="amber" label={t("Allarmi", "Alerts")} value={num(ins!.totals.alerts, locale)} sub={t("letture copiate o chip falsi", "copied reads or fake chips")} />}
          </div>
        ) : (
          <div className="kpis">
            <Kpi icon={<Users />} label={t("Artisti", "Artists")} value={artists.data?.length ?? "—"} />
            <Kpi icon={<Frame />} tone="gold" label={t("Opere certificate", "Certified works")} value={works.data?.length ?? "—"} />
          </div>
        )}
        {ins && (
          <div className="card" style={{ marginTop: 12 }}>
            <div className="card-head">
              <div>
                <h3>{t("Tocchi al giorno", "Taps per day")}</h3>
                <p>{t("Ogni barra è un giorno: tocchi dal vivo e letture della scheda.", "Each bar is a day: live taps and record reads.")}</p>
              </div>
            </div>
            <Bars
              data={ins.series.map((d) => ({ key: d.date, value: d.taps, tip: `${fmtDate(d.date, locale, { day: "numeric", month: "short" })} · ${d.taps}` }))}
              label={(i) => fmtDate(ins.series[i]?.date, locale, { day: "numeric", month: "short" })}
            />
          </div>
        )}
      </section>

      <div className="ov-grid">
        <section className="card">
          <div className="card-head">
            <div style={{ flex: 1 }}>
              <h3>{t("Le opere più toccate", "Most-tapped works")}</h3>
              <p>{t("Dove nasce la conversazione.", "Where the conversation starts.")}</p>
            </div>
            <Link className="btn btn-quiet btn-sm" to="/studio/works">
              {t("Tutte", "All")} <ArrowRight />
            </Link>
          </div>
          {ins && ins.top_works.length > 0 ? (
            <div className="list">
              {ins.top_works.map((w, i) => {
                const a = titleOf(w.uid);
                return (
                  <Link key={w.uid} to={`/studio/works/${w.uid}`} className="list-row">
                    <span className="rank">{i + 1}</span>
                    <ArtImage src={a?.image_data_url} seed={a?.title ?? w.uid} className="thumb" />
                    <div className="lr-main">
                      <b>{a?.title ?? w.uid}</b>
                      <span>{works.data?.find((x) => x.artwork.uid === w.uid)?.artist_name}</span>
                    </div>
                    <Badge tone="violet">
                      <Fingerprint /> {w.taps}
                    </Badge>
                  </Link>
                );
              })}
            </div>
          ) : works.data ? (
            <div className="list">
              {works.data.slice(0, 5).map((w) => (
                <Link key={w.artwork.uid} to={`/studio/works/${w.artwork.uid}`} className="list-row">
                  <ArtImage src={w.artwork.image_data_url} seed={w.artwork.title} className="thumb" />
                  <div className="lr-main">
                    <b>{w.artwork.title}</b>
                    <span>{w.artist_name}</span>
                  </div>
                </Link>
              ))}
              {works.data.length === 0 && <p className="muted">{t("Le opere appaiono qui quando gli artisti le firmano dall'app.", "Works appear here once artists sign them from the app.")}</p>}
            </div>
          ) : (
            <Skeleton h={180} />
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <div style={{ flex: 1 }}>
              <h3>{t("Ultimi lead", "Latest leads")}</h3>
              <p>{t("Studio visit, informazioni, acquisti.", "Studio visits, information, purchases.")}</p>
            </div>
            <Link className="btn btn-quiet btn-sm" to="/studio/leads">
              {t("Tutti", "All")} <ArrowRight />
            </Link>
          </div>
          {!studio ? (
            <p className="muted">{t("Disponibile con Veritag Studio.", "Available with Veritag Studio.")}</p>
          ) : (leads.data ?? []).length === 0 ? (
            <p className="muted">{t("Nessuna richiesta ancora: condividi le tue Private View.", "No requests yet — share your Private Views.")}</p>
          ) : (
            <div className="list">
              {leads.data!.slice(0, 5).map((l) => (
                <Link key={l.id} to="/studio/leads" className="list-row">
                  <Avatar name={l.name} size={34} />
                  <div className="lr-main">
                    <b>
                      {l.name}
                      {l.company && <span className="faint" style={{ fontWeight: 400 }}>· {l.company}</span>}
                    </b>
                    <span>{l.item_title || l.view_title || (l.kind === "studio_visit" ? "Studio visit" : t("Informazioni", "Information"))}</span>
                  </div>
                  <span className="faint nowrap" style={{ fontSize: "0.76rem" }}>
                    {relTime(l.created_at, locale)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {curator && (
          <section className="card">
            <div className="card-head">
              <div style={{ flex: 1 }}>
                <h3>{t("I tuoi artisti", "Your artists")}</h3>
                <p>{t("Chi garantisci con la spunta blu.", "Who you vouch for with the blue check.")}</p>
              </div>
              <Link className="btn btn-quiet btn-sm" to="/studio/artists">
                {t("Tutti", "All")} <ArrowRight />
              </Link>
            </div>
            <div className="list">
              {(artists.data ?? []).slice(0, 5).map((a) => (
                <Link key={a.artist_id} to={`/studio/artists/${a.artist_id}`} className="list-row">
                  <Avatar name={a.name} size={34} />
                  <div className="lr-main">
                    <b>
                      {a.name} {a.verified && <BlueCheck />}
                    </b>
                    <span>{t(plural((works.data ?? []).filter((w) => w.artist_id === a.artist_id).length, "opera", "opere"), plural((works.data ?? []).filter((w) => w.artist_id === a.artist_id).length, "work", "works"))}</span>
                  </div>
                </Link>
              ))}
              {artists.data?.length === 0 && <p className="muted">{t("Conferma una richiesta di verifica per aggiungere il primo artista.", "Confirm a verification request to add your first artist.")}</p>}
            </div>
          </section>
        )}

        <section className="card quick">
          <h3>{t("Azioni rapide", "Quick actions")}</h3>
          <div className="quick-grid">
            <Link to="/studio/views" className="quick-item">
              <Sparkles />
              <span>{t("Crea una Private View", "Create a Private View")}</span>
            </Link>
            {curator ? (
              <Link to="/studio/exhibitions/new" className="quick-item">
                <MapPinned />
                <span>{t("Allestisci una mostra", "Stage an exhibition")}</span>
              </Link>
            ) : (
              <Link to="/studio/profile" className="quick-item">
                <Contact />
                <span>{t("Aggiorna la tua vCard", "Update your vCard")}</span>
              </Link>
            )}
            {curator ? (
              <Link to="/studio/artists" className="quick-item">
                <Users />
                <span>{t("Invita un artista nello Studio", "Invite an artist to the Studio")}</span>
              </Link>
            ) : (
              <Link to="/studio/works" className="quick-item">
                <Frame />
                <span>{t("Racconta un'opera", "Tell a work's story")}</span>
              </Link>
            )}
            <a href={APK} className="quick-item">
              <Smartphone />
              <span>{t("Scarica l'app per firmare i tag", "Get the app to sign tags")}</span>
            </a>
          </div>
        </section>
      </div>
    </>
  );
}
