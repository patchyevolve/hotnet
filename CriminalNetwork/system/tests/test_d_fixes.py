"""Regression tests for the D1–D9 semantic-fix batch.

Each test locks one root-caused defect from the semantic audit:
  D1  FIR Name:/Phone: block association → key persons get phones
  D3  Devanagari transliteration → cross-script name resolution
  D3b single-token typo rule → "नेहरू नगर" ≈ "Nehru Nagar"
  D4  id-suffix strip → 'suresh_kumar_01' merges with 'Suresh Kumar'
  D5  ORG acronym/expansion structural merges (pnb/hdfc/boB)
  D7  junk-entity drops (lowercase GPE, header ORG, artifact prune)
  D9  temporal contradiction ID dedup
  D2  cross-file adversarial finalize flags exactly {30,31,32,33}
"""

import json
from pathlib import Path

import pytest

from src.models.schema import SourceMetadata
from src.resolution.rule_pass import normalize_name, rule_pass, fuzzy_name_match
from src.resolution.translit import transliterate_devanagari
from src.temporal.engine import TemporalEngine
from src.temporal.schema import create_temporal_info, create_spatial_info

DEMO = Path(__file__).resolve().parents[2] / "demo_data"


def _e(eid, name, etype):
    return {"id": eid, "name": name, "entity_type": etype, "attributes": {}}


# ── D3: Devanagari transliteration ─────────────────────────────────────

def test_transliteration_corpus_names():
    assert transliterate_devanagari("मीना देवी") == "meena devee"
    assert transliterate_devanagari("राजेश कुमार") == "rajesh kumar"
    assert transliterate_devanagari("नेहरू नगर") == "neharu nagar"
    # Non-Devanagari passes through untouched
    assert transliterate_devanagari("Hello 123") == "Hello 123"


def test_normalize_cross_script_and_ids():
    # PERSON: synthetic id-style suffixes are identity handles, dropped
    assert normalize_name("suresh_kumar_01", "PERSON") == "suresh kumar"
    assert normalize_name("meena_devi_2024", "PERSON") == "meena"
    assert normalize_name("Meena Devi", "PERSON") == "meena"
    assert normalize_name("मीना देवी", "PERSON") == "meena devee"
    # Unknown entity type: conservative — trailing digits survive
    assert normalize_name("suresh_kumar_01") == "suresh kumar 01"
    # Non-PERSON: trailing digits are signal, never stripped
    assert normalize_name("Camera 5", "LOCATION") == "camera 5"
    assert normalize_name("Flat 4b", "LOCATION") == "flat 4b"


def test_normalize_type_scoping_blocks_location_collisions():
    # The unscoped digit-strip merged distinct locations via exact_name_match
    loc_pairs = [
        ("Karol Bagh Tower 1", "Karol Bagh Tower 3"),
        ("Karol Bagh Main Market Camera 5", "Karol Bagh Main Market Camera 7"),
        ("Lajpat Nagar Part II Camera 1", "Lajpat Nagar Part II Camera 3"),
    ]
    for a, b in loc_pairs:
        assert normalize_name(a, "LOCATION") != normalize_name(b, "LOCATION")
    assert normalize_name("12 March 2024", "DATE") != normalize_name("12 March", "DATE")

    ents = []
    for i, (n, t) in enumerate(loc_pairs + [
        ("suresh_kumar_01", "PERSON"), ("Suresh Kumar", "PERSON"),
    ]):
        ents.append(_e(f"E{i}", n, t))
    cands = rule_pass(ents)
    loc_cands = [
        c for c in cands
        if any(e.get("entity_type") == "LOCATION" for e in c.entities)
    ]
    assert loc_cands == []
    exact_person = [
        c for c in cands
        if c.signal == "exact_name_match"
        and all(e.get("entity_type") == "PERSON" for e in c.entities)
    ]
    assert len(exact_person) == 1


def test_hindi_person_fuzzy_merge_candidate():
    ents = [_e("P1", "मीना देवी", "PERSON"), _e("P2", "Meena Devi", "PERSON")]
    cands = rule_pass(ents)
    pairs = [set(c.entity_ids) for c in cands]
    assert any({"P1", "P2"} <= p for p in pairs), (
        "cross-script Meena Devi must produce a merge candidate"
    )
    # Negative controls: distinct persons never match
    assert not fuzzy_name_match("Rajesh Kumar", "Suresh Kumar")[0]
    assert not fuzzy_name_match("Rakesh", "Rajesh")[0]


def test_near_identical_location_and_camera_guard():
    ents = [
        _e("L1", "नेहरू नगर", "LOCATION"),
        _e("L2", "Nehru Nagar", "LOCATION"),
        _e("L3", "Camera 5", "LOCATION"),
        _e("L4", "Camera 7", "LOCATION"),
    ]
    pairs = [set(c.entity_ids) for c in rule_pass(ents)]
    assert any({"L1", "L2"} <= p for p in pairs), "Nehru Nagar variants must merge"
    assert not any({"L3", "L4"} <= p for p in pairs), "numeric tokens must never merge"


