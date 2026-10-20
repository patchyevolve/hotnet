"""Tests for the persistent user store (TASK-AUTH-01).

Covers the credential engine (PBKDF2 hash format, constant-time verify,
invalid-password refusal), the registration/approval lifecycle, admin
bootstrapping idempotency, role enforcement on approval, case-insensitive
email handling, password rotation, and durability across re-instantiation.
"""

import json
import re
import threading

import pytest

from api.user_store import (
    DEFAULT_JURISDICTION,
    UserRecord,
    UserStore,
    UserStoreError,
)

# PBKDF2 at 600k iterations is intentionally slow; each hash costs ~0.1s, so
# shared credentials are built once per test module where practical.
STRONG_PASSWORD = "S3cure!Passw0rd"
OTHER_PASSWORD = "An0ther!Passw0rd"


def make_store(tmp_path):
    return UserStore(tmp_path)


def make_active_admin(store, email="root@admin.local", name="Root Admin"):
    """Bootstrap an admin and push it through FORCE_PASSWORD_CHANGE -> ACTIVE."""
    admin = store.bootstrap_admin(email, name, STRONG_PASSWORD)
    if admin.status == "FORCE_PASSWORD_CHANGE":
        admin = store.change_password(admin.id, STRONG_PASSWORD, OTHER_PASSWORD)
    return admin


def make_approved_inspector(store, approver, email, name, badge_id=""):
    pending = store.register(
        email, name, STRONG_PASSWORD, DEFAULT_JURISDICTION, badge_id=badge_id
    )
    return store.approve_user(
        pending.id, "INSPECTOR", DEFAULT_JURISDICTION, approver.id
    )


# -- password hashing --------------------------------------------------------


class TestPasswordHashing:
    def test_hash_uses_pbkdf2_prefix_salt_and_hash_fields(self):
        hashed = UserStore.hash_password(STRONG_PASSWORD)
        parts = hashed.split("$")
        assert len(parts) == 3
        assert parts[0] == "pbkdf2_sha25600000"
        # 16-byte salt and 32-byte derived key, hex-encoded.
        assert len(parts[1]) == 32
        assert len(parts[2]) == 64
        int(parts[1], 16)
        int(parts[2], 16)

    def test_hash_is_salted_per_call(self):
        first = UserStore.hash_password(STRONG_PASSWORD)
        second = UserStore.hash_password(STRONG_PASSWORD)
        assert first != second
        assert first.split("$")[1] != second.split("$")[1]

    def test_verify_accepts_correct_password(self):
        hashed = UserStore.hash_password(STRONG_PASSWORD)
        assert UserStore.verify_password(STRONG_PASSWORD, hashed) is True

    def test_verify_rejects_wrong_password(self):
        hashed = UserStore.hash_password(STRONG_PASSWORD)
        assert UserStore.verify_password("wrong-password", hashed) is False
        assert UserStore.verify_password("", hashed) is False

    def test_verify_uses_constant_time_digest_comparison(self, monkeypatch):
        """The final comparison must go through hmac.compare_digest."""
        import hmac as hmac_module

        calls = []
        real_compare = hmac_module.compare_digest

        def spy(a, b):
            calls.append((a, b))
            return real_compare(a, b)

        monkeypatch.setattr("api.user_store.hmac.compare_digest", spy)
        hashed = UserStore.hash_password(STRONG_PASSWORD)
        assert UserStore.verify_password(STRONG_PASSWORD, hashed) is True
        assert calls, "compare_digest was never invoked"

    def test_verify_rejects_malformed_hashes(self):
        assert UserStore.verify_password(STRONG_PASSWORD, "") is False
        assert UserStore.verify_password(STRONG_PASSWORD, "not-a-hash") is False
        assert (
            UserStore.verify_password(STRONG_PASSWORD, "pbkdf2_sha25600000$zz$yy")
            is False
        )
        assert (
            UserStore.verify_password(
                STRONG_PASSWORD, "pbkdf2_sha25600000$00$00"
            )
            is False
        )

    def test_register_refuses_weak_password(self, tmp_path):
        store = make_store(tmp_path)
        with pytest.raises(UserStoreError, match="at least 8"):
            store.register(
                "weak@example.local", "Weak Pass", "short", DEFAULT_JURISDICTION
            )


# -- registration lifecycle --------------------------------------------------


