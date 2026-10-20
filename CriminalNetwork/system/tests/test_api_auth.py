"""Credential authentication API and provider integration (TASK-AUTH-02).

Drives ``/api/auth/*`` through a live ``TestClient`` on an isolated state
directory, then checks the seams the rest of the suite depends on:

* registration always lands ``PENDING_APPROVAL`` and can never log in;
* an ADMIN bootstrapped through the store logs in and is recognised by
  ``/api/auth/me``;
* approval (through ``user_store``) is what turns a signup into a login;
* ``/api/auth/change-password`` rotates the credential, kills the old one,
  and promotes the bootstrap admin out of ``FORCE_PASSWORD_CHANGE``;
* ``/api/session`` and the guarded case routes keep behaving exactly as
  before, so the picker demo and ``test_api_views`` are untouched.

Isolation: ``CRIMENET_STATE_DIR`` is a fresh ``tmp_path`` per test,
``CRIMENET_SESSION_SECRET`` is pinned so mint and verify share one key, and
``CRIMENET_AUTH_PROVIDER`` is cleared so the suite sees the default picker
provider — credential tokens must therefore verify *without* the swap being
flipped. ``credential_client`` turns the swap on deliberately to cover
``get_provider()`` in credential mode.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from api.app import app, get_user_store
from api.identity import (
    CredentialIdentityProvider,
    IdentityError,
    SessionIdentityProvider,
    get_provider,
)
from api.user_store import DEFAULT_JURISDICTION, UserStore

ADMIN_EMAIL = "root@admin.local"
ADMIN_PASSWORD = "Adm1n!Passw0rd"
ACTIVE_ADMIN_PASSWORD = "Adm1n!Rotated0"
OFFICER_PASSWORD = "In5pector!Passw0rd"
ROTATED_PASSWORD = "R0tated!Passw0rd"
SESSION_SECRET = "mimo-task-auth02-credential-secret-0123456789"


@pytest.fixture()
def client(tmp_path, monkeypatch):
    """A live app bound to an isolated state directory.

    ``with TestClient(app)`` runs the lifespan, which is what constructs
    ``ApiState`` (and therefore the ``UserStore`` every auth route uses).
    The provider env var is cleared so a ``CRIMENET_AUTH_PROVIDER`` exported
    in the developer's shell cannot change what this suite exercises.
    """
    monkeypatch.setenv("CRIMENET_STATE_DIR", str(tmp_path / "state"))
    monkeypatch.setenv("CRIMENET_SESSION_SECRET", SESSION_SECRET)
    monkeypatch.delenv("CRIMENET_AUTH_PROVIDER", raising=False)
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def store(client):
    """The app's own user store — the same object the routes write through."""
    return get_user_store()


@pytest.fixture()
def credential_client(client, monkeypatch):
    """The same app with ``CRIMENET_AUTH_PROVIDER=credential`` (the swap)."""
    monkeypatch.setenv("CRIMENET_AUTH_PROVIDER", "credential")
    return client


def _register(
    client,
    email,
    name,
    password,
    jurisdiction=DEFAULT_JURISDICTION,
    badge="",
):
    return client.post(
        "/api/auth/register",
        json={
            "email": email,
            "name": name,
            "password": password,
            "jurisdictionId": jurisdiction,
            "badgeId": badge,
        },
    )


def _login(client, email_or_badge, password):
    return client.post(
        "/api/auth/login",
        json={"emailOrBadge": email_or_badge, "password": password},
    )


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _sign_up_and_approve(store, email, name, role="INSPECTOR"):
    """Register an account and push it to ACTIVE the way a supervisor would.

    Returns ``(admin, approved)`` so a test can keep using the approver.
    """
    pending = store.register(email, name, OFFICER_PASSWORD, DEFAULT_JURISDICTION)
    admin = store.bootstrap_admin(ADMIN_EMAIL, "Root Admin", ADMIN_PASSWORD)
    approved = store.approve_user(
        pending.id, role, DEFAULT_JURISDICTION, admin.id
    )
    return admin, approved


# -- registration -------------------------------------------------------------


