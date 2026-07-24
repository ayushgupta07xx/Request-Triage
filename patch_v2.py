#!/usr/bin/env python3
"""
Prompt v2 patch. Run from the repo root:

    cd /home/ayushgupta15062003/code/request-triage
    python3 patch_v2.py

Edits three files, every anchor asserted:
  triage/schemas.py    - alt_type / alt_confidence on the proposal and the
                         decision, plus a margin() helper on both
  triage/classifier.py - PROMPT_VERSION v2, cascade prompt, anchored urgency,
                         top-2 output; floor reports its runner-up class
  scripts/run_batch.py - capture review_reason, secondary_type, alt_type,
                         alt_confidence, margin, proposal_secondary

Does NOT gate on the margin. The threshold has not been swept, and wiring an
underived number is the mistake that produced the inert 0.72 gate. Capture,
sweep offline, then wire.
"""

import ast
import pathlib
import sys

REPO = pathlib.Path(__file__).resolve().parent
if not (REPO / "triage" / "classifier.py").exists():
    sys.exit(f"run this from the repo root; triage/ not found under {REPO}")


def patch(relpath, edits, post_asserts=()):
    p = REPO / relpath
    s = p.read_text()
    for tag, old, new in edits:
        n = s.count(old)
        assert n == 1, f"{relpath} ANCHOR {tag} FAIL: found {n} occurrences"
        s = s.replace(old, new)
    for tag, cond in post_asserts:
        assert cond(s), f"{relpath} POST-CHECK {tag} FAIL"
    ast.parse(s)
    p.write_text(s)
    print(f"  patched {relpath} ({len(edits)} anchors)")


# ---------------------------------------------------------------------------
# 1. schemas.py
# ---------------------------------------------------------------------------

S1_OLD = """    request_type: RequestType
    urgency: Urgency
    confidence: float = Field(ge=0.0, le=1.0)
    rationale: str = Field(max_length=600)
    entities: ExtractedEntities = Field(default_factory=ExtractedEntities)
    secondary_type: Optional[RequestType] = None

    @field_validator("secondary_type", mode="after")
    @classmethod
    def _secondary_must_differ(cls, v, info):
        if v is not None and v == info.data.get("request_type"):
            return None
        return v
"""

S1_NEW = '''    request_type: RequestType
    urgency: Urgency
    confidence: float = Field(ge=0.0, le=1.0)
    rationale: str = Field(max_length=600)
    entities: ExtractedEntities = Field(default_factory=ExtractedEntities)
    secondary_type: Optional[RequestType] = None

    # Prompt v2. The model's second-best label and its probability.
    #
    # Stated confidence took only three distinct values across 190 dev rows
    # (0.80, 0.90, 1.00), which is too coarse to express an operating point:
    # a sweep over it has three usable positions and nothing in between. The
    # margin between the top two labels is graded, so it can be swept.
    #
    # alt_type answers "what would you say if request_type were ruled out".
    # secondary_type answers "is a second, separate intent also present".
    # These are different questions and must not share a field: a
    # single-intent message can be a coin flip between two labels, and a
    # genuinely multi-intent message can be certain about both of them.
    alt_type: Optional[RequestType] = None
    alt_confidence: float = 0.0

    @field_validator("secondary_type", mode="after")
    @classmethod
    def _secondary_must_differ(cls, v, info):
        if v is not None and v == info.data.get("request_type"):
            return None
        return v

    @field_validator("alt_type", mode="after")
    @classmethod
    def _alt_must_differ(cls, v, info):
        if v is not None and v == info.data.get("request_type"):
            return None
        return v

    @field_validator("alt_confidence", mode="before")
    @classmethod
    def _clamp_alt_confidence(cls, v):
        # Clamped rather than rejected. A malformed secondary probability is
        # not a reason to discard an otherwise usable classification and push
        # the row down the degradation waterfall to the keyword floor; the
        # primary label and confidence are still trustworthy.
        try:
            return min(1.0, max(0.0, float(v)))
        except (TypeError, ValueError):
            return 0.0

    def margin(self) -> float:
        """Gap between the top and second label. Graded, unlike stated
        confidence, so a threshold sweep has real operating points."""
        return max(0.0, self.confidence - self.alt_confidence)
'''

S2_OLD = """    request_type: RequestType
    urgency: Urgency
    confidence: float = Field(ge=0.0, le=1.0)
    rationale: str
    entities: ExtractedEntities = Field(default_factory=ExtractedEntities)
    secondary_type: Optional[RequestType] = None

    decision_source: DecisionSource
"""

