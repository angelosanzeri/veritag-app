"""
Veritag Studio — the companion service that turns a verified tap into an
experience.

veritag-core answers *is this real?* (chip, artist signature, curator's blue
check). Studio adds what the visitor gets once it is:

  · the artist's **card**, saved to the phone as a vCard;
  · the work's **extended passport** (story, medium, audio, links, photos);
  · **Private Views** — curated sets of works that are not on the wall, opened
    only by a fresh, authentic tap (or, if the owner chooses, by link);
  · **leads** — studio-visit and purchase requests, straight to the owner;
  · **insights** — taps, saved contacts, Private View opens, leads.

Identity is never duplicated: curators sign in with their veritag-core session
(Studio validates the bearer against core), artists with a Studio account they
create from a curator's invite — so every artist account is vouched for.
"""
from __future__ import annotations

import secrets
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from . import __version__
from .core import Core
from .schemas import (
    AccountIn,
    CardIn,
    ExtrasIn,
    InviteIn,
    ItemIn,
    LeadIn,
    LeadPatch,
    LoginIn,
    OrderIn,
    ViewIn,
    ViewPatch,
)
from .security import (
    SESSION_PREFIX,
    Signer,
    check_password,
    hash_password,
    invite_code,
    new_session_token,
    token_key,
)
from .store import Store
from .vcard import build_vcard, vcard_filename

SESSION_TTL = 30 * 24 * 3600
INVITE_TTL = 7 * 24 * 3600

CARD_FIELDS = ("display_name", "headline", "bio", "avatar", "website", "instagram", "city",
               "studio_address", "booking_url")
EXTRAS_DEFAULT = {"year": "", "medium": "", "dimensions": "", "edition": "", "story": "",
                  "audio_url": "", "links": [], "images": []}


@dataclass
class Principal:
    kind: Literal["curator", "artist"]
    id: str
    name: str
    token: str


def _now() -> float:
    return time.time()


def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(6)}"


class RateLimiter:
    """Best-effort sliding window per key (per instance — enough to blunt spam)."""

    def __init__(self, limit: int, window: float) -> None:
        self.limit, self.window = limit, window
        self._hits: dict[str, deque] = defaultdict(deque)

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        q = self._hits[key]
        while q and q[0] < now - self.window:
            q.popleft()
        if len(q) >= self.limit:
            return False
        q.append(now)
        return True


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "?")


