from studio.security import Signer, check_password, hash_password, invite_code
from studio.store import MemoryStore
from studio.vcard import build_vcard


def test_signer_round_trip_and_tamper():
    s = Signer(b"k")
    tok = s.issue({"uid": "04AA", "artist_id": "a1"}, ttl=60)
    assert s.verify(tok)["uid"] == "04AA"
    body, sig = tok.split(".")
    assert s.verify(body + "." + sig[:-2] + "AA") is None
    assert Signer(b"other").verify(tok) is None
    assert s.verify("garbage") is None


def test_signer_expiry():
    s = Signer(b"k")
    assert s.verify(s.issue({"uid": "x"}, ttl=-1)) is None


def test_passwords():
    h = hash_password("correct horse")
    assert check_password("correct horse", h) and not check_password("wrong", h)
    assert hash_password("correct horse") != h  # salted


def test_invite_code_shape():
    code = invite_code()
    assert len(code) == 9 and code[4] == "-" and not set(code) & set("01OI")


def test_memory_store_incr_and_find():
    st = MemoryStore()
    st.incr("stats", "a:1", {"artist_id": "a"}, {"taps": 1, "uids.X": 1})
    st.incr("stats", "a:1", {"artist_id": "a"}, {"taps": 2, "uids.X": 1, "uids.Y": 1})
    assert st.get("stats", "a:1") == {"artist_id": "a", "taps": 3, "uids": {"X": 2, "Y": 1}}
    st.put("views", "v", {"anchors": ["U1", "U2"], "artist_id": "a"})
    assert len(st.find("views", ("anchors", "array_contains", "U2"))) == 1
    assert st.find("views", ("artist_id", "==", "b")) == []


def test_vcard_minimal_and_unicode_folding():
    text = build_vcard({"display_name": "Aiko", "bio": "è" * 200})
    assert "N:Aiko;;;;" in text and "FN:Aiko" in text
    for line in text.split("\r\n"):
        assert len(line.encode()) <= 75
        line.encode().decode()  # folding never splits a UTF-8 sequence
