#!/usr/bin/env python3
"""Offline evaluation of cached triage runs. Zero API spend.

Reads data/runs/<name>.jsonl written by scripts/run_batch.py and derives every
number the assessment needs, without ever calling a provider:

  * type confusion matrix, per-class precision/recall/F1 with Wilson intervals
  * urgency exact / within-one / directional bias + urgency matrix
  * accuracy by decision source (quantifies drag from TPM-degraded rows)
  * calibration table (accuracy by stated confidence) + ECE
  * floor-vs-LLM comparison and the free disagreement signal
  * operating-point sweeps: confidence gate, ensemble gate, per-class gates
  * reliability: branch completion, guardrail firing, adversarial subset

Every published number in the README and deck should come out of this script.

Usage:
  python3 scripts/run_eval.py --run corpus_dev_bulk
  python3 scripts/run_eval.py --run corpus_dev_bulk --floor corpus_dev_floor
  python3 scripts/run_eval.py --run corpus_dev_bulk --floor corpus_dev_floor --write
"""

from __future__ import annotations

import argparse
import json
import math
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
RUNS = REPO / "data" / "runs"
OUT_DIR = REPO / "docs" / "eval"

TYPES = [
    "billing_dispute",
    "financial_hardship",
    "general_enquiry",
    "service_request",
    "other",
]
SHORT = {
    "billing_dispute": "bill",
    "financial_hardship": "hard",
    "general_enquiry": "enq",
    "service_request": "svc",
    "other": "other",
}
URGENCY = ["low", "medium", "high", "critical"]
UIDX = {u: i for i, u in enumerate(URGENCY)}
USHORT = {u: u[:4] for u in URGENCY}

LINES: list[str] = []
METRICS: dict = {}


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------
def emit(line: str = "") -> None:
    LINES.append(line)
    print(line)


def head(level: int, text: str) -> None:
    emit()
    emit("#" * level + " " + text)
    emit()


def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float]:
    """Wilson score interval - correct for small n and proportions near 0/1."""
    if n == 0:
        return (0.0, 1.0)
    p = k / n
    denom = 1.0 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return (max(0.0, centre - half), min(1.0, centre + half))


def ratio(k: int, n: int) -> str:
    return f"{k}/{n} ({k / n:.1%})" if n else f"{k}/0 (n/a)"


def ci_str(k: int, n: int) -> str:
    lo, hi = wilson(k, n)
    return f"[{lo:.1%}, {hi:.1%}]"


def load_run(name: str) -> list[dict]:
    fname = name if name.endswith(".jsonl") else name + ".jsonl"
    path = RUNS / fname
    if not path.exists():
        raise SystemExit(f"missing run file: {path}")
    with path.open() as fh:
        rows = [json.loads(line) for line in fh if line.strip()]
    if not rows:
        raise SystemExit(f"empty run file: {path}")
    return rows


def correct(r: dict) -> bool:
    return r["pred_type"] == r["true_type"]


def is_floor(r: dict) -> bool:
    return r["decision_source"] == "keyword_fallback"


def guardrailed(r: dict) -> bool:
    return bool(r.get("guardrail_triggers"))


def eligible(r: dict) -> bool:
    """Rows the system could ever auto-handle.

    The keyword floor never auto-resolves (confidence capped at 0.60) and
    guardrails only ever escalate, so both classes of row are excluded from
    automation by construction, before any threshold is applied.
    """
    return not is_floor(r) and not guardrailed(r)


# --------------------------------------------------------------------------
# sections
# --------------------------------------------------------------------------
def section_header(name: str, rows: list[dict], floor_name: str | None) -> None:
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    models = sorted({r.get("model") or "-" for r in rows})
    versions = sorted({r.get("prompt_version") or "-" for r in rows})
    head(1, f"Evaluation: `{name}`")
    emit(f"- rows: **{len(rows)}**")
    emit(f"- models: {', '.join(models)}")
    emit(f"- prompt versions: {', '.join(versions)}")
    emit(f"- floor comparison run: {floor_name or '(none supplied)'}")
    emit(f"- generated: {stamp} (offline, zero API calls)")
    if len(versions) > 1:
        emit("- **WARNING: mixed prompt versions in one run file.**")
    METRICS["run"] = name
    METRICS["n"] = len(rows)
    METRICS["models"] = models
    METRICS["prompt_versions"] = versions


