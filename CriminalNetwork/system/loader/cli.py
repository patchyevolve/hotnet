"""CLI entry point for the loader."""
import argparse
import logging
import os
import sys
import time

from .config import LoaderConfig
from .queue import JobQueue, JobStatus
from .processor import LoaderProcessor
from .watcher import DirectoryWatcher
from .server import WebhookServer


def setup_logging(verbose: bool = False):
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
        datefmt="%H:%M:%S",
    )


def cmd_watch(args):
    """Watch directory for new files and process them."""
    config = LoaderConfig(
        watch_dir=args.watch_dir,
        use_llm=args.use_llm,
        poll_interval=args.poll_interval,
    )
    queue = JobQueue(status_file=os.path.join(config.output_dir, "loader_status.json"))
    processor = LoaderProcessor(config)

    def on_job(job):
        logging.info(f"Processing job {job.job_id}...")
        processor.process_job(job)
        queue.update_job(job)
        # Mark files as processed (hash-based dedup)
        watcher.mark_batch_processed(job.files, job.job_id)
        logging.info(
            f"Job {job.job_id}: {job.status.value} — "
            f"{job.entities_found} entities, {job.relations_found} relations"
        )

    watcher = DirectoryWatcher(config, queue, on_job_created=on_job)

    print(f"Watching: {config.watch_dir}")
    print(f"Output:   {config.output_dir}")
    print(f"Archive:  {config.archive_dir}")
    print(f"LLM:      {'ON' if args.use_llm else 'OFF'}")
    print(f"Poll:     {args.poll_interval}s")
    print("Drop files into the watch directory. Press Ctrl+C to stop.\n")

    try:
        watcher.watch(blocking=True)
    except KeyboardInterrupt:
        watcher.stop()
        print("\nStopped.")


def cmd_process(args):
    """Process a directory or file directly."""
    config = LoaderConfig(
        use_llm=args.use_llm,
        ai_config=args.ai_config,
    )
    processor = LoaderProcessor(config)

    if args.file:
        result = processor.process_single_file(args.file, args.output)
        print(f"\nProcessed: {result.get('file', 'error')}")
        print(f"  Entities: {result.get('entities_found', 0)}")
        print(f"  Relations: {result.get('relations_found', 0)}")
    elif args.input:
        result = processor.process_directory(args.input, args.output)
        print(f"\nProcessed: {result['files_processed']} files")
        print(f"  Entities: {result['entities_found']}")
        print(f"  Relations: {result['relations_found']}")
        print(f"  Output: {result['output_dir']}")
    else:
        print("Specify --input or --file")
        sys.exit(1)


def cmd_status(args):
    """Show job status."""
    queue = JobQueue(status_file=args.status_file)
    summary = queue.get_status_summary()
    jobs = queue.get_all_jobs()

    print(f"\n=== Loader Status ===")
    print(f"Total jobs: {summary['total_jobs']}")
    for status, count in summary.get("by_status", {}).items():
        print(f"  {status}: {count}")

    if jobs:
        print(f"\n=== Jobs ===")
        for job in jobs[-10:]:  # Last 10
            duration = ""
            if job.started_at and job.completed_at:
                duration = f" ({job.completed_at - job.started_at:.1f}s)"
            error = f" ERROR: {job.error}" if job.error else ""
            print(
                f"  {job.job_id}: {job.status.value} — "
                f"{job.files_processed} files, "
                f"{job.entities_found}E {job.relations_found}R"
                f"{duration}{error}"
            )


def cmd_serve(args):
    """Start webhook server (stubbed)."""
    server = WebhookServer(port=args.port)
    server.start()


def main():
    parser = argparse.ArgumentParser(
        description="Criminal Network Evidence Loader",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = parser.add_subparsers(dest="command", help="Command")

    # watch
    p_watch = sub.add_parser("watch", help="Watch directory for new files")
    p_watch.add_argument("--watch-dir", default="", help="Directory to watch")
    p_watch.add_argument("--poll-interval", type=float, default=2.0, help="Poll interval seconds")
    p_watch.add_argument("--use-llm", action="store_true", default=True)
    p_watch.add_argument("--no-llm", dest="use_llm", action="store_false")
    p_watch.add_argument("-v", "--verbose", action="store_true")
    p_watch.set_defaults(func=cmd_watch)

    # process
    p_proc = sub.add_parser("process", help="Process files directly")
    p_proc.add_argument("--input", help="Input directory")
    p_proc.add_argument("--file", help="Single file to process")
    p_proc.add_argument("--output", default="output", help="Output directory")
    p_proc.add_argument("--ai-config", default="config/ai_providers.json")
    p_proc.add_argument("--use-llm", action="store_true", default=True)
    p_proc.add_argument("--no-llm", dest="use_llm", action="store_false")
    p_proc.set_defaults(func=cmd_process)

    # status
    p_status = sub.add_parser("status", help="Show job status")
    p_status.add_argument("--status-file", default="output/loader_status.json")
    p_status.set_defaults(func=cmd_status)

    # serve
    p_serve = sub.add_parser("serve", help="Start webhook server (stubbed)")
    p_serve.add_argument("--port", type=int, default=8000)
    p_serve.set_defaults(func=cmd_serve)

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        sys.exit(1)

    setup_logging(getattr(args, "verbose", False))
    args.func(args)


if __name__ == "__main__":
    main()