S2_NEW = """    request_type: RequestType
    urgency: Urgency
    confidence: float = Field(ge=0.0, le=1.0)
    rationale: str
    entities: ExtractedEntities = Field(default_factory=ExtractedEntities)
    secondary_type: Optional[RequestType] = None
    alt_type: Optional[RequestType] = None
    alt_confidence: float = 0.0

    decision_source: DecisionSource
"""

S3_OLD = """    def was_overridden(self) -> bool:
"""

S3_NEW = '''    def margin(self) -> float:
        """Confidence gap between the acted-on label and the runner-up."""
        return max(0.0, self.confidence - self.alt_confidence)

    def was_overridden(self) -> bool:
'''


# ---------------------------------------------------------------------------
# 2. classifier.py
# ---------------------------------------------------------------------------

C1_OLD = 'PROMPT_VERSION = "v1"'
C1_NEW = 'PROMPT_VERSION = "v2"'

NEW_PROMPT = '''SYSTEM_PROMPT = """You classify inbound customer messages for a UK consumer lending and mortgage servicing operations desk.

Work through these tests IN ORDER. The FIRST test that matches decides request_type. Do not skip ahead.

1. financial_hardship - the customer discloses difficulty paying, loss or reduction of income, or circumstances affecting their ability to pay.
   This includes IMPLICIT disclosure. A customer who describes laying staff off, a fall in rental or business income, a payment they are about to miss, or losing their home is disclosing hardship even if they never use words like "struggling" or "afford".
   If any such disclosure is present, stop here. Hardship outranks whatever else the customer is asking for.

2. billing_dispute - the customer contests a specific amount: a charge, a fee, an interest calculation, or how a payment was applied or allocated.
   NOT billing_dispute if they only ask what a charge is for without contesting it.

3. general_enquiry - the customer asks for information that published policy, rates or process would answer, and asks for NO action on their account.
   NOT general_enquiry if they want any change, document, quote or account action.

4. service_request - the customer asks for a specific action on their account: statement copy, address change, payment date change, payoff or settlement figure, application status, product switch, rate or deal extension.
   This is a specific operational category, NOT a catch-all. If an amount was contested it was billing_dispute. If only information was sought it was general_enquiry. Do not choose service_request merely because the customer wants something.

5. other - not from a customer of this lender, or nothing to do with lending: marketing, spam, phishing, misrouted mail, unintelligible text.

Urgency is judged INDEPENDENTLY of type, from the customer's situation, not from their tone or politeness.

- critical: a regulator, ombudsman, solicitor or legal action is invoked; OR a vulnerability is disclosed (bereavement, serious illness, mental health, disability, caring responsibility); OR financial harm is immediate (repossession, eviction, losing a home, default happening now).
- high: money is at stake within days; OR this is a second or later contact about the same unresolved issue; OR a payment is about to be missed; OR the customer states an explicit deadline.
- medium: a decision point within weeks, or mild frustration, or some time pressure, but none of the high conditions.
- low: routine. No deadline, nothing at risk now, no prior contact.

Most messages are low or medium. Choose high only if you can name which high condition applies, and critical only if you can name which critical condition applies. An angry tone is not urgency.

Then report your uncertainty:
- confidence: your probability (0 to 1) that request_type is correct. Use the full range. If two classes genuinely compete, say 0.5, not 0.9.
- alt_type: the class you would choose if request_type were ruled out. Always a different class. Never null.
- alt_confidence: your probability (0 to 1) that alt_type is correct. These two need not sum to 1.
- secondary_type: a genuinely SEPARATE second intent present in the message, or null. This is NOT your second-best guess - that is alt_type.

Other rules:
- Judge only from the message. Do not invent details.
- rationale is one or two sentences quoting the decisive phrase.

Return ONLY a JSON object:
{"request_type": "...", "confidence": 0.0,
 "alt_type": "...", "alt_confidence": 0.0,
 "urgency": "...", "secondary_type": null,
 "rationale": "...",
 "entities": {"account_reference": null, "customer_name": null,
              "amount": null, "product": null, "date_mentioned": null,
              "contact_preference": null}}"""'''

C3_OLD = """    best = max(scores, key=lambda k: scores[k])
    top = scores[best]
    runner_up = max(v for k, v in scores.items() if k != best)
    if top == 0:
        best, confidence = RequestType.OTHER, 0.30
    else:"""

