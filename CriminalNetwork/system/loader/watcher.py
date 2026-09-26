"""Directory watcher — watches for new files and triggers processing."""
import os
import time
import logging
from pathlib import Path
from typing import Callable, Optional
from threading import Thread, Event

from .config import LoaderConfig
from .queue import JobQueue, Job, file_hash

logger = logging.getLogger(__name__)


class DirectoryWatcher:
    """Watches a directory for new files. When files appear, creates a job."""

    def __init__(
        self,
        config: LoaderConfig,
        queue: JobQueue,
        on_job_created: Optional[Callable[[Job], None]] = None,
    ):
        self.config = config
        self.queue = queue
        self.on_job_created = on_job_created
        self._stop_event = Event()
        self._thread: Optional[Thread] = None
        self._seen_hashes: set = set()
        self._load_known_hashes()

    def _load_known_hashes(self):
        """Load already-processed file hashes from the queue."""
        self._seen_hashes = self.queue.get_processed_hashes()
        logger.info(f"Loaded {len(self._seen_hashes)} known file hashes from queue")

    def _scan(self) -> list:
        """Scan watch directory for new files (by content hash)."""
        watch_dir = Path(self.config.watch_dir)
        if not watch_dir.exists():
            return []

        # Folders to skip
        archive_dir = Path(self.config.archive_dir).resolve()
        staging_dir = Path(self.config.staging_dir).resolve()

        new_files = []
        for f in watch_dir.rglob("*"):
            if not f.is_file():
                continue
            if f.name.startswith("."):
                continue
            if f.suffix.lower() not in self.config.supported_extensions:
                continue
            # Skip archived and staging files
            try:
                f.resolve().relative_to(archive_dir)
                continue
            except ValueError:
                pass
            try:
                f.resolve().relative_to(staging_dir)
                continue
            except ValueError:
                pass

            # Compute hash and check against processed
            try:
                h = file_hash(str(f))
            except Exception as e:
                logger.warning(f"Could not hash {f.name}: {e}")
                continue

            if h in self._seen_hashes:
                continue

            key = str(f.relative_to(watch_dir))
            new_files.append({
                "key": key,
                "name": f.name,
                "path": str(f),
                "size": f.stat().st_size,
                "hash": h,
            })

        return new_files

    def _process_batch(self, files: list):
        """Create a job from a batch of new files."""
        if not files:
            return

        logger.info(f"Found {len(files)} new files: {[f['name'] for f in files]}")

        # Create job
        job_files = [{"key": f["key"], "name": f["name"], "hash": f["hash"]} for f in files]
        job = self.queue.create_job(job_files)

        if self.on_job_created:
            self.on_job_created(job)

    def mark_batch_processed(self, files: list, job_id: str):
        """Mark files as processed after job completes."""
        for f in files:
            h = f.get("hash")
            if h:
                self._seen_hashes.add(h)
                self.queue.mark_processed(h, job_id)

    def watch(self, blocking: bool = True):
        """Start watching. blocking=True runs forever, False runs one scan."""
        logger.info(f"Watching: {self.config.watch_dir}")
        logger.info(f"Poll interval: {self.config.poll_interval}s")

        if not blocking:
            files = self._scan()
            self._process_batch(files)
            return

        self._stop_event.clear()
        while not self._stop_event.is_set():
            try:
                files = self._scan()
                self._process_batch(files)
            except Exception as e:
                logger.error(f"Watch error: {e}", exc_info=True)

            self._stop_event.wait(timeout=self.config.poll_interval)

        logger.info("Watcher stopped")

    def start_background(self):
        """Start watching in a background thread."""
        self._thread = Thread(target=self.watch, daemon=True, name="file-watcher")
        self._thread.start()
        logger.info("Watcher started in background")

    def stop(self):
        """Stop the background watcher."""
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=5)
        logger.info("Watcher stop requested")
