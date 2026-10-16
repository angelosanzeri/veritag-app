/** Studio-wide hooks and small pieces, role-aware (curator / artist). */
import type { ReactNode } from "react";
import { PlugZap } from "lucide-react";

import { useI18n } from "../lib/i18n.js";
import { useQuery } from "../lib/query.js";
import { useSignedIn } from "../lib/session.js";
import type { Artist, CatalogueEntry, VerificationReq } from "../portal.js";
import type { Card, Lead, PrivateView } from "../studio-api.js";
import { Empty } from "../ui/index.js";

export function PageHead({ title, sub, actions, back }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="page-head">
      {back && <div className="page-back">{back}</div>}
      <div className="page-head-row">
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1>{title}</h1>
          {sub && <p>{sub}</p>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
    </div>
  );
}

export function StudioOff() {
  const { t } = useI18n();
  return (
    <Empty icon={<PlugZap />} title={t("Veritag Studio non è collegato", "Veritag Studio isn't connected")}>
      {t(
        "Questa sezione vive su Veritag Studio (Private View, profili e vCard, lead, statistiche). Collega l'endpoint in Impostazioni o chiedi all'amministratore di attivarlo.",
        "This section lives on Veritag Studio (Private Views, profiles & vCards, leads, insights). Set its endpoint in Settings or ask your administrator to enable it.",
      )}
    </Empty>
  );
}

/** The artists this session acts for: a curator's roster, or the artist herself. */
export function useArtists() {
  const { session, core } = useSignedIn();
  return useQuery<Artist[]>("s:artists", async () => (session.kind === "curator" ? core.roster(session.id) : [await core.artist(session.id)]));
}

/** The works this session can see — catalogue across the roster, or one's own. */
export function useWorks() {
  const { session, core } = useSignedIn();
  return useQuery<CatalogueEntry[]>("s:works", async () => {
    if (session.kind === "curator") return core.catalogue(session.id);
    const [artist, works] = await Promise.all([core.artist(session.id), core.artistArtworks(session.id)]);
    return works.map((artwork) => ({ artwork, artist_id: artist.artist_id, artist_name: artist.name, artist_verified: artist.verified }));
  });
}

export function usePending() {
  const { session, core } = useSignedIn();
  return useQuery<VerificationReq[]>(session.kind === "curator" ? "s:pending" : null, () => core.incoming(session.id, "pending"), { refreshMs: 8000, staleMs: 5000 });
}

export function useCard(artistId: string | null) {
  const { studio } = useSignedIn();
  return useQuery<Card>(studio && artistId ? `s:card:${artistId}` : null, () => studio!.card(artistId!), { staleMs: 60_000 });
}

export function useViews() {
  const { studio } = useSignedIn();
  return useQuery<PrivateView[]>(studio ? "s:views" : null, () => studio!.views());
}

export function useLeads() {
  const { studio } = useSignedIn();
  return useQuery<Lead[]>(studio ? "s:leads" : null, () => studio!.leads(), { refreshMs: 30_000 });
}
