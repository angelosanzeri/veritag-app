"""
Studio entry point, configured from the environment:

  VERITAG_CORE_URL   veritag-core base URL          (default https://api.veritag.art)
  STUDIO_STORE       memory | file:<path> | firestore[:<prefix>]   (default memory)
  STUDIO_SECRET      signs Private View passes — REQUIRED outside dev
  STUDIO_APP_URL     public web app, for links in vCards/invites (default https://app.veritag.art)
  STUDIO_CORS        comma-separated allowed origins (default *)
  STUDIO_UNLOCK_TTL  seconds a tap keeps a Private View open (default 86400)

    uvicorn main:app --port 8091
"""
from __future__ import annotations

import logging
import os
import secrets

from studio.app import create_app
from studio.core import Core
from studio.store import store_from_env

log = logging.getLogger("veritag.studio")

secret = os.environ.get("STUDIO_SECRET", "")
if not secret:
    if os.environ.get("STUDIO_DEV") != "1":
        raise SystemExit("STUDIO_SECRET is required (set STUDIO_DEV=1 for a throwaway dev secret)")
    secret = secrets.token_hex(32)
    log.warning("STUDIO_SECRET not set — using a random dev secret; unlock passes die with the process")

app = create_app(
    Core(os.environ.get("VERITAG_CORE_URL", "https://api.veritag.art")),
    store_from_env(os.environ.get("STUDIO_STORE", "memory")),
    secret.encode(),
    app_url=os.environ.get("STUDIO_APP_URL", "https://app.veritag.art"),
    cors_origins=tuple(o.strip() for o in os.environ.get("STUDIO_CORS", "*").split(",") if o.strip()),
    unlock_ttl=int(os.environ.get("STUDIO_UNLOCK_TTL", "86400")),
)
