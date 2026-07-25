#!/usr/bin/env python3
"""Vendor the `triage` package into web/api/ for the Vercel bundle.

Vercel Python serverless functions must be self-contained: the deployed
function only sees files inside the project's `web/` tree, not the repo root.
So the source of truth stays at repo-root `triage/`, and this script copies it
verbatim into `web/api/triage/` before every deploy (and in local dev, so
`uvicorn` and `next dev` run against the exact same files that ship).

Why a copy and not a symlink or a path hack:
  * Vercel's build does not follow symlinks out of the project dir.
  * The package uses relative imports and locates workflows.yaml via
    Path(__file__).parent, so a verbatim directory copy Just Works with no
    rewriting -- config.py finds its sibling YAML wherever the package lands.
  * A copy is auditable: the vendored tree is a plain, greppable mirror.

The script is idempotent: it wipes and recreates web/api/triage/ each run, so
a deleted or renamed source file never leaves a stale ghost in the bundle.

Run from repo root:
    python3 scripts/sync_api.py
"""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SRC = REPO / "triage"
DEST = REPO / "web" / "api" / "triage"

# Files that must exist in the vendored package for it to function. If the
# source is missing one, fail loudly rather than shipping a broken bundle.
REQUIRED = [
    "__init__.py",
    "classifier.py",
    "config.py",
    "engine.py",
    "llm.py",
    "schemas.py",
    "store.py",
    "workflows.yaml",
]


def _ignore(_dir: str, names: list[str]) -> set[str]:
    # Never vendor caches or compiled artefacts into the deploy bundle.
    return {
        n for n in names if n in {"__pycache__", ".pytest_cache"} or n.endswith(".pyc")
    }


def main() -> None:
    if not SRC.is_dir():
        sys.exit(f"ERROR: source package not found: {SRC}")

    missing = [f for f in REQUIRED if not (SRC / f).exists()]
    if missing:
        sys.exit(f"ERROR: source package missing required files: {missing}")

    DEST.parent.mkdir(parents=True, exist_ok=True)
    if DEST.exists():
        shutil.rmtree(DEST)
    shutil.copytree(SRC, DEST, ignore=_ignore)

    # ---- integrity checks on the vendored copy ---------------------------
    problems = []

    for f in REQUIRED:
        if not (DEST / f).exists():
            problems.append(f"vendored copy missing {f}")

    # The YAML must sit beside config.py so Path(__file__).parent finds it.
    if not (DEST / "workflows.yaml").exists():
        problems.append("workflows.yaml did not land beside config.py")

    # Relative imports only: an absolute `from triage.x` in the source would
    # break once the package is imported under a different top-level name.
    for py in DEST.glob("*.py"):
        for i, line in enumerate(py.read_text(encoding="utf-8").splitlines(), 1):
            s = line.strip()
            if s.startswith(("from triage", "import triage")):
                problems.append(f"{py.name}:{i} absolute triage import: {s!r}")

    if problems:
        sys.exit("VENDOR INTEGRITY FAILED:\n  - " + "\n  - ".join(problems))

    n = sum(1 for _ in DEST.rglob("*") if _.is_file())
    print(f"vendored {SRC} -> {DEST}")
    print(f"  files: {n}")
    print(
        "  integrity: OK (required files present, YAML co-located, "
        "relative imports only)"
    )


if __name__ == "__main__":
    main()