class TestRegistration:
    def test_self_registration_defaults_to_pending_inspector(self, tmp_path):
        store = make_store(tmp_path)
        record = store.register(
            "inspector@example.local",
            "I. Nspector",
            STRONG_PASSWORD,
            "JURISDICTION_DELHI_CYBERCRIME",
            badge_id="BADGE_001",
        )
        assert record.status == "PENDING_APPROVAL"
        assert record.role == "INSPECTOR"
        assert record.id.startswith("USER_")
        assert len(record.id) == len("USER_") + 12
        assert record.jurisdiction_node_id == "JURISDICTION_DELHI_CYBERCRIME"
        assert record.badge_id == "BADGE_001"
        assert record.updated_at is not None

    def test_public_dict_strips_password_hash(self, tmp_path):
        store = make_store(tmp_path)
        record = store.register(
            "public@example.local", "Public User", STRONG_PASSWORD,
            DEFAULT_JURISDICTION,
        )
        payload = record.to_public_dict()
        assert "password_hash" not in payload
        assert payload["email"] == record.email
        assert payload["role"] == record.role

    def test_invalid_email_and_jurisdiction_are_refused(self, tmp_path):
        store = make_store(tmp_path)
        with pytest.raises(UserStoreError, match="email"):
            store.register(
                "not-an-email", "Name", STRONG_PASSWORD, DEFAULT_JURISDICTION
            )
        with pytest.raises(UserStoreError, match="name"):
            store.register("ok@example.local", "", STRONG_PASSWORD,
                           DEFAULT_JURISDICTION)
        with pytest.raises(UserStoreError, match="jurisdiction"):
            store.register(
                "ok@example.local", "Name", STRONG_PASSWORD, "../escape"
            )

    def test_duplicate_email_rejected_case_insensitively(self, tmp_path):
        store = make_store(tmp_path)
        store.register(
            "Dup@example.local", "First User", STRONG_PASSWORD,
            DEFAULT_JURISDICTION,
        )
        with pytest.raises(UserStoreError, match="Email already registered"):
            store.register(
                "dup@EXAMPLE.local", "Second User", STRONG_PASSWORD,
                DEFAULT_JURISDICTION,
            )

    def test_duplicate_badge_rejected(self, tmp_path):
        store = make_store(tmp_path)
        store.register(
            "badge1@example.local", "One", STRONG_PASSWORD, DEFAULT_JURISDICTION,
            badge_id="BADGE_77",
        )
        with pytest.raises(UserStoreError, match="Badge"):
            store.register(
                "badge2@example.local", "Two", STRONG_PASSWORD,
                DEFAULT_JURISDICTION, badge_id="BADGE_77",
            )


# -- authentication ----------------------------------------------------------


class TestAuthenticate:
    def test_valid_active_credentials_return_record(self, tmp_path):
        store = make_store(tmp_path)
        admin = make_active_admin(store)
        user = store.authenticate("root@admin.local", OTHER_PASSWORD)
        assert user.id == admin.id
        assert user.role == "ADMIN"
        assert user.status == "ACTIVE"

    def test_invalid_password_is_refused(self, tmp_path):
        store = make_store(tmp_path)
        admin = make_active_admin(store)
        with pytest.raises(UserStoreError, match="Invalid credentials"):
            store.authenticate(admin.email, "totally-wrong-pass")

    def test_unknown_user_is_refused(self, tmp_path):
        store = make_store(tmp_path)
        with pytest.raises(UserStoreError, match="Invalid credentials"):
            store.authenticate("ghost@example.local", STRONG_PASSWORD)

    def test_pending_approval_account_cannot_authenticate(self, tmp_path):
        store = make_store(tmp_path)
        store.register(
            "pending@example.local", "Pending User", STRONG_PASSWORD,
            DEFAULT_JURISDICTION,
        )
        with pytest.raises(UserStoreError, match="pending approval"):
            store.authenticate("pending@example.local", STRONG_PASSWORD)

    def test_pending_with_wrong_password_gets_generic_error(self, tmp_path):
        store = make_store(tmp_path)
        store.register(
            "pending2@example.local", "Pending Two", STRONG_PASSWORD,
            DEFAULT_JURISDICTION,
        )
        with pytest.raises(UserStoreError, match="Invalid credentials"):
            store.authenticate("pending2@example.local", "wrong-password")

    def test_inactive_account_cannot_authenticate(self, tmp_path):
        store = make_store(tmp_path)
        admin = make_active_admin(store)
        user = make_approved_inspector(
            store, admin, "active@example.local", "Act Iver"
        )
        store.set_status(user.id, "INACTIVE", changed_by_id=admin.id)
        with pytest.raises(UserStoreError, match="inactive"):
            store.authenticate("active@example.local", STRONG_PASSWORD)

    def test_authenticate_by_badge_id(self, tmp_path):
        store = make_store(tmp_path)
        admin = make_active_admin(store)
        user = make_approved_inspector(
            store, admin, "badgey@example.local", "Badge Holder",
            badge_id="BADGE_42",
        )
        authenticated = store.authenticate("BADGE_42", STRONG_PASSWORD)
        assert authenticated.id == user.id


