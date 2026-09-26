"""Tests for Stage 11: Global Entity Push.

Covers identity signal extraction, cross-case matching rules
(phone > account > name_exact > name_fuzzy, same entity_type only),
signal absorption, deterministic global IDs, and file-output integrity.
"""

import json
from pathlib import Path

import pytest

from src.global_push.engine import (
    GlobalPushEngine,
    extract_identity_signals,
    match_identity,
    _absorb_signals,
    _new_global_id,
    _canon_phone,
    _canon_account,
)


# ── signal extraction ─────────────────────────────────────────────────

def test_extract_signals_basic():
    sig = extract_identity_signals({
        "id": "RES_1", "entity_type": "PERSON", "canonical_name": "Rakesh Kumar",
        "aliases": ["Rakesh", "RK"], "phones": ["9876 543210", "+91-98765-43210"],
        "accounts": ["hdfc 0001234"], "addresses": [],
        "created_at": "2026-01-01T00:00:00", "updated_at": "2026-01-02T00:00:00",
    })
    assert sig["entity_id"] == "RES_1"
    assert sig["phones"] == ["+919876543210", "9876543210"] or sig["phones"] == ["9876543210"]
    assert "HDFC0001234" in sig["accounts"]
    assert "Rakesh Kumar" in sig["names"] and "RK" in sig["names"]
    assert "" not in sig["norm_names"]


def test_canonicalizers():
    assert _canon_phone("+91-98765 43210") == "+919876543210"
    assert _canon_account(" hdfc 0001 234 ") == "HDFC0001234"


def test_extract_signals_empty_safe():
    sig = extract_identity_signals({"id": "RES_2", "entity_type": "DATE",
                                    "canonical_name": "", "aliases": []})
    assert sig["phones"] == [] and sig["norm_names"] == []


# ── matching rules ────────────────────────────────────────────────────

def _g(**kw):
    base = {"canonical_id": "G1", "entity_type": "PERSON",
            "phones": [], "accounts": [], "norm_names": []}
    base.update(kw)
    return base


def test_phone_exact_beats_name():
    a = _g(phones=["9876543210"], norm_names=["totally different"])
    sig = {"entity_type": "PERSON", "phones": ["9876543210"],
           "accounts": [], "norm_names": ["someone else"]}
    m = match_identity(sig, [a])
    assert m is not None and m[1] == "phone_exact" and m[2] == 0.99


def test_account_exact():
    a = _g(accounts=["HDFC0001234"], norm_names=["unrelated"])
    sig = {"entity_type": "PERSON", "phones": [], "accounts": ["hdfc0001234"],
           "norm_names": ["another name"]}
    m = match_identity(sig, [a])
    assert m is not None and m[1] == "account_exact"


def test_name_exact():
    a = _g(norm_names=["rakesh kumar"])
    sig = {"entity_type": "PERSON", "phones": [], "accounts": [],
           "norm_names": ["rakesh kumar"]}
    m = match_identity(sig, [a])
    assert m is not None and m[1] == "name_exact"


def test_name_fuzzy_min_sim():
    a = _g(norm_names=["amit sharma"])
    sig = {"entity_type": "PERSON", "phones": [], "accounts": [],
           "norm_names": ["amit sharmaa"]}  # ratio ~0.956 >= 0.92
    m = match_identity(sig, [a])
    assert m is not None and m[1] == "name_fuzzy"
    assert m[2] >= 0.92


def test_fuzzy_below_threshold_no_match():
    a = _g(norm_names=["amit sharma"])
    sig = {"entity_type": "PERSON", "phones": [], "accounts": [],
           "norm_names": ["amit kumar"]}  # ratio well below 0.92
    assert match_identity(sig, [a]) is None


# ── digit guard (root-caused over-merge regression) ───────────────────
# Char-ratio similarity alone linked different dates (12 vs 14 March 2024,
# ratio 0.923) and different amounts (Rs. 5,00,000 vs Rs. 15,00,000, ~0.96).

