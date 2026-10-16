# Veritag Studio API

The companion service that turns a verified tap into an experience. veritag-core
answers *is this real?*; Studio adds what the visitor gets once it is — and the
tools curators and artists use to compose it.

| | Endpoints |
|---|---|
| **The tap** | `GET /experience?u&c&m&kv` — verifies with veritag-core and returns, in one call, the passport, the work's extras, the artist's card, the Private Views this tap opens and a signed **pass** (24 h) for them |
| **Artist card + vCard** | `GET /artists/{id}/card` (public) · `GET/PUT /artists/{id}/card/edit` · `GET /artists/{id}/vcard` (vCard 3.0, photo included) |
| **Extended passport** | `GET /artworks/{uid}/extras` (public) · `PUT …` — year, medium, dimensions, edition, story, audio, links, up to 3 images |
| **Private Views** | `GET/POST /views` · `GET/PUT/DELETE /views/{id}` · items `POST/PUT/DELETE /views/{id}/items[/{item}]` · `PUT /views/{id}/order` · public `GET /public/views/{id}?k=<pass>` |
| **Leads** | `POST /leads` (public; consent, honeypot, rate limit) · `GET /leads` · `PATCH /leads/{id}` |
| **Insights** | `GET /insights?days=30` — taps (authentic / alerts / records), vCards saved, Private View opens, leads, top works |
| **Accounts** | `POST /invites` (curator) · `GET /invites/{code}` · `POST /accounts` · `POST /accounts/login` · `GET /me` · `POST /accounts/logout` |

Interactive docs at `/docs` when running.

## Trust model

- **Curators** use their veritag-core session: Studio validates the bearer against
  `GET /curators/me` and reads their roster from core. A curator can edit only the
  artists they vouch for.
- **Artists** get a Studio account only through a curator's invite (single use,
  7 days) — so every artist account is vouched for. Sessions are opaque tokens
  stored by hash; passwords are scrypt-hashed.
- **Private View passes** are HMAC-signed `{uid, artist_id, exp}` issued only when
  core reports `chip_authentic && not_replayed`. A pass opens the views anchored to
  that tag, or every view scoped to that artist. Record views (no CMAC), replays and
  counterfeits get no pass; views set to *private link* need none.
- Studio stores no chip keys and never decides authenticity.

## Configuration

| Variable | Default | |
|---|---|---|
| `VERITAG_CORE_URL` | `https://api.veritag.art` | veritag-core base URL |
| `STUDIO_STORE` | `memory` | `memory` · `file:<path>` · `firestore[:<prefix>]` |
| `STUDIO_SECRET` | — | **required** outside dev: signs passes (`STUDIO_DEV=1` uses a throwaway) |
| `STUDIO_APP_URL` | `https://app.veritag.art` | public web app, for links in vCards and invites |
| `STUDIO_CORS` | `*` | comma-separated allowed origins |
| `STUDIO_UNLOCK_TTL` | `86400` | seconds a tap keeps a Private View open |

## Run & test

```bash
pip install -r requirements-dev.txt
python -m pytest -q                    # runs against dev/mock_core.py, in-process
STUDIO_DEV=1 VERITAG_CORE_URL=http://localhost:8090 uvicorn main:app --port 8091
```

Deploy: `.github/workflows/studio-deploy.yml` (Cloud Run + Firestore, on demand).

## Folding into veritag-core

Studio is a separate service only because veritag-core isn't part of this
repository. Everything lives behind `create_app(core, store, secret)`; the
`Core` client is the only seam. Moving it into veritag-core means mounting the
routes there and replacing `Core` calls with direct domain calls — the schemas,
store and tests carry over unchanged.
