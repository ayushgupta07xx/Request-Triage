"""Turso (libSQL) twin of CaseStore, for the hosted deployment.

Why this exists. On Vercel the filesystem is ephemeral, so live mode ran with
`store=None`. That silently disabled two things the system genuinely does:
duplicate suppression (guarded by `if store is not None` in the engine, and
therefore never exercised on the deployed system) and the audit trail the deck
claims for every case. This restores both without changing the engine: it
implements the same surface `CaseStore` exposes, so `process_request` cannot
tell the difference.

Why HTTP rather than the libsql client. Turso speaks a small JSON protocol at
/v2/pipeline, and httpx is already a dependency of this project. Adding a
native client would mean another package in a serverless bundle for no gain.

Why every method swallows its own errors. Persistence is best-effort; the
response is not. A slow or unreachable database must cost the reviewer their
audit row, never their answer. Failures set `degraded` and are counted, so the
caller can surface the state instead of pretending it stored something.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import httpx

from .schemas import CaseRecord

_SCHEMA = [
    """CREATE TABLE IF NOT EXISTS cases (
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
    )""",
    "CREATE INDEX IF NOT EXISTS idx_cases_fingerprint ON cases (fingerprint, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_cases_status ON cases (status)",
    "CREATE INDEX IF NOT EXISTS idx_cases_type ON cases (request_type)",
]


def _arg(value: Any) -> dict:
    """Python value -> libSQL wire arg. Integers travel as strings."""
    if value is None:
        return {"type": "null"}
    if isinstance(value, bool):
        return {"type": "integer", "value": str(int(value))}
    if isinstance(value, int):
        return {"type": "integer", "value": str(value)}
    if isinstance(value, float):
        return {"type": "float", "value": value}
    return {"type": "text", "value": str(value)}


def _val(cell: dict) -> Any:
    kind = cell.get("type")
    if kind == "null":
        return None
    if kind == "integer":
        return int(cell["value"])
    if kind == "float":
        return float(cell["value"])
    return cell.get("value")


class TursoCaseStore:
    """Same surface as CaseStore, backed by a remote libSQL database."""

    def __init__(self, url: str, token: str, timeout: float = 12.0) -> None:
        base = url.strip().replace("libsql://", "https://").rstrip("/")
        self._endpoint = f"{base}/v2/pipeline"
        self._client = httpx.Client(
            timeout=timeout,
            headers={"Authorization": f"Bearer {token.strip()}"},
        )
        self.degraded = False
        self.failures = 0
        self._ready = False

    # -- transport --------------------------------------------------------

    def _pipeline(self, stmts: list[tuple[str, list]]) -> list[dict]:
        """Run statements in one round trip. Returns raw result objects."""
        requests: list[dict] = [
            {
                "type": "execute",
                "stmt": {"sql": sql, "args": [_arg(a) for a in args]},
            }
            for sql, args in stmts
        ]
        requests.append({"type": "close"})
        resp = self._client.post(self._endpoint, json={"requests": requests})
        resp.raise_for_status()
        body = resp.json()
        out = []
        for item in body.get("results", []):
            if item.get("type") == "error":
                raise RuntimeError(item.get("error", {}).get("message", "libsql error"))
            response = item.get("response") or {}
            if response.get("type") == "execute":
                out.append(response.get("result", {}))
        return out

    def _safe(self, stmts: list[tuple[str, list]]) -> Optional[list[dict]]:
        """_pipeline, but a failure degrades the store instead of raising."""
        try:
            self._ensure_schema()
            return self._pipeline(stmts)
        except Exception:
            self.degraded = True
            self.failures += 1
            return None

    def _ensure_schema(self) -> None:
        if self._ready:
            return
        self._pipeline([(sql, []) for sql in _SCHEMA])
        self._ready = True

    @staticmethod
    def _rows(result: dict) -> list[dict]:
        cols = [c.get("name") for c in result.get("cols", [])]
        return [
            {cols[i]: _val(cell) for i, cell in enumerate(row)}
            for row in result.get("rows", [])
        ]

    # -- writes -----------------------------------------------------------

    def insert(self, case: CaseRecord) -> None:
        self._safe(
            [
                (
                    "INSERT OR REPLACE INTO cases VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                    [
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
                    ],
                )
            ]
        )

    def update_payload(self, case: CaseRecord) -> None:
        self._safe(
            [
                (
                    "UPDATE cases SET request_type=?, urgency=?, status=?, source=?, "
                    "needs_review=?, payload=? WHERE case_id=?",
                    [
                        case.classification.request_type.value,
                        case.classification.urgency.value,
                        case.status.value,
                        case.classification.decision_source.value,
                        int(case.classification.requires_human_review),
                        case.model_dump_json(),
                        case.case_id,
                    ],
                )
            ]
        )

    # -- reads ------------------------------------------------------------

    def recent_duplicate(self, fingerprint: str, window: timedelta) -> Optional[str]:
        cutoff = (datetime.now(timezone.utc) - window).isoformat()
        res = self._safe(
            [
                (
                    "SELECT case_id FROM cases WHERE fingerprint=? AND created_at>=? "
                    "AND status != 'duplicate' ORDER BY created_at DESC LIMIT 1",
                    [fingerprint, cutoff],
                )
            ]
        )
        if not res:
            return None
        rows = self._rows(res[0])
        return rows[0]["case_id"] if rows else None

    def get(self, case_id: str) -> Optional[CaseRecord]:
        res = self._safe([("SELECT payload FROM cases WHERE case_id=?", [case_id])])
        if not res:
            return None
        rows = self._rows(res[0])
        return CaseRecord.model_validate_json(rows[0]["payload"]) if rows else None

    def list_cases(
        self,
        status: Optional[str] = None,
        request_type: Optional[str] = None,
        needs_review: Optional[bool] = None,
        limit: int = 200,
    ) -> list[CaseRecord]:
        sql = "SELECT payload FROM cases"
        clauses: list[str] = []
        args: list[Any] = []
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
            sql += " WHERE " + " AND ".join(clauses)
        sql += " ORDER BY created_at DESC LIMIT ?"
        args.append(limit)

        res = self._safe([(sql, args)])
        if not res:
            return []
        out: list[CaseRecord] = []
        for row in self._rows(res[0]):
            try:
                out.append(CaseRecord.model_validate_json(row["payload"]))
            except Exception:
                continue  # a malformed row must not empty the queue
        return out

    def counts(self) -> dict:
        res = self._safe(
            [
                ("SELECT request_type t, COUNT(*) n FROM cases GROUP BY 1", []),
                ("SELECT status s, COUNT(*) n FROM cases GROUP BY 1", []),
                ("SELECT source s, COUNT(*) n FROM cases GROUP BY 1", []),
                (
                    "SELECT COUNT(*) n FROM cases WHERE needs_review=1 "
                    "AND status IN ('awaiting_human','escalated','new')",
                    [],
                ),
            ]
        )
        out: dict = {
            "by_type": {},
            "by_status": {},
            "by_source": {},
            "total": 0,
            "review_queue": 0,
        }
        if not res or len(res) < 4:
            return out
        for row in self._rows(res[0]):
            out["by_type"][row["t"]] = row["n"]
        for row in self._rows(res[1]):
            out["by_status"][row["s"]] = row["n"]
        for row in self._rows(res[2]):
            out["by_source"][row["s"]] = row["n"]
        rows = self._rows(res[3])
        out["review_queue"] = rows[0]["n"] if rows else 0
        out["total"] = sum(out["by_type"].values())
        return out

    # -- lifecycle --------------------------------------------------------

    def ping(self) -> bool:
        """One cheap round trip, used by the readiness probe."""
        return self._safe([("SELECT 1 AS ok", [])]) is not None

    def close(self) -> None:
        try:
            self._client.close()
        except Exception:
            pass

    def __repr__(self) -> str:  # pragma: no cover - diagnostics only
        state = "degraded" if self.degraded else "ok"
        return f"<TursoCaseStore {state} failures={self.failures}>"


def store_from_env(getenv) -> Optional[TursoCaseStore]:
    """Build a store if both env vars are present, else None.

    None is a first-class outcome, not an error: it is exactly the behaviour
    the deployment had before Turso existed, so an unconfigured environment
    degrades to in-memory processing rather than failing.
    """
    url = getenv("TURSO_DATABASE_URL")
    token = getenv("TURSO_AUTH_TOKEN")
    if not url or not token:
        return None
    try:
        return TursoCaseStore(url, token)
    except Exception:
        return None


__all__ = ["TursoCaseStore", "store_from_env"]
