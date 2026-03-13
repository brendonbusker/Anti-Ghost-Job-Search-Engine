#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

SKILL_INTERFACE_OVERRIDES = {
    "jobs-data-model": {
        "display_name": "Jobs Data Model",
        "short_description": "Design schema and persistence for job intelligence",
        "default_prompt": "Use $jobs-data-model to design or revise the anti-ghost-job schema safely.",
    },
    "job-ingestion-pipeline": {
        "display_name": "Job Ingestion Pipeline",
        "short_description": "Build safe adapters and normalized job ingestion",
        "default_prompt": "Use $job-ingestion-pipeline to build or revise a public job source adapter.",
    },
    "job-dedup-canonicalization": {
        "display_name": "Job Dedup Canonicalization",
        "short_description": "Cluster duplicate listings into canonical jobs",
        "default_prompt": "Use $job-dedup-canonicalization to design or implement canonical job matching rules.",
    },
    "job-trust-scoring": {
        "display_name": "Job Trust Scoring",
        "short_description": "Design explainable realness and trust heuristics",
        "default_prompt": "Use $job-trust-scoring to build or tune explainable job trust scoring.",
    },
    "job-staleness-scoring": {
        "display_name": "Job Staleness Scoring",
        "short_description": "Design freshness, repost, and stale-job logic",
        "default_prompt": "Use $job-staleness-scoring to build or tune explainable freshness scoring.",
    },
    "job-search-ui": {
        "display_name": "Job Search UI",
        "short_description": "Build dense, explainable anti-ghost job search UI",
        "default_prompt": "Use $job-search-ui to design or implement the anti-ghost-job search experience.",
    },
    "ranking-evaluation": {
        "display_name": "Ranking Evaluation",
        "short_description": "Evaluate trust, freshness, ranking, and dedupe quality",
        "default_prompt": "Use $ranking-evaluation to evaluate scoring, ranking, or dedupe quality.",
    },
    "browser-extension-overlay": {
        "display_name": "Browser Extension Overlay",
        "short_description": "Build the post-MVP job-intelligence browser overlay",
        "default_prompt": "Use $browser-extension-overlay to design or implement the browser extension overlay.",
    },
}


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Install repo-local skills from .agents/skills into the active Codex skills directory.",
    )
    parser.add_argument(
        "--source-root",
        default=None,
        help="Override the source skill directory (defaults to <repo>/.agents/skills).",
    )
    parser.add_argument(
        "--target-root",
        default=None,
        help="Override the target skill directory (defaults to $CODEX_HOME/skills).",
    )
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    source_root = Path(args.source_root) if args.source_root else repo_root / ".agents" / "skills"

    codex_home = Path(os.environ.get("CODEX_HOME", str(Path.home() / ".codex")))
    target_root = Path(args.target_root) if args.target_root else codex_home / "skills"

    skill_creator_root = codex_home / "skills" / ".system" / "skill-creator"
    generator_script = skill_creator_root / "scripts" / "generate_openai_yaml.py"
    validator_script = skill_creator_root / "scripts" / "quick_validate.py"

    if not source_root.exists():
        raise SystemExit(f"Source skill directory not found: {source_root}")

    if not generator_script.exists():
        raise SystemExit(f"openai.yaml generator not found: {generator_script}")

    if not validator_script.exists():
        raise SystemExit(f"Skill validator not found: {validator_script}")

    target_root.mkdir(parents=True, exist_ok=True)

    installed = []

    for skill_dir in sorted(path for path in source_root.iterdir() if path.is_dir()):
        skill_name = skill_dir.name

        if skill_name not in SKILL_INTERFACE_OVERRIDES:
            raise SystemExit(f"No interface override mapping found for skill: {skill_name}")

        ensure_openai_yaml(skill_dir, generator_script, SKILL_INTERFACE_OVERRIDES[skill_name])
        validate_skill(skill_dir, validator_script)

        target_dir = target_root / skill_name
        if target_dir.exists():
            shutil.rmtree(target_dir)

        shutil.copytree(skill_dir, target_dir)
        validate_skill(target_dir, validator_script)
        installed.append(skill_name)

    print(f"Installed {len(installed)} skills to {target_root}")
    for skill_name in installed:
        print(f"- {skill_name}")

    return 0


def ensure_openai_yaml(skill_dir: Path, generator_script: Path, overrides: dict[str, str]) -> None:
    command = [sys.executable, str(generator_script), str(skill_dir)]

    for key, value in overrides.items():
        command.extend(["--interface", f"{key}={value}"])

    run(command)


def validate_skill(skill_dir: Path, validator_script: Path) -> None:
    run([sys.executable, str(validator_script), str(skill_dir)])


def run(command: list[str]) -> None:
    result = subprocess.run(command, capture_output=True, text=True)

    if result.returncode != 0:
        raise SystemExit(result.stderr.strip() or result.stdout.strip() or "Command failed")


if __name__ == "__main__":
    raise SystemExit(main())
