/**
 * Private Views — curated sets of works that aren't on the wall, offered to
 * the visitor who taps an authentic artwork (or, by choice, to whoever has the
 * link). The upsell lives inside the tag.
 */
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Copy,
  Eye,
  Fingerprint,
  Image as ImageIcon,
  Link2,
  Lock,
  Pencil,
  Plus,
  Rocket,
  Save,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";

import { useI18n } from "../lib/i18n.js";
import { invalidate, setQueryData, useQuery } from "../lib/query.js";
import { Link, navigate, useQueryParams } from "../lib/router.js";
import { useSignedIn } from "../lib/session.js";
import { copy, errText, money, plural } from "../lib/format.js";
import type { ItemIn, PrivateView, ViewIn, ViewItem } from "../studio-api.js";
import { ArtImage, Badge, Button, Choices, Empty, ImagePicker, Input, Notice, Select, Sheet, Skeleton, Switch, TextArea, toast } from "../ui/index.js";
import { Qr } from "../ui/qr.js";
import { PageHead, StudioOff, useArtists, useViews, useWorks } from "./common.js";
import { WorkPicker } from "./Exhibitions.js";

export function ViewsList() {
  const { t } = useI18n();
  const { studio, session } = useSignedIn();
  const views = useViews();
  const artists = useArtists();
  const q = useQueryParams();
  const [creating, setCreating] = useState(!!q.get("artist"));
  const [title, setTitle] = useState("");
  const [artistId, setArtistId] = useState(q.get("artist") ?? "");
  const [busy, setBusy] = useState(false);

  if (!studio) return <StudioOff />;

  const create = async () => {
    setBusy(true);
    try {
      const forArtist = session.kind === "artist" ? session.id : artistId || null;
      const v = await studio.createView({
        title: title.trim(),
        intro: "",
        cover: "",
        status: "draft",
        access: "tap",
        scope: forArtist ? "artist" : "anchors",
        anchors: [],
        artist_id: forArtist,
      });
      invalidate("s:views");
      navigate(`/studio/views/${v.id}`);
    } catch (e) {
      toast(errText(e, t), "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead
        title="Private View"
        sub={t(
          "Le opere che non sono sul muro, riservate a chi tocca un'opera autentica. Il tag diventa la porta per l'upselling.",
          "The works that aren't on the wall, reserved for whoever taps an authentic artwork. The tag becomes the door to the upsell.",
        )}
        actions={
          <Button icon={<Plus />} onClick={() => setCreating(true)}>
            {t("Nuova Private View", "New Private View")}
          </Button>
        }
      />

      <div className="how">
        <div>
          <span className="how-n">1</span>
          <b>{t("Componi", "Compose")}</b>
          <span>{t("Opere non esposte, con foto, prezzo e disponibilità.", "Unexhibited works, with photo, price and availability.")}</span>
        </div>
        <div>
          <span className="how-n">2</span>
          <b>{t("Collega", "Link")}</b>
          <span>{t("Scegli quali opere, toccate dal vivo, la aprono.", "Choose which works, tapped in person, open it.")}</span>
        </div>
        <div>
          <span className="how-n">3</span>
          <b>{t("Raccogli", "Collect")}</b>
          <span>{t("Il visitatore chiede, tu ricevi il lead.", "The visitor asks, you get the lead.")}</span>
        </div>
      </div>

      {views.loading && !views.data ? (
        <div className="room-grid">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} h={250} r={22} />
          ))}
        </div>
      ) : (views.data ?? []).length === 0 ? (
        <Empty icon={<Sparkles />} title={t("Nessuna Private View", "No Private Views yet")} action={<Button icon={<Plus />} onClick={() => setCreating(true)}>{t("Crea la prima", "Create the first")}</Button>}>
          {t("Raccogli le opere dello studio che vuoi proporre in modo esclusivo.", "Gather the studio works you want to offer exclusively.")}
        </Empty>
      ) : (
        <div className="room-grid">
          {views.data!.map((v) => (
            <ViewCard key={v.id} v={v} artistName={artists.data?.find((a) => a.artist_id === v.artist_id)?.name} />
          ))}
        </div>
      )}

      <Sheet
        open={creating}
        onClose={() => setCreating(false)}
        title={t("Nuova Private View", "New Private View")}
        sub={t("Inizia dal titolo: il resto lo componi subito dopo.", "Start with a title: you'll compose the rest right after.")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              {t("Annulla", "Cancel")}
            </Button>
            <Button busy={busy} disabled={!title.trim()} onClick={create}>
              {t("Crea e componi", "Create and compose")}
            </Button>
          </>
        }
      >
        <div className="stack">
          <Input label={t("Titolo", "Title")} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder={t("Dallo studio — opere inedite", "From the studio — unseen works")} onKeyDown={(e) => e.key === "Enter" && title.trim() && create()} />
          {session.kind === "curator" && (
            <Select label={t("Artista", "Artist")} value={artistId} onChange={(e) => setArtistId(e.target.value)} hint={t("Con un artista, qualsiasi sua opera può aprire la Private View.", "With an artist, any of their works can open the Private View.")}>
              <option value="">{t("Collettiva (più artisti)", "Group (several artists)")}</option>
              {(artists.data ?? []).map((a) => (
                <option key={a.artist_id} value={a.artist_id}>
                  {a.name}
                </option>
              ))}
            </Select>
          )}
        </div>
      </Sheet>
    </>
  );
}

