"""Processor — wraps existing Pipeline for the loader."""
import os
import shutil
import time
import json
import logging
from pathlib import Path
from typing import List, Optional

from .config import LoaderConfig
from .storage import LocalStorage
from .queue import Job, JobStatus

logger = logging.getLogger(__name__)


class LoaderProcessor:
    """Processes jobs by running files through the existing ingestion + extraction pipeline."""

    def __init__(self, config: LoaderConfig):
        self.config = config
        self.watch_storage = LocalStorage(config.watch_dir)
        self.archive_storage = LocalStorage(config.archive_dir)

    def process_job(self, job: Job) -> Job:
        """Process a complete job — fetch, stage, extract, archive."""
        job.status = JobStatus.PROCESSING
        job.started_at = time.time()

        staging_dir = os.path.join(self.config.staging_dir, job.job_id)
        job_output_dir = os.path.join(self.config.output_dir, job.job_id)
        os.makedirs(staging_dir, exist_ok=True)
        os.makedirs(job_output_dir, exist_ok=True)

        try:
            # Step 1: Fetch files from storage to staging
            staged_files = []
            for file_info in job.files:
                key = file_info["key"]
                name = file_info["name"]
                local_path = os.path.join(staging_dir, name)
                if self.watch_storage.fetch(key, local_path):
                    staged_files.append({"key": key, "name": name, "local_path": local_path})
                else:
                    logger.warning(f"Could not fetch {key}, skipping")

            if not staged_files:
                job.status = JobStatus.FAILED
                job.error = "No files could be fetched"
                job.completed_at = time.time()
                return job

            logger.info(f"Job {job.job_id}: staged {len(staged_files)} files")

            # Step 2: Run pipeline
            from src.pipeline import Pipeline
            pipeline = Pipeline(
                output_dir=job_output_dir,
                use_llm=self.config.use_llm,
                ai_config=self.config.ai_config,
            )

            # Ingest staged directory
            ingested = pipeline.ingestion.ingest_directory(staging_dir)
            evidence = [
                f for f in ingested
                if not any(x in f["file_name"] for x in ["WEIRD", "DIFFICULTY", "CRIME_STORY", "_PROCESSED"])
            ]

            # Extract from each file
            total_entities = 0
            total_relations = 0
            for info in evidence:
                result = pipeline.extraction.extract_from_file(info)
                total_entities += len(result["entities"])
                total_relations += len(result["relations"])
                logger.info(
                    f"  {info['file_name']}: "
                    f"{len(result['entities'])} entities, "
                    f"{len(result['relations'])} relations"
                )

            # Export results
            pipeline._export_results()

            job.files_processed = len(evidence)
            job.entities_found = total_entities
            job.relations_found = total_relations
            job.output_dir = job_output_dir

            logger.info(
                f"Job {job.job_id}: {len(evidence)} files, "
                f"{total_entities} entities, {total_relations} relations"
            )

            # Step 3: Archive originals (move to separate archive dir)
            for file_info in staged_files:
                key = file_info["key"]
                archive_key = f"{job.job_id}/{file_info['name']}"
                self.archive_storage.store(file_info["local_path"], archive_key)
                # Remove from watch dir
                watch_path = os.path.join(self.config.watch_dir, key)
                if os.path.exists(watch_path):
                    os.remove(watch_path)

            job.status = JobStatus.COMPLETED

        except Exception as e:
            logger.error(f"Job {job.job_id} failed: {e}", exc_info=True)
            job.status = JobStatus.FAILED
            job.error = str(e)

        finally:
            job.completed_at = time.time()
            # Cleanup staging
            if os.path.exists(staging_dir):
                shutil.rmtree(staging_dir, ignore_errors=True)

        return job

    def process_directory(self, input_dir: str, output_dir: str) -> dict:
        """Process a local directory directly (no storage abstraction)."""
        from src.pipeline import Pipeline

        pipeline = Pipeline(
            output_dir=output_dir,
            use_llm=self.config.use_llm,
            ai_config=self.config.ai_config,
        )

        ingested = pipeline.ingestion.ingest_directory(input_dir)
        evidence = [
            f for f in ingested
            if not any(x in f["file_name"] for x in ["WEIRD", "DIFFICULTY", "CRIME_STORY", "_PROCESSED"])
        ]

        total_entities = 0
        total_relations = 0
        for info in evidence:
            result = pipeline.extraction.extract_from_file(info)
            total_entities += len(result["entities"])
            total_relations += len(result["relations"])

        pipeline._export_results()

        return {
            "files_processed": len(evidence),
            "entities_found": total_entities,
            "relations_found": total_relations,
            "output_dir": output_dir,
        }

    def process_single_file(self, file_path: str, output_dir: str) -> dict:
        """Process a single file directly."""
        from src.pipeline import Pipeline

        pipeline = Pipeline(
            output_dir=output_dir,
            use_llm=self.config.use_llm,
            ai_config=self.config.ai_config,
        )

        ingested = pipeline.ingestion.ingest_file(file_path)
        if not ingested:
            return {"error": "Failed to ingest file"}

        result = pipeline.extraction.extract_from_file(ingested)
        pipeline._export_results()

        return {
            "file": os.path.basename(file_path),
            "entities_found": len(result["entities"]),
            "relations_found": len(result["relations"]),
            "output_dir": output_dir,
        }
