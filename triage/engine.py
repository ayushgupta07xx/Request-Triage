"""
Execution engine. Interprets workflows.yaml: the classification selects the
branch, urgency modulates behaviour inside it, and every step becomes an
ActionResult in the audit trail. No control flow lives in a prompt.

Response drafts are templated with extracted entities. The model's job ended
at classification; keeping generation out of the execution hot path is what
lets every branch complete even with no provider available.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from .classifier import FLOOR_MODEL_NAME, classify
from .config import WorkflowConfig
from .llm import Waterfall
from .schemas import (
    ActionOutcome,
    ActionResult,
    ActionType,
    CaseRecord,
    CaseStatus,
    Classification,
    DecisionSource,
    IncomingRequest,
    RequestType,
    Urgency,
)
from .store import CaseStore
from . import kb


def _now() -> datetime:
    return datetime.now(timezone.utc)


# --------------------------------------------------------------------------
# Response templates
# --------------------------------------------------------------------------


def _greeting(c: Classification) -> str:
    name = c.entities.customer_name
    return f"Dear {name}," if name else "Dear Customer,"


def _ref_line(c: Classification) -> str:
    ref = c.entities.account_reference
    return f" (reference {ref})" if ref else ""


def draft_response(
    template: str,
    c: Classification,
    kb_hit: Optional[kb.KBMatch] = None,
) -> str:
    amount = c.entities.amount or "the amount in question"
    if template == "dispute_acknowledgement":
        return (
            f"{_greeting(c)}\n\n"
            f"Thank you for contacting us about {amount}{_ref_line(c)}. "
            "We have logged your dispute and placed a hold on any related "
            "collections activity while we investigate. A member of our "
            "disputes team will contact you with an update.\n\n"
            "Kind regards,\nCustomer Operations"
        )
    if template == "service_confirmation":
        return (
            f"{_greeting(c)}\n\n"
            f"We have received your request{_ref_line(c)} and passed it to "
            "our servicing team. You will receive confirmation once the "
            "requested change or document has been actioned.\n\n"
            "Kind regards,\nCustomer Operations"
        )
    if template == "hardship_holding":
        return (
            f"{_greeting(c)}\n\n"
            "Thank you for telling us about your circumstances - we know "
            "that is not always easy to do. A specialist from our support "
            "team will contact you personally to discuss the options "
            "available. No automated collections activity will take place "
            "on your account in the meantime.\n\n"
            "Kind regards,\nCustomer Support"
        )
    if template == "kb_answer":
        # A grounded answer or none at all. With no matched entry there is
        # nothing to say that we can stand behind, so the draft says so and
        # the case will not auto-resolve.
        if kb_hit is None:
            return (
                f"{_greeting(c)}\n\n"
                "Thank you for your enquiry. We have passed it to a "
                "colleague who will look into it and reply to you "
                "directly.\n\n"
                "Kind regards,\nCustomer Operations"
            )
        return kb.compose_answer(kb_hit, _greeting(c))
    return f"{_greeting(c)}\n\nThank you for your message.{_ref_line(c)}"


# --------------------------------------------------------------------------
# Step execution
# --------------------------------------------------------------------------


def _execute_step(
    step: dict[str, Any],
    case: CaseRecord,
    cfg: WorkflowConfig,
    kb_hit: Optional[kb.KBMatch] = None,
) -> ActionResult:
    action = ActionType(step["action"])
    c = case.classification
    summary = step.get("summary", action.value)

    if action == ActionType.GENERATE_RESPONSE:
        template = step.get("template", "")
        if template == "kb_answer" and kb_hit is None:
            kb_hit = kb.lookup(case.request.subject, case.request.body, c.entities)
        text = draft_response(template, c, kb_hit)
        auto_send = step.get("auto_send", True)
        return ActionResult(
            action=action,
            summary=summary + ("" if auto_send else " (held for human approval)"),
            artifact=text,
        )

    if action == ActionType.ROUTE_TO_TEAM:
        target = cfg.route_target(c.request_type, c.urgency)
        return ActionResult(action=action, summary=summary, target=target)

    if action in (ActionType.SET_FOLLOW_UP, ActionType.START_SLA_TIMER):
        due = _now() + cfg.sla_for(c.urgency)
        return ActionResult(action=action, summary=summary, due_at=due)

    if action == ActionType.SUPPRESS_COLLECTIONS:
        return ActionResult(action=action, summary=summary, artifact=step.get("reason"))

    if action == ActionType.PAUSE_AUTOMATION:
        return ActionResult(action=action, summary=summary, artifact=step.get("reason"))

    if action == ActionType.ESCALATE:
        return ActionResult(action=action, summary=summary)

    if action == ActionType.NOTIFY_SUPERVISOR:
        target = cfg.branches[c.request_type].get("senior_route_to") or "Supervisor"
        return ActionResult(action=action, summary=summary, target=target)

    if action == ActionType.LOG_OUTCOME:
        return ActionResult(action=action, summary=summary)

    return ActionResult(
        action=action,
        outcome=ActionOutcome.SKIPPED,
        summary=f"No handler for {action.value}",
    )


# --------------------------------------------------------------------------
# Pipeline
# --------------------------------------------------------------------------


def _grounding_gate(
    status: CaseStatus,
    grounding_required: bool,
    kb_hit: Optional[kb.KBMatch],
) -> CaseStatus:
    """A branch declaring `grounded: true` must actually have grounded its answer.

    No matched entry - or an ambiguous one, or a topic the knowledge base
    refuses to answer - hands the case to a person. The config stops being
    documentation and becomes an enforced contract.

    This is a function because two paths reach it: the model's own run, and a
    human reviewer's override. The confidence gate above is deliberately
    bypassed on the override path - a reviewer outranks the model's certainty,
    that is what review is for. This gate is not bypassed, because it answers a
    different question. A person being sure of the *label* is not a source for
    the *draft*, and the draft is what leaves the building unread.
    """
    if status == CaseStatus.AUTO_RESOLVED and grounding_required and kb_hit is None:
        return CaseStatus.AWAITING_HUMAN
    return status


def process_request(
    req: IncomingRequest,
    cfg: WorkflowConfig,
    store: Optional[CaseStore],
    waterfall: Optional[Waterfall],
    threshold: Optional[float] = None,
    precomputed: Optional[Classification] = None,
) -> CaseRecord:
    """
    Full flow: duplicate check -> classify -> branch -> execute -> audit.
    `precomputed` lets the eval harness replay cached classifications through
    the engine without re-spending API quota.
    """
    # Duplicate suppression happens before any model call: a resent email
    # should cost nothing and fire nothing.
    if store is not None:
        prior = store.recent_duplicate(req.fingerprint(), cfg.duplicate_window)
        if prior:
            dup = CaseRecord(
                request=req,
                classification=Classification(
                    request_type=RequestType.OTHER,
                    urgency=Urgency.LOW,
                    confidence=1.0,
                    rationale=f"Identical to recent case {prior}; suppressed.",
                    decision_source=DecisionSource.GUARDRAIL_OVERRIDE,
                    requires_human_review=False,
                ),
                branch="duplicate",
                status=CaseStatus.DUPLICATE,
                duplicate_of=prior,
                actions=[
                    ActionResult(
                        action=ActionType.LOG_OUTCOME,
                        summary=f"Duplicate of {prior} within "
                        f"{cfg.duplicate_window} - no workflow fired",
                    )
                ],
            )
            store.insert(dup)
            return dup

    c = precomputed or classify(req, cfg, waterfall, threshold=threshold)
    case = CaseRecord(
        request=req,
        classification=c,
        branch=c.request_type.value,
        status=CaseStatus.NEW,
    )

    # Grounded drafting is deterministic and costs no tokens, so the lookup
    # runs once here and is read twice: by the draft itself, and by the gate
    # that decides whether this case may close without a person.
    kb_hit = kb.lookup(req.subject, req.body, c.entities)

    final_status = CaseStatus.AWAITING_HUMAN
    grounding_required = False
    for step in cfg.steps_for(c.request_type, c.urgency):
        if step.get("grounded"):
            grounding_required = True
        try:
            result = _execute_step(step, case, cfg, kb_hit)
        except Exception as exc:  # a failing step must not kill the branch
            result = ActionResult(
                action=ActionType(step["action"]),
                outcome=ActionOutcome.FAILED,
                summary=step.get("summary", ""),
                error=f"{type(exc).__name__}: {exc}",
            )
        case.actions.append(result)
        if result.due_at and (
            case.sla_due_at is None or result.due_at < case.sla_due_at
        ):
            case.sla_due_at = result.due_at
        if step.get("action") == "log_outcome" and step.get("status"):
            final_status = CaseStatus(step["status"])

    # The gate outranks the branch's happy-path status: an auto-resolvable
    # enquiry that the model was unsure about still goes to a human.
    if c.requires_human_review and final_status == CaseStatus.AUTO_RESOLVED:
        final_status = CaseStatus.AWAITING_HUMAN

    final_status = _grounding_gate(final_status, grounding_required, kb_hit)

    case.status = final_status

    if store is not None:
        store.insert(case)
    return case


# Summaries of the two review audit steps. The API reads them to answer "has
# this case already been reviewed" without a schema change, and the console
# reads them to render the review strip, so they are constants, not literals.
HUMAN_REVIEW_APPROVED = "Human review: disposition confirmed"
HUMAN_REVIEW_CORRECTED = "Human review: label corrected"


def has_review_step(case: CaseRecord, summary: str) -> bool:
    """True when this review action is already recorded on the case."""
    return any(a.summary == summary for a in case.actions)


def _prior_proposal_line(case: CaseRecord) -> str:
    """What the earlier layer proposed, for the override audit line.

    `llm_proposal` holds whatever classified the case first. When every
    provider is exhausted the classifier falls back to `keyword_classify` and
    stores that in the same slot, so naming a model as the author of a floor
    guess would put a provenance error on the one line an auditor reads first.
    The actor comes from `model_name`, which is set only when a provider
    actually answered. Fields are still read defensively: the proposal is the
    untrusted type by design.
    """
    proposal = case.classification.llm_proposal
    if proposal is None:
        return "no earlier proposal on record"
    rt = getattr(proposal.request_type, "value", proposal.request_type)
    urg = getattr(proposal.urgency, "value", proposal.urgency)
    # `model_name` is "keyword-floor" on a floor row, not empty, so this has
    # to compare against the sentinel. Testing the field for truthiness credits
    # a model that never ran.
    spoke = case.classification.model_name not in (None, "", FLOOR_MODEL_NAME)
    actor = "model proposed" if spoke else "keyword floor read"
    return f"{actor} {rt} / {urg}"


def record_human_approval(
    case: CaseRecord,
    reviewer_note: str = "",
    store: Optional[CaseStore] = None,
) -> CaseRecord:
    """Approve: a reviewer confirms the system's disposition of a case.

    Deliberately not a state transition. Inventing a `human_resolved` status
    would ripple through the status enum, the dashboards, the partition chips
    and every export, for no operational gain - the case is already where the
    system decided it belongs, and a reviewer agreeing does not move it. What
    the confirmation adds is audit evidence that a person looked, so it is
    recorded as an audit step and nothing else changes.
    """
    note = reviewer_note.strip()
    cls = case.classification
    case.actions.append(
        ActionResult(
            action=ActionType.LOG_OUTCOME,
            outcome=ActionOutcome.SUCCEEDED,
            summary=HUMAN_REVIEW_APPROVED,
            artifact=(
                f"Reviewer confirmed this case as {cls.request_type.value} / "
                f"{cls.urgency.value} and left it in status {case.status.value}."
                + (f" Note: {note}" if note else "")
            ),
        )
    )
    if store is not None:
        store.update_payload(case)
    return case


def apply_human_override(
    case: CaseRecord,
    new_type: RequestType,
    new_urgency: Urgency,
    reviewer_note: str,
    cfg: WorkflowConfig,
    store: Optional[CaseStore] = None,
) -> CaseRecord:
    """
    Review-queue override. The original model proposal is preserved inside
    the classification; the corrected label becomes the acted-on decision and
    the case is re-run through the (possibly different) branch.

    Persistence is the caller's choice: pass a store and the corrected record
    is written back over the original row - same case_id, so the audit trail
    stays one case with a longer history rather than becoming two cases - or
    pass none and take the record.
    """
    prior_type = case.classification.request_type
    prior_urgency = case.classification.urgency
    prior_status = case.status
    note = reviewer_note.strip()

    corrected = case.classification.model_copy(deep=True)
    corrected.request_type = new_type
    corrected.urgency = new_urgency
    corrected.decision_source = DecisionSource.HUMAN_OVERRIDE
    corrected.requires_human_review = False
    corrected.review_reason = f"human override: {note or 'no note given'}"
    # The model's confidence described a label the model chose. Once a person
    # has changed that label, carrying the number forward would attach it to a
    # decision the model never made - wrong in the audit store, not just on
    # screen. A human decision carries no probability; the model's own numbers
    # stay readable in llm_proposal, which is the point of keeping them apart.
    corrected.confidence = 1.0
    corrected.rationale = (
        f"Corrected by a human reviewer from {prior_type.value} / "
        f"{prior_urgency.value}." + (f" Note: {note}" if note else "")
    )

    rerun = CaseRecord(
        case_id=case.case_id,
        trace_id=case.trace_id,
        request=case.request,
        classification=corrected,
        branch=new_type.value,
        status=CaseStatus.NEW,
        created_at=case.created_at,
    )

    # The corrected branch runs for real, knowledge-base lookup included. A
    # reviewer's label decides which branch executes; it never decides whether
    # that branch may close a case without a person.
    kb_hit = kb.lookup(case.request.subject, case.request.body, corrected.entities)
    final_status = CaseStatus.AWAITING_HUMAN
    grounding_required = False
    for step in cfg.steps_for(new_type, new_urgency):
        if step.get("grounded"):
            grounding_required = True
        try:
            result = _execute_step(step, rerun, cfg, kb_hit)
        except Exception as exc:  # a failing step must not kill the branch
            result = ActionResult(
                action=ActionType(step["action"]),
                outcome=ActionOutcome.FAILED,
                summary=step.get("summary", ""),
                error=f"{type(exc).__name__}: {exc}",
            )
        rerun.actions.append(result)
        if result.due_at and (
            rerun.sla_due_at is None or result.due_at < rerun.sla_due_at
        ):
            rerun.sla_due_at = result.due_at
        if step.get("action") == "log_outcome" and step.get("status"):
            final_status = CaseStatus(step["status"])

    rerun.status = _grounding_gate(final_status, grounding_required, kb_hit)

    # Three layers on one line: what the model said, what the system did with
    # it, what the reviewer decided. This is the training pair, and it is also
    # what an auditor asks for first.
    rerun.actions.append(
        ActionResult(
            action=ActionType.LOG_OUTCOME,
            outcome=ActionOutcome.SUCCEEDED,
            summary=HUMAN_REVIEW_CORRECTED,
            artifact=(
                f"{_prior_proposal_line(case)} · "
                f"system decided {prior_type.value} / {prior_urgency.value} "
                f"({prior_status.value}) · "
                f"reviewer corrected to {new_type.value} / {new_urgency.value} "
                f"({rerun.status.value})." + (f" Note: {note}" if note else "")
            ),
        )
    )

    if store is not None:
        store.update_payload(rerun)
    return rerun
