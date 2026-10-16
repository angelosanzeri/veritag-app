/**
 * A Private View, as the visitor sees it: works that are not on the wall,
 * opened by their tap. Each work can be asked about in one step.
 */
import { useEffect, useState } from "react";
import { ArrowLeft, Contact, Lock, MessageCircle, Sparkles, X } from "lucide-react";

import { useI18n } from "../lib/i18n.js";
import { useQuery } from "../lib/query.js";
import { Link, useQueryParams } from "../lib/router.js";
import { useSession } from "../lib/session.js";
import { errText, money } from "../lib/format.js";
import type { PublicView, ViewItem } from "../studio-api.js";
import { ArtImage, Avatar, Badge, BlueCheck, Button, Empty, Skeleton } from "../ui/index.js";
import { LeadSheet, passFor, PublicFooter, PublicHeader, rememberPass } from "./shared.js";

export function PrivateViewPage({ id }: { id: string }) {
  const { t } = useI18n();
  const { studio } = useSession();
  const q = useQueryParams();
  const fromLink = q.get("k") ?? undefined;
  const pass = fromLink ?? passFor(id);
  const view = useQuery<PublicView>(studio ? `pub:view:${id}` : null, () => studio!.publicView(id, pass), { staleMs: 60_000 });
  const [open, setOpen] = useState<ViewItem | null>(null);
  const [ask, setAsk] = useState<ViewItem | "general" | null>(null);

  useEffect(() => {
    if (fromLink && view.data) rememberPass([id], fromLink, Date.now() / 1000 + 3600);
  }, [fromLink, view.data, id]);
  useEffect(() => {
    if (view.data) document.title = `${view.data.title} · Private View · Veritag`;
  }, [view.data]);

  if (!studio || view.error) {
    const status = (view.error as { status?: number } | undefined)?.status;
    const locked = status === 403;
    return (
      <div className="pub">
        <PublicHeader />
        <main className="pub-wrap pub-narrow" style={{ padding: "64px 0 90px" }}>
          <Empty
            icon={locked ? <Lock /> : <Sparkles />}
            title={locked ? t("Private View riservata", "A reserved Private View") : t("Private View non disponibile", "Private View unavailable")}
            action={
              <Link className="btn btn-ghost" to="/">
                {t("Verifica un'opera", "Check an artwork")}
              </Link>
            }
          >
            {locked
              ? t("Si apre toccando con il telefono una delle opere dell'artista, dal vivo. Il tocco autentico vale come chiave per 24 ore.", "It opens when you tap one of the artist's works with your phone, in person. The authentic tap works as a key for 24 hours.")
              : view.error
                ? errText(view.error, t)
                : t("Questa funzione richiede Veritag Studio.", "This needs Veritag Studio.")}
          </Empty>
        </main>
        <PublicFooter />
      </div>
    );
  }

  const v = view.data;
  if (!v) {
    return (
      <div className="pub">
        <PublicHeader />
        <main className="pub-wrap" style={{ paddingTop: 40 }}>
          <Skeleton h={320} r={28} />
          <div className="pv-grid" style={{ marginTop: 28 }}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} h={300} r={20} />
            ))}
          </div>
        </main>
      </div>
    );
  }

  const name = v.card?.display_name ?? "";
  return (
    <div className="pub pv">
      <PublicHeader />
      <main className="pub-wrap">
        <section className="pv-hero enter">
          <ArtImage src={v.cover} seed={v.id} className="pv-hero-img" />
          <div className="pv-hero-shade" />
          <div className="pv-hero-text">
            <span className="eyebrow">
              <Sparkles size={12} /> Private View · {v.access === "tap" ? t("sbloccata dal tuo tocco", "unlocked by your tap") : t("accesso riservato", "reserved access")}
            </span>
            <h1 className="serif">{v.title}</h1>
            {v.intro && <p className="pre-line">{v.intro}</p>}
            <div className="row wrap" style={{ gap: 10, marginTop: 6 }}>
              {v.card && (
                <Link to={`/a/${v.card.artist_id}`} className="pv-artist">
                  <Avatar name={name} src={v.card.avatar} size={30} />
                  <span>{name}</span>
                  {v.card.verified && <BlueCheck />}
                </Link>
              )}
              {v.owner_name && v.owner_name !== name && <span className="faint">{t("a cura di", "curated by")} {v.owner_name}</span>}
            </div>
          </div>
        </section>

        {v.items.length === 0 ? (
          <p className="muted" style={{ margin: "40px 0" }}>
            {t("Le opere arriveranno a breve.", "Works are coming soon.")}
          </p>
        ) : (
          <div className="pv-grid">
            {v.items.map((it, i) => (
              <button key={it.id} className="pv-item enter" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }} onClick={() => setOpen(it)}>
                <ArtImage src={it.image} seed={it.title} alt={it.title} className="pv-item-img" />
                <div className="pv-item-label">
                  <b>{it.title}</b>
                  <span>{[it.year, it.medium].filter(Boolean).join(" · ")}</span>
                  <div className="row" style={{ marginTop: 8, gap: 8 }}>
                    <Price item={it} />
                    <Availability item={it} />
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="pv-cta">
          <div>
            <b>{t("Ti interessa una di queste opere?", "Interested in one of these works?")}</b>
            <span className="muted">{t("Chiedi una visita in studio o informazioni riservate.", "Ask for a studio visit or private details.")}</span>
          </div>
          <div className="row wrap">
            {v.card && studio && (
              <a className="btn btn-ghost" href={studio.vcardUrl(v.card.artist_id)}>
                <Contact /> {t("Salva contatto", "Save contact")}
              </a>
            )}
            <Button icon={<MessageCircle />} onClick={() => setAsk("general")}>
              {t("Contatta", "Get in touch")}
            </Button>
          </div>
        </div>
      </main>
      <PublicFooter />

      {open && (
        <div className="pv-detail-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setOpen(null)} role="dialog" aria-modal="true">
          <div className="pv-detail">
            <button className="btn btn-ghost btn-icon pv-detail-x" onClick={() => setOpen(null)} aria-label={t("Chiudi", "Close")}>
              <X />
            </button>
            <ArtImage src={open.image} seed={open.title} alt={open.title} className="pv-detail-img" />
            <div className="pv-detail-body">
              <button className="btn btn-quiet btn-sm" style={{ marginLeft: -10 }} onClick={() => setOpen(null)}>
                <ArrowLeft /> {v.title}
              </button>
              <h2 className="serif">{open.title}</h2>
              <dl className="facts">
                {open.year && (
                  <div>
                    <dt>{t("Anno", "Year")}</dt>
                    <dd>{open.year}</dd>
                  </div>
                )}
                {open.medium && (
                  <div>
                    <dt>{t("Tecnica", "Medium")}</dt>
                    <dd>{open.medium}</dd>
                  </div>
                )}
                {open.dimensions && (
                  <div>
                    <dt>{t("Dimensioni", "Dimensions")}</dt>
                    <dd>{open.dimensions}</dd>
                  </div>
                )}
              </dl>
              {open.description && <p className="pre-line muted">{open.description}</p>}
              <div className="row" style={{ gap: 10 }}>
                <Price item={open} big />
                <Availability item={open} />
              </div>
              <Button size="lg" block disabled={open.availability === "sold"} icon={<MessageCircle />} onClick={() => setAsk(open)}>
                {open.availability === "sold" ? t("Opera venduta", "Sold") : t("Richiedi questa opera", "Ask about this work")}
              </Button>
            </div>
          </div>
        </div>
      )}

      <LeadSheet
        open={ask !== null}
        onClose={() => setAsk(null)}
        kind={ask && ask !== "general" ? "purchase" : "info"}
        artistId={v.artist_id}
        artistName={name}
        viewId={v.id}
        itemId={ask && ask !== "general" ? ask.id : undefined}
        itemTitle={ask && ask !== "general" ? ask.title : undefined}
        vcardUrl={v.card && studio ? studio.vcardUrl(v.card.artist_id) : undefined}
      />
    </div>
  );
}

function Price({ item, big }: { item: ViewItem; big?: boolean }) {
  const { t, locale } = useI18n();
  const text = item.price_on_request || item.price == null ? t("Prezzo su richiesta", "Price on request") : money(item.price, item.currency, locale);
  return <span className={big ? "price big" : "price"}>{text}</span>;
}

function Availability({ item }: { item: ViewItem }) {
  const { t } = useI18n();
  if (item.availability === "sold") return <Badge tone="red">{t("Venduta", "Sold")}</Badge>;
  if (item.availability === "reserved") return <Badge tone="amber">{t("Riservata", "Reserved")}</Badge>;
  return <Badge tone="green">{t("Disponibile", "Available")}</Badge>;
}
