from __future__ import annotations

import base64

GIULIA_WORK = "04A1B2C3D4E501"
GIULIA_OTHER = "04A1B2C3D4E502"
SOFIA_WORK = "04A1B2C3D4E508"  # Sofia is represented by Galleria del Sole, not the hub
PNG = "data:image/png;base64," + base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"0" * 40).decode()


def test_meta(studio):
    r = studio.get("/meta")
    assert r.status_code == 200 and r.json()["service"] == "veritag-studio"


# ── accounts ────────────────────────────────────────────────────────────────
def test_invite_account_login_flow(studio, curator):
    inv = studio.post("/invites", json={"artist_id": "artist_marco"}, headers=curator()).json()
    assert inv["join_url"].startswith("https://app.test/join?code=")
    info = studio.get(f"/invites/{inv['code']}").json()
    assert info["artist_name"] == "Marco Valenti" and info["curator_name"] == "Exteryo Art Hub"

    acc = studio.post("/accounts", json={"code": inv["code"], "username": "Marco.V", "password": "long-enough"})
    assert acc.status_code == 200, acc.text
    me = studio.get("/me", headers={"Authorization": f"Bearer {acc.json()['token']}"}).json()
    assert me == {"kind": "artist", "id": "artist_marco", "name": "Marco Valenti"}

    # the invite is single-use
    assert studio.post("/accounts", json={"code": inv["code"], "username": "x2y", "password": "long-enough"}).status_code == 404
    # login is case-insensitive on the username, strict on the password
    assert studio.post("/accounts/login", json={"username": "marco.v", "password": "long-enough"}).status_code == 200
    assert studio.post("/accounts/login", json={"username": "marco.v", "password": "nope-nope"}).status_code == 401


def test_cannot_invite_outside_roster(studio, curator):
    assert studio.post("/invites", json={"artist_id": "artist_sofia"}, headers=curator()).status_code == 403


def test_artist_cannot_invite(studio, artist_session):
    assert studio.post("/invites", json={"artist_id": "artist_giulia"}, headers=artist_session()).status_code == 403


def test_requires_auth(studio):
    assert studio.get("/views").status_code == 401
    assert studio.get("/views", headers={"Authorization": "Bearer vsa_forged"}).status_code == 401
    assert studio.get("/views", headers={"Authorization": "Bearer not-a-core-token"}).status_code == 401


def test_logout_kills_artist_session(studio, artist_session):
    h = artist_session()
    assert studio.post("/accounts/logout", headers=h).status_code == 200
    assert studio.get("/me", headers=h).status_code == 401


# ── card + vCard ────────────────────────────────────────────────────────────
def test_card_defaults_to_core_name(studio):
    card = studio.get("/artists/artist_giulia/card").json()
    assert card["display_name"] == "Giulia Ferraris" and card["verified"] is True
    assert "Exteryo Art Hub" in card["verified_by"]


def test_card_edit_permissions_and_privacy(studio, curator, artist_session):
    body = {"display_name": "Giulia Ferraris", "headline": "Pittrice · Milano", "email": "giulia@example.com",
            "phone": "+39 333 000 0000", "show_phone": False, "website": "https://giulia.example", "avatar": PNG}
    assert studio.put("/artists/artist_sofia/card", json=body, headers=curator()).status_code == 403
    r = studio.put("/artists/artist_giulia/card", json=body, headers=curator())
    assert r.status_code == 200, r.text
    public = studio.get("/artists/artist_giulia/card").json()
    assert public["email"] == "giulia@example.com" and public["phone"] == ""  # phone kept private

    # the artist edits her own card too, and sees the private fields
    h = artist_session()
    full = studio.get("/artists/artist_giulia/card/edit", headers=h).json()
    assert full["phone"] == "+39 333 000 0000"
    assert studio.put("/artists/artist_marco/card", json=body, headers=h).status_code == 403


def test_card_rejects_bad_input(studio, curator):
    for bad in ({"email": "nope"}, {"website": "javascript:alert(1)"}, {"avatar": "data:text/html;base64,AAAA"}):
        assert studio.put("/artists/artist_giulia/card", json=bad, headers=curator()).status_code == 422


