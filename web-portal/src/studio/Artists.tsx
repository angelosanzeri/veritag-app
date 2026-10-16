/** The roster (curator), an artist's page in the Studio, and the artist's own profile. */
import { useState } from "react";
import { ArrowLeft, Contact, Copy, Frame, KeyRound, Search, Sparkles, Users } from "lucide-react";

import { useI18n } from "../lib/i18n.js";
import { Link, navigate } from "../lib/router.js";
import { useSignedIn } from "../lib/session.js";
import { copy, errText, fmtDate, plural } from "../lib/format.js";
import type { Invite } from "../studio-api.js";
import { ArtImage, Avatar, Badge, BlueCheck, Button, Empty, Notice, Skeleton, Tabs, toast } from "../ui/index.js";
import { Qr } from "../ui/qr.js";
import { CardEditor } from "./CardEditor.js";
import { PageHead, StudioOff, useArtists, useCard, useViews, useWorks } from "./common.js";

export function ArtistsList() {
  const { t } = useI18n();
  const artists = useArtists();
  const works = useWorks();
  const [q, setQ] = useState("");
  const list = (artists.data ?? []).filter((a) => !q || a.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <>
      <PageHead title={t("Artisti", "Artists")} sub={t("Gli artisti che garantisci. Cura il loro profilo e la vCard, o invitali a farlo nel loro Studio.", "The artists you vouch for. Manage their profile and vCard, or invite them to do it in their own Studio.")} />
      <div className="toolbar">
        <div className="input-affix" style={{ flex: 1, maxWidth: 380 }}>
          <Search />
          <input className="input" placeholder={t("Cerca un artista…", "Search an artist…")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Badge>{list.length}</Badge>
      </div>
      {artists.loading && !artists.data ? (
        <div className="artist-grid">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} h={168} r={22} />
          ))}
        </div>
      ) : list.length === 0 ? (
        <Empty icon={<Users />} title={artists.data?.length ? t("Nessun risultato", "No results") : t("Ancora nessun artista", "No artists yet")}>
          {artists.data?.length ? t("Prova con un altro nome.", "Try another name.") : t("Conferma una richiesta di verifica: l'artista entra nel tuo roster.", "Confirm a verification request: the artist joins your roster.")}
        </Empty>
      ) : (
        <div className="artist-grid">
          {list.map((a) => (
            <ArtistTile key={a.artist_id} id={a.artist_id} name={a.name} verified={a.verified} works={(works.data ?? []).filter((w) => w.artist_id === a.artist_id)} />
          ))}
        </div>
      )}
    </>
  );
}

function ArtistTile({ id, name, verified, works }: { id: string; name: string; verified: boolean; works: { artwork: { uid: string; title: string; image_data_url?: string } }[] }) {
  const { t } = useI18n();
  const card = useCard(id);
  return (
    <Link to={`/studio/artists/${id}`} className="artist-tile">
      <div className="artist-tile-strip">
        {works.slice(0, 3).map((w) => (
          <ArtImage key={w.artwork.uid} src={w.artwork.image_data_url} seed={w.artwork.title} />
        ))}
        {works.length === 0 && <div className="artist-tile-empty" />}
      </div>
      <div className="artist-tile-body">
        <Avatar name={card.data?.display_name || name} src={card.data?.avatar} size={46} />
        <div style={{ minWidth: 0 }}>
          <b className="row" style={{ gap: 6 }}>
            {card.data?.display_name || name} {verified && <BlueCheck />}
          </b>
          <span>{card.data?.headline || t(plural(works.length, "opera certificata", "opere certificate"), plural(works.length, "certified work", "certified works"))}</span>
        </div>
      </div>
    </Link>
  );
}

type ArtistTab = "profile" | "works" | "access";

