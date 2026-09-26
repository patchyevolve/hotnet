"""Async pipeline jobs: queue, progress reporting, subprocess execution.

Uploads must not block HTTP requests — a full run takes minutes. The client
receives a job id immediately and polls ``GET /api/jobs/{id}``, which reports
completed stages as the run prints them.

Runs are serialised by default (``CRIMENET_MAX_CONCURRENT_RUNS``, default 1).
Each case already gets its own output directory, so parallel runs would not
overwrite each other's JSON, but every run still writes to the same PostgreSQL
instance and Stage 11's global push shares one identity index — two runs at
once would interleave those writes. One at a time is the correct default; raise
it only when the database and index can take it.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

_JOB_STATES = ("queued", "running", "completed", "failed")

_STEP_RE = re.compile(r"\[PIPELINE\] Step (\d+)/(\d+):\s*(.+?)(?:\.\.\.)?\s*$")
# Matches "(Stage N)" wherever it appears — including inside the "Step N/8"
# lines, whose own step number does NOT equal the stage number (Step 3/8 is
# "Exporting results", which belongs to no stage).
_STAGE_RE = re.compile(r"\(Stage (\d+)\)")
_PERSIST_RE = re.compile(r"\[PIPELINE\] Persisting results to database")
_SAVED_RE = re.compile(r"Output saved to:")
_RUN_ID_RE = re.compile(r"\[PIPELINE\] Run ID:\s*(\S+)")

# Ordered for progress display. Unknown lines are ignored; a stage only moves
# forward, never backwards, so reordered log chatter cannot regress the bar.
_STAGE_LABELS: dict[int, str] = {
    1: "Ingesting files",
    2: "Extracting entities and relations",
    3: "Entity resolution",
    4: "Temporal enrichment",
    5: "Graph build",
    6: "Analytics",
    7: "Hypothesis engine",
    8: "Contradiction adjudication",
    9: "Gap detection",
    10: "Critic review",
    11: "Global entity push",
    # Stage 12 (scoped analytics) only runs in multi-case mode; uploads always
    # run single-case, where the final movement is the database persist.
    12: "Persisting results",
}


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace(
        "+00:00", "Z"
    )


@dataclass
class Job:
    job_id: str
    case_id: str
    kind: str  # "full" | "incremental"
    status: str = "queued"
    requested_by: str = ""
    jurisdiction_id: str = ""
    created_at: str = field(default_factory=_now)
    started_at: str | None = None
    finished_at: str | None = None
    error: str | None = None
    returncode: int | None = None
    run_id: str | None = None
    log_file: str = ""
    #: Highest completed stage number (1-12); 0 while still queued.
    stage: int = 0
    total_stages: int = 12
    detail: str = "Queued"
    #: File counts at submission, so the UI can show what is being processed.
    file_count: int = 0
    #: Command to run. Set at submit time and never persisted — it contains
    #: absolute paths that would go stale across restarts.
    argv: list[str] = field(default_factory=list, repr=False)

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload.pop("argv", None)
        payload["progress"] = self.progress
        return payload

    @property
    def progress(self) -> float:
        if self.status == "completed":
            return 1.0
        if self.status == "failed":
            # Preserve partial progress rather than snapping to 0 or 1.
            return round(self.stage / self.total_stages, 4)
        if self.status == "queued":
            return 0.0
        return round(self.stage / self.total_stages, 4)

    @property
    def stages_done(self) -> list[str]:
        return [
            _STAGE_LABELS[number]
            for number in range(1, self.stage + 1)
            if number in _STAGE_LABELS
        ]


class JobStore:
    """Disk-backed job records so a restart does not lose history."""

    def __init__(self, state_dir: Path | str) -> None:
        self.state_dir = Path(state_dir)
        self.jobs_dir = self.state_dir / "jobs"
        self.jobs_dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._cache: dict[str, Job] = {}
        self._load_existing()

    def _load_existing(self) -> None:
        for path in sorted(self.jobs_dir.glob("*.json")):
            try:
                raw = json.loads(path.read_text(encoding="utf-8"))
                job = Job(**{k: v for k, v in raw.items() if k != "progress"})
            except (ValueError, TypeError, OSError):
                continue
            # A job left "running" at shutdown can never finish.
            if job.status == "running":
                job.status = "failed"
                job.error = job.error or "Service restarted while the job was running"
                job.finished_at = job.finished_at or _now()
            self._cache[job.job_id] = job

    def _persist(self, job: Job) -> None:
        path = self.jobs_dir / f"{job.job_id}.json"
        tmp = path.with_suffix(".tmp")
        tmp.write_text(
            json.dumps(job.to_dict(), indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        os.replace(tmp, path)

    def create(
        self,
        *,
        case_id: str,
        kind: str,
        requested_by: str,
        jurisdiction_id: str,
        file_count: int,
    ) -> Job:
        job = Job(
            job_id=uuid.uuid4().hex,
            case_id=case_id,
            kind=kind,
            requested_by=requested_by,
            jurisdiction_id=jurisdiction_id,
            file_count=file_count,
            log_file=str(self.jobs_dir / f"{uuid.uuid4().hex}.log"),
        )
        with self._lock:
            self._cache[job.job_id] = job
            self._persist(job)
        return job

    def get(self, job_id: str) -> Job | None:
        with self._lock:
            return self._cache.get(job_id)

    def update(self, job: Job) -> None:
        with self._lock:
            self._cache[job.job_id] = job
            self._persist(job)

    def list_for_case(self, case_id: str) -> list[Job]:
        with self._lock:
            jobs = [job for job in self._cache.values() if job.case_id == case_id]
        return sorted(jobs, key=lambda job: job.created_at, reverse=True)

    def latest_for_case(self, case_id: str) -> Job | None:
        jobs = self.list_for_case(case_id)
        return jobs[0] if jobs else None

    def active(self) -> list[Job]:
        with self._lock:
            return [
                job
                for job in self._cache.values()
                if job.status in {"queued", "running"}
            ]


class PipelineRunner:
    """Invokes ``run.py`` as a subprocess and streams progress into a Job."""

    def __init__(
        self,
        pipeline_dir: Path | str,
        store: JobStore,
        max_concurrent: int | None = None,
    ) -> None:
        self.pipeline_dir = Path(pipeline_dir)
        self.store = store
        if max_concurrent is None:
            max_concurrent = int(os.environ.get("CRIMENET_MAX_CONCURRENT_RUNS", "1"))
        self._slots = threading.Semaphore(max(1, max_concurrent))
        self._queue: list[Job] = []
        self._queue_lock = threading.Lock()
        self._wake = threading.Event()
        self._closed = False
        self._dispatcher = threading.Thread(
            target=self._dispatch, name="job-dispatcher", daemon=True
        )
        self._dispatcher.start()

    # -- public -----------------------------------------------------------
    def submit(self, job: Job, argv: list[str]) -> Job:
        """Queue a job. Returns immediately with status ``queued``."""
        job.argv = list(argv)
        with self._queue_lock:
            self._queue.append(job)
        self.store.update(job)
        self._wake.set()
        return job

    def shutdown(self, timeout: float = 5.0) -> None:
        self._closed = True
        self._wake.set()
        self._dispatcher.join(timeout=timeout)

    # -- internals --------------------------------------------------------
    def _dispatch(self) -> None:
        while not self._closed:
            self._wake.wait(timeout=0.5)
            self._wake.clear()
            while True:
                with self._queue_lock:
                    if not self._queue:
                        break
                    job = self._queue.pop(0)
                # Acquire outside the queue lock so one long run does not
                # block other jobs from being dequeued.
                self._slots.acquire()
                if self._closed:
                    self._slots.release()
                    return
                try:
                    self._execute(job)
                finally:
                    self._slots.release()

    def _execute(self, job: Job) -> None:
        argv: list[str] = getattr(job, "argv", [])
        job.status = "running"
        job.started_at = _now()
        job.detail = "Starting pipeline"
        self.store.update(job)

        log_path = Path(job.log_file)
        log_path.parent.mkdir(parents=True, exist_ok=True)

        try:
            with log_path.open("w", encoding="utf-8") as log_handle:
                process = subprocess.Popen(  # noqa: S603 - fixed argv, no shell
                    argv,
                    cwd=str(self.pipeline_dir),
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    bufsize=1,
                    env={**os.environ, "PYTHONUNBUFFERED": "1"},
                )
                assert process.stdout is not None
                for line in process.stdout:
                    log_handle.write(line)
                    log_handle.flush()
                    self._absorb(job, line)
                returncode = process.wait()
            job.returncode = returncode
            if returncode == 0:
                job.status = "completed"
                job.stage = job.total_stages
                job.detail = "Pipeline completed"
            else:
                job.status = "failed"
                job.error = f"run.py exited with code {returncode}"
                job.detail = "Pipeline failed"
        except FileNotFoundError as exc:
            job.status = "failed"
            job.error = f"Could not start pipeline: {exc}"
            job.detail = "Failed to start"
        except Exception as exc:  # noqa: BLE001 - job must never kill the worker
            job.status = "failed"
            job.error = f"{type(exc).__name__}: {exc}"
            job.detail = "Failed"
        finally:
            job.finished_at = _now()
            self.store.update(job)

    def _absorb(self, job: Job, line: str) -> None:
        run_match = _RUN_ID_RE.search(line)
        if run_match and not job.run_id:
            job.run_id = run_match.group(1)

        # Prefer the explicit stage number; it is authoritative and appears on
        # both the "Step N/8" lines and the standalone reasoning-stage lines.
        stage = _STAGE_RE.search(line)
        if stage:
            self._advance(job, int(stage.group(1)), None)
            return

        step = _STEP_RE.search(line)
        if step:
            # Step numbering is not stage numbering, so this only refreshes the
            # human-readable detail while the stage stays where it was.
            job.detail = step.group(3)
            self.store.update(job)
            return

        if _PERSIST_RE.search(line):
            self._advance(job, job.total_stages, "Persisting results")
            return
        if _SAVED_RE.search(line):
            job.detail = "Output saved"
            self.store.update(job)

    def _advance(self, job: Job, stage: int, detail: str | None) -> None:
        # Monotonic: out-of-order log lines must never move progress backwards.
        if stage <= job.stage:
            return
        job.stage = min(stage, job.total_stages)
        label = _STAGE_LABELS.get(stage, detail or f"Stage {stage}")
        job.detail = detail or label
        self.store.update(job)


def build_argv(
    pipeline_dir: Path,
    manifest_path: Path,
    output_dir: Path,
    *,
    case_id: str,
    jurisdiction_id: str,
    incremental: bool,
    no_database: bool = False,
) -> list[str]:
    argv = [
        sys.executable,
        "run.py",
        "--manifest",
        str(manifest_path),
        "--output",
        str(output_dir),
        "--case-id",
        case_id,
        "--jurisdiction-id",
        jurisdiction_id,
    ]
    if incremental:
        argv.append("--incremental")
    if no_database:
        argv.append("--no-database")
    return argv