def test_vcard(studio, curator):
    studio.put("/artists/artist_giulia/card", headers=curator(), json={
        "display_name": "Giulia Ferraris", "headline": "Pittrice; ricerca su luce, materia",
        "email": "giulia@example.com", "phone": "+39 333", "show_phone": False,
        "instagram": "@giulia.f", "city": "Milano", "avatar": PNG, "bio": "Riga uno\nRiga due"})
    r = studio.get("/artists/artist_giulia/vcard")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/vcard")
    assert 'filename="giulia-ferraris.vcf"' in r.headers["content-disposition"]
    text = r.text
    assert text.startswith("BEGIN:VCARD\r\nVERSION:3.0\r\n") and text.endswith("END:VCARD\r\n")
    assert "FN:Giulia Ferraris" in text and "N:Ferraris;Giulia;;;" in text
    assert "TITLE:Pittrice\\; ricerca su luce\\, materia" in text
    assert "EMAIL;TYPE=INTERNET,WORK:giulia@example.com" in text
    assert "TEL" not in text  # private phone stays out of the vCard too
    assert "instagram.com/giulia.f" in text and "PHOTO;ENCODING=b;TYPE=PNG:" in text
    assert "https://app.test/a/artist_giulia" in text.replace("\r\n ", "")
    assert all(len(line.encode()) <= 75 for line in text.split("\r\n"))


# ── extended passport ───────────────────────────────────────────────────────
def test_extras(studio, curator):
    body = {"year": "2025", "medium": "Acrilico e foglia oro", "story": "Nata da una soglia.",
            "links": [{"label": "Video", "url": "https://example.com/v"}]}
    assert studio.put(f"/artworks/{SOFIA_WORK}/extras", json=body, headers=curator()).status_code == 403
    assert studio.put(f"/artworks/{GIULIA_WORK}/extras", json=body, headers=curator()).status_code == 200
    got = studio.get(f"/artworks/{GIULIA_WORK.lower()}/extras").json()
    assert got["year"] == "2025" and got["links"][0]["label"] == "Video" and got["uid"] == GIULIA_WORK


# ── Private Views ───────────────────────────────────────────────────────────
def _live_view(studio, h, **over) -> dict:
    body = {"title": "Opere dallo studio", "intro": "Lavori mai esposti.", "status": "live",
            "scope": "artist", "artist_id": "artist_giulia", **over}
    r = studio.post("/views", json=body, headers=h)
    assert r.status_code == 200, r.text
    v = r.json()
    for title, price in (("Notturno", 4200), ("Alba", None)):
        it = studio.post(f"/views/{v['id']}/items", headers=h, json={
            "title": title, "price": price, "price_on_request": price is None, "image": PNG})
        assert it.status_code == 200, it.text
    return v


def test_authentic_tap_opens_private_view(studio, curator, tap):
    v = _live_view(studio, curator())
    t = tap(GIULIA_OTHER)  # any of Giulia's works opens an artist-scoped view
    exp = studio.get("/experience", params=t).json()
    assert exp["passport"]["verdict"] == "authentic"
    assert exp["card"]["display_name"] == "Giulia Ferraris"
    assert exp["unlock"] and exp["views"] == [{**exp["views"][0], "id": v["id"], "locked": False, "item_count": 2}]

    pub = studio.get(f"/public/views/{v['id']}", params={"k": exp["unlock"]["token"]})
    assert pub.status_code == 200, pub.text
    assert [i["title"] for i in pub.json()["items"]] == ["Notturno", "Alba"]
    assert "owner_id" not in pub.json()


def test_private_view_stays_locked_without_a_fresh_tap(studio, curator, tap, core_http):
    v = _live_view(studio, curator())
    assert studio.get(f"/public/views/{v['id']}").status_code == 403
    assert studio.get(f"/public/views/{v['id']}", params={"k": "forged.token"}).status_code == 403

    # a record view (no CMAC) teases the view but does not open it
    rec = studio.get("/experience", params={"u": GIULIA_WORK}).json()
    assert rec["passport"]["verdict"] == "record" and rec["unlock"] is None
    assert rec["views"][0]["locked"] is True and rec["views"][0]["intro"] == ""

    # a replayed tap does not open it either
    t = tap(GIULIA_WORK)
    assert studio.get("/experience", params=t).json()["unlock"]
    again = studio.get("/experience", params=t).json()
    assert again["passport"]["verdict"] == "replayed" and again["unlock"] is None

    # a counterfeit chip neither
    bad = studio.get("/experience", params={**tap(GIULIA_WORK), "m": "0" * 16}).json()
    assert bad["passport"]["verdict"] == "counterfeit" and bad["unlock"] is None


