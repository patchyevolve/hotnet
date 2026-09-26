import json
import os
import runpy
import sys
from pathlib import Path
from types import SimpleNamespace

import requests

from src.ai.provider import AIProvider, ModelTier, ProviderType
from src.critic.engine import generate as generate_critic
from src.global_push.engine import (
    GlobalPushEngine,
    extract_identity_signals,
    match_identity,
)
from src.pipeline import Pipeline
from src.scoped_analytics.engine import generate as generate_scoped


class FakeAICaller:
    def critic_review(self, **kwargs):
        return {
            "status": "success",
            "provider": "mistral",
            "model": "mistral-small-latest",
            "parsed": {"findings": [
                {"severity": "review", "category": "other",
                 "target_ids": ["H1", "NOT_IN_INPUT"],
                 "evidence_ids": ["EDGE_EVIDENCE", "MADE_UP"],
                 "finding": "Check this relationship."},
                {"severity": "high", "target_ids": ["MADE_UP"],
                 "evidence_ids": [], "finding": "Hallucinated target."},
            ]},
        }


def _dump(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding="utf-8")


def test_critic_filters_model_references_to_supplied_ids(tmp_path):
    _dump(tmp_path / "hypotheses.json", [{"id": "H1", "confidence": 0.7,
                                           "supporting": ["EDGE_EVIDENCE"]}])
    _dump(tmp_path / "graph_edges.json", [{"id": "E1", "supporting_evidence": ["EDGE_EVIDENCE"]}])
    _dump(tmp_path / "contradictions.json", {})
    _dump(tmp_path / "evidence_gaps.json", [])
    _dump(tmp_path / "resolved_entities.json", {})

    summary = generate_critic(str(tmp_path), "run_1", ai=FakeAICaller())

    assert summary["mode"] == "llm_assisted"
    review = json.loads((tmp_path / "critic_review.json").read_text(encoding="utf-8"))
    assert review["findings"][0]["target_ids"] == ["H1"]
    assert review["findings"][0]["evidence_ids"] == ["EDGE_EVIDENCE"]
    assert len(review["findings"]) == 1
    assert review["changes_applied"] is False


def test_global_push_persists_file_index_and_links_across_cases(tmp_path, monkeypatch):
    engine = GlobalPushEngine()
    monkeypatch.setattr(engine, "_connect", lambda: (None, "test file-only mode"))
    index = tmp_path / "shared"
    person = {"entity_type": "PERSON", "canonical_name": "Rakesh Kumar",
              "aliases": [], "phones": ["9876543210"], "accounts": [],
              "addresses": [], "created_at": "2025-01-01T00:00:00",
              "updated_at": "2025-01-01T00:00:00"}

    for case_id, jurisdiction, local_id in [
        ("CASE_A", "JUR_A", "LOCAL_A"), ("CASE_B", "JUR_B", "LOCAL_B")
    ]:
        out = tmp_path / case_id
        _dump(out / "resolved_entities.json", {local_id: {**person, "id": local_id}})
        _dump(out / "graph_edges.json", [])
        result = engine.push(str(out), case_id=case_id,
                             jurisdiction_node_id=jurisdiction,
                             index_dir=str(index))
        assert result["entities_pushed"] == 1

    links = json.loads((index / "global_entity_links.json").read_text(encoding="utf-8"))
    alerts = json.loads((index / "cross_case_alerts.json").read_text(encoding="utf-8"))
    assert len(links) == 2
    assert len({link["global_entity_id"] for link in links}) == 1
    assert len(alerts) == 1
    assert set(alerts[0]["case_ids"]) == {"CASE_A", "CASE_B"}
    case_b_links = json.loads((tmp_path / "CASE_B" / "global_entity_links.json").read_text(encoding="utf-8"))
    assert len(case_b_links) == 1


def test_global_match_does_not_override_conflicting_phone_with_same_name():
    candidate = extract_identity_signals({
        "id": "LOCAL", "entity_type": "PERSON", "canonical_name": "Rakesh Kumar",
        "phones": ["9876543210"],
    })
    existing = {"canonical_id": "G1", "entity_type": "PERSON",
                "canonical_name": "Rakesh Kumar", "norm_names": candidate["norm_names"],
                "phones": ["9999999999"], "accounts": []}
    assert match_identity(candidate, [existing]) is None


def test_exact_mistral_model_does_not_fallback_on_rate_limit(tmp_path, monkeypatch):
    monkeypatch.setenv("MISTRAL_API_KEY", "test-mistral-key")
    monkeypatch.setenv("GROQ_API_KEY", "test-groq-key")
    ai = AIProvider(config_path="config/ai_providers.json")
    calls = []

    def fake_call(provider, model, *args):
        calls.append((provider.name.value, model))
        if provider.name == ProviderType.MISTRAL:
            raise requests.HTTPError("HTTP 429 rate limit exceeded")
        return {"response": '{"ok": true}', "usage": {}}

    monkeypatch.setattr(ai, "_call_provider", fake_call)
    result = ai.call(
        prompt="synthetic",
        tier=ModelTier.BALANCED,
        preferred_provider=ProviderType.MISTRAL,
        model="mistral-medium-latest",
        max_tokens=32,
        retries=1,
    )
    assert calls == [("mistral", "mistral-medium-latest")]
    assert (result["provider"], result["model"], result["status"]) == (
        "mistral", "mistral-medium-latest", "rate_limited"
    )


