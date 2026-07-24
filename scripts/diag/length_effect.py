#!/usr/bin/env python3
"""
Does message length predict misclassification?

The cross-family holdout (Gemini 3.6 Flash) has a median body of ~600 chars
against the corpus's ~320. If accuracy falls with length, a holdout-vs-test
accuracy gap is partly a length artefact rather than evidence about shared
priors between corpus and classifier - and the comparison must say so.

This answers it offline from cached runs. Zero API spend.

Reports, per run:
  * accuracy by body-length quintile
  * accuracy on rows inside the holdout's length band (default >=500 chars),
    which is the direct proxy for how the model handles holdout-scale text
  * point-biserial correlation between length and correctness

Run from the repo root:
    python3 scripts/diag/length_effect.py corpus_dev_bulk corpus_dev70_v1_strat
"""

import argparse
import glob
import json
import math
import pathlib
import statistics
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]


def wilson(k, n, z=1.96):
    if n == 0:
        return (0.0, 1.0)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, c - h), min(1.0, c + h))


def load_bodies():
    bodies = {}
    for path in glob.glob(str(ROOT / "data" / "corpus" / "*.jsonl")):
        for line in open(path, encoding="utf-8"):
            if line.strip():
                r = json.loads(line)
                bodies[r["example_id"]] = r["body"]
    return bodies


def load_run(name):
    p = ROOT / "data" / "runs" / f"{name}.jsonl"
    if not p.exists():
        sys.exit(f"missing run: {p}")
    return [json.loads(line) for line in open(p) if line.strip()]


def analyse(name, rows, bodies, band):
    paired = [
        (len(bodies[r["example_id"]]), r["pred_type"] == r["true_type"])
        for r in rows
        if r["example_id"] in bodies
    ]
    if not paired:
        print(f"\n== {name}: no rows joined to corpus bodies ==")
        return
    n = len(paired)
    lens = [x for x, _ in paired]
    ok = sum(1 for _, c in paired if c)
    print(f"\n== {name} ==")
    print(
        f"  n={n}  accuracy {ok}/{n} ({ok / n:.1%})  "
        f"length median {int(statistics.median(lens))}, "
        f"range {min(lens)}-{max(lens)}"
    )

    paired.sort(key=lambda t: t[0])
    print(
        f"  {'quintile':<10} {'length band':<16} {'n':>4} {'accuracy':>10} {'95% CI':>16}"
    )
    size = max(1, n // 5)
    for q in range(5):
        chunk = paired[q * size : (q + 1) * size if q < 4 else n]
        if not chunk:
            continue
        k = sum(1 for _, c in chunk if c)
        lo, hi = wilson(k, len(chunk))
        band_s = f"{chunk[0][0]}-{chunk[-1][0]}"
        print(
            f"  Q{q + 1:<9} {band_s:<16} {len(chunk):>4} "
            f"{k / len(chunk):>9.1%} {f'[{lo:.0%}, {hi:.0%}]':>16}"
        )

    long_rows = [(x, c) for x, c in paired if x >= band]
    short_rows = [(x, c) for x, c in paired if x < band]
    if long_rows and short_rows:
        lk = sum(1 for _, c in long_rows if c)
        sk = sum(1 for _, c in short_rows if c)
        llo, lhi = wilson(lk, len(long_rows))
        print(
            f"\n  holdout-scale (>={band} chars): {lk}/{len(long_rows)} "
            f"({lk / len(long_rows):.1%})  CI [{llo:.0%}, {lhi:.0%}]"
        )
        print(
            f"  shorter      (< {band} chars): {sk}/{len(short_rows)} "
            f"({sk / len(short_rows):.1%})"
        )
        delta = lk / len(long_rows) - sk / len(short_rows)
        print(
            f"  difference: {delta:+.1%} "
            f"({'longer is HARDER' if delta < -0.05 else 'longer is EASIER' if delta > 0.05 else 'no material effect'})"
        )
    else:
        print(f"\n  (no split at {band} chars - all rows on one side)")

    # point-biserial correlation between length and correctness
    xs = [float(x) for x, _ in paired]
    ys = [1.0 if c else 0.0 for _, c in paired]
    mx, my = statistics.mean(xs), statistics.mean(ys)
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    den = math.sqrt(sum((x - mx) ** 2 for x in xs) * sum((y - my) ** 2 for y in ys))
    r = num / den if den else 0.0
    strength = "negligible" if abs(r) < 0.1 else "weak" if abs(r) < 0.3 else "moderate"
    print(f"  point-biserial r(length, correct) = {r:+.3f} ({strength})")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("runs", nargs="+", help="run names under data/runs/")
    ap.add_argument(
        "--band",
        type=int,
        default=500,
        help="holdout-scale length threshold (default 500)",
    )
    args = ap.parse_args()

    bodies = load_bodies()
    print(f"corpus bodies indexed: {len(bodies)}")
    hold = [len(b) for eid, b in bodies.items() if eid.startswith("hold_")]
    if hold:
        print(
            f"holdout bodies: n={len(hold)}, median {int(statistics.median(hold))}, "
            f"{sum(1 for x in hold if x >= args.band)} at/above {args.band} chars"
        )

    for name in args.runs:
        analyse(name, load_run(name), bodies, args.band)

    print(
        "\nInterpretation: if the quintiles are flat and r is negligible, the "
        "holdout's longer messages are not a threat to the comparison, and "
        "that can be stated with evidence rather than assumed."
    )


if __name__ == "__main__":
    main()
