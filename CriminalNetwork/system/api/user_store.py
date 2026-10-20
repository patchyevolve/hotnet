"""Persistent user store with PBKDF2 credential hashing (RBAC bootstrap).

Implements the credential seam that ``api/identity.py`` has reserved since the
picker-based session provider shipped: a thread-safe, atomically persisted
``users.json`` holding accounts, their PBKDF2 password hashes, RBAC roles and
the approval lifecycle.

Lifecycle::

    register()            -> PENDING_APPROVAL   (role: INSPECTOR)
    approve_user()        -> ACTIVE             (role set by approver)
    bootstrap_admin()     -> FORCE_PASSWORD_CHANGE  (the very first ADMIN)
    change_password()     -> ACTIVE             (clears FORCE_PASSWORD_CHANGE)
    deactivate (by store) -> INACTIVE           (auth refused)

Persistence follows :class:`api.registry.CaseRegistry`: one JSON document per
state directory, written via temp-file + ``os.replace`` so a crash mid-write
can never leave a half-written store. Passwords are never persisted in
plaintext; hashing uses ``hashlib.pbkdf2_hmac`` (standard library only) with a
fresh 16-byte random salt per password and 600,000 iterations, encoded as
``pbkdf2_sha25600000$<salt_hex>$<hash_hex>``. Verification is constant-time
via :func:`hmac.compare_digest`.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import tempfile
import threading
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Final

USERS_FILE: Final[str] = "users.json"

ROLES: Final[tuple[str, ...]] = (
    "ADMIN",
    "SUPERVISOR",
    "INSPECTOR",
    "AUDIT_LOGGER",
)
DEFAULT_ROLE: Final[str] = "INSPECTOR"

STATUS_PENDING_APPROVAL: Final[str] = "PENDING_APPROVAL"
STATUS_FORCE_PASSWORD_CHANGE: Final[str] = "FORCE_PASSWORD_CHANGE"
STATUS_ACTIVE: Final[str] = "ACTIVE"
STATUS_INACTIVE: Final[str] = "INACTIVE"
STATUSES: Final[tuple[str, ...]] = (
    STATUS_PENDING_APPROVAL,
    STATUS_FORCE_PASSWORD_CHANGE,
    STATUS_ACTIVE,
    STATUS_INACTIVE,
)

#: Roles allowed to approve a pending account into ACTIVE.
#: Mirrors ``require_roles("ADMIN", "SUPERVISOR")`` in ``api/app.py``.
APPROVER_ROLES: Final[frozenset[str]] = frozenset({"ADMIN", "SUPERVISOR"})

DEFAULT_JURISDICTION: Final[str] = "JURISDICTION_DEFAULT"

# The encoded prefix doubles as a version tag: the iteration count is baked
# into the string so a future cost bump can verify old hashes without a
# separate field. 600,000 iterations × SHA-256 is the current OWASP-recommended
# floor for PBKDF2-HMAC-SHA256.
_PBKDF2_PREFIX: Final[str] = "pbkdf2_sha25600000"
_PBKDF2_ITERATIONS: Final[int] = 600_000
_PBKDF2_SALT_BYTES: Final[int] = 16
_PBKDF2_DKLEN: Final[int] = 32

_MIN_PASSWORD_LENGTH: Final[int] = 8
_MAX_PASSWORD_LENGTH: Final[int] = 512
_MAX_EMAIL_LENGTH: Final[int] = 254
_MAX_NAME_LENGTH: Final[int] = 80
_MAX_BADGE_LENGTH: Final[int] = 40

# Deliberately conservative: one @, a dotted domain, no whitespace, no
# control characters. This is a "does this look like an email at all" gate
# for a credential store, not an RFC 5322 parser.
_EMAIL_RE: Final[re.Pattern[str]] = re.compile(
    r"^[^@\s\0]+@[^@\s\0.]+(?:\.[^@\s\0.]+)+$"
)


class UserStoreError(ValueError):
    """Raised when a user-store operation cannot be satisfied."""


def _now() -> str:
    return (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def _is_safe_segment(value: str) -> bool:
    """Reject path traversal and separators before a value reaches a path."""
    if not value or value in {".", ".."}:
        return False
    if "/" in value or "\\" in value or "\0" in value:
        return False
    if value != value.strip():
        return False
    return True


@dataclass
class UserRecord:
    """One account on disk. ``password_hash`` never leaves via public views."""

    id: str
    email: str
    name: str
    password_hash: str
    role: str
    status: str
    jurisdiction_node_id: str
    badge_id: str = ""
    created_at: str = ""
    updated_at: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def to_public_dict(self) -> dict[str, Any]:
        """Wire-safe view: everything except the password material."""
        payload = self.to_dict()
        payload.pop("password_hash", None)
        return payload


class UserStore:
    """Thread-safe, file-backed user account store.

    One ``users.json`` per state directory, mirroring ``CaseRegistry``:
    in-memory dictionary, ``threading.Lock`` around every read-modify-write,
    atomic temp-file replacement on save. Re-instantiating against the same
    ``state_dir`` reloads the durable state.
    """

    def __init__(self, state_dir: Path | str) -> None:
        self.state_dir = Path(state_dir)
        self._path = self.state_dir / USERS_FILE
        self._lock = threading.Lock()
        self._data = self._load()

    # -- persistence ------------------------------------------------------
    def _load(self) -> dict[str, Any]:
        if not self._path.exists():
            return {"version": 1, "user_seq": 0, "users": {}}
        with self._path.open(encoding="utf-8") as handle:
            data = json.load(handle)
        for key, default in (("user_seq", 0), ("users", {})):
            data.setdefault(key, default)
        if not isinstance(data["users"], dict):
            raise UserStoreError("users.json is corrupt: users must be an object")
        return data

    def _save(self) -> None:
        """Persist atomically: temp file in the same dir, then replace."""
        self._path.parent.mkdir(parents=True, exist_ok=True)
        handle = tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=str(self._path.parent),
            prefix=".users-",
            suffix=".tmp",
            delete=False,
        )
        tmp = handle.name
        try:
            with handle:
                json.dump(self._data, handle, indent=2, ensure_ascii=False)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(tmp, self._path)
        except BaseException:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise

    # -- credentials ------------------------------------------------------
    @staticmethod
    def hash_password(password: str) -> str:
        """PBKDF2-HMAC-SHA256, 600k iterations, fresh 16-byte random salt."""
        if not isinstance(password, str) or not password:
            raise UserStoreError("password must be a non-empty string")
        salt = secrets.token_bytes(_PBKDF2_SALT_BYTES)
        digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt,
            _PBKDF2_ITERATIONS,
            dklen=_PBKDF2_DKLEN,
        )
        return f"{_PBKDF2_PREFIX}${salt.hex()}${digest.hex()}"

    @staticmethod
    def verify_password(password: str, hashed: str) -> bool:
        """Constant-time password check. Never raises on malformed input."""
        if not isinstance(password, str) or not isinstance(hashed, str):
            return False
        parts = hashed.split("$")
        if len(parts) != 3 or parts[0] != _PBKDF2_PREFIX:
            return False
        try:
            salt = bytes.fromhex(parts[1])
        except ValueError:
            return False
        if len(salt) != _PBKDF2_SALT_BYTES:
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt,
            _PBKDF2_ITERATIONS,
            dklen=_PBKDF2_DKLEN,
        )
        return hmac.compare_digest(digest.hex(), parts[2])

    @staticmethod
    def _validate_password(password: str, *, field: str = "password") -> str:
        if not isinstance(password, str) or not password:
            raise UserStoreError(f"{field} must be a non-empty string")
        if len(password) < _MIN_PASSWORD_LENGTH:
            raise UserStoreError(
                f"{field} must be at least {_MIN_PASSWORD_LENGTH} characters"
            )
        if len(password) > _MAX_PASSWORD_LENGTH:
            raise UserStoreError(
                f"{field} must be at most {_MAX_PASSWORD_LENGTH} characters"
            )
        return password

    # -- validation -------------------------------------------------------
    @staticmethod
    def _validate_email(email: str) -> str:
        if not isinstance(email, str) or not email.strip():
            raise UserStoreError("email is required")
        candidate = email.strip()
        if len(candidate) > _MAX_EMAIL_LENGTH or not _EMAIL_RE.match(candidate):
            raise UserStoreError("email is not a valid address")
        return candidate.casefold()

    @staticmethod
    def _validate_name(name: str) -> str:
        if not isinstance(name, str) or not name.strip():
            raise UserStoreError("name is required")
        candidate = name.strip()
        if len(candidate) > _MAX_NAME_LENGTH:
            raise UserStoreError(
                f"name must be at most {_MAX_NAME_LENGTH} characters"
            )
        if not _is_safe_segment(candidate):
            raise UserStoreError("name contains unsupported characters")
        return candidate

    @staticmethod
    def _validate_jurisdiction(jurisdiction_node_id: str) -> str:
        if not isinstance(jurisdiction_node_id, str):
            raise UserStoreError("jurisdiction_node_id must be a safe identifier")
        candidate = jurisdiction_node_id.strip()
        if not _is_safe_segment(candidate):
            raise UserStoreError("jurisdiction_node_id must be a safe identifier")
        return candidate

    @staticmethod
    def _validate_role(role: str) -> str:
        candidate = (role or "").strip().upper()
        if candidate not in ROLES:
            raise UserStoreError(f"Unknown role: {role!r}")
        return candidate

    @staticmethod
    def _validate_status(status: str) -> str:
        candidate = (status or "").strip().upper()
        if candidate not in STATUSES:
            raise UserStoreError(f"Unknown status: {status!r}")
        return candidate

    @staticmethod
    def _validate_badge(badge_id: str) -> str:
        if not isinstance(badge_id, str):
            raise UserStoreError("badge_id must be text")
        candidate = badge_id.strip()
        if not candidate:
            return ""
        if len(candidate) > _MAX_BADGE_LENGTH or not _is_safe_segment(candidate):
            raise UserStoreError("badge_id is not a safe identifier")
        return candidate

    # -- internal helpers (call with lock held) ---------------------------
    def _find_by_email(self, email_folded: str) -> dict[str, Any] | None:
        for row in self._data["users"].values():
            if str(row.get("email", "")).casefold() == email_folded:
                return row
        return None

    def _find_by_badge(self, badge_id: str) -> dict[str, Any] | None:
        if not badge_id:
            return None
        for row in self._data["users"].values():
            if str(row.get("badge_id", "")) == badge_id:
                return row
        return None

    def _next_user_id(self) -> str:
        self._data["user_seq"] = int(self._data.get("user_seq", 0)) + 1
        return "USER_" + secrets.token_hex(6).upper()

    def _create(
        self,
        *,
        email: str,
        name: str,
        password_hash: str,
        role: str,
        status: str,
        jurisdiction_node_id: str,
        badge_id: str,
    ) -> UserRecord:
        if self._find_by_email(email) is not None:
            raise UserStoreError("Email already registered")
        if badge_id and self._find_by_badge(badge_id) is not None:
            raise UserStoreError("Badge ID already registered")
        now = _now()
        record = UserRecord(
            id=self._next_user_id(),
            email=email,
            name=name,
            password_hash=password_hash,
            role=role,
            status=status,
            jurisdiction_node_id=jurisdiction_node_id,
            badge_id=badge_id,
            created_at=now,
            updated_at=now,
        )
        self._data["users"][record.id] = record.to_dict()
        self._save()
        return record

    # -- public API -------------------------------------------------------
    def register(
        self,
        email: str,
        name: str,
        password: str,
        jurisdiction_node_id: str,
        badge_id: str = "",
    ) -> UserRecord:
        """Self-registration. Always PENDING_APPROVAL / INSPECTOR.

        Nobody grants themselves a role: the account cannot authenticate
        until an ADMIN or SUPERVISOR calls :meth:`approve_user`.
        """
        email_folded = self._validate_email(email)
        clean_name = self._validate_name(name)
        self._validate_password(password)
        jurisdiction = self._validate_jurisdiction(jurisdiction_node_id)
        badge = self._validate_badge(badge_id)
        password_hash = self.hash_password(password)
        with self._lock:
            return self._create(
                email=email_folded,
                name=clean_name,
                password_hash=password_hash,
                role=DEFAULT_ROLE,
                status=STATUS_PENDING_APPROVAL,
                jurisdiction_node_id=jurisdiction,
                badge_id=badge,
            )

    def authenticate(self, email_or_badge: str, password: str) -> UserRecord:
        """Check credentials and the account lifecycle.

        Wrong password and unknown account share one error message so probing
        cannot enumerate registered addresses.
        """
        if not isinstance(email_or_badge, str) or not email_or_badge.strip():
            raise UserStoreError("Invalid credentials")
        if not isinstance(password, str) or not password:
            raise UserStoreError("Invalid credentials")
        key = email_or_badge.strip()
        with self._lock:
            row = self._find_by_email(key.casefold())
            if row is None:
                row = self._find_by_badge(key)
            if row is None or not self.verify_password(password, row["password_hash"]):
                raise UserStoreError("Invalid credentials")
            status = str(row.get("status", ""))
            if status == STATUS_PENDING_APPROVAL:
                raise UserStoreError("Account pending approval")
            if status == STATUS_INACTIVE:
                raise UserStoreError("Account is inactive")
            return UserRecord(**row)

    def approve_user(
        self,
        user_id: str,
        role: str,
        jurisdiction_node_id: str,
        approved_by_id: str,
    ) -> UserRecord:
        """Grant a pending (or existing) account a role and ACTIVE status.

        Only an existing ADMIN or SUPERVISOR may approve — the pending user's
        chosen role is never trusted, and the approver is audited by id.
        """
        clean_role = self._validate_role(role)
        jurisdiction = self._validate_jurisdiction(jurisdiction_node_id)
        with self._lock:
            raw = self._data["users"].get(user_id)
            if raw is None:
                raise UserStoreError(f"Unknown user: {user_id}")
            approver = self._data["users"].get(approved_by_id)
            if approver is None:
                raise UserStoreError(f"Unknown approver: {approved_by_id}")
            if str(approver.get("role", "")) not in APPROVER_ROLES:
                raise UserStoreError(
                    "Only ADMIN or SUPERVISOR accounts may approve users"
                )
            raw["role"] = clean_role
            raw["status"] = STATUS_ACTIVE
            raw["jurisdiction_node_id"] = jurisdiction
            raw["updated_at"] = _now()
            self._save()
            return UserRecord(**raw)

    def bootstrap_admin(
        self,
        email: str,
        name: str,
        password: str,
        jurisdiction_node_id: str = DEFAULT_JURISDICTION,
    ) -> UserRecord:
        """Create the very first ADMIN, or return the existing one.

        The bootstrap account starts in FORCE_PASSWORD_CHANGE: the seed
        password is a bootstrap secret, not a login credential, so the first
        sign-in must replace it before the account settles into ACTIVE
        (see :meth:`change_password`).
        """
        email_folded = self._validate_email(email)
        clean_name = self._validate_name(name)
        self._validate_password(password)
        jurisdiction = self._validate_jurisdiction(jurisdiction_node_id)
        password_hash = self.hash_password(password)
        with self._lock:
            admins = [
                row
                for row in self._data["users"].values()
                if str(row.get("role", "")) == "ADMIN"
            ]
            if admins:
                for row in admins:
                    if str(row.get("email", "")).casefold() == email_folded:
                        return UserRecord(**row)
                raise UserStoreError("Admin already exists")
            return self._create(
                email=email_folded,
                name=clean_name,
                password_hash=password_hash,
                role="ADMIN",
                status=STATUS_FORCE_PASSWORD_CHANGE,
                jurisdiction_node_id=jurisdiction,
                badge_id="",
            )

    def has_admin(self) -> bool:
        with self._lock:
            return any(
                str(row.get("role", "")) == "ADMIN"
                for row in self._data["users"].values()
            )

    def list_users(
        self,
        status: str | None = None,
        jurisdiction_node_id: str | None = None,
        role: str | None = None,
    ) -> list[UserRecord]:
        """Filtered listing, deterministic by user id."""
        clean_status = self._validate_status(status) if status else None
        clean_role = self._validate_role(role) if role else None
        clean_jurisdiction = (
            self._validate_jurisdiction(jurisdiction_node_id)
            if jurisdiction_node_id
            else None
        )
        with self._lock:
            rows = []
            for key in sorted(self._data["users"]):
                row = self._data["users"][key]
                if clean_status is not None and row.get("status") != clean_status:
                    continue
                if clean_role is not None and row.get("role") != clean_role:
                    continue
                if (
                    clean_jurisdiction is not None
                    and row.get("jurisdiction_node_id") != clean_jurisdiction
                ):
                    continue
                rows.append(UserRecord(**row))
            return rows

    def get_by_id(self, user_id: str) -> UserRecord | None:
        with self._lock:
            raw = self._data["users"].get(user_id)
            return UserRecord(**raw) if raw is not None else None

    def get_by_email(self, email: str) -> UserRecord | None:
        """Case-insensitive lookup; invalid email shapes simply miss."""
        try:
            email_folded = self._validate_email(email)
        except UserStoreError:
            return None
        with self._lock:
            raw = self._find_by_email(email_folded)
            return UserRecord(**raw) if raw is not None else None

    def change_password(
        self, user_id: str, old_password: str, new_password: str
    ) -> UserRecord:
        """Rotate a credential after verifying the old one.

        Completing a forced change also promotes the account out of
        FORCE_PASSWORD_CHANGE into ACTIVE — otherwise a bootstrap admin could
        never reach ACTIVE, and nobody could ever approve anyone again.
        """
        self._validate_password(old_password, field="old_password")
        self._validate_password(new_password, field="new_password")
        if old_password == new_password:
            raise UserStoreError("New password must differ from the old password")
        new_hash = self.hash_password(new_password)
        with self._lock:
            raw = self._data["users"].get(user_id)
            if raw is None:
                raise UserStoreError(f"Unknown user: {user_id}")
            if not self.verify_password(old_password, raw["password_hash"]):
                raise UserStoreError("Invalid credentials")
            raw["password_hash"] = new_hash
            raw["updated_at"] = _now()
            if raw.get("status") == STATUS_FORCE_PASSWORD_CHANGE:
                raw["status"] = STATUS_ACTIVE
            self._save()
            return UserRecord(**raw)

    def set_status(
        self, user_id: str, status: str, *, changed_by_id: str
    ) -> UserRecord:
        """Lifecycle transition (e.g. deactivation). ADMIN/SUPERVISOR only.

        Kept explicit rather than hidden inside ``approve_user``: suspending
        an ACTIVE inspector and approving a PENDING one are different
        operations with different audit meaning.
        """
        clean_status = self._validate_status(status)
        with self._lock:
            raw = self._data["users"].get(user_id)
            if raw is None:
                raise UserStoreError(f"Unknown user: {user_id}")
            actor = self._data["users"].get(changed_by_id)
            if actor is None:
                raise UserStoreError(f"Unknown actor: {changed_by_id}")
            if str(actor.get("role", "")) not in APPROVER_ROLES:
                raise UserStoreError(
                    "Only ADMIN or SUPERVISOR accounts may change user status"
                )
            raw["status"] = clean_status
            raw["updated_at"] = _now()
            self._save()
            return UserRecord(**raw)
