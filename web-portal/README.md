# Veritag web platform

One React app, three faces, code-split so a visitor's tap loads only what it needs.

| Face | Routes | |
|---|---|---|
| **Visitor** | `/p?u&c&m&kv` · `/t/:uid` · `/a/:artist` · `/v/:view` | ArtTrust passport (live SDM tap, or the archive record), artist page with vCard + studio-visit request, Private View with per-work enquiries |
| **Curator** | `/studio/…` | overview & insights · blue-check verifications · artists (profile & vCard, invites) · works (story, QR wall label, provenance) · exhibitions on the map · Private Views · leads (CSV export) · settings |
| **Artist** | `/studio/…` | overview · profile & vCard · own works' stories · own Private Views · leads |

Entry points: `/` (check a tag link or code), `/login` (curator or artist), `/join?code=` (artist invite).

## How it's built

- `src/portal.ts` — veritag-core client + the ArtTrust verdict policy and the
  binding helpers (byte-identical to the backend and the Flutter app; pinned by
  `test/portal.test.mjs`), plus `parseTap` for every tag/link shape.
- `src/studio-api.ts` — the Veritag Studio client.
- `src/lib/` — a tiny History-API router with View Transitions, a
  stale-while-revalidate query cache, the session (curator via core, artist via
  Studio), side-by-side IT/EN strings (`t("Ciao", "Hello")`), theme, image downscaling.
- `src/ui/` — the UI kit on the design tokens in `src/styles/tokens.css`.
- `src/public/` — visitor pages; `src/studio/` — the Studio.
- Leaflet maps and the QR generator load lazily, only on screens that show them.

A verified tap is cached for the tab, so refreshing the passport shows the
original verdict instead of flagging your own tap as a replay.

## Configure

| Build variable | |
|---|---|
| `VITE_API_BASE` | veritag-core (default in dev `http://localhost:8090`, in prod `https://api.veritag.art`) |
| `VITE_STUDIO_BASE` | Studio API; empty switches Studio features off (dev default `http://localhost:8091`) |

Both can be overridden at runtime under *Settings → Services* (or *Advanced
endpoints* on the sign-in page).

## Run

```bash
../dev/run.sh                    # the whole stack, with the mock core
npm run dev                      # just the web app on :5173
npm run typecheck && npm test && npm run build
```
