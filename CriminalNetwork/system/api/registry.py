"""Case / FIR registry: registration, evidence append, manifest generation.

Layout (one directory per case, because the feeder resolves evidence files
against ``manifest_path.parent`` — see ``src/feeder/fir_feeder.py``)::

    <state>/cases/CASE_000001/
        FIR_MANIFEST.json     <- regenerated after every registration/append
        <evidence files>      <- uploaded bytes, stored under safe names
        output/               <- one run output dir per pipeline execution

Registration allocates ``CASE_000001`` / ``FIR_000001`` sequentially and
stores the human-entered FIR number in ``fir_number``. Appending evidence to an
existing FIR is deliberately unblocked — the investigator proceeds at their own
risk, and the re-run is what surfaces any problem.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import tempfile
import threading
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

REGISTRY_FILE = "registry.json"
MANIFEST_NAME = "FIR_MANIFEST.json"
OUTPUT_DIR_NAME = "output"

_SAFE_NAME_RE = re.compile(r"[^A-Za-z0-9._-]+")
_RESERVED_NAMES = frozenset({MANIFEST_NAME, REGISTRY_FILE})

# Narrative and pipeline self-describing files are not case evidence. The
# pipeline already refuses them (``Pipeline.SKIP_FILENAMES``), so accepting them
# here would only ever produce a permanently "pending" row in the custody chain.
NON_EVIDENCE_NAMES = frozenset(
    {
        "00_CRIME_STORY.md",
        "ai_providers.json",
        "pipeline.json",
        "extraction_output.json",
        "file_contexts.json",
        "entity_index.json",
        "relations.json",
        "_processed_files.json",
        "run_history.json",
        "extraction_summary.json",
    }
)


def is_case_evidence(original: str) -> bool:
    """True when an upload should be recorded as evidence for a case."""
    if not isinstance(original, str):
        return False
    base = Path(original.replace("\\", "/")).name.strip()
    if base in NON_EVIDENCE_NAMES:
        return False
    return not base.startswith(".")


class RegistryError(ValueError):
    """Raised when a registration request cannot be satisfied."""


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace(
        "+00:00", "Z"
    )


def safe_filename(original: str) -> str:
    """Reduce an uploaded filename to a single safe path segment.

    Strips directories and anything outside ``[A-Za-z0-9._-]``. Leading dots
    are removed so a hostile ``.env`` or ``..`` cannot survive, and the result
    is length-bounded. The original name is kept separately in the registry for
    display.
    """
    if not isinstance(original, str):
        raise RegistryError("File name must be text")

    # Take the final component of any client-supplied path.
    base = Path(original.replace("\\", "/")).name.strip()
    base = base.lstrip(".")
    cleaned = _SAFE_NAME_RE.sub("_", base).strip("._")

    if not cleaned:
        raise RegistryError("File name is empty after sanitisation")
    if len(cleaned) > 140:
        stem, dot, ext = cleaned.rpartition(".")
        if dot and len(ext) <= 12:
            cleaned = f"{stem[:140 - len(ext) - 1]}.{ext}"
        else:
            cleaned = cleaned[:140]
    if cleaned in _RESERVED_NAMES:
        cleaned = f"evidence_{cleaned}"
    return cleaned


def _atomic_write(path: Path, payload: dict[str, Any]) -> None:
    """Write JSON atomically so a crash cannot leave a half-written store."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(
        dir=str(path.parent), prefix=".registry-", suffix=".tmp"
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2, ensure_ascii=False)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