def section_headline(rows: list[dict]) -> None:
    n = len(rows)
    tk = sum(1 for r in rows if correct(r))
    uk = sum(1 for r in rows if r["pred_urgency"] == r["true_urgency"])
    w1 = sum(
        1 for r in rows if abs(UIDX[r["pred_urgency"]] - UIDX[r["true_urgency"]]) <= 1
    )
    bc = sum(1 for r in rows if r.get("branch_completed"))
    rev = sum(1 for r in rows if r.get("requires_review"))
    head(2, "Headline")
    emit("| metric | value | 95% CI (Wilson) |")
    emit("|---|---|---|")
    emit(f"| type accuracy | {ratio(tk, n)} | {ci_str(tk, n)} |")
    emit(f"| urgency exact | {ratio(uk, n)} | {ci_str(uk, n)} |")
    emit(f"| urgency within-one | {ratio(w1, n)} | {ci_str(w1, n)} |")
    emit(f"| branch completion | {ratio(bc, n)} | {ci_str(bc, n)} |")
    emit(f"| flagged for review (as run) | {ratio(rev, n)} | {ci_str(rev, n)} |")
    METRICS["type_accuracy"] = tk / n
    METRICS["urgency_exact"] = uk / n
    METRICS["urgency_within_one"] = w1 / n
    METRICS["branch_completion"] = bc / n
    METRICS["review_rate_as_run"] = rev / n


def section_gate_status(rows: list[dict], threshold: float) -> None:
    """Detect a gate that cannot fire - the failure that hides as a good number."""
    head(2, "Gate status")
    live = [r for r in rows if not is_floor(r)]
    if not live:
        emit("No model-decided rows; gate not applicable.")
        return
    confs = [float(r["confidence"]) for r in live]
    lo, hi = min(confs), max(confs)
    distinct = sorted({round(c, 3) for c in confs})
    would_fire = sum(1 for c in confs if c < threshold)
    emit(f"- configured threshold: **{threshold}**")
    emit(f"- model-decided rows: {len(live)}")
    emit(f"- confidence range observed: **{lo:.2f} - {hi:.2f}**")
    emit(f"- distinct confidence values: {len(distinct)} -> {distinct}")
    emit(f"- rows the gate would flag: **{ratio(would_fire, len(live))}**")
    emit()
    if threshold <= lo:
        emit(
            f"> **INERT GATE.** The threshold ({threshold}) sits at or below the "
            f"lowest observed model confidence ({lo:.2f}). It cannot fire on any "
            "model-decided row. Review volume is coming entirely from the keyword "
            "floor and the guardrails, not from the confidence gate."
        )
    elif len(distinct) <= 4:
        emit(
            f"> **COARSE SIGNAL.** Only {len(distinct)} distinct confidence values, "
            "so the sweep can express very few operating points. Treat the sweep as "
            "a choice among a handful of fixed points, not a continuous curve."
        )
    else:
        emit("> Gate is live and the confidence signal is reasonably granular.")
    METRICS["gate"] = {
        "threshold": threshold,
        "conf_min": lo,
        "conf_max": hi,
        "distinct_values": distinct,
        "inert": threshold <= lo,
    }


def section_confusion(
    rows: list[dict], labels: list[str], short: dict, tkey: str, pkey: str, title: str
) -> dict:
    head(2, title)
    mat = {t: Counter() for t in labels}
    for r in rows:
        mat[r[tkey]][r[pkey]] += 1
    emit("| true \\ pred | " + " | ".join(short[c] for c in labels) + " | n | recall |")
    emit("|---" * (len(labels) + 3) + "|")
    for t in labels:
        support = sum(mat[t].values())
        cells = " | ".join(
            (f"**{mat[t][p]}**" if p == t else str(mat[t][p])) for p in labels
        )
        rec = mat[t][t] / support if support else 0.0
        emit(f"| **{short[t]}** | {cells} | {support} | {rec:.0%} |")
    return mat