# ── D5: ORG structural rules ───────────────────────────────────────────

def test_org_acronym_and_suffix_merges():
    ents = [
        _e("O1", "pnb", "ORGANIZATION"),
        _e("O2", "Punjab National Bank", "ORGANIZATION"),
        _e("O3", "hdfc", "ORGANIZATION"),
        _e("O4", "HDFC Bank", "ORGANIZATION"),
        _e("O5", "sbi", "ORGANIZATION"),
        _e("O6", "SBI Customer Care", "ORGANIZATION"),
        _e("O7", "Delhi Police", "ORGANIZATION"),
        _e("O8", "Delhi Herald", "ORGANIZATION"),
    ]
    pairs = [set(c.entity_ids) for c in rule_pass(ents)]
    assert any({"O1", "O2"} <= p for p in pairs)
    assert any({"O3", "O4"} <= p for p in pairs)
    assert not any({"O5", "O6"} <= p for p in pairs), "non-suffix additions block (customer care)"
    assert not any({"O7", "O8"} <= p for p in pairs), "unrelated orgs must not merge"


# ── D9: temporal contradiction dedup ───────────────────────────────────

def test_temporal_contradiction_ids_unique():
    eid = "PHONE_TEST1"
    # Two source files disagree on location for the same instant, and the
    # same timestamp appears twice per source (duplicate rows) — the old
    # pair loop emitted identical IDs.
    spatial = [
        create_spatial_info(entity_id=eid, event_type="location",
                            address="Nehru Nagar Tower 2", source_id="a.csv"),
        create_spatial_info(entity_id=eid, event_type="location",
                            address="Karol Bagh Tower 1", source_id="b.csv"),
    ]
    temporal = [
        create_temporal_info(entity_id=eid, event_type="call",
                             start_time="2024-03-14T09:05:12", source_id="a.csv"),
        create_temporal_info(entity_id=eid, event_type="call",
                             start_time="2024-03-14T09:05:12", source_id="a.csv"),
        create_temporal_info(entity_id=eid, event_type="call",
                             start_time="2024-03-14T09:05:15", source_id="b.csv"),
        create_temporal_info(entity_id=eid, event_type="call",
                             start_time="2024-03-14T09:05:15", source_id="b.csv"),
    ]
    out = TemporalEngine()._detect_temporal_contradictions(
        entities=[], relations=[], spatial_infos=spatial,
        temporal_infos=temporal, run_id="t",
    )
    ids = [c["id"] for c in out]
    assert out, "expected at least one temporal contradiction"
    assert len(ids) == len(set(ids)), f"duplicate contradiction IDs: {ids}"


# ── D7: junk entity drops ──────────────────────────────────────────────

def test_spacy_lowercase_gpe_and_header_org_dropped():
    from src.extraction.engine import ExtractionEngine
    eng = ExtractionEngine()
    src = SourceMetadata(
        source_type="text", file_name="t.txt", file_hash="0" * 64,
        ingestion_time="2024-03-16T00:00:00",
    )
    text = (
        "Confidential - For Investigation Purposes\n"
        "Theek hai bhai, baat ho gayi aur sab theek hai dost log aaraam se.\n"
        "Rajesh Kumar called Suresh Kumar about the meeting yesterday.\n"
    )
    ents = eng._extract_ner_spacy(text, src)
    names = [e.name for e in ents]
    assert "hai" not in names, "single-token lowercase GPE must be dropped"
    assert "Confidential - For Investigation Purposes" not in names, (
        "header-zone ORG must be dropped"
    )


def test_name_phone_block_association():
    from src.extraction.engine import ExtractionEngine
    from src.models.schema import generate_id
    eng = ExtractionEngine()
    src = SourceMetadata(
        source_type="fir", file_name="01_FIR.txt", file_hash="0" * 64,
        ingestion_time="2024-03-15T00:00:00",
    )
    content = {"content": (
        "COMPLAINANT:\n"
        "Name: Meena Devi\n"
        "Father's Name: Shri Harish Chand\n"
        "Age: 34 years\n"
        "Phone: 9876543213\n"
        "\n"
        "I, Meena Devi, do hereby state that the incident occurred.\n"
    )}
    ents, _rels = eng._extract_text(content, src)
    pid = generate_id("PERSON", "Meena Devi")
    person = [e for e in ents if e.id == pid]
    assert person, "Meena Devi person entity must exist"
    assert person[0].attributes.get("phone") == "9876543213", (
        "Phone: line must attach to the Name: record in the same block"
    )
    # Missing phone must not be fabricated
    content2 = {"content": "Name: Unknown\nFather's Name: Unknown\nPhone: Unknown\n"}
    ents2, _ = eng._extract_text(content2, src)
    for e in ents2:
        if e.entity_type.value == "PERSON" and e.attributes.get("phone"):
            pytest.fail("missing phone must never be fabricated")