def test_registration_lands_a_pending_inspector(client):
    """Signup never grants a role: 201, PENDING_APPROVAL, and the password
    material stays server-side."""
    response = _register(
        client,
        email="sharma@example.local",
        name="Insp. Sharma",
        password=OFFICER_PASSWORD,
        badge="BADGE-77",
    )

    assert response.status_code == 201, response.text
    payload = response.json()
    assert payload["message"] == "Registration submitted for supervisor approval"
    user = payload["user"]
    assert user["status"] == "PENDING_APPROVAL"
    assert user["role"] == "INSPECTOR"
    assert user["email"] == "sharma@example.local"
    assert user["jurisdiction_node_id"] == DEFAULT_JURISDICTION
    assert user["badge_id"] == "BADGE-77"
    assert "password_hash" not in user
    assert set(payload) == {"user", "message"}


def test_registration_rejects_a_duplicate_email(client):
    """The store already enforces uniqueness; the route surfaces it as 400."""
    first = _register(client, "dupe@example.local", "Dupe One", OFFICER_PASSWORD)
    assert first.status_code == 201, first.text

    second = _register(client, "DUPE@example.local", "Dupe Two", OFFICER_PASSWORD)

    assert second.status_code == 400
    assert second.json()["detail"] == "Email already registered"


# -- login gatekeeping --------------------------------------------------------


def test_pending_account_cannot_log_in(client):
    """A signup is not a login: 403 with the store's own refusal message."""
    assert (
        _register(client, "pending@example.local", "Pending Pat", OFFICER_PASSWORD).status_code
        == 201
    )

    response = _login(client, "pending@example.local", OFFICER_PASSWORD)

    assert response.status_code == 403
    assert response.json()["detail"] == "Account pending approval"


def test_unknown_account_and_wrong_password_share_one_401(client, store):
    """Probing must not distinguish "never registered" from "wrong password"."""
    _sign_up_and_approve(store, "known@example.local", "Known Officer")

    unknown = _login(client, "nobody@example.local", OFFICER_PASSWORD)
    wrong = _login(client, "known@example.local", "NotThePassword1")

    assert unknown.status_code == 401
    assert wrong.status_code == 401
    assert unknown.json()["detail"] == wrong.json()["detail"] == "Invalid credentials"


def test_inactive_account_is_refused_with_403(client, store):
    """Deactivation is a lifecycle refusal (403), not a credential miss."""
    admin, approved = _sign_up_and_approve(store, "suspended@example.local", "Susp. Inder")
    store.set_status(approved.id, "INACTIVE", changed_by_id=admin.id)

    response = _login(client, "suspended@example.local", OFFICER_PASSWORD)

    assert response.status_code == 403
    assert response.json()["detail"] == "Account is inactive"


def test_login_accepts_a_badge_id_as_well_as_the_email(client, store):
    """``emailOrBadge`` is literal: either identifier reaches the same row,
    and an identifier nothing registered stays the plain 401 miss."""
    pending = store.register(
        "bnum@example.local", "Badge Nine", OFFICER_PASSWORD,
        DEFAULT_JURISDICTION, badge_id="BADGE-9",
    )
    admin = store.bootstrap_admin(ADMIN_EMAIL, "Root Admin", ADMIN_PASSWORD)
    store.approve_user(pending.id, "INSPECTOR", DEFAULT_JURISDICTION, admin.id)

    by_email = _login(client, "bnum@example.local", OFFICER_PASSWORD)
    by_badge = _login(client, "BADGE-9", OFFICER_PASSWORD)

    assert by_email.status_code == 200, by_email.text
    assert by_badge.status_code == 200, by_badge.text
    assert by_badge.json()["user"]["id"] == pending.id
    assert _login(client, "BADGE-404", OFFICER_PASSWORD).status_code == 401


# -- bootstrap admin + /api/auth/me -------------------------------------------


