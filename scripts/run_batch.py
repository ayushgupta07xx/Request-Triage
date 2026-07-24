"""
Batch runner. Runs corpus examples through the full pipeline, caching every
decision to JSONL so metrics are recomputed offline without re-spending quota.

Resumable: already-processed example_ids are skipped on rerun.

Usage, from /home/ayushgupta15062003/code/request-triage:

    python3 scripts/run_batch.py --split dev --tier bulk
    python3 scripts/run_batch.py --split dev --tier bulk --no-llm   # floor only
    python3 scripts/run_batch.py --split test --tier quality        # ONCE, day 3
    python3 scripts/run_batch.py --file data/corpus/adversarial.jsonl --tier bulk
"""

from __future__ import annotations

import argparse
import json
import random
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from triage.config import load_config  # noqa: E402
from triage.engine import process_request  # noqa: E402
from triage.llm import Tier, build_waterfall, describe_waterfall  # noqa: E402
from triage.schemas import LabelledExample  # noqa: E402
from triage.store import CaseStore  # noqa: E402

CORPUS = ROOT / "data" / "corpus" / "corpus.jsonl"
RUNS = ROOT / "data" / "runs"


def _load_examples(path: Path, split: str | None) -> list[LabelledExample]:
    rows = []
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            if line.strip():
                rows.append(LabelledExample.model_validate_json(line))
    if split:
        rows = [r for r in rows if r.split == split]
    return rows


def main() -> None:
    load_dotenv(ROOT / ".env")
    ap = argparse.ArgumentParser()
    ap.add_argument("--split", choices=["dev", "test"], default=None)
    ap.add_argument("--file", default=str(CORPUS))
    ap.add_argument("--tier", choices=["bulk", "quality"], default="bulk")
    ap.add_argument("--no-llm", action="store_true", help="keyword floor only")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--name", default=None, help="run name (default: derived)")
    ap.add_argument(
        "--pace",
        type=float,
        default=0.0,
        help="min seconds between LLM calls (0 = off); keeps a measurement "
        "run under the per-minute token ceiling",
    )
    ap.add_argument(
        "--pin",
        action="store_true",
        help="measurement mode: pin to the tier primary model, wait out TPM "
        "congestion, never silently degrade to another model",
    )
    args = ap.parse_args()

    src = Path(args.file)
    stem = args.name or (
        f"{src.stem}_{args.split or 'all'}_" f"{'floor' if args.no_llm else args.tier}"
    )
    out_path = RUNS / f"{stem}.jsonl"
    db_path = RUNS / f"{stem}.db"
    RUNS.mkdir(parents=True, exist_ok=True)

    examples = _load_examples(src, args.split)
    if args.limit:
        # Stratified, seeded slice. The corpus file is ordered by class, so
        # plain head-truncation returns a one- or two-class subset - the
        # first 60-row "transfer check" measured only billing_dispute and
        # general_enquiry because of exactly this. Round-robin across
        # classes (shuffled within each, fixed seed) keeps every class
        # represented and the slice reproducible.
        rng = random.Random(1509)
        by_class: dict[str, list] = {}
        for ex in examples:
            by_class.setdefault(ex.true_type.value, []).append(ex)
        for grp in by_class.values():
            rng.shuffle(grp)
        picked = []
        classes = sorted(by_class)
        i = 0
        while len(picked) < args.limit and any(by_class.values()):
            grp = by_class[classes[i % len(classes)]]
            if grp:
                picked.append(grp.pop())
            i += 1
        examples = picked
        mix = {}
        for ex in examples:
            mix[ex.true_type.value] = mix.get(ex.true_type.value, 0) + 1
        print(f"stratified slice of {len(examples)}: {mix}")

    done: set[str] = set()
    if out_path.exists():
        with open(out_path, encoding="utf-8") as fh:
            for line in fh:
                if line.strip():
                    done.add(json.loads(line)["example_id"])
        print(f"resuming: {len(done)} example(s) already in {out_path.name}")

    cfg = load_config()
    waterfall = None if args.no_llm else build_waterfall(Tier(args.tier), pin=args.pin)
    if waterfall:
        print("waterfall:", describe_waterfall(waterfall))
    store = CaseStore(db_path)

    todo = [e for e in examples if e.example_id not in done]
    print(f"{len(todo)} to process, {len(done)} cached -> {out_path.name}")

    t0 = time.perf_counter()
    tok_total = 0
    for i, ex in enumerate(todo, 1):
        if args.pace and i > 1:
            time.sleep(args.pace)
        if waterfall is not None:
            waterfall.last_usage = None
        case = process_request(ex.to_request(), cfg, store, waterfall)
        c = case.classification
        usage = getattr(waterfall, "last_usage", None) if waterfall else None
        tok_total += (usage or {}).get("total_tokens") or 0
        row = {
            "example_id": ex.example_id,
            "true_type": ex.true_type.value,
            "true_urgency": ex.true_urgency.value,
            "adversarial": ex.adversarial,
            "pred_type": c.request_type.value,
            "pred_urgency": c.urgency.value,
            "confidence": c.confidence,
            "decision_source": c.decision_source.value,
            "guardrail_triggers": c.guardrail_triggers,
            "requires_review": c.requires_human_review,
            "review_reason": c.review_reason,
            "secondary_type": c.secondary_type.value if c.secondary_type else None,
            "alt_type": c.alt_type.value if c.alt_type else None,
            "alt_confidence": c.alt_confidence,
            "margin": c.margin(),
            "proposal_secondary": (
                c.llm_proposal.secondary_type.value
                if c.llm_proposal and c.llm_proposal.secondary_type
                else None
            ),
            "proposal_type": c.llm_proposal.request_type.value
            if c.llm_proposal
            else None,
            "proposal_urgency": c.llm_proposal.urgency.value
            if c.llm_proposal
            else None,
            "model": c.model_name,
            "prompt_version": c.prompt_version,
            "latency_ms": c.latency_ms,
            "status": case.status.value,
            "branch_completed": case.completed_all_steps(),
            "n_actions": len(case.actions),
            "usage_prompt_tokens": (usage or {}).get("prompt_tokens"),
            "usage_completion_tokens": (usage or {}).get("completion_tokens"),
            "usage_total_tokens": (usage or {}).get("total_tokens"),
            "usage_cached_tokens": (
                (usage or {}).get("prompt_tokens_details") or {}
            ).get("cached_tokens"),
            "case_id": case.case_id,
        }
        with open(out_path, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(row) + "\n")
        if i % 10 == 0 or i == len(todo):
            rate = i / (time.perf_counter() - t0)
            print(f"  {i}/{len(todo)}  ({rate:.1f}/s)", end="\r")

    store.close()
    print(f"\ndone -> {out_path} and {db_path}")
    if tok_total:
        print(f"LLM tokens this run (sum usage.total_tokens): {tok_total:,}")


if __name__ == "__main__":
    main()
