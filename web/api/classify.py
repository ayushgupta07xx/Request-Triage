"""Live-mode API for the hosted console.

Demo mode never touches this file — the front end reads the baked JSON exports
directly, so the app cold-opens with zero keys and zero network. This handler
exists for the live toggle: a reviewer pastes their own message and watches the
real system classify and execute it.

Contract:
  GET  /api/classify   -> readiness + the provider chain this deploy would use
  POST /api/classify
    { "body": str,                  # required
      "subject": str = "",
      "sender": str = "reviewer@demo",
      "channel": "shared_inbox" | "web_form" | "email_batch",
      "simulate_outage": int = 0 }  # force the first N provider tiers to fail
  -> the same flat card `scripts/export_demo.py` bakes, via `triage.card.to_card`

On the outage toggle. The obvious implementation — drop the first N providers
from the waterfall — is wrong: `Waterfall.complete` sets `degraded = index > 0`,
so a surviving provider promoted to index 0 would report itself as the primary
and the degradation would be invisible in the card. Instead every provider stays
in place and the first N are wrapped so they fail. The survivor then sits at a
non-zero index, the engine records `degraded=True` -> `LLM_SECONDARY`, and
skipping every tier raises `ProviderExhausted`, which `triage.classifier` already
catches and answers from the deterministic keyword floor (capped at 0.60
confidence, never auto-resolving). Same code path a real outage takes.

Vercel's filesystem is ephemeral, so `store=None`: the case is classified and
executed in memory and returned. Hosted persistence across visitors is Turso's
job, wired separately.

There is no /api/health route on purpose. Vercel maps `api/classify.py` to the
single path `/api/classify`; a `vercel.json` rewrite would hand the function the
rewritten destination path and break FastAPI's routing. A GET on the same path
is the readiness probe instead.
"""

from __future__ import annotations

import os
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from triage.card import to_card
from triage.config import load_config
from triage.engine import process_request
from triage.llm import Tier, Waterfall, build_waterfall, describe_waterfall
from triage.schemas import Channel, IncomingRequest

app = FastAPI(title="request-triage live API")

# Config is immutable per deploy: load once, reuse across warm invocations.
_CFG = load_config()

# Live mode mirrors the demo's measurement tier so a reviewer sees the same
# model that produced the published numbers, not the cheap bulk tier.
_TIER = Tier.QUALITY


class ClassifyIn(BaseModel):
    body: str
    subject: str = ""
    sender: str = "reviewer@demo"
    channel: str = "shared_inbox"
    simulate_outage: int = 0


class _OutageProvider:
    """A real provider, wrapped so every call fails.

    Delegates everything it does not override, so it stays compatible with the
    Provider surface `Waterfall` touches (`name`, `model`, `state`) without this
    module needing to know that surface. `available()` returns True so the
    waterfall genuinely attempts it and records the failure, rather than
    skipping it as unconfigured.

    The raised error is a 403: `Waterfall.complete` abandons a non-429 4xx
    immediately, where a 5xx would burn retries and backoff sleeps first. We
    want the fallthrough visible, not slow.
    """

    def __init__(self, inner: Any) -> None:
        self._inner = inner

    def __getattr__(self, item: str) -> Any:
        return getattr(self._inner, item)

    def available(self) -> bool:
        return True

    def complete(self, *args: Any, **kwargs: Any) -> Any:
        request = httpx.Request("POST", "https://simulated-outage.invalid")
        raise httpx.HTTPStatusError(
            "simulated provider outage",
            request=request,
            response=httpx.Response(403, request=request),
        )


def _keys_present() -> bool:
    return bool(os.getenv("GROQ_API_KEY") or os.getenv("GEMINI_API_KEY"))


def _waterfall(skip_first: int) -> Waterfall:
    """Production waterfall for the quality tier, optionally degraded.

    Not pinned: live mode wants production behaviour (degrade to stay fast),
    which is the opposite objective to a measurement run.
    """
    wf = build_waterfall(tier=_TIER)
    if skip_first > 0:
        wf.providers = [
            _OutageProvider(p) if i < skip_first else p
            for i, p in enumerate(wf.providers)
        ]
    return wf


@app.get("/api/classify")
def ready() -> dict:
    """Readiness probe. Names the chain without spending a request on it.

    `tiers` matters to the client: how many providers exist decides what
    "all LLM tiers down" means. With a Gemini model configured the chain is
    three deep, so skipping two still reaches a cross-family provider rather
    than the keyword floor. The UI derives its outage options from this list
    instead of assuming a depth.
    """
    configured = _keys_present()
    if not configured:
        return {
            "ok": True,
            "live_mode": False,
            "tier": _TIER.value,
            "providers": None,
            "tiers": [],
            "detail": "No provider keys on this deployment; demo mode shows the "
            "full system offline.",
        }
    wf = build_waterfall(tier=_TIER)
    return {
        "ok": True,
        "live_mode": True,
        "tier": _TIER.value,
        "providers": describe_waterfall(wf),
        "tiers": [f"{p.name}:{p.model}" for p in wf.providers],
        "detail": None,
    }


@app.post("/api/classify")
def classify(payload: ClassifyIn) -> dict:
    if not payload.body.strip():
        raise HTTPException(status_code=400, detail="Empty message body.")
    if len(payload.body) > 8000:
        raise HTTPException(status_code=413, detail="Message too long (8000 max).")
    if not _keys_present():
        raise HTTPException(
            status_code=503,
            detail="Live mode is not configured on this deployment (no provider "
            "keys). Demo mode shows the full system offline.",
        )

    try:
        channel = Channel(payload.channel)
    except ValueError:
        channel = Channel.SHARED_INBOX

    req = IncomingRequest(
        channel=channel,
        sender=payload.sender or "reviewer@demo",
        subject=payload.subject,
        body=payload.body,
    )

    skip = max(0, min(payload.simulate_outage, 4))
    wf = _waterfall(skip)

    try:
        case = process_request(req, _CFG, store=None, waterfall=wf)
    except Exception as exc:  # noqa: BLE001 - surface the reason, never a 500 page
        raise HTTPException(
            status_code=502, detail=f"Pipeline failed: {type(exc).__name__}: {exc}"
        ) from exc

    # sla_reference=None: a single live case has no batch to measure a breach
    # against, and we do not invent one from the wall clock.
    card = to_card(case.model_dump(mode="json"))
    card["_live"] = True
    card["_skipped_tiers"] = skip
    card["_waterfall"] = describe_waterfall(wf)
    return card