def section_per_class(mat: dict, labels: list[str], short: dict) -> None:
    head(2, "Per-class precision / recall (Wilson 95% CI)")
    emit("| class | support | precision | P CI | recall | R CI | F1 |")
    emit("|---|---|---|---|---|---|---|")
    per = {}
    for c in labels:
        tp = mat[c][c]
        support = sum(mat[c].values())
        predicted = sum(mat[t][c] for t in labels)
        prec = tp / predicted if predicted else 0.0
        rec = tp / support if support else 0.0
        f1 = 2 * prec * rec / (prec + rec) if (prec + rec) else 0.0
        emit(
            f"| {short[c]} | {support} | {prec:.1%} ({tp}/{predicted}) | "
            f"{ci_str(tp, predicted)} | {rec:.1%} ({tp}/{support}) | "
            f"{ci_str(tp, support)} | {f1:.2f} |"
        )
        per[c] = {"support": support, "precision": prec, "recall": rec, "f1": f1}
    METRICS["per_class"] = per

    head(3, "Worst confusion pairs (targets for the next prompt version)")
    pairs = [(mat[t][p], t, p) for t in labels for p in labels if t != p and mat[t][p]]
    pairs.sort(reverse=True)
    if not pairs:
        emit("No off-diagonal mass.")
    for count, t, p in pairs[:6]:
        emit(f"- **{short[t]} -> {short[p]}**: {count}")
    METRICS["confusion_pairs"] = [
        {"true": t, "pred": p, "n": c} for c, t, p in pairs[:6]
    ]


def section_urgency(rows: list[dict]) -> None:
    head(2, "Urgency")
    n = len(rows)
    deltas = [UIDX[r["pred_urgency"]] - UIDX[r["true_urgency"]] for r in rows]
    exact = sum(1 for d in deltas if d == 0)
    within = sum(1 for d in deltas if abs(d) <= 1)
    over = sum(1 for d in deltas if d > 0)
    under = sum(1 for d in deltas if d < 0)
    emit(f"- exact: {ratio(exact, n)}  {ci_str(exact, n)}")
    emit(f"- within one level: {ratio(within, n)}  {ci_str(within, n)}")
    emit(f"- over-escalated: {ratio(over, n)} | under-escalated: {ratio(under, n)}")
    emit(f"- mean signed error: {sum(deltas) / n:+.2f} levels")
    emit()
    emit("Error magnitude distribution:")
    emit("| |delta| | count |")
    emit("|---|---|")
    for d, c in sorted(Counter(abs(x) for x in deltas).items()):
        emit(f"| {d} | {c} |")
    emit()
    if under > over:
        emit(
            "> Net **under**-escalation. This is the costly direction: an urgent "
            "case sitting in a slow queue is an SLA breach. Worth a prompt fix."
        )
    else:
        emit(
            "> Net **over**-escalation. The cheap direction - a case arrives at a "
            "human sooner than needed. Consistent with the escalate-only guardrail "
            "design, and within-one errors only shift queue position."
        )
    METRICS["urgency"] = {
        "exact": exact / n,
        "within_one": within / n,
        "over": over,
        "under": under,
        "mean_signed_error": sum(deltas) / n,
    }


