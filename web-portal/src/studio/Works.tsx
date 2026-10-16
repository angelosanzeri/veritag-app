/** Works: the catalogue, and each work's passport — its story, label and trail. */
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download, ExternalLink, Frame, MapPin, Plus, QrCode, Save, Search, Sparkles, Trash2 } from "lucide-react";

import { useI18n } from "../lib/i18n.js";
import { invalidate, useQuery } from "../lib/query.js";
import { Link } from "../lib/router.js";
import { useSignedIn } from "../lib/session.js";
import { downloadText, errText, fmtRange } from "../lib/format.js";
import type { ArtworkDetail } from "../portal.js";
import type { Extras, ExtrasIn } from "../studio-api.js";
import { ArtImage, Badge, BlueCheck, Button, Empty, ImagePicker, Input, Notice, Skeleton, Tabs, TextArea, toast } from "../ui/index.js";
import { Qr, qrSvg } from "../ui/qr.js";
import { PageHead, StudioOff, useWorks } from "./common.js";

const TrailMap = lazy(() => import("../map.js").then((m) => ({ default: m.TrailMap })));

export function WorksList() {
  const { t } = useI18n();
  const { session } = useSignedIn();
  const works = useWorks();
  const [q, setQ] = useState("");
  const [artist, setArtist] = useState("");
  const artists = useMemo(() => {
    const m = new Map<string, string>();
    (works.data ?? []).forEach((w) => m.set(w.artist_id, w.artist_name));
    return [...m.entries()];
  }, [works.data]);
  const list = (works.data ?? []).filter((w) => {
    const s = q.trim().toLowerCase();
    if (artist && w.artist_id !== artist) return false;
    return !s || w.artwork.title.toLowerCase().includes(s) || w.artist_name.toLowerCase().includes(s) || w.artwork.uid.toLowerCase().includes(s);
  });

  return (
    <>
      <PageHead
        title={session.kind === "curator" ? t("Opere", "Works") : t("Le mie opere", "My works")}
        sub={t("Ogni opera ha il suo passaporto ArtTrust. Arricchiscilo con storia, tecnica, audio e immagini: è quello che il visitatore legge dopo il tocco.", "Every work has its ArtTrust passport. Enrich it with story, medium, audio and images: it's what visitors read after the tap.")}
      />
      <div className="toolbar">
        <div className="input-affix" style={{ flex: 1, maxWidth: 380 }}>
          <Search />
          <input className="input" placeholder={t("Titolo, artista o UID…", "Title, artist or UID…")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {artists.length > 1 && (
          <select className="select" style={{ width: "auto", minWidth: 180 }} value={artist} onChange={(e) => setArtist(e.target.value)}>
            <option value="">{t("Tutti gli artisti", "All artists")}</option>
            {artists.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        )}
        <Badge>{list.length}</Badge>
      </div>
      {works.loading && !works.data ? (
        <div className="work-grid">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} h={280} r={20} />
          ))}
        </div>
      ) : list.length === 0 ? (
        <Empty icon={<Frame />} title={works.data?.length ? t("Nessun risultato", "No results") : t("Ancora nessuna opera", "No works yet")}>
          {works.data?.length
            ? t("Cambia la ricerca o il filtro.", "Change the search or the filter.")
            : t("Le opere nascono nell'app Veritag: l'artista firma il tag NFC e associa titolo e foto.", "Works are born in the Veritag app: the artist signs the NFC tag and adds title and photo.")}
        </Empty>
      ) : (
        <div className="work-grid">
          {list.map((w, i) => (
            <Link key={w.artwork.uid} to={`/studio/works/${w.artwork.uid}`} className="work-tile enter" style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }}>
              <ArtImage src={w.artwork.image_data_url} seed={w.artwork.title} alt={w.artwork.title} className="work-tile-img" />
              <div className="work-tile-label">
                <b>{w.artwork.title}</b>
                <span className="row" style={{ gap: 5 }}>
                  {w.artist_name} {w.artist_verified && <BlueCheck />}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

type WorkTab = "story" | "label" | "trail";

export function WorkDetail({ uid }: { uid: string }) {
  const { t, locale } = useI18n();
  const { core } = useSignedIn();
  const detail = useQuery<ArtworkDetail>(`s:artwork:${uid}`, () => core.artworkDetail(uid));
  const [tab, setTab] = useState<WorkTab>("story");
  const d = detail.data;

  if (detail.error) {
    return (
      <Empty icon={<Frame />} title={t("Opera non trovata", "Work not found")} action={<Link className="btn btn-ghost" to="/studio/works">{t("Torna alle opere", "Back to works")}</Link>}>
        {errText(detail.error, t)}
      </Empty>
    );
  }
  const stops = (d?.exhibitions ?? []).filter((e) => e.lat != null && e.lng != null).map((e) => ({ lat: e.lat as number, lng: e.lng as number, title: e.venue || e.title }));

  return (
    <>
      <PageHead
        back={
          <Link to="/studio/works" className="btn btn-quiet btn-sm">
            <ArrowLeft /> {t("Opere", "Works")}
          </Link>
        }
        title={d?.artwork.title ?? <Skeleton w={260} h={34} />}
        sub={
          d ? (
            <span className="row" style={{ gap: 6 }}>
              {d.artist?.name} {d.artist?.verified && <BlueCheck />} <span className="mono faint">· {d.artwork.uid}</span>
            </span>
          ) : undefined
        }
        actions={
          <Link className="btn btn-ghost" to={`/t/${uid}`} target="_blank">
            <ExternalLink /> {t("Apri il passaporto", "Open the passport")}
          </Link>
        }
      />
      <div className="work-detail">
        <div className="work-detail-art">
          <ArtImage src={d?.artwork.image_data_url} seed={d?.artwork.title ?? uid} alt={d?.artwork.title} />
          {d?.artwork.description && <p className="muted pre-line" style={{ fontSize: "0.9rem", marginTop: 14 }}>{d.artwork.description}</p>}
          <p className="faint" style={{ fontSize: "0.78rem", marginTop: 10 }}>
            {t("Titolo, foto e descrizione sono firmati dall'artista nell'app al momento del conio.", "Title, photo and description are signed by the artist in the app at mint time.")}
          </p>
        </div>
        <div style={{ minWidth: 0 }}>
          <Tabs<WorkTab>
            value={tab}
            onChange={setTab}
            tabs={[
              { value: "story", label: t("Racconto", "Story"), icon: <Sparkles /> },
              { value: "label", label: t("Etichetta QR", "QR label"), icon: <QrCode /> },
              { value: "trail", label: `${t("Provenienza", "Provenance")} · ${d?.exhibitions.length ?? 0}`, icon: <MapPin /> },
            ]}
          />
          {tab === "story" && <ExtrasEditor uid={uid} />}
          {tab === "label" && d && <LabelPanel uid={uid} title={d.artwork.title} artist={d.artist?.name ?? ""} />}
          {tab === "trail" && d && (
            <div className="card">
              {d.exhibitions.length === 0 ? (
                <p className="muted">{t("Non ancora esposta. Le mostre diventano la provenienza dell'opera.", "Not exhibited yet. Exhibitions become the work's provenance.")}</p>
              ) : (
                <>
                  <div className="timeline">
                    {d.exhibitions.map((e, i) => (
                      <div className="tl" key={e.exhibition_id}>
                        <div className="tl-rail">
                          <span className="tl-node">{i + 1}</span>
                          {i < d.exhibitions.length - 1 && <span className="tl-line" />}
                        </div>
                        <div className="tl-body">
                          <b>{e.title}</b>
                          <span>{[fmtRange(e.starts_at, e.ends_at, locale), e.venue, e.curator_name].filter(Boolean).join(" · ")}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {stops.length > 0 && (
                    <Suspense fallback={<div className="map map-trail skel" />}>
                      <TrailMap stops={stops} />
                    </Suspense>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

const EMPTY_EXTRAS: ExtrasIn = { year: "", medium: "", dimensions: "", edition: "", story: "", audio_url: "", links: [], images: [] };

function ExtrasEditor({ uid }: { uid: string }) {
  const { t } = useI18n();
  const { studio } = useSignedIn();
  const loaded = useQuery<Extras>(studio ? `s:extras:${uid}` : null, () => studio!.extras(uid), { staleMs: 0 });
  const [x, setX] = useState<ExtrasIn | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (loaded.data && !x) {
      const { uid: _u, ...rest } = loaded.data as Extras & { artist_id?: string; updated_at?: number };
      setX({ ...EMPTY_EXTRAS, ...pick(rest) });
    }
  }, [loaded.data, x]);

  if (!studio) return <StudioOff />;
  if (!x) return <Skeleton h={360} r={22} />;
  const set = <K extends keyof ExtrasIn>(k: K, v: ExtrasIn[K]) => setX((p) => (p ? { ...p, [k]: v } : p));
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const clean = { ...x, links: x.links.filter((l) => l.label.trim() && l.url.trim()).map((l) => ({ label: l.label.trim(), url: /^https?:\/\//.test(l.url) ? l.url.trim() : `https://${l.url.trim()}` })) };
      await studio.saveExtras(uid, clean);
      setX(clean);
      invalidate(`s:extras:${uid}`);
      toast(t("Passaporto aggiornato", "Passport updated"));
    } catch (e) {
      setError(errText(e, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="card">
        <div className="grid-2">
          <Input label={t("Anno", "Year")} value={x.year} maxLength={20} onChange={(e) => set("year", e.target.value)} />
          <Input label={t("Edizione", "Edition")} value={x.edition} maxLength={60} placeholder={t("es. 3/7, pezzo unico", "e.g. 3/7, unique")} onChange={(e) => set("edition", e.target.value)} />
          <Input label={t("Tecnica", "Medium")} value={x.medium} maxLength={160} placeholder={t("Olio su tela", "Oil on canvas")} onChange={(e) => set("medium", e.target.value)} />
          <Input label={t("Dimensioni", "Dimensions")} value={x.dimensions} maxLength={80} placeholder="120 × 160 cm" onChange={(e) => set("dimensions", e.target.value)} />
        </div>
        <div style={{ marginTop: 14 }}>
          <TextArea
            label={t("Il racconto", "The story")}
            rows={6}
            maxLength={4000}
            value={x.story}
            onChange={(e) => set("story", e.target.value)}
            placeholder={t("Come è nata l'opera, cosa la muove, cosa chiede a chi la guarda…", "How the work came about, what drives it, what it asks of the viewer…")}
            hint={t("Compare in grande nel passaporto: è l'argomento di conversazione.", "Shown large in the passport: it's the conversation starter.")}
          />
        </div>
        <div style={{ marginTop: 14 }}>
          <Input label={t("Audioguida (link)", "Audio guide (link)")} value={x.audio_url} placeholder="https://…" onChange={(e) => set("audio_url", e.target.value)} />
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div style={{ flex: 1 }}>
            <h3>{t("Link", "Links")}</h3>
            <p>{t("Video, articoli, catalogo: fino a 5.", "Video, articles, catalogue: up to 5.")}</p>
          </div>
          <Button size="sm" variant="ghost" icon={<Plus />} disabled={x.links.length >= 5} onClick={() => set("links", [...x.links, { label: "", url: "" }])}>
            {t("Aggiungi", "Add")}
          </Button>
        </div>
        <div className="stack" style={{ gap: 10 }}>
          {x.links.length === 0 && <p className="faint" style={{ fontSize: "0.85rem" }}>{t("Nessun link.", "No links.")}</p>}
          {x.links.map((l, i) => (
            <div key={i} className="link-row">
              <input className="input" placeholder={t("Etichetta", "Label")} value={l.label} maxLength={60} onChange={(e) => set("links", x.links.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} />
              <input className="input" placeholder="https://…" value={l.url} onChange={(e) => set("links", x.links.map((y, j) => (j === i ? { ...y, url: e.target.value } : y)))} />
              <Button variant="quiet" size="sm" icon={<Trash2 />} aria-label={t("Rimuovi", "Remove")} onClick={() => set("links", x.links.filter((_, j) => j !== i))} />
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h3>{t("Dettagli e studio", "Details & studio")}</h3>
            <p>{t("Fino a 3 immagini: particolari, retro, lavorazione.", "Up to 3 images: details, back, process.")}</p>
          </div>
        </div>
        <div className="grid-3">
          {[0, 1, 2].map((i) => (
            <ImagePicker
              key={i}
              aspect="1"
              maxKB={250}
              maxSide={1200}
              value={x.images[i] ?? ""}
              onChange={(v) => {
                const imgs = [...x.images];
                if (v) imgs[i] = v;
                else imgs.splice(i, 1);
                set("images", imgs.filter(Boolean));
              }}
            />
          ))}
        </div>
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      <div className="save-bar">
        <span className="muted">{t("Visibile a tutti nel passaporto dell'opera.", "Visible to everyone in the work's passport.")}</span>
        <Button busy={busy} icon={<Save />} onClick={save}>
          {t("Salva racconto", "Save story")}
        </Button>
      </div>
    </div>
  );
}

function pick(r: Record<string, unknown>): Partial<ExtrasIn> {
  const out: Partial<ExtrasIn> = {};
  (Object.keys(EMPTY_EXTRAS) as (keyof ExtrasIn)[]).forEach((k) => {
    if (r[k] !== undefined) (out as Record<string, unknown>)[k] = r[k];
  });
  return out;
}

function LabelPanel({ uid, title, artist }: { uid: string; title: string; artist: string }) {
  const { t } = useI18n();
  const url = `${location.origin}/t/${uid}`;
  const download = () => {
    const qr = qrSvg(url);
    const box = /viewBox="([^"]+)"/.exec(qr)?.[1] ?? "0 0 100 100";
    const inner = qr.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300" viewBox="0 0 600 300">
<rect width="600" height="300" fill="#fff"/>
<svg x="24" y="24" width="252" height="252" viewBox="${box}">${inner}</svg>
<text x="300" y="86" font-family="Georgia,serif" font-size="30" fill="#111">${esc(title)}</text>
<text x="300" y="122" font-family="Helvetica,Arial,sans-serif" font-size="18" fill="#444">${esc(artist)}</text>
<text x="300" y="200" font-family="Helvetica,Arial,sans-serif" font-size="13" fill="#666">${esc(t("Inquadra per il passaporto", "Scan for the passport"))}</text>
<text x="300" y="222" font-family="Helvetica,Arial,sans-serif" font-size="13" fill="#666">${esc(t("Tocca il tag NFC per la verifica ArtTrust", "Tap the NFC tag for the ArtTrust check"))}</text>
<text x="300" y="262" font-family="Helvetica,Arial,sans-serif" font-size="12" fill="#999">Veritag · ArtTrust · ${uid}</text>
</svg>`;
    downloadText(`veritag-${uid}.svg`, svg, "image/svg+xml");
  };
  return (
    <div className="card label-panel">
      <div className="wall-label">
        <Qr text={url} size={140} />
        <div>
          <b className="serif">{title}</b>
          <span>{artist}</span>
          <small>{t("Inquadra per il passaporto · tocca il tag per la verifica ArtTrust", "Scan for the passport · tap the tag for the ArtTrust check")}</small>
        </div>
      </div>
      <Notice tone="info">
        {t(
          "Il QR apre la scheda d'archivio dell'opera, utile a chi non ha NFC o l'app. La verifica crittografica completa — e l'apertura delle Private View — richiede sempre il tocco del tag.",
          "The QR opens the work's archive record, handy for visitors without NFC or the app. The full cryptographic check — and opening Private Views — always needs a tap of the tag.",
        )}
      </Notice>
      <div className="row wrap">
        <Button icon={<Download />} onClick={download}>
          {t("Scarica etichetta (SVG)", "Download label (SVG)")}
        </Button>
        <Link className="btn btn-ghost" to={`/t/${uid}`} target="_blank">
          <ExternalLink /> {url.replace(/^https?:\/\//, "")}
        </Link>
      </div>
    </div>
  );
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