# -- admin bootstrapping -----------------------------------------------------


class TestBootstrapAdmin:
    def test_bootstrap_creates_admin_pending_password_change(self, tmp_path):
        store = make_store(tmp_path)
        assert store.has_admin() is False
        admin = store.bootstrap_admin(
            "root@admin.local", "Root Admin", STRONG_PASSWORD
        )
        assert admin.role == "ADMIN"
        assert admin.status == "FORCE_PASSWORD_CHANGE"
        assert admin.jurisdiction_node_id == DEFAULT_JURISDICTION
        assert store.has_admin() is True

    def test_bootstrap_is_idempotent_for_matching_email(self, tmp_path):
        store = make_store(tmp_path)
        first = store.bootstrap_admin(
            "root@admin.local", "Root Admin", STRONG_PASSWORD
        )
        second = store.bootstrap_admin(
            "ROOT@admin.local", "Root Admin", STRONG_PASSWORD
        )
        assert first.id == second.id
        assert len(store.list_users(role="ADMIN")) == 1

    def test_bootstrap_conflicts_with_different_existing_admin(self, tmp_path):
        store = make_store(tmp_path)
        store.bootstrap_admin("root@admin.local", "Root Admin", STRONG_PASSWORD)
        with pytest.raises(UserStoreError, match="Admin already exists"):
            store.bootstrap_admin(
                "other@admin.local", "Other Admin", STRONG_PASSWORD
            )

    def test_bootstrap_admin_password_can_be_rotated_to_active(self, tmp_path):
        store = make_store(tmp_path)
        admin = store.bootstrap_admin(
            "root@admin.local", "Root Admin", STRONG_PASSWORD
        )
        rotated = store.change_password(
            admin.id, STRONG_PASSWORD, OTHER_PASSWORD
        )
        assert rotated.status == "ACTIVE"
        assert store.authenticate(admin.email, OTHER_PASSWORD).status == "ACTIVE"

    def test_bootstrap_with_wrong_old_password_fails(self, tmp_path):
        store = make_store(tmp_path)
        admin = store.bootstrap_admin(
            "root@admin.local", "Root Admin", STRONG_PASSWORD
        )
        with pytest.raises(UserStoreError, match="Invalid credentials"):
            store.change_password(admin.id, "not-the-seed", OTHER_PASSWORD)


# -- approval / role enforcement ---------------------------------------------


