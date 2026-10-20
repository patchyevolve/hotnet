"""Pluggable identity layer.

The product ships with a *session identity picker* (no credentials), but the
caller must be able to swap in real credential auth without touching any
route. That is the whole point of this module: every route depends only on
:class:`IdentityProvider`, never on a concrete implementation.

Swapping to credential auth
---------------------------
:class:`CredentialIdentityProvider` is implemented against the persistent
user store (``api/user_store.py``) behind ``POST /api/auth/*``. Turning the
picker off is configuration only:

1. Set ``CRIMENET_AUTH_PROVIDER=credential``.
2. Nothing else changes: tokens are issued and verified identically, and
   ``filed_by_id`` / ``jurisdiction_node_id`` keep flowing into the manifest.

Until that flag is set the picker stays the active provider, so the demo
workflow keeps working while ``/api/auth/*`` already issues real credentials.

Why tokens are server-signed
----------------------------
A picker means the user *chooses* their own role, so the client is untrusted
by construction. Signing keeps identity server-issued: the client stores a
token it cannot forge, so a hand-edited ``X-Role: ADMIN`` header is rejected
rather than silently escalated. With credential auth the same signature check
keeps meaning "the server vouches for this identity" — now vouching for an
account out of the user store rather than for a picker selection.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import time
from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Final

from api.user_store import UserRecord, UserStore, UserStoreError

# Mirrors `Role` in frontend types.ts. Adding a role is a frontend + backend
# change together; keeping them as data here avoids a second hardcoded list.
ROLES: Final[tuple[str, ...]] = (
    "INSPECTOR",
    "SUPERVISOR",
    "ADMIN",
    "AUDIT_LOGGER",
)

DEFAULT_ROLE: Final[str] = "INSPECTOR"

# Jurisdictions the pipeline understands. Stage 11's global entity push keys
# off this value, so it must be a safe, stable identifier rather than free text.
JURISDICTIONS: Final[tuple[str, ...]] = (
    "JURISDICTION_DELHI_CYBERCRIME",
    "JURISDICTION_MUMBAI_CYBERCRIME",
    "JURISDICTION_JAIPUR_CYBERCRIME",
    "JURISDICTION_HYDERABAD_CYBERCRIME",
    "JURISDICTION_DEFAULT",
)

DEFAULT_JURISDICTION: Final[str] = "JURISDICTION_DEFAULT"

_TOKEN_TTL_SECONDS: Final[int] = 12 * 60 * 60
_MAX_NAME_LENGTH: Final[int] = 80
_HMAC_ALGORITHM: Final[str] = "sha256"


class IdentityError(ValueError):
    """Raised when a submitted identity or token is not acceptable."""


def _is_safe_segment(value: str) -> bool:
    """Reject path traversal and separators before a value reaches a path."""
    if not value or value in {".", ".."}:
        return False
    if "/" in value or "\\" in value or "\0" in value:
        return False
    if value != value.strip():
        return False
    return True


@dataclass(frozen=True)
class Identity:
    """Who is acting, and under whose authority."""

    user_id: str
    display_name: str
    role: str
    jurisdiction_id: str
    provider: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def make_user_id(display_name: str, role: str, jurisdiction_id: str) -> str:
    """Derive a stable ``filed_by_id`` for the FIR manifest.

    Deterministic so re-signing-in as the same person in the same jurisdiction
    keeps the same id, which matters because ``filed_by_id`` lands in durable
    evidence provenance.
    """
    material = "|".join(
        (display_name.strip().casefold(), role, jurisdiction_id)
    ).encode("utf-8")
    digest = hashlib.sha256(material).hexdigest()[:12].upper()
    return f"USER_{digest}"


def _validate_role(role: str) -> str:
    candidate = (role or "").strip().upper()
    if candidate not in ROLES:
        raise IdentityError(f"Unknown role: {role!r}")
    return candidate


def _validate_jurisdiction(jurisdiction_id: str) -> str:
    candidate = (jurisdiction_id or "").strip()
    if not _is_safe_segment(candidate):
        raise IdentityError("jurisdiction_id must be a safe non-empty identifier")
    return candidate


def _validate_display_name(display_name: str) -> str:
    candidate = (display_name or "").strip()
    if not candidate:
        raise IdentityError("display_name must not be empty")
    if len(candidate) > _MAX_NAME_LENGTH:
        raise IdentityError(
            f"display_name must be at most {_MAX_NAME_LENGTH} characters"
        )
    if not _is_safe_segment(candidate):
        raise IdentityError("display_name contains unsupported characters")
    return candidate


def load_signing_secret() -> bytes:
    """Return the token signing secret.

    Precedence: ``CRIMENET_SESSION_SECRET`` env var, else a 0600 file under the
    API state directory (generated on first use), else an ephemeral secret.

    The last fallback is deliberately *not* a committed constant: a fixed
    in-repo secret would let anyone forge an admin token from source alone.
    """
    env_secret = os.environ.get("CRIMENET_SESSION_SECRET")
    if env_secret:
        if len(env_secret) < 32:
            raise IdentityError(
                "CRIMENET_SESSION_SECRET must be at least 32 characters"
            )
        return env_secret.encode("utf-8")

    state_dir = Path(os.environ.get("CRIMENET_STATE_DIR", _default_state_dir()))
    state_dir.mkdir(parents=True, exist_ok=True)
    secret_path = state_dir / "session.secret"
    if secret_path.exists():
        # Only line endings: a full strip() would drop whitespace bytes that
        # random binary keys legitimately start or end with, so the bytes read
        # back would differ from the bytes handed to the first provider and
        # every later token would fail its signature check.
        existing = secret_path.read_bytes().rstrip(b"\r\n")
        if existing:
            return existing

    # Hex is ASCII, so the key can never begin or end with a whitespace byte:
    # what is written is exactly what the next boot reads.
    generated = secrets.token_hex(32).encode("ascii")
    # 0600: only the service account may read the signing key.
    fd = os.open(secret_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        os.write(fd, generated)
    finally:
        os.close(fd)
    return generated


def _default_state_dir() -> str:
    return str(Path(__file__).resolve().parent / ".state")


def _b64url(data: bytes) -> str:
    import base64

    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(value: str) -> bytes:
    import base64

    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


class IdentityProvider(ABC):
    """The seam real credential auth plugs into."""

    #: Stable name recorded inside every token so tokens cannot be replayed
    #: across providers (a session token must not verify as a credential token).
    name: str = "abstract"

    @abstractmethod
    def start(self, payload: dict[str, Any]) -> tuple[Identity, str]:
        """Exchange a sign-in payload for an identity and a bearer token."""

    @abstractmethod
    def verify(self, token: str) -> Identity:
        """Validate a bearer token. Raises :class:`IdentityError` if unusable."""


class _SignedTokenMixin:
    """Shared token minting/verification for every provider."""

    _secret: bytes

    def _mint(self, identity: Identity) -> str:
        body = dict(identity.to_dict())
        body["iat"] = int(time.time())
        body["exp"] = body["iat"] + _TOKEN_TTL_SECONDS
        encoded = _b64url(
            json.dumps(body, separators=(",", ":"), sort_keys=True).encode("utf-8")
        )
        signature = hmac.new(
            self._secret, encoded.encode("ascii"), hashlib.sha256
        ).hexdigest()
        return f"{encoded}.{signature}"

    def verify(self, token: str) -> Identity:
        if not token or token.count(".") != 1:
            raise IdentityError("Malformed token")
        encoded, supplied = token.split(".", 1)
        expected = hmac.new(
            self._secret, encoded.encode("ascii"), hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(expected, supplied):
            raise IdentityError("Token signature mismatch")

        try:
            body = json.loads(_b64url_decode(encoded))
        except (ValueError, TypeError) as exc:  # noqa: PERF203 - untrusted input
            raise IdentityError("Token payload is not readable") from exc

        if not isinstance(body, dict):
            raise IdentityError("Token payload must be an object")
        if body.get("provider") != self.name:
            raise IdentityError(
                f"Token was issued by {body.get('provider')!r}, not {self.name!r}"
            )

        now = int(time.time())
        exp = body.get("exp")
        if not isinstance(exp, int) or exp < now:
            raise IdentityError("Token has expired")
        iat = body.get("iat")
        if not isinstance(iat, int) or iat > now + 60:
            raise IdentityError("Token was issued in the future")

        try:
            role = _validate_role(str(body.get("role", "")))
            jurisdiction = _validate_jurisdiction(
                str(body.get("jurisdiction_id", ""))
            )
            display_name = _validate_display_name(str(body.get("display_name", "")))
        except IdentityError:
            raise
        user_id = str(body.get("user_id") or "")
        if not _is_safe_segment(user_id):
            raise IdentityError("Token user_id is not a safe identifier")

        return Identity(
            user_id=user_id,
            display_name=display_name,
            role=role,
            jurisdiction_id=jurisdiction,
            provider=self.name,
        )


class SessionIdentityProvider(_SignedTokenMixin, IdentityProvider):
    """Picker-based identity: no credentials, server-issued signed token.

    Honest about what it is. It authenticates *nobody* — it only stops the
    client from editing its own role after sign-in, and gives the API a stable
    ``user_id`` / ``jurisdiction_id`` to stamp onto evidence and runs.
    """

    name = "session"

    def __init__(self, secret: bytes | None = None) -> None:
        self._secret = secret if secret is not None else load_signing_secret()

    def start(self, payload: dict[str, Any]) -> tuple[Identity, str]:
        display_name = _validate_display_name(str(payload.get("display_name", "")))
        role = _validate_role(str(payload.get("role", DEFAULT_ROLE)))
        jurisdiction = _validate_jurisdiction(
            str(payload.get("jurisdiction_id", DEFAULT_JURISDICTION))
        )
        identity = Identity(
            user_id=make_user_id(display_name, role, jurisdiction),
            display_name=display_name,
            role=role,
            jurisdiction_id=jurisdiction,
            provider=self.name,
        )
        return identity, self._mint(identity)


class CredentialIdentityProvider(_SignedTokenMixin, IdentityProvider):
    """Real credential auth: identity is read back from the user store.

    Same two methods as the picker, same signed tokens — the only difference
    is *where* the identity comes from. ``start`` exchanges an email (or badge
    id) plus password for a :class:`api.user_store.UserRecord`, and the record
    supplies the user id, role and jurisdiction that every route and manifest
    downstream already reads off :class:`Identity`.

    The store is optional at construction so the class can be imported (and
    its tokens *verified*) without a state directory; using ``start`` without
    one is a configuration error, not a silent accept.
    """

    name = "credential"

    def __init__(
        self,
        user_store: UserStore | None = None,
        secret: bytes | None = None,
    ) -> None:
        self.user_store = user_store
        self._secret = secret if secret is not None else load_signing_secret()

    def _identity_for(self, user: UserRecord) -> Identity:
        return Identity(
            user_id=user.id,
            display_name=user.name,
            role=user.role,
            jurisdiction_id=user.jurisdiction_node_id,
            provider=self.name,
        )

    def issue(self, user: UserRecord) -> tuple[Identity, str]:
        """Mint a token for an account that has already been authenticated.

        Kept separate from :meth:`start` so callers that verified the password
        themselves (``POST /api/auth/login``) do not pay for a second PBKDF2
        round just to get a token.
        """
        identity = self._identity_for(user)
        return identity, self._mint(identity)

    def start(self, payload: dict[str, Any]) -> tuple[Identity, str]:
        if self.user_store is None:
            raise IdentityError(
                "Credential auth has no user store; "
                "set CRIMENET_AUTH_PROVIDER=credential"
            )
        email_or_badge = str(
            payload.get("email_or_badge")
            or payload.get("emailOrBadge")
            or payload.get("email")
            or ""
        ).strip()
        password = str(payload.get("password") or "")
        if not email_or_badge or not password:
            raise IdentityError("email_or_badge and password are required")
        try:
            user = self.user_store.authenticate(email_or_badge, password)
        except UserStoreError as exc:
            raise IdentityError(str(exc)) from exc
        return self.issue(user)


def _resolve_state_dir(state_dir: Path | str | None) -> Path:
    if state_dir is not None:
        return Path(state_dir)
    return Path(os.environ.get("CRIMENET_STATE_DIR") or _default_state_dir())


def get_provider(state_dir: Path | str | None = None) -> IdentityProvider:
    """Select the active provider from configuration.

    ``state_dir`` is where the credential provider reads ``users.json`` from;
    the app passes its own so provider and ``ApiState`` can never disagree
    about which store is the real one.
    """
    choice = os.environ.get("CRIMENET_AUTH_PROVIDER", "session").strip().lower()
    if choice == "session":
        return SessionIdentityProvider()
    if choice == "credential":
        return CredentialIdentityProvider(
            user_store=UserStore(_resolve_state_dir(state_dir))
        )
    raise IdentityError(f"Unknown CRIMENET_AUTH_PROVIDER: {choice!r}")
