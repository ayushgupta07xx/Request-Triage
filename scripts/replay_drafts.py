"""
Replay a completed batch through the branch engine using its cached
classifications.

The engine changed, the classifier did not. Drafting and gating are pure
functions of a `Classification` plus the request text, so a finished run can be
pushed through the new branch logic without touching a provider: every case
goes in with `precomputed=`, which short-circuits `classify()` before any
waterfall is built. Zero requests, zero tokens, no quota risk.

Two deliberate choices:

  * Reads the .db, not the .jsonl. The run log carries metrics fields only -
    no entities, no rationale - and the knowledge-base matcher needs the
    extracted product to score properly. The store's payload is the full
    CaseRecord.

  * Passes store=None into process_request and inserts afterwards. Duplicate
    suppression is fingerprint-based within a time window, and a replay writes
    every case within the same few seconds; letting the engine see the store
    would have the second half of the batch suppress itself against the first.
    That failure has already cost this project one voided run (DECISIONS #18),
    and it is silent - the rows land looking plausible.

Usage, from the repo root:

    python3 scripts/replay_drafts.py --source corpus_dev_bulk
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from triage.config import load_config  # noqa: E402
from triage.engine import process_request  # noqa: E402
from triage.schemas import CaseRecord  # noqa: E402
from triage.store import CaseStore  # noqa: E402

RUNS = ROOT / "data" / "runs"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--source",
        default="corpus_dev_bulk",
        help="run stem to replay (data/runs/<stem>.db)",
    )
    ap.add_argument(
        "--name",
        default=None,
        help="output stem (default: <source>_kb)",
    )
    args = ap.parse_args()

    src_db = RUNS / f"{args.source}.db"
    if not src_db.exists():
        sys.exit(f"no such run: {src_db}")

    out_stem = args.name or f"{args.source}_kb"
    out_db = RUNS / f"{out_stem}.db"
    if out_db.exists():
        sys.exit(f"refusing to overwrite {out_db}\n  delete it, or pass --name")

    cfg = load_config()

    con = sqlite3.connect(src_db)
    payloads = [
        row[0] for row in con.execute("SELECT payload FROM cases ORDER BY created_at")
    ]
    con.close()
    print(f"replaying {len(payloads)} cases: {src_db.name} -> {out_db.name}")

    store = CaseStore(out_db)
    before: Counter[str] = Counter()
    after: Counter[str] = Counter()
    grounded = 0
    ungrounded_enquiries = 0

    for payload in payloads:
        rec = CaseRecord.model_validate_json(payload)
        before[rec.status.value] += 1

        case = process_request(
            rec.request,
            cfg,
            None,  # store: see module docstring
            None,  # waterfall: never built, precomputed short-circuits classify
            precomputed=rec.classification,
        )
        store.insert(case)
        after[case.status.value] += 1

        drafts = [a.artifact or "" for a in case.actions if a.artifact]
        if any("Source: " in d for d in drafts):
            grounded += 1
        elif case.branch == "general_enquiry":
            ungrounded_enquiries += 1

    total = len(payloads)
    print("\nstatus                       before   after")
    for key in sorted(set(before) | set(after)):
        print(f"  {key:<26} {before.get(key, 0):>6}  {after.get(key, 0):>6}")

    auto_before = before.get("auto_resolved", 0)
    auto_after = after.get("auto_resolved", 0)
    print(
        f"\nautomation rate  {auto_before / total:.1%} -> {auto_after / total:.1%}"
        f"  ({auto_before} -> {auto_after} of {total})"
    )
    print(f"grounded drafts cited a source: {grounded}")
    print(
        f"enquiries with no grounded answer (handed to a person): {ungrounded_enquiries}"
    )
    print(f"\nwrote {out_db}")
    print("next: python3 scripts/export_demo.py  (point it at this db)")


if __name__ == "__main__":
    main()
