"""
Audit store. Every case is replayable: the full CaseRecord is stored as JSON,
with the fields the dashboard and duplicate detector need lifted into indexed
columns. SQLite via the standard library - no ORM, nothing to defend beyond
"it is a file, it is transactional, and a reviewer can open it with sqlite3".
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from .schemas import CaseRecord

_SCHEMA = """
CREATE TABLE IF NOT EXISTS cases (
    case_id      TEXT PRIMARY KEY,
    trace_id     TEXT NOT NULL,
    fingerprint  TEXT NOT NULL,
    request_type TEXT NOT NULL,
    urgency      TEXT NOT NULL,
    status       TEXT NOT NULL,
    source       TEXT NOT NULL,
    needs_review INTEGER NOT NULL,
    created_at   TEXT NOT NULL,
    sla_due_at   TEXT,
    payload      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cases_fingerprint ON cases (fingerprint, created_at);
CREATE INDEX IF NOT EXISTS idx_cases_status ON cases (status);
CREATE INDEX IF NOT EXISTS idx_cases_type ON cases (request_type);
"""


class CaseStore:
    def __init__(self, path: str | Path):
        self.path = str(path)
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self.path)
        self._conn.row_factory = sqlite3.Row
        self._conn.executescript(_SCHEMA)
        self._conn.commit()

    def close(self) -> None:
        self._conn.close()

    # -- writes -----------------------------------------------------------

    def insert(self, case: CaseRecord) -> None:
        self._conn.execute(
            "INSERT INTO cases VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (
                case.case_id,
                case.trace_id,
                case.request.fingerprint(),
                case.classification.request_type.value,
                case.classification.urgency.value,
                case.status.value,
                case.classification.decision_source.value,
                int(case.classification.requires_human_review),
                case.created_at.isoformat(),
                case.sla_due_at.isoformat() if case.sla_due_at else None,
                case.model_dump_json(),
            ),
        )
        self._conn.commit()

    def update_payload(self, case: CaseRecord) -> None:
        """Rewrite a case after a human override in the review queue."""
        self._conn.execute(
            "UPDATE cases SET request_type=?, urgency=?, status=?, source=?, "
            "needs_review=?, payload=? WHERE case_id=?",
            (
                case.classification.request_type.value,
                case.classification.urgency.value,
                case.status.value,
                case.classification.decision_source.value,
                int(case.classification.requires_human_review),
                case.model_dump_json(),
                case.case_id,
            ),
        )
        self._conn.commit()

    # -- reads ------------------------------------------------------------

    def recent_duplicate(self, fingerprint: str, window: timedelta) -> Optional[str]:
        """case_id of a matching request inside the window, else None."""
        cutoff = (datetime.now(timezone.utc) - window).isoformat()
        row = self._conn.execute(
            "SELECT case_id FROM cases WHERE fingerprint=? AND created_at>=? "
            "AND status != 'duplicate' ORDER BY created_at DESC LIMIT 1",
            (fingerprint, cutoff),
        ).fetchone()
        return row["case_id"] if row else None

    def get(self, case_id: str) -> Optional[CaseRecord]:
        row = self._conn.execute(
            "SELECT payload FROM cases WHERE case_id=?", (case_id,)
        ).fetchone()
        return CaseRecord.model_validate_json(row["payload"]) if row else None

    def list_cases(
        self,
        status: Optional[str] = None,
        request_type: Optional[str] = None,
        needs_review: Optional[bool] = None,
        limit: int = 200,
    ) -> list[CaseRecord]:
        q = "SELECT payload FROM cases"
        clauses, args = [], []
        if status:
            clauses.append("status=?")
            args.append(status)
        if request_type:
            clauses.append("request_type=?")
            args.append(request_type)
        if needs_review is not None:
            clauses.append("needs_review=?")
            args.append(int(needs_review))
        if clauses:
            q += " WHERE " + " AND ".join(clauses)
        q += " ORDER BY created_at DESC LIMIT ?"
        args.append(limit)
        rows = self._conn.execute(q, args).fetchall()
        return [CaseRecord.model_validate_json(r["payload"]) for r in rows]

    def counts(self) -> dict:
        """Aggregates for the ops dashboard: volumes by type and by status."""
        out: dict = {"by_type": {}, "by_status": {}, "by_source": {}, "total": 0}
        for row in self._conn.execute(
            "SELECT request_type t, COUNT(*) n FROM cases GROUP BY 1"
        ):
            out["by_type"][row["t"]] = row["n"]
        for row in self._conn.execute(
            "SELECT status s, COUNT(*) n FROM cases GROUP BY 1"
        ):
            out["by_status"][row["s"]] = row["n"]
        for row in self._conn.execute(
            "SELECT source s, COUNT(*) n FROM cases GROUP BY 1"
        ):
            out["by_source"][row["s"]] = row["n"]
        out["total"] = sum(out["by_type"].values())
        out["review_queue"] = self._conn.execute(
            "SELECT COUNT(*) n FROM cases WHERE needs_review=1 "
            "AND status IN ('awaiting_human','escalated','new')"
        ).fetchone()["n"]
        now = datetime.now(timezone.utc).isoformat()
        out["sla_breached"] = self._conn.execute(
            "SELECT COUNT(*) n FROM cases WHERE sla_due_at IS NOT NULL "
            "AND sla_due_at < ? AND status IN ('awaiting_human','new','escalated')",
            (now,),
        ).fetchone()["n"]
        return out
