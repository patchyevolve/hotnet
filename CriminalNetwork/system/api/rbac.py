"""Role- and case-level authorization (RBAC) for the investigative API.

Two independent gates, matching the system design:

* **Role hierarchy** — ``requires_roles`` answers *what kind of operation* an
  identity may attempt. The operational ladder is
  ``INSPECTOR < SUPERVISOR < ADMIN``: a higher role satisfies a route that
  names a lower one. ``AUDIT_LOGGER`` sits *outside* the ladder — it is
  read-only oversight and matches only routes that name it explicitly, so a
  route requiring ``INSPECTOR`` never accidentally admits the auditor.

* **CaseAccess** — :class:`CaseAccessGuard` answers *which cases* a validated
  identity may act on. Levels are the ``CaseAccessLevel`` enum from the Prisma
  schema (``prisma/schema.prisma``): ``READ < WRITE < ADMIN``. Levels come
  from two places:

  1. *Implicit station baseline* — station (jurisdiction) membership plus the
     role ladder: ADMIN is global, SUPERVISOR/INSPECTOR/AUDIT_LOGGER get
     ADMIN/WRITE/READ respectively on cases registered to their own station.
     This preserves the pre-RBAC single-station demo flows byte-for-byte.
  2. *Explicit ``CaseAccess`` grants* — rows in the ``CaseAccess`` table
     (Prisma model), written when a case is created (creator → ADMIN, per the
     schema design note) or when an ADMIN/SUPERVISOR grants access through
     ``POST /api/cases/{id}/access``. Grants honour ``expiresAt``.

Storage
-------
:class:`CaseAccessStore` is the seam. The production implementation
(:class:`PrismaCaseAccessStore`) uses the existing Prisma client against the
``CaseAccess`` model; it is opt-in via ``CRIMENET_CASE_ACCESS_STORE=prisma``
because the Prisma client requires a generated binary and a live database.
The default (:class:`JsonCaseAccessStore`) persists the same row shape to
``case_access.json`` in the API state directory — stdlib only, same file-store
pattern as ``user_store.py`` and ``registry.py`` — so the demo stack and the
test suite run hermetically while the data model stays identical.
"""

from __future__ import annotations

import asyncio
import json
import os
import threading
from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Final

from fastapi import Depends, HTTPException

from api.identity import Identity

#: Operational role hierarchy. ``AUDIT_LOGGER`` is deliberately absent: the
#: auditor is read-only oversight, not a rung on the investigation ladder,
#: so it satisfies a route only when named explicitly.
ROLE_RANK: Final[dict[str, int]] = {"INSPECTOR": 10, "SUPERVISOR": 20, "ADMIN": 30}

#: ``CaseAccessLevel`` from ``prisma/schema.prisma`` / ``src/models/schema.py``.
#: Ordered so a higher grant satisfies a request for a lower one.
CASE_ACCESS_RANK: Final[dict[str, int]] = {"NONE": 0, "READ": 1, "WRITE": 2, "ADMIN": 3}

CASE_ACCESS_LEVELS: Final[tuple[str, ...]] = ("READ", "WRITE", "ADMIN")

#: Roles that may read the audit trail. ``INSPECTOR`` is absent: audit
#: oversight is ADMIN/SUPERVISOR/AUDIT_LOGGER work (design: ADMIN global,
#: SUPERVISOR station, AUDIT_LOGGER read-only).
AUDIT_ROLES: Final[tuple[str, ...]] = ("ADMIN", "SUPERVISOR", "AUDIT_LOGGER")

#: Implicit level each role holds on a case registered to its own station —
#: the station baseline every explicit grant is layered on top of. ADMIN's
#: row doubles as its cross-station answer (global authority); the other
#: roles are station-bound, so a cross-station identity gets ``NONE`` from
#: the baseline rather than this row.
STATION_BASELINE: Final[dict[str, str]] = {
    "ADMIN": "ADMIN",
    "SUPERVISOR": "ADMIN",
    "INSPECTOR": "WRITE",
    "AUDIT_LOGGER": "READ",
}


def station_baseline(role: str) -> str:
    """Own-station baseline level for ``role``; ``NONE`` for unknown roles."""
    return STATION_BASELINE.get(role, "NONE")

_CASE_ACCESS_FILE: Final[str] = "case_access.json"
_GRANT_TIMEOUT_SECONDS: Final[int] = 30


