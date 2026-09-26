"""Loader configuration."""
import os
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class LoaderConfig:
    """Configuration for the file loader system."""

    # Directories
    watch_dir: str = ""           # Directory to watch for new files
    staging_dir: str = ""         # Temp directory for files being processed
    archive_dir: str = ""         # Where processed files are moved
    output_dir: str = ""          # Where extraction output goes

    # Processing
    supported_extensions: tuple = (
        ".csv", ".xlsx", ".xls", ".json", ".txt", ".pdf",
        ".docx", ".png", ".jpg", ".jpeg", ".gif", ".bmp",
    )
    use_llm: bool = True
    ai_config: str = "config/ai_providers.json"

    # Watcher
    poll_interval: float = 2.0    # Seconds between directory scans
    debounce_delay: float = 1.0   # Wait after last change before processing

    # Cleanup
    delete_after_archive: bool = False  # True = delete after archive, False = just move

    # Webhook (stubbed for now)
    webhook_port: int = 8000
    callback_url: str = ""        # Backend callback URL (empty = no callback)

    def __post_init__(self):
        base = Path(__file__).parent.parent  # system/
        if not self.watch_dir:
            self.watch_dir = str(base / "uploads")
        if not self.staging_dir:
            self.staging_dir = str(base / "staging")
        if not self.archive_dir:
            self.archive_dir = str(base / "archive")
        if not self.output_dir:
            self.output_dir = str(base / "output")

        # Create directories
        for d in [self.watch_dir, self.staging_dir, self.archive_dir, self.output_dir]:
            os.makedirs(d, exist_ok=True)
