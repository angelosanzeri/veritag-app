/** The blue check: an artist reads you a code in person; a match vouches for them. */
import { useState } from "react";
import { BadgeCheck, Clock, X } from "lucide-react";

import { useI18n } from "../lib/i18n.js";
import { invalidate } from "../lib/query.js";
import { useSignedIn } from "../lib/session.js";
import { errText, relTime } from "../lib/format.js";
import type { VerificationReq } from "../portal.js";
import { Avatar, Button, Empty, Notice, OtpInput, Skeleton, toast } from "../ui/index.js";
import { PageHead, usePending } from "./common.js";

export function Verifications() {
  const { t } = useI18n();
  const pending = usePending();
  return (
    <>
      <PageHead
        title={t("Verifiche", "Verifications")}
        sub={t(
          "Un artista chiede la tua garanzia dall'app. Incontralo, fatti leggere il codice di 6 cifre e inseriscilo: la corrispondenza concede la spunta blu a tutte le sue opere.",
          "An artist asks for your guarantee from the app. Meet them, have them read you the 6-digit code and enter it: a match grants the blue check to all their works.",
        )}
      />
      {pending.loading && !pending.data ? (
        <Skeleton h={140} r={22} />
      ) : (pending.data ?? []).length === 0 ? (
        <Empty icon={<BadgeCheck />} title={t("Nessuna richiesta in attesa", "No pending requests")}>
          {t("Gli artisti inviano le richieste dall'app Veritag, scegliendoti tra i curatori.", "Artists send requests from the Veritag app, picking you among the curators.")}
        </Empty>
      ) : (
        <div className="stack">
          {pending.data!.map((r) => (
            <RequestCard key={r.request_id} r={r} />
          ))}
        </div>
      )}
    </>
  );
}

function RequestCard({ r }: { r: VerificationReq }) {
  const { t, locale } = useI18n();
  const { core } = useSignedIn();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"" | "ok" | "no">("");
  const [error, setError] = useState("");
  const name = r.artist_name ?? r.artist_id;

  const confirm = async (value = code) => {
    setBusy("ok");
    setError("");
    try {
      await core.confirm(r.request_id, value);
      toast(t(`${name} ora ha la spunta blu`, `${name} now has the blue check`));
      invalidate("s:");
    } catch (e) {
      setError((e as { status?: number }).status === 400 ? t("Il codice non corrisponde. Fattelo rileggere.", "The code doesn't match. Ask them to read it again.") : errText(e, t));
      setCode("");
    } finally {
      setBusy("");
    }
  };
  const reject = async () => {
    setBusy("no");
    try {
      await core.reject(r.request_id);
      invalidate("s:pending");
    } catch (e) {
      toast(errText(e, t), "err");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="card req-card">
      <div className="req-who">
        <Avatar name={name} size={48} />
        <div>
          <b>{name}</b>
          <span className="row" style={{ gap: 5 }}>
            <Clock size={13} /> {t("scade", "expires")} {relTime(r.expires_at, locale)}
          </span>
        </div>
      </div>
      <div className="req-code">
        <label className="label">{t("Codice letto dall'artista", "Code read by the artist")}</label>
        <OtpInput value={code} onChange={setCode} onComplete={(v) => confirm(v)} />
      </div>
      <div className="req-actions">
        <Button busy={busy === "ok"} disabled={code.length < 6} icon={<BadgeCheck />} onClick={() => confirm()}>
          {t("Concedi la spunta", "Grant the check")}
        </Button>
        <Button variant="quiet" busy={busy === "no"} icon={<X />} onClick={reject}>
          {t("Rifiuta", "Decline")}
        </Button>
      </div>
      {error && (
        <div style={{ gridColumn: "1 / -1" }}>
          <Notice tone="error">{error}</Notice>
        </div>
      )}
    </div>
  );
}
