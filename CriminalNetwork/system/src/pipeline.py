"""
Main Pipeline — Stages 1-9 + Stage 11 (Global Entity Push)
Runs ingestion + extraction + resolution + temporal + graph build +
analytics + hypothesis generation + global entity push.
Every execution creates a PipelineRun with full versioning.
Includes confidence calibration, audit trail, and cross-case contamination prevention.
"""

import os
import json
import hashlib
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional

from .ingestion.engine import IngestionEngine, compute_file_hash
from .extraction.engine import ExtractionEngine
from .resolution.engine import ResolutionEngine
from .temporal.engine import TemporalEngine
from .graph.builder import GraphBuilder
from .analytics.engine import AnalyticsEngine
from .hypothesis.engine import generate as generate_hypotheses
from .contradiction.engine import generate as adjudicate_contradictions
from .gap_detection.engine import generate as detect_gaps
from .critic.engine import generate as review_outputs
from .global_push.engine import GlobalPushEngine
from .ai.caller import AICaller
from .ai.provider import ModelTier
from .context.generator import FileContextGenerator
from .models.schema import PipelineRun, generate_id
from .feeder import FIRFeeder, FeedResult


class AuditTrail:
    """Audit trail for all pipeline decisions."""

    def __init__(self):
        self.entries = []
        self._current_run_id = ""

    def set_run_id(self, run_id: str):
        """Set the current run ID for subsequent log entries."""
        self._current_run_id = run_id

    def log(self, stage: str, action: str, details: dict, decision: str = "", run_id: str = ""):
        """Log an audit entry."""
        effective_run_id = run_id or self._current_run_id
        self.entries.append({
            "timestamp": datetime.now().isoformat(),
            "run_id": effective_run_id,
            "stage": stage,
            "action": action,
            "details": details,
            "decision": decision,
        })

    def save(self, output_dir: str):
        """Save audit trail to file."""
        with open(os.path.join(output_dir, "audit_trail.json"), "w") as f:
            json.dump(self.entries, f, indent=2)

    def get_stage_summary(self) -> dict:
        """Get summary of decisions by stage."""
        summary = {}
        for entry in self.entries:
            stage = entry["stage"]
            if stage not in summary:
                summary[stage] = {"count": 0, "decisions": []}
            summary[stage]["count"] += 1
            if entry["decision"]:
                summary[stage]["decisions"].append(entry["decision"])
        return summary


class ConfidenceCalibrator:
    """Calibrates confidence scores based on historical accuracy."""

    def __init__(self):
        # Historical calibration data
        # In production, this would be learned from verified outcomes
        self.calibration_table = {
            "observation": 1.0,   # Observations are reliable
            "inference": 0.85,    # Inferences are less reliable
            "hypothesis": 0.7,    # Hypotheses are least reliable
        }

    def calibrate(self, confidence: float, epistemic_status: str) -> float:
        """Calibrate confidence based on epistemic status."""
        multiplier = self.calibration_table.get(epistemic_status, 0.8)
        return round(confidence * multiplier, 4)


class CrossCaseGuard:
    """Prevents cross-case contamination."""

    def __init__(self):
        self.case_entities = {}  # case_id → set of entity IDs

    def check_contamination(self, entity_id: str, case_id: str) -> bool:
        """Check if entity is already in a different case."""
        if entity_id in self.case_entities:
            existing_case = self.case_entities[entity_id]
            if existing_case != case_id:
                return True  # Contamination detected
        return False

    def register_entity(self, entity_id: str, case_id: str):
        """Register entity as belonging to a case."""
        self.case_entities[entity_id] = case_id

    def get_case_summary(self) -> dict:
        """Get summary of entities per case."""
        summary = {}
        for entity_id, case_id in self.case_entities.items():
            if case_id not in summary:
                summary[case_id] = {"entity_count": 0, "entities": []}
            summary[case_id]["entity_count"] += 1
            summary[case_id]["entities"].append(entity_id)
        return summary