def test_configured_groq_fallback_records_both_routes(tmp_path, monkeypatch):
    monkeypatch.setenv("MISTRAL_API_KEY", "test-mistral-key")
    monkeypatch.setenv("GROQ_API_KEY", "test-groq-key")
    ai = AIProvider(config_path="config/ai_providers.json")
    calls = []

    def fake_call(provider, model, *args):
        calls.append((provider.name.value, model))
        if provider.name == ProviderType.MISTRAL:
            raise requests.HTTPError("HTTP 429 rate limit exceeded")
        return {"response": '{"ok": true}', "usage": {}}

    monkeypatch.setattr(ai, "_call_provider", fake_call)
    result = ai.call(
        prompt="synthetic",
        tier=ModelTier.BALANCED,
        preferred_provider=ProviderType.MISTRAL,
        model="mistral-small-latest",
        fallback_models=[{"provider": "groq", "model": "openai/gpt-oss-20b"}],
        max_tokens=32,
    )
    assert calls == [
        ("mistral", "mistral-small-latest"),
        ("groq", "openai/gpt-oss-20b"),
    ]
    assert (result["provider"], result["model"], result["status"]) == (
        "groq", "openai/gpt-oss-20b", "success"
    )
    assert result["fallback_from"]["provider"] == "mistral"
    assert result["fallback_from"]["model"] == "mistral-small-latest"


def test_provider_status_does_not_claim_remote_mistral_health(tmp_path, monkeypatch):
    monkeypatch.setenv("MISTRAL_API_KEY", "test-mistral-key")
    ai = AIProvider(config_path="config/ai_providers.json")

    status = ai.get_status()["mistral"]

    assert status["available"] is True  # credentials and local limiter only
    assert status["has_api_key"] is True
    assert status["remote_checked"] is False
    assert status["availability_scope"] == "credentials_and_local_limits_only"
    assert status["is_free"] is False


def test_run_script_preserves_explicit_database_url(monkeypatch):
    explicit_url = "postgresql://isolated:test@localhost:15432/pipeline_test"
    monkeypatch.setenv("DATABASE_URL", explicit_url)

    runpy.run_path(
        str(Path(__file__).resolve().parents[1] / "run.py"),
        run_name="pipeline_run_test",
    )

    assert os.environ["DATABASE_URL"] == explicit_url


def test_unscoped_database_run_never_prunes_case_rows(tmp_path, monkeypatch):
    calls = []

    class Cursor:
        def execute(self, query, params=None):
            calls.append((query, params))

        def close(self):
            pass

    class Connection:
        autocommit = False

        def cursor(self):
            return Cursor()

        def close(self):
            pass

    monkeypatch.setitem(sys.modules, "psycopg2", SimpleNamespace(connect=lambda _: Connection()))
    pipeline = Pipeline(output_dir=str(tmp_path), use_llm=False)
    pipeline.db_run_id = "RUN_UNSCOPED"
    pipeline._persist_to_database({"summary": {"total_entities": 1}})

    assert len(calls) == 1
    assert "UPDATE \"PipelineRun\"" in calls[0][0]
    assert "DELETE" not in calls[0][0]


def test_scoped_analytics_keeps_case_metrics_separate(tmp_path):
    a, b = tmp_path / "cases" / "A", tmp_path / "cases" / "B"
    _dump(a / "global_entity_links.json", [{"global_entity_id": "G1"}])
    _dump(b / "global_entity_links.json", [{"global_entity_id": "G1"}])
    _dump(tmp_path / "global_index" / "global_entities.json", {
        "G1": {"canonical_name": "Synthetic Person"}
    })
    _dump(tmp_path / "global_index" / "global_entity_links.json", [
        {"global_entity_id": "G1", "case_id": "A"},
        {"global_entity_id": "G1", "case_id": "B"},
    ])
    _dump(tmp_path / "global_index" / "cross_case_alerts.json", [])
    summary = generate_scoped(str(tmp_path), {
        "A": {"output_dir": str(a), "summary": {"total_entities": 3, "total_relations": 2}},
        "B": {"output_dir": str(b), "summary": {"total_entities": 4, "total_relations": 5}},
    })
    assert summary["case_count"] == 2
    assert summary["case_metric_totals"] == {"entities": 7, "relations": 7}
    assert summary["shared_global_entity_count"] == 1
    assert summary["evidence_pooled"] is False
