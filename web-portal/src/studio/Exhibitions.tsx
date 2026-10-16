/** Exhibitions — shows with a place on the map; they become each work's provenance. */
import { lazy, Suspense, useEffect, useState } from "react";
import { ArrowLeft, CalendarRange, Check, MapPinned, Pencil, Plus, Search, Trash2 } from "lucide-react";

import { useI18n } from "../lib/i18n.js";
import { invalidate, useQuery } from "../lib/query.js";
import { Link, match, navigate } from "../lib/router.js";
import { useSignedIn } from "../lib/session.js";
import { errText, fmtRange, plural } from "../lib/format.js";
import type { CatalogueEntry, Exhibition } from "../portal.js";
import { ArtImage, Badge, BlueCheck, Button, Empty, Input, Notice, Skeleton, TextArea, toast } from "../ui/index.js";
import { PageHead, useWorks } from "./common.js";

const MapPicker = lazy(() => import("../map.js").then((m) => ({ default: m.MapPicker })));
const GeoSearch = lazy(() => import("../map.js").then((m) => ({ default: m.GeoSearch })));
const TrailMap = lazy(() => import("../map.js").then((m) => ({ default: m.TrailMap })));

function useExhibitions() {
  const { session, core } = useSignedIn();
  return useQuery<Exhibition[]>("s:exh", () => core.curatorExhibitions(session.id));
}

export function Exhibitions({ sub }: { sub: string }) {
  let m: Record<string, string> | null;
  if (sub === "/exhibitions/new") return <Composer />;
  if ((m = match("/exhibitions/:id/edit", sub))) return <Composer id={m.id} />;
  if ((m = match("/exhibitions/:id", sub))) return <Detail id={m.id} />;
  return <List />;
}

