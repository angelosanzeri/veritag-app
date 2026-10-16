/** app.veritag.art — check an artwork, or step into your Studio. */
import { useState } from "react";
import { ArrowRight, Contact, Cpu, Fingerprint, KeyRound, Palette, ScanLine, Sparkles, UserCheck, Users } from "lucide-react";

import { useI18n } from "../lib/i18n.js";
import { Link, navigate } from "../lib/router.js";
import { useSession } from "../lib/session.js";
import { parseTap } from "../portal.js";
import { Button, Notice } from "../ui/index.js";
import { PublicFooter, PublicHeader } from "./shared.js";

export function Home() {
  const { t } = useI18n();
  const { session } = useSession();
  const [value, setValue] = useState("");
  const [bad, setBad] = useState(false);

  const open = () => {
    const tap = parseTap(value);
    if (!tap) {
      setBad(true);
      return;
    }
    if ("uid" in tap) navigate(`/t/${tap.uid}`);
    else navigate(`/p?${new URLSearchParams({ u: tap.u, c: String(tap.c), m: tap.m, kv: String(tap.kv) })}`);
  };

  return (
    <div className="pub home">
      <PublicHeader />
      <main>
        <section className="pub-wrap home-hero">
          <span className="eyebrow enter">ArtTrust · NFC · Phygital Art</span>
          <h1 className="serif enter" style={{ animationDelay: "40ms" }}>
            {t("L'opera si racconta", "The artwork speaks")} <em className="grad-text">{t("al tocco", "at a tap")}</em>.
          </h1>
          <p className="home-sub enter" style={{ animationDelay: "80ms" }}>
            {t(
              "Veritag è la piattaforma per curatori e artisti: passaporti certificati ArtTrust, Private View riservate e il contatto diretto con l'artista — tutto dentro il tag NFC dell'opera.",
              "Veritag is the platform for curators and artists: ArtTrust-certified passports, reserved Private Views and a direct line to the artist — all inside the artwork's NFC tag.",
            )}
          </p>

          <div className="verify-box enter" style={{ animationDelay: "120ms" }}>
            <div className="verify-ic">
              <ScanLine />
            </div>
            <input
              className="verify-input"
              placeholder={t("Incolla il link del tag o il codice dell'opera", "Paste the tag link or the artwork code")}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setBad(false);
              }}
              onKeyDown={(e) => e.key === "Enter" && open()}
              aria-label={t("Link o codice del tag", "Tag link or code")}
            />
            <Button onClick={open} disabled={!value.trim()} icon={<Fingerprint />}>
              {t("Verifica", "Verify")}
            </Button>
          </div>
          {bad && (
            <div style={{ maxWidth: 620, margin: "12px auto 0" }}>
              <Notice tone="warn">{t("Non riconosco questo link: deve venire da un tag Veritag.", "I don't recognise this link — it must come from a Veritag tag.")}</Notice>
            </div>
          )}
          <p className="home-note faint">{t("Con l'app Veritag basta avvicinare il telefono all'opera.", "With the Veritag app, just hold your phone to the artwork.")}</p>
        </section>

        <section className="pub-wrap faces">
          <Face
            icon={<Users />}
            tone="trust"
            who={t("Per curatori e hub", "For curators & hubs")}
            title={t("Il palcoscenico", "The stage")}
            points={[
              t("Concedi la spunta blu agli artisti che garantisci", "Grant the blue check to artists you vouch for"),
              t("Mostre sulla mappa e provenienza di ogni opera", "Exhibitions on the map, provenance for every work"),
              t("Private View per proporre le opere non esposte", "Private Views to offer the works not on the wall"),
              t("Lead e statistiche dei tocchi in tempo reale", "Leads and tap analytics in real time"),
            ]}
            cta={session?.kind === "curator" ? { to: "/studio", label: t("Apri lo Studio", "Open the Studio") } : { to: "/login?as=curator", label: t("Accedi come curatore", "Sign in as curator") }}
          />
          <Face
            icon={<Palette />}
            tone="violet"
            who={t("Per artisti", "For artists")}
            title={t("L'opera come portale", "The work as a portal")}
            points={[
              t("Firma le opere dal telefono, sul chip NTAG 424 DNA", "Sign works from your phone onto the NTAG 424 DNA chip"),
              t("Profilo e vCard: il tuo contatto in un tocco", "Profile & vCard: your contact in one tap"),
              t("Racconta ogni opera: storia, tecnica, audio", "Tell each work's story: technique, audio, links"),
              t("Ricevi richieste di studio visit e acquisto", "Receive studio-visit and purchase requests"),
            ]}
            cta={session?.kind === "artist" ? { to: "/studio", label: t("Apri lo Studio", "Open the Studio") } : { to: "/login?as=artist", label: t("Accedi come artista", "Sign in as artist") }}
          />
          <Face
            icon={<Sparkles />}
            tone="gold"
            who={t("Per chi visita", "For visitors")}
            title={t("Un tocco, tre regali", "One tap, three gifts")}
            points={[
              t("Il passaporto ArtTrust anticontraffazione", "The anti-counterfeit ArtTrust passport"),
              t("La Private View con le opere riservate", "The Private View with reserved works"),
              t("Il contatto dell'artista salvato in rubrica", "The artist's contact saved to your phone"),
            ]}
          />
        </section>

        <section className="pub-wrap layers">
          <div className="layers-head">
            <span className="eyebrow">ArtTrust</span>
            <h2 className="serif">{t("Tre livelli di fiducia, verificati a ogni tocco.", "Three layers of trust, checked at every tap.")}</h2>
          </div>
          <div className="layers-grid">
            <Layer icon={<Cpu />} n="01" title={t("Il chip", "The chip")} text={t("NTAG 424 DNA con chiavi AES non estraibili: ogni lettura genera un codice nuovo, impossibile da clonare.", "NTAG 424 DNA with non-extractable AES keys: each read generates a fresh, unclonable code.")} />
            <Layer icon={<KeyRound />} n="02" title={t("La firma", "The signature")} text={t("L'artista firma l'opera con una chiave privata che non lascia mai il suo telefono.", "The artist signs the work with a private key that never leaves their phone.")} />
            <Layer icon={<UserCheck />} n="03" title={t("Il curatore", "The curator")} text={t("Un curatore incontra l'artista e gli concede la spunta blu: la garanzia umana.", "A curator meets the artist and grants the blue check: the human guarantee.")} />
            <Layer icon={<Contact />} n="04" title={t("L'esperienza", "The experience")} text={t("Solo dopo la verifica si aprono storia, Private View e contatto dell'artista.", "Only after the check do the story, Private View and artist contact open.")} />
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

function Face({
  icon,
  tone,
  who,
  title,
  points,
  cta,
}: {
  icon: React.ReactNode;
  tone: "trust" | "violet" | "gold";
  who: string;
  title: string;
  points: string[];
  cta?: { to: string; label: string };
}) {
  return (
    <div className={`face face-${tone}`}>
      <span className="face-ic">{icon}</span>
      <span className="face-who">{who}</span>
      <h3 className="serif">{title}</h3>
      <ul>
        {points.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      {cta && (
        <Link to={cta.to} className="btn btn-ghost face-cta">
          {cta.label}
          <ArrowRight />
        </Link>
      )}
    </div>
  );
}

function Layer({ icon, n, title, text }: { icon: React.ReactNode; n: string; title: string; text: string }) {
  return (
    <div className="layer">
      <div className="row">
        <span className="layer-ic">{icon}</span>
        <span className="layer-n mono">{n}</span>
      </div>
      <b>{title}</b>
      <p>{text}</p>
    </div>
  );
}
