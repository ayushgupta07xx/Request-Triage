#!/usr/bin/env python3
"""
Decide prompt v1 vs v2 on identical policy. Zero API spend.

The two runs were produced under different workflows.yaml configs (v1: four
guardrails, v2: five), so their automation numbers are not comparable as
recorded. This recomputes guardrail triggers from the CURRENT config against
the corpus text for both runs, then applies one policy to both.

Also asks whether the tier-2 hardship guardrail earns its keep: how many rows
it costs, and how many hardship cases it catches that the review policy would
have missed anyway.

Run from the repo root:
    python3 scripts/ab_prompts.py
"""

from __future__ import annotations

import glob
import json
import pathlib
import sys

import yaml

REPO = pathlib.Path(__file__).resolve().parents[1]
RUNS = REPO / "data" / "runs"
HARD = "financial_hardship"


def load_run(name):
    p = RUNS / f"{name}.jsonl"
    if not p.exists():
        sys.exit(f"missing run: {p}")
    return [json.loads(line) for line in open(p) if line.strip()]


def main():
    cfg = yaml.safe_load(open(REPO / "triage" / "workflows.yaml"))
    review_rules = [g for g in cfg["guardrails"] if g.get("requires_human_review")]
    tier2 = [g for g in review_rules if g["id"] == "hardship_possible"]
    tier1 = [g for g in review_rules if g["id"] != "hardship_possible"]

    corpus = {}
    for path in glob.glob(str(REPO / "data" / "corpus" / "*.jsonl")):
        for line in open(path):
            if line.strip():
                r = json.loads(line)
                corpus[r["example_id"]] = (
                    r.get("subject", "") + "\n" + r["body"]
                ).lower()

    def fires(eid, rules):
        text = corpus.get(eid, "")
        return [g["id"] for g in rules if any(p in text for p in g["phrases"])]

    v1 = load_run("corpus_dev_bulk")
    v2 = load_run("corpus_dev_bulk_v2")
    floor = {r["example_id"]: r for r in load_run("corpus_dev_floor")}

    missing = [r["example_id"] for r in v1 + v2 if r["example_id"] not in corpus]
    if missing:
        print(f"!! {len(missing)} example_ids not found in corpus; first: {missing[0]}")

    def evaluate(rows, label, rules, thresholds):
        n = len(rows)
        print(f"\n### {label}  (n={n})")
        acc = sum(1 for r in rows if r["pred_type"] == r["true_type"])
        print(f"  type accuracy: {acc}/{n} ({acc / n:.1%})")

        eligible = [
            r
            for r in rows
            if r["decision_source"] != "keyword_fallback"
            and not fires(r["example_id"], rules)
        ]
        n_floor = sum(1 for r in rows if r["decision_source"] == "keyword_fallback")
        print(
            f"  eligible: {len(eligible)}/{n}  "
            f"(excluded: {n_floor} floor, {n - n_floor - len(eligible)} guardrail)"
        )
        print(f"  {'gate':<26} {'auto':>5} {'autom.':>7} {'prec':>7} {'escaped':>8}")
        best = None
        for t in thresholds:
            auto = [
                r
                for r in eligible
                if r["confidence"] >= t
                and floor[r["example_id"]]["pred_type"] == r["pred_type"]
            ]
            if not auto:
                continue
            ok = sum(1 for r in auto if r["pred_type"] == r["true_type"])
            prec = ok / len(auto)
            print(
                f"  {'agree AND conf>=' + format(t, '.2f'):<26} {len(auto):>5} "
                f"{len(auto) / n:>6.1%} {prec:>7.1%} {len(auto) - ok:>8}"
            )
            if prec >= 0.95 and (best is None or len(auto) > best[1]):
                best = (t, len(auto), prec)
        print(f"  best >=95% precision point: {best if best else 'NONE'}")

        # substantive classes only - 'other' is trivially separable and
        # inflates the aggregate
        for t in thresholds:
            auto = [
                r
                for r in eligible
                if r["confidence"] >= t
                and floor[r["example_id"]]["pred_type"] == r["pred_type"]
                and r["pred_type"] != "other"
            ]
            if auto and t == thresholds[-1]:
                ok = sum(1 for r in auto if r["pred_type"] == r["true_type"])
                print(
                    f"  excluding 'other' at conf>={t:.2f}: {len(auto)} rows, "
                    f"{ok / len(auto):.1%} precision"
                )

        # hardship safety under the full review policy
        hard_rows = [r for r in rows if r["true_type"] == HARD]
        unsafe = []
        for r in hard_rows:
            if r["pred_type"] == HARD:
                continue
            if r["decision_source"] == "keyword_fallback":
                continue
            flagged = (
                bool(fires(r["example_id"], rules))
                or r["confidence"] < 1.00
                or floor[r["example_id"]]["pred_type"] != r["pred_type"]
                or floor[r["example_id"]]["pred_type"] == HARD
            )
            if not flagged:
                unsafe.append(r["example_id"])
        rec = sum(1 for r in hard_rows if r["pred_type"] == HARD)
        print(
            f"  hardship: recall {rec}/{len(hard_rows)} ({rec / len(hard_rows):.0%}), "
            f"unflagged misses: {len(unsafe)} {unsafe or ''}"
        )
        return best

    TH = [0.80, 0.90, 0.95, 1.00]
    print("=" * 70)
    print("A/B UNDER IDENTICAL POLICY (current config, both tiers)")
    print("=" * 70)
    evaluate(v1, "PROMPT v1", review_rules, TH)
    evaluate(v2, "PROMPT v2", review_rules, TH)

    print("\n" + "=" * 70)
    print("SAME, WITH TIER-2 HARDSHIP GUARDRAIL REMOVED")
    print("=" * 70)
    evaluate(v1, "PROMPT v1 (tier-1 only)", tier1, TH)
    evaluate(v2, "PROMPT v2 (tier-1 only)", tier1, TH)

    print("\n" + "=" * 70)
    print("DOES TIER-2 EARN ITS KEEP?")
    print("=" * 70)
    for rows, label in ((v1, "v1"), (v2, "v2")):
        fired = [r for r in rows if fires(r["example_id"], tier2)]
        on_hard = [r for r in fired if r["true_type"] == HARD]
        # of the hardship rows it fires on, how many would the rest of the
        # policy have flagged anyway?
        redundant = 0
        for r in on_hard:
            if (
                r["pred_type"] == HARD
                or r["confidence"] < 1.00
                or floor[r["example_id"]]["pred_type"] != r["pred_type"]
                or bool(fires(r["example_id"], tier1))
            ):
                redundant += 1
        print(
            f"  {label}: fires on {len(fired)} rows, {len(on_hard)} truly hardship "
            f"({len(fired) - len(on_hard)} false positives). "
            f"Of the true ones, {redundant}/{len(on_hard)} were already flagged "
            f"by other rules -> marginal value {len(on_hard) - redundant}"
        )

    print("\n" + "=" * 70)
    print("MARGIN AS A SIGNAL (v2 only)")
    print("=" * 70)
    live = [r for r in v2 if r["decision_source"] != "keyword_fallback"]
    by_margin = {}
    for r in live:
        by_margin.setdefault(round(r["margin"], 2), []).append(r)
    print(f"  {'margin':>7} {'n':>5} {'accuracy':>10}")
    for m in sorted(by_margin):
        g = by_margin[m]
        ok = sum(1 for r in g if r["pred_type"] == r["true_type"])
        print(f"  {m:>7.2f} {len(g):>5} {ok / len(g):>9.1%}")
    same = sum(1 for r in live if abs(r["margin"] - r["confidence"]) < 1e-9)
    print(
        f"\n  rows where margin == confidence exactly: {same}/{len(live)} "
        f"({same / len(live):.0%}) -> alt_confidence was 0, so margin carries "
        "no information beyond confidence on those rows"
    )


if __name__ == "__main__":
    main()
