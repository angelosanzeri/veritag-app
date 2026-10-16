"""Request bodies. Everything a visitor or an editor can send is bounded here."""
from __future__ import annotations

import re
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

# Images travel as data URLs (downscaled by the client) or https URLs — the same
# convention veritag-core uses for artwork photos.
_IMG = re.compile(r"^(data:image/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+|https://\S+)$")
_UID = re.compile(r"^[0-9A-Fa-f]{8,32}$")
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _image(v: str, max_kb: int) -> str:
    v = (v or "").strip()
    if not v:
        return ""
    if not _IMG.match(v):
        raise ValueError("image must be a data:image/… URL or an https:// URL")
    if len(v) > max_kb * 1024:
        raise ValueError(f"image too large (max {max_kb} KB once encoded)")
    return v


def _url(v: str) -> str:
    v = (v or "").strip()
    if v and not re.match(r"^https?://\S+$", v):
        raise ValueError("must be an http(s) URL")
    return v


class CardIn(BaseModel):
    display_name: str = Field("", max_length=80)
    headline: str = Field("", max_length=120)
    bio: str = Field("", max_length=1500)
    avatar: str = ""
    email: str = Field("", max_length=160)
    phone: str = Field("", max_length=40)
    website: str = Field("", max_length=300)
    instagram: str = Field("", max_length=60)
    city: str = Field("", max_length=80)
    studio_address: str = Field("", max_length=200)
    booking_url: str = Field("", max_length=300)
    show_email: bool = True
    show_phone: bool = False

    @field_validator("avatar")
    @classmethod
    def _avatar(cls, v: str) -> str:
        return _image(v, 320)

    @field_validator("website", "booking_url")
    @classmethod
    def _urls(cls, v: str) -> str:
        return _url(v)

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        v = v.strip()
        if v and not _EMAIL.match(v):
            raise ValueError("not an email address")
        return v


class LinkIn(BaseModel):
    label: str = Field(..., min_length=1, max_length=60)
    url: str = Field(..., max_length=300)

    @field_validator("url")
    @classmethod
    def _u(cls, v: str) -> str:
        return _url(v)


class ExtrasIn(BaseModel):
    year: str = Field("", max_length=20)
    medium: str = Field("", max_length=160)
    dimensions: str = Field("", max_length=80)
    edition: str = Field("", max_length=60)
    story: str = Field("", max_length=4000)
    audio_url: str = Field("", max_length=300)
    links: list[LinkIn] = Field(default_factory=list, max_length=5)
    images: list[str] = Field(default_factory=list, max_length=3)

    @field_validator("audio_url")
    @classmethod
    def _audio(cls, v: str) -> str:
        return _url(v)

    @field_validator("images")
    @classmethod
    def _imgs(cls, v: list[str]) -> list[str]:
        return [x for x in (_image(i, 260) for i in v) if x]


class ViewIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    intro: str = Field("", max_length=1500)
    cover: str = ""
    status: Literal["draft", "live"] = "draft"
    access: Literal["tap", "link"] = "tap"
    scope: Literal["anchors", "artist"] = "artist"
    anchors: list[str] = Field(default_factory=list, max_length=200)
    artist_id: Optional[str] = Field(None, max_length=64)

    @field_validator("cover")
    @classmethod
    def _cover(cls, v: str) -> str:
        return _image(v, 400)

    @field_validator("anchors")
    @classmethod
    def _anchors(cls, v: list[str]) -> list[str]:
        out = []
        for uid in v:
            if not _UID.match(uid):
                raise ValueError(f"not a tag uid: {uid!r}")
            if uid.upper() not in out:
                out.append(uid.upper())
        return out


class ViewPatch(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=120)
    intro: Optional[str] = Field(None, max_length=1500)
    cover: Optional[str] = None
    status: Optional[Literal["draft", "live"]] = None
    access: Optional[Literal["tap", "link"]] = None
    scope: Optional[Literal["anchors", "artist"]] = None
    anchors: Optional[list[str]] = Field(None, max_length=200)

    @field_validator("cover")
    @classmethod
    def _cover(cls, v: Optional[str]) -> Optional[str]:
        return None if v is None else _image(v, 400)

    @field_validator("anchors")
    @classmethod
    def _anchors(cls, v: Optional[list[str]]) -> Optional[list[str]]:
        return None if v is None else ViewIn._anchors(v)


class ItemIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    year: str = Field("", max_length=20)
    medium: str = Field("", max_length=160)
    dimensions: str = Field("", max_length=80)
    description: str = Field("", max_length=1500)
    image: str = ""
    price: Optional[float] = Field(None, ge=0, le=100_000_000)
    currency: str = Field("EUR", min_length=3, max_length=3)
    price_on_request: bool = False
    availability: Literal["available", "reserved", "sold"] = "available"

    @field_validator("image")
    @classmethod
    def _img(cls, v: str) -> str:
        return _image(v, 400)

    @field_validator("currency")
    @classmethod
    def _cur(cls, v: str) -> str:
        return v.upper()


class OrderIn(BaseModel):
    item_ids: list[str] = Field(..., max_length=200)


class InviteIn(BaseModel):
    artist_id: str = Field(..., max_length=64)


class AccountIn(BaseModel):
    code: str = Field(..., max_length=20)
    username: str = Field(..., min_length=3, max_length=40, pattern=r"^[A-Za-z0-9._-]+$")
    password: str = Field(..., min_length=8, max_length=200)


class LoginIn(BaseModel):
    username: str = Field(..., max_length=40)
    password: str = Field(..., max_length=200)


class LeadIn(BaseModel):
    kind: Literal["studio_visit", "info", "purchase"] = "info"
    artist_id: Optional[str] = Field(None, max_length=64)
    view_id: Optional[str] = Field(None, max_length=64)
    item_id: Optional[str] = Field(None, max_length=64)
    uid: Optional[str] = Field(None, max_length=32)
    name: str = Field(..., min_length=2, max_length=100)
    email: str = Field(..., max_length=160)
    phone: str = Field("", max_length=40)
    company: str = Field("", max_length=120)
    message: str = Field("", max_length=2000)
    consent: bool
    website: str = Field("", max_length=200)  # honeypot: humans never fill it

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        v = v.strip()
        if not _EMAIL.match(v):
            raise ValueError("not an email address")
        return v


class LeadPatch(BaseModel):
    status: Literal["new", "contacted", "won", "archived"]
    note: Optional[str] = Field(None, max_length=1000)
