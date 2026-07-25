"""The safety properties, as tests rather than assertions in a document.

Every claim this project makes about bounded autonomy is a property of the
config and the engine, not of a model. That means each one can be checked
offline, in milliseconds, with no API key — and each one fails loudly if a
future change breaks it.

These are deliberately not unit tests of implementation detail. They are the
deck's claims made executable:

  * guardrails escalate and never de-escalate
  * the deterministic floor is capped and can never close a case
  * `grounded: true` is an enforced contract, not documentation
  * every branch is well formed and runs at least two steps
  * the brief's four named actions are each exercised by two or more branches
  * blocked knowledge-base topics stay blocked

Run:  python3 -m pytest -q
"""

from __future__ import annotations

import pytest

from triage import kb
from triage.classifier import apply_guardrails, keyword_classify
from triage.config import load_config
from triage.engine import process_request
from triage.schemas import (
    ActionType,
    CaseStatus,
    Channel,
    Classification,
    DecisionSource,
    IncomingRequest,
    LLMClassification,
    RequestType,
    Urgency,
)

BRIEF_ACTIONS = {
    ActionType.GENERATE_RESPONSE,
    ActionType.ROUTE_TO_TEAM,
    ActionType.SET_FOLLOW_UP,
    ActionType.LOG_OUTCOME,
}


@pytest.fixture(scope="module")
def cfg():
    return load_config()


def _request(body: str, subject: str = "test") -> IncomingRequest:
    return IncomingRequest(
        channel=Channel.WEB_FORM,
        sender="tester@example.com",
        subject=subject,
        body=body,
    )


def _mild_proposal() -> LLMClassification:
    """The mildest reading available, so any guardrail change is visible."""
    return LLMClassification(
        request_type=RequestType.OTHER,
        urgency=list(Urgency)[0],
        confidence=1.0,
        rationale="baseline proposal for a guardrail property test",
    )


# --------------------------------------------------------------------------
# 1. Guardrails escalate. They never soften.
# --------------------------------------------------------------------------


def test_every_guardrail_only_escalates(cfg):
    """No rule may lower urgency, and a type change must be the declared one.

    The asymmetry is argued from cost: a false escalation wastes minutes of an
    associate's time, a missed hardship disclosure is a regulatory and human
    failure. A rule that softened a case would invert that trade silently.
    """
    assert cfg.guardrails, "no guardrails configured"

    for rule in cfg.guardrails:
        phrases = rule.get("phrases") or []
        assert phrases, f"guardrail {rule.get('id')!r} has no phrases"

        proposal = _mild_proposal()
        req = _request(f"Hello, {phrases[0]} and I need help please.")
        guarded, triggers, _force_review = apply_guardrails(req, proposal, cfg)

        assert rule["id"] in triggers, f"{rule['id']!r} did not fire on its own phrase"

        # Urgency may rise or hold. cfg.max_urgency is the system's own
        # comparator, so this cannot drift from the engine's ordering.
        assert (
            cfg.max_urgency(proposal.urgency, guarded.urgency) == guarded.urgency
        ), f"{rule['id']!r} lowered urgency"

        if guarded.request_type != proposal.request_type:
            forced = rule.get("force_type")
            assert (
                forced
            ), f"{rule['id']!r} changed the type without declaring force_type"
            assert guarded.request_type == RequestType(forced)


# --------------------------------------------------------------------------
# 2. The deterministic floor is capped, and cannot close a case.
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "body",
    [
        "I want to dispute a charge on my account.",
        "When is my next payment due?",
        "Please update my correspondence address.",
        "I cannot afford my payments this month.",
        "Out of office auto-reply, back Monday.",
    ],
)
def test_keyword_floor_confidence_is_capped(body):
    """A keyword match is evidence, not certainty. 0.60 is the ceiling."""
    proposal = keyword_classify(_request(body))
    assert (
        proposal.confidence <= 0.60
    ), f"floor returned {proposal.confidence} on {body!r}"


