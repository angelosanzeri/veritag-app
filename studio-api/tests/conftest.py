"""Studio runs against the dev mock of veritag-core (dev/mock_core.py), in-process."""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "studio-api"))

from studio.app import create_app  # noqa: E402
from studio.core import Core  # noqa: E402
from studio.store import MemoryStore  # noqa: E402

_spec = importlib.util.spec_from_file_location("mock_core", ROOT / "dev" / "mock_core.py")
mock_core = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mock_core)


@pytest.fixture()
def core_http():
    mock_core.S.__init__()
    mock_core.seed(mock_core.S)
    return TestClient(mock_core.app, base_url="http://core.test")


@pytest.fixture()
def store():
    return MemoryStore()


@pytest.fixture()
def studio(core_http, store):
    app = create_app(Core("http://core.test", client=core_http), store, b"test-secret",
                     app_url="https://app.test", unlock_ttl=3600)
    return TestClient(app)


@pytest.fixture()
def curator(core_http):
    """Bearer headers for a seeded curator (hub represents Giulia, Marco, Aiko)."""
    def login(username: str = "hub") -> dict:
        tok = core_http.post("/curators/login", json={"username": username, "password": "arttrust"}).json()["token"]
        return {"Authorization": f"Bearer {tok}"}
    return login


@pytest.fixture()
def tap(core_http):
    """A fresh, valid tap of a simulated chip."""
    def _tap(uid: str) -> dict:
        return core_http.get(f"/__dev/tap/{uid}").json()
    return _tap


@pytest.fixture()
def artist_session(studio, curator):
    def make(artist_id: str = "artist_giulia", username: str = "giulia") -> dict:
        code = studio.post("/invites", json={"artist_id": artist_id}, headers=curator()).json()["code"]
        tok = studio.post("/accounts", json={"code": code, "username": username, "password": "s3cret-pass"}).json()["token"]
        return {"Authorization": f"Bearer {tok}"}
    return make
