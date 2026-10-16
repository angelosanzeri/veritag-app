"""
vCard 3.0 for an artist's public card — the contact a visitor saves with one
tap from the passport. 3.0 rather than 4.0: it is what iOS Contacts and Android
import most reliably, photo included.
"""
from __future__ import annotations

import re


def _esc(v: str) -> str:
    return (
        v.replace("\\", "\\\\").replace("\r\n", "\n").replace("\n", "\\n")
        .replace(",", "\\,").replace(";", "\\;")
    )


def _fold(line: str) -> str:
    """Fold at 75 octets (RFC 2425 §5.8.1) without splitting a UTF-8 sequence."""
    out, cur, size = [], "", 0
    for ch in line:
        n = len(ch.encode())
        if size + n > 75:
            out.append(cur)
            cur, size = " ", 1
        cur += ch
        size += n
    out.append(cur)
    return "\r\n".join(out)


_PHOTO = re.compile(r"^data:image/(jpeg|jpg|png);base64,([A-Za-z0-9+/=]+)$")


def build_vcard(card: dict, profile_url: str = "", org: str = "") -> str:
    name = (card.get("display_name") or "").strip() or "Artist"
    parts = name.split()
    family = parts[-1] if len(parts) > 1 else name
    given = " ".join(parts[:-1]) if len(parts) > 1 else ""

    lines = ["BEGIN:VCARD", "VERSION:3.0", f"N:{_esc(family)};{_esc(given)};;;", f"FN:{_esc(name)}"]
    if card.get("headline"):
        lines.append(f"TITLE:{_esc(card['headline'])}")
    if org:
        lines.append(f"ORG:{_esc(org)}")
    if card.get("email") and card.get("show_email", True):
        lines.append(f"EMAIL;TYPE=INTERNET,WORK:{_esc(card['email'])}")
    if card.get("phone") and card.get("show_phone", True):
        lines.append(f"TEL;TYPE=CELL,VOICE:{_esc(card['phone'])}")
    if card.get("website"):
        lines.append(f"URL:{_esc(card['website'])}")
    if card.get("booking_url"):
        lines.append(f"URL;TYPE=booking:{_esc(card['booking_url'])}")
    if card.get("instagram"):
        handle = card["instagram"].lstrip("@").strip()
        lines.append(f"X-SOCIALPROFILE;TYPE=instagram:https://instagram.com/{_esc(handle)}")
    if card.get("studio_address") or card.get("city"):
        lines.append(f"ADR;TYPE=WORK:;;{_esc(card.get('studio_address', ''))};{_esc(card.get('city', ''))};;;")
    note = (card.get("bio") or "").strip()
    if profile_url:
        note = (note + "\n\n" if note else "") + f"Veritag: {profile_url}"
    if note:
        lines.append(f"NOTE:{_esc(note[:1200])}")
    m = _PHOTO.match(card.get("avatar") or "")
    if m:
        kind = "JPEG" if m.group(1) in ("jpeg", "jpg") else "PNG"
        lines.append(f"PHOTO;ENCODING=b;TYPE={kind}:{m.group(2)}")
    lines.append("END:VCARD")
    return "\r\n".join(_fold(line) for line in lines) + "\r\n"


def vcard_filename(card: dict) -> str:
    base = re.sub(r"[^A-Za-z0-9]+", "-", (card.get("display_name") or "artist")).strip("-").lower()
    return f"{base or 'artist'}.vcf"
