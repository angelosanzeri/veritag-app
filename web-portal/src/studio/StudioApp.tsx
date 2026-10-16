/** The signed-in Studio: guard, shell, and the routes inside it. */
import { lazy, Suspense, useEffect } from "react";
import { RefreshCcw, WifiOff } from "lucide-react";

import { useI18n } from "../lib/i18n.js";
import { match, navigate, useLocation } from "../lib/router.js";
import { useSession } from "../lib/session.js";
import { PageLoader } from "../public/shared.js";
import { Button, Empty, Skeleton } from "../ui/index.js";
import { Shell } from "./Shell.js";
import "../styles/studio.css";

const Overview = lazy(() => import("./Overview.js").then((m) => ({ default: m.Overview })));
const Verifications = lazy(() => import("./Verifications.js").then((m) => ({ default: m.Verifications })));
const ArtistsList = lazy(() => import("./Artists.js").then((m) => ({ default: m.ArtistsList })));
const ArtistDetail = lazy(() => import("./Artists.js").then((m) => ({ default: m.ArtistDetail })));
const MyProfile = lazy(() => import("./Artists.js").then((m) => ({ default: m.MyProfile })));
const WorksList = lazy(() => import("./Works.js").then((m) => ({ default: m.WorksList })));
const WorkDetail = lazy(() => import("./Works.js").then((m) => ({ default: m.WorkDetail })));
const Exhibitions = lazy(() => import("./Exhibitions.js").then((m) => ({ default: m.Exhibitions })));
const ViewsList = lazy(() => import("./Views.js").then((m) => ({ default: m.ViewsList })));
const ViewEditor = lazy(() => import("./Views.js").then((m) => ({ default: m.ViewEditor })));
const Leads = lazy(() => import("./Leads.js").then((m) => ({ default: m.Leads })));
const Settings = lazy(() => import("./Settings.js").then((m) => ({ default: m.Settings })));

function Page() {
  const { path } = useLocation();
  const { session } = useSession();
  const curator = session?.kind === "curator";
  let m: Record<string, string> | null;
  const sub = path.replace(/^\/studio/, "") || "/";
  if (sub === "/") return <Overview />;
  if (sub === "/verifications" && curator) return <Verifications />;
  if (sub === "/artists" && curator) return <ArtistsList />;
  if ((m = match("/artists/:id", sub)) && curator) return <ArtistDetail id={m.id} />;
  if (sub === "/profile" && !curator) return <MyProfile />;
  if (sub === "/works") return <WorksList />;
  if ((m = match("/works/:uid", sub))) return <WorkDetail uid={m.uid} />;
  if (sub.startsWith("/exhibitions") && curator) return <Exhibitions sub={sub} />;
  if (sub === "/views") return <ViewsList />;
  if ((m = match("/views/:id", sub))) return <ViewEditor id={m.id} />;
  if (sub === "/leads") return <Leads />;
  if (sub === "/settings") return <Settings />;
  return <Overview />;
}

export function StudioApp() {
  const { session, restoring, stranded, retry } = useSession();
  const { t } = useI18n();

  useEffect(() => {
    if (!restoring && !session && !stranded) navigate("/login", { replace: true });
  }, [restoring, session, stranded]);

  if (stranded) {
    return (
      <div className="pub" style={{ display: "grid", placeItems: "center", padding: 24 }}>
        <Empty icon={<WifiOff />} title={t("Non riesco a raggiungere Veritag", "Can't reach Veritag")} action={<Button icon={<RefreshCcw />} onClick={retry}>{t("Riprova", "Try again")}</Button>}>
          {t("Controlla la connessione: la tua sessione è al sicuro.", "Check your connection — your session is safe.")}
        </Empty>
      </div>
    );
  }
  if (!session) return <PageLoader />;
  return (
    <Shell>
      <Suspense
        fallback={
          <div className="stack">
            <Skeleton h={34} w="40%" />
            <Skeleton h={18} w="60%" />
            <Skeleton h={240} r={22} style={{ marginTop: 12 }} />
          </div>
        }
      >
        <Page />
      </Suspense>
    </Shell>
  );
}