function ViewCard({ v, artistName }: { v: PrivateView; artistName?: string }) {
  const { t } = useI18n();
  return (
    <Link to={`/studio/views/${v.id}`} className="room-card">
      <div className="room-cover">
        <ArtImage src={v.cover} seed={v.id} />
        <span className="room-count">{v.item_count}</span>
      </div>
      <div className="room-body">
        <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
          <b className="clamp-2">{v.title}</b>
          {v.status === "live" ? <Badge tone="green">{t("Pubblicata", "Live")}</Badge> : <Badge>{t("Bozza", "Draft")}</Badge>}
        </div>
        <span className="row" style={{ gap: 8 }}>
          {v.access === "tap" ? <Fingerprint size={14} /> : <Link2 size={14} />}
          {v.access === "tap" ? t("Si apre col tocco", "Opens with a tap") : t("Link riservato", "Private link")}
          {artistName && <>· {artistName}</>}
        </span>
        <span className="faint" style={{ fontSize: "0.76rem" }}>
          <Eye size={12} style={{ display: "inline", verticalAlign: "-2px" }} /> {t(plural(v.opens, "apertura", "aperture"), plural(v.opens, "open", "opens"))}
        </span>
      </div>
    </Link>
  );
}

type Settings = Pick<PrivateView, "title" | "intro" | "cover" | "access" | "scope" | "anchors">;

