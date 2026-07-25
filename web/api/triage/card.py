"""The one place a persisted case becomes a UI card.

Both entry points into the front-end go through `to_card`:
  * export_demo.py bakes demo.json from a run .db (demo mode).
  * web/api/classify.py renders a freshly executed case (live mode).

Keeping this projection in a single function inside the package is the whole
point: a demo card and a live card are byte-for-byte the same shape because
they are literally the same code over the same payload dict. Duplicating the
projection in the exporter and the API is exactly how the live case silently
grows a field the demo card never had (or loses one), and a reviewer pasting
their own message would then see a subtly different card than the demo.

Input is the dict form of a CaseRecord -- i.e. json.loads(payload) from the
store, or case.model_dump(mode="json") straight from process_request. The
store persists case.model_dump_json() verbatim, so those two are identical.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional


def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def to_card(payload: dict, sla_reference: Optional[datetime] = None) -> dict:
    """Project a persisted/dumped case into the flat card the UI renders.

    `sla_reference` is the instant breaches are measured against. In demo mode
    the exporter passes the batch's max created_at ("as of end of run"). In
    live mode it is left None -- a single freshly created case has no
    meaningful breach yet, and we do not invent one from a live clock.
    """
    req = payload.get("request", {}) or {}
    cls = payload.get("classification", {}) or {}
    proposal = cls.get("llm_proposal", {}) or {}
    ents = cls.get("entities", {}) or {}

    trace = []
    for a in payload.get("actions", []) or []:
        trace.append(
            {
                "action": a.get("action"),
                "outcome": a.get("outcome"),
                "summary": a.get("summary"),
                "artifact": a.get("artifact"),
                "target": a.get("target"),
                "due_at": a.get("due_at"),
                "error": a.get("error"),
            }
        )

    prop_type = proposal.get("request_type")
    prop_urg = proposal.get("urgency")
    final_type = cls.get("request_type")
    final_urg = cls.get("urgency")
    overridden = bool(proposal) and (prop_type != final_type or prop_urg != final_urg)

    sla_due = _parse_dt(payload.get("sla_due_at"))
    breached = bool(sla_due and sla_reference and sla_due < sla_reference)

    # Show only extracted entities, not the null slots.
    entities = {k: v for k, v in ents.items() if v not in (None, "", [])}

    return {
        "case_id": payload.get("case_id"),
        "trace_id": payload.get("trace_id"),
        "channel": req.get("channel"),
        "sender": req.get("sender"),
        "subject": req.get("subject"),
        "body": req.get("body"),
        "request_type": final_type,
        "urgency": final_urg,
        "confidence": cls.get("confidence"),
        "rationale": cls.get("rationale"),
        "entities": entities,
        "secondary_type": cls.get("secondary_type"),
        "decision_source": cls.get("decision_source"),
        "guardrail_triggers": cls.get("guardrail_triggers", []) or [],
        "requires_review": bool(cls.get("requires_human_review")),
        "review_reason": cls.get("review_reason"),
        "model_name": cls.get("model_name"),
        "prompt_version": cls.get("prompt_version"),
        "latency_ms": cls.get("latency_ms"),
        "branch": payload.get("branch"),
        "status": payload.get("status"),
        "trace": trace,
        "n_actions": len(trace),
        "created_at": payload.get("created_at"),
        "sla_due_at": payload.get("sla_due_at"),
        "sla_breached": breached,
        "duplicate_of": payload.get("duplicate_of"),
        "proposal": {
            "request_type": prop_type,
            "urgency": prop_urg,
            "confidence": proposal.get("confidence"),
            "secondary_type": proposal.get("secondary_type"),
        }
        if proposal
        else None,
        "was_overridden": overridden,
    }