def test_fuzzy_digit_guard_blocks_different_dates():
    a = _g(canonical_id="G_DATE12", entity_type="DATE",
           norm_names=["12 march 2024"])
    sig = {"entity_type": "DATE", "phones": [], "accounts": [],
           "norm_names": ["14 march 2024"]}
    assert match_identity(sig, [a]) is None


def test_fuzzy_digit_guard_blocks_different_amounts():
    a = _g(canonical_id="G_AMT5", entity_type="AMOUNT",
           norm_names=["rs 5 00 000"])
    sig = {"entity_type": "AMOUNT", "phones": [], "accounts": [],
           "norm_names": ["rs 15 00 000"]}
    assert match_identity(sig, [a]) is None


def test_fuzzy_allows_same_digits_different_format():
    """'12th March 2024' and '12 March 2024' are the same date — digit
    runs match, so the fuzzy link must succeed."""
    a = _g(canonical_id="G_DATE12B", entity_type="DATE",
           norm_names=["12 march 2024"])
    sig = {"entity_type": "DATE", "phones": [], "accounts": [],
           "norm_names": ["12th march 2024"]}
    m = match_identity(sig, [a])
    assert m is not None and m[1] == "name_fuzzy"


def test_fuzzy_digit_guard_one_sided_digits():
    """A digit-free name must not fuzzy-link to a digit-bearing variant
    ('Lajpat Nagar' vs 'Lajpat Nagar 2' are different locations)."""
    a = _g(canonical_id="G_LOC", entity_type="LOCATION",
           norm_names=["lajpat nagar"])
    sig = {"entity_type": "LOCATION", "phones": [], "accounts": [],
           "norm_names": ["lajpat nagar 2"]}
    assert match_identity(sig, [a]) is None


def test_same_entity_type_required():
    """A PERSON must never link to a PHONE/LOCATION global, even with a
    shared phone number."""
    phone_global = _g(canonical_id="G_PHONE", entity_type="PHONE",
                      phones=["9876543210"], norm_names=["9876543210"])
    sig = {"entity_type": "PERSON", "phones": ["9876543210"],
           "accounts": [], "norm_names": ["rakesh kumar"]}
    assert match_identity(sig, [phone_global]) is None


def test_no_match_returns_none():
    a = _g(norm_names=["delhi police"], phones=[], accounts=[])
    sig = {"entity_type": "PERSON", "phones": [], "accounts": [],
           "norm_names": ["meena devi"]}
    assert match_identity(sig, [a]) is None


def test_priority_phone_over_name():
    by_phone = _g(canonical_id="G_PHONE_MATCH", phones=["9876543210"], norm_names=["x"])
    by_name = _g(canonical_id="G_NAME_MATCH", phones=[], norm_names=["rakesh kumar"])
    sig = {"entity_type": "PERSON", "phones": ["9876543210"], "accounts": [],
           "norm_names": ["rakesh kumar"]}
    m = match_identity(sig, [by_name, by_phone])
    assert m is not None and m[0]["canonical_id"] == "G_PHONE_MATCH"


# ── absorption + ids ──────────────────────────────────────────────────

def test_absorb_signals_unions_and_seen_window():
    g = {"phones": ["111"], "accounts": [], "addresses": ["A"],
         "norm_names": ["old"], "names": ["Old"],
         "first_seen": "2026-01-05T00:00:00", "last_seen": "2026-01-06T00:00:00"}
    sig = {"phones": ["222"], "accounts": ["HDFC1"], "addresses": ["B"],
           "norm_names": ["new"], "names": ["New"],
           "created_at": "2026-01-01T00:00:00", "updated_at": "2026-01-10T00:00:00"}
    _absorb_signals(g, sig)
    assert set(g["phones"]) == {"111", "222"}
    assert g["accounts"] == ["HDFC1"]
    assert set(g["names"]) == {"Old", "New"}
    assert g["first_seen"] == "2026-01-01T00:00:00"
    assert g["last_seen"] == "2026-01-10T00:00:00"


def test_global_id_deterministic_and_content_sensitive():
    sig = {"entity_type": "PERSON", "canonical_name": "Rakesh Kumar",
           "phones": ["9876543210"], "accounts": []}
    assert _new_global_id(sig) == _new_global_id(dict(sig))
    other = dict(sig, phones=["9999999999"])
    assert _new_global_id(sig) != _new_global_id(other)