def test_bootstrap_admin_logs_in_and_is_recognised_by_me(client, store):
    """The first ADMIN can authenticate straight away and ``/api/auth/me``
    answers with the signed identity *and* the store row behind it."""
    admin = store.bootstrap_admin(ADMIN_EMAIL, "Root Admin", ADMIN_PASSWORD)
    assert admin.role == "ADMIN"
    assert admin.status == "FORCE_PASSWORD_CHANGE"

    login = _login(client, ADMIN_EMAIL, ADMIN_PASSWORD)
    assert login.status_code == 200, login.text
    assert set(login.json()) == {"token", "user"}
    assert login.json()["user"]["role"] == "ADMIN"
    token = login.json()["token"]
    assert token

    me = client.get("/api/auth/me", headers=_auth(token))
    assert me.status_code == 200, me.text
    body = me.json()
    assert set(body) == {"identity", "user"}
    assert body["identity"] == {
        "userId": admin.id,
        "displayName": "Root Admin",
        "role": "ADMIN",
        "jurisdictionId": DEFAULT_JURISDICTION,
        "provider": "credential",
    }
    assert body["user"]["id"] == admin.id
    assert body["user"]["email"] == ADMIN_EMAIL
    assert "password_hash" not in body["user"]


def test_me_rejects_missing_and_invalid_bearer_tokens(client, store):
    """401 for a missing header, a token that never verifies, and one whose
    signature no longer matches its payload."""
    _sign_up_and_approve(store, "me@example.local", "Me Officer")
    token = _login(client, "me@example.local", OFFICER_PASSWORD).json()["token"]

    tampered = token[:-4] + ("AAAA" if not token.endswith("AAAA") else "BBBB")

    assert client.get("/api/auth/me").status_code == 401
    for bad in ("not-a-token", "signed.by-nothing", tampered, ""):
        response = client.get("/api/auth/me", headers=_auth(bad))
        assert response.status_code == 401, f"token {bad!r} -> {response.status_code}"
    assert client.get("/api/auth/me", headers=_auth(token)).status_code == 200


