#!/usr/bin/env python3
"""
Behavioural tests for review policy v3 (per-model auto-gates).

Replaces the /tmp/test_policy.py suite, which assumed a single global policy;
under v3 an unknown model never auto-handles, so those tests fail by design.

Zero API calls: the waterfall is faked, the floor and guardrails run real.

Run from the repo root:
    python3 scripts/diag/test_policy_v3.py
"""

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from triage.classifier import classify  # noqa: E402
from triage.config import load_config  # noqa: E402
from triage.schemas import Channel, IncomingRequest  # noqa: E402

M70 = "llama-3.3-70b-versatile"
M8 = "llama-3.1-8b-instant"

BILLING_TEXT = "I dispute this fee, I was overcharged and want a refund."
ENQUIRY_TEXT = (
    "Could you tell me your current rates? I'm interested in information "
    "about your terms and conditions."
)
# Floor reads hardship (3 hits: difficult to pay / behind on / hardship)
# over billing (2: refund / fee), while dodging every guardrail phrase.
HIDDEN_HARDSHIP = (
    "It's been difficult to pay and I'm behind on things lately, which is "
    "causing hardship - please refund the fee you charged."
)


class FakeResp:
    degraded, latency_ms = False, 1

    def __init__(self, payload, model):
        self._p, self.model = payload, model

    def json(self):
        return self._p


class FakeWF:
    def __init__(self, payload, model):
        self._p, self._m = payload, model

    def complete(self, *a, **k):
        return FakeResp(self._p, self._m)


def run(cfg, body, model, rt, conf, sec=None):
    req = IncomingRequest(
        channel=Channel.SHARED_INBOX,
        sender="t@example.com",
        subject="Test",
        body=body,
    )
    wf = FakeWF(
        {
            "request_type": rt,
            "urgency": "low",
            "confidence": conf,
            "rationale": "test",
            "secondary_type": sec,
            "entities": {},
        },
        model,
    )
    return classify(req, cfg, wf)


def main():
    cfg = load_config()
    assert cfg.auto_policy_for(M70)["kind"] == "per_class"
    assert cfg.auto_policy_for(M8)["kind"] == "ensemble"
    assert cfg.auto_policy_for("gpt-oss-nonexistent") is None
    print("P PASS: policies load; unknown model has none")

    c = run(cfg, BILLING_TEXT, M70, "billing_dispute", 0.90)
    assert not c.requires_human_review, f"A FAIL: {c.review_reason}"
    print("A PASS: 70B billing at 0.90 auto-handles (derived class gate)")

    c = run(cfg, BILLING_TEXT, M70, "billing_dispute", 0.80)
    assert (
        c.requires_human_review and "class gate" in c.review_reason
    ), f"B FAIL: {c.review_reason}"
    print("B PASS: 70B billing below the class gate is reviewed")

    c = run(cfg, ENQUIRY_TEXT, M70, "general_enquiry", 1.00)
    assert (
        c.requires_human_review and "no derived auto-gate" in c.review_reason
    ), f"C FAIL: {c.review_reason}"
    print("C PASS: 70B enquiry reviewed even at 1.00 - class failed the bar")

    c = run(cfg, HIDDEN_HARDSHIP, M70, "billing_dispute", 0.90)
    assert (
        c.requires_human_review and "hardship" in c.review_reason.lower()
    ), f"D FAIL: {c.review_reason}"
    print("D PASS: hardship second opinion overrides a passing class gate")

    c = run(cfg, BILLING_TEXT, M8, "billing_dispute", 1.00)
    assert not c.requires_human_review, f"E FAIL: {c.review_reason}"
    print("E PASS: 8B auto-handles on floor agreement at 1.00")

    c = run(cfg, BILLING_TEXT, M8, "billing_dispute", 0.90)
    assert (
        c.requires_human_review and "ensemble gate" in c.review_reason
    ), f"F FAIL: {c.review_reason}"
    print("F PASS: 8B below the ensemble gate is reviewed")

    c = run(cfg, ENQUIRY_TEXT, M8, "billing_dispute", 1.00)
    assert (
        c.requires_human_review and "disagreement" in c.review_reason
    ), f"G FAIL: {c.review_reason}"
    print("G PASS: 8B floor disagreement is reviewed (rule kept on this tier)")

    c = run(cfg, BILLING_TEXT, "mystery-model-v9", "billing_dispute", 1.00)
    assert (
        c.requires_human_review and "no auto-handling policy" in c.review_reason
    ), f"H FAIL: {c.review_reason}"
    print("H PASS: unknown model never auto-handles")

    c = classify(
        IncomingRequest(
            channel=Channel.SHARED_INBOX,
            sender="t@example.com",
            subject="Rates",
            body=ENQUIRY_TEXT,
        ),
        cfg,
        None,
    )
    assert c.requires_human_review, "I FAIL"
    print("I PASS: keyword floor still never auto-resolves")

    print("\nALL POLICY V3 CHECKS PASS")


if __name__ == "__main__":
    main()
