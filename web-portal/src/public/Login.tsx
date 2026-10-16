/** Sign in — curators with their Veritag account, artists with their Studio account. */
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Palette, Settings2, Users } from "lucide-react";

import { useI18n } from "../lib/i18n.js";
import { Link, navigate, useQueryParams } from "../lib/router.js";
import { useSession } from "../lib/session.js";
import { errText } from "../lib/format.js";
import { StudioApi } from "../studio-api.js";
import { Button, Input, Mark, Notice, Seg } from "../ui/index.js";
import { LangToggle, ThemeToggle } from "./shared.js";

type As = "curator" | "artist";

export function AuthLayout({ children, aside }: { children: React.ReactNode; aside: React.ReactNode }) {
  return (
    <div className="auth">
      <aside className="auth-aside">
        <div className="auth-aside-in">
          <Link to="/">
            <Mark size={36} />
          </Link>
          {aside}
        </div>
      </aside>
      <main className="auth-main">
        <div className="auth-top">
          <Link to="/" className="auth-mobile-mark">
            <Mark size={28} />
          </Link>
          <div className="spacer" />
          <LangToggle />
          <ThemeToggle />
        </div>
        <div className="auth-card enter">{children}</div>
      </main>
    </div>
  );
}

export function Login() {
  const { t } = useI18n();
  const { session, signInCurator, registerCurator, signInArtist, studio, coreBase, studioBase, setBases } = useSession();
  const q = useQueryParams();
  const [as, setAs] = useState<As>(q.get("as") === "artist" ? "artist" : "curator");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [adv, setAdv] = useState(false);
  const [bases, setLocalBases] = useState({ core: coreBase, studio: studioBase });

  useEffect(() => {
    if (session) navigate("/studio", { replace: true });
  }, [session]);

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      if (as === "artist") await signInArtist(username, password);
      else if (mode === "in") await signInCurator(username, password);
      else await registerCurator(username, name, password);
      navigate("/studio");
    } catch (e) {
      setError(errText(e, t));
    } finally {
      setBusy(false);
    }
  };
  const can = username.trim() && password && !(as === "curator" && mode === "up" && password.length < 6);

  return (
    <AuthLayout
      aside={
        <>
          <h1 className="serif auth-title">
            {t("Autenticità,", "Authenticity,")}
            <br />
            <em className="grad-text">{t("firmata", "signed")}</em> {t("e raccontata.", "and told.")}
          </h1>
          <p className="auth-lead">
            {t(
              "Uno Studio per chi garantisce e per chi crea: passaporti ArtTrust, mostre, Private View, contatti e lead — in un solo posto.",
              "One Studio for those who vouch and those who create: ArtTrust passports, exhibitions, Private Views, contacts and leads — in one place.",
            )}
          </p>
          <div className="auth-points">
            <div>
              <Users />
              <span>
                <b>{t("Curatori e hub", "Curators & hubs")}</b> — {t("spunta blu, mostre, Private View, lead.", "blue checks, exhibitions, Private Views, leads.")}
              </span>
            </div>
            <div>
              <Palette />
              <span>
                <b>{t("Artisti", "Artists")}</b> — {t("profilo e vCard, storie delle opere, richieste dirette.", "profile & vCard, artwork stories, direct requests.")}
              </span>
            </div>
          </div>
        </>
      }
    >
      <h2>{as === "curator" && mode === "up" ? t("Crea il tuo spazio", "Create your space") : t("Bentornato", "Welcome back")}</h2>
      <p className="muted">{as === "curator" ? t("Accedi con il tuo account curatore Veritag.", "Sign in with your Veritag curator account.") : t("Accedi con l'account creato dal tuo invito.", "Sign in with the account you created from your invite.")}</p>

      <Seg<As>
        block
        value={as}
        onChange={(v) => {
          setAs(v);
          setError("");
        }}
        options={[
          { value: "curator", label: t("Curatore", "Curator"), icon: <Users /> },
          { value: "artist", label: t("Artista", "Artist"), icon: <Palette /> },
        ]}
      />

      <form
        className="stack"
        style={{ marginTop: 18 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (can) submit();
        }}
      >
        <Input label={t("Nome utente", "Username")} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" placeholder={as === "curator" ? "galleria" : "giulia"} />
        {as === "curator" && mode === "up" && <Input label={t("Nome pubblico", "Display name")} value={name} onChange={(e) => setName(e.target.value)} placeholder="Galleria del Sole" />}
        <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "in" ? "current-password" : "new-password"} placeholder="••••••••" />
        {error && <Notice tone="error">{error}</Notice>}
        {as === "artist" && !studio && <Notice tone="warn">{t("L'accesso artisti richiede Veritag Studio, non collegato a questa installazione.", "Artist sign-in needs Veritag Studio, which this installation isn't connected to.")}</Notice>}
        <Button type="submit" size="lg" block busy={busy} disabled={!can || (as === "artist" && !studio)}>
          {as === "curator" && mode === "up" ? t("Crea account", "Create account") : t("Accedi", "Sign in")}
          <ArrowRight />
        </Button>
      </form>

      <div className="auth-alt">
        {as === "curator" ? (
          <button className="link" onClick={() => setMode(mode === "in" ? "up" : "in")}>
            {mode === "in" ? t("Nuovo curatore? Registrati", "New curator? Register") : t("Hai già un account? Accedi", "Already registered? Sign in")}
          </button>
        ) : (
          <Link className="link" to="/join">
            {t("Hai un codice d'invito? Attiva il tuo Studio", "Have an invite code? Activate your Studio")}
          </Link>
        )}
      </div>

      <div className="auth-adv">
        <button className="btn btn-quiet btn-sm" onClick={() => setAdv((v) => !v)}>
          <Settings2 /> {t("Endpoint avanzati", "Advanced endpoints")}
        </button>
        {adv && (
          <div className="stack" style={{ marginTop: 10 }}>
            <Input label="Veritag core API" value={bases.core} onChange={(e) => setLocalBases({ ...bases, core: e.target.value })} />
            <Input label="Veritag Studio API" value={bases.studio} placeholder={t("vuoto = disattivato", "empty = disabled")} onChange={(e) => setLocalBases({ ...bases, studio: e.target.value })} />
            <Button variant="ghost" size="sm" onClick={() => setBases(bases.core, bases.studio)}>
              {t("Applica", "Apply")}
            </Button>
          </div>
        )}
      </div>
    </AuthLayout>
  );
}

