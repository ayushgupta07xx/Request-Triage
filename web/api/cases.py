"""Read side of live mode: the cases that have accumulated in Turso.

Vercel maps `api/<name>.py` to `/api/<name>`, so this is a separate function
rather than another route on classify.py — a vercel.json rewrite would hand the
function the rewritten destination path and break FastAPI's own routing.

The response is byte-compatible with the baked demo exports, so the console
treats "Live" as one more dataset. An unconfigured or empty database returns a
valid empty payload with 200, never an error: a reviewer who has not processed
anything yet should see an empty queue that explains itself, not a failure.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from fastapi import FastAPI

sys.path.insert(0, str(Path(__file__).resolve().parent))

from triage.live_view import build_dataset, empty_dataset  # noqa: E402
from triage.turso import store_from_env  # noqa: E402

app = FastAPI(title="request-triage live cases")

_STORE = None
_STORE_RESOLVED = False


def _store():
    global _STORE, _STORE_RESOLVED
    if not _STORE_RESOLVED:
        _STORE_RESOLVED = True
        _STORE = store_from_env(os.getenv)
    return _STORE


@app.get("/api/cases")
def cases(limit: int = 200) -> dict:
    store = _store()
    if store is None:
        payload = empty_dataset("live (persistence not configured)")
        payload["storage"] = "ephemeral"
        return payload

    records = store.list_cases(limit=max(1, min(limit, 500)))
    payload = build_dataset(records, "live (libSQL)")
    # A degraded store means we could not read, which is different from having
    # nothing to read. Say which, rather than showing an empty queue as fact.
    payload["storage"] = "degraded" if store.degraded else "turso"
    return payload