def role_satisfies(identity_role: str, allowed_roles: tuple[str, ...]) -> bool:
    """Whether ``identity_role`` may act under a route allowing ``allowed_roles``.

    Exact membership always counts. Beyond that, the operational hierarchy
    applies: ADMIN satisfies SUPERVISOR/INSPECTOR requirements, SUPERVISOR
    satisfies INSPECTOR requirements. ``AUDIT_LOGGER`` (and any unknown role)
    matches by membership only.
    """
    if identity_role in allowed_roles:
        return True
    caller_rank = ROLE_RANK.get(identity_role)
    if caller_rank is None:
        return False
    return any(
        ROLE_RANK.get(allowed, -1) >= 0 and caller_rank >= ROLE_RANK[allowed]
        for allowed in allowed_roles
    )


def requires_roles(*allowed_roles: str):
    """Authorise a route by ``Identity.role``, honouring the role hierarchy.

    Imports the app's ``current_identity`` dependency lazily so ``rbac`` and
    ``app`` do not form an import cycle. Authentication still runs first: a
    missing or unverifiable token answers 401, and only a *validated*
    identity that carries the wrong role is refused with 403.

    * ``ADMIN`` — global authority.
    * ``SUPERVISOR`` — station oversight; satisfies INSPECTOR routes.
    * ``INSPECTOR`` — operational mutation; cannot open a root case.
    * ``AUDIT_LOGGER`` — read-only audit oversight: it appears on no
      mutating route, so every POST it attempts is a 403.

    Routes stay honest by naming their allowed roles at the call site rather
    than in a central table — a new endpoint cannot accidentally default to
    open.
    """
    from api.app import current_identity

    def _role_checker(identity: Identity = Depends(current_identity)) -> Identity:
        if not role_satisfies(identity.role, allowed_roles):
            raise HTTPException(
                403,
                f"Role {identity.role!r} is not authorized for this operation. Required: {allowed_roles}",
            )
        return identity

    return _role_checker


# ---------------------------------------------------------------------------
# CaseAccess rows
# ---------------------------------------------------------------------------
def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@dataclass(frozen=True)
class CaseAccessGrant:
    """One ``CaseAccess`` row: who may act on which case, at what level.

    Field names mirror ``model CaseAccess`` in ``prisma/schema.prisma``;
    ``to_dict`` emits the camelCase wire shape the API serves.
    """

    user_id: str
    case_id: str
    access_level: str
    granted_by: str
    granted_at: str
    expires_at: str | None = None

    def __post_init__(self) -> None:
        if self.access_level not in CASE_ACCESS_LEVELS:
            raise ValueError(f"Unknown case access level: {self.access_level!r}")

    def is_expired(self, now: datetime | None = None) -> bool:
        if not self.expires_at:
            return False
        try:
            expires = datetime.fromisoformat(self.expires_at)
        except ValueError:
            # A grant whose expiry cannot be parsed is treated as expired:
            # fail closed, never open.
            return True
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        return (now or datetime.now(timezone.utc)) >= expires

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": f"CA_{self.user_id}_{self.case_id}",
            "userId": self.user_id,
            "caseId": self.case_id,
            "accessLevel": self.access_level,
            "grantedBy": self.granted_by,
            "grantedAt": self.granted_at,
            "expiresAt": self.expires_at,
        }


class CaseAccessStore(ABC):
    """Persistence for ``CaseAccess`` rows. Upsert on ``(userId, caseId)``."""

    @abstractmethod
    def get(self, user_id: str, case_id: str) -> CaseAccessGrant | None:
        """The grant row for this user×case, or ``None``."""

    @abstractmethod
    def grant(
        self,
        *,
        user_id: str,
        case_id: str,
        access_level: str,
        granted_by: str,
        expires_at: str | None = None,
    ) -> CaseAccessGrant:
        """Insert or replace the grant row and return it."""