def test_resolution_prunes_artifact_entities(tmp_path):
    from src.resolution.engine import ResolutionEngine
    eng = ResolutionEngine()
    ents = [
        _e("ORG_otp", "OTP", "ORGANIZATION"),
        _e("AMT_fir", "FIR", "AMOUNT"),
        _e("O_hdfc", "hdfc", "ORGANIZATION"),
        _e("O_bank", "HDFC Bank", "ORGANIZATION"),
    ]
    for e in ents:
        e["confidence"] = {"score": 0.9}
        e["source"] = {"file_name": "t.txt"}
        e["aliases"] = []
    eng.resolve(ents, relations=[], output_dir=str(tmp_path), run_id="t")
    resolved = json.loads((tmp_path / "resolved_entities.json").read_text())
    names = {r["canonical_name"] for r in resolved.values()}
    assert "OTP" not in names, "standalone acronym ORG artifact must be pruned"
    assert "FIR" not in names, "digit-less AMOUNT artifact must be pruned"
    assert "HDFC Bank" in names, "merged org expansion must survive the prune"


def test_canonical_prefers_readable_name_over_handle(tmp_path):
    """A handle member ('suresh_kumar_01', longest) must not beat the
    human-readable 'Suresh Kumar' as canonical name."""
    from src.resolution.engine import ResolutionEngine
    eng = ResolutionEngine()
    ents = [
        _e("P_sk1", "suresh_kumar_01", "PERSON"),
        _e("P_sk2", "Suresh Kumar", "PERSON"),
    ]
    for e in ents:
        e["confidence"] = {"score": 0.95}
        e["source"] = {"file_name": "25_Social_Partial.json"}
        e["aliases"] = []
    eng.resolve(ents, relations=[], output_dir=str(tmp_path), run_id="t")
    resolved = json.loads((tmp_path / "resolved_entities.json").read_text())
    persons = [r for r in resolved.values() if r.get("entity_type") == "PERSON"]
    assert len(persons) == 1, f"expected one merged PERSON, got {persons}"
    assert persons[0]["canonical_name"] == "Suresh Kumar", (
        f"canonical must prefer readable name, got {persons[0]['canonical_name']}"
    )


# ── D2: cross-file adversarial finalize ────────────────────────────────

@pytest.mark.skipif(not DEMO.exists(), reason="demo_data not present")
def test_adversarial_finalize_flags_exactly_manifest_files(tmp_path):
    from src.ingestion.engine import IngestionEngine
    eng = IngestionEngine()
    eng.ingest_directory(str(DEMO))
    eng.finalize_adversarial_checks(run_id="test")

    expected = {
        "30_Adversarial_CDR.csv",
        "31_Adversarial_Bank.csv",
        "32_Adversarial_Social.json",
        "33_Adversarial_CCTV.csv",
    }
    flagged = {n for n, c in eng.adversarial_checks.items() if c.is_suspicious}
    assert flagged == expected, f"flagged={sorted(flagged)}"

    # Manifest reason keywords (TEST_MANIFEST categories)
    reasons31 = " ".join(eng.adversarial_checks["31_Adversarial_Bank.csv"].reasons)
    assert "timestamp" in reasons31, "31 needs a timestamp-manipulation reason"
    reasons33 = " ".join(eng.adversarial_checks["33_Adversarial_CCTV.csv"].reasons)
    assert "timestamp" in reasons33

    # The legitimate victim bank file must stay unflagged (was the D2 defect)
    c15 = eng.adversarial_checks["15_Bank_Meena.csv"]
    assert not c15.is_suspicious
    assert c15.reasons, "round/rapid reasons must be preserved for context"

    # Idempotency: re-running must not double-apply cross-file bonuses
    before = {n: c.score for n, c in eng.adversarial_checks.items()}
    eng.finalize_adversarial_checks(run_id="test2")
    after = {n: c.score for n, c in eng.adversarial_checks.items()}
    assert before == after