class TestApproveUser:
    def test_admin_approval_transitions_to_active(self, tmp_path):
        store = make_store(tmp_path)
        admin = make_active_admin(store)
        pending = store.register(
            "new.inspector@example.local", "New Inspector", STRONG_PASSWORD,
            DEFAULT_JURISDICTION,
        )
        approved = store.approve_user(
            pending.id, "INSPECTOR", "JURISDICTION_MUMBAI_CYBERCRIME", admin.id
        )
        assert approved.status == "ACTIVE"
        assert approved.role == "INSPECTOR"
        assert approved.jurisdiction_node_id == "JURISDICTION_MUMBAI_CYBERCRIME"
        # The account can now authenticate.
        assert (
            store.authenticate("new.inspector@example.local", STRONG_PASSWORD).id
            == approved.id
        )

    def test_supervisor_approval_and_role_promotion(self, tmp_path):
        store = make_store(tmp_path)
        admin = make_active_admin(store)
        supervisor = make_approved_inspector(
            store, admin, "super@example.local", "Sup Ervisor"
        )
        promoted = store.approve_user(
            supervisor.id, "SUPERVISOR", DEFAULT_JURISDICTION, admin.id
        )
        assert promoted.role == "SUPERVISOR"
        assert promoted.status == "ACTIVE"
        # A supervisor can now approve others.
        newbie = store.register(
            "auditor@example.local", "Aud Itorer", STRONG_PASSWORD,
            DEFAULT_JURISDICTION,
        )
        approved = store.approve_user(
            newbie.id, "AUDIT_LOGGER", DEFAULT_JURISDICTION, promoted.id
        )
        assert approved.role == "AUDIT_LOGGER"
        assert approved.status == "ACTIVE"

    def test_inspector_may_not_approve(self, tmp_path):
        store = make_store(tmp_path)
        admin = make_active_admin(store)
        inspector = make_approved_inspector(
            store, admin, "plain@example.local", "Plain Inspector"
        )
        target = store.register(
            "target@example.local", "Target", STRONG_PASSWORD,
            DEFAULT_JURISDICTION,
        )
        with pytest.raises(UserStoreError, match="Only ADMIN or SUPERVISOR"):
            store.approve_user(
                target.id, "INSPECTOR", DEFAULT_JURISDICTION, inspector.id
            )

    def test_unknown_role_is_refused(self, tmp_path):
        store = make_store(tmp_path)
        admin = make_active_admin(store)
        target = store.register(
            "role.target@example.local", "Target", STRONG_PASSWORD,
            DEFAULT_JURISDICTION,
        )
        with pytest.raises(UserStoreError, match="Unknown role"):
            store.approve_user(
                target.id, "SUPERUSER", DEFAULT_JURISDICTION, admin.id
            )

    def test_unknown_user_and_approver_are_refused(self, tmp_path):
        store = make_store(tmp_path)
        admin = make_active_admin(store)
        target = store.register(
            "missing@example.local", "Missing", STRONG_PASSWORD,
            DEFAULT_JURISDICTION,
        )
        with pytest.raises(UserStoreError, match="Unknown user"):
            store.approve_user(
                "USER_DEADBEEF00", "INSPECTOR", DEFAULT_JURISDICTION, admin.id
            )
        with pytest.raises(UserStoreError, match="Unknown approver"):
            store.approve_user(
                target.id, "INSPECTOR", DEFAULT_JURISDICTION, "USER_NOBODY000"
            )


# -- email lookup ------------------------------------------------------------


class TestEmailLookup:
    def test_get_by_email_is_case_insensitive(self, tmp_path):
        store = make_store(tmp_path)
        record = store.register(
            "Mixed.Case@Example.Local", "Mixed Case", STRONG_PASSWORD,
            DEFAULT_JURISDICTION,
        )
        for variant in (
            "mixed.case@example.local",
            "MIXED.CASE@EXAMPLE.LOCAL",
            "  Mixed.Case@Example.Local  ",
        ):
            found = store.get_by_email(variant)
            assert found is not None
            assert found.id == record.id

    def test_get_by_email_miss_returns_none(self, tmp_path):
        store = make_store(tmp_path)
        assert store.get_by_email("nobody@example.local") is None
        assert store.get_by_email("not-an-email") is None

    def test_stored_email_is_casefolded(self, tmp_path):
        store = make_store(tmp_path)
        record = store.register(
            "Fold@Example.Local", "Fold User", STRONG_PASSWORD,
            DEFAULT_JURISDICTION,
        )
        assert record.email == "fold@example.local"


# -- password change ---------------------------------------------------------


class TestChangePassword:
    def test_change_password_requires_correct_old_password(self, tmp_path):
        store = make_store(tmp_path)
        admin = make_active_admin(store)
        with pytest.raises(UserStoreError, match="Invalid credentials"):
            store.change_password(admin.id, "wrong-old-pass", STRONG_PASSWORD)

    def test_change_password_rotates_credential(self, tmp_path):
        store = make_store(tmp_path)
        admin = make_active_admin(store)
        new_pass = "Br@ndNew!Pass9"
        updated = store.change_password(admin.id, OTHER_PASSWORD, new_pass)
        assert updated.password_hash != admin.password_hash
        assert store.authenticate(admin.email, new_pass).id == admin.id
        with pytest.raises(UserStoreError, match="Invalid credentials"):
            store.authenticate(admin.email, OTHER_PASSWORD)

    def test_new_password_must_differ_from_old(self, tmp_path):
        store = make_store(tmp_path)
        admin = make_active_admin(store)
        with pytest.raises(UserStoreError, match="differ"):
            store.change_password(admin.id, OTHER_PASSWORD, OTHER_PASSWORD)

    def test_change_password_unknown_user(self, tmp_path):
        store = make_store(tmp_path)
        with pytest.raises(UserStoreError, match="Unknown user"):
            store.change_password("USER_MISSING00", STRONG_PASSWORD, OTHER_PASSWORD)


