"""
Core data contracts for Switchboard.

Design note (defend this in review):
The model's output and the system's decision are deliberately separate types.
`LLMClassification` is the raw, untrusted proposal returned by a language model.
`Classification` is the final decision the system acts on, after deterministic
guardrails, the confidence gate, and any human override have been applied.

Keeping them apart means the audit trail can always answer "what did the model
say?" and "what did the system decide?" as two different questions. Collapsing
them into one object makes that distinction unrecoverable.
"""

from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


# ---------------------------------------------------------------------------
# Enumerations
# ---------------------------------------------------------------------------


class Channel(str, Enum):
    """Intake channels, named to match the brief's own wording."""

    WEB_FORM = "web_form"
    SHARED_INBOX = "shared_inbox"
    EMAIL_BATCH = "email_batch"


class RequestType(str, Enum):
    """
    Four substantive branches plus a catch-all.

    OTHER is not a failure mode — it is an honest branch. Real operations
    queues receive marketing mail, wrong-number messages and out-of-scope
    requests, and a system that force-fits those into a business category is
    worse than one that routes them to a human.
    """

    BILLING_DISPUTE = "billing_dispute"
    GENERAL_ENQUIRY = "general_enquiry"
    SERVICE_REQUEST = "service_request"
    FINANCIAL_HARDSHIP = "financial_hardship"
    OTHER = "other"


class Urgency(str, Enum):
    """
    Classified independently of request type.

    A routine billing query and a billing query threatening regulatory
    referral are the same type and very different urgency. Deriving urgency
    from type would collapse that distinction and is the single most common
    shortcut in triage prototypes.
    """

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ActionType(str, Enum):
    """
    Downstream steps a branch can execute.

    The first four are the actions named explicitly in the brief; the rest are
    domain-specific additions required to make the lending context coherent.
    """

    GENERATE_RESPONSE = "generate_response"
    ROUTE_TO_TEAM = "route_to_team"
    SET_FOLLOW_UP = "set_follow_up"
    LOG_OUTCOME = "log_outcome"

    ESCALATE = "escalate"
    NOTIFY_SUPERVISOR = "notify_supervisor"
    PAUSE_AUTOMATION = "pause_automation"
    SUPPRESS_COLLECTIONS = "suppress_collections"
    START_SLA_TIMER = "start_sla_timer"


class CaseStatus(str, Enum):
    NEW = "new"
    AUTO_RESOLVED = "auto_resolved"
    AWAITING_HUMAN = "awaiting_human"
    ESCALATED = "escalated"
    SLA_BREACHED = "sla_breached"
    DUPLICATE = "duplicate"


class DecisionSource(str, Enum):
    """Provenance of the final classification. Written to every audit row."""

    LLM_PRIMARY = "llm_primary"
    LLM_SECONDARY = "llm_secondary"
    KEYWORD_FALLBACK = "keyword_fallback"
    GUARDRAIL_OVERRIDE = "guardrail_override"
    HUMAN_OVERRIDE = "human_override"


class ActionOutcome(str, Enum):
    SUCCEEDED = "succeeded"
    SKIPPED = "skipped"
    FAILED = "failed"
    DEFERRED = "deferred"


# ---------------------------------------------------------------------------
# Intake
# ---------------------------------------------------------------------------


class IncomingRequest(BaseModel):
    """A single inbound message, before any interpretation."""

    model_config = ConfigDict(use_enum_values=False)

    request_id: str = Field(default_factory=lambda: _new_id("req"))
    received_at: datetime = Field(default_factory=_utcnow)
    channel: Channel
    sender: str
    subject: str = ""
    body: str
    content_hash: str = ""

    @field_validator("content_hash", mode="after")
    @classmethod
    def _fill_hash(cls, v: str, info) -> str:
        if v:
            return v
        data = info.data
        basis = (
            f"{data.get('sender','')}|{data.get('subject','')}|{data.get('body','')}"
        )
        return hashlib.sha256(basis.strip().lower().encode()).hexdigest()[:16]

    def fingerprint(self) -> str:
        """Stable identity used for duplicate suppression within a time window."""
        basis = f"{self.sender}|{self.subject}|{self.body}".strip().lower()
        return hashlib.sha256(basis.encode()).hexdigest()[:16]


# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------


class ExtractedEntities(BaseModel):
    """
    Kept deliberately small. Every field here must be extractable from a
    plausible customer message; speculative fields invite hallucination.
    """

    account_reference: Optional[str] = None
    customer_name: Optional[str] = None
    amount: Optional[str] = None
    product: Optional[str] = None
    date_mentioned: Optional[str] = None
    contact_preference: Optional[str] = None


class LLMClassification(BaseModel):
    """
    The raw proposal returned by a language model. Untrusted by construction:
    this object is validated against the schema, then passed through
    guardrails before it is allowed to influence any action.
    """

    model_config = ConfigDict(extra="ignore")

    request_type: RequestType
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


class Classification(BaseModel):
    """The system's final decision, after guardrails and the confidence gate."""

    request_type: RequestType
    urgency: Urgency
    confidence: float = Field(ge=0.0, le=1.0)
    rationale: str
    entities: ExtractedEntities = Field(default_factory=ExtractedEntities)
    secondary_type: Optional[RequestType] = None

    decision_source: DecisionSource
    guardrail_triggers: list[str] = Field(default_factory=list)
    requires_human_review: bool = False
    review_reason: Optional[str] = None

    model_name: Optional[str] = None
    prompt_version: Optional[str] = None
    latency_ms: Optional[int] = None

    llm_proposal: Optional[LLMClassification] = None

    def was_overridden(self) -> bool:
        """True when the acted-on decision differs from what the model proposed."""
        if self.llm_proposal is None:
            return False
        return (
            self.llm_proposal.request_type != self.request_type
            or self.llm_proposal.urgency != self.urgency
        )


# ---------------------------------------------------------------------------
# Execution
# ---------------------------------------------------------------------------


class ActionResult(BaseModel):
    """One executed step within a remediation branch."""

    action: ActionType
    outcome: ActionOutcome = ActionOutcome.SUCCEEDED
    summary: str
    artifact: Optional[str] = None
    target: Optional[str] = None
    due_at: Optional[datetime] = None
    error: Optional[str] = None
    executed_at: datetime = Field(default_factory=_utcnow)


class CaseRecord(BaseModel):
    """
    The complete, replayable record of one request through the system.
    This is what gets written to the audit store and what the ops case card
    is rendered from.
    """

    case_id: str = Field(default_factory=lambda: _new_id("case"))
    trace_id: str = Field(default_factory=lambda: _new_id("trc"))
    request: IncomingRequest
    classification: Classification
    branch: str
    actions: list[ActionResult] = Field(default_factory=list)
    status: CaseStatus = CaseStatus.NEW
    sla_due_at: Optional[datetime] = None
    duplicate_of: Optional[str] = None
    created_at: datetime = Field(default_factory=_utcnow)

    def action_summary(self) -> str:
        """One-line branch-specific action summary for the ops case card."""
        return " → ".join(a.action.value.replace("_", " ") for a in self.actions)

    def completed_all_steps(self) -> bool:
        """Used to compute branch-completion rate across a batch run."""
        return bool(self.actions) and all(
            a.outcome in (ActionOutcome.SUCCEEDED, ActionOutcome.SKIPPED)
            for a in self.actions
        )


class LabelledExample(BaseModel):
    """A corpus row: an inbound message plus its ground-truth labels."""

    example_id: str
    channel: Channel
    sender: str
    subject: str
    body: str
    true_type: RequestType
    true_urgency: Urgency
    split: str = "test"
    adversarial: bool = False
    notes: Optional[str] = None

    def to_request(self) -> IncomingRequest:
        return IncomingRequest(
            channel=self.channel,
            sender=self.sender,
            subject=self.subject,
            body=self.body,
        )
