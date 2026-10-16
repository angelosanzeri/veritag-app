"""
A local stand-in for the Veritag domain API (veritag-core), for development,
demos and tests — never for production.

It speaks the same contract as https://api.veritag.art (see its /openapi.json):
curators + sessions, artist enrolment, the blue-check handshake, minting,
exhibitions and the visitor passport. State lives in memory and is re-seeded on
every start with a small, fictional art world.

Chips are simulated: a tag's CMAC is HMAC-SHA256(DEV_KEY, uid|ctr)[:8]. The
dev-only endpoint `GET /__dev/tap/{uid}` hands out the next valid tap
(u, c, m) — what a real NTAG 424 DNA would mirror — so a browser can "tap"
an artwork without hardware.

    pip install fastapi uvicorn
    uvicorn mock_core:app --port 8090 --app-dir dev
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import random
import secrets
import time
from typing import Optional

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

DEV_KEY = b"veritag-mock-core"
CODE_TTL = 15 * 60


# ── simulated chips ─────────────────────────────────────────────────────────
def cmac_for(uid: str, ctr: int) -> str:
    return hmac.new(DEV_KEY, f"{uid.upper()}|{ctr}".encode(), hashlib.sha256).hexdigest()[:16]


# ── generated artwork images (abstract SVG compositions) ────────────────────
_PALETTES = [
    ["#1b1f3b", "#e0a458", "#c2554d", "#f2e8cf"],
    ["#0f2d3a", "#5bc0be", "#f4d35e", "#ee964b"],
    ["#2b193d", "#a682ff", "#f7c59f", "#ef6f6c"],
    ["#14213d", "#fca311", "#e5e5e5", "#3a86ff"],
    ["#283618", "#dda15e", "#fefae0", "#bc6c25"],
    ["#22223b", "#9a8c98", "#f2e9e4", "#c9ada7"],
    ["#03045e", "#00b4d8", "#caf0f8", "#ff006e"],
    ["#3d0c11", "#d4a373", "#faedcd", "#588157"],
]


def artwork_svg(seed: int) -> str:
    rnd = random.Random(seed)
    bg, a, b, c = _PALETTES[seed % len(_PALETTES)]
    shapes = []
    for _ in range(rnd.randint(5, 9)):
        col = rnd.choice([a, b, c])
        op = rnd.choice([0.55, 0.7, 0.85, 1])
        kind = rnd.random()
        x, y = rnd.randint(-40, 640), rnd.randint(-40, 840)
        if kind < 0.45:
            shapes.append(f'<circle cx="{x}" cy="{y}" r="{rnd.randint(40, 230)}" fill="{col}" opacity="{op}"/>')
        elif kind < 0.8:
            w, h = rnd.randint(60, 380), rnd.randint(40, 420)
            rot = rnd.randint(-30, 30)
            shapes.append(
                f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{col}" opacity="{op}" '
                f'transform="rotate({rot} {x + w / 2} {y + h / 2})"/>'
            )
        else:
            x2, y2 = rnd.randint(0, 600), rnd.randint(0, 800)
            shapes.append(
                f'<line x1="{x}" y1="{y}" x2="{x2}" y2="{y2}" stroke="{col}" '
                f'stroke-width="{rnd.randint(4, 22)}" stroke-linecap="round" opacity="{op}"/>'
            )
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800">'
        f'<rect width="600" height="800" fill="{bg}"/>{"".join(shapes)}'
        '<rect width="600" height="800" fill="url(#g)"/>'
        '<defs><radialGradient id="g" cx="30%" cy="20%" r="90%">'
        '<stop offset="0" stop-color="#fff" stop-opacity=".12"/>'
        '<stop offset="1" stop-color="#000" stop-opacity=".25"/></radialGradient></defs></svg>'
    )
    return "data:image/svg+xml;base64," + base64.b64encode(svg.encode()).decode()


# ── state ───────────────────────────────────────────────────────────────────
class State:
    def __init__(self) -> None:
        self.curators: dict[str, dict] = {}       # curator_id -> {..., username, password}
        self.sessions: dict[str, str] = {}        # token -> curator_id
        self.artists: dict[str, dict] = {}        # artist_id -> {name, issuer_id, public_key_hex}
        self.vouches: dict[str, list[str]] = {}   # artist_id -> [curator_id]
        self.requests: dict[str, dict] = {}
        self.artworks: dict[str, dict] = {}       # uid -> ArtworkOut
        self.exhibitions: dict[str, dict] = {}
        self.last_ctr: dict[str, int] = {}
        self.taps: dict[str, int] = {}            # uid -> next ctr handed out by /__dev/tap


S = State()


def _id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(4)}"


def seed(state: State) -> None:
    def cur(cid, username, name, bio):
        state.curators[cid] = {"curator_id": cid, "name": name, "bio": bio, "avatar_url": "",
                               "username": username, "password": "arttrust"}

    cur("cur_hub", "hub", "Exteryo Art Hub", "Phygital Art — l'arte contemporanea come palcoscenico della tecnologia.")
    cur("cur_sole", "galleria", "Galleria del Sole", "Arte contemporanea, Milano — curatela indipendente.")
    cur("cur_nord", "nord", "Atelier Nord", "Collettivo di curatori, fotografia e new media.")
    cur("cur_lumen", "lumen", "Fondazione Lumen", "Maestri moderni e provenienza verificata.")

    def artist(aid, name, vouched_by):
        state.artists[aid] = {"artist_id": aid, "name": name, "issuer_id": f"iss_{hashlib.sha256(aid.encode()).hexdigest()[:16]}",
                              "public_key_hex": "04" + hashlib.sha256(name.encode()).hexdigest() * 2}
        state.vouches[aid] = list(vouched_by)

    artist("artist_giulia", "Giulia Ferraris", ["cur_hub", "cur_sole"])
    artist("artist_marco", "Marco Valenti", ["cur_hub"])
    artist("artist_aiko", "Aiko Tanaka", ["cur_nord", "cur_hub"])
    artist("artist_sofia", "Sofia Reyes", ["cur_sole"])
    artist("artist_luca", "Luca Moretti", [])

    works = [
        ("04A1B2C3D4E501", "artist_giulia", "Soglia d'oro", "Acrilico e foglia oro su tela, 120 × 160 cm. Una soglia tra materia e luce: la superficie cambia con chi la guarda."),
        ("04A1B2C3D4E502", "artist_giulia", "Frequenze", "Tecnica mista su tavola, 90 × 90 cm. Il ritmo di un segnale tradotto in campiture."),
        ("04A1B2C3D4E503", "artist_giulia", "Rumore bianco", "Olio su lino, 100 × 140 cm."),
        ("04A1B2C3D4E504", "artist_marco", "Architetture del silenzio", "Stampa fine art su carta cotone, ed. 3/7, 70 × 100 cm."),
        ("04A1B2C3D4E505", "artist_marco", "Linea 9", "Ferro ossidato e resina, 45 × 30 × 30 cm."),
        ("04A1B2C3D4E506", "artist_aiko", "Kintsugi digitale", "Ceramica, oro e circuiti, 38 × 38 × 12 cm. La riparazione come rivelazione."),
        ("04A1B2C3D4E507", "artist_aiko", "Mare interno", "Cianotipia su carta giapponese, 60 × 80 cm."),
        ("04A1B2C3D4E508", "artist_sofia", "Cartografia di un ricordo", "Olio e cera su tela, 150 × 110 cm."),
        ("04A1B2C3D4E509", "artist_luca", "Studio n. 4", "Grafite su carta, 50 × 70 cm."),
    ]
    for i, (uid, aid, title, desc) in enumerate(works):
        state.artworks[uid] = {"uid": uid, "title": title, "artist_id": aid,
                               "binding_id": hashlib.sha256(f"{uid}{title}".encode()).hexdigest()[:32],
                               "description": desc, "image_data_url": artwork_svg(i + 3), "video_url": ""}

    def exh(eid, cid, title, desc, starts, ends, venue, lat, lng, uids):
        state.exhibitions[eid] = {"exhibition_id": eid, "title": title, "curator_id": cid, "description": desc,
                                  "cover_url": "", "starts_at": starts, "ends_at": ends, "venue": venue,
                                  "lat": lat, "lng": lng, "items": [{"uid": u, "caption": ""} for u in uids]}

    exh("exh_phygital", "cur_hub", "Phygital Art — Atto I",
        "L'azienda diventa galleria: opere contemporanee e tecnologia NFC, per imprenditori e stakeholder.",
        "2026-09-18", "2026-12-20", "Milano", 45.4642, 9.19,
        ["04A1B2C3D4E501", "04A1B2C3D4E502", "04A1B2C3D4E504", "04A1B2C3D4E506"])
    exh("exh_sole", "cur_sole", "Materia e luce", "Pittura contemporanea tra Milano e Torino.",
        "2026-03-02", "2026-04-30", "Galleria del Sole, Milano", 45.4719, 9.1837,
        ["04A1B2C3D4E501", "04A1B2C3D4E508"])
    exh("exh_nord", "cur_nord", "Acque", "Fotografia, cianotipia e new media.",
        "2025-11-10", "2026-01-15", "Atelier Nord, Torino", 45.0703, 7.6869,
        ["04A1B2C3D4E507", "04A1B2C3D4E506"])

    now = time.time()
    state.requests["req_luca"] = {"request_id": "req_luca", "artist_id": "artist_luca", "curator_id": "cur_hub",
                                  "status": "pending", "created_at": now - 120, "expires_at": now + CODE_TTL,
                                  "code": "482913"}


seed(S)


# ── helpers ─────────────────────────────────────────────────────────────────
def curator_out(c: dict) -> dict:
    return {k: c[k] for k in ("curator_id", "name", "bio", "avatar_url")}


def artist_out(aid: str) -> dict:
    a = S.artists[aid]
    vb = [curator_out(S.curators[c]) for c in S.vouches.get(aid, []) if c in S.curators]
    return {"artist_id": aid, "name": a["name"], "issuer_id": a["issuer_id"], "verified": bool(vb), "verified_by": vb}


def request_out(r: dict, reveal: bool) -> dict:
    status = r["status"]
    if status == "pending" and r["expires_at"] < time.time():
        status = "expired"
    return {**{k: r[k] for k in ("request_id", "artist_id", "curator_id", "created_at", "expires_at")},
            "status": status, "code": r["code"] if reveal else None,
            "artist_name": S.artists.get(r["artist_id"], {}).get("name")}


def exhibition_out(e: dict) -> dict:
    items = []
    for it in e["items"]:
        aw = S.artworks.get(it["uid"])
        items.append({"uid": it["uid"], "caption": it.get("caption", ""),
                      "title": aw["title"] if aw else None,
                      "artist_name": S.artists[aw["artist_id"]]["name"] if aw else None})
    return {**{k: v for k, v in e.items() if k != "items"}, "items": items}


def exhibition_refs(uid: str) -> list[dict]:
    refs = []
    for e in S.exhibitions.values():
        if any(i["uid"] == uid for i in e["items"]):
            refs.append({k: e[k] for k in ("exhibition_id", "title", "curator_id", "starts_at", "ends_at", "venue", "lat", "lng")}
                        | {"curator_name": S.curators.get(e["curator_id"], {}).get("name")})
    return sorted(refs, key=lambda r: r["starts_at"] or "")


def need_curator(authorization: Optional[str]) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "missing bearer token")
    cid = S.sessions.get(authorization.split(" ", 1)[1].strip())
    if not cid:
        raise HTTPException(401, "invalid or expired session")
    return cid


def roster_ids(cid: str) -> list[str]:
    return [aid for aid, cs in S.vouches.items() if cid in cs]


# ── app ─────────────────────────────────────────────────────────────────────
app = FastAPI(title="Veritag API (mock)", version="0.1.0-mock")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class RegisterCuratorIn(BaseModel):
    username: str
    name: str
    password: str
    bio: str = ""
    avatar_url: str = ""


class LoginIn(BaseModel):
    username: str
    password: str


class EnrollArtistIn(BaseModel):
    name: str
    public_key_hex: str


class RequestVerificationIn(BaseModel):
    artist_id: str
    curator_id: str


class ConfirmVerificationIn(BaseModel):
    code: str


class MintArtworkIn(BaseModel):
    artist_id: str
    uid: str
    title: str
    signature_hex: str
    description: str = ""
    image_data_url: str = ""
    video_url: str = ""


class ExhibitionItemIn(BaseModel):
    uid: str
    caption: str = ""


class CreateExhibitionIn(BaseModel):
    curator_id: str
    title: str
    description: str = ""
    cover_url: str = ""
    starts_at: str = ""
    ends_at: str = ""
    venue: str = ""
    lat: Optional[float] = None
    lng: Optional[float] = None
    items: list[ExhibitionItemIn] = []


class UpdateExhibitionIn(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    cover_url: Optional[str] = None
    starts_at: Optional[str] = None
    ends_at: Optional[str] = None
    venue: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    items: Optional[list[ExhibitionItemIn]] = None


@app.get("/healthz")
@app.get("/meta")
def meta():
    return {"status": "ok", "attest_url": "mock://attestcore", "mock": True}


@app.post("/curators")
def register_curator(body: RegisterCuratorIn):
    if any(c["username"] == body.username for c in S.curators.values()):
        raise HTTPException(409, "username taken")
    cid = _id("cur")
    S.curators[cid] = {"curator_id": cid, "name": body.name, "bio": body.bio, "avatar_url": body.avatar_url,
                       "username": body.username, "password": body.password}
    tok = secrets.token_urlsafe(24)
    S.sessions[tok] = cid
    return {"curator_id": cid, "name": body.name, "token": tok}


@app.post("/curators/login")
def login(body: LoginIn):
    for c in S.curators.values():
        if c["username"] == body.username and c["password"] == body.password:
            tok = secrets.token_urlsafe(24)
            S.sessions[tok] = c["curator_id"]
            return {"curator_id": c["curator_id"], "name": c["name"], "token": tok}
    raise HTTPException(401, "wrong username or password")


@app.get("/curators/me")
def me(authorization: Optional[str] = Header(None)):
    return curator_out(S.curators[need_curator(authorization)])


@app.post("/curators/logout")
def logout(authorization: Optional[str] = Header(None)):
    if authorization:
        S.sessions.pop(authorization.split(" ", 1)[-1].strip(), None)
    return {"ok": True}


@app.get("/curators")
def list_curators():
    return [curator_out(c) for c in S.curators.values()]


@app.get("/curators/{curator_id}")
def get_curator(curator_id: str):
    if curator_id not in S.curators:
        raise HTTPException(404, "no such curator")
    return curator_out(S.curators[curator_id])


@app.get("/curators/{curator_id}/requests")
def curator_requests(curator_id: str, status: str = "pending", authorization: Optional[str] = Header(None)):
    if need_curator(authorization) != curator_id:
        raise HTTPException(403, "not your dashboard")
    out = [request_out(r, reveal=False) for r in S.requests.values() if r["curator_id"] == curator_id]
    return [r for r in out if r["status"] == status] if status else out


@app.get("/curators/{curator_id}/roster")
def roster(curator_id: str, authorization: Optional[str] = Header(None)):
    need_curator(authorization)
    return [artist_out(a) for a in roster_ids(curator_id)]


@app.get("/curators/{curator_id}/artworks")
def catalogue(curator_id: str, authorization: Optional[str] = Header(None)):
    need_curator(authorization)
    ids = set(roster_ids(curator_id))
    return [{"artwork": aw, "artist_id": aw["artist_id"], "artist_name": S.artists[aw["artist_id"]]["name"],
             "artist_verified": True} for aw in S.artworks.values() if aw["artist_id"] in ids]


@app.get("/curators/{curator_id}/exhibitions")
def curator_exhibitions(curator_id: str):
    return [exhibition_out(e) for e in S.exhibitions.values() if e["curator_id"] == curator_id]


@app.post("/artists")
def enroll(body: EnrollArtistIn):
    for aid, a in S.artists.items():
        if a["public_key_hex"] == body.public_key_hex:
            return artist_out(aid)
    aid = _id("artist")
    S.artists[aid] = {"artist_id": aid, "name": body.name, "issuer_id": _id("iss"), "public_key_hex": body.public_key_hex}
    S.vouches[aid] = []
    return artist_out(aid)


@app.get("/artists/{artist_id}")
def get_artist(artist_id: str):
    if artist_id not in S.artists:
        raise HTTPException(404, "no such artist")
    return artist_out(artist_id)


@app.get("/artists/{artist_id}/artworks")
def artist_artworks(artist_id: str):
    return [aw for aw in S.artworks.values() if aw["artist_id"] == artist_id]


@app.get("/artists/{artist_id}/requests")
def artist_requests(artist_id: str):
    return [request_out(r, reveal=True) for r in S.requests.values() if r["artist_id"] == artist_id]


@app.post("/verifications")
def request_verification(body: RequestVerificationIn):
    if body.artist_id not in S.artists or body.curator_id not in S.curators:
        raise HTTPException(404, "unknown artist or curator")
    now = time.time()
    rid = _id("req")
    S.requests[rid] = {"request_id": rid, "artist_id": body.artist_id, "curator_id": body.curator_id,
                       "status": "pending", "created_at": now, "expires_at": now + CODE_TTL,
                       "code": f"{secrets.randbelow(10**6):06d}"}
    return request_out(S.requests[rid], reveal=True)


@app.post("/verifications/{request_id}/confirm")
def confirm(request_id: str, body: ConfirmVerificationIn, authorization: Optional[str] = Header(None)):
    cid = need_curator(authorization)
    r = S.requests.get(request_id)
    if not r:
        raise HTTPException(404, "no such request")
    if r["curator_id"] != cid:
        raise HTTPException(403, "this request is addressed to another curator")
    if request_out(r, False)["status"] != "pending":
        raise HTTPException(409, "request is no longer pending")
    if body.code.strip() != r["code"]:
        raise HTTPException(400, "code does not match")
    r["status"] = "confirmed"
    S.vouches.setdefault(r["artist_id"], [])
    if cid not in S.vouches[r["artist_id"]]:
        S.vouches[r["artist_id"]].append(cid)
    return request_out(r, reveal=False)


@app.post("/verifications/{request_id}/reject")
def reject(request_id: str, authorization: Optional[str] = Header(None)):
    cid = need_curator(authorization)
    r = S.requests.get(request_id)
    if not r or r["curator_id"] != cid:
        raise HTTPException(404, "no such request")
    r["status"] = "rejected"
    return request_out(r, reveal=False)


@app.post("/artworks")
def mint(body: MintArtworkIn):
    if body.artist_id not in S.artists:
        raise HTTPException(404, "unknown artist")
    uid = body.uid.upper()
    if uid in S.artworks:
        raise HTTPException(409, "this tag already carries an artwork")
    S.artworks[uid] = {"uid": uid, "title": body.title, "artist_id": body.artist_id,
                       "binding_id": hashlib.sha256(f"{uid}{body.title}".encode()).hexdigest()[:32],
                       "description": body.description, "image_data_url": body.image_data_url, "video_url": body.video_url}
    return {"uid": uid, "title": body.title, "chip_key_hex": secrets.token_hex(16),
            "binding_id": S.artworks[uid]["binding_id"], "expires_in": 600}


@app.get("/artworks/{uid}")
def artwork_detail(uid: str):
    aw = S.artworks.get(uid.upper())
    if not aw:
        raise HTTPException(404, "no artwork on this tag yet")
    return {"artwork": aw, "artist": artist_out(aw["artist_id"]) if aw["artist_id"] in S.artists else None,
            "exhibitions": exhibition_refs(aw["uid"])}


@app.post("/exhibitions")
def create_exhibition(body: CreateExhibitionIn, authorization: Optional[str] = Header(None)):
    cid = need_curator(authorization)
    if body.curator_id != cid:
        raise HTTPException(403, "you can only create your own rooms")
    eid = _id("exh")
    S.exhibitions[eid] = {"exhibition_id": eid, **body.model_dump(exclude={"items"}),
                          "items": [i.model_dump() for i in body.items]}
    return exhibition_out(S.exhibitions[eid])


@app.get("/exhibitions/{exhibition_id}")
def get_exhibition(exhibition_id: str):
    e = S.exhibitions.get(exhibition_id)
    if not e:
        raise HTTPException(404, "no such exhibition")
    return exhibition_out(e)


@app.put("/exhibitions/{exhibition_id}")
def update_exhibition(exhibition_id: str, body: UpdateExhibitionIn, authorization: Optional[str] = Header(None)):
    cid = need_curator(authorization)
    e = S.exhibitions.get(exhibition_id)
    if not e:
        raise HTTPException(404, "no such exhibition")
    if e["curator_id"] != cid:
        raise HTTPException(403, "not your room")
    patch = body.model_dump(exclude_unset=True)
    if "items" in patch and patch["items"] is not None:
        patch["items"] = [dict(i) for i in patch["items"]]
    e.update({k: v for k, v in patch.items() if v is not None or k in ("lat", "lng")})
    return exhibition_out(e)


@app.delete("/exhibitions/{exhibition_id}")
def delete_exhibition(exhibition_id: str, authorization: Optional[str] = Header(None)):
    cid = need_curator(authorization)
    e = S.exhibitions.get(exhibition_id)
    if not e or e["curator_id"] != cid:
        raise HTTPException(404, "no such exhibition")
    del S.exhibitions[exhibition_id]
    return {"ok": True}


@app.get("/passport")
def passport(u: str, c: int = 0, m: str = "", kv: int = 1):
    uid = u.upper()
    aw = S.artworks.get(uid)
    if not aw:
        raise HTTPException(404, "no artwork on this tag yet")
    artist = artist_out(aw["artist_id"])
    base = {"uid": uid, "ctr": c, "issuer_id": artist["issuer_id"], "artwork": aw, "artist": artist,
            "artist_verified": artist["verified"], "verified_by": artist["verified_by"],
            "exhibitions": exhibition_refs(uid)}
    if not m:
        return base | {"verdict": "record", "reason": "record", "chip_authentic": False,
                       "not_replayed": False, "issuer_verified": False}
    chip_ok = hmac.compare_digest(m.lower(), cmac_for(uid, c))
    fresh = chip_ok and c > S.last_ctr.get(uid, -1)
    if fresh:
        S.last_ctr[uid] = c
    issuer_ok = artist["verified"]
    if not chip_ok:
        verdict, reason = "counterfeit", "the chip's CMAC does not verify"
    elif not fresh:
        verdict, reason = "replayed", "this read counter was already seen"
    elif not issuer_ok:
        verdict, reason = "unverified_artist", "the artist has no curator's blue check yet"
    else:
        verdict, reason = "authentic", "ok"
    return base | {"verdict": verdict, "reason": reason, "chip_authentic": chip_ok,
                   "not_replayed": fresh, "issuer_verified": issuer_ok}


@app.get("/__dev/tap/{uid}")
def dev_tap(uid: str):
    """The next valid tap for a simulated chip — what the tag would mirror."""
    uid = uid.upper()
    if uid not in S.artworks:
        raise HTTPException(404, "no artwork on this tag yet")
    ctr = max(S.taps.get(uid, 0), S.last_ctr.get(uid, 0)) + 1
    S.taps[uid] = ctr
    return {"u": uid, "c": ctr, "m": cmac_for(uid, ctr), "kv": 1}
