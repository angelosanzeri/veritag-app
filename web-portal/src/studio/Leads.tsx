/** Leads — studio visits, information and purchase requests from the passport and Private Views. */
import { useState } from "react";
import { Building2, CalendarClock, Download, Inbox, Mail, Phone, ShoppingBag, Info as InfoIcon } from "lucide-react";

import { useI18n } from "../lib/i18n.js";
import { setQueryData } from "../lib/query.js";
import { useSignedIn } from "../lib/session.js";
import { downloadText, errText, fmtDate, relTime } from "../lib/format.js";
import type { Lead, LeadStatus } from "../studio-api.js";
import { Avatar, Badge, Button, Empty, Seg, Skeleton, TextArea, toast } from "../ui/index.js";
import { PageHead, StudioOff, useArtists, useLeads } from "./common.js";

type Filter = "open" | "won" | "archived" | "all";

export function Leads() {
  const { t, locale } = useI18n();
  const { studio } = useSignedIn();
  const leads = useLeads();
  const artists = useArtists();
  const [filter, setFilter] = useState<Filter>("open");
  if (!studio) return <StudioOff />;

  const all = leads.data ?? [];
  const list = all.filter((l) =>
    filter === "all" ? true : filter === "open" ? l.status === "new" || l.status === "contacted" : l.status === filter,
  );
  const artistName = (id: string) => artists.data?.find((a) => a.artist_id === id)?.name ?? "";

  const exportCsv = () => {
    const cols = ["created_at", "status", "kind", "name", "company", "email", "phone", "artist", "view", "work", "message", "note"];
    const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = all.map((l) =>
      [fmtDate(l.created_at, "sv-SE"), l.status, l.kind, l.name, l.company, l.email, l.phone, artistName(l.artist_id ?? ""), l.view_title, l.item_title, l.message, l.note].map((x) => q(String(x ?? ""))).join(","),
    );
    downloadText(`veritag-leads-${new Date().toISOString().slice(0, 10)}.csv`, [cols.join(","), ...rows].join("\n"), "text/csv");
  };

  return (
    <>
      <PageHead
        title="Lead"
        sub={t("Chi ha toccato un'opera e vuole di più: una visita in studio, informazioni, un acquisto.", "Who tapped a work and wants more: a studio visit, information, a purchase.")}
        actions={
          <Button variant="ghost" icon={<Download />} disabled={all.length === 0} onClick={exportCsv}>
            CSV
          </Button>
        }
      />
      <div className="toolbar">
        <Seg<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "open", label: `${t("Aperti", "Open")} · ${all.filter((l) => l.status === "new" || l.status === "contacted").length}` },
            { value: "won", label: t("Chiusi", "Won") },
            { value: "archived", label: t("Archiviati", "Archived") },
            { value: "all", label: t("Tutti", "All") },
          ]}
        />
      </div>
      {leads.loading && !leads.data ? (
        <Skeleton h={220} r={22} />
      ) : list.length === 0 ? (
        <Empty icon={<Inbox />} title={filter === "open" ? t("Nessun lead aperto", "No open leads") : t("Niente qui", "Nothing here")}>
          {t("Le richieste arrivano dal passaporto delle opere e dalle Private View.", "Requests come from artwork passports and Private Views.")}
        </Empty>
      ) : (
        <div className="stack">
          {list.map((l) => (
            <LeadCard key={l.id} l={l} artist={artistName(l.artist_id ?? "")} locale={locale} />
          ))}
        </div>
      )}
    </>
  );
}

function LeadCard({ l, artist, locale }: { l: Lead; artist: string; locale: string }) {
  const { t } = useI18n();
  const { studio } = useSignedIn();
  const [note, setNote] = useState(l.note);
  const [busy, setBusy] = useState(false);
  const kind =
    l.kind === "studio_visit"
      ? { icon: <CalendarClock />, label: "Studio visit", tone: "violet" as const }
      : l.kind === "purchase"
        ? { icon: <ShoppingBag />, label: t("Acquisto", "Purchase"), tone: "gold" as const }
        : { icon: <InfoIcon />, label: t("Informazioni", "Information"), tone: "trust" as const };

  const update = async (status: LeadStatus) => {
    setBusy(true);
    try {
      const nl = await studio!.updateLead(l.id, status, note);
      setQueryData<Lead[]>("s:leads", (old) => (old ?? []).map((x) => (x.id === nl.id ? nl : x)));
      toast(t("Lead aggiornato", "Lead updated"));
    } catch (e) {
      toast(errText(e, t), "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className={`card lead${l.status === "new" ? " is-new" : ""}`}>
      <div className="lead-head">
        <Avatar name={l.name} size={44} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <b className="lead-name">{l.name}</b>
          <span className="muted lead-sub">
            {l.company && (
              <>
                <Building2 size={13} /> {l.company} ·{" "}
              </>
            )}
            {relTime(l.created_at, locale)}
          </span>
        </div>
        <Badge tone={kind.tone} icon={kind.icon}>
          {kind.label}
        </Badge>
      </div>
      <div className="lead-context">
        {artist && <span>{artist}</span>}
        {l.view_title && <span>Private View · {l.view_title}</span>}
        {l.item_title && <span>{t("Opera", "Work")}: {l.item_title}</span>}
      </div>
      {l.message && <p className="lead-msg pre-line">{l.message}</p>}
      <div className="row wrap" style={{ gap: 8 }}>
        <a className="chip" href={`mailto:${l.email}`}>
          <Mail /> {l.email}
        </a>
        {l.phone && (
          <a className="chip" href={`tel:${l.phone.replace(/\s+/g, "")}`}>
            <Phone /> {l.phone}
          </a>
        )}
      </div>
      <TextArea rows={2} value={note} placeholder={t("Nota interna…", "Internal note…")} onChange={(e) => setNote(e.target.value)} />
      <div className="lead-actions">
        <Seg<LeadStatus>
          value={l.status}
          onChange={update}
          options={[
            { value: "new", label: t("Nuovo", "New") },
            { value: "contacted", label: t("Contattato", "Contacted") },
            { value: "won", label: t("Chiuso", "Won") },
            { value: "archived", label: t("Archivia", "Archive") },
          ]}
        />
        {note !== l.note && (
          <Button size="sm" variant="ghost" busy={busy} onClick={() => update(l.status)}>
            {t("Salva nota", "Save note")}
          </Button>
        )}
      </div>
    </article>
  );
}