def test_rule_a_funding_capability_semantics():
    from src.ingestion.engine import IngestionEngine
    from src.models.schema import AdversarialCheck

    def bank_file(name, rows):
        return {"file_name": name, "source_type": "bank",
                "detected_type": "tabular", "content": {"rows": rows}}

    def ledger_row(tid, acc, date, time, bal, ttype="DEBIT"):
        return {"transaction_id": tid, "account_number": acc,
                "transaction_type": ttype, "amount": "1",
                "transaction_date": date, "transaction_time": time,
                "balance_after": str(bal), "counterparty_account": ""}

    def credit_row(tid, own, cp, amt, date, time):
        return {"transaction_id": tid, "account_number": own,
                "transaction_type": "CREDIT", "amount": str(amt),
                "transaction_date": date, "transaction_time": time,
                "balance_after": "0", "counterparty_account": cp}

    files = [
        # LENDER's real ledger: rich until 2024-03-14 09:00, then 200k
        bank_file("bank_ledger.csv", [
            ledger_row("L1", "LENDER", "2024-01-01", "00:00:00", 900000),
            ledger_row("L2", "LENDER", "2024-03-14", "09:00:00", 200000),
        ]),
        # Funding impossible: 500k credit when LENDER had 200k
        bank_file("bank_fraud.csv", [
            credit_row("F1", "BORROW", "LENDER", 500000, "2024-03-14", "16:50:00")]),
        # Funding possible: 150k credit <= 200k balance
        bank_file("bank_ok.csv", [
            credit_row("OK1", "BORROW2", "LENDER", 150000, "2024-03-14", "12:00:00")]),
        # Self-referential credit: description quirk, not evidence
        bank_file("bank_selfref.csv", [
            credit_row("S1", "SELF", "SELF", 500000, "2024-03-14", "16:50:00")]),
        # Unknown counterparty: unverifiable, exempt
        bank_file("bank_unknown.csv", [
            credit_row("U1", "B3", "NOT_A_KNOWN_ACCOUNT", 999999, "2024-03-14", "16:50:00")]),
        # Known counterparty but no ledger coverage strictly before credit
        bank_file("bank_nocover.csv", [
            credit_row("N1", "B4", "LENDER", 500000, "2023-12-01", "10:00:00")]),
    ]
    eng = IngestionEngine()
    eng.ingestion_log = files
    eng.adversarial_checks = {
        f["file_name"]: AdversarialCheck(file_name=f["file_name"]) for f in files}
    eng.finalize_adversarial_checks(run_id="t")
    flagged = {n for n, c in eng.adversarial_checks.items() if c.is_suspicious}
    assert flagged == {"bank_fraud.csv"}, f"flagged={sorted(flagged)}"
    reasons = " ".join(eng.adversarial_checks["bank_fraud.csv"].reasons)
    assert "cross_file_timestamp_reconciliation" in reasons


def test_global_id_type_scoped():
    from src.global_push.engine import _new_global_id

    def gid(name, etype):
        return _new_global_id({"entity_type": etype, "canonical_name": name,
                               "phones": [], "accounts": []})

    # Numbered locations must not collapse into one global
    assert gid("Karol Bagh Tower 1", "LOCATION") != gid("Karol Bagh Tower 3", "LOCATION")
    # PERSON handles still canonicalize together
    assert gid("suresh_kumar_01", "PERSON") == gid("Suresh Kumar", "PERSON")


def test_fuzzy_index_pass_digit_guard():
    from src.resolution.engine import ResolutionEngine
    from src.resolution.fuzzy_index import FuzzyIndex

    eng = ResolutionEngine.__new__(ResolutionEngine)
    eng.fuzzy_index = FuzzyIndex()
    ents = [
        _e("L1", "Karol Bagh Tower 1", "LOCATION"),
        _e("L2", "Karol Bagh Tower 3", "LOCATION"),
        _e("L3", "Karol Bagh Main Market", "LOCATION"),
        _e("L4", "Karol Bagh Main Market Camera 5", "LOCATION"),
    ]
    for e in ents:
        eng.fuzzy_index.add_entity(e["id"], e["name"], e["entity_type"], [])
    cands = eng._fuzzy_index_pass(ents)
    pairs = {tuple(sorted(c.entity_ids)) for c in cands}
    # Differing digits on both sides: never match, despite sim 1.00 tokens
    assert ("L1", "L2") not in pairs
    # One-sided digits: granularity merge still allowed (pre-existing design)
    assert ("L3", "L4") in pairs


def test_phonetic_pass_requires_name_compatibility():
    from src.resolution.engine import ResolutionEngine

    eng = ResolutionEngine.__new__(ResolutionEngine)
    # Different given names, shared surname: phonetic codes agree, but
    # identity compatibility must block (Mahesh/Harish Chand)
    ents = [_e("P1", "Shri Mahesh Chand", "PERSON"),
            _e("P2", "Shri Harish Chand", "PERSON")]
    assert eng._phonetic_pass(ents) == []
    # Same-name duplicates still match phonetically
    ents2 = [_e("P3", "Suresh Kumar", "PERSON"),
             _e("P4", "Suresh Kumar", "PERSON")]
    assert len(eng._phonetic_pass(ents2)) == 1


def test_union_find_digit_guard_blocks_transitive_bridge():
    from src.models.schema import LLMVerdict
    from src.resolution.merger import merge_entities

    ents = {e["id"]: e for e in [
        _e("L1", "Karol Bagh Main Market", "LOCATION"),
        _e("L2", "Karol Bagh Main Market Camera 5", "LOCATION"),
        _e("L3", "Karol Bagh Main Market Camera 7", "LOCATION"),
    ]}
    v1 = LLMVerdict(entity_ids=["L1", "L2"], merge=True, confidence=1.0,
                     canonical_name="Karol Bagh Main Market Camera 5", reasoning="r")
    v2 = LLMVerdict(entity_ids=["L1", "L3"], merge=True, confidence=1.0,
                     canonical_name="Karol Bagh Main Market Camera 7", reasoning="r")
    out = merge_entities([v1, v2], ents, [], run_id="t")
    resolved = out[0]
    with_l2 = [r for r in resolved if "L2" in r.source_entities]
    with_l3 = [r for r in resolved if "L3" in r.source_entities]
    assert with_l2 and with_l3, "first bridge merge should succeed"
    assert not (set(r.id for r in with_l2) & set(r.id for r in with_l3)), \
        "Camera 7 must not transitively union with Camera 5 through the base"


