/**
 * Veritag — one app, three faces:
 *   visitors  · the ArtTrust passport, artist pages, Private Views   (public)
 *   curators  · the Studio: blue checks, roster, works, shows, Private Views, leads
 *   artists   · the Studio: profile & vCard, works' stories, Private Views, leads
 * Routes are code-split so a visitor's tap loads only the passport.
 */
import { lazy, Suspense } from "react";

import { I18nProvider, useI18n } from "./lib/i18n.js";
import { match, useLocation } from "./lib/router.js";
import { SessionProvider } from "./lib/session.js";
import { PageLoader } from "./public/shared.js";
import { ErrorBoundary } from "./ui/ErrorBoundary.js";
import { Toaster } from "./ui/index.js";

const Home = lazy(() => import("./public/Home.js").then((m) => ({ default: m.Home })));
const PassportPage = lazy(() => import("./public/PassportPage.js").then((m) => ({ default: m.PassportPage })));
const ArtistPage = lazy(() => import("./public/ArtistPage.js").then((m) => ({ default: m.ArtistPage })));
const PrivateViewPage = lazy(() => import("./public/PrivateViewPage.js").then((m) => ({ default: m.PrivateViewPage })));
const Login = lazy(() => import("./public/Login.js").then((m) => ({ default: m.Login })));
const Join = lazy(() => import("./public/Login.js").then((m) => ({ default: m.Join })));
const NotFound = lazy(() => import("./public/NotFound.js").then((m) => ({ default: m.NotFound })));
const StudioApp = lazy(() => import("./studio/StudioApp.js").then((m) => ({ default: m.StudioApp })));

function Routes() {
  const { path } = useLocation();
  let m: Record<string, string> | null;
  if (path === "/") return <Home />;
  if (path === "/login") return <Login />;
  if (path === "/join") return <Join />;
  // tag shapes: /p?u&c&m (live SDM tap), plus the legacy /verify and /passport aliases
  if (path === "/p" || path === "/verify" || path === "/passport") return <PassportPage />;
  if ((m = match("/t/:uid", path))) return <PassportPage uid={m.uid} />;
  if ((m = match("/a/:id", path))) return <ArtistPage id={m.id} />;
  if ((m = match("/v/:id", path))) return <PrivateViewPage id={m.id} />;
  if (path === "/studio" || path.startsWith("/studio/")) return <StudioApp />;
  return <NotFound />;
}

function Guarded() {
  const { lang } = useI18n();
  const { path } = useLocation();
  return (
    <ErrorBoundary lang={lang} resetKey={path}>
      <Suspense fallback={<PageLoader />}>
        <Routes />
      </Suspense>
    </ErrorBoundary>
  );
}

export function App() {
  return (
    <I18nProvider>
      <SessionProvider>
        <Guarded />
        <Toaster />
      </SessionProvider>
    </I18nProvider>
  );
}
