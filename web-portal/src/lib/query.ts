/**
 * A small stale-while-revalidate cache. Screens render cached data instantly,
 * refresh in the background, share in-flight requests, and re-fetch whatever is
 * on screen after a mutation calls `invalidate(prefix)`.
 */
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

export interface QueryState<T> {
  data?: T;
  error?: Error;
  loading: boolean;
}

interface Entry {
  state: QueryState<unknown>;
  ts: number;
  promise?: Promise<unknown>;
  fn?: () => Promise<unknown>;
  subs: Set<() => void>;
}

const cache = new Map<string, Entry>();
const EMPTY: QueryState<unknown> = { loading: false };

function entry(key: string): Entry {
  let e = cache.get(key);
  if (!e) {
    e = { state: { loading: false }, ts: 0, subs: new Set() };
    cache.set(key, e);
  }
  return e;
}

function set(key: string, patch: Partial<QueryState<unknown>>) {
  const e = entry(key);
  e.state = { ...e.state, ...patch };
  e.subs.forEach((s) => s());
}

async function run(key: string): Promise<unknown> {
  const e = entry(key);
  if (e.promise) return e.promise;
  if (!e.fn) return undefined;
  set(key, { loading: true });
  const p = e
    .fn()
    .then((data) => {
      e.ts = Date.now();
      set(key, { data, error: undefined, loading: false });
      return data;
    })
    .catch((err: unknown) => {
      set(key, { error: err instanceof Error ? err : new Error(String(err)), loading: false });
      throw err;
    })
    .finally(() => {
      e.promise = undefined;
    });
  e.promise = p;
  return p;
}

export function invalidate(prefix: string) {
  for (const [key, e] of cache) {
    if (!key.startsWith(prefix)) continue;
    e.ts = 0;
    if (e.subs.size > 0) run(key).catch(() => {});
  }
}

export function setQueryData<T>(key: string, update: (old: T | undefined) => T) {
  const e = entry(key);
  e.ts = Date.now();
  set(key, { data: update(e.state.data as T | undefined), error: undefined });
}

/** Forget everything (sign-in/out, endpoint change). Entries are reset in place
 *  so mounted screens stay subscribed and simply re-fetch. */
export function clearQueries() {
  for (const [key, e] of cache) {
    if (e.subs.size === 0) {
      cache.delete(key);
      continue;
    }
    e.ts = 0;
    e.promise = undefined;
    set(key, { data: undefined, error: undefined, loading: false });
    run(key).catch(() => {});
  }
}

export function useQuery<T>(
  key: string | null,
  fn: () => Promise<T>,
  opts: { staleMs?: number; refreshMs?: number } = {},
): QueryState<T> & { refresh: () => Promise<unknown> } {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const stale = opts.staleMs ?? 15_000;

  const subscribe = useCallback(
    (cb: () => void) => {
      if (!key) return () => {};
      const e = entry(key);
      e.subs.add(cb);
      return () => e.subs.delete(cb);
    },
    [key],
  );
  const state = useSyncExternalStore(subscribe, () => (key ? entry(key).state : EMPTY)) as QueryState<T>;

  useEffect(() => {
    if (!key) return;
    const e = entry(key);
    e.fn = () => fnRef.current();
    if (!e.ts || Date.now() - e.ts > stale) run(key).catch(() => {});
    if (!opts.refreshMs) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") run(key).catch(() => {});
    }, opts.refreshMs);
    return () => window.clearInterval(id);
  }, [key, stale, opts.refreshMs]);

  const refresh = useCallback(() => (key ? run(key) : Promise.resolve()), [key]);
  return { ...state, loading: state.loading || (key !== null && state.data === undefined && !state.error), refresh };
}
