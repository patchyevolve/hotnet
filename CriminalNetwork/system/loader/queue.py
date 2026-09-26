"""Job queue and status tracking."""
import hashlib
import json
import os
import time
import uuid
from dataclasses import dataclass, field, asdict
from enum import Enum
from pathlib import Path
from typing import Dict, List, Optional, Set
import threading
import logging

logger = logging.getLogger(__name__)


def file_hash(path: str) -> str:
    """SHA-256 hash of a file's contents."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


class JobStatus(str, Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class Job:
    """A single processing job."""
    job_id: str
    files: List[dict]              # [{"key": "path/to/file", "name": "file.csv"}]
    status: JobStatus = JobStatus.QUEUED
    created_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    files_processed: int = 0
    entities_found: int = 0
    relations_found: int = 0
    error: Optional[str] = None
    output_dir: Optional[str] = None

    def to_dict(self) -> dict:
        d = asdict(self)
        d["status"] = self.status.value
        return d

    @classmethod
    def from_dict(cls, data: dict) -> "Job":
        data["status"] = JobStatus(data["status"])
        return cls(**data)


class JobQueue:
    """Thread-safe job queue with persistence."""

    def __init__(self, status_file: str = "loader_status.json"):
        self.status_file = Path(status_file)
        self._jobs: Dict[str, Job] = {}
        self._processed_hashes: Dict[str, str] = {}  # hash -> job_id
        self._lock = threading.Lock()
        self._load()

    def _load(self):
        """Load status from disk."""
        if self.status_file.exists():
            try:
                with open(self.status_file) as f:
                    data = json.load(f)
                for job_data in data.get("jobs", []):
                    job = Job.from_dict(job_data)
                    self._jobs[job.job_id] = job
                self._processed_hashes = data.get("processed_hashes", {})
                logger.info(f"Loaded {len(self._jobs)} jobs, {len(self._processed_hashes)} hashes from {self.status_file}")
            except Exception as e:
                logger.error(f"Failed to load status: {e}")

    def _save(self):
        """Save status to disk."""
        try:
            data = {
                "jobs": [job.to_dict() for job in self._jobs.values()],
                "processed_hashes": self._processed_hashes,
                "last_updated": time.time(),
            }
            self.status_file.parent.mkdir(parents=True, exist_ok=True)
            with open(self.status_file, "w") as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save status: {e}")

    def create_job(self, files: List[dict]) -> Job:
        """Create a new job."""
        job_id = f"job_{uuid.uuid4().hex[:8]}"
        job = Job(job_id=job_id, files=files)
        with self._lock:
            self._jobs[job_id] = job
            self._save()
        logger.info(f"Created job {job_id} with {len(files)} files")
        return job

    def get_job(self, job_id: str) -> Optional[Job]:
        with self._lock:
            return self._jobs.get(job_id)

    def update_job(self, job: Job):
        with self._lock:
            self._jobs[job.job_id] = job
            self._save()

    def get_next_queued(self) -> Optional[Job]:
        """Get the next queued job (FIFO)."""
        with self._lock:
            for job in self._jobs.values():
                if job.status == JobStatus.QUEUED:
                    return job
        return None

    def get_all_jobs(self) -> List[Job]:
        with self._lock:
            return list(self._jobs.values())

    def get_status_summary(self) -> dict:
        with self._lock:
            counts = {}
            for job in self._jobs.values():
                counts[job.status.value] = counts.get(job.status.value, 0) + 1
            return {
                "total_jobs": len(self._jobs),
                "by_status": counts,
                "unique_files_processed": len(self._processed_hashes),
            }

    def is_processed(self, file_hash_value: str) -> bool:
        """Check if a file hash was already processed."""
        with self._lock:
            return file_hash_value in self._processed_hashes

    def mark_processed(self, file_hash_value: str, job_id: str):
        """Register a file hash as processed."""
        with self._lock:
            self._processed_hashes[file_hash_value] = job_id
            self._save()

    def get_processed_hashes(self) -> Set[str]:
        """Get all processed file hashes."""
        with self._lock:
            return set(self._processed_hashes.keys())