# ── Residual batch: courtesy guard, artifact prune, provenance, push, DB ─

def test_courtesy_only_names_keep_one_token():
    """Courtesy stripping must not collapse names to "" (indistinguishable
    norms bypass the exact rule's len>1 guard). 'Bhai' and 'Bhai Sahab' are
    different people (phones 9876543210 vs 9876543220) and must stay
    distinct; 'Rakesh Bhai' still strips to the given name."""
    assert normalize_name("Bhai", "PERSON") == "bhai"
    assert normalize_name("Ji", "PERSON") == "ji"
    assert normalize_name("Bhai Sahab", "PERSON") == "bhai sahab"
    assert normalize_name("Bhai", "PERSON") != normalize_name("Bhai Sahab", "PERSON")
    assert normalize_name("Rakesh Bhai", "PERSON") == "rakesh"
    assert normalize_name("Suresh Bhai", "PERSON") == "suresh"


def _res(name, etype, merge="single", srcs=None):
    from types import SimpleNamespace
    return SimpleNamespace(canonical_name=name, entity_type=etype,
                           merge_type=merge,
                           source_entities=srcs or [f"{etype}_{name}"])


def test_prune_single_token_junk_orgs_unconditional():
    """FIR/Phone/Account: unconnected single-token ORGs are artifacts
    regardless of merge_type (FIR is a review-merge AMOUNT+ORG group)."""
    from src.resolution.engine import _prune_artifacts
    resolved = [
        _res("FIR", "ORGANIZATION", merge="review"),
        _res("Phone", "ORGANIZATION"),
        _res("Account", "ORGANIZATION"),
        _res("CDR", "ORGANIZATION"),
        _res("Delhi Herald", "ORGANIZATION"),
    ]
    keep, pruned = _prune_artifacts(resolved, [])
    assert [r.canonical_name for r in keep] == ["Delhi Herald"]
    assert sorted(pruned) == ["ORG:Account", "ORG:CDR", "ORG:FIR", "ORG:Phone"]


def test_prune_keeps_connected_and_initials_partner():
    from src.resolution.engine import _prune_artifacts
    resolved = [
        _res("PNB", "ORGANIZATION"),
        _res("Punjab National Bank", "ORGANIZATION"),
        _res("OTP", "ORGANIZATION", srcs=["rel_endpoint"]),
    ]
    rels = [{"source_entity_id": "rel_endpoint", "target_entity_id": "other"}]
    keep, pruned = _prune_artifacts(resolved, rels)
    names = {r.canonical_name for r in keep}
    assert names == {"PNB", "Punjab National Bank", "OTP"}
    assert pruned == []


def test_prune_amount_branch_unchanged():
    from src.resolution.engine import _prune_artifacts
    keep, pruned = _prune_artifacts(
        [_res("three", "AMOUNT"), _res("1,00,000", "AMOUNT")], [])
    assert [r.canonical_name for r in keep] == ["1,00,000"]
    assert pruned == ["AMOUNT:three"]


def test_build_provenance_includes_observed_in():
    from src.resolution.merger import build_provenance
    se = [
        {"source": {"file_name": "10_CCTV_Log.csv"},
         "attributes": {"observed_in": ["24_CCTV_Gap_Timestamps.csv",
                                        "33_Adversarial_CCTV.csv"]}},
        {"source": {"file_name": "40_Self_Loop_CCTV.csv"}, "attributes": {}},
    ]
    assert build_provenance(se) == [
        "10_CCTV_Log.csv", "24_CCTV_Gap_Timestamps.csv",
        "33_Adversarial_CCTV.csv", "40_Self_Loop_CCTV.csv",
    ]


def test_build_provenance_dedupes_and_tolerates_missing_fields():
    from src.resolution.merger import build_provenance
    se = [
        {"source": {"file_name": "a.csv"},
         "attributes": {"observed_in": ["a.csv", "b.csv"]}},
        {"source": {}, "attributes": None},
        {"attributes": {"observed_in": ["c.csv"]}},
        {},
    ]
    assert build_provenance(se) == ["a.csv", "b.csv", "c.csv"]


def test_observe_appends_unique_files():
    from types import SimpleNamespace
    from src.extraction.engine import ExtractionEngine
    ent = SimpleNamespace(attributes={"location_name": "X"})
    ExtractionEngine._observe(ent, SimpleNamespace(file_name="10_CCTV_Log.csv"))
    ExtractionEngine._observe(ent, SimpleNamespace(file_name="10_CCTV_Log.csv"))
    ExtractionEngine._observe(ent, SimpleNamespace(file_name="24_CCTV_Gap_Timestamps.csv"))
    ExtractionEngine._observe(ent, SimpleNamespace(file_name=""))
    assert ent.attributes["observed_in"] == ["10_CCTV_Log.csv",
                                             "24_CCTV_Gap_Timestamps.csv"]


