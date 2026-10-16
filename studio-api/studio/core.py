"""
Client for the Veritag domain API (veritag-core) — Studio's source of truth for
who the curators and artists are, which artworks exist, and whether a tap is
authentic. Studio never re-implements any of that; it asks.
"""
from __future__ import annotations

import time
from typing import Any

import httpx
from fastapi import HTTPException


class CoreError(HTTPException):
    pass


class Core:
    def __init__(self, base_url: str, client: httpx.Client | None = None, timeout: float = 12.0) -> None:
        self.base_url = base_url.rstrip("/")
        self._http = client or httpx.Client(base_url=self.base_url, timeout=timeout)
        self._cache: dict[str, tuple[float, Any]] = {}

    # -- plumbing ---------------------------------------------------------
    def _req(self, method: str, path: str, token: str | None = None, **kw) -> Any:
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        try:
            r = self._http.request(method, path, headers=headers, **kw)
        except httpx.HTTPError as e:
            raise CoreError(502, f"Veritag core unreachable: {e.__class__.__name__}") from e
        if r.status_code >= 500:
            raise CoreError(502, f"Veritag core error {r.status_code}")
        if r.status_code >= 400:
            try:
                detail = r.json().get("detail", r.reason_phrase)
            except ValueError:
                detail = r.reason_phrase
            if not isinstance(detail, str):
                detail = "invalid request"
            raise CoreError(r.status_code, detail)
        return r.json() if r.content else None

    def _cached(self, key: str, ttl: float, fn):
        hit = self._cache.get(key)
        now = time.monotonic()
        if hit and hit[0] > now:
            return hit[1]
        value = fn()
        self._cache[key] = (now + ttl, value)
        if len(self._cache) > 5000:  # keep it bounded on a long-lived instance
            self._cache = {k: v for k, v in self._cache.items() if v[0] > now}
        return value

    def forget(self, prefix: str) -> None:
        self._cache = {k: v for k, v in self._cache.items() if not k.startswith(prefix)}

    # -- curators ---------------------------------------------------------
    def curator_me(self, token: str) -> dict:
        return self._cached(f"me:{token}", 120, lambda: self._req("GET", "/curators/me", token))

    def curator(self, curator_id: str) -> dict:
        return self._cached(f"cur:{curator_id}", 300, lambda: self._req("GET", f"/curators/{curator_id}"))

    def roster(self, curator_id: str, token: str) -> list[dict]:
        return self._cached(f"roster:{curator_id}", 30, lambda: self._req("GET", f"/curators/{curator_id}/roster", token))

    # -- artists & artworks -----------------------------------------------
    def artist(self, artist_id: str) -> dict:
        return self._cached(f"artist:{artist_id}", 60, lambda: self._req("GET", f"/artists/{artist_id}"))

    def artist_artworks(self, artist_id: str) -> list[dict]:
        return self._cached(f"works:{artist_id}", 30, lambda: self._req("GET", f"/artists/{artist_id}/artworks"))

    def artwork(self, uid: str) -> dict:
        return self._cached(f"artwork:{uid.upper()}", 30, lambda: self._req("GET", f"/artworks/{uid}"))

    # -- the tap ----------------------------------------------------------
    def passport(self, u: str, c: int, m: str, kv: int) -> dict:
        # Never cached: every call is a fresh verification (and consumes the counter).
        return self._req("GET", "/passport", params={"u": u, "c": c, "m": m, "kv": kv})
