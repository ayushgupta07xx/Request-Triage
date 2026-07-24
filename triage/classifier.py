"""
Classification pipeline: model proposes, guardrails and the gate dispose.

Order of authority, highest first:
  1. Deterministic guardrails (may only escalate, never de-escalate)
  2. The review policy: ensemble disagreement, low confidence, or a hardship
     signal in any second opinion -> human review, never autonomous action
  3. The model's proposal (LLM via the provider waterfall)
  4. The keyword floor (runs as a second opinion on every request; sole
     decider only when no model is available, and then never auto-resolves)

The keyword floor never auto-resolves: anything it classifies is marked for
human review. A degraded system that quietly acts with less information is
worse than one that keeps routing work but admits it is less sure.
"""

from __future__ import annotations

import json
import re
import time
from typing import Optional

from .config import WorkflowConfig
from .llm import LLMResponse, ProviderExhausted, Waterfall
from .schemas import (
    Classification,
    DecisionSource,
    ExtractedEntities,
    IncomingRequest,
    LLMClassification,
    RequestType,
    Urgency,
)

PROMPT_VERSION = "v1"

# Byte-identical on every call: prompt caching applies, and cached tokens do
# not count against the rate limit. Nothing is ever interpolated here.
SYSTEM_PROMPT = """You classify inbound customer messages for a UK consumer lending and mortgage servicing operations desk.

Request types:
- billing_dispute: the customer disputes a charge, fee, interest amount, or how a payment was applied or allocated.
- general_enquiry: the customer asks for information answerable from published policy (rates, terms, process). No account action is requested.
- service_request: the customer asks for a specific action on their account (statement copy, address change, payment date change, payoff quote, application status).
- financial_hardship: the customer discloses difficulty paying, loss of income, or personal circumstances affecting their ability to pay. This takes priority over other types when present.
- other: the message is not from a customer of this lender, or has nothing to do with lending (marketing, spam, phishing, misrouted mail, unintelligible).

Urgency, judged independently of type:
- low: routine, no time pressure.
- medium: some time pressure or mild frustration.
- high: clear urgency, repeated contact, or money at stake now.
- critical: severe - regulatory or legal threat, disclosed vulnerability, or immediate financial harm.

Rules:
- Judge only from the message. Do not invent details.
- If two intents are present, request_type is the dominant one and secondary_type the other; otherwise secondary_type is null.
- confidence is your honest probability (0 to 1) that request_type is correct.
- rationale is one or two sentences quoting the decisive phrase.

Return ONLY a JSON object:
{"request_type": "...", "urgency": "...", "confidence": 0.0,
 "rationale": "...", "secondary_type": null,
 "entities": {"account_reference": null, "customer_name": null,
              "amount": null, "product": null, "date_mentioned": null,
              "contact_preference": null}}"""


def _user_prompt(req: IncomingRequest) -> str:
    return f"Subject: {req.subject}\n\nMessage:\n{req.body}"


# --------------------------------------------------------------------------
# Keyword floor
# --------------------------------------------------------------------------

_TYPE_KEYWORDS: dict[RequestType, list[str]] = {
    RequestType.BILLING_DISPUTE: [
        "dispute",
        "overcharg",
        "incorrect charge",
        "wrong amount",
        "refund",
        "charged twice",
        "overpaid",
        "billing error",
        "fee",
        "misapplied",
        "allocated incorrectly",
        "interest rate charged",
    ],
    RequestType.GENERAL_ENQUIRY: [
        "what are your",
        "could you tell me",
        "interested in",
        "how does",
        "information about",
        "current rates",
        "terms and conditions",
        "thinking of",
        "do you offer",
    ],
    RequestType.SERVICE_REQUEST: [
        "please send",
        "copy of my statement",
        "change my address",
        "change of address",
        "payment date",
        "payoff",
        "settlement figure",
        "update my",
        "application status",
        "direct debit",
    ],
    RequestType.FINANCIAL_HARDSHIP: [
        "can't afford",
        "cannot afford",
        "lost my job",
        "redundan",
        "struggling",
        "difficult to pay",
        "behind on",
        "arrears",
        "no income",
        "hardship",
    ],
}

