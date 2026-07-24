#!/usr/bin/env python3
"""
Pool the two 70B dev slices (head + stratified) by example_id and evaluate
candidate automation-gate designs on the combined evidence. Zero API spend.

Pre-registered decision rule (stated before this script was first run):
  - a class earns a per-class auto-gate only if pooled auto-precision at the
    candidate threshold is >= 95% point estimate with n >= 15
  - financial_hardship is ineligible regardless of numbers: that branch
    never auto-resolves by design
  - the ensemble (floor-agreement) rule is kept as a hard rule only if it
    still adds precision on pooled 70B data; otherwise it is scoped to the
    degraded tier where it was derived

Run from the repo root:
    python3 scripts/diag/pool_70b.py
"""

import json
import math
import pathlib
import sys
from collections import Counter, defaultdict

ROOT = pathlib.Path(__file__).resolve().parents[2]
RUNS = ROOT / "data" / "runs"
HARD = "financial_hardship"
CLASSES = [
    "billing_dispute",
    "financial_hardship",
    "general_enquiry",
    "service_request",
    "other",
]


def wilson(k, n, z=1.96):
    if n == 0:
        return (0.0, 1.0)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, c - h), min(1.0, c + h))


def load(name):
    p = RUNS / f"{name}.jsonl"
    if not p.exists():
        sys.exit(f"missing run: {p}")
    return [json.loads(line) for line in open(p) if line.strip()]


def pct(k, n):
    return f"{k}/{n} ({k / n:.1%})" if n else "0/0"


def main():
    head = load("corpus_dev70_v1")
    strat = load("corpus_dev70_v1_strat")
    floor = {r["example_id"]: r for r in load("corpus_dev_floor")}

    pooled = {}
    for r in head:
        pooled[r["example_id"]] = r
    overlap = sum(1 for r in strat if r["example_id"] in pooled)
    for r in strat:
        pooled[r["example_id"]] = r  # prefer the newer row on overlap
    rows = list(pooled.values())
    n = len(rows)
    print(
        f"pooled: {n} unique 70B rows "
        f"({len(head)} head + {len(strat)} strat, {overlap} overlap)"
    )
    print(f"class support: " f"{dict(Counter(r['true_type'] for r in rows))}")

    ok = sum(1 for r in rows if r["pred_type"] == r["true_type"])
    lo, hi = wilson(ok, n)
    print(f"pooled type accuracy: {pct(ok, n)}  CI [{lo:.1%}, {hi:.1%}]")

    print("\n== CALIBRATION (pooled) ==")
    bucket = defaultdict(list)
    for r in rows:
        bucket[round(r["confidence"], 2)].append(r)
    for c in sorted(bucket):
        g = bucket[c]
        k = sum(1 for r in g if r["pred_type"] == r["true_type"])
        blo, bhi = wilson(k, len(g))
        print(
            f"  conf {c:.2f}: n={len(g):>3}  acc {pct(k, len(g))}  "
            f"CI [{blo:.0%}, {bhi:.0%}]"
        )

    print("\n== PER-CLASS AUTO-GATE CANDIDATES (confidence-only) ==")
    print(
        "pre-registered bar: precision >= 95% point AND n >= 15; "
        "hardship ineligible by design"
    )
    verdicts = {}
    for cls in CLASSES:
        pred = [
            r for r in rows if r["pred_type"] == cls and not r["guardrail_triggers"]
        ]
        line = f"  {cls:<20}"
        best = None
        for t in (0.90, 1.00):
            auto = [r for r in pred if r["confidence"] >= t]
            k = sum(1 for r in auto if r["pred_type"] == r["true_type"])
            na = len(auto)
            prec = k / na if na else 0.0
            mark = ""
            if cls != HARD and na >= 15 and prec >= 0.95 and best is None:
                best = t
                mark = "  <-- PASSES BAR"
            blo, _ = wilson(k, na)
            line += f"  conf>={t:.2f}: {k}/{na} " f"({prec:.0%}, lo {blo:.0%}){mark}"
        if cls == HARD:
            line += "  [ineligible by design]"
        verdicts[cls] = best
        print(line)

    print("\n== ENSEMBLE RULE ON POOLED 70B ==")
    live = [r for r in rows if r["decision_source"].startswith("llm")]
    agree = [r for r in live if floor[r["example_id"]]["pred_type"] == r["pred_type"]]
    dis = [r for r in live if floor[r["example_id"]]["pred_type"] != r["pred_type"]]
    ka = sum(1 for r in agree if r["pred_type"] == r["true_type"])
    kd = sum(1 for r in dis if r["pred_type"] != r["true_type"])
    kbase = sum(1 for r in live if r["pred_type"] == r["true_type"])
    print(f"  model-decided: {len(live)}, baseline acc {pct(kbase, len(live))}")
    print(f"  agreement:    {pct(ka, len(agree))} accurate")
    print(
        f"  disagreement: catches {pct(kd, len(dis))} as true errors "
        f"(flags {len(dis)} rows)"
    )
    adds = len(agree) and ka / len(agree) > kbase / len(live)
    print(
        f"  -> agreement {'ADDS' if adds else 'ADDS NO'} precision over "
        "baseline on 70B"
    )

    print("\n== COMPOSITE OPERATING POINTS (pooled, whole-system view) ==")
    eligible = [
        r
        for r in rows
        if not r["guardrail_triggers"] and r["decision_source"].startswith("llm")
    ]

    def op(auto, label):
        k = sum(1 for r in auto if r["pred_type"] == r["true_type"])
        na = len(auto)
        blo, _ = wilson(k, na) if na else (0, 0)
        prec = f"{k / na:.1%} (lo {blo:.0%})" if na else "n/a"
        print(
            f"  {label:<44} auto {na:>3} ({na / n:.0%})  "
            f"prec {prec}  escaped {na - k}"
        )

    for t in (0.90, 1.00):
        op([r for r in eligible if r["confidence"] >= t], f"global conf >= {t:.2f}")
        op(
            [
                r
                for r in eligible
                if r["confidence"] >= t
                and floor[r["example_id"]]["pred_type"] == r["pred_type"]
            ],
            f"agree AND conf >= {t:.2f}",
        )
    passing = {c: t for c, t in verdicts.items() if t is not None}
    op(
        [
            r
            for r in eligible
            if r["pred_type"] in passing and r["confidence"] >= passing[r["pred_type"]]
        ],
        f"per-class gates {passing or '(none passed)'}",
    )
    op(
        [
            r
            for r in eligible
            if r["pred_type"] in passing
            and r["confidence"] >= passing[r["pred_type"]]
            and floor[r["example_id"]]["pred_type"] == r["pred_type"]
        ],
        "per-class gates AND floor agrees",
    )

    print("\n== TRUE-HARDSHIP SAFETY UNDER PER-CLASS GATES ==")
    hard_rows = [r for r in rows if r["true_type"] == HARD]
    leaked = [
        r
        for r in hard_rows
        if r["pred_type"] in passing
        and r["pred_type"] != HARD
        and r["confidence"] >= passing.get(r["pred_type"], 2)
        and not r["guardrail_triggers"]
    ]
    print(
        f"  true hardship rows: {len(hard_rows)}; "
        f"auto-handled under a wrong label: {len(leaked)} "
        f"{[r['example_id'] for r in leaked] if leaked else ''}"
    )


if __name__ == "__main__":
    main()
