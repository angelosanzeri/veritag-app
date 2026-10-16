/** Sidebar on desktop, top bar + bottom tab bar on phones. */
import { useState, type ReactNode } from "react";
import {
  BadgeCheck,
  ContactRound,
  Frame,
  Inbox,
  LayoutDashboard,
  LogOut,
  MapPinned,
  MoreHorizontal,
  Settings as SettingsIcon,
  Sparkles,
  Users,
} from "lucide-react";

import { useI18n } from "../lib/i18n.js";
import { Link, navigate, useLocation } from "../lib/router.js";
import { useSignedIn } from "../lib/session.js";
import { LangToggle, ThemeToggle } from "../public/shared.js";
import { Avatar, Mark, Sheet } from "../ui/index.js";
import { useCard, useLeads, usePending } from "./common.js";

interface NavItem {
  to: string;
  label: string;
  short?: string;
  icon: ReactNode;
  count?: number;
  primary?: boolean;
}

export function Shell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { session, signOut, studio } = useSignedIn();
  const { path } = useLocation();
  const pending = usePending();
  const leads = useLeads();
  const card = useCard(session.kind === "artist" ? session.id : null);
  const [more, setMore] = useState(false);
  const newLeads = (leads.data ?? []).filter((l) => l.status === "new").length;
  const curator = session.kind === "curator";

  const nav: NavItem[] = curator
    ? [
        { to: "/studio", label: t("Panoramica", "Overview"), short: t("Home", "Home"), icon: <LayoutDashboard />, primary: true },
        { to: "/studio/verifications", label: t("Verifiche", "Verifications"), icon: <BadgeCheck />, count: pending.data?.length },
        { to: "/studio/artists", label: t("Artisti", "Artists"), icon: <Users /> },
        { to: "/studio/works", label: t("Opere", "Works"), icon: <Frame />, primary: true },
        { to: "/studio/exhibitions", label: t("Mostre", "Exhibitions"), icon: <MapPinned /> },
        { to: "/studio/views", label: "Private View", icon: <Sparkles />, primary: true },
        { to: "/studio/leads", label: "Lead", icon: <Inbox />, count: newLeads, primary: true },
        { to: "/studio/settings", label: t("Impostazioni", "Settings"), icon: <SettingsIcon /> },
      ]
    : [
        { to: "/studio", label: t("Panoramica", "Overview"), short: t("Home", "Home"), icon: <LayoutDashboard />, primary: true },
        { to: "/studio/profile", label: t("Profilo e vCard", "Profile & vCard"), short: t("Profilo", "Profile"), icon: <ContactRound />, primary: true },
        { to: "/studio/works", label: t("Le mie opere", "My works"), short: t("Opere", "Works"), icon: <Frame />, primary: true },
        { to: "/studio/views", label: "Private View", icon: <Sparkles />, primary: true },
        { to: "/studio/leads", label: "Lead", icon: <Inbox />, count: newLeads },
        { to: "/studio/settings", label: t("Impostazioni", "Settings"), icon: <SettingsIcon /> },
      ];
  const isOn = (to: string) => (to === "/studio" ? path === "/studio" : path === to || path.startsWith(`${to}/`));
  const primary = nav.filter((n) => n.primary);
  const secondary = nav.filter((n) => !n.primary);
  const secondaryCount = secondary.reduce((s, n) => s + (n.count ?? 0), 0);

  return (
    <div className="studio has-tabbar">
      <aside className="side">
        <Link to="/studio" className="side-brand">
          <Mark size={30} />
        </Link>
        <div className="side-who">
          <Avatar name={session.name} src={card.data?.avatar} size={38} />
          <div>
            <b>{session.name}</b>
            <span>{curator ? t("Curatore", "Curator") : t("Artista", "Artist")}</span>
          </div>
        </div>
        <nav className="side-nav">
          {nav.map((n) => (
            <Link key={n.to} to={n.to} className={`side-item${isOn(n.to) ? " on" : ""}`}>
              {n.icon}
              <span>{n.label}</span>
              {!!n.count && <span className="count">{n.count}</span>}
            </Link>
          ))}
        </nav>
        <div className="spacer" />
        {!studio && <div className="side-note">{t("Studio non collegato: alcune funzioni sono spente.", "Studio not connected: some features are off.")}</div>}
        <div className="side-foot">
          <LangToggle />
          <ThemeToggle />
          <div className="spacer" />
          <button className="btn btn-quiet btn-sm" onClick={signOut} title={t("Esci", "Sign out")}>
            <LogOut />
          </button>
        </div>
      </aside>

      <header className="topbar">
        <Link to="/studio">
          <Mark size={28} />
        </Link>
        <div className="spacer" />
        <ThemeToggle />
        <Link to="/studio/settings" aria-label={t("Impostazioni", "Settings")}>
          <Avatar name={session.name} src={card.data?.avatar} size={32} />
        </Link>
      </header>

      <main className="studio-main">
        <div className="studio-content">{children}</div>
      </main>

      <nav className="tabbar">
        {primary.map((n) => (
          <Link key={n.to} to={n.to} className={`tab${isOn(n.to) ? " on" : ""}`}>
            <span className="tab-ic">
              {n.icon}
              {!!n.count && <span className="tab-dot">{n.count}</span>}
            </span>
            <span>{n.short ?? n.label}</span>
          </Link>
        ))}
        <button className={`tab${secondary.some((n) => isOn(n.to)) ? " on" : ""}`} onClick={() => setMore(true)}>
          <span className="tab-ic">
            <MoreHorizontal />
            {!!secondaryCount && <span className="tab-dot">{secondaryCount}</span>}
          </span>
          <span>{t("Altro", "More")}</span>
        </button>
      </nav>

      <Sheet open={more} onClose={() => setMore(false)} title={session.name} sub={curator ? t("Curatore", "Curator") : t("Artista", "Artist")}>
        <div className="list">
          {secondary.map((n) => (
            <button
              key={n.to}
              className="list-row"
              onClick={() => {
                setMore(false);
                navigate(n.to);
              }}
            >
              <span className="more-ic">{n.icon}</span>
              <div className="lr-main">
                <b>{n.label}</b>
              </div>
              {!!n.count && <span className="count">{n.count}</span>}
            </button>
          ))}
          <button
            className="list-row"
            onClick={() => {
              setMore(false);
              signOut();
            }}
          >
            <span className="more-ic">
              <LogOut />
            </span>
            <div className="lr-main">
              <b>{t("Esci", "Sign out")}</b>
            </div>
          </button>
        </div>
      </Sheet>
    </div>
  );
}