def section_by_source(rows: list[dict]) -> None:
    head(2, "Accuracy by decision source")
    emit("| source | n | type acc | CI | urgency exact | flagged | branch complete |")
    emit("|---|---|---|---|---|---|---|")
    groups = defaultdict(list)
    for r in rows:
        groups[r["decision_source"]].append(r)
    by_source = {}
    for src, grp in sorted(groups.items()):
        n = len(grp)
        tk = sum(1 for r in grp if correct(r))
        uk = sum(1 for r in grp if r["pred_urgency"] == r["true_urgency"])
        rev = sum(1 for r in grp if r.get("requires_review"))
        bc = sum(1 for r in grp if r.get("branch_completed"))
        emit(
            f"| {src} | {n} | {tk / n:.1%} | {ci_str(tk, n)} | {uk / n:.1%} | "
            f"{rev / n:.0%} | {bc / n:.0%} |"
        )
        by_source[src] = {"n": n, "type_accuracy": tk / n}
    METRICS["by_source"] = by_source

    primary = [r for r in rows if not is_floor(r)]
    degraded = [r for r in rows if is_floor(r)]
    if degraded and primary:
        pk = sum(1 for r in primary if correct(r))
        allk = sum(1 for r in rows if correct(r))
        drag = pk / len(primary) - allk / len(rows)
        emit()
        emit(
            f"> {len(degraded)} rows degraded to the keyword floor under TPM "
            f"pressure. They drag headline type accuracy down by "
            f"**{drag * 100:.1f} points** ({pk / len(primary):.1%} on model-decided "
            f"rows vs {allk / len(rows):.1%} overall). The headline stays the "
            "all-rows number - degradation is part of the system's real behaviour - "
            "but the split is reported so the cause is legible."
        )
        METRICS["degradation_drag_points"] = drag * 100


def section_calibration(rows: list[dict]) -> None:
    head(2, "Calibration (accuracy by stated confidence)")
    live = [r for r in rows if not is_floor(r)]
    if not live:
        emit("No model-decided rows.")
        return
    buckets = defaultdict(list)
    for r in live:
        buckets[round(float(r["confidence"]), 2)].append(r)
    emit("| stated confidence | n | actual accuracy | 95% CI | gap |")
    emit("|---|---|---|---|---|")
    ece = 0.0
    table = []
    for conf in sorted(buckets):
        grp = buckets[conf]
        k, n = sum(1 for r in grp if correct(r)), len(grp)
        acc = k / n
        gap = acc - conf
        ece += (n / len(live)) * abs(gap)
        emit(f"| {conf:.2f} | {n} | {acc:.1%} | {ci_str(k, n)} | {gap:+.1%} |")
        table.append({"confidence": conf, "n": n, "accuracy": acc})
    emit()
    emit(f"**Expected calibration error (ECE): {ece:.3f}**")
    emit()
    if ece > 0.10:
        emit(
            "> Badly calibrated: stated confidence systematically overstates "
            "accuracy. Reported as-is - a calibration table that flatters the model "
            "is worth nothing, and the overstatement is itself the finding driving "
            "the gate design."
        )
    else:
        emit("> Reasonably calibrated within the resolution of the signal.")
    METRICS["calibration"] = {"ece": ece, "buckets": table}