export function Join() {
  const { t } = useI18n();
  const { studio, studioBase, joinArtist, session } = useSession();
  // an anonymous reader: signing in mid-flow must not re-read the (now used) invite
  const reader = useMemo(() => (studioBase ? new StudioApi(studioBase) : null), [studioBase]);
  const q = useQueryParams();
  const [code, setCode] = useState((q.get("code") ?? "").toUpperCase());
  const [invite, setInvite] = useState<{ artist_name: string; curator_name: string } | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setInvite(null);
    const clean = code.trim();
    if (!reader || clean.length < 9) return;
    let alive = true;
    reader
      .readInvite(clean)
      .then((inv) => alive && (setInvite(inv), setError("")))
      .catch((e) => alive && setError(errText(e, t)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, reader]);

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await joinArtist(code, username, password);
      navigate("/studio");
    } catch (e) {
      setError(errText(e, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      aside={
        <>
          <h1 className="serif auth-title">
            {t("Il tuo Studio", "Your Studio")}
            <br />
            <em className="grad-text">{t("ti aspetta", "awaits")}</em>.
          </h1>
          <p className="auth-lead">
            {t(
              "Un curatore ti ha garantito su Veritag. Attiva l'account per curare il tuo profilo, la tua vCard, le storie delle opere e le tue Private View.",
              "A curator has vouched for you on Veritag. Activate your account to manage your profile, your vCard, your works' stories and your Private Views.",
            )}
          </p>
        </>
      }
    >
      <h2>{invite ? t(`Ciao ${invite.artist_name}`, `Hi ${invite.artist_name}`) : t("Attiva il tuo Studio", "Activate your Studio")}</h2>
      <p className="muted">
        {invite
          ? t(`${invite.curator_name} ti ha invitato. Scegli le credenziali per accedere.`, `${invite.curator_name} invited you. Choose your sign-in details.`)
          : t("Inserisci il codice che ti ha dato il tuo curatore.", "Enter the code your curator gave you.")}
      </p>
      {session && <Notice tone="info">{t("Sei già connesso: attivando l'invito cambierai account.", "You're signed in: activating the invite switches account.")}</Notice>}
      <form
        className="stack"
        style={{ marginTop: 18 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (invite && username.length >= 3 && password.length >= 8) submit();
        }}
      >
        <Input label={t("Codice d'invito", "Invite code")} className="mono" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABCD-EFGH" autoCapitalize="characters" maxLength={9} />
        {invite && (
          <>
            <Input label={t("Nome utente", "Username")} value={username} onChange={(e) => setUsername(e.target.value.replace(/[^A-Za-z0-9._-]/g, ""))} autoComplete="username" autoCapitalize="none" hint={t("Lettere, numeri, punto, trattino.", "Letters, digits, dot, dash.")} />
            <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" hint={t("Almeno 8 caratteri.", "At least 8 characters.")} />
          </>
        )}
        {error && <Notice tone="error">{error}</Notice>}
        {!studio && <Notice tone="warn">{t("Veritag Studio non è collegato a questa installazione.", "Veritag Studio isn't connected to this installation.")}</Notice>}
        <Button type="submit" size="lg" block busy={busy} disabled={!invite || username.length < 3 || password.length < 8}>
          {t("Attiva e entra", "Activate and enter")}
          <ArrowRight />
        </Button>
      </form>
      <div className="auth-alt">
        <Link className="link" to="/login?as=artist">
          {t("Hai già un account? Accedi", "Already have an account? Sign in")}
        </Link>
      </div>
    </AuthLayout>
  );
}
