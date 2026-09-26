#!/usr/bin/env python3
"""
Run the extraction pipeline.

Usage:
    # Single FIR (flat directory)
    python run.py --input ../demo_data --output output

    # Multi-FIR via manifest
    python run.py --manifest ../demo_data/FIR_MANIFEST.json --output output

    # Multi-FIR, selected FIRs only
    python run.py --manifest fir_manifest.json --fir-ids FIR_001,FIR_002

    # Other options
    python run.py --use-llm                # Enable LLM extraction
    python run.py --incremental            # Only new files
    python run.py --case-id CASE_001       # Associate with case
    python run.py --status                 # Show AI provider status
"""

import argparse
import json
import os
import sys
from pathlib import Path

# Load .env file if present
env_file = Path(__file__).parent / ".env"
if env_file.exists():
    with open(env_file) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                # Honor explicit process environment overrides. This is also
                # required for isolated database/test runs to avoid silently
                # reconnecting to the database configured in .env.
                if val.strip() and key.strip() not in os.environ:
                    os.environ[key.strip()] = val.strip().strip('"').strip("'")

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from src.pipeline import run_multi_case, run_multi_fir, run_pipeline


def main():
    parser = argparse.ArgumentParser(
        description="Criminal Network Extraction Pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Process flat directory (single FIR)
  python run.py --input ../demo_data --output output

  # Process multi-FIR manifest
  python run.py --manifest ../demo_data/FIR_MANIFEST.json

  # Process specific FIRs from manifest
  python run.py --manifest fir_manifest.json --fir-ids FIR_001,FIR_003

  # With LLM enabled
  python run.py --manifest fir_manifest.json --use-llm
""",
    )
    parser.add_argument("--input", "-i", default=None, help="Input directory (flat, single FIR)")
    parser.add_argument("--manifest", "-m", default=None, help="FIR manifest JSON (multi-FIR)")
    parser.add_argument("--multi-case-manifest", default=None, help="Manifest containing isolated case manifests")
    parser.add_argument("--fir-ids", default=None, help="Comma-separated FIR IDs to process (subset of manifest)")
    parser.add_argument("--output", "-o", default=None, help="Output directory (default: output)")
    parser.add_argument("--use-llm", action="store_true", help="Enable LLM extraction for unstructured text")
    parser.add_argument("--no-llm", dest="use_llm", action="store_false", help="Disable configured LLM use")
    parser.set_defaults(use_llm=None)
    parser.add_argument("--model", default=None, help="Override the configured exact model ID")
    parser.add_argument("--provider", default=None, help="Override the configured provider (for example: mistral)")
    parser.add_argument("--incremental", action="store_true", help="Process only new files")
    parser.add_argument("--ai-config", default=None, help="AI providers config")
    parser.add_argument("--status", action="store_true", help="Show AI provider status and exit")
    parser.add_argument("--case-id", default=None, help="Case ID to associate this run with")
    parser.add_argument("--jurisdiction-id", default=None, help="Jurisdiction node ID for this run")
    parser.add_argument("--no-database", action="store_true", help="Disable PostgreSQL writes; keep outputs in files")
    args = parser.parse_args()

    # Default paths
    script_dir = Path(__file__).parent
    output_dir = args.output or str(script_dir / "output")
    ai_config = args.ai_config or str(script_dir / "config" / "ai_providers.json")
    pipeline_config_path = script_dir / "config" / "pipeline.json"
    pipeline_config = {}
    if pipeline_config_path.exists():
        with open(pipeline_config_path, encoding="utf-8") as f:
            pipeline_config = json.load(f).get("pipeline", {})
    use_llm = args.use_llm if args.use_llm is not None else bool(pipeline_config.get("use_llm", False))
    llm_model = args.model or pipeline_config.get("llm_model")
    llm_provider = args.provider or pipeline_config.get("llm_provider")
    persist_database = not args.no_database

    if args.status:
        from src.ai.caller import AICaller
        ai = AICaller(config_path=ai_config)
        status = ai.get_provider_status()
        print("AI Provider Status (local configuration only; no remote API requests made):")
        for name, info in status.items():
            if not info["has_api_key"]:
                readiness = "NO KEY"
            elif info["available"]:
                readiness = "CONFIGURED"
            else:
                readiness = "LOCAL UNAVAILABLE"
            billing = "free/local" if info["is_free"] else "metered"
            print(
                f"  {name:15} {readiness:17} key={'YES' if info['has_api_key'] else 'NO':3} "
                f"billing={billing:10} remote=not checked"
            )
        return 0

    # Multi-case mode (isolated case manifests + shared global identity index)
    if args.multi_case_manifest:
        manifest_path = Path(args.multi_case_manifest)
        if not manifest_path.is_absolute():
            manifest_path = script_dir.parent / manifest_path
        print("=" * 60)
        print("CRIMINAL NETWORK PIPELINE — MULTI-CASE")
        print("=" * 60)
        print(f"Manifest:   {manifest_path}")
        print(f"Output:     {output_dir}")
        print(f"LLM:        {'ENABLED' if use_llm else 'DISABLED'} ({llm_provider or 'auto'} / {llm_model or 'tier default'})")
        result = run_multi_case(
            manifest_path=str(manifest_path), output_dir=output_dir,
            use_llm=use_llm, ai_config=ai_config,
            llm_model=llm_model, llm_provider=llm_provider,
            persist_database=persist_database,
        )
    # Multi-FIR mode (manifest)
    elif args.manifest:
        manifest_path = args.manifest
        if not Path(manifest_path).is_absolute():
            # Try relative to script dir first, then script's parent
            candidate1 = script_dir / manifest_path
            candidate2 = script_dir.parent / manifest_path
            if candidate1.exists():
                manifest_path = str(candidate1)
            elif candidate2.exists():
                manifest_path = str(candidate2)
            else:
                manifest_path = str(candidate2)  # Will error with clear message

        fir_ids = None
        if args.fir_ids:
            fir_ids = [fid.strip() for fid in args.fir_ids.split(",")]

        print("=" * 60)
        print("CRIMINAL NETWORK EXTRACTION PIPELINE — MULTI-FIR")
        print("=" * 60)
        print(f"Manifest:   {manifest_path}")
        print(f"FIR IDs:    {fir_ids or 'ALL'}")
        print(f"Output:     {output_dir}")
        print(f"LLM:        {'ENABLED' if use_llm else 'DISABLED'} ({llm_provider or 'auto'} / {llm_model or 'tier default'})")
        print("=" * 60)

        result = run_multi_fir(
            manifest_path=manifest_path,
            output_dir=output_dir,
            use_llm=use_llm,
            ai_config=ai_config,
            fir_ids=fir_ids,
            llm_model=llm_model,
            llm_provider=llm_provider,
            persist_database=persist_database,
        )

    # Single FIR mode (flat directory)
    else:
        input_dir = args.input or str(script_dir.parent / "demo_data")

        print("=" * 60)
        print("CRIMINAL NETWORK EXTRACTION PIPELINE")
        print("=" * 60)
        print(f"Input:      {input_dir}")
        print(f"Output:     {output_dir}")
        print(f"LLM:        {'ENABLED' if use_llm else 'DISABLED'} ({llm_provider or 'auto'} / {llm_model or 'tier default'})")
        print(f"AI Config:  {ai_config}")
        print(f"Mode:       {'INCREMENTAL' if args.incremental else 'BATCH'}")
        print("=" * 60)

        result = run_pipeline(
            input_dir=input_dir,
            output_dir=output_dir,
            use_llm=use_llm,
            incremental=args.incremental,
            ai_config=ai_config,
            case_id=args.case_id,
            jurisdiction_node_id=args.jurisdiction_id,
            llm_model=llm_model,
            llm_provider=llm_provider,
            persist_database=persist_database,
        )

    return 0 if "error" not in result else 1


if __name__ == "__main__":
    # Deterministic builds: hash randomization changes set/dict iteration
    # order between processes, which alters borderline entity-resolution
    # merges (same input → different output across runs). Re-exec once with
    # a fixed seed unless the caller set one explicitly.
    if os.environ.get("PYTHONHASHSEED") is None:
        os.environ["PYTHONHASHSEED"] = "0"
        os.execve(sys.executable, [sys.executable] + sys.argv, os.environ)
    sys.exit(main())
