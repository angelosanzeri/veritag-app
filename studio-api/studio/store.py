"""
Document storage for Studio: a handful of flat JSON documents per kind, looked
up by id or by simple equality / array-membership filters — the subset that
maps 1:1 onto Firestore, so the same code runs on an in-memory dict (tests), a
JSON file (local dev) or Firestore (Cloud Run).
"""
from __future__ import annotations

import copy
import json
import os
import threading
from pathlib import Path
from typing import Any, Iterable, Protocol

Filter = tuple[str, str, Any]  # (field, "==" | "array_contains", value)


class Store(Protocol):
    def get(self, kind: str, doc_id: str) -> dict | None: ...
    def put(self, kind: str, doc_id: str, doc: dict) -> None: ...
    def delete(self, kind: str, doc_id: str) -> None: ...
    def find(self, kind: str, *filters: Filter) -> list[dict]: ...
    def incr(self, kind: str, doc_id: str, base: dict, counts: dict[str, int]) -> None:
        """Create the doc from `base` if missing, then add `counts` to its
        counters. Keys may be dotted (`uids.04A1`) to reach a nested map."""
        ...


def _matches(doc: dict, filters: Iterable[Filter]) -> bool:
    for field, op, value in filters:
        if op == "==":
            if doc.get(field) != value:
                return False
        elif op == "array_contains":
            if value not in (doc.get(field) or []):
                return False
        else:  # pragma: no cover - programming error
            raise ValueError(f"unsupported filter op {op!r}")
    return True


class MemoryStore:
    def __init__(self) -> None:
        self._data: dict[str, dict[str, dict]] = {}
        self._lock = threading.RLock()

    def get(self, kind: str, doc_id: str) -> dict | None:
        with self._lock:
            doc = self._data.get(kind, {}).get(doc_id)
            return copy.deepcopy(doc) if doc is not None else None

    def put(self, kind: str, doc_id: str, doc: dict) -> None:
        with self._lock:
            self._data.setdefault(kind, {})[doc_id] = copy.deepcopy(doc)
            self._changed()

    def delete(self, kind: str, doc_id: str) -> None:
        with self._lock:
            self._data.get(kind, {}).pop(doc_id, None)
            self._changed()

    def find(self, kind: str, *filters: Filter) -> list[dict]:
        with self._lock:
            return [copy.deepcopy(d) for d in self._data.get(kind, {}).values() if _matches(d, filters)]

    def incr(self, kind: str, doc_id: str, base: dict, counts: dict[str, int]) -> None:
        with self._lock:
            docs = self._data.setdefault(kind, {})
            doc = docs.setdefault(doc_id, copy.deepcopy(base))
            for key, n in counts.items():
                *path, leaf = key.split(".")
                node = doc
                for p in path:
                    node = node.setdefault(p, {})
                node[leaf] = node.get(leaf, 0) + n
            self._changed()

    def _changed(self) -> None:  # hook for JsonFileStore
        pass


class JsonFileStore(MemoryStore):
    """MemoryStore persisted to one JSON file — handy for `make dev`."""

    def __init__(self, path: str | os.PathLike) -> None:
        super().__init__()
        self._path = Path(path)
        if self._path.exists():
            self._data = json.loads(self._path.read_text() or "{}")

    def _changed(self) -> None:
        tmp = self._path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self._data, ensure_ascii=False))
        tmp.replace(self._path)


class FirestoreStore:
    """Firestore in Native mode; collection names are prefixed so Studio can
    share a project's database without colliding with anything else."""

    def __init__(self, prefix: str = "studio_", project: str | None = None) -> None:
        from google.cloud import firestore  # imported lazily: optional dependency

        self._fs = firestore
        self._db = firestore.Client(project=project)
        self._prefix = prefix

    def _col(self, kind: str):
        return self._db.collection(self._prefix + kind)

    def get(self, kind: str, doc_id: str) -> dict | None:
        snap = self._col(kind).document(doc_id).get()
        return snap.to_dict() if snap.exists else None

    def put(self, kind: str, doc_id: str, doc: dict) -> None:
        self._col(kind).document(doc_id).set(doc)

    def delete(self, kind: str, doc_id: str) -> None:
        self._col(kind).document(doc_id).delete()

    def find(self, kind: str, *filters: Filter) -> list[dict]:
        from google.cloud.firestore_v1.base_query import FieldFilter

        q = self._col(kind)
        for field, op, value in filters:
            q = q.where(filter=FieldFilter(field, op, value))
        return [s.to_dict() for s in q.stream()]

    def incr(self, kind: str, doc_id: str, base: dict, counts: dict[str, int]) -> None:
        update: dict[str, Any] = copy.deepcopy(base)
        for key, n in counts.items():
            *path, leaf = key.split(".")
            node = update
            for p in path:
                node = node.setdefault(p, {})
            node[leaf] = self._fs.Increment(n)
        self._col(kind).document(doc_id).set(update, merge=True)


def store_from_env(spec: str) -> Store:
    """`memory` · `file:<path>` · `firestore[:<prefix>]`."""
    if spec == "memory":
        return MemoryStore()
    if spec.startswith("file:"):
        return JsonFileStore(spec[5:])
    if spec.startswith("firestore"):
        prefix = spec.split(":", 1)[1] if ":" in spec else "studio_"
        return FirestoreStore(prefix=prefix)
    raise ValueError(f"unknown STUDIO_STORE {spec!r}")
