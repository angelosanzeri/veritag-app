/** Account, language, theme and the service endpoints. */
import { useEffect, useState } from "react";
import { CircleCheck, CircleX, Globe, LogOut, Moon, Plug, Smartphone, Sun, SunMoon } from "lucide-react";

import { useI18n, type Lang } from "../lib/i18n.js";
import { useSignedIn } from "../lib/session.js";
import { useTheme, type ThemePref } from "../lib/theme.js";
import { VeritagApi } from "../portal.js";
import { StudioApi } from "../studio-api.js";
import { Avatar, Badge, Button, Input, Seg } from "../ui/index.js";
import { PageHead } from "./common.js";

export function Settings() {
  const { t, lang, setLang } = useI18n();
  const { session, signOut, coreBase, studioBase, setBases } = useSignedIn();
  const [theme, setTheme] = useTheme();
  const [core, setCore] = useState(coreBase);
  const [studio, setStudio] = useState(studioBase);
  const [health, setHealth] = useState<{ core: boolean | null; studio: boolean | null }>({ core: null, studio: null });

  useEffect(() => {
    let alive = true;
    setHealth({ core: null, studio: null });
    new VeritagApi(coreBase)
      .health()
      .then(() => alive && setHealth((h) => ({ ...h, core: true })))
      .catch(() => alive && setHealth((h) => ({ ...h, core: false })));
    if (studioBase)
      new StudioApi(studioBase)
        .meta()
        .then(() => alive && setHealth((h) => ({ ...h, studio: true })))
        .catch(() => alive && setHealth((h) => ({ ...h, studio: false })));
    return () => {
      alive = false;
    };
  }, [coreBase, studioBase]);

  const dot = (ok: boolean | null) =>
    ok === null ? <Badge>…</Badge> : ok ? <Badge tone="green" icon={<CircleCheck />}>{t("Online", "Online")}</Badge> : <Badge tone="red" icon={<CircleX />}>{t("Non raggiungibile", "Unreachable")}</Badge>;

  return (
    <>
      <PageHead title={t("Impostazioni", "Settings")} />
      <div className="settings">
        <section className="card">
          <div className="row" style={{ gap: 14 }}>
            <Avatar name={session.name} size={54} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ fontSize: "1.1rem" }}>{session.name}</b>
              <div className="muted" style={{ fontSize: "0.86rem" }}>
                {session.kind === "curator" ? t("Curatore", "Curator") : t("Artista", "Artist")} · <span className="mono">{session.id}</span>
              </div>
            </div>
            <Button variant="ghost" icon={<LogOut />} onClick={signOut}>
              {t("Esci", "Sign out")}
            </Button>
          </div>
        </section>

        <section className="card stack">
          <div className="card-head" style={{ marginBottom: 0 }}>
            <div>
              <h3>{t("Aspetto", "Appearance")}</h3>
            </div>
          </div>
          <div className="field">
            <label>{t("Lingua", "Language")}</label>
            <Seg<Lang> value={lang} onChange={setLang} options={[{ value: "it", label: "Italiano", icon: <Globe /> }, { value: "en", label: "English", icon: <Globe /> }]} />
          </div>
          <div className="field">
            <label>{t("Tema", "Theme")}</label>
            <Seg<ThemePref>
              value={theme}
              onChange={setTheme}
              options={[
                { value: "system", label: t("Sistema", "System"), icon: <SunMoon /> },
                { value: "dark", label: t("Scuro", "Dark"), icon: <Moon /> },
                { value: "light", label: t("Chiaro", "Light"), icon: <Sun /> },
              ]}
            />
          </div>
        </section>

        <section className="card stack">
          <div className="card-head" style={{ marginBottom: 0 }}>
            <div>
              <h3 className="row" style={{ gap: 8 }}>
                <Plug size={17} /> {t("Servizi", "Services")}
              </h3>
              <p>{t("Veritag core verifica chip, firme e spunte blu. Veritag Studio aggiunge profili, Private View, lead e statistiche.", "Veritag core verifies chips, signatures and blue checks. Veritag Studio adds profiles, Private Views, leads and insights.")}</p>
            </div>
          </div>
          <div className="row" style={{ alignItems: "flex-end", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <Input label="Veritag core API" value={core} onChange={(e) => setCore(e.target.value)} />
            </div>
            {dot(health.core)}
          </div>
          <div className="row" style={{ alignItems: "flex-end", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <Input label="Veritag Studio API" value={studio} placeholder={t("vuoto = disattivato", "empty = disabled")} onChange={(e) => setStudio(e.target.value)} />
            </div>
            {studioBase ? dot(health.studio) : <Badge>{t("Spento", "Off")}</Badge>}
          </div>
          <div>
            <Button variant="ghost" disabled={core === coreBase && studio === studioBase} onClick={() => setBases(core, studio)}>
              {t("Applica", "Apply")}
            </Button>
          </div>
        </section>

        <section className="card">
          <div className="row" style={{ gap: 14 }}>
            <span className="kpi-ic" style={{ width: 42, height: 42, borderRadius: 12, display: "grid", placeItems: "center", background: "var(--violet-soft)", color: "var(--violet)" }}>
              <Smartphone size={20} />
            </span>
            <div style={{ flex: 1 }}>
              <b>{t("App Veritag per Android", "Veritag app for Android")}</b>
              <div className="muted" style={{ fontSize: "0.86rem" }}>
                {t("Firma le opere sul chip, chiedi la spunta blu, verifica con un tocco.", "Sign works onto the chip, ask for the blue check, verify with a tap.")}
              </div>
            </div>
            <a className="btn btn-ghost" href="https://github.com/angesanze/veritag-app/releases/latest/download/app-release.apk">
              {t("Scarica", "Download")}
            </a>
          </div>
        </section>
      </div>
    </>
  );
}