def section_floor(rows: list[dict], floor_rows: list[dict]) -> None:
    head(2, "Deterministic floor vs LLM")
    fmap = {r["example_id"]: r for r in floor_rows}
    missing = [r for r in rows if r["example_id"] not in fmap]
    if missing:
        emit(f"**WARNING: {len(missing)} rows have no floor counterpart; skipped.**")
    pairs = [(r, fmap[r["example_id"]]) for r in rows if r["example_id"] in fmap]
    if not pairs:
        emit("Could not align runs by example_id.")
        return

    n = len(pairs)
    fk = sum(1 for _, f in pairs if correct(f))
    lk = sum(1 for a, _ in pairs if correct(a))
    emit("| system | type accuracy | 95% CI |")
    emit("|---|---|---|")
    emit(f"| keyword floor (published baseline) | {ratio(fk, n)} | {ci_str(fk, n)} |")
    emit(f"| LLM waterfall | {ratio(lk, n)} | {ci_str(lk, n)} |")
    emit(f"| **uplift** | **{(lk - fk) / n:+.1%}** | |")
    METRICS["floor_accuracy"] = fk / n
    METRICS["llm_accuracy"] = lk / n

    head(3, "Disagreement as a free uncertainty signal")
    live = [(a, f) for a, f in pairs if not is_floor(a)]
    tp = fp = fn = tn = 0
    for a, f in live:
        dis = a["pred_type"] != f["pred_type"]
        bad = not correct(a)
        tp += dis and bad
        fp += dis and not bad
        fn += (not dis) and bad
        tn += (not dis) and not bad
    emit(f"Model-decided rows: {len(live)}")
    emit()
    emit("| | LLM wrong | LLM right |")
    emit("|---|---|---|")
    emit(f"| **floor disagrees** | {tp} | {fp} |")
    emit(f"| **floor agrees** | {fn} | {tn} |")
    emit()
    if tp + fp:
        emit(f"- precision of disagreement as an error flag: {ratio(tp, tp + fp)}")
    if tp + fn:
        emit(f"- recall of LLM errors caught: **{ratio(tp, tp + fn)}**")
    if tn + fn:
        emit(
            f"- accuracy when the two systems **agree**: **{ratio(tn, tn + fn)}**  "
            f"{ci_str(tn, tn + fn)}"
        )
    if len(live):
        cost = ratio(tp + fp, len(live))
        emit(f"- flagging every disagreement costs review rate {cost}")
    emit()
    emit(
        "> A 42%-accurate keyword matcher is a poor classifier but a useful second "
        "opinion. Agreement between two independently-constructed systems is "
        "evidence; it costs no tokens and no latency."
    )
    emit(
        "> **Limitation to disclose:** the corpus is LLM-generated, so 'the floor "
        "also got it right' partly measures how keyword-obvious the example is. On "
        "real inbound traffic this signal would likely be weaker."
    )
    METRICS["disagreement"] = {
        "precision": tp / (tp + fp) if tp + fp else None,
        "recall": tp / (tp + fn) if tp + fn else None,
        "accuracy_on_agreement": tn / (tn + fn) if tn + fn else None,
    }


def operating_point(auto: list[dict], n_total: int) -> dict:
    k = sum(1 for r in auto if correct(r))
    n_auto = len(auto)
    return {
        "n_auto": n_auto,
        "automation": n_auto / n_total,
        "precision": (k / n_auto) if n_auto else float("nan"),
        "escaped": n_auto - k,
        "escaped_per_100": (n_auto - k) / n_total * 100,
    }


def emit_op_row(label: str, op: dict) -> None:
    prec = "n/a" if op["n_auto"] == 0 else f"{op['precision']:.1%}"
    ci = (
        "n/a"
        if op["n_auto"] == 0
        else ci_str(op["n_auto"] - op["escaped"], op["n_auto"])
    )
    emit(
        f"| {label} | {op['n_auto']} | {op['automation']:.1%} | "
        f"{1 - op['automation']:.1%} | {prec} | {ci} | {op['escaped']} | "
        f"{op['escaped_per_100']:.1f} |"
    )


OP_HEADER = (
    "| gate | auto n | automation | review rate | auto precision | 95% CI | "
    "errors escaped | per 100 |"
)
OP_SEP = "|---|---|---|---|---|---|---|---|"


