"""Live-mode API for the hosted demo.

Demo mode does not touch this file at all -- the front-end reads the baked
demo.json directly, so the app cold-opens with zero keys and zero network.
This handler exists only for the live toggle: a reviewer pastes their own
message and watches the real system classify and execute it.

Contract:
  POST /api/classify
    { "body": str,               # required: the message text
      "subject": str = "",
      "sender": str = "reviewer@demo",
      "channel": "shared_inbox",
      "simulate_outage": int = 0  # skip the first N providers (see below)
    }
  -> the same card object export_demo.py bakes, via triage.card.to_card.

The "simulate provider outage" toggle is the reliability-rubric line, made
self-serve. It runs the *real* waterfall on the *real* code path and simply
forces the first N tiers to fail, so the reviewer sees genuine degradation
(primary -> secondary -> keyword floor) rather than a staged animation. This
replaces the old "kill the API key on camera" beat: same evidence, no theatre,
reproducible by anyone with the URL.

On Vercel the filesystem is ephemeral, so store=None: we classify and execute
in-memory and return the case. Hosted persistence (accumulating cases across
visitors) is Turso's job, wired separately and timeboxed; it is not required
for a correct live response.
"""

from __future__ import annotations

import os

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from triage.card import to_card
from triage.config import load_config
from triage.engine import process_request
from triage.llm import Waterfall
from triage.schemas import Channel, IncomingRequest

app = FastAPI(title="request-triage live API")

# Config is immutable per deploy: load once, reuse across invocations.
_CFG = load_config()


class ClassifyIn(BaseModel):
    body: str
    subject: str = ""
    sender: str = "reviewer@demo"
    channel: str = "shared_inbox"
    simulate_outage: int = 0


def _build_waterfall(skip_first: int) -> Waterfall:
    """Real measurement/production waterfall for live requests.

    Keys come from Vercel env vars. `skip_first` forces the leading N provider
    tiers to fail so the outage toggle exercises real fallthrough. We do NOT
    pin here: live mode wants production behaviour (degrade to stay fast),
    which is the opposite of a measurement run. If no keys are configured we
    fail clean rather than silently returning floor-only results dressed up as
    a live LLM answer.
    """
    if not os.getenv("GROQ_API_KEY") and not os.getenv("GEMINI_API_KEY"):
        raise HTTPException(
            status_code=503,
            detail="Live mode is not configured on this deployment "
            "(no provider keys). Demo mode shows the full system offline.",
        )
    # NOTE(verify): confirm Waterfall's real constructor kwargs before deploy
    # -- pin/skip_first names checked against triage/llm.py Waterfall.__init__.
    return Waterfall(skip_first=skip_first)


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "mode": "live-capable"}


@app.post("/api/classify")
def classify(payload: ClassifyIn) -> dict:
    if not payload.body.strip():
        raise HTTPException(status_code=400, detail="Empty message body.")

    try:
        channel = Channel(payload.channel)
    except ValueError:
        channel = Channel.SHARED_INBOX  # NOTE(verify): enum member name

    # NOTE(verify): IncomingRequest field names (body/subject/sender/channel)
    # against triage/schemas.py IncomingRequest.
    req = IncomingRequest(
        channel=channel,
        sender=payload.sender,
        subject=payload.subject,
        body=payload.body,
    )

    waterfall = _build_waterfall(max(0, payload.simulate_outage))

    case = process_request(
        req,
        _CFG,
        store=None,  # ephemeral FS on Vercel; Turso handles persistence
        waterfall=waterfall,
    )

    # Same projection the exporter uses. sla_reference=None: one live case has
    # no batch to measure a breach against, and we do not invent one.
    return to_card(case.model_dump(mode="json"))
