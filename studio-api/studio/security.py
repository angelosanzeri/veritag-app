"""
Small, dependency-free crypto helpers: signed unlock passes, password hashing
(scrypt) and opaque session tokens.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _unb64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


class Signer:
    """HMAC-signed, expiring JSON passes. A pass proves its holder tapped an
    authentic chip (uid) recently — it is what opens a Private View."""

    def __init__(self, secret: bytes) -> None:
        self._key = hashlib.sha256(b"veritag-studio/pass|" + secret).digest()

    def issue(self, claims: dict, ttl: int) -> str:
        body = _b64(json.dumps({**claims, "exp": int(time.time()) + ttl}, separators=(",", ":")).encode())
        sig = _b64(hmac.new(self._key, body.encode(), hashlib.sha256).digest()[:24])
        return f"{body}.{sig}"

    def verify(self, token: str) -> dict | None:
        try:
            body, sig = token.split(".", 1)
            want = _b64(hmac.new(self._key, body.encode(), hashlib.sha256).digest()[:24])
            if not hmac.compare_digest(sig, want):
                return None
            claims = json.loads(_unb64(body))
        except (ValueError, json.JSONDecodeError):
            return None
        if not isinstance(claims, dict) or claims.get("exp", 0) < time.time():
            return None
        return claims


def hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    dk = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return f"scrypt${_b64(salt)}${_b64(dk)}"


def check_password(password: str, stored: str) -> bool:
    try:
        scheme, salt, dk = stored.split("$")
    except ValueError:
        return False
    if scheme != "scrypt":
        return False
    return hmac.compare_digest(hash_password(password, _unb64(salt)), stored)


SESSION_PREFIX = "vsa_"  # Veritag Studio Artist — tells artist sessions apart from core curator tokens


def new_session_token() -> str:
    return SESSION_PREFIX + secrets.token_urlsafe(32)


def token_key(token: str) -> str:
    """Sessions are stored by hash, so a leaked database holds no live tokens."""
    return hashlib.sha256(token.encode()).hexdigest()


def invite_code() -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I — read aloud safely
    raw = "".join(secrets.choice(alphabet) for _ in range(8))
    return f"{raw[:4]}-{raw[4:]}"