export function ViewEditor({ id }: { id: string }) {
  const { t } = useI18n();
  const { studio, session } = useSignedIn();
  const view = useQuery<PrivateView>(studio ? `s:view:${id}` : null, () => studio!.view(id), { staleMs: 0 });
  const works = useWorks();
  const artists = useArtists();
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState("");
  const [item, setItem] = useState<ViewItem | "new" | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [error, setError] = useState("");

  const v = view.data;
  useEffect(() => {
    if (v && !s) setS({ title: v.title, intro: v.intro, cover: v.cover, access: v.access, scope: v.scope, anchors: v.anchors });
  }, [v, s]);

  const anchorPool = useMemo(() => (works.data ?? []).filter((w) => !v?.artist_id || w.artist_id === v.artist_id), [works.data, v?.artist_id]);

  if (!studio) return <StudioOff />;
  if (view.error) {
    return (
      <Empty icon={<Sparkles />} title={t("Private View non trovata", "Private View not found")} action={<Link className="btn btn-ghost" to="/studio/views">{t("Torna alle Private View", "Back to Private Views")}</Link>}>
        {errText(view.error, t)}
      </Empty>
    );
  }
  if (!v || !s) return <Skeleton h={480} r={22} />;

  const artistName = artists.data?.find((a) => a.artist_id === v.artist_id)?.name;
  const dirty = JSON.stringify(s) !== JSON.stringify({ title: v.title, intro: v.intro, cover: v.cover, access: v.access, scope: v.scope, anchors: v.anchors });
  const items = v.items ?? [];
  const shareUrl = `${location.origin}/v/${v.id}`;

  const persist = async (patch: Partial<ViewIn>, label: string, okText?: string) => {
    setBusy(label);
    setError("");
    try {
      const nv = await studio.updateView(id, patch);
      setQueryData<PrivateView>(`s:view:${id}`, () => nv);
      setS({ title: nv.title, intro: nv.intro, cover: nv.cover, access: nv.access, scope: nv.scope, anchors: nv.anchors });
      invalidate("s:views");
      if (okText) toast(okText);
      return true;
    } catch (e) {
      setError(errText(e, t));
      return false;
    } finally {
      setBusy("");
    }
  };
  const save = () => persist(s, "save", t("Salvata", "Saved"));
  const publish = async () => {
    if (dirty && !(await persist(s, "save"))) return;
    await persist({ status: v.status === "live" ? "draft" : "live" }, "status", v.status === "live" ? t("Tornata in bozza", "Back to draft") : t("Pubblicata: ora si apre col tocco", "Live: it now opens with a tap"));
  };
  const remove = async () => {
    if (!confirmDel) {
      setConfirmDel(true);
      setTimeout(() => setConfirmDel(false), 3500);
      return;
    }
    setBusy("delete");
    try {
      await studio.deleteView(id);
      invalidate("s:views");
      toast(t("Private View eliminata", "Private View deleted"));
      navigate("/studio/views");
    } catch (e) {
      toast(errText(e, t), "err");
      setBusy("");
    }
  };
  const move = async (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    const ids = items.map((i) => i.id);
    [ids[from], ids[to]] = [ids[to], ids[from]];
    setQueryData<PrivateView>(`s:view:${id}`, (old) => (old ? { ...old, items: ids.map((x) => items.find((i) => i.id === x)!) } : old!));
    try {
      const nv = await studio.reorder(id, ids);
      setQueryData<PrivateView>(`s:view:${id}`, () => nv);
    } catch (e) {
      toast(errText(e, t), "err");
      view.refresh();
    }
  };

  return (
    <>
      <PageHead
        back={
          <Link to="/studio/views" className="btn btn-quiet btn-sm">
            <ArrowLeft /> Private View
          </Link>
        }
        title={
          <span className="row" style={{ gap: 12, flexWrap: "wrap" }}>
            {v.title} {v.status === "live" ? <Badge tone="green">{t("Pubblicata", "Live")}</Badge> : <Badge>{t("Bozza", "Draft")}</Badge>}
          </span>
        }
        sub={[artistName, v.owner_kind === "artist" ? t("creata dall'artista", "made by the artist") : v.owner_name].filter(Boolean).join(" · ")}
        actions={
          <>
            {v.owner_kind === session.kind && v.owner_id === session.id && (
              <Button variant="danger" busy={busy === "delete"} icon={<Trash2 />} onClick={remove} aria-label={t("Elimina", "Delete")}>
                {confirmDel ? t("Confermi?", "Confirm?") : ""}
              </Button>
            )}
            <Button variant={v.status === "live" ? "ghost" : "gold"} busy={busy === "status"} icon={<Rocket />} onClick={publish}>
              {v.status === "live" ? t("Riporta in bozza", "Unpublish") : t("Pubblica", "Publish")}
            </Button>
          </>
        }
      />
      {error && (
        <div style={{ marginBottom: 14 }}>
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      <div className="view-editor">
        <div className="stack">
          <section className="card">
            <div className="card-head">
              <div style={{ flex: 1 }}>
                <h3>{t("Le opere riservate", "The reserved works")}</h3>
                <p>{t("Foto, prezzo e disponibilità: cosa vede chi entra.", "Photo, price and availability: what visitors see inside.")}</p>
              </div>
              <Button size="sm" icon={<Plus />} onClick={() => setItem("new")}>
                {t("Aggiungi opera", "Add work")}
              </Button>
            </div>
            {items.length === 0 ? (
              <Empty icon={<ImageIcon />} title={t("Ancora vuota", "Still empty")} action={<Button variant="ghost" icon={<Plus />} onClick={() => setItem("new")}>{t("Aggiungi la prima opera", "Add the first work")}</Button>}>
                {t("Aggiungi opere dello studio, edizioni, lavori su commissione…", "Add studio works, editions, commissions…")}
              </Empty>
            ) : (
              <div className="items">
                {items.map((it, i) => (
                  <div key={it.id} className="item-row">
                    <ArtImage src={it.image} seed={it.title} className="item-thumb" />
                    <div className="lr-main" style={{ minWidth: 0, flex: 1 }}>
                      <b>{it.title}</b>
                      <span>{[it.year, it.medium, it.dimensions].filter(Boolean).join(" · ") || "—"}</span>
                      <div className="row" style={{ gap: 8, marginTop: 6 }}>
                        <ItemPrice it={it} />
                        <AvailBadge it={it} />
                      </div>
                    </div>
                    <div className="item-actions">
                      <Button variant="quiet" size="sm" icon={<ArrowUp />} aria-label={t("Su", "Up")} disabled={i === 0} onClick={() => move(i, i - 1)} />
                      <Button variant="quiet" size="sm" icon={<ArrowDown />} aria-label={t("Giù", "Down")} disabled={i === items.length - 1} onClick={() => move(i, i + 1)} />
                      <Button variant="ghost" size="sm" icon={<Pencil />} aria-label={t("Modifica", "Edit")} onClick={() => setItem(it)} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card stack">
            <div className="card-head" style={{ marginBottom: 0 }}>
              <div>
                <h3>{t("Presentazione", "Presentation")}</h3>
                <p>{t("La copertina e il testo d'apertura.", "The cover and the opening text.")}</p>
              </div>
            </div>
            <Input label={t("Titolo", "Title")} value={s.title} maxLength={120} onChange={(e) => setS({ ...s, title: e.target.value })} />
            <TextArea label={t("Introduzione", "Introduction")} rows={4} maxLength={1500} value={s.intro} onChange={(e) => setS({ ...s, intro: e.target.value })} placeholder={t("Un invito personale a chi ha toccato l'opera…", "A personal note to whoever tapped the work…")} />
            <ImagePicker label={t("Copertina", "Cover")} aspect="16 / 9" value={s.cover} onChange={(cover) => setS({ ...s, cover })} />
          </section>
        </div>

        <aside className="stack">
          <section className="card stack">
            <div className="card-head" style={{ marginBottom: 0 }}>
              <div>
                <h3>{t("Chi può entrare", "Who can enter")}</h3>
                <p>{t("La chiave è il tocco autentico.", "The key is the authentic tap.")}</p>
              </div>
            </div>
            <Choices
              value={s.access}
              onChange={(access) => setS({ ...s, access })}
              options={[
                { value: "tap", icon: <Fingerprint />, title: t("Tocco autentico", "Authentic tap"), sub: t("Solo chi tocca dal vivo un'opera collegata (24 h).", "Only whoever taps a linked work in person (24 h).") },
                { value: "link", icon: <Link2 />, title: t("Link riservato", "Private link"), sub: t("Chiunque abbia il link: per collezionisti selezionati.", "Anyone with the link: for selected collectors.") },
              ]}
            />
            {v.artist_id ? (
              <Switch
                checked={s.scope === "artist"}
                onChange={(on) => setS({ ...s, scope: on ? "artist" : "anchors" })}
                title={t(`Ogni opera di ${artistName ?? "questo artista"}`, `Any work by ${artistName ?? "this artist"}`)}
                sub={t("Altrimenti scegli tu quali opere la aprono.", "Otherwise pick which works open it.")}
              />
            ) : (
              <Notice tone="info">{t("Collettiva: scegli le opere che la aprono.", "Group view: pick the works that open it.")}</Notice>
            )}
            {s.scope === "anchors" && (
              <div className="field">
                <label>
                  {t("Opere che la aprono", "Works that open it")} · {s.anchors.length}
                </label>
                <div className="anchor-picker">
                  <WorkPicker
                    cat={anchorPool}
                    picked={Object.fromEntries(s.anchors.map((a) => [a, ""]))}
                    onToggle={(uid) => setS({ ...s, anchors: s.anchors.includes(uid) ? s.anchors.filter((a) => a !== uid) : [...s.anchors, uid] })}
                  />
                </div>
              </div>
            )}
          </section>

          <div className="save-bar">
            <span className="muted">{dirty ? t("Modifiche non salvate", "Unsaved changes") : t("Tutto salvato", "All saved")}</span>
            <Button busy={busy === "save"} disabled={!dirty || !s.title.trim()} icon={<Save />} onClick={save}>
              {t("Salva", "Save")}
            </Button>
          </div>

          <section className="card share">
            <div className="card-head" style={{ marginBottom: 10 }}>
              <div>
                <h3>{t("Condivisione", "Sharing")}</h3>
                <p>
                  {v.status !== "live"
                    ? t("In bozza: nessuno la vede finché non la pubblichi.", "Draft: nobody sees it until you publish.")
                    : v.access === "tap"
                      ? t("Pubblicata: compare nel passaporto dopo un tocco autentico.", "Live: it appears in the passport after an authentic tap.")
                      : t("Pubblicata: chi ha il link la vede.", "Live: anyone with the link sees it.")}
                </p>
              </div>
            </div>
            {v.access === "link" && v.status === "live" ? (
              <div className="row wrap" style={{ gap: 14, alignItems: "flex-start" }}>
                <Qr text={shareUrl} size={120} />
                <div className="stack" style={{ gap: 8, flex: 1, minWidth: 160 }}>
                  <Button variant="ghost" icon={<Copy />} onClick={async () => toast((await copy(shareUrl)) ? t("Link copiato", "Link copied") : shareUrl)}>
                    {t("Copia link", "Copy link")}
                  </Button>
                  <Link className="btn btn-quiet" to={`/v/${v.id}`} target="_blank">
                    <Eye /> {t("Anteprima", "Preview")}
                  </Link>
                </div>
              </div>
            ) : (
              <div className="row" style={{ gap: 10, color: "var(--muted)", fontSize: "0.86rem" }}>
                {v.access === "tap" ? <Lock size={16} /> : <Users size={16} />}
                {v.access === "tap" ? t("Il tocco sul tag è la chiave: nessun link da condividere.", "The tap on the tag is the key: no link to share.") : t("Pubblica per ottenere il link.", "Publish to get the link.")}
              </div>
            )}
          </section>
        </aside>
      </div>

      {item && <ItemSheet viewId={id} item={item === "new" ? null : item} onClose={() => setItem(null)} onSaved={() => view.refresh()} />}
    </>
  );
}

const EMPTY_ITEM: ItemIn = { title: "", year: "", medium: "", dimensions: "", description: "", image: "", price: null, currency: "EUR", price_on_request: false, availability: "available" };

function ItemSheet({ viewId, item, onClose, onSaved }: { viewId: string; item: ViewItem | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useI18n();
  const { studio } = useSignedIn();
  const [f, setF] = useState<ItemIn>(() => (item ? { ...EMPTY_ITEM, ...pickItem(item) } : EMPTY_ITEM));
  const [priceText, setPriceText] = useState(item?.price != null ? String(item.price) : "");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const set = <K extends keyof ItemIn>(k: K, v: ItemIn[K]) => setF((x) => ({ ...x, [k]: v }));

  const save = async () => {
    setBusy("save");
    setError("");
    const price = priceText.trim() === "" ? null : Number(priceText.replace(/[^\d.,]/g, "").replace(",", "."));
    if (price !== null && (Number.isNaN(price) || price < 0)) {
      setError(t("Prezzo non valido", "Invalid price"));
      setBusy("");
      return;
    }
    try {
      const body = { ...f, price, price_on_request: f.price_on_request || price === null };
      if (item) await studio!.updateItem(viewId, item.id, body);
      else await studio!.addItem(viewId, body);
      invalidate("s:views");
      onSaved();
      onClose();
    } catch (e) {
      setError(errText(e, t));
    } finally {
      setBusy("");
    }
  };
  const remove = async () => {
    if (!item) return;
    setBusy("del");
    try {
      await studio!.deleteItem(viewId, item.id);
      invalidate("s:views");
      onSaved();
      onClose();
    } catch (e) {
      setError(errText(e, t));
      setBusy("");
    }
  };

  return (
    <Sheet
      open
      wide
      onClose={onClose}
      title={item ? t("Modifica opera", "Edit work") : t("Nuova opera riservata", "New reserved work")}
      footer={
        <>
          {item && (
            <Button variant="danger" busy={busy === "del"} icon={<Trash2 />} onClick={remove} style={{ marginRight: "auto" }}>
              {t("Rimuovi", "Remove")}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t("Annulla", "Cancel")}
          </Button>
          <Button busy={busy === "save"} disabled={!f.title.trim()} onClick={save}>
            {t("Salva opera", "Save work")}
          </Button>
        </>
      }
    >
      <div className="item-form">
        <ImagePicker value={f.image} onChange={(v) => set("image", v)} aspect="4 / 5" />
        <div className="stack">
          <Input label={t("Titolo", "Title")} value={f.title} maxLength={120} onChange={(e) => set("title", e.target.value)} />
          <div className="grid-2">
            <Input label={t("Anno", "Year")} value={f.year} maxLength={20} onChange={(e) => set("year", e.target.value)} />
            <Input label={t("Dimensioni", "Dimensions")} value={f.dimensions} maxLength={80} onChange={(e) => set("dimensions", e.target.value)} />
          </div>
          <Input label={t("Tecnica", "Medium")} value={f.medium} maxLength={160} onChange={(e) => set("medium", e.target.value)} />
          <TextArea label={t("Descrizione", "Description")} rows={3} maxLength={1500} value={f.description} onChange={(e) => set("description", e.target.value)} />
          <div className="grid-2">
            <Input label={t("Prezzo", "Price")} inputMode="decimal" value={priceText} disabled={f.price_on_request} placeholder="4500" onChange={(e) => setPriceText(e.target.value)} />
            <Select label={t("Valuta", "Currency")} value={f.currency} onChange={(e) => set("currency", e.target.value)}>
              {["EUR", "USD", "GBP", "CHF"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </div>
          <Switch checked={f.price_on_request} onChange={(v) => set("price_on_request", v)} title={t("Prezzo su richiesta", "Price on request")} sub={t("Il prezzo resta riservato: arriva come lead.", "The price stays private: it comes in as a lead.")} />
          <Choices
            value={f.availability}
            onChange={(v) => set("availability", v)}
            options={[
              { value: "available", title: t("Disponibile", "Available") },
              { value: "reserved", title: t("Riservata", "Reserved") },
              { value: "sold", title: t("Venduta", "Sold") },
            ]}
          />
          {error && <Notice tone="error">{error}</Notice>}
        </div>
      </div>
    </Sheet>
  );
}

function pickItem(it: ViewItem): ItemIn {
  const { title, year, medium, dimensions, description, image, price, currency, price_on_request, availability } = it;
  return { title, year, medium, dimensions, description, image, price, currency, price_on_request, availability };
}

function ItemPrice({ it }: { it: ViewItem }) {
  const { t, locale } = useI18n();
  return <span className="price">{it.price_on_request || it.price == null ? t("Su richiesta", "On request") : money(it.price, it.currency, locale)}</span>;
}

function AvailBadge({ it }: { it: ViewItem }) {
  const { t } = useI18n();
  if (it.availability === "sold") return <Badge tone="red">{t("Venduta", "Sold")}</Badge>;
  if (it.availability === "reserved") return <Badge tone="amber">{t("Riservata", "Reserved")}</Badge>;
  return <Badge tone="green">{t("Disponibile", "Available")}</Badge>;
}