def test_device_contact_phone_reaches_person_attributes():
    from src.extraction.engine import ExtractionEngine
    eng = ExtractionEngine()
    data = {"device_name": "RakeshPhone",
            "contacts": [{"name": "Bhai", "phone": "9876543210"}]}
    source = SourceMetadata(source_type="device", file_name="08_Device_Rakesh.json",
                            file_hash="h", ingestion_time="2024-03-14T00:00:00")
    entities, _ = eng._extract_device_data(data, source)
    person = [e for e in entities if e.entity_type.value == "PERSON"
              and e.name == "Bhai"]
    assert person, "contact must produce a PERSON entity"
    assert person[0].attributes.get("phone") == "9876543210", (
        "device contact phone must land on person attributes "
        "(feeds get_entity_phones / resolution phone signals)")


def test_push_summary_counts_add_up(tmp_path):
    """globals_created + globals_matched + globals_absorbed == entities;
    without the absorbed counter the absorb branch silently dropped a
    signal from the totals."""
    from src.global_push.engine import GlobalPushEngine
    resolved = {
        "RES_a": {"id": "RES_a", "entity_type": "PERSON",
                  "canonical_name": "Zzyzx Quorple One", "aliases": [],
                  "phones": [], "accounts": [], "addresses": [],
                  "attributes": {}, "confidence": 0.9,
                  "created_at": "2024-03-14T10:00:00",
                  "updated_at": "2024-03-14T10:00:00"},
        "RES_b": {"id": "RES_b", "entity_type": "LOCATION",
                  "canonical_name": "Zzyzx Tower 9", "aliases": [],
                  "phones": [], "accounts": [], "addresses": [],
                  "attributes": {}, "confidence": 0.9,
                  "created_at": "2024-03-14T10:00:00",
                  "updated_at": "2024-03-14T10:00:00"},
    }
    (tmp_path / "resolved_entities.json").write_text(json.dumps(resolved))
    summary = GlobalPushEngine().push(str(tmp_path), run_id="t")
    assert summary["globals_created"] + summary["globals_matched"] \
        + summary["globals_absorbed"] == summary["entities_pushed"] == 2


def test_phone_conflict_vetoes_high_conf_name_candidate():
    """fuzzy_name_match('Bhai','Bhai Sahab') proposes at 0.9 (token
    containment), but disjoint phones are positive evidence of difference —
    the disambiguator's grounded reject must bind even at rule conf >= 0.9.
    Mere ABSENCE of phone data must still preserve the candidate (that is
    what the conf >= 0.9 bypass exists for)."""
    from src.resolution.disambiguator import MultiSignalDisambiguator
    from src.resolution.engine import ResolutionEngine
    from src.resolution.rule_pass import rule_pass

    eng = ResolutionEngine.__new__(ResolutionEngine)
    eng.disambiguator = MultiSignalDisambiguator()

    def person(eid, name, phone=None):
        e = _e(eid, name, "PERSON")
        e["confidence"] = {"score": 0.9}
        e["source"] = {"file_name": "t.json"}
        e["aliases"] = []
        if phone:
            e["attributes"]["phone"] = phone
        return e

    # Conflict path: 9876543210 vs 9876543220
    ents = [person("A", "Bhai", "9876543210"),
            person("B", "Bhai Sahab", "9876543220")]
    by_id = {e["id"]: e for e in ents}
    pair = [c for c in rule_pass(ents) if set(c.entity_ids) == {"A", "B"}]
    assert pair and pair[0].confidence >= 0.9, "containment must propose at 0.9"
    assert eng._disambiguate_pass(pair, by_id) == [], \
        "different phones must veto the merge"

    # Absence path: no phones anywhere — preserve
    ents2 = [person("A2", "Bhai"), person("B2", "Bhai Sahab")]
    pair2 = [c for c in rule_pass(ents2) if set(c.entity_ids) == {"A2", "B2"}]
    assert pair2
    assert eng._disambiguate_pass(pair2, {e["id"]: e for e in ents2}) == pair2


def test_signal_case_conflict_carries_values_and_strong_weight():
    """The duplicate _signal_case (weaker 0.3, no evidence detail) must not
    shadow the strong first definition."""
    from src.resolution.disambiguator import MultiSignalDisambiguator
    d = MultiSignalDisambiguator()
    a = {"id": "a", "attributes": {"case_number": "FIR 1/2024"}}
    b = {"id": "b", "attributes": {"case_number": "FIR 2/2024"}}
    sig = d._signal_case(a, b)
    assert sig is not None and sig.confidence == 0.1
    assert "FIR 1/2024" in sig.evidence and "FIR 2/2024" in sig.evidence
    shared = d._signal_case(a, dict(a))
    assert shared is not None and shared.confidence == 0.85