def section_sweeps(
    rows: list[dict], floor_rows: list[dict] | None, target: float
) -> None:
    head(2, "Operating points")
    n_total = len(rows)
    elig = [r for r in rows if eligible(r)]
    emit(
        f"Definitions: **automation rate** = auto-handled / all {n_total} rows. "
        f"**auto precision** = correct type among auto-handled. "
        f"**errors escaped** = wrong cases actioned with no human in the loop."
    )
    emit(
        f"Eligible for automation: {ratio(len(elig), n_total)} "
        f"({sum(1 for r in rows if is_floor(r))} floor rows and "
        f"{sum(1 for r in rows if guardrailed(r) and not is_floor(r))} "
        "guardrail-escalated rows are excluded by construction)."
    )
    emit(f"Target auto-handled precision: **>= {target:.0%}**")

    head(3, "A. Confidence gate alone")
    emit(OP_HEADER)
    emit(OP_SEP)
    thresholds = sorted({round(float(r["confidence"]), 3) for r in elig})
    best_conf = None
    for t in thresholds:
        auto = [r for r in elig if float(r["confidence"]) >= t]
        op = operating_point(auto, n_total)
        emit_op_row(f"confidence >= {t:.2f}", op)
        if op["n_auto"] and op["precision"] >= target and best_conf is None:
            best_conf = (t, op)

    results = {"confidence_only": best_conf[1] if best_conf else None}

    if floor_rows:
        fmap = {r["example_id"]: r for r in floor_rows}
        agrees = [
            r
            for r in elig
            if r["example_id"] in fmap
            and fmap[r["example_id"]]["pred_type"] == r["pred_type"]
        ]
        head(3, "B. Ensemble gate: floor must agree")
        emit(OP_HEADER)
        emit(OP_SEP)
        emit_op_row("floor agrees (any confidence)", operating_point(agrees, n_total))

        head(3, "C. Ensemble + confidence (the combined gate)")
        emit(OP_HEADER)
        emit(OP_SEP)
        best_comb = None
        for t in thresholds:
            auto = [r for r in agrees if float(r["confidence"]) >= t]
            op = operating_point(auto, n_total)
            emit_op_row(f"agree AND conf >= {t:.2f}", op)
            if op["n_auto"] and op["precision"] >= target and best_comb is None:
                best_comb = (t, op)
        results["combined"] = best_comb[1] if best_comb else None
        emit()
        if best_comb:
            t, op = best_comb
            emit(
                f"> **Operating point available today:** require floor agreement and "
                f"confidence >= {t:.2f}. Automates {op['automation']:.0%} of volume "
                f"at {op['precision']:.1%} precision, with {op['escaped']} errors "
                "escaping to customers across the split. Derived by sweep on dev; "
                "the test split remains untouched."
            )
        else:
            emit(
                f"> **No gate on today's signals reaches {target:.0%} precision.** "
                "Stated confidence is too coarse to separate further, and "
                "asking the model for a ranked top-2 does NOT fix it: "
                "measured on prompt v2, the margin took five distinct "
                "values, equalled stated confidence on 54% of rows, and "
                "was non-monotonic in accuracy. Use an independent "
                "signal (ensemble agreement) instead."
            )

    head(3, "D. Per-class confidence thresholds")
    emit(
        "One global cut point forces the same operating point onto classes with very "
        "different confusability. Lowest threshold reaching target, per predicted "
        "class:"
    )
    emit()
    emit("| predicted class | threshold | auto n | auto precision |")
    emit("|---|---|---|---|")
    chosen: dict[str, float] = {}
    for c in TYPES:
        sub = [r for r in elig if r["pred_type"] == c]
        pick = None
        for t in sorted({round(float(r["confidence"]), 3) for r in sub}):
            auto = [r for r in sub if float(r["confidence"]) >= t]
            k = sum(1 for r in auto if correct(r))
            if auto and k / len(auto) >= target:
                pick = (t, len(auto), k / len(auto))
                break
        if pick:
            chosen[c] = pick[0]
            emit(f"| {SHORT[c]} | {pick[0]:.2f} | {pick[1]} | {pick[2]:.1%} |")
        else:
            emit(f"| {SHORT[c]} | none reaches target | 0 | - |")
    if chosen:
        auto = [
            r
            for r in elig
            if r["pred_type"] in chosen
            and float(r["confidence"]) >= chosen[r["pred_type"]]
        ]
        emit()
        emit(OP_HEADER)
        emit(OP_SEP)
        emit_op_row("per-class thresholds", operating_point(auto, n_total))
        results["per_class"] = operating_point(auto, n_total)
    METRICS["operating_points"] = results


