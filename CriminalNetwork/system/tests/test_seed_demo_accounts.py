"""Demo account seeding — ``CRIMENET_SEED_DEMO_USERS`` (opt-in, off by default).

The gate protects real deployments: a stock start-up — including the very
first ``bootstrap_admin`` — must never gain demo logins by surprise.
``docker-compose.yml`` turns the gate on for the demo stack, and the accounts
it creates are exactly the five documented in README/SETUP: same emails,
roles and stations the frontend login tests and RBAC matrix assume.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from api.app import app
from api.user_store import (
    DEFAULT_DEMO_PASSWORD,
    DEMO_ACCOUNTS,
    DEMO_PASSWORD_ENV,
    SEED_DEMO_ENV,
    UserStore,
    UserStoreError,
    seed_demo_accounts_from_env,
)

SESSION_SECRET = "mimo-task-seed-demo-secret-0123456789"


@pytest.fixture()
def store(tmp_path):
    """A bare user store — seeding does not need the rest of the API."""
    return UserStore(tmp_path / "state")


def test_gate_is_off_by_default(store):
    """No env, no demo accounts: the safe default for every deployment."""
    assert seed_demo_accounts_from_env(store, environ={}) == []
    assert store.list_users() == []


@pytest.mark.parametrize("value", ["", "0", "false", "no", "off", "maybe"])
def test_falsey_values_do_not_seed(store, value):
    assert (
        seed_demo_accounts_from_env(store, environ={SEED_DEMO_ENV: value}) == []
    )
    assert store.list_users() == []


def test_seeds_the_documented_accounts(store):
    created = seed_demo_accounts_from_env(store, environ={SEED_DEMO_ENV: "1"})

    assert [(u.email, u.role, u.jurisdiction_node_id) for u in created] == [
        (email, role, jurisdiction)
        for email, _name, role, jurisdiction in DEMO_ACCOUNTS
    ]
    assert all(u.status == "ACTIVE" for u in created)

    # Every documented handle signs in with the documented password and
    # carries the role the RBAC matrix expects.
    for email, _name, role, _jurisdiction in DEMO_ACCOUNTS:
        user = store.authenticate(email, DEFAULT_DEMO_PASSWORD)
        assert (user.role, user.status) == (role, "ACTIVE")


def test_password_can_be_overridden_per_environment(store):
    seed_demo_accounts_from_env(
        store,
        environ={SEED_DEMO_ENV: "1", DEMO_PASSWORD_ENV: "S3eded!Passw0rd"},
    )
    assert store.authenticate("admin@crimenet.local", "S3eded!Passw0rd").role == (
        "ADMIN"
    )
    with pytest.raises(UserStoreError, match="Invalid credentials"):
        store.authenticate("admin@crimenet.local", DEFAULT_DEMO_PASSWORD)


def test_seeding_is_idempotent_and_never_resets_an_account(store):
    first = seed_demo_accounts_from_env(store, environ={SEED_DEMO_ENV: "1"})
    assert len(first) == len(DEMO_ACCOUNTS)

    # Rotate the admin credential after the first seed …
    admin = store.get_by_email("admin@crimenet.local")
    assert admin is not None
    store.change_password(admin.id, DEFAULT_DEMO_PASSWORD, "Rotated!Passw0rd")

    # … a second seed creates nothing and leaves that rotation intact.
    assert seed_demo_accounts_from_env(store, environ={SEED_DEMO_ENV: "1"}) == []
    assert len(store.list_users()) == len(DEMO_ACCOUNTS)
    store.authenticate("admin@crimenet.local", "Rotated!Passw0rd")
    store.authenticate("inspector@crimenet.local", DEFAULT_DEMO_PASSWORD)


def test_lifespan_seeds_when_the_env_is_set(tmp_path, monkeypatch):
    """End-to-end wiring: a seeded demo account logs in through the real
    ``/api/auth/login`` route on a live app instance."""
    monkeypatch.setenv("CRIMENET_STATE_DIR", str(tmp_path / "state"))
    monkeypatch.setenv("CRIMENET_SESSION_SECRET", SESSION_SECRET)
    monkeypatch.setenv(SEED_DEMO_ENV, "1")
    monkeypatch.delenv("CRIMENET_AUTH_PROVIDER", raising=False)

    with TestClient(app) as client:
        response = client.post(
            "/api/auth/login",
            json={
                "emailOrBadge": "inspector@crimenet.local",
                "password": DEFAULT_DEMO_PASSWORD,
            },
        )
        assert response.status_code == 200, response.text
        assert response.json()["user"]["role"] == "INSPECTOR"

        token = response.json()["token"]
        me = client.get(
            "/api/auth/me", headers={"Authorization": f"Bearer {token}"}
        )
        assert me.status_code == 200, me.text
        assert me.json()["identity"]["role"] == "INSPECTOR"
        assert (
            me.json()["identity"]["jurisdictionId"]
            == "JURISDICTION_DELHI_CYBERCRIME"
        )