def test_pass_for_one_artist_does_not_open_anothers_view(studio, curator, tap):
    v = _live_view(studio, curator())
    marco = studio.get("/experience", params=tap("04A1B2C3D4E504")).json()
    assert marco["unlock"] and marco["views"] == []
    assert studio.get(f"/public/views/{v['id']}", params={"k": marco["unlock"]["token"]}).status_code == 403


def test_anchor_scoped_view(studio, curator, tap):
    v = _live_view(studio, curator(), scope="anchors", anchors=[GIULIA_WORK.lower()])
    assert v["anchors"] == [GIULIA_WORK]
    other = studio.get("/experience", params=tap(GIULIA_OTHER)).json()
    assert other["views"] == []
    hit = studio.get("/experience", params=tap(GIULIA_WORK)).json()
    assert hit["views"][0]["id"] == v["id"]
    assert studio.get(f"/public/views/{v['id']}", params={"k": other["unlock"]["token"]}).status_code == 403
    assert studio.get(f"/public/views/{v['id']}", params={"k": hit["unlock"]["token"]}).status_code == 200


def test_link_access_and_drafts(studio, curator):
    h = curator()
    v = _live_view(studio, h, access="link")
    assert studio.get(f"/public/views/{v['id']}").status_code == 200
    studio.put(f"/views/{v['id']}", json={"status": "draft"}, headers=h)
    assert studio.get(f"/public/views/{v['id']}").status_code == 404


def test_view_permissions(studio, curator, artist_session):
    hub = curator()
    v = _live_view(studio, hub)
    # another curator can't touch it
    assert studio.put(f"/views/{v['id']}", json={"title": "x"}, headers=curator("galleria")).status_code == 403
    # can't anchor someone else's artist
    assert studio.post("/views", headers=hub, json={"title": "x", "scope": "anchors",
                                                   "anchors": [SOFIA_WORK]}).status_code == 403
    assert studio.post("/views", headers=hub, json={"title": "x", "artist_id": "artist_sofia"}).status_code == 403
    # the artist sees (and may edit) views made about her
    h = artist_session()
    assert [x["id"] for x in studio.get("/views", headers=h).json()] == [v["id"]]
    assert studio.put(f"/views/{v['id']}", json={"intro": "Dalla mia mano."}, headers=h).status_code == 200
    # an artist's own view is forced onto herself
    mine = studio.post("/views", headers=h, json={"title": "Mie", "artist_id": "artist_marco"}).json()
    assert mine["artist_id"] == "artist_giulia" and mine["owner_kind"] == "artist"


def test_scope_rules(studio, curator):
    h = curator()
    assert studio.post("/views", headers=h, json={"title": "x", "scope": "artist"}).status_code == 422
    assert studio.post("/views", headers=h, json={"title": "x", "scope": "anchors", "status": "live"}).status_code == 422
    assert studio.post("/views", headers=h, json={"title": "x", "scope": "anchors"}).status_code == 200


def test_items_edit_reorder_delete(studio, curator):
    h = curator()
    v = _live_view(studio, h)
    full = studio.get(f"/views/{v['id']}", headers=h).json()
    a, b = full["items"]
    assert studio.put(f"/views/{v['id']}/items/{a['id']}", headers=h,
                      json={**{k: a[k] for k in ("title", "image")}, "availability": "reserved", "price": 5000}).status_code == 200
    assert studio.put(f"/views/{v['id']}/order", headers=h, json={"item_ids": [b["id"], a["id"]]}).json()["items"][0]["id"] == b["id"]
    assert studio.delete(f"/views/{v['id']}/items/{b['id']}", headers=h).status_code == 200
    left = studio.get(f"/views/{v['id']}", headers=h).json()["items"]
    assert [i["availability"] for i in left] == ["reserved"]
    assert studio.delete(f"/views/{v['id']}", headers=h).status_code == 200
    assert studio.get(f"/views/{v['id']}", headers=h).status_code == 404