_URGENCY_KEYWORDS: dict[Urgency, list[str]] = {
    Urgency.CRITICAL: [
        "ombudsman",
        "legal action",
        "solicitor",
        "court",
        "regulator",
        "eviction",
        "repossess",
        "credit score",
        "credit reference",
    ],
    Urgency.HIGH: [
        "urgent",
        "asap",
        "immediately",
        "today",
        "third time",
        "weeks now",
        "still waiting",
        "unacceptable",
        "at my wit",
    ],
    Urgency.MEDIUM: [
        "soon as possible",
        "this week",
        "prompt",
        "frustrat",
        "disappoint",
    ],
}


def keyword_classify(req: IncomingRequest) -> LLMClassification:
    """Deterministic floor. Cheap, explainable, and honest about its limits."""
    text = f"{req.subject}\n{req.body}".lower()

    scores = {
        rt: sum(1 for kw in kws if kw in text) for rt, kws in _TYPE_KEYWORDS.items()
    }
    best = max(scores, key=lambda k: scores[k])
    top = scores[best]
    runner_up = max(v for k, v in scores.items() if k != best)
    if top == 0:
        best, confidence = RequestType.OTHER, 0.30
    else:
        # Margin-based, deliberately capped below any sane gate threshold:
        # the floor routes work, it does not earn the right to auto-resolve.
        confidence = min(0.30 + 0.10 * (top - runner_up), 0.60)

    urgency = Urgency.LOW
    for level in (Urgency.CRITICAL, Urgency.HIGH, Urgency.MEDIUM):
        if any(kw in text for kw in _URGENCY_KEYWORDS[level]):
            urgency = level
            break

    ref = re.search(
        r"\b(?:reference|ref|account)[:\s#]*([A-Za-z0-9]{4,12})", req.body, re.I
    )
    return LLMClassification(
        request_type=best,
        urgency=urgency,
        confidence=confidence,
        rationale=f"Keyword match ({top} hit(s) for {best.value}); model unavailable.",
        entities=ExtractedEntities(account_reference=ref.group(1) if ref else None),
        secondary_type=None,
    )


# --------------------------------------------------------------------------
# Guardrails
# --------------------------------------------------------------------------

_URGENCY_ORDER = {
    Urgency.LOW: 0,
    Urgency.MEDIUM: 1,
    Urgency.HIGH: 2,
    Urgency.CRITICAL: 3,
}


def apply_guardrails(
    req: IncomingRequest, proposal: LLMClassification, cfg: WorkflowConfig
) -> tuple[LLMClassification, list[str], bool]:
    """
    Returns (possibly modified proposal, trigger ids, force_review).
    Guardrails only escalate: type may be forced to a more protective one,
    urgency may rise, review may become mandatory. Nothing is ever lowered.
    """
    text = f"{req.subject}\n{req.body}".lower()
    triggers: list[str] = []
    force_review = False
    out = proposal.model_copy(deep=True)

    for gr in cfg.guardrails:
        if not any(p in text for p in gr["phrases"]):
            continue
        triggers.append(gr["id"])
        if gr.get("force_type"):
            forced = RequestType(gr["force_type"])
            if out.request_type != forced:
                if out.secondary_type is None and out.request_type != forced:
                    out.secondary_type = out.request_type
                out.request_type = forced
        if gr.get("min_urgency"):
            floor = Urgency(gr["min_urgency"])
            if _URGENCY_ORDER[out.urgency] < _URGENCY_ORDER[floor]:
                out.urgency = floor
        if gr.get("requires_human_review"):
            force_review = True
    return out, triggers, force_review


# --------------------------------------------------------------------------
# Full pipeline
# --------------------------------------------------------------------------