function List() {
  const { t, locale } = useI18n();
  const rooms = useExhibitions();
  const now = new Date().toISOString().slice(0, 10);
  const state = (e: Exhibition) => (e.starts_at && e.starts_at > now ? "soon" : e.ends_at && e.ends_at < now ? "past" : "on");
  return (
    <>
      <PageHead
        title={t("Mostre", "Exhibitions")}
        sub={t("Allestisci mostre con data e luogo: ogni opera esposta guadagna una tappa nella sua provenienza.", "Stage shows with dates and a place: every work on show gains a stop in its provenance.")}
        actions={
          <Link to="/studio/exhibitions/new" className="btn btn-primary">
            <Plus /> {t("Nuova mostra", "New exhibition")}
          </Link>
        }
      />
      {rooms.loading && !rooms.data ? (
        <div className="room-grid">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} h={250} r={22} />
          ))}
        </div>
      ) : (rooms.data ?? []).length === 0 ? (
        <Empty icon={<MapPinned />} title={t("Nessuna mostra", "No exhibitions")} action={<Link className="btn btn-primary" to="/studio/exhibitions/new">{t("Crea la prima", "Create the first")}</Link>}>
          {t("La prima mostra diventa la prima tappa della provenienza delle tue opere.", "Your first show becomes the first stop in your works' provenance.")}
        </Empty>
      ) : (
        <div className="room-grid">
          {rooms.data!.map((r) => (
            <Link key={r.exhibition_id} to={`/studio/exhibitions/${r.exhibition_id}`} className="room-card">
              <div className="room-cover">
                <ArtImage src={r.cover_url} seed={r.title} />
                <span className="room-count">{r.items.length}</span>
              </div>
              <div className="room-body">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <b>{r.title}</b>
                  {state(r) === "on" ? <Badge tone="green">{t("In corso", "On now")}</Badge> : state(r) === "soon" ? <Badge tone="trust">{t("In arrivo", "Upcoming")}</Badge> : <Badge>{t("Conclusa", "Closed")}</Badge>}
                </div>
                <span>{[fmtRange(r.starts_at, r.ends_at, locale), r.venue].filter(Boolean).join(" · ") || "—"}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

function Detail({ id }: { id: string }) {
  const { t, locale } = useI18n();
  const { core } = useSignedIn();
  const room = useQuery<Exhibition>(`s:exh:${id}`, () => core.getExhibition(id));
  const works = useWorks();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const r = room.data;
  if (room.error) return <Notice tone="error">{errText(room.error, t)}</Notice>;
  if (!r) return <Skeleton h={360} r={22} />;
  const img = (uid: string) => works.data?.find((w) => w.artwork.uid === uid)?.artwork.image_data_url;

  const remove = async () => {
    if (!confirm) {
      setConfirm(true);
      setTimeout(() => setConfirm(false), 3500);
      return;
    }
    setBusy(true);
    try {
      await core.deleteExhibition(id);
      invalidate("s:exh");
      toast(t("Mostra eliminata", "Exhibition deleted"));
      navigate("/studio/exhibitions");
    } catch (e) {
      toast(errText(e, t), "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead
        back={
          <Link to="/studio/exhibitions" className="btn btn-quiet btn-sm">
            <ArrowLeft /> {t("Mostre", "Exhibitions")}
          </Link>
        }
        title={r.title}
        sub={[fmtRange(r.starts_at, r.ends_at, locale), r.venue, t(plural(r.items.length, "opera", "opere"), plural(r.items.length, "work", "works"))].filter(Boolean).join(" · ")}
        actions={
          <>
            <Link className="btn btn-ghost" to={`/studio/exhibitions/${id}/edit`}>
              <Pencil /> {t("Modifica", "Edit")}
            </Link>
            <Button variant="danger" busy={busy} icon={<Trash2 />} onClick={remove}>
              {confirm ? t("Confermi?", "Confirm?") : t("Elimina", "Delete")}
            </Button>
          </>
        }
      />
      {r.description && <p className="lead-text">{r.description}</p>}
      <div className="exh-detail">
        <div className="work-grid">
          {r.items.map((it) => (
            <Link key={it.uid} to={`/studio/works/${it.uid}`} className="work-tile">
              <ArtImage src={img(it.uid)} seed={it.title ?? it.uid} className="work-tile-img" />
              <div className="work-tile-label">
                <b>{it.title ?? t("Senza titolo", "Untitled")}</b>
                <span>{it.artist_name}</span>
                {it.caption && <em className="caption">{it.caption}</em>}
              </div>
            </Link>
          ))}
        </div>
        {r.lat != null && r.lng != null && (
          <div className="card">
            <div className="card-head">
              <h3>{t("Luogo", "Location")}</h3>
            </div>
            <Suspense fallback={<div className="map map-trail skel" />}>
              <TrailMap stops={[{ lat: r.lat, lng: r.lng, title: r.venue || r.title }]} />
            </Suspense>
          </div>
        )}
      </div>
    </>
  );
}

type Form = { title: string; desc: string; start: string; end: string; venue: string; lat: number | null; lng: number | null };
const EMPTY: Form = { title: "", desc: "", start: "", end: "", venue: "", lat: null, lng: null };

function Composer({ id }: { id?: string }) {
  const { t } = useI18n();
  const { core, session } = useSignedIn();
  const works = useWorks();
  const existing = useQuery<Exhibition>(id ? `s:exh:${id}` : null, () => core.getExhibition(id!));
  const [form, setForm] = useState<Form>(EMPTY);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(!id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const r = existing.data;
    if (!r || ready) return;
    setForm({ title: r.title, desc: r.description ?? "", start: r.starts_at ?? "", end: r.ends_at ?? "", venue: r.venue ?? "", lat: r.lat ?? null, lng: r.lng ?? null });
    setPicked(Object.fromEntries(r.items.map((i) => [i.uid, i.caption ?? ""])));
    setReady(true);
  }, [existing.data, ready]);

  const set = (p: Partial<Form>) => setForm((f) => ({ ...f, ...p }));
  const save = async () => {
    setBusy(true);
    setError("");
    const body = {
      title: form.title.trim(),
      description: form.desc.trim(),
      starts_at: form.start,
      ends_at: form.end,
      venue: form.venue.trim(),
      lat: form.lat,
      lng: form.lng,
      items: Object.entries(picked).map(([uid, caption]) => ({ uid, caption })),
    };
    try {
      const saved = id ? await core.updateExhibition(id, body) : await core.createExhibition({ curator_id: session.id, ...body });
      invalidate("s:exh");
      invalidate("s:artwork:");
      toast(id ? t("Mostra aggiornata", "Exhibition updated") : t("Mostra creata", "Exhibition created"));
      navigate(`/studio/exhibitions/${saved.exhibition_id}`, { replace: true });
    } catch (e) {
      setError(errText(e, t));
    } finally {
      setBusy(false);
    }
  };

  if (!ready) return <Skeleton h={420} r={22} />;
  const badDates = form.start && form.end && form.end < form.start;

  return (
    <>
      <PageHead
        back={
          <Link to={id ? `/studio/exhibitions/${id}` : "/studio/exhibitions"} className="btn btn-quiet btn-sm">
            <ArrowLeft /> {t("Annulla", "Cancel")}
          </Link>
        }
        title={id ? t("Modifica mostra", "Edit exhibition") : t("Nuova mostra", "New exhibition")}
        sub={t("Titolo, date, luogo — poi scegli le opere da esporre.", "Title, dates, place — then pick the works to hang.")}
      />
      <div className="composer">
        <div className="card stack">
          <Input label={t("Titolo", "Title")} value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="Phygital Art — Atto II" />
          <Input label={t("Sede", "Venue")} value={form.venue} onChange={(e) => set({ venue: e.target.value })} placeholder={t("Sede aziendale, Milano", "Company HQ, Milan")} />
          <div className="grid-2">
            <Input label={t("Apertura", "Opens")} type="date" value={form.start} onChange={(e) => set({ start: e.target.value })} />
            <Input label={t("Chiusura", "Closes")} type="date" value={form.end} onChange={(e) => set({ end: e.target.value })} />
          </div>
          {badDates && <Notice tone="warn">{t("La chiusura è prima dell'apertura.", "Closing is before opening.")}</Notice>}
          <TextArea label={t("Descrizione", "Description")} rows={3} value={form.desc} onChange={(e) => set({ desc: e.target.value })} />
          <div className="field">
            <label>
              {t("Sulla mappa", "On the map")} <span className="faint">· {t("cerca o clicca per il pin", "search or click to drop the pin")}</span>
            </label>
            <Suspense fallback={<div className="map map-picker skel" />}>
              <GeoSearch onPick={(r) => set({ lat: r.lat, lng: r.lng, ...(form.venue.trim() ? {} : { venue: r.label.split(", ").slice(0, 2).join(", ") }) })} />
              <MapPicker lat={form.lat} lng={form.lng} onPick={(lat, lng) => set({ lat, lng })} />
            </Suspense>
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <div style={{ flex: 1 }}>
              <h3>{t("Le opere", "The works")}</h3>
              <p>{t("Tocca un'opera per esporla; aggiungi una didascalia se vuoi.", "Tap a work to hang it; add a wall caption if you like.")}</p>
            </div>
            <Badge tone="gold">
              <CalendarRange /> {Object.keys(picked).length}
            </Badge>
          </div>
          <WorkPicker
            cat={works.data ?? []}
            picked={picked}
            onToggle={(uid) =>
              setPicked((p) => {
                const n = { ...p };
                if (uid in n) delete n[uid];
                else n[uid] = "";
                return n;
              })
            }
            onCaption={(uid, caption) => setPicked((p) => ({ ...p, [uid]: caption }))}
          />
        </div>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="save-bar sticky">
        <span className="muted">{t(plural(Object.keys(picked).length, "opera selezionata", "opere selezionate"), plural(Object.keys(picked).length, "work selected", "works selected"))}</span>
        <Button busy={busy} disabled={!form.title.trim() || Object.keys(picked).length === 0 || !!badDates} icon={<Check />} onClick={save}>
          {id ? t("Salva modifiche", "Save changes") : t("Crea mostra", "Create exhibition")}
        </Button>
      </div>
    </>
  );
}

export function WorkPicker({
  cat,
  picked,
  onToggle,
  onCaption,
}: {
  cat: CatalogueEntry[];
  picked: Record<string, string>;
  onToggle: (uid: string) => void;
  onCaption?: (uid: string, caption: string) => void;
}) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const shown = cat.filter((c) => !q || c.artwork.title.toLowerCase().includes(q.toLowerCase()) || c.artist_name.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="input-affix" style={{ marginBottom: 12 }}>
        <Search />
        <input className="input" placeholder={t("Cerca nel catalogo…", "Search the catalogue…")} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {cat.length === 0 && <p className="muted">{t("Il catalogo è vuoto.", "The catalogue is empty.")}</p>}
      <div className="picker">
        {shown.map((c) => {
          const on = c.artwork.uid in picked;
          return (
            <div key={c.artwork.uid} className={`pick${on ? " on" : ""}`}>
              <button className="pick-hit" onClick={() => onToggle(c.artwork.uid)} aria-pressed={on}>
                <ArtImage src={c.artwork.image_data_url} seed={c.artwork.title} className="pick-img" />
                <span className="pick-badge">
                  <Check />
                </span>
                <span className="pick-label">
                  <b>{c.artwork.title}</b>
                  <span className="row" style={{ gap: 4 }}>
                    {c.artist_name} {c.artist_verified && <BlueCheck />}
                  </span>
                </span>
              </button>
              {on && onCaption && <input className="input pick-caption" placeholder={t("Didascalia (facoltativa)", "Caption (optional)")} value={picked[c.artwork.uid]} onChange={(e) => onCaption(c.artwork.uid, e.target.value)} />}
            </div>
          );
        })}
      </div>
    </>
  );
}