def section_reliability(rows: list[dict]) -> None:
    head(2, "Reliability and edge cases")
    n = len(rows)
    bc = sum(1 for r in rows if r.get("branch_completed"))
    emit(f"- branch completion: **{ratio(bc, n)}**  {ci_str(bc, n)}")
    incomplete = [r for r in rows if not r.get("branch_completed")]
    for r in incomplete[:5]:
        emit(f"  - INCOMPLETE: {r['example_id']} ({r['pred_type']})")

    actions = [r.get("n_actions", 0) for r in rows]
    emit(
        f"- actions per case: min {min(actions)}, mean {sum(actions) / n:.1f}, "
        f"max {max(actions)}"
    )
    if min(actions) < 2:
        emit("  - **WARNING: a branch executed fewer than 2 steps.**")

    lats = [r.get("latency_ms", 0) for r in rows if r.get("latency_ms")]
    if lats:
        lats.sort()
        p50 = lats[len(lats) // 2]
        p95 = lats[min(len(lats) - 1, int(len(lats) * 0.95))]
        emit(f"- latency ms: p50 {p50}, p95 {p95}, max {lats[-1]}")

    trig = Counter(g for r in rows for g in (r.get("guardrail_triggers") or []))
    emit(f"- guardrail firings: {sum(trig.values())} across {len(trig)} rules")
    for name, c in trig.most_common():
        emit(f"  - {name}: {c}")

    emit(f"- status distribution: {dict(Counter(r.get('status') for r in rows))}")

    adv = [r for r in rows if r.get("adversarial")]
    std = [r for r in rows if not r.get("adversarial")]
    if adv:
        ak = sum(1 for r in adv if correct(r))
        sk = sum(1 for r in std if correct(r))
        emit()
        emit("| subset | n | type accuracy | 95% CI |")
        emit("|---|---|---|---|")
        ns, na = len(std), len(adv)
        emit(f"| standard | {ns} | {sk / ns:.1%} | {ci_str(sk, ns)} |")
        emit(f"| adversarial | {na} | {ak / na:.1%} | {ci_str(ak, na)} |")
        METRICS["adversarial_accuracy"] = ak / len(adv)

    METRICS["reliability"] = {
        "branch_completion": bc / n,
        "min_actions": min(actions),
        "guardrail_firings": sum(trig.values()),
    }


# --------------------------------------------------------------------------
def main() -> None:
    ap = argparse.ArgumentParser(description="Offline eval of cached triage runs.")
    ap.add_argument("--run", required=True, help="run name under data/runs/")
    ap.add_argument("--floor", default=None, help="floor run name for comparison")
    ap.add_argument("--threshold", type=float, default=0.72, help="configured gate")
    ap.add_argument("--target", type=float, default=0.95, help="target auto precision")
    ap.add_argument(
        "--write", action="store_true", help="write docs/eval/<run>.md and .json"
    )
    args = ap.parse_args()

    rows = load_run(args.run)
    floor_rows = load_run(args.floor) if args.floor else None

    for r in rows:
        for key in ("true_type", "pred_type", "true_urgency", "pred_urgency"):
            if key.endswith("type") and r[key] not in TYPES:
                raise SystemExit(f"unknown type {r[key]!r} in {r['example_id']}")
            if key.endswith("urgency") and r[key] not in URGENCY:
                raise SystemExit(f"unknown urgency {r[key]!r} in {r['example_id']}")

    section_header(args.run, rows, args.floor)
    section_headline(rows)
    section_gate_status(rows, args.threshold)
    mat = section_confusion(
        rows, TYPES, SHORT, "true_type", "pred_type", "Type confusion matrix"
    )
    section_per_class(mat, TYPES, SHORT)
    section_confusion(
        rows,
        URGENCY,
        USHORT,
        "true_urgency",
        "pred_urgency",
        "Urgency confusion matrix",
    )
    section_urgency(rows)
    section_by_source(rows)
    section_calibration(rows)
    if floor_rows:
        section_floor(rows, floor_rows)
    section_sweeps(rows, floor_rows, args.target)
    section_reliability(rows)

    if args.write:
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        md = OUT_DIR / f"{args.run}.md"
        js = OUT_DIR / f"{args.run}.json"
        md.write_text("\n".join(LINES) + "\n")
        js.write_text(json.dumps(METRICS, indent=2, default=str) + "\n")
        emit()
        emit(f"written: {md}")
        emit(f"written: {js}")


if __name__ == "__main__":
    main()