def test_me_serves_a_picker_identity_without_a_store_row(client):
    """A session-picker identity is accepted but has no account, so ``user``
    is null rather than the route rejecting the token it just verified."""
    session = client.post(
        "/api/session",
        json={
            "displayName": "Picker Officer",
            "role": "INSPECTOR",
            "jurisdictionId": "JURISDICTION_DEFAULT",
        },
    )
    assert session.status_code == 200, session.text

    response = client.get(
        "/api/auth/me", headers=_auth(session.json()["token"])
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["identity"]["provider"] == "session"
    assert body["user"] is None


# -- approval lifecycle -------------------------------------------------------


def test_admin_approval_turns_a_signup_into_a_login(client, store):
    """Approval happens through ``user_store``; afterwards the same password
    that was refused with 403 logs in with 200."""
    assert (
        _register(client, "hire@example.local", "Insp. Hire", OFFICER_PASSWORD).status_code
        == 201
    )
    assert _login(client, "hire@example.local", OFFICER_PASSWORD).status_code == 403

    admin = store.bootstrap_admin(ADMIN_EMAIL, "Root Admin", ADMIN_PASSWORD)
    pending = store.get_by_email("hire@example.local")
    approved = store.approve_user(
        pending.id, "INSPECTOR", DEFAULT_JURISDICTION, admin.id
    )
    assert approved.status == "ACTIVE"

    response = _login(client, "hire@example.local", OFFICER_PASSWORD)

    assert response.status_code == 200, response.text
    assert response.json()["user"]["status"] == "ACTIVE"
    assert response.json()["user"]["role"] == "INSPECTOR"
    me = client.get(
        "/api/auth/me", headers=_auth(response.json()["token"])
    )
    assert me.status_code == 200
    assert me.json()["identity"]["userId"] == approved.id


def test_credential_token_authorises_a_guarded_route(client, store):
    """The token from ``/api/auth/login`` must satisfy ``require_roles``
    exactly like a picker token — RBAC reads the signed role either way."""
    _sign_up_and_approve(store, "sup@example.local", "Sup. Menon", role="SUPERVISOR")
    token = _login(client, "sup@example.local", OFFICER_PASSWORD).json()["token"]

    created = client.post(
        "/api/cases",
        headers=_auth(token),
        json={"firNumber": "FIR/2026/900", "title": "Credential-signed case"},
    )

    assert created.status_code == 201, created.text
    assert created.json()["id"].startswith("CASE_")


# -- password rotation --------------------------------------------------------


def test_change_password_rotates_the_credential(client, store):
    """The forced change on the bootstrap admin both rotates the password
    (old one dies, new one signs in) and promotes the account to ACTIVE."""
    store.bootstrap_admin(ADMIN_EMAIL, "Root Admin", ADMIN_PASSWORD)
    token = _login(client, ADMIN_EMAIL, ADMIN_PASSWORD).json()["token"]

    changed = client.post(
        "/api/auth/change-password",
        headers=_auth(token),
        json={"oldPassword": ADMIN_PASSWORD, "newPassword": ROTATED_PASSWORD},
    )

    assert changed.status_code == 200, changed.text
    assert changed.json()["message"] == "Password updated successfully"
    assert changed.json()["user"]["status"] == "ACTIVE"
    assert "password_hash" not in changed.json()["user"]

    assert _login(client, ADMIN_EMAIL, ADMIN_PASSWORD).status_code == 401
    relogin = _login(client, ADMIN_EMAIL, ROTATED_PASSWORD)
    assert relogin.status_code == 200, relogin.text
    assert relogin.json()["user"]["status"] == "ACTIVE"


def test_change_password_requires_a_matching_old_password(client, store):
    """Rotation never becomes a reset: the caller must still prove the old
    credential, and the account cannot be re-typed into a known state."""
    _sign_up_and_approve(store, "rotate@example.local", "Rotate Rao")
    token = _login(client, "rotate@example.local", OFFICER_PASSWORD).json()["token"]

    response = client.post(
        "/api/auth/change-password",
        headers=_auth(token),
        json={"oldPassword": "WrongOld!Pass1", "newPassword": ROTATED_PASSWORD},
    )
    same = client.post(
        "/api/auth/change-password",
        headers=_auth(token),
        json={
            "oldPassword": OFFICER_PASSWORD,
            "newPassword": OFFICER_PASSWORD,
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid credentials"
    assert same.status_code == 400
    assert _login(client, "rotate@example.local", OFFICER_PASSWORD).status_code == 200


def test_change_password_requires_a_valid_token(client, store):
    _sign_up_and_approve(store, "guard@example.local", "Guard Rao")

    assert (
        client.post(
            "/api/auth/change-password",
            json={"oldPassword": OFFICER_PASSWORD, "newPassword": ROTATED_PASSWORD},
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/auth/change-password",
            headers=_auth("forged.token"),
            json={"oldPassword": OFFICER_PASSWORD, "newPassword": ROTATED_PASSWORD},
        ).status_code
        == 401
    )


# -- backward compatibility: the picker and the case routes --------------------


def test_picker_session_and_case_routes_are_unaffected(client):
    """The demo sign-in flow every existing test uses must be byte-for-byte
    unchanged: same payload, same response shape, same guarded mutations."""
    session = client.post(
        "/api/session",
        json={
            "displayName": "Admin Rao",
            "role": "ADMIN",
            "jurisdictionId": "JURISDICTION_DEFAULT",
        },
    )
    assert session.status_code == 200, session.text
    body = session.json()
    assert set(body) == {"identity", "token"}
    assert body["identity"]["provider"] == "session"
    headers = _auth(body["token"])

    assert client.get("/api/me", headers=headers).json()["role"] == "ADMIN"

    created = client.post(
        "/api/cases",
        headers=headers,
        json={"firNumber": "FIR/2026/001", "title": "Picker-signed case"},
    )
    assert created.status_code == 201, created.text
    assert [row["id"] for row in client.get("/api/cases").json()] == [
        created.json()["id"]
    ]


def test_picker_tokens_still_refuse_unauthenticated_mutations(client):
    """Unauthenticated POSTs stay 401 after the account endpoints landed."""
    response = client.post(
        "/api/cases",
        json={"firNumber": "FIR/2026/002", "title": "Anonymous"},
    )

    assert response.status_code == 401


# -- provider selection -------------------------------------------------------


def test_get_provider_swaps_to_the_credential_seam(client, monkeypatch):
    """``CRIMENET_AUTH_PROVIDER=credential`` is the documented switch: it must
    hand back a provider wired to the very state directory the app runs on."""
    monkeypatch.setenv("CRIMENET_AUTH_PROVIDER", "credential")

    provider = get_provider()

    assert isinstance(provider, CredentialIdentityProvider)
    assert provider.user_store is not None
    assert provider.user_store.state_dir == Path(os.environ["CRIMENET_STATE_DIR"])

    monkeypatch.delenv("CRIMENET_AUTH_PROVIDER")
    assert isinstance(get_provider(), SessionIdentityProvider)


def test_credential_start_refuses_missing_configuration_and_credentials(tmp_path):
    """Misconfiguration and empty payloads are identity errors, never a
    silently minted token."""
    bare = CredentialIdentityProvider(secret=b"s" * 32)
    with pytest.raises(IdentityError, match="no user store"):
        bare.start({"email": "any@example.local", "password": "whatever123"})

    provider = CredentialIdentityProvider(
        user_store=UserStore(tmp_path), secret=b"s" * 32
    )
    with pytest.raises(IdentityError, match="email_or_badge and password"):
        provider.start({"password": "whatever123"})
    with pytest.raises(IdentityError, match="Invalid credentials"):
        provider.start({"email": "any@example.local", "password": "whatever123"})


def test_credential_start_mints_the_store_identity(tmp_path):
    """``start`` is the picker's twin: same contract, but the identity — and
    therefore the signed token — comes from the account record."""
    user_store = UserStore(tmp_path)
    admin = user_store.bootstrap_admin(ADMIN_EMAIL, "Root Admin", ADMIN_PASSWORD)
    user_store.change_password(admin.id, ADMIN_PASSWORD, ACTIVE_ADMIN_PASSWORD)
    provider = CredentialIdentityProvider(user_store=user_store, secret=b"s" * 32)

    identity, token = provider.start(
        {"email": ADMIN_EMAIL, "password": ACTIVE_ADMIN_PASSWORD}
    )

    assert identity.user_id == admin.id
    assert identity.display_name == "Root Admin"
    assert identity.role == "ADMIN"
    assert identity.jurisdiction_id == DEFAULT_JURISDICTION
    assert identity.provider == "credential"
    assert provider.verify(token) == identity

    with pytest.raises(IdentityError, match="Invalid credentials"):
        provider.start({"email": ADMIN_EMAIL, "password": "WrongPassword1"})


# -- credential mode (CRIMENET_AUTH_PROVIDER=credential) -----------------------


def test_account_endpoints_work_in_credential_mode(credential_client, store):
    """With the swap flipped, the whole account flow still runs — and the
    picker it replaced is refused rather than silently bypassing credentials."""
    registered = _register(
        credential_client, "mode@example.local", "Mode Officer", OFFICER_PASSWORD
    )
    assert registered.status_code == 201, registered.text
    assert (
        _login(credential_client, "mode@example.local", OFFICER_PASSWORD).status_code
        == 403
    )

    store.bootstrap_admin(ADMIN_EMAIL, "Root Admin", ADMIN_PASSWORD)
    login = _login(credential_client, ADMIN_EMAIL, ADMIN_PASSWORD)
    assert login.status_code == 200, login.text
    token = login.json()["token"]

    me = credential_client.get("/api/auth/me", headers=_auth(token))
    assert me.status_code == 200, me.text
    assert me.json()["identity"]["provider"] == "credential"

    changed = credential_client.post(
        "/api/auth/change-password",
        headers=_auth(token),
        json={"oldPassword": ADMIN_PASSWORD, "newPassword": ROTATED_PASSWORD},
    )
    assert changed.status_code == 200, changed.text
    assert (
        _login(credential_client, ADMIN_EMAIL, ROTATED_PASSWORD).status_code == 200
    )

    picker = credential_client.post(
        "/api/session",
        json={
            "displayName": "Anyone At All",
            "role": "ADMIN",
            "jurisdictionId": "JURISDICTION_DEFAULT",
        },
    )
    assert picker.status_code == 400