class JsonCaseAccessStore(CaseAccessStore):
    """Stdlib file store mirroring the Prisma ``CaseAccess`` model.

    One JSON document per state dir, the same pattern as ``UserStore`` and
    ``CaseRegistry``. This is the default so the API and its tests run without
    a database; ``CRIMENET_CASE_ACCESS_STORE=prisma`` swaps in the Prisma
    implementation without touching any caller.
    """

    def __init__(self, state_dir: Path | str) -> None:
        self.state_dir = Path(state_dir)
        self.state_dir.mkdir(parents=True, exist_ok=True)
        self._path = self.state_dir / _CASE_ACCESS_FILE
        self._lock = threading.Lock()
        self._data = self._load()

    def _load(self) -> dict[str, Any]:
        if not self._path.exists():
            return {"version": 1, "grants": {}}
        with self._path.open(encoding="utf-8") as handle:
            data = json.load(handle)
        data.setdefault("version", 1)
        data.setdefault("grants", {})
        return data

    def _save(self) -> None:
        tmp = self._path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self._data, indent=2), encoding="utf-8")
        tmp.replace(self._path)

    @staticmethod
    def _key(user_id: str, case_id: str) -> str:
        return f"{user_id}|{case_id}"

    def get(self, user_id: str, case_id: str) -> CaseAccessGrant | None:
        with self._lock:
            row = self._data["grants"].get(self._key(user_id, case_id))
            return CaseAccessGrant(**row) if row else None

    def grant(
        self,
        *,
        user_id: str,
        case_id: str,
        access_level: str,
        granted_by: str,
        expires_at: str | None = None,
    ) -> CaseAccessGrant:
        record = CaseAccessGrant(
            user_id=user_id,
            case_id=case_id,
            access_level=access_level,
            granted_by=granted_by,
            granted_at=_now_iso(),
            expires_at=expires_at,
        )
        with self._lock:
            self._data["grants"][self._key(user_id, case_id)] = asdict(record)
            self._save()
        return record


class PrismaCaseAccessStore(CaseAccessStore):
    """``CaseAccess`` rows through the existing Prisma client.

    prisma-client-py is async-only, so this store owns a private event-loop
    thread and bridges the synchronous FastAPI handlers onto it. The Prisma
    import is deferred to construction: the client needs a generated engine
    and ``DATABASE_URL``, neither of which the file-backed demo stack has, and
    ``CRIMENET_CASE_ACCESS_STORE`` defaults to the JSON store.

    Schema mapping (``model CaseAccess`` in ``prisma/schema.prisma``):
    ``userId``/``caseId`` unique pair, ``accessLevel`` enum, ``grantedById``,
    ``grantedAt``, ``expiresAt``.
    """

    def __init__(self) -> None:
        from prisma import Prisma  # noqa: PLC0415 - opt-in, heavy import

        self._loop = asyncio.new_event_loop()
        self._thread = threading.Thread(
            target=self._run_loop, name="case-access-prisma", daemon=True
        )
        self._thread.start()
        self._client = Prisma()
        self._run(self._client.connect(), timeout=60.0)

    @staticmethod
    def _run_loop() -> None:
        loop = asyncio.get_event_loop()
        loop.run_forever()

    def _run(self, coro: Any, timeout: float = _GRANT_TIMEOUT_SECONDS) -> Any:
        future = asyncio.run_coroutine_threadsafe(coro, self._loop)
        return future.result(timeout=timeout)

    def _row_to_grant(self, row: Any) -> CaseAccessGrant:
        return CaseAccessGrant(
            user_id=row.userId,
            case_id=row.caseId,
            access_level=row.accessLevel.value
            if hasattr(row.accessLevel, "value")
            else str(row.accessLevel),
            granted_by=row.grantedById,
            granted_at=row.grantedAt.isoformat(),
            expires_at=row.expiresAt.isoformat() if row.expiresAt else None,
        )

    def get(self, user_id: str, case_id: str) -> CaseAccessGrant | None:
        row = self._run(
            self._client.caseaccess.find_unique(
                where={"userId_caseId": {"userId": user_id, "caseId": case_id}}
            )
        )
        return self._row_to_grant(row) if row else None

    def grant(
        self,
        *,
        user_id: str,
        case_id: str,
        access_level: str,
        granted_by: str,
        expires_at: str | None = None,
    ) -> CaseAccessGrant:
        row = self._run(
            self._client.caseaccess.upsert(
                where={"userId_caseId": {"userId": user_id, "caseId": case_id}},
                data={
                    "create": {
                        "userId": user_id,
                        "caseId": case_id,
                        "accessLevel": access_level,
                        "grantedById": granted_by,
                        "expiresAt": expires_at,
                    },
                    "update": {
                        "accessLevel": access_level,
                        "grantedById": granted_by,
                        "grantedAt": datetime.now(timezone.utc),
                        "expiresAt": expires_at,
                    },
                },
            )
        )
        return self._row_to_grant(row)


def build_case_access_store(state_dir: Path | str) -> CaseAccessStore:
    """Select the ``CaseAccess`` backend from configuration.

    ``CRIMENET_CASE_ACCESS_STORE=prisma`` uses the Prisma client; anything
    else (the default) uses the file store so the demo and tests stay
    database-free.
    """
    choice = os.environ.get("CRIMENET_CASE_ACCESS_STORE", "json").strip().lower()
    if choice == "json":
        return JsonCaseAccessStore(state_dir)
    if choice == "prisma":
        return PrismaCaseAccessStore()
    raise ValueError(f"Unknown CRIMENET_CASE_ACCESS_STORE: {choice!r}")


