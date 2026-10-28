"""Append-only per-case activity ledger with a hash chain.

Every investigator action taken *on a case* (opening it, granting access,
adding an FIR, uploading evidence, starting a pipeline run, deciding a face
match) is appended here, one JSON document per case beside the case's other
state. The chain makes the history tamper-evident:

* each entry carries ``prevHash`` — the SHA-256 of the previous entry's
  canonical payload (the genesis is 64 zeroes), and
* ``hash`` — the SHA-256 of its own payload (every field except ``hash``).

:func:`CaseActivityStore.verify` recomputes the whole chain, so a retroactive
edit, insertion or deletion fails verification instead of silently rewriting
who did what. Pipeline stage history lives in the run's ``audit_trail.json``
and is merged in at read time by ``GET /api/activity``; it is append-only by
construction (a new run appends), so it needs no chain of its own.

Writes are atomic (temp file + ``os.replace``) and serialised under a lock,
matching :class:`api.user_store.UserStore` — a crash mid-write can never
leave a half-written ledger.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Final

GENESIS_HASH: Final = "0" * 64

#: Case ids reach a filesystem path here; anything outside the safe set is
#: folded to ``_`` so a hostile id can never escape the cases directory.
_SAFE_CASE_SEGMENT: Final = re.compile(r"[^A-Za-z0-9_.-]")


def entry_hash(payload: dict[str, Any]) -> str:
    """SHA-256 over the canonical JSON of an entry (all fields but ``hash``)."""
    canonical = json.dumps(
        payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


class CaseActivityStore:
    """Hash-chained activity entries, one JSON list per case."""

    def __init__(self, cases_dir: Path | str) -> None:
        self._dir = Path(cases_dir)
        self._lock = threading.Lock()

    # -- paths ------------------------------------------------------------
    def _path(self, case_id: str) -> Path:
        safe = _SAFE_CASE_SEGMENT.sub("_", case_id) or "_unknown"
        return self._dir / safe / "activity.json"

    def _load(self, case_id: str) -> list[dict[str, Any]]:
        try:
            data = json.loads(self._path(case_id).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return []
        if not isinstance(data, list):
            return []
        return [row for row in data if isinstance(row, dict)]

    def _write(self, case_id: str, rows: list[dict[str, Any]]) -> None:
        path = self._path(case_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        handle = tempfile.NamedTemporaryFile(
            "w",
            encoding="utf-8",
            dir=path.parent,
            delete=False,
            suffix=".tmp",
        )
        try:
            json.dump(rows, handle, indent=2, ensure_ascii=False)
            handle.flush()
            os.fsync(handle.fileno())
            temp_name = handle.name
        finally:
            handle.close()
        os.replace(temp_name, path)

    # -- operations -------------------------------------------------------
    def append(
        self,
        case_id: str,
        *,
        actor_id: str,
        actor_name: str,
        actor_role: str,
        action: str,
        target: str = "",
        detail: str = "",
    ) -> dict[str, Any]:
        """Append one entry and return it (with its ``hash``)."""
        with self._lock:
            rows = self._load(case_id)
            previous = rows[-1].get("hash") if rows else GENESIS_HASH
            if not isinstance(previous, str) or not previous:
                # A ledger whose tail lost its hash cannot be extended
                # honestly — verification would fail anyway; surface it.
                raise ValueError(
                    f"activity ledger for {case_id} has an invalid tail hash"
                )
            payload: dict[str, Any] = {
                "seq": len(rows) + 1,
                "caseId": case_id,
                "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "actorId": str(actor_id or ""),
                "actorName": str(actor_name or ""),
                "actorRole": str(actor_role or ""),
                "action": str(action or ""),
                "target": str(target or ""),
                "detail": str(detail or ""),
                "prevHash": previous,
            }
            entry = {**payload, "hash": entry_hash(payload)}
            rows.append(entry)
            self._write(case_id, rows)
            return entry

    def list(self, case_id: str) -> list[dict[str, Any]]:
        """All entries for one case, oldest first."""
        return self._load(case_id)

    def verify(self, case_id: str) -> bool:
        """Recompute the chain; False on any edit, insertion or deletion."""
        previous = GENESIS_HASH
        for row in self._load(case_id):
            recorded_prev = row.get("prevHash")
            recorded_hash = row.get("hash")
            if recorded_prev != previous:
                return False
            payload = {key: value for key, value in row.items() if key != "hash"}
            if recorded_hash != entry_hash(payload):
                return False
            previous = str(recorded_hash)
        return True
