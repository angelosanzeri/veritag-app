#!/usr/bin/env bash
# The whole Veritag stack on one machine: mock core, Studio API, web platform.
#   ./dev/run.sh            then open http://localhost:5173
# Ctrl-C stops everything. Studio data persists in dev/.studio-dev.json.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -d sdk ] || { echo "Clone the SDK first: git clone https://github.com/angesanze/veritag-sdk.git sdk"; exit 1; }
python3 -c "import fastapi, uvicorn, httpx" 2>/dev/null || pip install -r studio-api/requirements-dev.txt
[ -d sdk/ts/veritag-sdk/dist ] || (cd sdk/ts/veritag-sdk && npm install --no-audit --no-fund && npm run build)
[ -d web-portal/node_modules ] || (cd web-portal && npm install --no-audit --no-fund)

pids=()
trap 'kill "${pids[@]}" 2>/dev/null' EXIT INT TERM

python3 -m uvicorn mock_core:app --app-dir dev --port 8090 &
pids+=($!)
(cd studio-api && STUDIO_DEV=1 VERITAG_CORE_URL=http://localhost:8090 STUDIO_APP_URL=http://localhost:5173 \
  STUDIO_STORE="file:../dev/.studio-dev.json" exec python3 -m uvicorn main:app --port 8091) &
pids+=($!)
(cd web-portal && exec npx vite --port 5173 --strictPort) &
pids+=($!)

cat <<'MSG'

  Veritag dev stack
  · web     http://localhost:5173        (curator: hub / arttrust)
  · studio  http://localhost:8091/docs
  · core    http://localhost:8090/docs   (mock — simulated chips)

  A fresh authentic tap:  curl localhost:8090/__dev/tap/04A1B2C3D4E501

MSG
wait