export function ArtistDetail({ id }: { id: string }) {
  const { t } = useI18n();
  const artists = useArtists();
  const works = useWorks();
  const views = useViews();
  const card = useCard(id);
  const [tab, setTab] = useState<ArtistTab>("profile");
  const a = artists.data?.find((x) => x.artist_id === id);
  const mine = (works.data ?? []).filter((w) => w.artist_id === id);

  if (artists.data && !a) {
    return (
      <Empty icon={<Users />} title={t("Artista non nel tuo roster", "Artist not in your roster")} action={<Link className="btn btn-ghost" to="/studio/artists">{t("Torna agli artisti", "Back to artists")}</Link>}>
        {t("Puoi gestire solo gli artisti che garantisci.", "You can only manage the artists you vouch for.")}
      </Empty>
    );
  }
  const name = card.data?.display_name || a?.name || "";
  const theirViews = (views.data ?? []).filter((v) => v.artist_id === id);

  return (
    <>
      <PageHead
        back={
          <Link to="/studio/artists" className="btn btn-quiet btn-sm">
            <ArrowLeft /> {t("Artisti", "Artists")}
          </Link>
        }
        title={
          <span className="row" style={{ gap: 14 }}>
            <Avatar name={name || "?"} src={card.data?.avatar} size={52} />
            <span>
              {name || <Skeleton w={200} h={30} />} {a?.verified && <BlueCheck lg />}
            </span>
          </span>
        }
        sub={card.data?.headline || (a ? t(`Spunta blu di ${a.verified_by.map((c) => c.name).join(", ")}`, `Blue check from ${a.verified_by.map((c) => c.name).join(", ")}`) : "")}
        actions={
          <>
            <Link className="btn btn-ghost" to={`/a/${id}`} target="_blank">
              {t("Pagina pubblica", "Public page")}
            </Link>
            <Button icon={<Sparkles />} onClick={() => navigate(`/studio/views?artist=${id}`)}>
              {t("Private View", "Private View")}
            </Button>
          </>
        }
      />
      <Tabs<ArtistTab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "profile", label: t("Profilo e vCard", "Profile & vCard"), icon: <Contact /> },
          { value: "works", label: `${t("Opere", "Works")} · ${mine.length}`, icon: <Frame /> },
          { value: "access", label: t("Accesso artista", "Artist access"), icon: <KeyRound /> },
        ]}
      />
      {tab === "profile" && <CardEditor artistId={id} />}
      {tab === "works" && (
        <>
          {mine.length === 0 ? (
            <Empty icon={<Frame />} title={t("Nessuna opera firmata", "No signed works")}>
              {t("L'artista firma e associa i tag dall'app Veritag.", "The artist signs and links tags from the Veritag app.")}
            </Empty>
          ) : (
            <div className="work-grid">
              {mine.map((w) => (
                <Link key={w.artwork.uid} to={`/studio/works/${w.artwork.uid}`} className="work-tile">
                  <ArtImage src={w.artwork.image_data_url} seed={w.artwork.title} className="work-tile-img" />
                  <div className="work-tile-label">
                    <b>{w.artwork.title}</b>
                    <span className="mono">{w.artwork.uid}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
          {theirViews.length > 0 && (
            <div className="card" style={{ marginTop: 18 }}>
              <div className="card-head">
                <h3>Private View</h3>
              </div>
              <div className="list">
                {theirViews.map((v) => (
                  <Link key={v.id} to={`/studio/views/${v.id}`} className="list-row">
                    <ArtImage src={v.cover} seed={v.id} className="thumb" />
                    <div className="lr-main">
                      <b>{v.title}</b>
                      <span>{t(plural(v.item_count, "opera", "opere"), plural(v.item_count, "work", "works"))}</span>
                    </div>
                    <Badge tone={v.status === "live" ? "green" : undefined}>{v.status === "live" ? t("Pubblicata", "Live") : t("Bozza", "Draft")}</Badge>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      {tab === "access" && <InvitePanel artistId={id} name={name} />}
    </>
  );
}

function InvitePanel({ artistId, name }: { artistId: string; name: string }) {
  const { t, locale } = useI18n();
  const { studio } = useSignedIn();
  const [inv, setInv] = useState<Invite | null>(null);
  const [busy, setBusy] = useState(false);
  if (!studio) return <StudioOff />;
  const link = inv ? inv.join_url || `${location.origin}/join?code=${inv.code}` : "";

  const make = async () => {
    setBusy(true);
    try {
      setInv(await studio.invite(artistId));
    } catch (e) {
      toast(errText(e, t), "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card invite">
      <div className="card-head">
        <div>
          <h3>{t(`Dai a ${name} il suo Studio`, `Give ${name} their own Studio`)}</h3>
          <p>
            {t(
              "Con l'invito l'artista crea le proprie credenziali e gestisce da solo profilo, vCard, storie delle opere, Private View e lead. Un nuovo invito sostituisce le credenziali precedenti.",
              "With the invite the artist creates their own credentials and manages profile, vCard, artwork stories, Private Views and leads. A new invite replaces previous credentials.",
            )}
          </p>
        </div>
      </div>
      {!inv ? (
        <Button busy={busy} icon={<KeyRound />} onClick={make}>
          {t("Genera invito", "Generate invite")}
        </Button>
      ) : (
        <div className="invite-out">
          <Qr text={link} size={150} />
          <div className="stack" style={{ flex: 1, minWidth: 0 }}>
            <div>
              <span className="label">{t("Codice", "Code")}</span>
              <div className="invite-code mono">{inv.code}</div>
            </div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <Button
                variant="ghost"
                icon={<Copy />}
                onClick={async () => toast((await copy(link)) ? t("Link copiato", "Link copied") : t("Copia non riuscita", "Copy failed"), "ok")}
              >
                {t("Copia link", "Copy link")}
              </Button>
              <a className="btn btn-ghost" href={`mailto:?subject=${encodeURIComponent(t("Il tuo Studio Veritag", "Your Veritag Studio"))}&body=${encodeURIComponent(`${t("Attiva il tuo Studio Veritag:", "Activate your Veritag Studio:")} ${link}`)}`}>
                {t("Invia per email", "Send by email")}
              </a>
            </div>
            <Notice tone="info">{t(`Valido fino al ${fmtDate(inv.expires_at, locale)}, una sola volta.`, `Valid until ${fmtDate(inv.expires_at, locale)}, single use.`)}</Notice>
          </div>
        </div>
      )}
    </div>
  );
}

export function MyProfile() {
  const { t } = useI18n();
  const { session } = useSignedIn();
  return (
    <>
      <PageHead title={t("Profilo e vCard", "Profile & vCard")} sub={t("Il tuo biglietto da visita digitale: compare nel passaporto di ogni tua opera.", "Your digital business card: it appears in the passport of each of your works.")} />
      <CardEditor artistId={session.id} />
    </>
  );
}