def test_workspace_export_uses_database_wide_links_and_alert_members(tmp_path):
    """A one-case run must export the shared workspace's complete DB view."""
    class Cursor:
        def __init__(self):
            self.rows = []

        def execute(self, query):
            if 'FROM "GlobalEntity"' in query:
                self.rows = [("G_SHARED", "PERSON", "Demo Person", ["9876543210"],
                              [], [], None, None, 2, 2)]
            elif 'FROM "GlobalEntityLink"' in query:
                self.rows = [
                    ("L1", "G_SHARED", "CASE_A", "RES_A", "JUR_A", 0.99,
                     "phone_exact", None),
                    ("L2", "G_SHARED", "CASE_B", "RES_B", "JUR_B", 0.99,
                     "phone_exact", None),
                ]
            elif 'FROM "CrossCaseAlert"' in query:
                self.rows = [("A1", "G_SHARED", "MEDIUM", "Review identity",
                              None, "ACTIVE", None, None)]
            elif 'FROM "CrossCaseAlertCase"' in query:
                self.rows = [("A1", "CASE_A", "JUR_A"),
                             ("A1", "CASE_B", "JUR_B")]

        def fetchall(self):
            return self.rows

        def close(self):
            pass

    class Connection:
        def cursor(self):
            return Cursor()

    GlobalPushEngine()._write_workspace_index(tmp_path, Connection())
    links = json.loads((tmp_path / "global_entity_links.json").read_text())
    alerts = json.loads((tmp_path / "cross_case_alerts.json").read_text())
    assert {link["case_id"] for link in links} == {"CASE_A", "CASE_B"}
    assert alerts[0]["case_ids"] == ["CASE_A", "CASE_B"]
    assert alerts[0]["jurisdiction_node_ids"] == ["JUR_A", "JUR_B"]
    assert alerts[0]["status"] == "ACTIVE"


# ── pipeline integration (files) ──────────────────────────────────────

def _output_dir() -> Path:
    return Path(__file__).resolve().parent.parent / "output_geo"


def test_push_file_only_outputs():
    """push() without case_id must write all three stage files with
    referential integrity: one link per resolved entity, every link's
    global present in the globals file."""
    out = _output_dir()
    if not (out / "resolved_entities.json").exists():
        pytest.skip("output_geo not present — run pipeline first")

    summary = GlobalPushEngine().push(output_dir=str(out), case_id=None)

    assert summary["mode"] == "file_only"
    assert summary["entities_pushed"] == summary["links"]

    globals_f = json.loads((out / "global_entities.json").read_text(encoding="utf-8"))
    links_f = json.loads((out / "global_entity_links.json").read_text(encoding="utf-8"))
    alerts_f = json.loads((out / "cross_case_alerts.json").read_text(encoding="utf-8"))

    assert len(links_f) == summary["entities_pushed"]
    assert all(l["global_entity_id"] in globals_f for l in links_f)
    assert len({l["local_entity_id"] for l in links_f}) == len(links_f)
    assert all(l["match_type"] in
               {"phone_exact", "account_exact", "name_exact", "name_fuzzy", "new_identity"}
               for l in links_f)
    for g in globals_f.values():
        assert g["canonical_id"] and g["entity_type"]
    assert isinstance(alerts_f, list)


def test_push_is_idempotent_on_files():
    """Second push over the same output must produce the same link set: one
    link per local entity, no duplicates, globals re-matched or recreated
    deterministically."""
    out = _output_dir()
    if not (out / "resolved_entities.json").exists():
        pytest.skip("output_geo not present — run pipeline first")

    first = GlobalPushEngine().push(output_dir=str(out), case_id=None)
    second = GlobalPushEngine().push(output_dir=str(out), case_id=None)
    assert second["links"] == first["links"]
    links = json.loads((out / "global_entity_links.json").read_text(encoding="utf-8"))
    assert len(links) == second["links"]
    assert len({l["local_entity_id"] for l in links}) == len(links)