class Pipeline:
    """Main ingestion + extraction pipeline — per DATA_FLOW.md."""

    # File extensions to skip (not evidence)
    SKIP_EXTENSIONS = {".zip", ".tar", ".gz", ".env", ".py", ".js"}

    # Config/data files to skip (not evidence)
    SKIP_FILENAMES = {
         "00_CRIME_STORY.md", "ai_providers.json", "pipeline.json", "extraction_output.json",
        "file_contexts.json", "entity_index.json", "relations.json",
        "_processed_files.json", ".env",
    }

    def __init__(self, output_dir: str = "output", use_llm: bool = False, ai_config: str = None,
                 case_id: str | None = None, jurisdiction_node_id: str | None = None,
                 fir_feeder: FeedResult | None = None, llm_model: str | None = None,
                 llm_provider: str | None = None,
                 global_index_dir: str | None = None,
                 persist_database: bool = True):
        pipeline_config = {}
        config_path = Path(__file__).resolve().parent.parent / "config" / "pipeline.json"
        try:
            with config_path.open(encoding="utf-8") as f:
                pipeline_config = json.load(f).get("pipeline", {})
        except (OSError, json.JSONDecodeError):
            pass
        llm_model = llm_model or pipeline_config.get("llm_model")
        llm_provider = llm_provider or pipeline_config.get("llm_provider")
        self.ingestion = IngestionEngine()
        self.ai = AICaller(
            config_path=ai_config,
            storage_dir=f"{output_dir}/llm_responses",
            model=llm_model,
            provider=llm_provider,
            fallbacks=pipeline_config.get("llm_fallbacks", []),
        ) if use_llm else None
        self.extraction = ExtractionEngine(
            ai_caller=self.ai,
            llm_extraction_threshold=int(pipeline_config.get("llm_extraction_threshold", 50)),
            max_text_length=int(pipeline_config.get("max_text_length", 5000)),
        )
        self.resolution = ResolutionEngine(ai=self.ai)
        self.temporal = TemporalEngine()
        self.graph = GraphBuilder()
        self.analytics = AnalyticsEngine()
        self.use_llm = use_llm
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.case_id = case_id
        self.jurisdiction_node_id = jurisdiction_node_id
        self.fir_feeder = fir_feeder
        self.global_index_dir = global_index_dir
        self.persist_database = persist_database
        self.db_run_id: str | None = None  # Database pipeline run ID

        # Multi-FIR tracking: fir_id -> list of entity IDs
        self.fir_entities: Dict[str, List[str]] = {}
        self.fir_relations: Dict[str, List[str]] = {}

        # Track processed files for incremental ingestion: path -> content
        # hash, so a file rewritten in place is re-extracted rather than
        # skipped as "already processed".
        self.processed_files_path = self.output_dir / "_processed_files.json"
        self.processed_files: dict[str, str] = self._load_processed_files()

        # Pipeline run tracking
        self.current_run: Optional[PipelineRun] = None
        self.run_history: List[dict] = []

        # Cross-cutting features
        self.audit_trail = AuditTrail()
        self.calibrator = ConfidenceCalibrator()
        self.cross_case_guard = CrossCaseGuard()
        # Stage 2.5 face-processing stats (RESEARCH_FACE_RECOGNITION doc 08 §7)
        self._face_summary: dict = {"faces": 0, "matches": 0, "candidates": 0}

    def _start_run(self, trigger: str = "new_evidence", parent_run_id: str = None, case_id: str = None) -> PipelineRun:
        """Start a new pipeline run — per DATA_FLOW.md Pipeline Run Versioning."""
        run_id = f"run_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        effective_case_id = case_id or self.case_id
        self.current_run = PipelineRun(
            run_id=run_id,
            case_id=effective_case_id,
            input_snapshot=[],
            jurisdiction_node_id=self.jurisdiction_node_id,
            start_time=datetime.now().isoformat(),
            trigger=trigger,
            parent_run_id=parent_run_id,
            status="running",
        )
        self.audit_trail.set_run_id(run_id)
        self.ingestion.start_run(run_id, case_id=effective_case_id, trigger=trigger)

        if not self.persist_database:
            print("[PIPELINE] Database persistence disabled; using file outputs only")
            return self.current_run

        # Persist to database
        try:
            import psycopg2
            db_url = os.environ.get(
                "DATABASE_URL",
                "postgresql://criminal:criminal_secret@localhost:5432/criminal_network_db"
            )
            if "?" in db_url:
                db_url = db_url.split("?")[0]
            conn = psycopg2.connect(db_url)
            conn.autocommit = True
            cur = conn.cursor()

            # Create Case if case_id is provided and doesn't exist
            if effective_case_id:
                cur.execute('SELECT id FROM "Case" WHERE id = %s', (effective_case_id,))
                if not cur.fetchone():
                    jurisdiction = self.jurisdiction_node_id or "JURISDICTION_DEFAULT"
                    # Ensure jurisdiction node exists
                    cur.execute('SELECT id FROM "JurisdictionNode" WHERE id = %s', (jurisdiction,))
                    if not cur.fetchone():
                        cur.execute("""
                            INSERT INTO "JurisdictionNode" ("id", "name", "nodeType", "status", "createdAt")
                            VALUES (%s, %s, 'CITY', 'ACTIVE', NOW())
                            ON CONFLICT ("id") DO NOTHING
                        """, (jurisdiction, jurisdiction.replace("_", " ").title()))
                    cur.execute("""
                        INSERT INTO "Case" ("id", "jurisdictionNodeId", "caseStatus", "createdAt")
                        VALUES (%s, %s, 'ACTIVE', NOW())
                        ON CONFLICT ("id") DO NOTHING
                    """, (effective_case_id, jurisdiction))
                    print(f"[PIPELINE] Created case: {effective_case_id}")

            cur.execute("""
                INSERT INTO "PipelineRun" ("id", "caseId", "jurisdictionNodeId", "triggerType", "inputFiles", "pipelineVersion", "status", "startTime")
                VALUES (gen_random_uuid()::text, %s, %s, %s, %s, %s, 'RUNNING', NOW())
                RETURNING "id"
            """, (
                effective_case_id,
                self.jurisdiction_node_id,
                trigger,
                json.dumps([]),
                "v4.0",
            ))
            row = cur.fetchone()
            self.db_run_id = row[0] if row else None
            cur.close()
            conn.close()
            if self.db_run_id:
                print(f"[PIPELINE] Database run ID: {self.db_run_id}")
        except Exception as e:
            print(f"[PIPELINE] WARNING: Could not persist run to database: {e}")
            self.db_run_id = None

        return self.current_run

    def _end_run(self, status: str = "completed"):
        """End the current pipeline run."""
        if self.current_run:
            self.current_run.end_time = datetime.now().isoformat()
            self.current_run.status = status
            # Populate input_snapshot from ingestion log
            self.current_run.input_snapshot = [
                f.get("file_name", "") for f in self.ingestion.ingestion_log
                if not f.get("skipped")
            ]
            self.ingestion.end_run(status)
            # Save run to history
            self.run_history.append(self.current_run.to_dict())
            self._save_run_history()

    def _save_run_history(self):
        """Save pipeline run history."""
        history_file = self.output_dir / "run_history.json"
        with open(history_file, "w") as f:
            json.dump(self.run_history, f, indent=2)

    def _run_hypothesis(self, output: dict) -> dict:
        """Stage 7: build falsifiable hypotheses over the evidence graph."""
        print("[PIPELINE] Hypothesis Engine (Stage 7)...")
        self.audit_trail.log("hypothesis", "hypothesis_started", {})
        try:
            summary = generate_hypotheses(
                output_dir=str(self.output_dir),
                run_id=self.current_run.run_id if self.current_run else "",
            )
        except Exception as e:
            print(f"[PIPELINE] WARNING: Stage 7 hypothesis failed: {e}")
            summary = {"mode": "failed", "error": str(e)}
        output["hypothesis"] = summary
        self.audit_trail.log("hypothesis", "hypothesis_completed", summary)
        # Stages 7 and 11 run after _export_results(), which is where the
        # audit trail is normally flushed — flush again so these entries
        # actually reach audit_trail.json instead of dying in memory.
        self.audit_trail.save(str(self.output_dir))
        return summary

    def _run_contradiction(self, output: dict) -> dict:
        """Stage 8: adjudicate contradictions and route the unresolved."""
        print("[PIPELINE] Contradiction Adjudication (Stage 8)...")
        self.audit_trail.log("contradiction", "contradiction_started", {})
        try:
            summary = adjudicate_contradictions(
                output_dir=str(self.output_dir),
                run_id=self.current_run.run_id if self.current_run else "",
            )
        except Exception as e:
            print(f"[PIPELINE] WARNING: Stage 8 contradiction failed: {e}")
            summary = {"mode": "failed", "error": str(e)}
        output["contradiction"] = summary
        self.audit_trail.log("contradiction", "contradiction_completed", summary)
        # Runs after _export_results() flushed the audit trail; flush again
        # so the Stage 8 entries reach audit_trail.json.
        self.audit_trail.save(str(self.output_dir))
        return summary

    def _run_gap(self, output: dict) -> dict:
        """Stage 9: detect and describe missing evidence requirements."""
        print("[PIPELINE] Gap Detection (Stage 9)...")
        self.audit_trail.log("gap", "gap_started", {})
        try:
            summary = detect_gaps(
                output_dir=str(self.output_dir),
                run_id=self.current_run.run_id if self.current_run else "",
            )
        except Exception as e:
            print(f"[PIPELINE] WARNING: Stage 9 gap detection failed: {e}")
            summary = {"mode": "failed", "error": str(e)}
        output["gap"] = summary
        self.audit_trail.log("gap", "gap_completed", summary)
        # Runs after _export_results() flushed the audit trail; flush again
        # so the Stage 9 entries reach audit_trail.json.
        self.audit_trail.save(str(self.output_dir))
        return summary

    def _run_critic(self, output: dict) -> dict:
        """Stage 10: read-only consistency review; findings require a human."""
        print("[PIPELINE] Critic Review (Stage 10)...")
        self.audit_trail.log("critic", "critic_started", {})
        try:
            summary = review_outputs(
                output_dir=str(self.output_dir),
                run_id=self.current_run.run_id if self.current_run else "",
                ai=self.ai,
            )
        except Exception as e:
            print(f"[PIPELINE] WARNING: Stage 10 critic failed: {e}")
            summary = {"mode": "failed", "error": str(e)}
        output["critic"] = summary
        self.audit_trail.log("critic", "critic_completed", summary)
        self.audit_trail.save(str(self.output_dir))
        return summary

    def _run_global_push(self, output: dict) -> dict:
        """Stage 11: push identity signals to the global entity index."""
        print("[PIPELINE] Global Entity Push (Stage 11)...")
        self.audit_trail.log("global_push", "global_push_started", {})
        try:
            summary = GlobalPushEngine().push(
                output_dir=str(self.output_dir),
                run_id=self.current_run.run_id if self.current_run else "",
                case_id=self.case_id,
                jurisdiction_node_id=self.jurisdiction_node_id,
                index_dir=self.global_index_dir,
                database_enabled=self.persist_database,
            )
        except Exception as e:
            print(f"[PIPELINE] WARNING: Stage 11 global push failed: {e}")
            summary = {"mode": "failed", "error": str(e)}
        output["global_push"] = summary
        self.audit_trail.log("global_push", "global_push_completed", summary)
        # Runs after _export_results() flushed the audit trail; flush again
        # so the Stage 11 entries reach audit_trail.json.
        self.audit_trail.save(str(self.output_dir))
        return summary

    def _persist_to_database(self, output: dict):
        """Persist all pipeline results to the database using psycopg2."""
        if not self.persist_database:
            return
        if not self.db_run_id:
            print("[PIPELINE] No database run ID, skipping persistence")
            return

        if not self.case_id:
            # Case-scoped analytical tables must never be replaced by an
            # unscoped run. Mark its run record complete, but leave all case
            # data untouched and keep the JSON outputs as the result.
            print("[PIPELINE] No case_id; skipping case-scoped database sync")
            try:
                import psycopg2
                db_url = os.environ.get(
                    "DATABASE_URL",
                    "postgresql://criminal:criminal_secret@localhost:5432/criminal_network_db"
                ).split("?")[0]
                conn = psycopg2.connect(db_url)
                conn.autocommit = True
                cur = conn.cursor()
                cur.execute('''
                    UPDATE "PipelineRun"
                    SET "status" = 'COMPLETED', "endTime" = NOW(), "summary" = %s::jsonb
                    WHERE "id" = %s
                ''', (json.dumps(output.get("summary", {})), self.db_run_id))
                cur.close()
                conn.close()
            except Exception as e:
                print(f"[PIPELINE] ERROR: Could not finalize unscoped run record: {e}")
                import traceback
                traceback.print_exc()
                raise RuntimeError(f"Database persistence failed: {e}") from e
            return

        print(f"[PIPELINE] Persisting results to database (run: {self.db_run_id})...")

        try:
            import psycopg2
            import psycopg2.extras

            db_url = os.environ.get(
                "DATABASE_URL",
                "postgresql://criminal:criminal_secret@localhost:5432/criminal_network_db"
            )
            if "?" in db_url:
                db_url = db_url.split("?")[0]
            conn = psycopg2.connect(db_url)
            conn.autocommit = True
            cur = conn.cursor()
            run_id = self.db_run_id
            case_id = self.case_id

            # 0. Persist ingested files first (needed for FK on ExtractedEntity)
            ingested_files_file = self.output_dir / "extraction_summary.json"
            file_id_map = {}  # filename -> database ingested file id
            if ingested_files_file.exists():
                with open(ingested_files_file) as f:
                    summary_data = json.load(f)
                files_info = summary_data.get("ingestion_summary", {}).get("files", [])
                # Map ingestion source_type to DB SourceType enum
                source_type_map = {
                    "text": "TEXT", "csv": "CDR", "json": "DEVICE",
                    "pdf": "DOCUMENT", "docx": "DOCUMENT", "xlsx": "BANK",
                    "image": "IMAGE", "png": "IMAGE", "jpg": "IMAGE",
                    "fir": "FIR", "cctv": "CCTV", "social": "SOCIAL",
                    "bank": "BANK", "cdr": "CDR", "audio": "AUDIO",
                    "video": "VIDEO",
                }
                for fi in files_info:
                    fname = fi.get("name", "")
                    ftype = fi.get("type", "unknown")
                    fhash = fi.get("file_hash", "")
                    source_type_raw = fi.get("source_type", "unknown")
                    source_type = source_type_map.get(source_type_raw.lower(), "UNKNOWN")
                    cur.execute("""
                        INSERT INTO "IngestedFile" ("id", "runId", "caseId", "fileName", "filePath", "fileExt", "fileHash", "fileSizeBytes", "detectedType", "sourceType", "ingestionTime")
                        VALUES (gen_random_uuid()::text, %s, %s, %s, %s, %s, %s, 0, %s, %s, NOW())
                        RETURNING "id", "fileName"
                    """, (run_id, case_id, fname, fname, ftype, fhash, ftype, source_type))
                    row = cur.fetchone()
                    if row:
                        file_id_map[row[1]] = row[0]
                print(f"[PIPELINE]   -> Persisted {len(file_id_map)} ingested files")

            # 0b. Persist per-file adversarial checks.
            #
            #     This is persistence ONLY of the existing in-memory result
            #     (IngestionEngine.adversarial_checks). Detection logic,
            #     thresholds and every JSON output are left untouched — the
            #     analytical result already exists in extraction_summary.json
            #     before this runs, so the DB copy is never authoritative.
            #
            #     riskLevel is deliberately NOT written and falls to its schema
            #     default (LOW). The pipeline computes score / reasons / the four
            #     anomaly flags but produces no risk classification, and none is
            #     documented in OUTPUTS.md or 11_STAGE1_INGESTION.md. Deriving one
            #     here would be a new analytical policy disguised as persistence.
            #     LIMITATION: AdversarialCheck.riskLevel is schema-required but
            #     has no defined pipeline derivation — persisted records use the
            #     schema default LOW, and consumers must not read this field as
            #     an analytically derived risk classification.
            #
            #     Non-authoritative and non-blocking: guarded by its own
            #     try/except so a failure cannot abort the remaining
            #     persistence (prune + run status) or the run itself.
            try:
                checks = getattr(self.ingestion, "adversarial_checks", {}) or {}
                adv_rows = []
                skipped_checks = []
                for fname, chk in checks.items():
                    ingested_file_id = file_id_map.get(fname)
                    if not ingested_file_id:
                        skipped_checks.append(fname)
                        continue
                    adv_rows.append((
                        generate_id("ADVCHK", f"{run_id}:{fname}"),
                        run_id,
                        ingested_file_id,
                        bool(chk.is_suspicious),
                        bool(chk.behavioral_anomaly),
                        bool(chk.temporal_anomaly),
                        bool(chk.content_anomaly),
                        bool(chk.duplicate_suspect),
                        float(chk.score),
                        json.dumps(list(chk.reasons or [])),
                    ))
                if skipped_checks:
                    print(f"[PIPELINE]   WARNING: {len(skipped_checks)} adversarial "
                          f"checks skipped (no IngestedFile row): {skipped_checks[:5]}")
                if adv_rows:
                    psycopg2.extras.execute_batch(cur, """
                        INSERT INTO "AdversarialCheck"
                            ("id", "runId", "ingestedFileId", "isSuspicious",
                             "behavioralAnomaly", "temporalAnomaly", "contentAnomaly",
                             "duplicateSuspect", "score", "reasons")
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                        ON CONFLICT ("id") DO UPDATE SET
                            "runId" = EXCLUDED."runId",
                            "ingestedFileId" = EXCLUDED."ingestedFileId",
                            "isSuspicious" = EXCLUDED."isSuspicious",
                            "behavioralAnomaly" = EXCLUDED."behavioralAnomaly",
                            "temporalAnomaly" = EXCLUDED."temporalAnomaly",
                            "contentAnomaly" = EXCLUDED."contentAnomaly",
                            "duplicateSuspect" = EXCLUDED."duplicateSuspect",
                            "score" = EXCLUDED."score",
                            "reasons" = EXCLUDED."reasons"
                    """, adv_rows, page_size=200)
                    print(f"[PIPELINE]   -> Persisted {len(adv_rows)} adversarial checks")
            except Exception as adv_err:
                print(f"[PIPELINE]   WARNING: adversarial check persistence "
                      f"skipped (non-blocking): {adv_err}")

            # 1. Persist extracted entities
            entities = output.get("entities", [])
            relations = output.get("relations", [])
            # Create the fallback file only when records truly lack a known
            # source. Avoid adding a fake __UNKNOWN__ evidence row to normal
            # runs where each item maps to an ingested source file.
            source_ids = [record.get("source_id") or ""
                          for record in [*entities, *relations]]
            if any(source_id not in file_id_map for source_id in source_ids):
                cur.execute("""
                    INSERT INTO "IngestedFile"
                        ("id", "runId", "caseId", "fileName", "filePath",
                         "fileExt", "fileHash", "fileSizeBytes", "detectedType",
                         "sourceType", "ingestionTime")
                    VALUES (gen_random_uuid()::text, %s, %s, '__UNKNOWN__',
                            '__UNKNOWN__', 'unknown', 'none', 0, 'unknown',
                            'UNKNOWN', NOW())
                    RETURNING "id"
                """, (run_id, case_id))
                unknown_file_id = cur.fetchone()[0]
                file_id_map[""] = unknown_file_id
                file_id_map["unknown"] = unknown_file_id
            if entities:
                entity_rows = []
                for e in entities:
                    conf = e.get("confidence", {})
                    score = conf.get("score", 0.0) if isinstance(conf, dict) else 0.0
                    supporting = conf.get("supporting_count", 1) if isinstance(conf, dict) else 1
                    source_file = e.get("source_id") or ""
                    ingested_file_id = file_id_map.get(source_file, "")
                    entity_rows.append((
                        e.get("id", ""),
                        run_id, case_id,
                        ingested_file_id,
                        e.get("entity_type", "PERSON").upper(),
                        e.get("name", ""),
                        score,
                        e.get("epistemic_category", "INFERENCE").upper(),
                        3, supporting, e.get("derivation_depth", 0),
                    ))
                psycopg2.extras.execute_batch(cur, """
                    INSERT INTO "ExtractedEntity" ("id", "runId", "caseId", "ingestedFileId", "entityType", "mentionText", "confidenceScore", "epistemicCategory", "sourceReliability", "evidenceBasis", "derivationDepth", "createdAt")
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                    ON CONFLICT ("id") DO UPDATE SET
                        "runId" = EXCLUDED."runId",
                        "caseId" = EXCLUDED."caseId",
                        "ingestedFileId" = EXCLUDED."ingestedFileId",
                        "confidenceScore" = EXCLUDED."confidenceScore"
                """, entity_rows, page_size=500)
                print(f"[PIPELINE]   -> Persisted {len(entity_rows)} extracted entities")

            # 2. Persist extracted relations
            if relations:
                relation_rows = []
                # Map relation types not in DB enum to valid values
                rel_type_map = {
                    "OWNS_PHONE": "ASSOCIATED_WITH",
                    "SHARED_PHONE": "ASSOCIATED_WITH",
                    "SHARED_LOCATION": "ASSOCIATED_WITH",
                }
                for r in relations:
                    conf = r.get("confidence", {})
                    score = conf.get("score", 0.0) if isinstance(conf, dict) else 0.0
                    source_file = r.get("source_id") or ""
                    ingested_file_id = file_id_map.get(source_file, "")
                    rel_type = r.get("relation_type", "ASSOCIATED_WITH").upper()
                    rel_type = rel_type_map.get(rel_type, rel_type)
                    relation_rows.append((
                        r.get("id", ""),
                        run_id, case_id,
                        ingested_file_id,
                        r.get("source_entity_id", ""),
                        r.get("target_entity_id", ""),
                        rel_type,
                        score,
                        r.get("epistemic_category", "INFERENCE").upper(),
                    ))
                psycopg2.extras.execute_batch(cur, """
                    INSERT INTO "ExtractedRelation" ("id", "runId", "caseId", "ingestedFileId", "sourceEntityId", "targetEntityId", "relationType", "confidenceScore", "epistemicCategory", "createdAt")
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                    ON CONFLICT ("id") DO UPDATE SET
                        "runId" = EXCLUDED."runId",
                        "caseId" = EXCLUDED."caseId",
                        "ingestedFileId" = EXCLUDED."ingestedFileId",
                        "confidenceScore" = EXCLUDED."confidenceScore"
                """, relation_rows, page_size=500)
                print(f"[PIPELINE]   -> Persisted {len(relation_rows)} extracted relations")

            # 3. Persist resolved entities
            resolved_file = self.output_dir / "resolved_entities.json"
            if resolved_file.exists():
                with open(resolved_file) as f:
                    resolved_data = json.load(f)
                    resolved_list = list(resolved_data.values()) if isinstance(resolved_data, dict) else resolved_data
                resolved_rows = []
                for re in resolved_list:
                    merge_type = re.get("merge_type", "AUTO").upper()
                    if merge_type not in ("AUTO", "REVIEW", "REJECT", "SINGLE", "LLM"):
                        merge_type = "AUTO"
                    resolved_rows.append((
                        run_id, case_id,
                        re.get("entity_type", "PERSON").upper(),
                        re.get("canonical_name", re.get("name", "")),
                        re.get("merge_confidence", re.get("confidence", 0.0)),
                        merge_type,
                        re.get("epistemic_category", "INFERENCE").upper(),
                        json.dumps(re.get("phone_numbers")) if re.get("phone_numbers") else None,
                        json.dumps(re.get("plate_numbers")) if re.get("plate_numbers") else None,
                        json.dumps(re.get("bank_accounts")) if re.get("bank_accounts") else None,
                        json.dumps(re.get("location_names")) if re.get("location_names") else None,
                    ))
                psycopg2.extras.execute_batch(cur, """
                    INSERT INTO "ResolvedEntity" ("id", "runId", "caseId", "entityType", "canonicalName", "mergeConfidence", "mergeType", "epistemicCategory", "phoneNumbers", "plateNumbers", "bankAccounts", "locationNames", "createdAt")
                    VALUES (gen_random_uuid()::text, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                """, resolved_rows, page_size=500)
                print(f"[PIPELINE]   -> Persisted {len(resolved_list)} resolved entities")

            # 4. Persist graph nodes
            graph_nodes_file = self.output_dir / "graph_nodes.json"
            if graph_nodes_file.exists():
                with open(graph_nodes_file) as f:
                    nodes = json.load(f)
                node_rows = []
                for n in nodes:
                    node_rows.append((
                        n.get("id", ""),
                        run_id, case_id,
                        n.get("node_type", "PERSON").upper(),
                        n.get("canonical_name", n.get("label", "")),
                        n.get("confidence", 0.0),
                        n.get("resolution_status", "UNRESOLVED").upper(),
                        json.dumps(n.get("provenance_chain")) if n.get("provenance_chain") else None,
                    ))
                psycopg2.extras.execute_batch(cur, """
                    INSERT INTO "GraphNode" ("id", "runId", "caseId", "nodeType", "canonicalName", "confidence", "resolutionStatus", "provenanceChain", "createdAt")
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
                    ON CONFLICT ("id") DO UPDATE SET
                        "runId" = EXCLUDED."runId",
                        "caseId" = EXCLUDED."caseId",
                        "nodeType" = EXCLUDED."nodeType",
                        "canonicalName" = EXCLUDED."canonicalName",
                        "confidence" = EXCLUDED."confidence",
                        "resolutionStatus" = EXCLUDED."resolutionStatus",
                        "provenanceChain" = EXCLUDED."provenanceChain"
                """, node_rows, page_size=500)
                print(f"[PIPELINE]   -> Persisted {len(node_rows)} graph nodes")

            # 5. Persist graph edges
            graph_edges_file = self.output_dir / "graph_edges.json"
            if graph_edges_file.exists():
                with open(graph_edges_file) as f:
                    edges = json.load(f)
                edge_rows = []
                # Map invalid relation types for graph edges too
                for e in edges:
                    rel_type = e.get("relationship_type", "ASSOCIATED_WITH").upper()
                    rel_type = rel_type_map.get(rel_type, rel_type)
                    sem_type = e.get("semantic_edge_type", "ASSOCIATIONAL").upper() or "ASSOCIATIONAL"
                    if sem_type not in ("ENTREPRENEURIAL", "ASSOCIATIONAL", "QUASI_GOVERNMENTAL"):
                        sem_type = "ASSOCIATIONAL"
                    edge_conf = e.get("confidence", 0.0)
                    edge_conf_score = edge_conf.get("score", 0.0) if isinstance(edge_conf, dict) else float(edge_conf or 0.0)
                    edge_adv = e.get("adversarial_score")
                    if isinstance(edge_adv, dict):
                        edge_adv = edge_adv.get("score")
                    edge_rows.append((
                        run_id, case_id,
                        e.get("source_id", ""),
                        e.get("target_id", ""),
                        rel_type,
                        sem_type,
                        e.get("edge_type", "associational"),
                        edge_conf_score,
                        edge_adv,
                        json.dumps(e.get("supporting_evidence")) if e.get("supporting_evidence") else None,
                    ))
                psycopg2.extras.execute_batch(cur, """
                    INSERT INTO "GraphEdge" ("id", "runId", "caseId", "sourceId", "targetId", "relationshipType", "semanticEdgeType", "edgeType", "confidenceScore", "adversarialScore", "supportingEvidence", "createdAt")
                    VALUES (gen_random_uuid()::text, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                """, edge_rows, page_size=500)
                print(f"[PIPELINE]   -> Persisted {len(edge_rows)} graph edges")

            # 6. Persist contradictions
            contradictions_file = self.output_dir / "contradictions.json"
            if contradictions_file.exists():
                with open(contradictions_file) as f:
                    contradictions = json.load(f)
                contradiction_list = list(contradictions.values()) if isinstance(contradictions, dict) else contradictions
                contra_rows = []
                for c in contradiction_list:
                    resolved = bool(c.get("resolved", False))
                    contra_rows.append((
                        run_id,
                        c.get("type", c.get("contradiction_type", "UNKNOWN")).upper(),
                        c.get("severity", "MEDIUM").upper(),
                        c.get("description", ""),
                        json.dumps(c.get("entity_ids", c.get("entities", []))),
                        resolved,
                        (c.get("resolved_by", "") or None) if resolved else None,
                        datetime.now().isoformat() if resolved else None,
                    ))
                psycopg2.extras.execute_batch(cur, """
                    INSERT INTO "Contradiction" ("id", "runId", "contradictionType", "severity", "description", "entities", "isResolved", "resolvedById", "resolvedAt", "createdAt")
                    VALUES (gen_random_uuid()::text, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                """, contra_rows, page_size=500)
                print(f"[PIPELINE]   -> Persisted {len(contradiction_list)} contradictions")

            # 7. Persist temporal infos
            temporal_file = self.output_dir / "temporal_infos.json"
            if temporal_file.exists():
                with open(temporal_file) as f:
                    temporal_infos = json.load(f)
                temporal_rows = []
                for ti in temporal_infos:
                    temporal_rows.append((
                        run_id,
                        ti.get("entity_id", ""),
                        ti.get("time_expression", ti.get("raw_text", "")),
                        ti.get("normalized_start"),
                        ti.get("normalized_end"),
                        ti.get("time_type", "POINT"),
                        ti.get("confidence", 0.0),
                    ))
                psycopg2.extras.execute_batch(cur, """
                    INSERT INTO "TemporalInfo" ("id", "runId", "entityId", "timeExpression", "normalizedStart", "normalizedEnd", "granularity", "confidence", "createdAt")
                    VALUES (gen_random_uuid()::text, %s, %s, %s, %s, %s, %s, %s, NOW())
                """, temporal_rows, page_size=500)
                print(f"[PIPELINE]   -> Persisted {len(temporal_rows)} temporal infos")

            # 8. Persist spatial infos
            spatial_file = self.output_dir / "spatial_infos.json"
            if spatial_file.exists():
                with open(spatial_file) as f:
                    spatial_infos = json.load(f)
                spatial_rows = []
                for si in spatial_infos:
                    spatial_rows.append((
                        run_id,
                        si.get("entity_id", ""),
                        si.get("location_text", si.get("normalized_location", si.get("raw_text", ""))),
                        si.get("latitude"),
                        si.get("longitude"),
                        si.get("radius"),
                        si.get("confidence", 0.0),
                    ))
                psycopg2.extras.execute_batch(cur, """
                    INSERT INTO "SpatialInfo" ("id", "runId", "entityId", "locationName", "lat", "lng", "radius", "confidence", "createdAt")
                    VALUES (gen_random_uuid()::text, %s, %s, %s, %s, %s, %s, %s, NOW())
                """, spatial_rows, page_size=500)
                print(f"[PIPELINE]   -> Persisted {len(spatial_rows)} spatial infos")

            # 8b. Prune rows from previous runs: these tables mirror the
            # current run's outputs (present state, not history — PipelineRun
            # / GlobalEntity* carry the cross-run record). Content-keyed
            # tables (ExtractedEntity/ExtractedRelation/GraphNode) were
            # upserted above so only their stale leftovers are removed; the
            # uuid-keyed per-run tables (ResolvedEntity, GraphEdge, ...) are
            # replaced wholesale. Order is FK-safe: children before parents
            # (relations before entities, edges before nodes, files last);
            # every FK child not written by the pipeline is empty (verified).
            # Runs inside try: a prune failure must not fail the run — the
            # next run's prune self-heals the leftovers.
            try:
                stale_tables = [
                    "ExtractedRelation", "TemporalInfo", "SpatialInfo",
                    "ExtractedEntity", "ResolvedEntity", "Contradiction",
                    "GraphEdge", "GraphNode", "AdversarialCheck", "IngestedFile",
                ]
                pruned_counts = {}
                for tbl in stale_tables:
                    cur.execute(
                        f'''DELETE FROM "{tbl}"
                            WHERE "runId" IN (
                                SELECT "id" FROM "PipelineRun"
                                WHERE "caseId" = %s AND "id" <> %s
                            )''',
                        (case_id, run_id),
                    )
                    if cur.rowcount:
                        pruned_counts[tbl] = cur.rowcount
                if pruned_counts:
                    print(f"[PIPELINE]   -> Pruned stale rows: {pruned_counts}")
            except Exception as prune_err:
                print(f"[PIPELINE]   -> WARNING: stale-row prune incomplete: {prune_err}")

            # 9. Update pipeline run status
            summary = output.get("summary", {})
            cur.execute("""
                UPDATE "PipelineRun"
                SET "status" = 'COMPLETED', "endTime" = NOW(), "summary" = %s::jsonb
                WHERE "id" = %s
            """, (json.dumps(summary), run_id))
            print(f"[PIPELINE]   -> Updated pipeline run status to COMPLETED")

            cur.close()
            conn.close()
            print(f"[PIPELINE] Database persistence complete")

        except Exception as e:
            print(f"[PIPELINE] ERROR: Database persistence failed: {e}")
            import traceback
            traceback.print_exc()
            raise RuntimeError(f"Database persistence failed: {e}") from e

    def run_batch(self, input_dir: str) -> dict:
        """Process all files in a directory. Skips already-processed files."""
        print(f"[PIPELINE] Starting batch processing of: {input_dir}")

        # Start a new pipeline run
        run = self._start_run(trigger="new_evidence")
        print(f"[PIPELINE] Run ID: {run.run_id}")

        # Log audit trail start
        self.audit_trail.log("pipeline", "run_started", {
            "input_dir": input_dir,
            "run_id": run.run_id,
        })

        # Load existing extraction state if output exists
        self._load_existing_state()

        # Step 1: Ingest all files
        print("[PIPELINE] Step 1/8: Ingesting files (Stage 1)...")
        ingested = self.ingestion.ingest_directory(input_dir)
        # Cross-file adversarial rules need the full corpus; run before
        # extraction reads per-file adversarial flags (Stage 1 → Stage 2).
        self.ingestion.finalize_adversarial_checks(run_id=run.run_id)

        # Filter out non-evidence files
        evidence_files = []
        for f in ingested:
            if f.get("skipped"):
                continue
            fname = f.get("file_name", "")
            ext = f.get("file_ext", ".unknown")
            if ext in self.SKIP_EXTENSIONS or fname in self.SKIP_FILENAMES:
                continue
            evidence_files.append(f)

        print(f"[PIPELINE]   -> Ingested {len(ingested)} files, {len(evidence_files)} evidence files")
        self.audit_trail.log("ingestion", "files_ingested", {
            "total": len(ingested),
            "evidence": len(evidence_files),
        })

        # Step 2: Extract from each file (skip already processed)
        print("[PIPELINE] Step 2/8: Extracting entities and relations (Stage 2)...")
        self.audit_trail.log("extraction", "extraction_started", {
            "files_to_process": len(evidence_files),
        })
        processed_count = 0
        skipped_count = 0
        for i, file_info in enumerate(evidence_files, 1):
            file_name = file_info.get("file_name", "unknown")
            file_path = file_info.get("file_path", "")
            file_hash = file_info.get("file_hash", "")

            # Skip already processed files — unless their content changed
            if self._is_processed(file_path, file_hash):
                print(f"[PIPELINE]   -> [{i}/{len(evidence_files)}] SKIP (already processed): {file_name}")
                skipped_count += 1
                continue

            print(f"[PIPELINE]   -> [{i}/{len(evidence_files)}] Processing: {file_name}")

            # Extraction (code + optional LLM for text files)
            result = self.extraction.extract_from_file(file_info, run_id=run.run_id)

            # Mark as processed
            self._mark_processed(file_path, file_hash)
            processed_count += 1

        # Step 2.5: Face processing (Stage 2.5 — RESEARCH_FACE_RECOGNITION doc 08 §7)
        print("[PIPELINE] Step 2.5/8: Face processing (Stage 2.5)...")
        face_stats = self._run_faces(evidence_files=evidence_files)
        print(f"[PIPELINE]   -> {face_stats.get('faces', 0)} faces, "
              f"{face_stats.get('matches', 0)} matches, "
              f"{face_stats.get('candidates', 0)} candidates")

        # Step 3: Export results
        print("[PIPELINE] Step 3/8: Exporting results...")
        self.audit_trail.log("extraction", "extraction_completed", {
            "files_processed": processed_count,
            "files_skipped": skipped_count,
            "total_entities": len(self.extraction.entities),
            "total_relations": len(self.extraction.relations),
        })
        output = self._export_results()

        # Step 3.5: Resolve dangling references
        print("[PIPELINE] Step 3.5/8: Resolving dangling references...")
        dangling_fixed = self.extraction.resolve_dangling_references()
        if dangling_fixed:
            print(f"[PIPELINE]   -> Fixed {dangling_fixed} dangling references")

        # Step 3.6: Ensure all relation-referenced IDs have entities
        stubs_created = self.extraction.ensure_entity_completeness()
        if stubs_created:
            print(f"[PIPELINE]   -> Created {stubs_created} stub entities for missing relation targets")

        # Re-export after fixing
        if dangling_fixed or stubs_created:
            output = self._export_results()

        # Step 4: Entity Resolution
        print("[PIPELINE] Step 4/8: Entity resolution (Stage 3)...")
        entities = output.get("entities", [])
        relations = output.get("relations", [])
        self.audit_trail.log("resolution", "resolution_started", {
            "input_entities": len(entities),
            "input_relations": len(relations),
        })
        resolution_summary = self.resolution.resolve(
            entities=entities,
            relations=relations,
            output_dir=str(self.output_dir),
            run_id=run.run_id,
        )
        output["resolution"] = resolution_summary
        self.audit_trail.log("resolution", "resolution_completed", {
            "resolved_entities": resolution_summary.get("resolved_entities", 0),
            "auto_merges": resolution_summary.get("auto_merges", 0),
            "llm_merges": resolution_summary.get("llm_merges", 0),
            "contradictions": resolution_summary.get("contradictions", 0),
        })

        # Step 5: Temporal Enrichment
        print("[PIPELINE] Step 5/8: Temporal enrichment (Stage 4)...")
        self.audit_trail.log("temporal", "temporal_started", {})
        # Stage 4 consumes Stage 3's canonical output when it exists, so
        # temporal_infos/spatial_infos bind to RES_ ids rather than the raw
        # extraction ids.
        resolved_entities_file = self.output_dir / "resolved_entities.json"
        temporal_input_entities = entities
        if resolved_entities_file.exists():
            try:
                with open(resolved_entities_file, encoding="utf-8") as f:
                    resolved_data = json.load(f)
                    temporal_input_entities = (
                        list(resolved_data.values())
                        if isinstance(resolved_data, dict)
                        else resolved_data
                    )
            except Exception:  # noqa: BLE001 - corrupt state must not abort the run
                temporal_input_entities = entities

        temporal_summary = self.temporal.enrich(
            entities=temporal_input_entities,
            relations=relations,
            output_dir=str(self.output_dir),
            run_id=run.run_id,
        )
        output["temporal"] = temporal_summary
        self.audit_trail.log("temporal", "temporal_completed", {
            "temporal_infos": temporal_summary.get("temporal_infos", 0),
            "spatial_infos": temporal_summary.get("spatial_infos", 0),
            "timeline_events": temporal_summary.get("timeline_events", 0),
        })

        # Step 5: Graph Build (Stage 5 per architecture)
        print("[PIPELINE] Step 6/8: Graph build (Stage 5)...")
        # Load resolved entities from RESOLVED_ENTITIES_STORE
        resolved_entities_file = self.output_dir / "resolved_entities.json"
        resolved_entities = []
        if resolved_entities_file.exists():
            with open(resolved_entities_file) as f:
                resolved_data = json.load(f)
                resolved_entities = list(resolved_data.values()) if isinstance(resolved_data, dict) else resolved_data

        # Load unknown entities from UNKNOWN_ENTITIES_STORE
        unknown_entities_file = self.output_dir / "unknown_entities.json"
        unknown_entities = []
        if unknown_entities_file.exists():
            with open(unknown_entities_file) as f:
                unknown_data = json.load(f)
                unknown_entities = list(unknown_data.values()) if isinstance(unknown_data, dict) else unknown_data

        # Load temporal infos from TEMPORAL_SPATIAL_STORE
        temporal_infos_file = self.output_dir / "temporal_infos.json"
        temporal_infos = []
        if temporal_infos_file.exists():
            with open(temporal_infos_file) as f:
                temporal_infos = json.load(f)

        # Load spatial infos from TEMPORAL_SPATIAL_STORE
        spatial_infos_file = self.output_dir / "spatial_infos.json"
        spatial_infos = []
        if spatial_infos_file.exists():
            with open(spatial_infos_file) as f:
                spatial_infos = json.load(f)

        # Load coverage intervals from TEMPORAL_SPATIAL_STORE
        coverage_intervals_file = self.output_dir / "coverage_intervals.json"
        coverage_intervals = []
        if coverage_intervals_file.exists():
            with open(coverage_intervals_file) as f:
                coverage_intervals = json.load(f)

        # Load contradictions from CONTRADICTIONS_STORE
        contradictions_file = self.output_dir / "contradictions.json"
        contradictions = {}
        if contradictions_file.exists():
            with open(contradictions_file) as f:
                contradictions = json.load(f)

        # Load raw evidence from RAW_EVIDENCE_STORE (A5 fix)
        raw_evidence = []
        if hasattr(self.ingestion, 'raw_evidence'):
            raw_evidence = [r.to_dict() for r in self.ingestion.raw_evidence.values()]
        else:
            # Fallback: load from processed_files metadata
            processed_files_file = self.output_dir / "processed_files.json"
            if processed_files_file.exists():
                with open(processed_files_file) as f:
                    raw_evidence = json.load(f)

        # Load dependency groups
        dependency_groups = [
            g.to_dict() for g in self.ingestion.dependency_groups.values()
        ]

        graph_summary = self.graph.build(
            entities=entities,
            relations=relations,
            resolved_entities=resolved_entities,
            unknown_entities=unknown_entities,
            dependency_groups=dependency_groups,
            temporal_infos=temporal_infos,
            spatial_infos=spatial_infos,
            coverage_intervals=coverage_intervals,
            contradictions=contradictions,
            raw_evidence=raw_evidence,
            output_dir=str(self.output_dir),
            run_id=run.run_id,
        )
        output["graph"] = graph_summary
        self.audit_trail.log("graph", "graph_completed", {
            "nodes": graph_summary.get("nodes", 0),
            "edges": graph_summary.get("edges", 0),
            "provenance_chains": graph_summary.get("provenance_chains", 0),
            "missing_edges": graph_summary.get("missing_edges", 0),
            "rejected_edges": graph_summary.get("rejected_edges", 0),
            "adversarial_flagged": graph_summary.get("adversarial_flagged", 0),
            "multiplexity_ties": graph_summary.get("multiplexity_ties", 0),
        })

        # Step 7/8: Analytics (Stage 6)
        print("[PIPELINE] Step 7/8: Analytics (Stage 6)...")
        self.audit_trail.log("analytics", "analytics_started", {})
        analytics_summary = self.analytics.analyze(
            output_dir=str(self.output_dir),
            run_id=run.run_id,
        )
        output["analytics"] = analytics_summary
        self.audit_trail.log("analytics", "analytics_completed", {
            "centrality_scores": analytics_summary.get("centrality_scores", 0),
            "communities": analytics_summary.get("communities", 0),
            "anomaly_signals": analytics_summary.get("anomaly_signals", 0),
            "behavioral_baselines": analytics_summary.get("behavioral_baselines", 0),
            "correlations": analytics_summary.get("correlations", 0),
            "component_analyses": analytics_summary.get("component_analyses", 0),
            "temporal_patterns": analytics_summary.get("temporal_patterns", 0),
        })

        # End the run BEFORE final export so summary includes completed status
        self._end_run(status="completed")

        # Final export with completed run info
        output = self._export_results()

        # Stage 8: Contradiction Adjudication (must run before Hypotheses so
        # standing/resolved status is known when they are scored)
        self._run_contradiction(output)

        # Stage 7: Hypothesis Engine (falsifiable hypotheses scored against
        # the adjudicated contradictions)
        self._run_hypothesis(output)

        # Stage 9: Gap Detection (missing evidence requirements)
        self._run_gap(output)

        # Stage 10: Critic (read-only consistency review)
        self._run_critic(output)

        # Stage 11: Global Entity Push (cross-case identity index)
        self._run_global_push(output)

        # Persist all results to database
        self._persist_to_database(output)

        # Print summary
        summary = output["summary"]
        print(f"\n{'='*60}")
        print(f"[PIPELINE] EXTRACTION COMPLETE — Run {run.run_id}")
        print(f"{'='*60}")
        print(f"New files processed: {processed_count}")
        print(f"Skipped (existing):  {skipped_count}")
        print(f"Total entities:      {summary['total_entities']}")
        print(f"Total relations:     {summary['total_relations']}")
        print(f"Entity types:        {summary['entity_types']}")
        print(f"Relation types:      {summary['relation_types']}")
        print(f"{'='*60}")
        print(f"[RESOLUTION] SUMMARY")
        print(f"{'='*60}")
        print(f"Input entities:      {resolution_summary['input_entities']}")
        print(f"Auto-merges:         {resolution_summary['auto_merges']}")
        print(f"LLM merges:          {resolution_summary['llm_merges']}")
        print(f"Resolved entities:   {resolution_summary['resolved_entities']}")
        print(f"Unknown entities:    {resolution_summary['unknown_entities']}")
        print(f"Contradictions:      {resolution_summary['contradictions']}")
        print(f"{'='*60}")
        print(f"[TEMPORAL] SUMMARY")
        print(f"{'='*60}")
        print(f"Temporal infos:      {temporal_summary['temporal_infos']}")
        print(f"Spatial infos:       {temporal_summary['spatial_infos']}")
        print(f"Coverage intervals:  {temporal_summary['coverage_intervals']}")
        print(f"Timeline events:     {temporal_summary['timeline_events']}")
        print(f"{'='*60}")
        print(f"[GRAPH] SUMMARY")
        print(f"{'='*60}")
        print(f"Graph nodes:         {graph_summary['nodes']}")
        print(f"Graph edges:         {graph_summary['edges']}")
        print(f"Missing edges:       {graph_summary['missing_edges']}")
        print(f"Rejected edges:      {graph_summary['rejected_edges']}")
        print(f"Adversarial flagged: {graph_summary['adversarial_flagged']}")
        print(f"Provenance chains:   {graph_summary['provenance_chains']}")
        print(f"Edge types:          {graph_summary['edge_types']}")
        print(f"{'='*60}")
        print(f"Output saved to:     {self.output_dir}")

        return output

    def run_incremental(self, input_dir: str) -> dict:
        """Process only NEW files since last run."""
        print(f"[PIPELINE] Starting incremental processing of: {input_dir}")

        # Determine parent run
        parent_run_id = self.current_run.run_id if self.current_run else None
        run = self._start_run(trigger="new_evidence", parent_run_id=parent_run_id)
        print(f"[PIPELINE] Run ID: {run.run_id} (parent: {parent_run_id})")

        # Load existing state
        self._load_existing_state()

        # Find new files (with extension filtering like run_batch)
        SUPPORTED_EXTENSIONS = self.ingestion.SUPPORTED_EXTENSIONS
        SKIP_EXTENSIONS = {'.md', '.zip', '.tar', '.gz', '.env', '.py', '.js', '.ts', '.lock', '.log'}
        SKIP_FILENAMES = {'entity_index.json', 'extraction_output.json', 'extraction_summary.json',
                          'audit_trail.json', 'graph_log.json', 'resolution_log.json',
                          'temporal_log.json', 'run_history.json', 'processed_files.json'}

        all_files = []
        for file_path in Path(input_dir).rglob("*"):
            if file_path.is_file():
                ext = file_path.suffix.lower()
                name = file_path.name
                # Apply same filtering as run_batch
                if ext in SKIP_EXTENSIONS or ext not in SUPPORTED_EXTENSIONS:
                    continue
                if name in SKIP_FILENAMES:
                    continue
                # Normalize to absolute path for consistent processed tracking
                file_str = str(file_path.absolute())
                if not self._is_processed(file_str, self._known_hash(file_str)):
                    all_files.append(file_str)

        new_file_infos: List[dict] = []
        if not all_files:
            print("[PIPELINE] No new files to extract.")
            # Still run resolution and temporal enrichment on existing data
            print("[PIPELINE] Running resolution and temporal enrichment on existing data...")
        else:
            print(f"[PIPELINE] Found {len(all_files)} new files to process")

            # Process new files
            for file_path in all_files:
                file_info = self.ingestion.ingest_file(file_path)
                if isinstance(file_info, dict) and "error" in file_info:
                    print(f"[PIPELINE]   -> SKIP (error): {file_path} — {file_info['error']}")
                    continue
                file_hash = file_info.get("file_hash", "")
                self.ingestion.finalize_adversarial_checks(run_id=run.run_id)
                result = self.extraction.extract_from_file(file_info, run_id=run.run_id)
                self._mark_processed(file_path, file_hash)
                new_file_infos.append(file_info)

                file_name = Path(file_path).name
                print(f"[PIPELINE]   -> Processed: {file_name}")

            # Assign dependency groups after batch ingestion
            self.ingestion._assign_dependency_groups()

        # Face processing (Stage 2.5 — RESEARCH_FACE_RECOGNITION doc 08 §7)
        print("[PIPELINE] Face processing (Stage 2.5)...")
        self._run_faces(evidence_files=new_file_infos)

        # Export results
        output = self._export_results()
        entities = output.get("entities", [])
        relations = output.get("relations", [])

        # Entity Resolution
        self.audit_trail.log("resolution", "resolution_started", {
            "input_entities": len(entities),
            "input_relations": len(relations),
        })
        resolution_summary = self.resolution.resolve(
            entities=entities,
            relations=relations,
            output_dir=str(self.output_dir),
            run_id=run.run_id,
        )
        output["resolution"] = resolution_summary
        self.audit_trail.log("resolution", "resolution_completed", {
            "resolved_entities": resolution_summary.get("resolved_entities", 0),
            "auto_merges": resolution_summary.get("auto_merges", 0),
            "contradictions": resolution_summary.get("contradictions", 0),
        })

        # Temporal Enrichment
        self.audit_trail.log("temporal", "temporal_started", {})
        resolved_entities_file = self.output_dir / "resolved_entities.json"
        temporal_input_entities = entities
        if resolved_entities_file.exists():
            try:
                with open(resolved_entities_file, encoding="utf-8") as f:
                    resolved_data = json.load(f)
                    temporal_input_entities = (
                        list(resolved_data.values())
                        if isinstance(resolved_data, dict)
                        else resolved_data
                    )
            except Exception:  # noqa: BLE001 - corrupt state must not abort the run
                temporal_input_entities = entities

        temporal_summary = self.temporal.enrich(
            entities=temporal_input_entities,
            relations=relations,
            output_dir=str(self.output_dir),
            run_id=run.run_id,
        )
        output["temporal"] = temporal_summary
        self.audit_trail.log("temporal", "temporal_completed", {
            "temporal_infos": temporal_summary.get("temporal_infos", 0),
            "spatial_infos": temporal_summary.get("spatial_infos", 0),
            "timeline_events": temporal_summary.get("timeline_events", 0),
        })

        # Graph Build
        resolved_entities_file = self.output_dir / "resolved_entities.json"
        resolved_entities = []
        if resolved_entities_file.exists():
            with open(resolved_entities_file) as f:
                resolved_data = json.load(f)
                resolved_entities = list(resolved_data.values()) if isinstance(resolved_data, dict) else resolved_data

        dependency_groups = [
            g.to_dict() for g in self.ingestion.dependency_groups.values()
        ]

        graph_summary = self.graph.build(
            entities=entities,
            relations=relations,
            resolved_entities=resolved_entities,
            dependency_groups=dependency_groups,
            output_dir=str(self.output_dir),
            run_id=run.run_id,
        )
        output["graph"] = graph_summary
        self.audit_trail.log("graph", "graph_completed", {
            "nodes": graph_summary.get("nodes", 0),
            "edges": graph_summary.get("edges", 0),
            "provenance_chains": graph_summary.get("provenance_chains", 0),
        })

        # Analytics (Stage 6)
        print("[PIPELINE] Analytics (Stage 6)...")
        self.audit_trail.log("analytics", "analytics_started", {})
        analytics_summary = self.analytics.analyze(
            output_dir=str(self.output_dir),
            run_id=run.run_id,
        )
        output["analytics"] = analytics_summary
        self.audit_trail.log("analytics", "analytics_completed", {
            "centrality_scores": analytics_summary.get("centrality_scores", 0),
            "communities": analytics_summary.get("communities", 0),
            "anomaly_signals": analytics_summary.get("anomaly_signals", 0),
            "behavioral_baselines": analytics_summary.get("behavioral_baselines", 0),
            "correlations": analytics_summary.get("correlations", 0),
            "component_analyses": analytics_summary.get("component_analyses", 0),
            "temporal_patterns": analytics_summary.get("temporal_patterns", 0),
        })

        # End the run BEFORE final export
        self._end_run(status="completed")

        # Final export with completed run info
        output = self._export_results()

        # Stage 8: Contradiction Adjudication (must run before Hypotheses so
        # standing/resolved status is known when they are scored)
        self._run_contradiction(output)

        # Stage 7: Hypothesis Engine (falsifiable hypotheses scored against
        # the adjudicated contradictions)
        self._run_hypothesis(output)

        # Stage 9: Gap Detection (missing evidence requirements)
        self._run_gap(output)

        # Stage 10: Critic (read-only consistency review)
        self._run_critic(output)

        # Stage 11: Global Entity Push (cross-case identity index)
        self._run_global_push(output)

        # Persist all results to database
        self._persist_to_database(output)

        summary = output["summary"]
        print(f"\n[PIPELINE] Updated totals: {summary['total_entities']} entities, {summary['total_relations']} relations")
        print(f"[RESOLUTION] {resolution_summary['resolved_entities']} resolved, {resolution_summary['unknown_entities']} unknown, {resolution_summary['contradictions']} contradictions")
        print(f"[TEMPORAL] {temporal_summary['temporal_infos']} temporal, {temporal_summary['spatial_infos']} spatial, {temporal_summary['timeline_events']} timeline events")

        return output

    def run_from_feeder(self, feed_result: FeedResult) -> dict:
        """
        Run pipeline on files organized by FIR via the feeder.

        This is the multi-FIR entry point. Processes all FIRs in one pipeline run,
        tracking FIR provenance on every entity and relation.

        For each FIR:
          1. Ingest + extract files (Stages 1-2)
          2. Tag entities with fir_id
        Then across all FIRs:
          3. Entity resolution (Stage 3)
          4. Temporal enrichment (Stage 4)
          5. Graph build (Stage 5)
          6. Analytics (Stage 6)
        """
        print(f"[PIPELINE] Starting multi-FIR run from feeder")
        print(f"[PIPELINE] Case: {feed_result.case_id}")
        print(f"[PIPELINE] FIRs: {len(feed_result.firs)}")
        for fir in feed_result.firs:
            print(f"[PIPELINE]   {fir.fir_id} ({fir.fir_number}): {len(fir.files)} files")

        # Override case_id/jurisdiction from feeder if not set
        if not self.case_id and feed_result.case_id:
            self.case_id = feed_result.case_id
        if not self.jurisdiction_node_id and feed_result.jurisdiction_node_id:
            self.jurisdiction_node_id = feed_result.jurisdiction_node_id

        # Start run
        run = self._start_run(trigger="multi_fir")
        print(f"[PIPELINE] Run ID: {run.run_id}")

        self.audit_trail.log("pipeline", "multi_fir_started", {
            "case_id": self.case_id,
            "fir_count": len(feed_result.firs),
            "total_files": len(feed_result.all_file_paths),
        })

        # Load existing state
        self._load_existing_state()

        # Step 1-2: Ingest + Extract per FIR (tagging with fir_id)
        print(f"[PIPELINE] Step 1-2/8: Ingesting and extracting per FIR...")
        feed_file_infos: List[dict] = []
        for fir_ctx in feed_result.firs:
            print(f"\n[PIPELINE] --- FIR: {fir_ctx.fir_id} ({fir_ctx.fir_number}) ---")
            self.fir_entities[fir_ctx.fir_id] = []
            self.fir_relations[fir_ctx.fir_id] = []

            for i, fpath in enumerate(fir_ctx.file_paths, 1):
                fname = Path(fpath).name

                if self._is_processed(fpath, self._known_hash(fpath)):
                    print(f"[PIPELINE]   -> [{i}/{len(fir_ctx.file_paths)}] SKIP: {fname}")
                    continue

                print(f"[PIPELINE]   -> [{i}/{len(fir_ctx.file_paths)}] Processing: {fname}")

                # Ingest
                file_info = self.ingestion.ingest_file(fpath)
                if isinstance(file_info, dict) and "error" in file_info:
                    print(f"[PIPELINE]   -> SKIP (error): {fname} — {file_info['error']}")
                    continue

                # Tag with fir_id
                file_info["fir_id"] = fir_ctx.fir_id

                # Cross-file adversarial finalize before extraction reads flags
                self.ingestion.finalize_adversarial_checks(run_id=run.run_id)

                # Extract
                result = self.extraction.extract_from_file(file_info, run_id=run.run_id)
                feed_file_infos.append(file_info)

                # Tag extracted entities/relations with fir_id
                if isinstance(result, dict):
                    for e in result.get("entities", []):
                        if hasattr(e, '__dict__'):
                            e.fir_id = fir_ctx.fir_id
                        elif isinstance(e, dict):
                            e["fir_id"] = fir_ctx.fir_id
                        eid = e.get("id", "") if isinstance(e, dict) else getattr(e, "id", "")
                        self.fir_entities[fir_ctx.fir_id].append(eid)
                    for r in result.get("relations", []):
                        if hasattr(r, '__dict__'):
                            r.fir_id = fir_ctx.fir_id
                        elif isinstance(r, dict):
                            r["fir_id"] = fir_ctx.fir_id
                        rid = r.get("id", "") if isinstance(r, dict) else getattr(r, "id", "")
                        self.fir_relations[fir_ctx.fir_id].append(rid)

                self._mark_processed(fpath, file_info.get("file_hash", ""))

            print(f"[PIPELINE]   FIR {fir_ctx.fir_id}: {len(self.fir_entities.get(fir_ctx.fir_id, []))} entities, {len(self.fir_relations.get(fir_ctx.fir_id, []))} relations")

        # Face processing (Stage 2.5 — RESEARCH_FACE_RECOGNITION doc 08 §7)
        print("[PIPELINE] Face processing (Stage 2.5)...")
        self._run_faces(evidence_files=feed_file_infos)

        # Export results
        print("\n[PIPELINE] Step 3/8: Exporting results...")
        output = self._export_results()

        # Dangling reference fixes
        print("[PIPELINE] Step 3.5/8: Resolving dangling references...")
        dangling_fixed = self.extraction.resolve_dangling_references()
        stubs_created = self.extraction.ensure_entity_completeness()
        if dangling_fixed or stubs_created:
            output = self._export_results()

        # Step 3: Entity Resolution
        print("[PIPELINE] Step 4/8: Entity resolution (Stage 3)...")
        entities = output.get("entities", [])
        relations = output.get("relations", [])
        resolution_summary = self.resolution.resolve(
            entities=entities,
            relations=relations,
            output_dir=str(self.output_dir),
            run_id=run.run_id,
        )
        output["resolution"] = resolution_summary

        # Step 4: Temporal Enrichment
        print("[PIPELINE] Step 5/8: Temporal enrichment (Stage 4)...")
        resolved_entities_file = self.output_dir / "resolved_entities.json"
        temporal_input_entities = entities
        if resolved_entities_file.exists():
            try:
                with open(resolved_entities_file, encoding="utf-8") as f:
                    resolved_data = json.load(f)
                    temporal_input_entities = (
                        list(resolved_data.values())
                        if isinstance(resolved_data, dict)
                        else resolved_data
                    )
            except Exception:  # noqa: BLE001 - corrupt state must not abort the run
                temporal_input_entities = entities

        temporal_summary = self.temporal.enrich(
            entities=temporal_input_entities,
            relations=relations,
            output_dir=str(self.output_dir),
            run_id=run.run_id,
        )
        output["temporal"] = temporal_summary

        # Step 5: Graph Build
        print("[PIPELINE] Step 6/8: Graph build (Stage 5)...")
        resolved_entities_file = self.output_dir / "resolved_entities.json"
        resolved_entities = []
        if resolved_entities_file.exists():
            with open(resolved_entities_file) as f:
                resolved_data = json.load(f)
                resolved_entities = list(resolved_data.values()) if isinstance(resolved_data, dict) else resolved_data

        unknown_entities_file = self.output_dir / "unknown_entities.json"
        unknown_entities = []
        if unknown_entities_file.exists():
            with open(unknown_entities_file) as f:
                unknown_data = json.load(f)
                unknown_entities = list(unknown_data.values()) if isinstance(unknown_data, dict) else unknown_data

        temporal_infos_file = self.output_dir / "temporal_infos.json"
        temporal_infos = []
        if temporal_infos_file.exists():
            with open(temporal_infos_file) as f:
                temporal_infos = json.load(f)

        spatial_infos_file = self.output_dir / "spatial_infos.json"
        spatial_infos = []
        if spatial_infos_file.exists():
            with open(spatial_infos_file) as f:
                spatial_infos = json.load(f)

        coverage_intervals_file = self.output_dir / "coverage_intervals.json"
        coverage_intervals = []
        if coverage_intervals_file.exists():
            with open(coverage_intervals_file) as f:
                coverage_intervals = json.load(f)

        contradictions_file = self.output_dir / "contradictions.json"
        contradictions = {}
        if contradictions_file.exists():
            with open(contradictions_file) as f:
                contradictions = json.load(f)

        raw_evidence = []
        if hasattr(self.ingestion, 'raw_evidence'):
            raw_evidence = [r.to_dict() for r in self.ingestion.raw_evidence.values()]

        dependency_groups = [
            g.to_dict() for g in self.ingestion.dependency_groups.values()
        ]

        graph_summary = self.graph.build(
            entities=entities,
            relations=relations,
            resolved_entities=resolved_entities,
            unknown_entities=unknown_entities,
            dependency_groups=dependency_groups,
            temporal_infos=temporal_infos,
            spatial_infos=spatial_infos,
            coverage_intervals=coverage_intervals,
            contradictions=contradictions,
            raw_evidence=raw_evidence,
            output_dir=str(self.output_dir),
            run_id=run.run_id,
        )
        output["graph"] = graph_summary

        # Step 6: Analytics
        print("[PIPELINE] Step 7/8: Analytics (Stage 6)...")
        analytics_summary = self.analytics.analyze(
            output_dir=str(self.output_dir),
            run_id=run.run_id,
        )
        output["analytics"] = analytics_summary

        # Store FIR provenance in output
        output["fir_provenance"] = {
            fir_id: {
                "entity_count": len(entity_ids),
                "relation_count": len(self.fir_relations.get(fir_id, [])),
            }
            for fir_id, entity_ids in self.fir_entities.items()
        }

        # End run
        self._end_run(status="completed")
        output = self._export_results()

        # Stage 8: Contradiction Adjudication (must run before Hypotheses so
        # standing/resolved status is known when they are scored)
        self._run_contradiction(output)

        # Stage 7: Hypothesis Engine (falsifiable hypotheses scored against
        # the adjudicated contradictions)
        self._run_hypothesis(output)

        # Stage 9: Gap Detection (missing evidence requirements)
        self._run_gap(output)

        # Stage 10: Critic (read-only consistency review)
        self._run_critic(output)

        # Stage 11: Global Entity Push (cross-case identity index)
        self._run_global_push(output)

        # Persist to database
        self._persist_to_database(output)

        # Print summary
        summary = output["summary"]
        print(f"\n{'='*60}")
        print(f"[PIPELINE] MULTI-FIR COMPLETE — Run {run.run_id}")
        print(f"{'='*60}")
        print(f"Case:           {self.case_id}")
        print(f"FIRs processed: {len(feed_result.firs)}")
        print(f"Total entities: {summary['total_entities']}")
        print(f"Total relations: {summary['total_relations']}")
        print(f"\nPer-FIR breakdown:")
        for fir_id, entity_ids in self.fir_entities.items():
            print(f"  {fir_id}: {len(entity_ids)} entities, {len(self.fir_relations.get(fir_id, []))} relations")
        print(f"{'='*60}")

        return output

    def reprocess_file(self, file_path: str) -> dict:
        """Re-extract from a single file (useful after logic updates)."""
        print(f"[PIPELINE] Reprocessing: {file_path}")

        # Remove old entities from this file
        old_count = len(self.extraction.entities)
        self.extraction.entities = [
            e for e in self.extraction.entities
            if e.source and e.source.file_name != Path(file_path).name
        ]
        self.extraction.relations = [
            r for r in self.extraction.relations
            if r.source and r.source.file_name != Path(file_path).name
        ]
        removed = old_count - len(self.extraction.entities)
        print(f"[PIPELINE] Removed {removed} old entities from this file")

        # Re-ingest and extract
        file_info = self.ingestion.ingest_file(file_path)
        if isinstance(file_info, dict) and "error" in file_info:
            print(f"[PIPELINE] Reprocess failed: {file_info['error']}")
            return {}
        self.ingestion.finalize_adversarial_checks()
        result = self.extraction.extract_from_file(file_info)

        # Export
        output = self._export_results()
        if isinstance(result, dict) and "entities" in result:
            print(f"[PIPELINE] Reprocessed: {len(result['entities'])} entities, {len(result['relations'])} relations")
        else:
            print(f"[PIPELINE] Reprocessed: {file_path}")

        return output
    def _run_faces(self, evidence_files: Optional[List[dict]] = None) -> dict:
        """Stage 2.5 — face processing (RESEARCH_FACE_RECOGNITION doc 08 §7).

        Matches this run's face embeddings against each other and against faces
        from previous runs (incremental), links faces to person entities via
        doc 11 context, then writes ``face_embeddings.json`` (faces, matches,
        candidates, stats) for Stage 3 resolution, Stage 5 graph edges and the
        /api/faces projection.
        """
        from .faces.engine import camera_from_text, timestamp_from_text
        from .faces.stage import FaceProcessingStage

        evidence_files = evidence_files or []

        # Overlay context per file (doc 11 §6.4 — camera id + capture time).
        file_contexts: dict = {}
        for info in evidence_files:
            content = info.get("content") if isinstance(info.get("content"), dict) else {}
            ocr = str(content.get("ocr_text") or content.get("content") or "")
            file_contexts[info.get("file_name", "")] = {
                "ocr_text": ocr,
                "camera": camera_from_text(ocr),
                "overlay_timestamp": timestamp_from_text(ocr),
                "captured_at": timestamp_from_text(ocr) or str(info.get("modified_time", "")),
            }

        # Text corpus for REFERENCED_BY context (doc 11 §1 C1).
        file_texts: dict = {}
        for info in self.ingestion.ingestion_log:
            content = info.get("content") if isinstance(info.get("content"), dict) else {}
            text = str(content.get("ocr_text") or content.get("content") or "")
            if text:
                file_texts[info.get("file_name", "")] = text[:5000]
        all_files = sorted({*file_texts.keys(), *file_contexts.keys()})

        # Faces from previous runs stay matched incrementally.
        previous_faces: List[dict] = []
        previous_path = self.output_dir / "face_embeddings.json"
        if previous_path.is_file():
            try:
                with previous_path.open(encoding="utf-8") as fh:
                    previous_data = json.load(fh)
                if isinstance(previous_data, dict):
                    previous_faces = [f for f in previous_data.get("faces", []) if isinstance(f, dict)]
            except (OSError, ValueError):
                previous_faces = []

        persons = [
            {
                "id": e.id,
                "name": e.name,
                "source_id": getattr(e, "source_id", ""),
                "minted_from": (getattr(e, "attributes", None) or {}).get("minted_from", ""),
            }
            for e in self.extraction.entities
            if getattr(e.entity_type, "value", "") == "PERSON"
        ]

        stage = FaceProcessingStage()
        result = stage.process(
            self.extraction.face_embeddings,
            persons,
            previous_faces=previous_faces,
            file_contexts=file_contexts,
            all_files=all_files,
            file_texts=file_texts,
        )

        payload = {
            "faces": result["faces"],
            "matches": result["matches"],
            "candidates": result["candidates"],
            "stats": result["stats"],
        }
        with open(self.output_dir / "face_embeddings.json", "w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=2, default=str)

        self._face_summary = result["stats"]
        self.audit_trail.log("faces", "face_processing_completed", dict(result["stats"]))
        print(f"[FACES]   -> {result['stats'].get('faces', 0)} faces, "
              f"{result['stats'].get('matches', 0)} matches, "
              f"{result['stats'].get('candidates', 0)} candidates")
        return result["stats"]

    def _export_results(self) -> dict:
        """Export all extracted data to output files with full metadata."""

        # Main extraction output
        db_ready = self.extraction.export_for_db()
        # Stage 2.5 face stats ride along so extraction_output.json consumers
        # see the same run totals as face_embeddings.json.
        db_ready["faces"] = self._face_summary
        output_file = self.output_dir / "extraction_output.json"
        with open(output_file, "w") as f:
            json.dump(db_ready, f, indent=2)

        # Summary with run info
        summary_file = self.output_dir / "extraction_summary.json"
        summary = {
            "run_id": self.current_run.run_id if self.current_run else None,
            "pipeline_run": self.current_run.to_dict() if self.current_run else None,
            "extraction_summary": db_ready["summary"],
            "ingestion_summary": self.ingestion.get_ingestion_summary(),
            "extraction_log": db_ready["extraction_log"],
            "export_time": db_ready["export_time"],
            "dependency_groups": [
                g.to_dict() for g in self.ingestion.dependency_groups.values()
            ],
            "evidence_integrity": [
                r.to_dict() for r in self.ingestion.integrity_records.values()
            ],
        }
        with open(summary_file, "w") as f:
            json.dump(summary, f, indent=2)

        # Entity index (for quick lookup)
        entity_index = {}
        for e in self.extraction.entities:
            entity_index[e.id] = {
                "name": e.name,
                "type": e.entity_type.value,
                "aliases": e.aliases,
                "source_id": e.source_id if hasattr(e, "source_id") else "",
                "epistemic_category": e.epistemic_category if hasattr(e, "epistemic_category") else "observation",
                "run_id": self.current_run.run_id if self.current_run else "",
            }
        index_file = self.output_dir / "entity_index.json"
        with open(index_file, "w") as f:
            json.dump(entity_index, f, indent=2)

        # Relation list (for graph building)
        relations_list = [r.to_dict() for r in self.extraction.relations]
        relations_file = self.output_dir / "relations.json"
        with open(relations_file, "w") as f:
            json.dump(relations_list, f, indent=2)

        # Save processed files tracker
        self._save_processed_files()

        # Save audit trail (deduplicate by full entry content to preserve cross-run entries)
        seen = set()
        unique_entries = []
        for entry in self.audit_trail.entries:
            # Create a hashable key from all fields except timestamp
            key = (
                entry.get("run_id", ""),
                entry.get("stage"),
                entry.get("action"),
                json.dumps(entry.get("details", {}), sort_keys=True, default=str),
            )
            if key not in seen:
                seen.add(key)
                unique_entries.append(entry)
        self.audit_trail.entries = unique_entries
        self.audit_trail.save(str(self.output_dir))

        # Generate file contexts for reasoner
        context_gen = FileContextGenerator()
        contexts = context_gen.generate_all(self.ingestion.ingestion_log, db_ready)
        context_output = context_gen.export_for_reasoner()
        context_file = self.output_dir / "file_contexts.json"
        with open(context_file, "w") as f:
            json.dump(context_output, f, indent=2)
        print(f"[PIPELINE]   -> Generated {len(contexts)} file contexts for reasoner")

        return db_ready

    def _load_existing_state(self):
        """Load existing extraction state from output files."""
        output_file = self.output_dir / "extraction_output.json"
        if not output_file.exists():
            return

        print("[PIPELINE] Loading existing extraction state...")
        with open(output_file) as f:
            data = json.load(f)

        from .models.schema import (
            EntityType, RelationType, ProvenanceClass, VerificationStatus,
            ExtractedEntity, ExtractedRelation, SourceMetadata, ConfidenceSchema,
        )

        # Rebuild entity index
        for e_dict in data.get("entities", []):
            source_dict = e_dict.get("source")
            source = None
            if source_dict:
                source = SourceMetadata(
                    source_type=source_dict["source_type"],
                    file_name=source_dict["file_name"],
                    file_hash=source_dict["file_hash"],
                    ingestion_time=source_dict["ingestion_time"],
                    provenance=ProvenanceClass(source_dict.get("provenance", "OBSERVATIONAL")),
                    verification=VerificationStatus(source_dict.get("verification", "UNVERIFIED")),
                    reliability_occurrence=source_dict.get("reliability_occurrence", 0.0),
                    reliability_identity=source_dict.get("reliability_identity", 0.0),
                    reliability_intent=source_dict.get("reliability_intent", 0.0),
                    reliability_location=source_dict.get("reliability_location", 0.0),
                    reliability_timing=source_dict.get("reliability_timing", 0.0),
                    adversarial_suspicious=source_dict.get("adversarial_suspicious", False),
                )

            conf_dict = e_dict.get("confidence")
            confidence = None
            if conf_dict:
                confidence = ConfidenceSchema(
                    score=conf_dict["score"],
                    basis=conf_dict.get("basis", []),
                    supporting_count=conf_dict.get("supporting_count", 0),
                    contradicting_count=conf_dict.get("contradicting_count", 0),
                    unknown_count=conf_dict.get("unknown_count", 0),
                    source_reliability=conf_dict.get("source_reliability", 0),
                    derivation_depth=conf_dict.get("derivation_depth", 0),
                    is_independent=conf_dict.get("is_independent", True),
                )

            entity = ExtractedEntity(
                id=e_dict["id"],
                entity_type=EntityType(e_dict["entity_type"]),
                name=e_dict["name"],
                aliases=e_dict.get("aliases", []),
                attributes=e_dict.get("attributes", {}),
                confidence=confidence,
                source=source,
                raw_text=e_dict.get("raw_text"),
                extraction_method=e_dict.get("extraction_method", "code"),
                source_id=e_dict.get("source_id", ""),
                epistemic_category=e_dict.get("epistemic_category", "observation"),
                derivation_depth=e_dict.get("derivation_depth", 0),
                run_id=e_dict.get("run_id", ""),
            )
            self.extraction.entities.append(entity)
            self.extraction.entity_index[entity.id] = entity

        # Rebuild relation index
        for r_dict in data.get("relations", []):
            source_dict = r_dict.get("source")
            source = None
            if source_dict:
                source = SourceMetadata(
                    source_type=source_dict["source_type"],
                    file_name=source_dict["file_name"],
                    file_hash=source_dict["file_hash"],
                    ingestion_time=source_dict["ingestion_time"],
                    provenance=ProvenanceClass(source_dict.get("provenance", "OBSERVATIONAL")),
                    verification=VerificationStatus(source_dict.get("verification", "UNVERIFIED")),
                    reliability_occurrence=source_dict.get("reliability_occurrence", 0.0),
                    reliability_identity=source_dict.get("reliability_identity", 0.0),
                    reliability_intent=source_dict.get("reliability_intent", 0.0),
                    reliability_location=source_dict.get("reliability_location", 0.0),
                    reliability_timing=source_dict.get("reliability_timing", 0.0),
                    adversarial_suspicious=source_dict.get("adversarial_suspicious", False),
                )

            conf_dict = r_dict.get("confidence")
            confidence = None
            if conf_dict:
                confidence = ConfidenceSchema(
                    score=conf_dict["score"],
                    basis=conf_dict.get("basis", []),
                    supporting_count=conf_dict.get("supporting_count", 0),
                    contradicting_count=conf_dict.get("contradicting_count", 0),
                    unknown_count=conf_dict.get("unknown_count", 0),
                    source_reliability=conf_dict.get("source_reliability", 0),
                    derivation_depth=conf_dict.get("derivation_depth", 0),
                    is_independent=conf_dict.get("is_independent", True),
                )

            relation = ExtractedRelation(
                id=r_dict["id"],
                source_entity_id=r_dict["source_entity_id"],
                target_entity_id=r_dict["target_entity_id"],
                relation_type=RelationType(r_dict["relation_type"]),
                confidence=confidence,
                source=source,
                attributes=r_dict.get("attributes", {}),
                raw_text=r_dict.get("raw_text"),
                extraction_method=r_dict.get("extraction_method", "code"),
            )
            self.extraction.relations.append(relation)
            self.extraction.relation_index[relation.id] = relation

        entity_count = len(self.extraction.entities)
        relation_count = len(self.extraction.relations)
        print(f"[PIPELINE]   -> Loaded {entity_count} entities, {relation_count} relations from previous run")

    def _load_processed_files(self) -> dict[str, str]:
        """Load previously processed files as ``{file_path: file_hash}``.

        Older state was a bare list of paths; those entries carry no hash and
        are kept as ``{path: ""}`` so they still count as processed (see
        :meth:`_is_processed`) instead of forcing a full re-extraction.
        """
        if self.processed_files_path.exists():
            try:
                with open(self.processed_files_path) as f:
                    data = json.load(f)
            except (json.JSONDecodeError, ValueError):
                print(f"[PIPELINE] WARNING: Corrupted processed_files.json, starting fresh")
                return {}
            if isinstance(data, dict):
                return {str(path): str(fhash) for path, fhash in data.items()}
            if isinstance(data, list):
                return {str(path): "" for path in data}
            print("[PIPELINE] WARNING: Unexpected processed_files.json shape, starting fresh")
            return {}
        return {}

    def _save_processed_files(self):
        """Save processed files as a ``{file_path: file_hash}`` dict."""
        with open(self.processed_files_path, "w") as f:
            json.dump(self.processed_files, f, indent=2)

    def _mark_processed(self, file_path: str, file_hash: str = ""):
        """Mark a file as processed, remembering its content hash."""
        self.processed_files[file_path] = file_hash

    def _is_processed(self, file_path: str, file_hash: str = "") -> bool:
        """Check if a file has been processed — unchanged, if we know its hash.

        An unknown path is never processed. When both the stored and the
        supplied hash are present they must match, so content rewritten at
        the same path falls through and is extracted again; a stored ``""``
        (legacy list entry, or a mark taken without a hash) cannot be
        compared and keeps the old skip behaviour.
        """
        if file_path not in self.processed_files:
            return False
        stored_hash = self.processed_files.get(file_path, "")
        if file_hash and stored_hash:
            return stored_hash == file_hash
        return True

    @staticmethod
    def _hash_file(file_path: str) -> str:
        """SHA-256 of a file, or ``""`` when it cannot be read."""
        try:
            return compute_file_hash(file_path)
        except OSError:
            return ""

    def _known_hash(self, file_path: str) -> str:
        """Content hash to compare a skip decision against.

        Only tracked paths are read: an unknown path is unprocessed by
        definition, and a legacy ``""`` entry has nothing to compare
        against, so neither is worth the IO.
        """
        if not self.processed_files.get(file_path, ""):
            return ""
        return self._hash_file(file_path)


def run_pipeline(
    input_dir: str,
    output_dir: str = "output",
    use_llm: bool = False,
    incremental: bool = False,
    ai_config: str = None,
    case_id: str | None = None,
    jurisdiction_node_id: str | None = None,
    llm_model: str | None = None,
    llm_provider: str | None = None,
    persist_database: bool = True,
) -> dict:
    """Convenience function to run the pipeline on a directory."""
    pipeline = Pipeline(
        output_dir=output_dir,
        use_llm=use_llm,
        ai_config=ai_config,
        case_id=case_id,
        jurisdiction_node_id=jurisdiction_node_id,
        llm_model=llm_model,
        llm_provider=llm_provider,
        persist_database=persist_database,
    )

    if incremental:
        return pipeline.run_incremental(input_dir)
    else:
        return pipeline.run_batch(input_dir)


def run_multi_fir(
    manifest_path: str,
    output_dir: str = "output",
    use_llm: bool = False,
    ai_config: str = None,
    fir_ids: list | None = None,
    data_dir: str | None = None,
    llm_model: str | None = None,
    llm_provider: str | None = None,
    global_index_dir: str | None = None,
    persist_database: bool = True,
) -> dict:
    """
    Run the pipeline on multiple FIRs defined in a manifest.

    Args:
        manifest_path: Path to FIR_MANIFEST.json
        output_dir: Output directory
        use_llm: Enable LLM extraction
        ai_config: AI providers config path
        fir_ids: If set, only process these FIRs (subset selection)
        data_dir: Base directory for evidence files (default: manifest's parent)
    """
    from .feeder import FIRFeeder

    feeder = FIRFeeder(
        manifest_path=manifest_path,
        data_dir=data_dir,
        fir_ids=fir_ids,
    )
    feed_result = feeder.load()

    pipeline = Pipeline(
        output_dir=output_dir,
        use_llm=use_llm,
        ai_config=ai_config,
        case_id=feed_result.case_id,
        jurisdiction_node_id=feed_result.jurisdiction_node_id,
        fir_feeder=feed_result,
        llm_model=llm_model,
        llm_provider=llm_provider,
        global_index_dir=global_index_dir,
        persist_database=persist_database,
    )

    return pipeline.run_from_feeder(feed_result)


def run_multi_case(
    manifest_path: str,
    output_dir: str = "output",
    use_llm: bool = False,
    ai_config: str | None = None,
    llm_model: str | None = None,
    llm_provider: str | None = None,
    persist_database: bool = True,
) -> dict:
    """Run isolated case pipelines and a file-backed shared identity index.

    Manifest shape: ``{"cases": [{"case_id": ..., "manifest": ...}]}``.
    Each case uses its own FIR manifest and output directory. Only Stage 11's
    identity index is shared; evidence and case analytics are never pooled.
    """
    from .scoped_analytics.engine import generate as generate_scoped_analytics

    manifest = Path(manifest_path).resolve()
    with manifest.open(encoding="utf-8") as f:
        config = json.load(f)
    cases = config.get("cases", [])
    if not cases:
        raise ValueError("Multi-case manifest must contain a non-empty 'cases' list")
    ids = [case.get("case_id") for case in cases]
    if any(not case_id for case_id in ids) or len(ids) != len(set(ids)):
        raise ValueError("Every multi-case entry needs a unique case_id")
    if any(Path(str(case_id)).name != str(case_id) or str(case_id) in {".", ".."}
           for case_id in ids):
        raise ValueError("Case IDs must be single safe path segments")

    root = Path(output_dir)
    root.mkdir(parents=True, exist_ok=True)
    index_dir = root / "global_index"
    results = {}
    for case in cases:
        case_id = case["case_id"]
        child_manifest = Path(case["manifest"])
        if not child_manifest.is_absolute():
            child_manifest = manifest.parent / child_manifest
        if not child_manifest.exists():
            raise FileNotFoundError(f"Case manifest not found for {case_id}: {child_manifest}")
        with child_manifest.open(encoding="utf-8") as f:
            child_config = json.load(f)
        if child_config.get("case_id") != case_id:
            raise ValueError(
                f"Case ID mismatch: top-level entry {case_id!r}, "
                f"child manifest has {child_config.get('case_id')!r}"
            )
        case_output = root / "cases" / case_id
        data_dir = case.get("data_dir")
        if data_dir:
            data_dir = Path(data_dir)
            if not data_dir.is_absolute():
                data_dir = manifest.parent / data_dir
        result = run_multi_fir(
            manifest_path=str(child_manifest),
            output_dir=str(case_output),
            use_llm=use_llm,
            ai_config=ai_config,
            fir_ids=case.get("fir_ids"),
            data_dir=str(data_dir) if data_dir else None,
            llm_model=llm_model,
            llm_provider=llm_provider,
            global_index_dir=str(index_dir),
            persist_database=persist_database,
        )
        results[case_id] = {
            "output_dir": str(case_output),
            "summary": result.get("summary", {}),
            "global_push": result.get("global_push", {}),
            "critic": result.get("critic", {}),
        }

    scoped = generate_scoped_analytics(str(root), results)
    summary = {"mode": "multi_case", "cases_processed": len(results),
               "case_ids": ids, "cases": results, "scoped_analytics": scoped}
    with (root / "multi_case_summary.json").open("w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)
    return summary