# ── leads + insights ────────────────────────────────────────────────────────
def test_leads(studio, curator, artist_session):
    hub = curator()
    v = _live_view(studio, hub)
    item = studio.get(f"/views/{v['id']}", headers=hub).json()["items"][0]
    lead = {"kind": "purchase", "view_id": v["id"], "item_id": item["id"], "name": "Anna Bianchi",
            "email": "anna@azienda.it", "company": "Azienda Spa", "message": "Interessata.", "consent": True}
    r = studio.post("/leads", json=lead)
    assert r.status_code == 200, r.text
    assert studio.post("/leads", json={**lead, "consent": False}).status_code == 422
    assert studio.post("/leads", json={**lead, "email": "nope"}).status_code == 422
    # honeypot: accepted, not stored
    assert studio.post("/leads", json={**lead, "website": "http://spam"}).json()["ok"]
    studio.post("/leads", json={"kind": "studio_visit", "artist_id": "artist_giulia", "name": "Carlo Neri",
                                "email": "carlo@example.com", "consent": True})

    seen = studio.get("/leads", headers=hub).json()
    assert [ld["name"] for ld in seen] == ["Carlo Neri", "Anna Bianchi"]
    assert seen[1]["item_title"] == item["title"] and seen[1]["view_title"] == v["title"]
    assert studio.get("/leads", headers=curator("nord")).json() == []
    assert len(studio.get("/leads", headers=artist_session()).json()) == 2

    upd = studio.patch(f"/leads/{seen[0]['id']}", headers=hub, json={"status": "contacted", "note": "Chiamato"})
    assert upd.json()["status"] == "contacted"
    assert studio.patch(f"/leads/{seen[0]['id']}", headers=curator("nord"), json={"status": "won"}).status_code == 404


def test_lead_rate_limit(studio):
    body = {"artist_id": "artist_giulia", "name": "Spam Bot", "email": "a@b.co", "consent": True}
    codes = [studio.post("/leads", json=body).status_code for _ in range(10)]
    assert codes[:8] == [200] * 8 and codes[-1] == 429


def test_insights(studio, curator, tap):
    h = curator()
    studio.get("/experience", params=tap(GIULIA_WORK))
    studio.get("/experience", params=tap(GIULIA_WORK))
    studio.get("/experience", params={"u": "04A1B2C3D4E504"})
    studio.get("/artists/artist_giulia/vcard")
    studio.post("/leads", json={"artist_id": "artist_giulia", "name": "Anna B", "email": "a@b.co", "consent": True})
    ins = studio.get("/insights", params={"days": 7}, headers=h).json()
    assert ins["totals"]["taps"] == 3 and ins["totals"]["authentic"] == 2 and ins["totals"]["records"] == 1
    assert ins["totals"]["vcards"] == 1 and ins["totals"]["leads"] == 1 and ins["leads_open"] == 1
    assert ins["top_works"][0] == {"uid": GIULIA_WORK, "taps": 2}
    assert len(ins["series"]) == 7 and ins["series"][-1]["taps"] == 3
    # another curator's insights don't include the hub's artists
    assert studio.get("/insights", headers=curator("galleria")).json()["totals"]["taps"] == 2  # Giulia is theirs too


def test_unknown_tag_is_404(studio):
    assert studio.get("/experience", params={"u": "04FFFFFFFFFFFF"}).status_code == 404


def test_another_curators_private_view_leads_stay_theirs(studio, curator, artist_session):
    # Giulia is vouched for by both the hub and Galleria del Sole
    sole = curator("galleria")
    v = _live_view(studio, sole, title="Da Galleria del Sole")
    studio.post("/leads", json={"kind": "purchase", "view_id": v["id"], "name": "Carla Verdi",
                                "email": "carla@example.com", "consent": True})
    studio.post("/leads", json={"kind": "studio_visit", "artist_id": "artist_giulia", "name": "Dario Neri",
                                "email": "dario@example.com", "consent": True})
    assert {ld["name"] for ld in studio.get("/leads", headers=sole).json()} == {"Carla Verdi", "Dario Neri"}
    assert {ld["name"] for ld in studio.get("/leads", headers=curator()).json()} == {"Dario Neri"}
    assert {ld["name"] for ld in studio.get("/leads", headers=artist_session()).json()} == {"Carla Verdi", "Dario Neri"}


def test_artist_edits_but_cannot_delete_a_curators_view(studio, curator, artist_session):
    v = _live_view(studio, curator())
    h = artist_session()
    assert studio.put(f"/views/{v['id']}", json={"title": "Nuovo titolo"}, headers=h).status_code == 200
    assert studio.delete(f"/views/{v['id']}", headers=h).status_code == 403
    assert studio.delete(f"/views/{v['id']}", headers=curator()).status_code == 200
