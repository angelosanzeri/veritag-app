# dev — the Veritag stack without the cloud

`mock_core.py` is a stand-in for the Veritag domain API (veritag-core), speaking
the same contract as `https://api.veritag.art/openapi.json`, with state in memory
and a small fictional art world seeded on every start:

| Curators (password `arttrust`) | Represents |
|---|---|
| `hub` — Exteryo Art Hub | Giulia Ferraris, Marco Valenti, Aiko Tanaka |
| `galleria` — Galleria del Sole | Giulia Ferraris, Sofia Reyes |
| `nord` — Atelier Nord | Aiko Tanaka |
| `lumen` — Fondazione Lumen | — |

Luca Moretti has a pending blue-check request to the hub: code **482913**.

**Simulated chips.** A tag's CMAC is `HMAC-SHA256(dev key, uid|ctr)[:8]`, so the
mock verifies taps the way AttestCore does — authentic, replayed, counterfeit.
`GET /__dev/tap/{uid}` hands out the next valid tap:

```bash
curl -s localhost:8090/__dev/tap/04A1B2C3D4E501
# {"u":"04A1B2C3D4E501","c":1,"m":"…","kv":1}
open "http://localhost:5173/p?u=04A1B2C3D4E501&c=1&m=…&kv=1"
```

Open the same URL twice to see the replay check; change `m` to see a counterfeit.

Run everything with `./dev/run.sh`. The mock is for development, demos and the
Studio test suite — never deploy it.
