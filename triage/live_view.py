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


def _showcase_head(cards: list[dict]) -> list[dict]:
    """One model-decided case per urgency band, most urgent first.

    A queue that opens on keyword-floor rows shows cases with no drafted output
    and a capped confidence, which reads as a system that does nothing. Floor
    rows stay in the queue — they are the honest degradation story — they just
    do not lead.

    Within each band the pick is ordered by: a request type not already shown,
    then an auto-resolved case, then the most drafted output, then the most
    steps. Type diversity means four branches are visible on the first screen
    rather than two; the auto-resolved preference means the one thing a reviewer
    most wants to know — that the system can close a case with a cited answer
    and no person — is not buried below the fold.
    """
    picked: list[dict] = []
    used_types: set[str] = set()
    used_ids: set[str] = set()

    for urgency in ("critical", "high", "medium", "low"):
        pool = [
            c
            for c in cards
            if c.get("urgency") == urgency
            and c.get("decision_source") != "keyword_fallback"
            and c.get("case_id") not in used_ids
        ]
        if not pool:
            continue

        def rank(c: dict) -> tuple:
            return (
                c.get("request_type") not in used_types,
                c.get("status") == "auto_resolved",
                sum(1 for s in (c.get("trace") or []) if s.get("artifact")),
                c.get("n_actions") or 0,
            )

        best = max(pool, key=rank)
        picked.append(best)
        used_types.add(best.get("request_type"))
        used_ids.add(best.get("case_id"))

    return picked


def _order_cards(cards: list[dict]) -> list[dict]:
    head = _showcase_head(cards)
    lead = {c["case_id"] for c in head}
    rest = [c for c in cards if c["case_id"] not in lead]
    # Unchanged for the remainder: review-first, then oldest-first, so the
    # review queue is never empty below the opening spread.
    rest.sort(key=lambda c: (not c["requires_review"], c["created_at"] or ""))
    return head + rest


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

    # Always 0 here, by construction: CaseRecord has no usage block, so a live
    # case carries no token count. The key is kept because the console's
    # Summary type requires it and scripts/export_demo.py populates it for
    # measurement-mode batch runs, where the run row does carry usage.
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

    cards = _order_cards(cards)

    return {
        "generated_from": generated_from,
        "schema_version": 1,
        "summary": summary,
        "cases": cards,
    }


__all__ = ["build_dataset", "empty_dataset"]
