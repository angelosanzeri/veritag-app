# Veritag

**Veritag** is the platform that turns an artwork into a portal: one NFC tap
opens its passport, the artist's contact and the works that aren't on the wall.
**ArtTrust** is its authentication system — three independent checks behind
every passport:

| ArtTrust layer | What proves it |
|---|---|
| **The chip** | NXP NTAG 424 DNA: every read mirrors a fresh AES-CMAC with a counter — unclonable, replay-proof |
| **The signature** | The artist signs the work–chip binding with an ECDSA P-256 key that never leaves their phone |
| **The curator** | A curator meets the artist and grants the blue check with a code exchanged in person |

Once a tap passes ArtTrust, Veritag opens the experience a curator or an artist
composed in **Veritag Studio**:

- **Art Passport** — the anti-counterfeit certificate on the visitor's phone, with the
  work's story, medium, audio guide, details and provenance on the map.
- **Private View** — reserved works (price, availability) that open only for whoever
  tapped an authentic artwork in person, or for holders of a private link. The upsell
  lives inside the tag; every request becomes a lead.
- **Direct contact** — the artist's vCard saved with one tap, studio visits booked in
  two fields.

## What's in this repository

| Part | Path | Stack |
|---|---|---|
| **Veritag web platform** | `web-portal/` | React 18 + Vite, code-split, IT/EN, light/dark — public passport, artist pages, Private Views, and the **Studio** for curators and artists |
| **Veritag Studio API** | `studio-api/` | FastAPI — artist cards & vCards, extended passports, Private Views, leads, insights, artist accounts |
| **Mobile app** | `mobile-app/` | Flutter — artist studio (mint on NTAG 424 DNA) + visitor passport |
| **Landing** | `landing/` | Static site for veritag.art |
| **Dev stand-in for the core** | `dev/` | A mock of the Veritag domain API with a seeded art world and simulated chips |

The domain API and AttestCore live in [`veritag-core`](https://github.com/angesanze/veritag-core)
(cloud: `https://api.veritag.art`); the client SDK in
[`veritag-sdk`](https://github.com/angesanze/veritag-sdk).

```
 visitor's phone ──tap──▶ web platform / app ──▶ Studio API ──▶ veritag-core ──▶ AttestCore
                                   │               (experience,     (artists, curators,   (chip crypto,
                                   │                Private Views,   blue check,           anti-replay)
                                   └──────────────▶ leads, vCards)   passport)
```

Studio never re-implements trust: it asks veritag-core for every verdict, and
only adds what a verified tap unlocks.

### Who does what

| | Web platform (Studio) | Mobile app |
|---|---|---|
| **Curator / hub** | blue checks, roster, artists' profiles & vCards, works' stories, QR wall labels, exhibitions on the map, Private Views, leads, insights, artist invites | — |
| **Artist** | own profile & vCard, works' stories, own Private Views, leads, insights (account from a curator's invite) | identity, blue-check request, **minting on the chip** |
| **Visitor** | passport, artist page, Private View, contact form — no account | tap-to-verify |

## Setup (the `./sdk` convention)

Both apps depend on the SDK via a local path. Clone it once into `./sdk`
(gitignored — CI checks it out the same way):

```bash
git clone https://github.com/angesanze/veritag-sdk.git sdk
```

## Develop — the whole stack on your machine

```bash
./dev/run.sh          # mock core :8090 · Studio API :8091 · web :5173
```

Sign in at http://localhost:5173/login as curator `hub` / `arttrust` (also
`galleria`, `nord`, `lumen`). The mock simulates chips: get a fresh, valid tap
with `curl localhost:8090/__dev/tap/04A1B2C3D4E501` and open
`http://localhost:5173/p?u=…&c=…&m=…`. See [`dev/README.md`](dev/README.md).

Separately:

```bash
# web (Node 20+)
cd sdk/ts/veritag-sdk && npm install && npm run build
cd ../../../web-portal && npm install && npm run dev        # → :5173
npm run typecheck && npm test && npm run build

# Studio API (Python 3.12)
cd studio-api && pip install -r requirements-dev.txt && python -m pytest -q

# mobile (Flutter 3.38.x + Android SDK)
cd mobile-app && flutter pub get && flutter run
```

## CI/CD

`.github/workflows/ci.yml` — on every push/PR:
- **studio**: pytest against the dev mock of the core
- **web**: SDK build → typecheck → tests → Vite bundle (artifact `web-portal`)
- **android**: analyze → test → `flutter build apk --release` (artifact `veritag-apk`)

On `main` the web platform deploys to **https://veritag.web.app** (Firebase Hosting).
Push a `v*` tag → **GitHub Release** with the APK and the web bundle.

`.github/workflows/studio-deploy.yml` deploys the Studio API to Cloud Run — **on
demand only** (Actions → *Deploy Studio API* → *Run workflow*). One-time setup in
GCP project `veritag-502321`: enable Firestore (Native mode), create the secret
`studio-secret`, and let the deployer service account deploy Cloud Run. Then set
the repository variable **`STUDIO_BASE`** to the service URL: the next web deploy
switches the Studio features on. Until then the platform runs on veritag-core alone
(passport, blue checks, roster, works, exhibitions) and says so where a Studio
feature would be.

> If `veritag-sdk` is private, add a repo-read PAT as the `SDK_READ_TOKEN` secret
> so CI can check it out; if it's public nothing is needed.
