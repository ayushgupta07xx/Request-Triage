"""Safety properties of the human review loop.

A reviewer's correction is the one place a person can push a case *back* into
automation, so it is the one place worth testing hardest. These tests encode
four claims the README and the deck make:

  * an override runs the corrected branch through the real engine
  * an override never buys autonomy the branch has not earned - the grounding
    contract survives a human being certain
  * an override is provenanced as HUMAN_OVERRIDE and keeps the model proposal
  * approve is an audit event and moves nothing

Offline, no API key, no database. Run:  python3 -m pytest -q
"""

from __future__ import annotations

import pytest

from triage.classifier import FLOOR_MODEL_NAME
from triage.config import load_config
from triage.engine import (
    HUMAN_REVIEW_APPROVED,
    HUMAN_REVIEW_CORRECTED,
    apply_human_override,
    has_review_step,
    process_request,
    record_human_approval,
)
from triage.schemas import (
    CaseStatus,
    Channel,
    Classification,
    DecisionSource,
    IncomingRequest,
    RequestType,
    Urgency,
)

# Text the knowledge base cannot match, so a grounded branch has no source.
NONSENSE = "Zorbit quandle frimbulate wossname, thruntle pib."


@pytest.fixture(scope="module")
def cfg():
    return load_config()


def _case(cfg, body: str = NONSENSE, subject: str = "Query"):
    """A case parked with a human, built without touching a model or a store."""
    req = IncomingRequest(
        channel=Channel.SHARED_INBOX,
        sender="reviewer@demo",
        subject=subject,
        body=body,
    )
    precomputed = Classification(
        request_type=RequestType.OTHER,
        urgency=Urgency.LOW,
        confidence=0.41,
        rationale="low-confidence catch-all, parked for a person",
        decision_source=DecisionSource.LLM_PRIMARY,
        requires_human_review=True,
        review_reason="below the auto-handling gate",
    )
    # `waterfall` is a required positional here, not an optional one:
    # `precomputed` is what skips the model, so None is safe and offline.
    return process_request(
        req, cfg, store=None, waterfall=None, precomputed=precomputed
    )


def test_override_reruns_the_corrected_branch(cfg):
    """The corrected label selects a different branch, and that branch executes."""
    case = _case(cfg)
    before = len(case.actions)

    updated = apply_human_override(
        case,
        RequestType.BILLING_DISPUTE,
        Urgency.HIGH,
        "clearly a disputed charge",
        cfg,
    )

    assert updated.case_id == case.case_id, "an override must not fork a second case"
    assert updated.branch == RequestType.BILLING_DISPUTE.value
    assert len(updated.actions) > before
    assert updated.classification.request_type == RequestType.BILLING_DISPUTE
    assert updated.classification.urgency == Urgency.HIGH


def test_override_into_a_grounded_branch_cannot_auto_resolve_without_a_source(cfg):
    """The regression this loop could have reintroduced.

    `process_request` demotes a grounded branch that found no knowledge-base
    entry. The override path re-executes the same branch, so it has to apply
    the same gate: a reviewer is authoritative about the *label*, and is not a
    source for the *draft* that would be sent unread.
    """
    case = _case(cfg)

    updated = apply_human_override(
        case,
        RequestType.GENERAL_ENQUIRY,
        Urgency.LOW,
        "reads like a plain question",
        cfg,
    )

    assert updated.status != CaseStatus.AUTO_RESOLVED, (
        "an ungrounded enquiry closed itself after a human override — the "
        "grounding contract is not being applied on the override path"
    )
    assert updated.status == CaseStatus.AWAITING_HUMAN


def test_override_is_provenanced_and_audited(cfg):
    case = _case(cfg)
    proposal = case.classification.llm_proposal

    updated = apply_human_override(
        case, RequestType.SERVICE_REQUEST, Urgency.MEDIUM, "address change", cfg
    )

    assert updated.classification.decision_source == DecisionSource.HUMAN_OVERRIDE
    assert updated.classification.llm_proposal == proposal, (
        "the model proposal must survive the correction — it is half of the "
        "training pair"
    )
    assert has_review_step(updated, HUMAN_REVIEW_CORRECTED)
    trail = [a.artifact for a in updated.actions if a.summary == HUMAN_REVIEW_CORRECTED]
    assert trail and "reviewer corrected to" in trail[0]


def test_approve_records_a_person_and_moves_nothing(cfg):
    case = _case(cfg)
    status, cls = case.status, case.classification.model_copy(deep=True)

    updated = record_human_approval(case, "checked against the account notes")

    assert updated.status == status, "approve is an audit event, not a transition"
    assert updated.classification.request_type == cls.request_type
    assert updated.classification.urgency == cls.urgency
    assert updated.classification.decision_source == cls.decision_source
    assert has_review_step(updated, HUMAN_REVIEW_APPROVED)


def _floor_case(cfg):
    """A case classified end to end by the deterministic floor.

    No waterfall means no provider, so `classify` falls through to
    `keyword_classify` and stamps the floor sentinel on `model_name`. Built by
    the real code path rather than posed: the first version of these tests set
    `model_name=None` by hand and passed green against a system that was still
    printing the wrong actor on every live floor row.
    """
    req = IncomingRequest(
        channel=Channel.SHARED_INBOX,
        sender="reviewer@demo",
        subject="Incorrect fee on my statement",
        body="There is a charge on my statement I did not agree to.",
    )
    return process_request(req, cfg, store=None, waterfall=None)


def test_audit_line_names_the_floor_when_the_floor_decided(cfg):
    """A floor guess is not a model proposal, and the audit line must not say so."""
    case = _floor_case(cfg)
    assert (
        case.classification.model_name == FLOOR_MODEL_NAME
    ), "fixture did not go through the floor — the rest of this test proves nothing"

    updated = apply_human_override(
        case, RequestType.SERVICE_REQUEST, Urgency.HIGH, "", cfg
    )

    line = next(
        a.artifact for a in updated.actions if a.summary == HUMAN_REVIEW_CORRECTED
    )
    assert "keyword floor read" in line
    assert "model proposed" not in line


def test_audit_line_names_the_model_when_a_model_answered(cfg):
    """The model half is posed: no provider is reachable from an offline test.

    Only the sentinel separates the two cases, so the sentinel is what this
    asserts against - and the floor half above is built for real.
    """
    case = _floor_case(cfg)
    case.classification.model_name = "llama-3.3-70b-versatile"

    updated = apply_human_override(
        case, RequestType.SERVICE_REQUEST, Urgency.HIGH, "", cfg
    )

    line = next(
        a.artifact for a in updated.actions if a.summary == HUMAN_REVIEW_CORRECTED
    )
    assert "model proposed" in line
    assert "keyword floor read" not in line
