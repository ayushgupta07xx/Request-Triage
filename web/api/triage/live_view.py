"""Project stored cases into the dataset shape the console already consumes.

`scripts/export_demo.py` bakes committed batches into JSON for demo mode. The
hosted deployment needs the same structure for cases that accumulate live, so
the front end can treat "Live" as one more dataset rather than a special case
with its own rendering path.

This mirrors `export_demo.build()` deliberately and exactly: same summary keys,
same aggregates, same card projection, same review-first ordering. If the two
ever drift, the dashboard silently shows different arithmetic for live cases
than for batch ones, which is worse than either being wrong on its own.
"""

from __future__ import annotations

import collections
from datetime import datetime
from typing import Any, Optional

from .card import to_card
from .schemas import CaseRecord


def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def _iso(value: Optional[datetime]) -> Optional[str]:
    return value.isoformat() if value else None


def _round(value: float) -> float:
    return round(value, 3)


def empty_dataset(generated_from: str = "live") -> dict:
    """A valid, empty payload. An empty database is not an error state."""
    return {
        "generated_from": generated_from,
        "schema_version": 1,
        "summary": {
            "total_cases": 0,
            "automation_rate": 0,
            "review_rate": 0,
            "sla_breach_count": 0,
            "sla_reference": None,
            "by_type": {},
            "by_status": {},
            "by_urgency": {},
            "by_decision_source": {},
            "type_status": {},
            "usage_total_tokens": 0,
        },
        "cases": [],
    }


def build_dataset(records: list[CaseRecord], generated_from: str = "live") -> dict:
    if not records:
        return empty_dataset(generated_from)

    payloads: list[dict[str, Any]] = [r.model_dump(mode="json") for r in records]

    # SLA breaches are measured against the latest case in the set, not the wall
    # clock, so the number is reproducible rather than drifting between reloads.
    created = [c for c in (_parse_dt(p.get("created_at")) for p in payloads) if c]
    sla_reference = max(created) if created else None

    cards = [to_card(p, sla_reference) for p in payloads]

    by_type = collections.Counter(c["request_type"] for c in cards)
    by_status = collections.Counter(c["status"] for c in cards)
    by_urgency = collections.Counter(c["urgency"] for c in cards)
    by_source = collections.Counter(c["decision_source"] for c in cards)

    total = len(cards)
    review_queue = [c for c in cards if c["requires_review"]]
    breaches = [c for c in cards if c["sla_breached"]]
    auto_resolved = by_status.get("auto_resolved", 0)

    type_status: dict[str, dict[str, int]] = collections.defaultdict(
        lambda: collections.defaultdict(int)
    )
    for c in cards:
        type_status[c["request_type"]][c["status"]] += 1

    usage_total = sum((p.get("usage_total_tokens") or 0) for p in payloads)

    summary = {
        "total_cases": total,
        "automation_rate": _round(auto_resolved / total) if total else 0,
        "review_rate": _round(len(review_queue) / total) if total else 0,
        "sla_breach_count": len(breaches),
        "sla_reference": _iso(sla_reference),
        "by_type": dict(by_type),
        "by_status": dict(by_status),
        "by_urgency": dict(by_urgency),
        "by_decision_source": dict(by_source),
        "type_status": {k: dict(v) for k, v in type_status.items()},
        "usage_total_tokens": usage_total,
    }

    # Review-first, then oldest-first, so the queue is never empty above the
    # fold when there is anything a person needs to look at.
    cards.sort(key=lambda c: (not c["requires_review"], c["created_at"] or ""))

    return {
        "generated_from": generated_from,
        "schema_version": 1,
        "summary": summary,
        "cases": cards,
    }


__all__ = ["build_dataset", "empty_dataset"]
