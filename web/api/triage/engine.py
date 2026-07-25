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

from .classifier import classify
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


def draft_response(template: str, c: Classification) -> str:
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
        return (
            f"{_greeting(c)}\n\n"
            "Thank you for your enquiry. [Draft grounded answer - populated "
            "from the knowledge base in the review screen.]\n\n"
            "Kind regards,\nCustomer Operations"
        )
    return f"{_greeting(c)}\n\nThank you for your message.{_ref_line(c)}"


# --------------------------------------------------------------------------
# Step execution
# --------------------------------------------------------------------------


def _execute_step(
    step: dict[str, Any],
    case: CaseRecord,
    cfg: WorkflowConfig,
) -> ActionResult:
    action = ActionType(step["action"])
    c = case.classification
    summary = step.get("summary", action.value)

    if action == ActionType.GENERATE_RESPONSE:
        text = draft_response(step.get("template", ""), c)
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

    final_status = CaseStatus.AWAITING_HUMAN
    for step in cfg.steps_for(c.request_type, c.urgency):
        try:
            result = _execute_step(step, case, cfg)
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
    case.status = final_status

    if store is not None:
        store.insert(case)
    return case


def apply_human_override(
    case: CaseRecord,
    new_type: RequestType,
    new_urgency: Urgency,
    reviewer_note: str,
    cfg: WorkflowConfig,
    store: CaseStore,
) -> CaseRecord:
    """
    Review-queue override. The original model proposal is preserved inside
    the classification; the corrected label becomes the acted-on decision and
    the case is re-run through the (possibly different) branch.
    """
    corrected = case.classification.model_copy(deep=True)
    corrected.request_type = new_type
    corrected.urgency = new_urgency
    corrected.decision_source = DecisionSource.HUMAN_OVERRIDE
    corrected.requires_human_review = False
    corrected.review_reason = f"human override: {reviewer_note}"

    rerun = CaseRecord(
        case_id=case.case_id,
        trace_id=case.trace_id,
        request=case.request,
        classification=corrected,
        branch=new_type.value,
        status=CaseStatus.NEW,
        created_at=case.created_at,
    )
    final_status = CaseStatus.AWAITING_HUMAN
    for step in cfg.steps_for(new_type, new_urgency):
        result = _execute_step(step, rerun, cfg)
        rerun.actions.append(result)
        if result.due_at and (
            rerun.sla_due_at is None or result.due_at < rerun.sla_due_at
        ):
            rerun.sla_due_at = result.due_at
        if step.get("action") == "log_outcome" and step.get("status"):
            final_status = CaseStatus(step["status"])
    rerun.status = final_status
    store.update_payload(rerun)
    return rerun