def classify(
    req: IncomingRequest,
    cfg: WorkflowConfig,
    waterfall: Optional[Waterfall],
    threshold: Optional[float] = None,
) -> Classification:
    """IncomingRequest -> final Classification, via model + guardrails + gate."""
    threshold = cfg.confidence_threshold if threshold is None else threshold

    proposal: Optional[LLMClassification] = None
    source = DecisionSource.KEYWORD_FALLBACK
    model_name: Optional[str] = None
    latency_ms: Optional[int] = None
    started = time.perf_counter()

    if waterfall is not None:
        try:
            resp: LLMResponse = waterfall.complete(
                SYSTEM_PROMPT, _user_prompt(req), json_mode=True, temperature=0.0
            )
            proposal = LLMClassification.model_validate(resp.json())
            source = (
                DecisionSource.LLM_SECONDARY
                if resp.degraded
                else DecisionSource.LLM_PRIMARY
            )
            model_name, latency_ms = resp.model, resp.latency_ms
        except ProviderExhausted:
            proposal = None
        except (json.JSONDecodeError, ValueError, KeyError):
            # Malformed output is treated exactly like an absent model.
            proposal = None

    if proposal is None:
        proposal = keyword_classify(req)
        source = DecisionSource.KEYWORD_FALLBACK
        model_name = "keyword-floor"
        latency_ms = int((time.perf_counter() - started) * 1000)

    guarded, triggers, force_review = apply_guardrails(req, proposal, cfg)

    # The floor runs as a second opinion on every model-decided request, not
    # only when the model is absent. Agreement between two independently
    # constructed systems is the cheapest uncertainty signal available
    # (dev, prompt v1: 91.8% type accuracy when they agree, 39.3% when they
    # disagree) and the model's stated confidence is too coarse to gate on
    # alone (three distinct values, all above any sane threshold).
    floor_view: Optional[LLMClassification] = None
    if source != DecisionSource.KEYWORD_FALLBACK:
        floor_view = keyword_classify(req)

    if triggers and (
        guarded.request_type != proposal.request_type
        or guarded.urgency != proposal.urgency
    ):
        final_source = DecisionSource.GUARDRAIL_OVERRIDE
    else:
        final_source = source

    reasons: list[str] = []
    if force_review:
        review_triggers = [
            gr["id"]
            for gr in cfg.guardrails
            if gr["id"] in triggers and gr.get("requires_human_review")
        ]
        reasons.append("guardrail: " + ", ".join(review_triggers))
    if source == DecisionSource.KEYWORD_FALLBACK:
        reasons.append("degraded to keyword floor")
    else:
        # Only a guardrail that forced a *different type* invalidates the
        # model's stated confidence, since that confidence referred to the
        # proposal rather than the forced type. An urgency-only trigger
        # (e.g. complaint_language) leaves it meaningful, and must not be
        # allowed to suppress the check -- a guardrail may never de-escalate.
        type_forced = guarded.request_type != proposal.request_type
        if guarded.confidence < threshold and not type_forced:
            reasons.append(
                f"confidence {guarded.confidence:.2f} below "
                f"threshold {threshold:.2f}"
            )
        if floor_view is not None and floor_view.request_type != guarded.request_type:
            reasons.append(
                "ensemble disagreement: keyword floor read this as "
                + floor_view.request_type.value
            )
        second_opinions = {guarded.secondary_type}
        if floor_view is not None:
            second_opinions.add(floor_view.request_type)
        if (
            guarded.request_type != RequestType.FINANCIAL_HARDSHIP
            and RequestType.FINANCIAL_HARDSHIP in second_opinions
        ):
            reasons.append("possible hardship signal in a second opinion")
    # Every reason is recorded, not just the first. The audit trail has to
    # answer "why did this stop" completely: a case held for three independent
    # reasons is a different case from one held on a borderline threshold, and
    # a reviewer working the queue needs to see which.
    requires_review = bool(reasons)
    review_reason = "; ".join(reasons) if reasons else None

    return Classification(
        request_type=guarded.request_type,
        urgency=guarded.urgency,
        confidence=guarded.confidence,
        rationale=guarded.rationale,
        entities=guarded.entities,
        secondary_type=guarded.secondary_type,
        decision_source=final_source,
        guardrail_triggers=triggers,
        requires_human_review=requires_review,
        review_reason=review_reason,
        model_name=model_name,
        prompt_version=PROMPT_VERSION,
        latency_ms=latency_ms,
        llm_proposal=proposal,
    )
