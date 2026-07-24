#!/usr/bin/env python3
"""
Verify the v1 prompt restore is byte-identical, behaviourally.

Replays 5 cached dev examples through the live pipeline and compares the
model's PROPOSAL (proposal_type / proposal_urgency / confidence) against the
cached v1 run. Costs 5 bulk-tier API calls.

Why the proposal and not the final decision: the cached run was produced
under the old guardrail config, and the tier-1 phrase list has since been
expanded - so the final pred_type can legitimately differ on replay (a
guardrail now fires where it didn't). The proposal is what the prompt bytes
determine; that is the thing being verified.

5/5 match  -> restore is byte-identical; corpus_dev_bulk.jsonl remains a
              valid measurement of the live prompt.
4/5        -> likely provider nondeterminism at temperature 0.0; rerun once
              before concluding the prompt text differs.
<4         -> the restored prompt text differs from the original. Diff it.

Run from the repo root:
    python3 scripts/diag/verify_v1_restore.py
"""

import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT / ".env")

from triage.classifier import PROMPT_VERSION, classify  # noqa: E402
from triage.config import load_config  # noqa: E402
from triage.llm import Tier, build_waterfall  # noqa: E402
from triage.schemas import LabelledExample  # noqa: E402


def main():
    assert PROMPT_VERSION == "v1", f"expected v1, live is {PROMPT_VERSION}"

    cached = {}
    with open(ROOT / "data" / "runs" / "corpus_dev_bulk.jsonl") as fh:
        for line in fh:
            if line.strip():
                r = json.loads(line)
                cached[r["example_id"]] = r

    corpus = {}
    with open(ROOT / "data" / "corpus" / "corpus.jsonl") as fh:
        for line in fh:
            if line.strip():
                e = LabelledExample.model_validate_json(line)
                corpus[e.example_id] = e

    pick = [
        eid
        for eid, r in cached.items()
        if r["decision_source"] == "llm_primary" and eid in corpus
    ][:5]
    assert len(pick) == 5, f"only {len(pick)} usable cached examples"

    cfg = load_config()
    wf = build_waterfall(Tier("bulk"))

    same = 0
    for eid in pick:
        c = classify(corpus[eid].to_request(), cfg, wf)
        old = cached[eid]
        prop = c.llm_proposal
        if prop is None:
            print(
                f"  {eid}: replay degraded to floor - rerun (quota/TPM), "
                "not a prompt mismatch"
            )
            continue
        hit = (
            prop.request_type.value == old["proposal_type"]
            and prop.urgency.value == old["proposal_urgency"]
            and abs(prop.confidence - old["confidence"]) < 1e-9
        )
        same += hit
        print(
            f"  {eid}: cached={old['proposal_type']}/{old['proposal_urgency']}"
            f"/{old['confidence']}  "
            f"now={prop.request_type.value}/{prop.urgency.value}"
            f"/{prop.confidence}  {'MATCH' if hit else 'DIFFER'}"
        )

    print(f"\n{same}/5 reproduce the cached v1 proposals")
    if same == 5:
        print("RESTORE VERIFIED: dev numbers stand for the live prompt")
    elif same == 4:
        print("LIKELY NONDETERMINISM: rerun once before concluding a mismatch")
    else:
        print("!! PROMPT TEXT LIKELY DIFFERS - do not trust cached numbers yet")


if __name__ == "__main__":
    main()