def test_device_contact_alias_attaches_to_phone_owner():
    """{"relation": "alias", "phone": ...} means the name belongs to the
    person who already owns that phone (file16: Bhai = Rakesh's alias);
    non-alias contacts still create their own entities."""
    from types import SimpleNamespace
    from src.extraction.engine import ExtractionEngine
    from src.models.schema import generate_id

    eng = ExtractionEngine()
    owner = SimpleNamespace(
        id="PERSON_rk", entity_type=SimpleNamespace(value="PERSON"),
        name="Rakesh Kumar", aliases=["Rakesh Kumar"],
        attributes={"phone": "9876543210"})
    eng.entity_index["PERSON_rk"] = owner

    data = {"device_name": "AmitPhone",
            "contacts": [
                {"name": "Rakesh Bhai", "phone": "9876543210",
                 "relation": "associate"},
                {"name": "Bhai", "phone": "9876543210", "relation": "alias"},
                {"name": "Bhai Sahab", "phone": "9876543220",
                 "relation": "unknown"},
            ]}
    source = SourceMetadata(source_type="device", file_name="16_Device_Amit.json",
                            file_hash="h", ingestion_time="2024-03-14T00:00:00")
    entities, relations = eng._extract_device_data(data, source)

    persons = [e for e in entities if e.entity_type.value == "PERSON"]
    names = {e.name for e in persons}
    assert "Bhai" not in names, "alias contact must not mint a standalone identity"
    assert "Bhai" in owner.aliases
    assert "16_Device_Amit.json" in owner.attributes["observed_in"]
    assert "Bhai Sahab" in names, "non-alias contact still creates its person"
    assert "Rakesh Bhai" in names, "associate contact still creates its person"
    phone_id = generate_id("PHONE", "9876543210")
    assert any(r.source_entity_id == "PERSON_rk"
               and r.target_entity_id == phone_id for r in relations), \
        "alias path must link the known person to the phone node"


def test_shared_phone_requires_name_compatibility():
    """group.py Signal 3 must not mint identity merges from a shared number
    alone — 'Bhai Sahab' and 'Boss' both own 9876543220, but family phones
    and shared devices exist (same rule as rule_pass exact_phone_match)."""
    from src.resolution.group import find_groups

    def p(eid, name, phone):
        e = _e(eid, name, "PERSON")
        e["attributes"]["phone"] = phone
        return e

    ents = [
        p("A", "Bhai Sahab", "9876543220"),
        p("B", "Boss", "9876543220"),
        p("C", "Rakesh Kumar", "9876543210"),
        p("D", "Rakesh Bhai", "9876543210"),
    ]
    pairs = {frozenset(c.entity_ids): c.signal for c in find_groups(ents, [])}
    assert frozenset({"A", "B"}) not in pairs, \
        "incompatible names must not merge on a shared phone"
    assert frozenset({"C", "D"}) in pairs, \
        "name-compatible pair sharing a phone still groups"


def test_merge_attributes_unions_lists_without_nesting():
    """Two members carrying list attributes must union element-wise; a list
    is never appended inside a list (bug: provenance got nested lists)."""
    from src.resolution.merger import merge_attributes
    members = [
        {"attributes": {"observed_in": ["13_FIR.txt", "18_Witness.txt"]}},
        {"attributes": {"observed_in": ["14_CDR_Meena.csv", "21_Missing.csv"]}},
        {"attributes": {"observed_in": ["13_FIR.txt"]}},  # overlap
    ]
    merged = merge_attributes(members)
    assert merged["observed_in"] == [
        "13_FIR.txt", "18_Witness.txt", "14_CDR_Meena.csv", "21_Missing.csv",
    ]
    assert all(isinstance(x, str) for x in merged["observed_in"]), \
        "merged list must stay flat (no nested lists)"


def test_merge_attributes_does_not_mutate_members():
    """First-write must copy: the old code aliased the member's list and the
    union append corrupted the member's own observed_in in place."""
    from src.resolution.merger import merge_attributes
    m1 = {"attributes": {"observed_in": ["a.csv", "b.csv"]}}
    m2 = {"attributes": {"observed_in": ["c.csv"]}}
    merge_attributes([m1, m2])
    assert m1["attributes"]["observed_in"] == ["a.csv", "b.csv"], \
        "member's own list must not be mutated through a shared reference"
    assert m2["attributes"]["observed_in"] == ["c.csv"]


def test_merge_attributes_list_and_scalar_stay_flat():
    from src.resolution.merger import merge_attributes
    merged = merge_attributes([
        {"attributes": {"role": "owner"}},
        {"attributes": {"role": "witness"}},
    ])
    assert merged["role"] == ["owner", "witness"]
    merged2 = merge_attributes([
        {"attributes": {"observed_in": ["a.csv"]}},
        {"attributes": {"observed_in": "b.csv"}},  # scalar str
    ])
    assert merged2["observed_in"] == ["a.csv", "b.csv"]
    assert all(isinstance(x, str) for x in merged2["observed_in"])


# ── AdversarialCheck DB persistence contract (pipeline.py step 0b) ────

