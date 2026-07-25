"""Human review of live cases: approve a disposition, or override the label.

The brief's fourth optional enhancement is an escalation override mechanism for
edge cases the AI is uncertain about. Escalation was already there - four gates
demote a case toward a person - but nothing let that person act, which made the
loop half a loop. This closes it.

Contract:
  GET  /api/review   -> readiness: storage backend + what the config permits
  POST /api/review
    { "case_id": str,                       # required
      "action": "approve" | "override",     # required
      "request_type": str | null,           # required iff override
      "urgency": str | null,                # optional; default = keep current
      "note": str = "" }                    # optional reviewer note
  -> the same flat card the console already renders, plus
     {"_review": "approved" | "overridden"}

Three decisions worth stating, because each one had an obvious alternative:

Approve does not change status. A `human_resolved` state would ripple through
the status enum, the dashboards, the partition chips and every export for no
operational gain: the case is already where the system put it, and a reviewer
agreeing does not move it. Approve records that a person looked. That is all it
claims to be.

Unlike /api/classify, this endpoint fails loudly when the store is missing or
degraded. Classification degrades on purpose - a reviewer pasting a message
should still see the system work with no database configured. A review that
cannot be written down is not a review, so a degraded store is a 503 rather
than a cheerful 200 over a write that went nowhere.

Permission comes from workflows.yaml (`review_queue`), not from this file. An
operations manager who turns off urgency overrides edits config; nobody
redeploys a function. That is the same claim the branches make, applied here.

There is deliberately no authentication. In production this sits behind the
associate's SSO role; the demo leaves it open so a reviewer can exercise the
loop, and says so rather than mocking a login.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

# The vendored package sits next to this file (web/api/triage, written by
# scripts/sync_api.py). On Vercel the function runs with /var/task on sys.path
# and /var/task/api never searched, so `import triage` fails at cold start
# without this line. Locally it is invisible because uvicorn --app-dir already
# puts this directory on the path - which is exactly how it reached production
# unnoticed once.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from triage.card import to_card  # noqa: E402
from triage.config import load_config  # noqa: E402
from triage.engine import (  # noqa: E402
    HUMAN_REVIEW_APPROVED,
    apply_human_override,
    has_review_step,
    record_human_approval,
)
from triage.schemas import (  # noqa: E402
    CaseStatus,
    DecisionSource,
    RequestType,
    Urgency,
)
from triage.turso import store_from_env  # noqa: E402

app = FastAPI(title="request-triage review API")

# Only a case a person is actually being asked to handle can be reviewed. An
# auto-resolved case had no human decision to confirm, and a duplicate is a
# pointer to another case, not a case.
REVIEWABLE = {CaseStatus.AWAITING_HUMAN, CaseStatus.ESCALATED}

_STORE = None
_STORE_RESOLVED = False
_CFG = None


def _store():
    global _STORE, _STORE_RESOLVED
    if not _STORE_RESOLVED:
        _STORE_RESOLVED = True
        _STORE = store_from_env(os.getenv)
    return _STORE


def _cfg():
    global _CFG
    if _CFG is None:
        _CFG = load_config()
    return _CFG


def _policy() -> dict[str, Any]:
    return getattr(_cfg(), "review_queue", {}) or {}


class ReviewRequest(BaseModel):
    case_id: str
    action: str
    request_type: Optional[str] = None
    urgency: Optional[str] = None
    note: str = ""


@app.get("/api/review")
def readiness() -> dict:
    store = _store()
    policy = _policy()
    return {
        "ok": True,
        "storage": "none"
        if store is None
        else ("degraded" if store.degraded else "turso"),
        "allow_type_override": bool(policy.get("allow_type_override", True)),
        "allow_urgency_override": bool(policy.get("allow_urgency_override", True)),
        "reviewable_statuses": sorted(s.value for s in REVIEWABLE),
    }


@app.post("/api/review")
def review(payload: ReviewRequest) -> dict:
    action = payload.action.strip().lower()
    if action not in ("approve", "override"):
        raise HTTPException(400, "action must be 'approve' or 'override'")

    store = _store()
    if store is None:
        raise HTTPException(
            503, "review needs persistence; this deploy has none configured"
        )

    case = store.get(payload.case_id)
    if store.degraded:
        raise HTTPException(503, "case store unreachable; nothing was written")
    if case is None:
        raise HTTPException(404, f"no case {payload.case_id}")

    if case.status not in REVIEWABLE:
        raise HTTPException(
            409,
            f"case is {case.status.value}; only {'/'.join(sorted(s.value for s in REVIEWABLE))} can be reviewed",
        )

    # `Classification.was_overridden()` means "differs from the model proposal",
    # which is already true for every guardrail catch - it would lock the review
    # buttons on exactly the hardship cases most worth reviewing. Provenance is
    # the right question here: has a *human* already decided this one.
    if case.classification.decision_source == DecisionSource.HUMAN_OVERRIDE:
        raise HTTPException(409, "case has already been overridden by a reviewer")

    if action == "approve":
        if has_review_step(case, HUMAN_REVIEW_APPROVED):
            raise HTTPException(409, "case has already been approved by a reviewer")
        updated = record_human_approval(case, payload.note, store=store)
        outcome = "approved"
    else:
        policy = _policy()
        if not policy.get("allow_type_override", True):
            raise HTTPException(403, "type override is disabled in workflows.yaml")
        if not payload.request_type:
            raise HTTPException(400, "override requires request_type")
        try:
            new_type = RequestType(payload.request_type.strip().lower())
        except ValueError:
            raise HTTPException(
                400,
                f"unknown request_type; expected one of {[t.value for t in RequestType]}",
            ) from None

        if payload.urgency:
            if not policy.get("allow_urgency_override", True):
                raise HTTPException(
                    403, "urgency override is disabled in workflows.yaml"
                )
            try:
                new_urgency = Urgency(payload.urgency.strip().lower())
            except ValueError:
                raise HTTPException(
                    400,
                    f"unknown urgency; expected one of {[u.value for u in Urgency]}",
                ) from None
        else:
            new_urgency = case.classification.urgency

        if (
            new_type == case.classification.request_type
            and new_urgency == case.classification.urgency
        ):
            raise HTTPException(
                409, "override matches the current decision; nothing to correct"
            )

        updated = apply_human_override(
            case, new_type, new_urgency, payload.note, _cfg(), store=store
        )
        outcome = "overridden"

    # A fail-soft store returns None on a failed write rather than raising, so
    # the only honest way to report a save is to ask the store afterwards.
    if store.degraded:
        raise HTTPException(503, "review could not be persisted; the case is unchanged")

    card = to_card(updated.model_dump(mode="json"))
    card["_review"] = outcome
    return card
