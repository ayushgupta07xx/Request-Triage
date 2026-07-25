#!/usr/bin/env python3
"""Build data/samples/ — one real end-to-end example per branch.

The brief asks for "sample input requests (one per branch type) and
corresponding output screenshots or logs". Rather than write fresh inputs by
hand, this lifts real cases out of the committed batch export, so every sample
carries provenance: a corpus label, the model's proposal, and the system's
final decision, kept as three separate facts.

Zero API calls. Reads only files already in the repo.

    python3 scripts/make_samples.py

Writes:
    data/samples/inputs.jsonl        5 inputs in corpus shape (re-runnable)
    data/samples/<n>_<branch>.md     input -> decision -> trace -> artifacts
    data/samples/README.md           index
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXPORT = ROOT / "web/public/demo-dev200.json"
CORPUS = [ROOT / "data/corpus/corpus.jsonl", ROOT / "data/corpus/adversarial.jsonl"]
OUT = ROOT / "data/samples"

BRANCHES = [
    "billing_dispute",
    "general_enquiry",
    "service_request",
    "financial_hardship",
    "other",
]


def load_corpus() -> dict[tuple[str, str], dict]:
    index: dict[tuple[str, str], dict] = {}
    for path in CORPUS:
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            row = json.loads(line)
            index[(row.get("subject", ""), row.get("body", ""))] = row
    return index


def score(case: dict, branch: str) -> tuple:
    """Rank candidates so the most instructive case per branch wins."""
    trace = case.get("trace") or []
    actions = {s.get("action") for s in trace}
    artifacts = sum(1 for s in trace if s.get("artifact"))
    guards = bool(case.get("guardrail_triggers"))
    proposal = case.get("proposal") or {}
    overridden = guards and proposal.get("request_type") != case.get("request_type")
    source = (case.get("decision_source") or "").lower()

    if branch == "financial_hardship":
        primary = (overridden, guards, "pause_automation" in actions)
    elif branch == "general_enquiry":
        grounded = any(
            s.get("action") == "generate_response" and s.get("artifact") for s in trace
        )
        primary = (case.get("status") == "auto_resolved", grounded)
    elif branch == "billing_dispute":
        primary = ("suppress_collections" in actions,)
    elif branch == "service_request":
        primary = ("floor" in source, "start_sla_timer" in actions)
    else:
        primary = (bool(case.get("entities")),)

    return (*(1 if p else 0 for p in primary), artifacts, len(trace))


def render(case: dict, truth: dict, n: int, branch: str) -> str:
    proposal = case.get("proposal") or {}
    guards = case.get("guardrail_triggers") or []
    L: list[str] = []
    a = L.append

    a(f"# Sample {n} — `{branch}`")
    a("")
    a(
        "Lifted verbatim from `web/public/demo-dev200.json`, the committed "
        "development batch. Nothing here was written by hand."
    )
    a("")
    a("## Input")
    a("")
    a(f"- **channel** `{case.get('channel')}`")
    a(f"- **from** `{case.get('sender')}`")
    a(f"- **subject** {case.get('subject')}")
    a("")
    a("```text")
    a((case.get("body") or "").strip())
    a("```")
    a("")
    a("## Corpus label (ground truth)")
    a("")
    a(
        f"`{truth.get('true_type')}` / `{truth.get('true_urgency')}`"
        f"   ·   example `{truth.get('example_id')}`"
        + ("   ·   adversarial" if str(truth.get("adversarial")) == "True" else "")
    )
    a("")
    a("## What the model proposed")
    a("")
    a(
        f"`{proposal.get('request_type')}` / `{proposal.get('urgency')}`"
        f"   ·   confidence `{proposal.get('confidence')}`"
        + (
            f"   ·   secondary `{proposal.get('secondary_type')}`"
            if proposal.get("secondary_type")
            else ""
        )
    )
    a("")
    a("## What the system decided")
    a("")
    a(f"- **type / urgency** `{case.get('request_type')}` / `{case.get('urgency')}`")
    a(f"- **confidence** `{case.get('confidence')}`")
    a(f"- **decided by** `{case.get('decision_source')}`")
    a("- **guardrails fired** " + (f"`{', '.join(guards)}`" if guards else "none"))
    a(f"- **status** `{case.get('status')}`")
    a(
        f"- **needs a human** `{case.get('requires_review')}`"
        + (f" — {case.get('review_reason')}" if case.get("review_reason") else "")
    )
    if case.get("entities"):
        pairs = ", ".join(f"{k}={v}" for k, v in case["entities"].items())
        a(f"- **entities extracted** `{pairs}`")
    if case.get("sla_due_at"):
        a(
            f"- **SLA due** `{case.get('sla_due_at')}`"
            f" · breached `{case.get('sla_breached')}`"
        )
    a("")

    if guards and proposal.get("request_type") != case.get("request_type"):
        a(
            f"> The model proposed `{proposal.get('request_type')}`. The "
            f"`{', '.join(guards)}` guardrail overrode it to "
            f"`{case.get('request_type')}`. Guardrails escalate only — they can "
            "never reduce the severity the model assigned."
        )
        a("")

    LADDER = ["low", "medium", "high", "critical"]
    tu, du = truth.get("true_urgency"), case.get("urgency")
    if tu in LADDER and du in LADDER and tu != du:
        gap = abs(LADDER.index(tu) - LADDER.index(du))
        if gap == 1:
            a(
                f"> Urgency differs from the corpus label by one level "
                f"(`{tu}` vs `{du}`). Adjacent urgency only shifts queue "
                "position; the branch and its steps are unchanged. This is the "
                "91%-within-one figure in practice."
            )
            a("")

    if case.get("rationale"):
        a("**Model's stated rationale.** " + str(case["rationale"]).strip())
        a("")

    a(f"## Steps executed ({case.get('n_actions')})")
    a("")
    for i, step in enumerate(case.get("trace") or [], 1):
        bits = [f"**{i}. `{step.get('action')}`** — {step.get('outcome')}"]
        if step.get("summary"):
            bits.append(f"  \n   {step['summary']}")
        if step.get("target"):
            bits.append(f"  \n   routed to: `{step['target']}`")
        if step.get("due_at"):
            bits.append(f"  \n   due: `{step['due_at']}`")
        if step.get("error"):
            bits.append(f"  \n   error: `{step['error']}`")
        a("".join(bits))
    a("")

    outputs = [s for s in (case.get("trace") or []) if s.get("artifact")]
    if outputs:
        a("## Generated outputs")
        a("")
        for step in outputs:
            a(f"**from `{step['action']}`**")
            a("")
            a("```text")
            a(str(step["artifact"]).strip())
            a("```")
            a("")

    a("---")
    a("")
    a(
        f"Model `{case.get('model_name')}` · prompt `{case.get('prompt_version')}` "
        f"· {case.get('latency_ms')} ms · case `{case.get('case_id')}`"
    )
    return "\n".join(L) + "\n"


def main() -> int:
    if not EXPORT.exists():
        print(f"missing {EXPORT}", file=sys.stderr)
        return 1
    cases = json.loads(EXPORT.read_text(encoding="utf-8"))["cases"]
    corpus = load_corpus()
    if not corpus:
        print("no corpus files found under data/corpus/", file=sys.stderr)
        return 1

    OUT.mkdir(parents=True, exist_ok=True)
    chosen: list[tuple[str, dict, dict]] = []
    problems: list[str] = []

    for branch in BRANCHES:
        pool = [
            c for c in cases if (c.get("branch") or c.get("request_type")) == branch
        ]
        if not pool:
            problems.append(f"{branch}: no cases in the export")
            continue

        # A sample for branch X must be a case the system got RIGHT: its corpus
        # label has to be X. Otherwise the exemplar for a branch would be a
        # misclassification, which misrepresents the branch it illustrates.
        # Misclassifications are characterised in docs/eval/, not here.
        matched, correct = 0, []
        for case in pool:
            truth = corpus.get((case.get("subject", ""), case.get("body", "")))
            if not truth:
                continue
            matched += 1
            if truth.get("true_type") == branch:
                correct.append((case, truth))
        print(
            f"  {branch}: {len(pool)} in branch, {matched} matched to corpus, "
            f"{len(correct)} correctly classified"
        )
        if not correct:
            problems.append(
                f"{branch}: no correctly-classified case matched a corpus row"
            )
            continue
        case, truth = max(correct, key=lambda ct: score(ct[0], branch))
        chosen.append((branch, case, truth))

    if problems:
        print("ABORTED — nothing written:", file=sys.stderr)
        for p in problems:
            print("  " + p, file=sys.stderr)
        return 1

    inputs = []
    index_rows = []
    for n, (branch, case, truth) in enumerate(chosen, 1):
        name = f"{n}_{branch}.md"
        (OUT / name).write_text(render(case, truth, n, branch), encoding="utf-8")
        inputs.append(
            {
                "example_id": truth.get("example_id"),
                "channel": case.get("channel"),
                "sender": case.get("sender"),
                "subject": case.get("subject"),
                "body": case.get("body"),
                "true_type": truth.get("true_type"),
                "true_urgency": truth.get("true_urgency"),
            }
        )
        guards = case.get("guardrail_triggers") or []
        index_rows.append(
            f"| `{branch}` | [{name}]({name}) | `{case.get('status')}` | "
            f"`{case.get('decision_source')}` | "
            + (f"`{', '.join(guards)}`" if guards else "—")
            + f" | {case.get('n_actions')} |"
        )
        print(f"  wrote {name}  ({case.get('status')}, {case.get('n_actions')} steps)")

    (OUT / "inputs.jsonl").write_text(
        "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in inputs),
        encoding="utf-8",
    )

    readme = [
        "# Sample requests — one per branch",
        "",
        "One real request per branch, with the output the system actually produced.",
        "Every example is lifted from `web/public/demo-dev200.json` (the committed",
        "development batch) and matched back to its corpus row, so three things stay",
        "distinct: the corpus label, what the model proposed, and what the system",
        "decided. Regenerate with `python3 scripts/make_samples.py` — no API calls.",
        "",
        "**Selection rule.** Each branch is illustrated by a case whose corpus label",
        "matches that branch, so the example demonstrates the branch it belongs to.",
        "Misclassifications are not hidden — they are measured and characterised in",
        "`docs/eval/` (confusion matrix, per-class precision and recall) and in the",
        "README's limitations, including `service_request` acting as a sink class.",
        "",
        "| Branch | Walkthrough | Status | Decided by | Guardrails | Steps |",
        "| --- | --- | --- | --- | --- | --- |",
        *index_rows,
        "",
        "`inputs.jsonl` holds the five inputs alone, in the same shape as",
        "`data/corpus/`, so they can be fed straight back through the pipeline.",
        "",
    ]
    (OUT / "README.md").write_text("\n".join(readme), encoding="utf-8")
    print(f"  wrote inputs.jsonl and README.md into {OUT.relative_to(ROOT)}/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
