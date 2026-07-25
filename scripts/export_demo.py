#!/usr/bin/env python3
"""Bake a CaseStore .db into demo.json for the web dashboard.

The hosted app opens in demo mode from this file: no API keys, cold open in
milliseconds, fully interactive case cards. Everything here is read straight
from the persisted payload the engine wrote at run time -- no LLM call, no
branch replay, so the demo cannot drift from what production actually did.

Design commitments (mirror PROJECT.md / DECISIONS):
  * Every number is counted from disk. Nothing is asserted.
  * SLA breaches are derived against a documented reference instant
    (max created_at in the batch = "as of end of run"), surfaced in the
    output as `sla_reference` and labelled as such on the dashboard. We do
    not use a live wall clock -- a committed batch is a fixed artefact and
    its breach count must be reproducible by a reviewer.
  * Card fields are whatever the payload holds. We never synthesise a
    guardrail trigger, rationale, or entity that the run did not produce.

Usage:
    python3 scripts/export_demo.py --db data/runs/corpus_dev_bulk.db \
        --out web/public/demo.json
    # tomorrow, unchanged, just re-point:
    python3 scripts/export_demo.py --db data/runs/corpus_test70_v2.db \
        --out web/public/demo.json
"""

from __future__ import annotations

import argparse
import collections
import json
import sqlite3
import sys

from datetime import datetime
from pathlib import Path
from typing import Any, Optional
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from triage.card import to_card


# --------------------------------------------------------------------------
# time helpers -- tolerate the two shapes we write ("...Z" and "+00:00")
# --------------------------------------------------------------------------
def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


# --------------------------------------------------------------------------
# card projection -- payload -> the exact object the front-end renders
#
# We keep this explicit rather than passing the raw payload through, so the
# card contract is visible in one place and a schema change surfaces here as
# a KeyError in review rather than silently as a blank card in the browser.
# --------------------------------------------------------------------------
def _round(x: Any, n: int = 4) -> Any:
    return round(x, n) if isinstance(x, (int, float)) else x


def build(db_path: Path) -> dict:
    if not db_path.exists():
        sys.exit(f"ERROR: db not found: {db_path}")

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute("SELECT payload FROM cases").fetchall()
    finally:
        conn.close()

    if not rows:
        sys.exit(f"ERROR: no cases in {db_path}")

    payloads = [json.loads(r["payload"]) for r in rows]

    # Reference instant for SLA breaches: latest case creation in the batch.
    created = [c for c in (_parse_dt(p.get("created_at")) for p in payloads) if c]
    sla_reference = max(created) if created else None

    cards = [to_card(p, sla_reference) for p in payloads]

    # ---- aggregates, all counted from the cards we just built -------------
    by_type = collections.Counter(c["request_type"] for c in cards)
    by_status = collections.Counter(c["status"] for c in cards)
    by_urgency = collections.Counter(c["urgency"] for c in cards)
    by_source = collections.Counter(c["decision_source"] for c in cards)

    total = len(cards)
    review_queue = [c for c in cards if c["requires_review"]]
    breaches = [c for c in cards if c["sla_breached"]]
    auto_resolved = by_status.get("auto_resolved", 0)

    # Cross-tab: status within each type -- the dashboard's "by type AND
    # status" requirement in one structure.
    type_status: dict[str, dict[str, int]] = collections.defaultdict(
        lambda: collections.defaultdict(int)
    )
    for c in cards:
        type_status[c["request_type"]][c["status"]] += 1

    usage_total = sum(
        (p.get("usage_total_tokens") or 0) for p in payloads
    )  # present only on measurement-mode runs; 0 on older files

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

    # Stable ordering for the card list: review-first, then by creation time,
    # so the demo review queue is non-empty above the fold.
    cards.sort(key=lambda c: (not c["requires_review"], c["created_at"] or ""))

    return {
        "generated_from": db_path.name,
        "schema_version": 1,
        "summary": summary,
        "cases": cards,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="Bake a run .db into demo.json")
    ap.add_argument(
        "--db",
        default="data/runs/corpus_dev_bulk.db",
        help="path to the CaseStore sqlite file",
    )
    ap.add_argument(
        "--out",
        default="web/public/demo.json",
        help="output json path (created if the directory exists)",
    )
    ap.add_argument(
        "--indent",
        type=int,
        default=None,
        help="pretty-print with this indent (default: compact, one line)",
    )
    args = ap.parse_args()

    data = build(Path(args.db))

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps(data, indent=args.indent, ensure_ascii=False),
        encoding="utf-8",
    )

    s = data["summary"]
    print(f"wrote {out}  ({out.stat().st_size:,} bytes)")
    print(f"  source            {data['generated_from']}")
    print(f"  cases             {s['total_cases']}")
    print(f"  automation_rate   {s['automation_rate']}")
    print(f"  review_rate       {s['review_rate']}")
    print(f"  sla_breaches      {s['sla_breach_count']}  (ref {s['sla_reference']})")
    print(f"  by_type           {s['by_type']}")
    print(f"  by_status         {s['by_status']}")
    print(f"  by_decision_src   {s['by_decision_source']}")
    if s["usage_total_tokens"]:
        print(f"  usage_total_tokens {s['usage_total_tokens']:,}")


if __name__ == "__main__":
    main()