C3_NEW = """    best = max(scores, key=lambda k: scores[k])
    top = scores[best]
    alt = max((k for k in scores if k != best), key=lambda k: scores[k])
    runner_up = scores[alt]
    if top == 0:
        best, alt, confidence = RequestType.OTHER, None, 0.30
    else:"""

C4_OLD = """        rationale=f"Keyword match ({top} hit(s) for {best.value}); model unavailable.",
        entities=ExtractedEntities(account_reference=ref.group(1) if ref else None),
        secondary_type=None,
    )"""

C4_NEW = """        rationale=f"Keyword match ({top} hit(s) for {best.value}); model unavailable.",
        entities=ExtractedEntities(account_reference=ref.group(1) if ref else None),
        secondary_type=None,
        # The floor reports its runner-up class for the audit trail but does
        # not estimate a probability for it: keyword counts are not
        # calibrated, and no gate reads this value because floor rows are
        # flagged for review unconditionally.
        alt_type=alt,
        alt_confidence=0.0,
    )"""

C5_OLD = """                if out.secondary_type is None and out.request_type != forced:
                    out.secondary_type = out.request_type
                out.request_type = forced"""

C5_NEW = """                if out.secondary_type is None and out.request_type != forced:
                    out.secondary_type = out.request_type
                out.request_type = forced
                # A forced type may collide with the model's runner-up. Clear
                # it rather than record a proposal whose top two labels are
                # the same class.
                if out.alt_type == forced:
                    out.alt_type, out.alt_confidence = None, 0.0"""

C6_OLD = """        entities=guarded.entities,
        secondary_type=guarded.secondary_type,
        decision_source=final_source,"""

C6_NEW = """        entities=guarded.entities,
        secondary_type=guarded.secondary_type,
        alt_type=guarded.alt_type,
        alt_confidence=guarded.alt_confidence,
        decision_source=final_source,"""


# ---------------------------------------------------------------------------
# 3. run_batch.py
# ---------------------------------------------------------------------------

R1_OLD = """            "requires_review": c.requires_human_review,
            "proposal_type": c.llm_proposal.request_type.value"""

R1_NEW = """            "requires_review": c.requires_human_review,
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
            "proposal_type": c.llm_proposal.request_type.value"""


def main():
    print("patching for PROMPT_VERSION v2\n")

    patch(
        "triage/schemas.py",
        [
            ("S1 proposal fields", S1_OLD, S1_NEW),
            ("S2 decision fields", S2_OLD, S2_NEW),
            ("S3 margin helper", S3_OLD, S3_NEW),
        ],
        [
            (
                "alt_type twice",
                lambda s: s.count("alt_type: Optional[RequestType]") == 2,
            ),
            ("margin twice", lambda s: s.count("def margin(self) -> float:") == 2),
        ],
    )

    cls = REPO / "triage" / "classifier.py"
    s = cls.read_text()
    head = 'SYSTEM_PROMPT = """You classify'
    tail = '"contact_preference": null}}"""'
    assert s.count(head) == 1, f"C2 head anchor: found {s.count(head)}"
    assert s.count(tail) == 1, f"C2 tail anchor: found {s.count(tail)}"
    old_prompt = s[s.index(head) : s.index(tail) + len(tail)]
    assert "Work through these tests IN ORDER" not in old_prompt, "already at v2"
    cls.write_text(s.replace(old_prompt, NEW_PROMPT))
    print("  patched triage/classifier.py (SYSTEM_PROMPT replaced)")

    patch(
        "triage/classifier.py",
        [
            ("C1 version", C1_OLD, C1_NEW),
            ("C3 floor runner-up", C3_OLD, C3_NEW),
            ("C4 floor return", C4_OLD, C4_NEW),
            ("C5 guardrail collision", C5_OLD, C5_NEW),
            ("C6 decision return", C6_OLD, C6_NEW),
        ],
        [
            ("v1 gone", lambda s: 'PROMPT_VERSION = "v1"' not in s),
            ("cascade present", lambda s: "Work through these tests IN ORDER" in s),
            ("alt_type wired", lambda s: s.count("alt_type=guarded.alt_type") == 1),
        ],
    )

    patch(
        "scripts/run_batch.py",
        [("R1 row fields", R1_OLD, R1_NEW)],
        [("margin captured", lambda s: '"margin": c.margin(),' in s)],
    )

    print("\nPATCH COMPLETE")
    print("margin is CAPTURED but NOT gated on - sweep it offline first.")


if __name__ == "__main__":
    main()
