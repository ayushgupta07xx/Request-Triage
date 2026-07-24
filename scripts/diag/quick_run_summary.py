#!/usr/bin/env python3
"""
Quick summary of a cached run: accuracy, decision sources, confidence values,
urgency mix. Optionally compares a baseline run restricted to the SAME
example_ids, so a 60-row 70B slice is compared against 8B on those 60 rows
rather than against the full-200 aggregate.

Run from the repo root:
    python3 scripts/diag/quick_run_summary.py corpus_dev70_v1 \
        --baseline corpus_dev_bulk
"""

import argparse
import json
import pathlib
import sys
from collections import Counter

ROOT = pathlib.Path(__file__).resolve().parents[2]
RUNS = ROOT / "data" / "runs"


def load(name):
    p = RUNS / f"{name}.jsonl"
    if not p.exists():
        sys.exit(f"missing run: {p}")
    return [json.loads(line) for line in open(p) if line.strip()]


def summarize(rows, label):
    n = len(rows)
    tk = sum(1 for r in rows if r["pred_type"] == r["true_type"])
    uk = sum(1 for r in rows if r["pred_urgency"] == r["true_urgency"])
    print(f"\n== {label} (n={n}) ==")
    print(f"  type accuracy:  {tk}/{n} ({tk / n:.1%})")
    print(f"  urgency exact:  {uk}/{n} ({uk / n:.1%})")
    print(f"  sources:        {dict(Counter(r['decision_source'] for r in rows))}")
    live = [r for r in rows if r["decision_source"] != "keyword_fallback"]
    if live:
        lk = sum(1 for r in live if r["pred_type"] == r["true_type"])
        print(f"  model-decided:  {lk}/{len(live)} ({lk / len(live):.1%})")
        print(
            "  confidence:     " f"{sorted({round(r['confidence'], 2) for r in live})}"
        )
    print(f"  urgency mix:    {dict(Counter(r['pred_urgency'] for r in rows))}")
    print(f"  review flagged: {sum(1 for r in rows if r['requires_review'])}/{n}")
    hard = [r for r in rows if r["true_type"] == "financial_hardship"]
    if hard:
        hk = sum(1 for r in hard if r["pred_type"] == "financial_hardship")
        print(f"  hardship recall:{hk}/{len(hard)} ({hk / len(hard):.0%})")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("run", help="run name under data/runs/")
    ap.add_argument("--baseline", help="baseline run, restricted to same ids")
    args = ap.parse_args()

    rows = load(args.run)
    summarize(rows, args.run)

    if args.baseline:
        base = load(args.baseline)
        ids = {r["example_id"] for r in rows}
        sub = [r for r in base if r["example_id"] in ids]
        missing = len(ids) - len(sub)
        if missing:
            print(f"\n  NOTE: {missing} ids absent from baseline")
        summarize(sub, f"{args.baseline} (same {len(sub)} ids)")


if __name__ == "__main__":
    main()
