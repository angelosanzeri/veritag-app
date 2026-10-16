/**
 * A tiny History-API router: one external store for the location, a matcher,
 * and a <Link> that animates with the View Transitions API where available.
 * Everything Veritag needs, none of a router dependency's weight.
 */
import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from "react";
import { flushSync } from "react-dom";

type Listener = () => void;
const listeners = new Set<Listener>();
let snapshot = read();

function read() {
  return { path: decodeURI(location.pathname).replace(/\/+$/, "") || "/", search: location.search };
}

function emit() {
  snapshot = read();
  listeners.forEach((l) => l());
}

window.addEventListener("popstate", emit);

function subscribe(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useLocation() {
  const loc = useSyncExternalStore(subscribe, () => snapshot);
  return loc;
}

export function useQueryParams(): URLSearchParams {
  const { search } = useLocation();
  return new URLSearchParams(search);
}

const reduceMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function navigate(to: string, opts: { replace?: boolean; keepScroll?: boolean } = {}) {
  const go = () => {
    if (opts.replace) history.replaceState(null, "", to);
    else history.pushState(null, "", to);
    emit();
    if (!opts.keepScroll) window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  };
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (doc.startViewTransition && !reduceMotion() && !opts.replace) {
    doc.startViewTransition(() => flushSync(go));
  } else {
    go();
  }
}

/** Match `/studio/artists/:id` against a path; returns params or null. */
export function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split("/").filter(Boolean);
  const s = path.split("/").filter(Boolean);
  if (p.length !== s.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(":")) params[p[i].slice(1)] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return params;
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; replace?: boolean };

export function Link({ to, replace, onClick, ...rest }: LinkProps) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (rest.target && rest.target !== "_self") return;
    e.preventDefault();
    navigate(to, { replace });
  };
  return <a href={to} onClick={handle} {...rest} />;
}