# ---------------------------------------------------------------------------
# CaseAccessGuard
# ---------------------------------------------------------------------------
class CaseAccessGuard:
    """Case-scoped authorization layered on top of :func:`requires_roles`.

    The role gate answers *what kind of operation*; this guard answers *which
    cases*. Effective access on one case is the maximum of:

    * **Station baseline** — ADMIN: ADMIN everywhere (global authority);
      SUPERVISOR: ADMIN on its own station's cases; INSPECTOR: WRITE on its
      own station's cases; AUDIT_LOGGER: READ on its own station's cases.
      Cross-station identities get nothing from the baseline.
    * **Creator grant** — whoever opened the case holds ADMIN (the schema's
      "when a Case is created, the creator gets ADMIN access").
    * **Explicit ``CaseAccess`` row** — the stored level, ignored once
      ``expiresAt`` has passed.

    An unknown case still answers 404 (via the registry) so an authorized
    caller sees the same diagnosis it always did; authentication and the
    role check always run *before* this guard, so a missing token is 401
    and a wrong role is 403 even for a case id that does not exist.
    """

    def __init__(self, registry_getter=None, store_getter=None) -> None:
        # Both injected in tests; defaults reach the app's live state.
        self._registry_getter = registry_getter
        self._store_getter = store_getter

    def _store(self) -> CaseAccessStore | None:
        if self._store_getter is not None:
            return self._store_getter()
        from api.app import get_state  # noqa: PLC0415 - cycle break

        try:
            return get_state().case_access
        except Exception:  # pragma: no cover - no live app (unit-level calls)
            return None

    def _registry(self):
        if self._registry_getter is not None:
            return self._registry_getter()
        from api.app import get_registry  # noqa: PLC0415 - cycle break

        return get_registry()

    def effective_level(self, identity: Identity, case: Any) -> str:
        """Highest level this identity holds on ``case`` (``NONE`` if none)."""
        best = "NONE"

        def _consider(level: str) -> None:
            nonlocal best
            if CASE_ACCESS_RANK[level] > CASE_ACCESS_RANK[best]:
                best = level

        # Station baseline: ADMIN is global authority; every other role's
        # baseline applies only to cases registered to its own station.
        if identity.role == "ADMIN":
            _consider("ADMIN")
        elif identity.jurisdiction_id == getattr(case, "jurisdiction_node_id", ""):
            _consider(station_baseline(identity.role))
        if identity.user_id and identity.user_id == getattr(case, "opened_by", ""):
            _consider("ADMIN")

        store = self._store()
        if store is not None and identity.user_id:
            grant = store.get(identity.user_id, getattr(case, "case_id", ""))
            if grant is not None and not grant.is_expired():
                _consider(grant.access_level)
        return best

    def authorize(
        self, identity: Identity, case_id: str, level: str = "WRITE"
    ) -> Any:
        """Grant or refuse ``level`` on ``case_id``; return the case record.

        Raises 404 for an unknown case (unchanged from ``_registry_case``)
        and 403 when the identity's effective level is below ``level``.
        """
        if level not in CASE_ACCESS_RANK:
            raise ValueError(f"Unknown case access level: {level!r}")
        from api.registry import RegistryError  # noqa: PLC0415 - cycle break

        try:
            case = self._registry().get_case(case_id)
        except RegistryError as exc:
            raise HTTPException(404, str(exc)) from exc
        effective = self.effective_level(identity, case)
        if CASE_ACCESS_RANK[effective] < CASE_ACCESS_RANK[level]:
            raise HTTPException(
                403,
                f"Identity {identity.user_id!r} ({identity.role}) has no "
                f"{level} access to case {case_id!r}",
            )
        return case


def requires_case_access(*allowed_roles: str, level: str = "WRITE"):
    """Role gate + case gate as one dependency for ``/api/cases/{case_id}/…``.

    :func:`requires_roles` runs first (401 unauthenticated, 403 wrong role),
    then :class:`CaseAccessGuard` resolves the path's ``case_id`` (404
    unknown) and refuses an identity whose effective case level is below
    ``level`` with 403. FastAPI injects the path parameter into the inner
    dependency by name, so the factory keeps the call site a one-liner.
    """
    role_dependency = requires_roles(*allowed_roles)
    guard = CaseAccessGuard()

    def _checker(
        case_id: str, identity: Identity = Depends(role_dependency)
    ) -> Identity:
        guard.authorize(identity, case_id, level)
        return identity

    return _checker