@dataclass
class EvidenceFile:
    stored_name: str
    original_name: str
    size_bytes: int
    content_type: str
    sha256: str
    fir_id: str
    uploaded_at: str
    uploaded_by: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class FirRecord:
    fir_id: str
    case_id: str
    fir_number: str
    description: str
    jurisdiction_node_id: str
    filed_by_id: str
    investigation_status: str = "UNDER_INVESTIGATION"
    created_at: str = field(default_factory=_now)
    updated_at: str = field(default_factory=_now)
    files: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class CaseRecord:
    case_id: str
    title: str
    description: str
    jurisdiction_node_id: str
    opened_by: str
    opened_at: str
    updated_at: str
    status: str = "open"
    firs: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class CaseRegistry:
    """Thread-safe registry backed by a single JSON document per state dir."""

    def __init__(self, state_dir: Path | str) -> None:
        self.state_dir = Path(state_dir)
        self.cases_dir = self.state_dir / "cases"
        self.cases_dir.mkdir(parents=True, exist_ok=True)
        self._path = self.state_dir / REGISTRY_FILE
        self._lock = threading.Lock()
        self._data = self._load()

    # -- store ------------------------------------------------------------
    def _load(self) -> dict[str, Any]:
        if not self._path.exists():
            return {
                "version": 1,
                "case_seq": 0,
                "fir_seq": 0,
                "cases": {},
                "firs": {},
                "evidence": [],
            }
        with self._path.open(encoding="utf-8") as handle:
            data = json.load(handle)
        for key, default in (
            ("case_seq", 0),
            ("fir_seq", 0),
            ("cases", {}),
            ("firs", {}),
            ("evidence", []),
        ):
            data.setdefault(key, default)
        return data

    def _save(self) -> None:
        _atomic_write(self._path, self._data)

    def _next_id(self, key: str, prefix: str) -> str:
        self._data[key] = int(self._data.get(key, 0)) + 1
        return f"{prefix}{self._data[key]:06d}"

    # -- paths ------------------------------------------------------------
    def case_dir(self, case_id: str) -> Path:
        if not re.fullmatch(r"CASE_\d{6}", case_id):
            raise RegistryError(f"Malformed case id: {case_id!r}")
        return self.cases_dir / case_id

    def manifest_path(self, case_id: str) -> Path:
        return self.case_dir(case_id) / MANIFEST_NAME

    def output_dir(self, case_id: str) -> Path:
        return self.case_dir(case_id) / OUTPUT_DIR_NAME

    def evidence_path(self, case_id: str, stored_name: str) -> Path:
        candidate = (self.case_dir(case_id) / stored_name).resolve()
        base = self.case_dir(case_id).resolve()
        # Belt and braces: the name is already sanitised, but never resolve a
        # path that escapes the case directory.
        if candidate != base and base not in candidate.parents:
            raise RegistryError("Refusing to resolve evidence outside the case")
        return candidate

    # -- queries ----------------------------------------------------------
    def list_cases(self) -> list[CaseRecord]:
        with self._lock:
            return [
                CaseRecord(**self._data["cases"][key])
                for key in sorted(self._data["cases"])
            ]

    def get_case(self, case_id: str) -> CaseRecord:
        with self._lock:
            raw = self._data["cases"].get(case_id)
        if raw is None:
            raise RegistryError(f"Unknown case: {case_id}")
        return CaseRecord(**raw)

    def list_firs(self, case_id: str) -> list[FirRecord]:
        with self._lock:
            return [
                FirRecord(**self._data["firs"][key])
                for key in sorted(self._data["firs"])
                if self._data["firs"][key]["case_id"] == case_id
            ]

    def get_fir(self, fir_id: str) -> FirRecord:
        with self._lock:
            raw = self._data["firs"].get(fir_id)
        if raw is None:
            raise RegistryError(f"Unknown FIR: {fir_id}")
        return FirRecord(**raw)

    def list_evidence(self, case_id: str | None = None) -> list[EvidenceFile]:
        with self._lock:
            records = [EvidenceFile(**row) for row in self._data["evidence"]]
        if case_id is not None:
            records = [
                row
                for row in records
                if self.get_fir(row.fir_id).case_id == case_id
            ]
        return records

    # -- mutations --------------------------------------------------------
    def create_case(
        self,
        *,
        fir_number: str,
        title: str,
        description: str,
        jurisdiction_node_id: str,
        filed_by_id: str,
        investigation_status: str = "UNDER_INVESTIGATION",
    ) -> tuple[CaseRecord, FirRecord]:
        """Register a case and its first FIR. Sequential ids, FIR number kept."""
        fir_number = (fir_number or "").strip()
        if not fir_number:
            raise RegistryError("fir_number is required")
        title = (title or "").strip()
        if not title:
            raise RegistryError("title is required")

        with self._lock:
            case_id = self._next_id("case_seq", "CASE_")
            fir_id = self._next_id("fir_seq", "FIR_")
            now = _now()
            case = CaseRecord(
                case_id=case_id,
                title=title,
                description=(description or "").strip(),
                jurisdiction_node_id=jurisdiction_node_id,
                opened_by=filed_by_id,
                opened_at=now,
                updated_at=now,
                firs=[fir_id],
            )
            fir = FirRecord(
                fir_id=fir_id,
                case_id=case_id,
                fir_number=fir_number,
                description=(description or "").strip(),
                jurisdiction_node_id=jurisdiction_node_id,
                filed_by_id=filed_by_id,
                investigation_status=investigation_status,
                created_at=now,
                updated_at=now,
            )
            self._data["cases"][case_id] = case.to_dict()
            self._data["firs"][fir_id] = fir.to_dict()
            self._save()

        self.case_dir(case_id).mkdir(parents=True, exist_ok=True)
        self.write_manifest(case_id)
        return case, fir

    def add_fir(
        self,
        case_id: str,
        *,
        fir_number: str,
        description: str,
        jurisdiction_node_id: str,
        filed_by_id: str,
        investigation_status: str = "UNDER_INVESTIGATION",
    ) -> FirRecord:
        """Open an additional FIR under an already registered case."""
        fir_number = (fir_number or "").strip()
        if not fir_number:
            raise RegistryError("fir_number is required")

        with self._lock:
            raw = self._data["cases"].get(case_id)
            if raw is None:
                raise RegistryError(f"Unknown case: {case_id}")
            fir_id = self._next_id("fir_seq", "FIR_")
            now = _now()
            fir = FirRecord(
                fir_id=fir_id,
                case_id=case_id,
                fir_number=fir_number,
                description=(description or "").strip(),
                jurisdiction_node_id=jurisdiction_node_id,
                filed_by_id=filed_by_id,
                investigation_status=investigation_status,
                created_at=now,
                updated_at=now,
            )
            self._data["firs"][fir_id] = fir.to_dict()
            raw["firs"].append(fir_id)
            raw["updated_at"] = now
            self._save()
        self.write_manifest(case_id)
        return fir

    def attach_files(
        self,
        fir_id: str,
        files: Iterable[tuple[str, bytes, str]],
        *,
        uploaded_by: str,
    ) -> list[EvidenceFile]:
        """Append evidence to a FIR. No content validation — at their own risk.

        ``files`` yields ``(original_name, content, content_type)``. Duplicate
        names within the same FIR get a numeric suffix rather than overwriting,
        so re-uploading a file can never destroy earlier evidence.
        """
        rows: list[EvidenceFile] = []
        # Drop narrative/pipeline files first: they are not case evidence, and
        # the pipeline would skip them anyway, so they would never leave the
        # "pending" state in the custody chain.
        uploaded = list(files)
        candidates = [item for item in uploaded if is_case_evidence(item[0])]
        if uploaded and not candidates:
            raise RegistryError("No case evidence in upload")
        with self._lock:
            fir_raw = self._data["firs"].get(fir_id)
            if fir_raw is None:
                raise RegistryError(f"Unknown FIR: {fir_id}")
            case_id = fir_raw["case_id"]
            case_dir = self.case_dir(case_id)
            case_dir.mkdir(parents=True, exist_ok=True)
            existing = set(fir_raw["files"])
            stamp = _now()

            for original_name, content, content_type in candidates:
                if not content:
                    raise RegistryError(f"{original_name}: file is empty")
                stored = self._unique_stored_name(original_name, existing)
                target = case_dir / stored
                self._write_bytes(target, content)

                rows.append(
                    EvidenceFile(
                        stored_name=stored,
                        original_name=safe_filename(original_name),
                        size_bytes=len(content),
                        content_type=content_type or "application/octet-stream",
                        sha256="sha256:" + hashlib.sha256(content).hexdigest(),
                        fir_id=fir_id,
                        uploaded_at=stamp,
                        uploaded_by=uploaded_by,
                    )
                )
                fir_raw["files"].append(stored)
                existing.add(stored)

            fir_raw["updated_at"] = stamp
            case_raw = self._data["cases"][case_id]
            case_raw["updated_at"] = stamp
            for row in rows:
                self._data["evidence"].append(row.to_dict())
            self._save()

        self.write_manifest(case_id)
        return rows

    @staticmethod
    def _unique_stored_name(original: str, existing: set[str]) -> str:
        base = safe_filename(original)
        if base not in existing:
            return base
        stem, dot, ext = base.rpartition(".")
        if not dot:
            stem, ext = base, ""
        counter = 2
        while True:
            suffix = f".{ext}" if ext else ""
            candidate = f"{stem}_{counter}{suffix}"
            if candidate not in existing:
                return candidate
            counter += 1

    @staticmethod
    def _write_bytes(path: Path, content: bytes) -> None:
        fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=".upload-")
        try:
            with os.fdopen(fd, "wb") as handle:
                handle.write(content)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(tmp, path)
        except BaseException:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise

    # -- manifest ---------------------------------------------------------
    def build_manifest(self, case_id: str) -> dict[str, Any]:
        """Assemble the FIR_MANIFEST.json the pipeline consumes."""
        case = self.get_case(case_id)
        firs = self.list_firs(case_id)
        if not firs:
            raise RegistryError(f"Case {case_id} has no FIRs")

        skip = sorted(
            {MANIFEST_NAME, REGISTRY_FILE} | {
                row.name
                for row in self.case_dir(case_id).iterdir()
                if row.is_file() and row.suffix.lower() in {".md", ".log", ".tmp"}
            }
        )
        return {
            "version": "1.0",
            "case_id": case.case_id,
            "jurisdiction_node_id": case.jurisdiction_node_id,
            "description": case.description or case.title,
            "created_at": case.opened_at,
            "firs": [
                {
                    "fir_id": fir.fir_id,
                    "fir_number": fir.fir_number,
                    "jurisdiction_node_id": fir.jurisdiction_node_id,
                    "description": fir.description or case.title,
                    "filed_by_id": fir.filed_by_id,
                    "investigation_status": fir.investigation_status,
                    "files": list(fir.files),
                }
                for fir in firs
            ],
            "skip_files": skip,
        }

    def write_manifest(self, case_id: str) -> Path:
        path = self.manifest_path(case_id)
        _atomic_write(path, self.build_manifest(case_id))
        return path

    # -- stats ------------------------------------------------------------
    def counts(self, case_id: str) -> dict[str, int]:
        firs = self.list_firs(case_id)
        evidence = self.list_evidence(case_id)
        return {
            "firs": len(firs),
            "files": sum(len(fir.files) for fir in firs),
            "evidence_records": len(evidence),
            "bytes": sum(row.size_bytes for row in evidence),
        }