def create_app(
    core: Core,
    store: Store,
    secret: bytes,
    *,
    app_url: str = "",
    cors_origins: tuple[str, ...] = ("*",),
    unlock_ttl: int = 24 * 3600,
) -> FastAPI:
    app = FastAPI(
        title="Veritag Studio API",
        version=__version__,
        description="Artist cards & vCards, extended passports, Private Views, leads and insights — on top of veritag-core.",
    )
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(cors_origins),
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
        expose_headers=["Content-Disposition"],
    )
    signer = Signer(secret)
    lead_limit = RateLimiter(8, 3600)
    login_limit = RateLimiter(10, 600)
    app_url = app_url.rstrip("/")

    # ── identity ──────────────────────────────────────────────────────────
    def principal(authorization: Optional[str] = Header(None)) -> Principal:
        if not authorization or not authorization.lower().startswith("bearer "):
            raise HTTPException(401, "sign in first")
        token = authorization.split(" ", 1)[1].strip()
        if token.startswith(SESSION_PREFIX):
            sess = store.get("sessions", token_key(token))
            if not sess or sess["exp"] < _now():
                raise HTTPException(401, "session expired — sign in again")
            return Principal("artist", sess["artist_id"], sess.get("name", ""), token)
        me = core.curator_me(token)
        return Principal("curator", me["curator_id"], me["name"], token)

    def roster_ids(p: Principal) -> set[str]:
        if p.kind == "artist":
            return {p.id}
        return {a["artist_id"] for a in core.roster(p.id, p.token)}

    def require_artist(p: Principal, artist_id: str) -> None:
        if artist_id not in roster_ids(p):
            raise HTTPException(403, "you can only edit artists you represent")

    def artwork_artist(uid: str) -> str:
        return core.artwork(uid)["artwork"]["artist_id"]

    def record(artist_id: Optional[str], counts: dict[str, int]) -> None:
        if not artist_id:
            return
        day = _today()
        store.incr("stats", f"{artist_id}:{day}", {"artist_id": artist_id, "date": day}, counts)

    # ── meta ──────────────────────────────────────────────────────────────
    @app.get("/meta")
    def meta():
        return {"status": "ok", "service": "veritag-studio", "version": __version__, "core_url": core.base_url}

    # ── accounts: curator invite → artist account ─────────────────────────
    @app.post("/invites")
    def create_invite(body: InviteIn, p: Principal = Depends(principal)):
        if p.kind != "curator":
            raise HTTPException(403, "only curators invite artists")
        require_artist(p, body.artist_id)
        code = invite_code()
        exp = _now() + INVITE_TTL
        store.put("invites", code, {"code": code, "artist_id": body.artist_id, "curator_id": p.id,
                                    "curator_name": p.name, "exp": exp, "used": False})
        return {"code": code, "artist_id": body.artist_id, "expires_at": exp,
                "join_url": f"{app_url}/join?code={code}" if app_url else ""}

    def live_invite(code: str) -> dict:
        inv = store.get("invites", code.strip().upper())
        if not inv or inv["used"] or inv["exp"] < _now():
            raise HTTPException(404, "this invite is not valid any more — ask your curator for a new one")
        return inv

    @app.get("/invites/{code}")
    def read_invite(code: str):
        inv = live_invite(code)
        artist = core.artist(inv["artist_id"])
        return {"artist_id": inv["artist_id"], "artist_name": artist["name"],
                "curator_name": inv["curator_name"], "expires_at": inv["exp"]}

    def open_session(artist_id: str, username: str) -> dict:
        name = core.artist(artist_id)["name"]
        token = new_session_token()
        store.put("sessions", token_key(token), {"artist_id": artist_id, "username": username,
                                                 "name": name, "exp": _now() + SESSION_TTL})
        return {"token": token, "artist_id": artist_id, "name": name}

    @app.post("/accounts")
    def create_account(body: AccountIn):
        inv = live_invite(body.code)
        uname = body.username.lower()
        taken = store.get("accounts", uname)
        if taken and taken["artist_id"] != inv["artist_id"]:
            raise HTTPException(409, "username already taken")
        # One account per artist: a fresh invite resets the old credentials.
        for old in store.find("accounts", ("artist_id", "==", inv["artist_id"])):
            store.delete("accounts", old["username"])
        store.put("accounts", uname, {"username": uname, "artist_id": inv["artist_id"],
                                      "password": hash_password(body.password), "created_at": _now()})
        inv["used"] = True
        store.put("invites", inv["code"], inv)
        return open_session(inv["artist_id"], uname)

    @app.post("/accounts/login")
    def login(body: LoginIn, request: Request):
        uname = body.username.lower().strip()
        if not login_limit.allow(f"{_client_ip(request)}|{uname}"):
            raise HTTPException(429, "too many attempts — wait a few minutes")
        acc = store.get("accounts", uname)
        if not acc or not check_password(body.password, acc["password"]):
            raise HTTPException(401, "wrong username or password")
        return open_session(acc["artist_id"], uname)

    @app.get("/me")
    def whoami(p: Principal = Depends(principal)):
        return {"kind": p.kind, "id": p.id, "name": p.name}

    @app.post("/accounts/logout")
    def logout(p: Principal = Depends(principal)):
        if p.kind == "artist":
            store.delete("sessions", token_key(p.token))
        return {"ok": True}

    # ── artist card + vCard ───────────────────────────────────────────────
    def public_card(artist_id: str, name: str) -> dict:
        doc = store.get("cards", artist_id) or {}
        out = {k: doc.get(k, "") for k in CARD_FIELDS}
        out["display_name"] = out["display_name"] or name
        out["email"] = doc.get("email", "") if doc.get("show_email", True) else ""
        out["phone"] = doc.get("phone", "") if doc.get("show_phone", False) else ""
        out["artist_id"] = artist_id
        out["updated_at"] = doc.get("updated_at")
        return out

    @app.get("/artists/{artist_id}/card")
    def get_card(artist_id: str):
        artist = core.artist(artist_id)
        return {**public_card(artist_id, artist["name"]), "verified": artist["verified"],
                "verified_by": [c["name"] for c in artist.get("verified_by", [])]}

    @app.get("/artists/{artist_id}/card/edit")
    def get_card_for_edit(artist_id: str, p: Principal = Depends(principal)):
        require_artist(p, artist_id)
        doc = store.get("cards", artist_id) or {}
        defaults = CardIn().model_dump()
        defaults["display_name"] = core.artist(artist_id)["name"]
        return {**defaults, **{k: v for k, v in doc.items() if k in defaults}}

    @app.put("/artists/{artist_id}/card")
    def put_card(artist_id: str, body: CardIn, p: Principal = Depends(principal)):
        require_artist(p, artist_id)
        store.put("cards", artist_id, {**body.model_dump(), "artist_id": artist_id,
                                       "updated_at": _now(), "updated_by": f"{p.kind}:{p.id}"})
        return get_card(artist_id)

    @app.get("/artists/{artist_id}/vcard")
    def get_vcard(artist_id: str):
        artist = core.artist(artist_id)
        doc = store.get("cards", artist_id) or {}
        card = {**doc, "display_name": doc.get("display_name") or artist["name"]}
        if not card.get("headline"):
            card["headline"] = "Artista · Veritag"
        body = build_vcard(card, profile_url=f"{app_url}/a/{artist_id}" if app_url else "")
        record(artist_id, {"vcards": 1})
        return Response(body, media_type="text/vcard; charset=utf-8",
                        headers={"Content-Disposition": f'attachment; filename="{vcard_filename(card)}"'})

    # ── extended passport content ─────────────────────────────────────────
    @app.get("/artworks/{uid}/extras")
    def get_extras(uid: str):
        return {**EXTRAS_DEFAULT, **(store.get("extras", uid.upper()) or {}), "uid": uid.upper()}

    @app.put("/artworks/{uid}/extras")
    def put_extras(uid: str, body: ExtrasIn, p: Principal = Depends(principal)):
        uid = uid.upper()
        artist_id = artwork_artist(uid)
        require_artist(p, artist_id)
        store.put("extras", uid, {**body.model_dump(), "uid": uid, "artist_id": artist_id, "updated_at": _now()})
        return get_extras(uid)

    # ── Private Views ─────────────────────────────────────────────────────
    def view_or_404(view_id: str) -> dict:
        v = store.get("views", view_id)
        if not v:
            raise HTTPException(404, "no such Private View")
        return v

    def can_manage_view(p: Principal, v: dict) -> bool:
        if v["owner_kind"] == p.kind and v["owner_id"] == p.id:
            return True
        return p.kind == "artist" and v.get("artist_id") == p.id

    def managed_view(view_id: str, p: Principal) -> dict:
        v = view_or_404(view_id)
        if not can_manage_view(p, v):
            raise HTTPException(403, "not your Private View")
        return v

    def items_of(v: dict) -> list[dict]:
        items = {i["id"]: i for i in store.find("view_items", ("view_id", "==", v["id"]))}
        ordered = [items.pop(i) for i in v.get("item_order", []) if i in items]
        return ordered + sorted(items.values(), key=lambda i: i["created_at"])

    def check_anchors(p: Principal, anchors: list[str]) -> None:
        allowed = roster_ids(p)
        for uid in anchors:
            if artwork_artist(uid) not in allowed:
                raise HTTPException(403, f"tag {uid} belongs to an artist you don't represent")

    def check_scope(v: dict) -> None:
        if v["scope"] == "artist" and not v.get("artist_id"):
            raise HTTPException(422, "a Private View opened by any of an artist's works needs an artist")
        if v["scope"] == "anchors" and not v["anchors"] and v["status"] == "live":
            raise HTTPException(422, "pick at least one artwork whose tap opens this Private View")

    def view_out(v: dict, with_items: bool = True) -> dict:
        out = {k: v[k] for k in ("id", "title", "intro", "cover", "status", "access", "scope", "anchors",
                                  "artist_id", "owner_kind", "owner_id", "owner_name", "created_at",
                                  "updated_at") if k in v}
        out["opens"] = v.get("opens", 0)
        out["item_count"] = len(v.get("item_order", []))
        if with_items:
            out["items"] = items_of(v)
            out["item_count"] = len(out["items"])
        return out

    @app.get("/views")
    def list_views(p: Principal = Depends(principal)):
        if p.kind == "artist":
            found = store.find("views", ("artist_id", "==", p.id))
        else:
            found = store.find("views", ("owner_id", "==", p.id))
            found = [v for v in found if v["owner_kind"] == "curator"]
        return sorted((view_out(v, with_items=False) for v in found), key=lambda v: -v["updated_at"])

    @app.post("/views")
    def create_view(body: ViewIn, p: Principal = Depends(principal)):
        artist_id = p.id if p.kind == "artist" else body.artist_id
        if artist_id:
            require_artist(p, artist_id)
        check_anchors(p, body.anchors)
        now = _now()
        v = {**body.model_dump(), "id": _new_id("pv"), "artist_id": artist_id, "owner_kind": p.kind,
             "owner_id": p.id, "owner_name": p.name, "item_order": [], "opens": 0,
             "created_at": now, "updated_at": now}
        check_scope(v)
        store.put("views", v["id"], v)
        return view_out(v)

    @app.get("/views/{view_id}")
    def get_view(view_id: str, p: Principal = Depends(principal)):
        return view_out(managed_view(view_id, p))

    @app.put("/views/{view_id}")
    def update_view(view_id: str, body: ViewPatch, p: Principal = Depends(principal)):
        v = managed_view(view_id, p)
        patch = body.model_dump(exclude_unset=True, exclude_none=True)
        if "anchors" in patch:
            check_anchors(p, [a for a in patch["anchors"] if a not in v["anchors"]])
        v.update(patch)
        check_scope(v)
        v["updated_at"] = _now()
        store.put("views", view_id, v)
        return view_out(v)

    @app.delete("/views/{view_id}")
    def delete_view(view_id: str, p: Principal = Depends(principal)):
        v = managed_view(view_id, p)
        if not (v["owner_kind"] == p.kind and v["owner_id"] == p.id):
            raise HTTPException(403, "only whoever created this Private View can delete it")
        for it in store.find("view_items", ("view_id", "==", view_id)):
            store.delete("view_items", it["id"])
        store.delete("views", v["id"])
        return {"ok": True}

    @app.post("/views/{view_id}/items")
    def add_item(view_id: str, body: ItemIn, p: Principal = Depends(principal)):
        v = managed_view(view_id, p)
        if len(v.get("item_order", [])) >= 60:
            raise HTTPException(422, "a Private View holds up to 60 works")
        it = {**body.model_dump(), "id": _new_id("it"), "view_id": view_id, "created_at": _now()}
        store.put("view_items", it["id"], it)
        v["item_order"] = [*v.get("item_order", []), it["id"]]
        v["updated_at"] = _now()
        store.put("views", view_id, v)
        return it

    def managed_item(view_id: str, item_id: str, p: Principal) -> tuple[dict, dict]:
        v = managed_view(view_id, p)
        it = store.get("view_items", item_id)
        if not it or it["view_id"] != view_id:
            raise HTTPException(404, "no such work in this Private View")
        return v, it

    @app.put("/views/{view_id}/items/{item_id}")
    def update_item(view_id: str, item_id: str, body: ItemIn, p: Principal = Depends(principal)):
        v, it = managed_item(view_id, item_id, p)
        it.update(body.model_dump())
        store.put("view_items", item_id, it)
        v["updated_at"] = _now()
        store.put("views", view_id, v)
        return it

    @app.delete("/views/{view_id}/items/{item_id}")
    def delete_item(view_id: str, item_id: str, p: Principal = Depends(principal)):
        v, _ = managed_item(view_id, item_id, p)
        store.delete("view_items", item_id)
        v["item_order"] = [i for i in v.get("item_order", []) if i != item_id]
        v["updated_at"] = _now()
        store.put("views", view_id, v)
        return {"ok": True}

    @app.put("/views/{view_id}/order")
    def reorder(view_id: str, body: OrderIn, p: Principal = Depends(principal)):
        v = managed_view(view_id, p)
        known = set(v.get("item_order", []))
        order = [i for i in body.item_ids if i in known]
        v["item_order"] = order + [i for i in v.get("item_order", []) if i not in order]
        v["updated_at"] = _now()
        store.put("views", view_id, v)
        return view_out(v)

    def pass_opens(v: dict, claims: dict | None) -> bool:
        if not claims:
            return False
        if v["scope"] == "artist":
            return bool(v.get("artist_id")) and claims.get("artist_id") == v["artist_id"]
        return claims.get("uid") in v.get("anchors", [])

    @app.get("/public/views/{view_id}")
    def public_view(view_id: str, k: str = ""):
        v = store.get("views", view_id)
        if not v or v["status"] != "live":
            raise HTTPException(404, "this Private View is not available")
        if v["access"] == "tap" and not pass_opens(v, signer.verify(k) if k else None):
            raise HTTPException(403, "locked — tap the artwork to open this Private View")
        v["opens"] = v.get("opens", 0) + 1
        store.put("views", view_id, v)
        record(v.get("artist_id"), {"views": 1})
        card = None
        if v.get("artist_id"):
            artist = core.artist(v["artist_id"])
            card = public_card(v["artist_id"], artist["name"])
            card["verified"] = artist["verified"]
        public = {key: v[key] for key in ("id", "title", "intro", "cover", "access", "artist_id", "owner_name")}
        return {**public, "items": items_of(v), "card": card}

    # ── the tap: passport + experience in one call ────────────────────────
    @app.get("/experience")
    def experience(u: str, c: int = 0, m: str = "", kv: int = 1):
        pp = core.passport(u, c, m, kv)
        uid = (pp.get("uid") or u).upper()
        artwork = pp.get("artwork") or {}
        artist_id = artwork.get("artist_id")
        artist = pp.get("artist") or {}
        fresh = bool(pp.get("chip_authentic") and pp.get("not_replayed"))

        unlock = None
        if fresh and artist_id:
            token = signer.issue({"uid": uid, "artist_id": artist_id}, unlock_ttl)
            unlock = {"token": token, "expires_at": _now() + unlock_ttl}

        views = {}
        if artist_id:
            for v in store.find("views", ("artist_id", "==", artist_id)) + store.find("views", ("anchors", "array_contains", uid)):
                if v["status"] != "live" or v["id"] in views:
                    continue
                anchored = (v["scope"] == "artist" and v.get("artist_id") == artist_id) or uid in v.get("anchors", [])
                if not anchored:
                    continue
                open_ = v["access"] == "link" or fresh
                views[v["id"]] = {"id": v["id"], "title": v["title"], "cover": v.get("cover", "") if open_ else "",
                                  "intro": v.get("intro", "")[:280] if open_ else "", "access": v["access"],
                                  "item_count": len(v.get("item_order", [])), "locked": not open_,
                                  "owner_name": v.get("owner_name", "")}

        verdict = pp.get("verdict")
        counts = {"taps": 1, f"uids.{uid}": 1}
        if verdict == "authentic":
            counts["authentic"] = 1
        elif verdict in ("counterfeit", "replayed"):
            counts["alerts"] = 1
        elif verdict == "record":
            counts["records"] = 1
        record(artist_id, counts)

        return {
            "passport": pp,
            "extras": get_extras(uid) if artwork else None,
            "card": public_card(artist_id, artist.get("name", "")) if artist_id else None,
            "unlock": unlock,
            "views": list(views.values()),
        }

    # ── leads ─────────────────────────────────────────────────────────────
    @app.post("/leads")
    def create_lead(body: LeadIn, request: Request):
        if body.website:  # honeypot tripped: look successful, keep nothing
            return {"ok": True, "id": _new_id("ld")}
        if not body.consent:
            raise HTTPException(422, "consent is required to share your contact")
        if not lead_limit.allow(_client_ip(request)):
            raise HTTPException(429, "too many requests — try again later")
        view = None
        artist_id = body.artist_id
        if body.view_id:
            view = store.get("views", body.view_id)
            if not view or view["status"] != "live":
                raise HTTPException(404, "this Private View is not available")
            artist_id = view.get("artist_id") or artist_id
        if not artist_id and not view:
            raise HTTPException(422, "say which artist or Private View this is about")
        if artist_id:
            core.artist(artist_id)  # 404s on an unknown artist
        item_title = ""
        if body.item_id:
            it = store.get("view_items", body.item_id)
            if not it or not view or it["view_id"] != view["id"]:
                raise HTTPException(404, "no such work in this Private View")
            item_title = it["title"]
        lead = {**body.model_dump(exclude={"website", "consent"}), "id": _new_id("ld"), "artist_id": artist_id,
                "view_title": view["title"] if view else "", "view_owner_kind": view["owner_kind"] if view else "",
                "view_owner_id": view["owner_id"] if view else "", "item_title": item_title,
                "status": "new", "note": "", "created_at": _now()}
        store.put("leads", lead["id"], lead)
        record(artist_id, {"leads": 1})
        return {"ok": True, "id": lead["id"]}

    def visible_leads(p: Principal) -> list[dict]:
        if p.kind == "artist":
            return store.find("leads", ("artist_id", "==", p.id))
        seen: dict[str, dict] = {}
        for aid in roster_ids(p):
            for ld in store.find("leads", ("artist_id", "==", aid)):
                # another curator's Private View is their deal, not yours
                if ld.get("view_owner_kind") == "curator" and ld.get("view_owner_id") != p.id:
                    continue
                seen[ld["id"]] = ld
        for ld in store.find("leads", ("view_owner_id", "==", p.id)):
            if ld["view_owner_kind"] == "curator":
                seen[ld["id"]] = ld
        return list(seen.values())

    @app.get("/leads")
    def list_leads(p: Principal = Depends(principal)):
        return sorted(visible_leads(p), key=lambda ld: -ld["created_at"])[:500]

    @app.patch("/leads/{lead_id}")
    def update_lead(lead_id: str, body: LeadPatch, p: Principal = Depends(principal)):
        ld = next((x for x in visible_leads(p) if x["id"] == lead_id), None)
        if not ld:
            raise HTTPException(404, "no such lead")
        ld["status"] = body.status
        if body.note is not None:
            ld["note"] = body.note
        ld["updated_at"] = _now()
        store.put("leads", lead_id, ld)
        return ld

    # ── insights ──────────────────────────────────────────────────────────
    @app.get("/insights")
    def insights(days: int = 30, p: Principal = Depends(principal)):
        days = max(1, min(days, 365))
        start = datetime.now(timezone.utc).date() - timedelta(days=days - 1)
        dates = [(start + timedelta(days=i)).isoformat() for i in range(days)]
        keys = ("taps", "authentic", "alerts", "records", "vcards", "views", "leads")
        series = {d: dict.fromkeys(keys, 0) for d in dates}
        by_uid: dict[str, int] = defaultdict(int)
        by_artist: dict[str, int] = defaultdict(int)
        for aid in roster_ids(p):
            for doc in store.find("stats", ("artist_id", "==", aid)):
                if doc["date"] not in series:
                    continue
                for key in keys:
                    series[doc["date"]][key] += doc.get(key, 0)
                by_artist[aid] += doc.get("taps", 0)
                for uid, n in (doc.get("uids") or {}).items():
                    by_uid[uid] += n
        totals = {key: sum(day[key] for day in series.values()) for key in keys}
        top = sorted(by_uid.items(), key=lambda kv: -kv[1])[:6]
        leads = visible_leads(p)
        return {
            "days": days,
            "series": [{"date": d, **series[d]} for d in dates],
            "totals": totals,
            "top_works": [{"uid": uid, "taps": n} for uid, n in top],
            "by_artist": [{"artist_id": a, "taps": n} for a, n in sorted(by_artist.items(), key=lambda kv: -kv[1])],
            "leads_open": sum(1 for ld in leads if ld["status"] == "new"),
        }

    return app
