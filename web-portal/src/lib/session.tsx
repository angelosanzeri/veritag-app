/**
 * Who is signed in, and the API clients that carry their credentials.
 *
 * Curators sign in with their veritag-core account; that same bearer opens
 * Studio. Artists sign in to Studio with the account they created from a
 * curator's invite. Visitors need neither.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { VeritagApi } from "../portal.js";
import { StudioApi } from "../studio-api.js";
import { clearQueries } from "./query.js";

export type Role = "curator" | "artist";
export interface Session {
  kind: Role;
  id: string;
  name: string;
}

const K = {
  coreBase: "veritag.base",
  studioBase: "veritag.studio.base",
  coreToken: "veritag.token",
  studioToken: "veritag.studio.token",
};

const env = import.meta.env as Record<string, string | boolean | undefined>;
// Baked at build time (Vite): cloud builds point at the deployed services.
export const DEFAULT_CORE = (env.VITE_API_BASE as string | undefined) || (env.DEV ? "http://localhost:8090" : "https://api.veritag.art");
export const DEFAULT_STUDIO = (env.VITE_STUDIO_BASE as string | undefined) ?? (env.DEV ? "http://localhost:8091" : "");

const ls = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string | null) => {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
};

const trimBase = (s: string) => s.trim().replace(/\/+$/, "");

interface Ctx {
  session: Session | null;
  restoring: boolean;
  core: VeritagApi;
  studio: StudioApi | null;
  coreBase: string;
  studioBase: string;
  setBases: (core: string, studio: string) => void;
  signInCurator: (username: string, password: string) => Promise<void>;
  registerCurator: (username: string, name: string, password: string) => Promise<void>;
  signInArtist: (username: string, password: string) => Promise<void>;
  joinArtist: (code: string, username: string, password: string) => Promise<void>;
  signOut: () => void;
  /** Signed-in token present but the session could not be restored (offline). */
  stranded: boolean;
  retry: () => void;
}

const SessionCtx = createContext<Ctx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [coreBase, setCoreBase] = useState(() => ls.get(K.coreBase) || DEFAULT_CORE);
  const [studioBase, setStudioBase] = useState(() => ls.get(K.studioBase) ?? DEFAULT_STUDIO);
  const [coreToken, setCoreToken] = useState(() => ls.get(K.coreToken));
  const [studioToken, setStudioToken] = useState(() => ls.get(K.studioToken));
  const [session, setSession] = useState<Session | null>(null);
  const [restoring, setRestoring] = useState(() => !!(ls.get(K.coreToken) || ls.get(K.studioToken)));
  const [attempt, setAttempt] = useState(0);
  const adopted = useRef(false); // a fresh sign-in already knows who it is — skip the restore

  // A curator's core token doubles as their Studio bearer.
  const bearer = studioToken ?? coreToken ?? undefined;
  const core = useMemo(() => new VeritagApi(coreBase, coreToken ?? undefined), [coreBase, coreToken]);
  const studio = useMemo(() => (studioBase ? new StudioApi(studioBase, bearer) : null), [studioBase, bearer]);

  useEffect(() => {
    let alive = true;
    if (adopted.current) {
      adopted.current = false;
      return;
    }
    (async () => {
      if (coreToken || studioToken) setRestoring(true);
      try {
        if (coreToken) {
          const me = await core.me();
          if (alive) setSession({ kind: "curator", id: me.curator_id, name: me.name });
        } else if (studioToken && studio) {
          const me = await studio.me();
          if (alive) setSession({ kind: "artist", id: me.id, name: me.name });
        } else if (studioToken) {
          // Studio switched off: an artist session can't be restored anywhere
          ls.set(K.studioToken, null);
          if (alive) {
            setStudioToken(null);
            setSession(null);
          }
        } else if (alive) setSession(null);
      } catch (e) {
        // Only a definitive "no" signs you out; a flaky network keeps the token.
        const status = (e as { status?: number }).status ?? 0;
        if (alive && (status === 401 || status === 403 || status === 404)) {
          ls.set(K.coreToken, null);
          ls.set(K.studioToken, null);
          setCoreToken(null);
          setStudioToken(null);
          setSession(null);
        }
      } finally {
        if (alive) setRestoring(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coreToken, studioToken, coreBase, studioBase, attempt]);

  const setBases = useCallback((c: string, s: string) => {
    const cb = trimBase(c) || DEFAULT_CORE;
    const sb = trimBase(s);
    ls.set(K.coreBase, cb === DEFAULT_CORE ? null : cb);
    ls.set(K.studioBase, sb === DEFAULT_STUDIO ? null : sb);
    setCoreBase(cb);
    setStudioBase(sb);
    clearQueries();
  }, []);

  const adoptCurator = (token: string, id: string, name: string) => {
    adopted.current = true;
    clearQueries();
    ls.set(K.studioToken, null);
    setStudioToken(null);
    ls.set(K.coreToken, token);
    setCoreToken(token);
    setSession({ kind: "curator", id, name });
  };
  const adoptArtist = (token: string, id: string, name: string) => {
    adopted.current = true;
    clearQueries();
    ls.set(K.coreToken, null);
    setCoreToken(null);
    ls.set(K.studioToken, token);
    setStudioToken(token);
    setSession({ kind: "artist", id, name });
  };

  const value: Ctx = {
    session,
    restoring,
    core,
    studio,
    coreBase,
    studioBase,
    setBases,
    stranded: !restoring && !session && !!(coreToken || studioToken),
    retry: () => setAttempt((n) => n + 1),
    signInCurator: async (username, password) => {
      const a = await new VeritagApi(coreBase).login(username.trim(), password);
      adoptCurator(a.token, a.curator_id, a.name);
    },
    registerCurator: async (username, name, password) => {
      const a = await new VeritagApi(coreBase).register(username.trim(), name.trim() || username.trim(), password);
      adoptCurator(a.token, a.curator_id, a.name);
    },
    signInArtist: async (username, password) => {
      if (!studioBase) throw new Error("studio");
      const a = await new StudioApi(studioBase).login(username.trim(), password);
      adoptArtist(a.token, a.artist_id, a.name);
    },
    joinArtist: async (code, username, password) => {
      if (!studioBase) throw new Error("studio");
      const a = await new StudioApi(studioBase).join(code.trim(), username.trim(), password);
      adoptArtist(a.token, a.artist_id, a.name);
    },
    signOut: () => {
      if (session?.kind === "curator") core.logout().catch(() => {});
      if (session?.kind === "artist") studio?.logout().catch(() => {});
      ls.set(K.coreToken, null);
      ls.set(K.studioToken, null);
      setCoreToken(null);
      setStudioToken(null);
      setSession(null);
      clearQueries();
    },
  };

  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSession(): Ctx {
  const v = useContext(SessionCtx);
  if (!v) throw new Error("useSession outside SessionProvider");
  return v;
}

/** For screens that only exist when signed in. */
export function useSignedIn(): Ctx & { session: Session } {
  const ctx = useSession();
  if (!ctx.session) throw new Error("not signed in");
  return ctx as Ctx & { session: Session };
}