def test_floor_decided_case_never_auto_resolves(cfg):
    """With no provider available the floor decides — and hands over.

    waterfall=None is the total-outage path: every provider gone. The system
    must still classify, still branch, still execute, and still refuse to
    close the case by itself.
    """
    case = process_request(
        _request("When is my next payment date on account TEST-1?"),
        cfg,
        store=None,
        waterfall=None,
    )
    assert case.classification.decision_source == DecisionSource.KEYWORD_FALLBACK
    assert case.status != CaseStatus.AUTO_RESOLVED
    assert case.classification.confidence <= 0.60
    assert len(case.actions) >= 2, "the branch must still run with no model"


# --------------------------------------------------------------------------
# 3. `grounded: true` is an enforced contract.
# --------------------------------------------------------------------------


def test_grounded_branch_cannot_auto_resolve_without_a_source(cfg):
    """The bug this test exists to prevent shipped once already.

    workflows.yaml declared the enquiry branch grounded while the engine
    returned a hardcoded placeholder, so 34 cases reported themselves
    auto-resolved having resolved nothing. A grounded branch that produced no
    sourced answer must be demoted to a human, however confident the model was.
    """
    nonsense = "Zorbit quandle frimbulate wossname, thruntle pib."
    assert (
        kb.lookup(nonsense, nonsense) is None
    ), "test text unexpectedly matched the KB"

    precomputed = Classification(
        request_type=RequestType.GENERAL_ENQUIRY,
        urgency=list(Urgency)[0],
        confidence=1.0,
        rationale="forced maximum-confidence enquiry with no knowledge-base match",
        decision_source=DecisionSource.LLM_PRIMARY,
        model_name="test-harness",
    )
    case = process_request(
        _request(nonsense, subject=nonsense),
        cfg,
        store=None,
        waterfall=None,
        precomputed=precomputed,
    )
    assert case.status != CaseStatus.AUTO_RESOLVED
    assert case.status == CaseStatus.AWAITING_HUMAN

    # requires_human_review is deliberately NOT asserted here. It is a
    # cross-cutting flag meaning "the classification was uncertain", and this
    # case is the opposite: the model was confident and correct about the type,
    # there was simply no sourced answer to send. The status demotion is the
    # handoff; the flag is a different axis.


# --------------------------------------------------------------------------
# 4. Every branch is well formed.
# --------------------------------------------------------------------------


@pytest.mark.parametrize("request_type", list(RequestType))
def test_branch_runs_at_least_two_valid_steps(cfg, request_type):
    """The brief requires a minimum of two downstream steps per branch."""
    for urgency in Urgency:
        steps = cfg.steps_for(request_type, urgency)
        assert len(steps) >= 2, f"{request_type.value}/{urgency.value} has {len(steps)}"
        for step in steps:
            ActionType(step["action"])  # raises on an unknown action


def test_brief_actions_each_appear_in_two_or_more_branches(cfg):
    """The coverage matrix on slide 3, checked rather than claimed."""
    seen: dict[ActionType, set[str]] = {a: set() for a in BRIEF_ACTIONS}
    for request_type in RequestType:
        for urgency in Urgency:
            for step in cfg.steps_for(request_type, urgency):
                action = ActionType(step["action"])
                if action in seen:
                    seen[action].add(request_type.value)

    for action, branches in seen.items():
        assert (
            len(branches) >= 2
        ), f"{action.value} is exercised by only {sorted(branches)}"


def test_hardship_pauses_automation_before_anything_else(cfg):
    """The hardship branch's first act is to stop, not to answer."""
    steps = cfg.steps_for(RequestType.FINANCIAL_HARDSHIP, list(Urgency)[-1])
    assert ActionType(steps[0]["action"]) == ActionType.PAUSE_AUTOMATION


# --------------------------------------------------------------------------
# 5. Blocked knowledge-base topics stay blocked.
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "body",
    [
        "I want to make a formal complaint about your service.",
        "My account is in arrears and I need to discuss it.",
        "My husband passed away and I need to close the account.",
        "I am vulnerable and struggling to understand these letters.",
    ],
)
def test_blocked_topics_never_produce_an_automatic_answer(body):
    """A control, not a coverage gap.

    These topics have no knowledge-base entry on purpose. Blocking them at
    lookup means adding an entry later cannot accidentally make them
    auto-answerable.
    """
    subject = body[:40]
    assert kb.blocked_topic(subject, body) is not None
    assert kb.lookup(subject, body) is None