# -- persistence -------------------------------------------------------------


class TestPersistence:
    def test_users_survive_reinstantiation(self, tmp_path):
        store = make_store(tmp_path)
        admin = make_active_admin(store)
        inspector = make_approved_inspector(
            store, admin, "persist@example.local", "Persist User",
            badge_id="BADGE_P1",
        )

        reloaded = UserStore(tmp_path)
        assert reloaded.has_admin() is True
        found = reloaded.get_by_id(inspector.id)
        assert found is not None
        assert found.email == "persist@example.local"
        assert found.badge_id == "BADGE_P1"
        assert found.status == "ACTIVE"
        assert (
            reloaded.authenticate("persist@example.local", STRONG_PASSWORD).id
            == inspector.id
        )
        # The rotated admin credential also survives.
        assert reloaded.authenticate(admin.email, OTHER_PASSWORD).id == admin.id

    def test_users_json_on_disk_has_no_plaintext_and_is_valid_json(self, tmp_path):
        store = make_store(tmp_path)
        make_active_admin(store)
        payload = json.loads((tmp_path / "users.json").read_text("utf-8"))
        assert payload["version"] == 1
        rows = list(payload["users"].values())
        assert rows
        blob = (tmp_path / "users.json").read_text("utf-8")
        assert STRONG_PASSWORD not in blob
        assert OTHER_PASSWORD not in blob
        for row in rows:
            assert re.fullmatch(
                r"pbkdf2_sha25600000\$[0-9a-f]{32}\$[0-9a-f]{64}",
                row["password_hash"],
            )

    def test_store_writes_are_atomic_no_temp_files_left(self, tmp_path):
        store = make_store(tmp_path)
        make_active_admin(store)
        leftovers = [
            path.name
            for path in tmp_path.iterdir()
            if path.name.startswith(".users-")
        ]
        assert leftovers == []

    def test_concurrent_registrations_are_serialised(self, tmp_path):
        store = make_store(tmp_path)
        errors = []

        def worker(index):
            try:
                store.register(
                    f"user{index}@example.local",
                    f"User {index}",
                    STRONG_PASSWORD,
                    DEFAULT_JURISDICTION,
                )
            except Exception as exc:  # pragma: no cover - surfaced via assert
                errors.append(exc)

        threads = [threading.Thread(target=worker, args=(i,)) for i in range(4)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        assert errors == []
        assert len(store.list_users()) == 4
        # File still parses and holds every account.
        payload = json.loads((tmp_path / "users.json").read_text("utf-8"))
        assert len(payload["users"]) == 4


# -- listing / lifecycle helpers ---------------------------------------------


class TestListing:
    def test_list_users_filters(self, tmp_path):
        store = make_store(tmp_path)
        admin = make_active_admin(store)
        inspector = make_approved_inspector(
            store, admin, "list.inspector@example.local", "List Inspector"
        )
        store.register(
            "list.pending@example.local", "Pending Person", STRONG_PASSWORD,
            "JURISDICTION_JAIPUR_CYBERCRIME",
        )
        assert [row.id for row in store.list_users(status="ACTIVE")] == sorted(
            {admin.id, inspector.id}
        )
        # Self-registration defaults to INSPECTOR, so both the approved
        # inspector and the still-pending registrant match the role filter.
        assert [
            row.id for row in store.list_users(role="INSPECTOR")
        ] == sorted(
            {
                inspector.id,
                store.get_by_email("list.pending@example.local").id,
            }
        )
        assert [
            row.id
            for row in store.list_users(
                status="ACTIVE", role="INSPECTOR"
            )
        ] == [inspector.id]
        assert len(
            store.list_users(
                jurisdiction_node_id="JURISDICTION_JAIPUR_CYBERCRIME"
            )
        ) == 1

    def test_get_by_id_miss_returns_none(self, tmp_path):
        store = make_store(tmp_path)
        assert store.get_by_id("USER_ABSENT0000") is None

    def test_user_record_round_trips_from_disk(self, tmp_path):
        store = make_store(tmp_path)
        admin = make_active_admin(store)
        raw = UserStore(tmp_path).get_by_id(admin.id)
        assert isinstance(raw, UserRecord)
        assert raw.to_dict()["id"] == admin.id