def test_adversarial_check_id_is_stable_per_run_and_file():
    """The AdversarialCheck PK is deterministic on (runId, fileName).

    Same run re-persisted -> same id -> ON CONFLICT upserts (no duplicates).
    New run              -> new id   -> the runId prune reclaims the old rows.
    """
    from src.models.schema import generate_id
    same_a = generate_id("ADVCHK", "run_1:30_Adversarial_CDR.csv")
    same_b = generate_id("ADVCHK", "run_1:30_Adversarial_CDR.csv")
    new_run = generate_id("ADVCHK", "run_2:30_Adversarial_CDR.csv")
    new_file = generate_id("ADVCHK", "run_1:31_Adversarial_Bank.csv")
    assert same_a == same_b, "identical (run, file) must reproduce the id"
    assert same_a != new_run, "a later run must not collide with prior rows"
    assert same_a != new_file, "each file needs its own row"
    assert same_a.startswith("ADVCHK_")


def test_adversarial_check_has_no_risk_level_in_computation():
    """riskLevel is persisted as the schema default LOW — no derivation.

    The computation yields score / reasons / four anomaly flags but no risk
    classification, and none is documented in OUTPUTS.md or
    11_STAGE1_INGESTION.md. Deriving one would be a new analytical policy
    disguised as persistence, so this test fails if one is ever smuggled in.
    """
    from src.models.schema import AdversarialCheck
    chk = AdversarialCheck(file_name="30_Adversarial_CDR.csv")
    assert not hasattr(chk, "risk_level")
    assert "risk_level" not in chk.to_dict()


def test_adversarial_check_exposes_every_persisted_signal():
    """Every field the DB row stores must exist on the in-memory result."""
    from src.models.schema import AdversarialCheck
    chk = AdversarialCheck(file_name="31_Adversarial_Bank.csv", score=0.4,
                           reasons=["cross_file_timestamp_reconciliation"])
    for field in ("is_suspicious", "behavioral_anomaly", "temporal_anomaly",
                  "content_anomaly", "duplicate_suspect", "score", "reasons"):
        assert hasattr(chk, field), f"writer persists {field}"
    d = chk.to_dict()
    assert d["reasons"] == ["cross_file_timestamp_reconciliation"]
    assert d["score"] == 0.4


# ── JSON output defects (run_history jurisdiction, adversarial_check) ─

def test_run_history_records_jurisdiction_node_id(tmp_path, monkeypatch):
    """run_history.json must record the jurisdiction actually used.

    Defect: PipelineRun was constructed without jurisdiction_node_id, so the
    field silently defaulted to None and run_history.json reported null even
    when --jurisdiction-id was supplied (Case/PipelineRun in the DB were fine).
    """
    import psycopg2
    monkeypatch.setattr(
        psycopg2, "connect",
        lambda *a, **k: (_ for _ in ()).throw(RuntimeError("db disabled in test")),
    )
    from src.pipeline import Pipeline
    p = Pipeline(output_dir=str(tmp_path), use_llm=False,
                 case_id="CASE_TEST", jurisdiction_node_id="JUR_TEST")
    run = p._start_run(trigger="manual")
    assert run.jurisdiction_node_id == "JUR_TEST"
    assert run.to_dict()["jurisdiction_node_id"] == "JUR_TEST"
    p._end_run()
    hist = json.loads((tmp_path / "run_history.json").read_text())
    assert hist, "run_history.json should contain the started run"
    assert hist[-1]["jurisdiction_node_id"] == "JUR_TEST"


@pytest.mark.skipif(not DEMO.exists(), reason="demo_data not present")
def test_ingestion_summary_emits_full_adversarial_check():
    """files[] must carry the full AdversarialCheck dict per 11_STAGE1_INGESTION.md.

    Defect: only the is_suspicious boolean was projected, so the documented
    file_info["adversarial_check"] contract (score, reasons, anomaly flags)
    never reached extraction_summary.json even though it was computed.
    """
    from src.ingestion.engine import IngestionEngine
    eng = IngestionEngine()
    eng.ingest_directory(str(DEMO))
    eng.finalize_adversarial_checks(run_id="test")
    summary = eng.get_ingestion_summary()
    files = summary["files"]
    assert files, "summary should list ingested files"

    fields = ("file_name", "is_suspicious", "behavioral_anomaly",
              "temporal_anomaly", "content_anomaly", "duplicate_suspect",
              "score", "reasons", "run_id")
    for f in files:
        chk = f["adversarial_check"]
        assert isinstance(chk, dict), f"{f['name']} missing adversarial_check"
        for k in fields:
            assert k in chk, f"{f['name']} adversarial_check missing {k}"
        # the boolean projection must not drift from the dict
        assert f["adversarial_suspicious"] == chk["is_suspicious"]

    flagged = sorted(f["name"] for f in files
                     if f["adversarial_check"]["is_suspicious"])
    assert flagged == sorted(summary["adversarial"]["suspicious_files"])
    assert flagged == [
        "30_Adversarial_CDR.csv", "31_Adversarial_Bank.csv",
        "32_Adversarial_Social.json", "33_Adversarial_CCTV.csv",
    ]
