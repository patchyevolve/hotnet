"""Storage backend abstraction. Local filesystem now, S3 later."""
import os
import shutil
from pathlib import Path
from typing import List, Optional
import logging

logger = logging.getLogger(__name__)


class LocalStorage:
    """Local filesystem storage. Works today. Swap to S3 later."""

    def __init__(self, base_dir: str):
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def list_files(self, prefix: str = "") -> List[str]:
        """List all files under prefix."""
        search_dir = self.base_dir / prefix if prefix else self.base_dir
        if not search_dir.exists():
            return []
        return [
            str(f.relative_to(self.base_dir))
            for f in search_dir.rglob("*")
            if f.is_file()
        ]

    def fetch(self, key: str, local_path: str) -> bool:
        """Copy file from storage to local path."""
        src = self.base_dir / key
        if not src.exists():
            logger.error(f"File not found in storage: {key}")
            return False
        dest = Path(local_path)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(str(src), str(dest))
        logger.info(f"Fetched: {key} -> {local_path}")
        return True

    def archive(self, key: str, archive_key: str) -> bool:
        """Move file to archive location."""
        src = self.base_dir / key
        if not src.exists():
            logger.error(f"File not found for archival: {key}")
            return False
        dest = self.base_dir / archive_key
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(src), str(dest))
        logger.info(f"Archived: {key} -> {archive_key}")
        return True

    def store(self, local_path: str, key: str) -> bool:
        """Copy local file into storage."""
        src = Path(local_path)
        if not src.exists():
            logger.error(f"Local file not found: {local_path}")
            return False
        dest = self.base_dir / key
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(str(src), str(dest))
        return True


class S3Storage:
    """S3 storage — stubbed for now. Implement when backend is ready."""

    def __init__(self, bucket: str, prefix: str = ""):
        self.bucket = bucket
        self.prefix = prefix
        logger.warning("S3Storage is stubbed. Using LocalStorage instead.")
        # TODO: import boto3, create client
        # self.s3 = boto3.client('s3')

    def list_files(self, prefix: str = "") -> List[str]:
        # TODO: self.s3.list_objects_v2(Bucket=self.bucket, Prefix=prefix)
        raise NotImplementedError("S3 storage not yet implemented")

    def fetch(self, key: str, local_path: str) -> bool:
        # TODO: self.s3.download_file(self.bucket, key, local_path)
        raise NotImplementedError("S3 storage not yet implemented")

    def archive(self, key: str, archive_key: str) -> bool:
        # TODO: self.s3.copy_object(...) + self.s3.delete_object(...)
        raise NotImplementedError("S3 storage not yet implemented")

    def store(self, local_path: str, key: str) -> bool:
        # TODO: self.s3.upload_file(local_path, self.bucket, key)
        raise NotImplementedError("S3 storage not yet implemented")
