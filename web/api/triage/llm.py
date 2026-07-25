"""
LLM access layer.

Three ideas carry this module, and each is worth being able to defend:

1. Tiered models, not one model. Corpus generation and eval sweeps are
   high-volume, low-judgement work and run on the cheap bulk model. The final
   measured run and the live demo run on the quality model. Groq meters each
   model in a separate quota bucket, so this is additive headroom rather than
   a trade-off.

2. The waterfall degrades rather than fails. If the primary provider is rate
   limited or down, the next tier answers. If every provider is exhausted the
   caller gets an explicit exhaustion signal and falls back to the
   deterministic keyword classifier, so the system keeps completing branches
   with no model at all.

3. Backoff reads the provider's own headers instead of guessing. Groq returns
   remaining requests/tokens and a reset interval; honouring those is the
   difference between riding the limit and hammering it.

The system prompt is never interpolated. It is byte-identical on every call so
that prompt caching applies, and cached tokens do not count against the rate
limit.
"""

from __future__ import annotations

import json
import os
import random
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

import httpx


class Tier(str, Enum):
    BULK = "bulk"
    QUALITY = "quality"


class ProviderExhausted(RuntimeError):
    """Every provider in the waterfall refused or failed."""


@dataclass
class LLMResponse:
    text: str
    provider: str
    model: str
    latency_ms: int
    attempts: int = 1
    degraded: bool = False
    tier: Optional[str] = None
    usage: Optional[dict] = None

    def json(self) -> dict:
        """Parse the response as JSON, tolerating fenced output."""
        raw = self.text.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.lstrip().lower().startswith("json"):
                raw = raw.lstrip()[4:]
        return json.loads(raw.strip())


@dataclass
class RateLimitState:
    """Last-known rate limit position, read from response headers."""

    remaining_requests: Optional[int] = None
    remaining_tokens: Optional[int] = None
    reset_seconds: Optional[float] = None
    last_429_at: Optional[float] = None


def _parse_reset(value: Optional[str]) -> Optional[float]:
    """Groq reports resets like '6m11.52s', '2.5s' or '1h2m'."""
    if not value:
        return None
    total, num = 0.0, ""
    for ch in value:
        if ch.isdigit() or ch == ".":
            num += ch
        elif ch == "h":
            total += float(num or 0) * 3600
            num = ""
        elif ch == "m":
            total += float(num or 0) * 60
            num = ""
        elif ch == "s":
            total += float(num or 0)
            num = ""
    if num:
        total += float(num)
    return total or None


class Provider:
    name = "base"

    def __init__(self, model: str, api_key: str, timeout: float = 60.0):
        self.model = model
        self.api_key = api_key
        self.timeout = timeout
        self.state = RateLimitState()

    def available(self) -> bool:
        return bool(self.api_key and self.model)

    def complete(
        self, system: str, user: str, json_mode: bool = True, temperature: float = 0.0
    ) -> LLMResponse:
        raise NotImplementedError


class GroqProvider(Provider):
    """OpenAI-compatible endpoint. Quotas are metered per model."""

    name = "groq"
    BASE = "https://api.groq.com/openai/v1/chat/completions"

    def complete(
        self, system: str, user: str, json_mode: bool = True, temperature: float = 0.0
    ) -> LLMResponse:
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": temperature,
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        started = time.perf_counter()
        with httpx.Client(timeout=self.timeout) as client:
            r = client.post(
                self.BASE,
                headers={"Authorization": f"Bearer {self.api_key}"},
                json=payload,
            )
        self._absorb_headers(r.headers)
        if r.status_code == 429:
            self.state.last_429_at = time.time()
            raise httpx.HTTPStatusError("rate limited", request=r.request, response=r)
        r.raise_for_status()
        body = r.json()
        return LLMResponse(
            text=body["choices"][0]["message"]["content"],
            provider=self.name,
            model=self.model,
            latency_ms=int((time.perf_counter() - started) * 1000),
            usage=body.get("usage") if isinstance(body.get("usage"), dict) else None,
        )

    def _absorb_headers(self, headers) -> None:
        def as_int(key):
            try:
                return int(headers.get(key))
            except (TypeError, ValueError):
                return None

        self.state.remaining_requests = as_int("x-ratelimit-remaining-requests")
        self.state.remaining_tokens = as_int("x-ratelimit-remaining-tokens")
        self.state.reset_seconds = _parse_reset(
            headers.get("retry-after") or headers.get("x-ratelimit-reset-requests")
        )


class GeminiProvider(Provider):
    """Failover tier. Separate vendor, separate quota, different reset clock."""

    name = "gemini"

    def complete(
        self, system: str, user: str, json_mode: bool = True, temperature: float = 0.0
    ) -> LLMResponse:
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self.model}:generateContent"
        )
        gen_cfg = {"temperature": temperature}
        if json_mode:
            gen_cfg["response_mime_type"] = "application/json"
        payload = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": user}]}],
            "generationConfig": gen_cfg,
        }

        started = time.perf_counter()
        with httpx.Client(timeout=self.timeout) as client:
            r = client.post(url, headers={"x-goog-api-key": self.api_key}, json=payload)
        if r.status_code == 429:
            self.state.last_429_at = time.time()
            self.state.reset_seconds = _parse_reset(r.headers.get("retry-after"))
            raise httpx.HTTPStatusError("rate limited", request=r.request, response=r)
        r.raise_for_status()
        body = r.json()
        text = body["candidates"][0]["content"]["parts"][0]["text"]
        return LLMResponse(
            text=text,
            provider=self.name,
            model=self.model,
            latency_ms=int((time.perf_counter() - started) * 1000),
        )


@dataclass
class Waterfall:
    """
    Ordered providers. Each is retried with jittered backoff, then abandoned
    in favour of the next. Exhausting all of them raises, which the caller
    treats as the signal to use the deterministic classifier.
    """

    providers: list[Provider] = field(default_factory=list)
    max_retries: int = 3
    max_wait_seconds: float = 25.0
    last_usage: Optional[dict] = None

    def complete(
        self, system: str, user: str, json_mode: bool = True, temperature: float = 0.0
    ) -> LLMResponse:
        errors: list[str] = []
        for index, provider in enumerate(self.providers):
            if not provider.available():
                errors.append(f"{provider.name}: not configured")
                continue
            for attempt in range(1, self.max_retries + 1):
                try:
                    resp = provider.complete(
                        system, user, json_mode=json_mode, temperature=temperature
                    )
                    resp.attempts = attempt
                    resp.degraded = index > 0
                    self.last_usage = resp.usage
                    return resp
                except httpx.HTTPStatusError as exc:
                    status = exc.response.status_code if exc.response else 0
                    # 4xx that is not a rate limit will not fix itself.
                    if status and status != 429 and 400 <= status < 500:
                        errors.append(f"{provider.name}: HTTP {status}")
                        break
                    wait = self._wait_for(provider, attempt)
                    if wait is None or attempt == self.max_retries:
                        errors.append(f"{provider.name}: HTTP {status or '?'}")
                        break
                    time.sleep(wait)
                except (httpx.TimeoutException, httpx.TransportError) as exc:
                    if attempt == self.max_retries:
                        errors.append(f"{provider.name}: {type(exc).__name__}")
                        break
                    time.sleep(self._backoff(attempt))
        raise ProviderExhausted("; ".join(errors) or "no providers configured")

    def _wait_for(self, provider: Provider, attempt: int) -> Optional[float]:
        """Prefer the provider's own reset hint; fall back to exponential."""
        hint = provider.state.reset_seconds
        if hint is not None:
            # A multi-minute reset means the day's bucket is gone. Do not sit
            # on it - move to the next provider instead.
            return hint + 0.5 if hint <= self.max_wait_seconds else None
        return self._backoff(attempt)

    @staticmethod
    def _backoff(attempt: int) -> float:
        return min(2.0**attempt, 16.0) + random.uniform(0, 0.75)


def build_waterfall(tier: Tier = Tier.BULK, pin: bool = False) -> Waterfall:
    """Assemble the waterfall for a tier from environment configuration.

    pin=True builds a MEASUREMENT-mode waterfall: the tier's primary model
    only, with generous patience so it waits out per-minute (TPM) congestion
    instead of degrading to a different model. Production degrades to stay
    fast; a measurement run must not, because a silent same-family swap (8B
    answering for 70B) would masquerade as an LLM decision and contaminate
    provenance. Genuine daily exhaustion (reset hint in hours, above the wait
    cap) still raises -> the caller falls to the keyword floor, a VISIBLE
    non-LLM row we can see and re-run, never a hidden substitution.
    """
    groq_key = os.getenv("GROQ_API_KEY", "")
    gemini_key = os.getenv("GEMINI_API_KEY", "")

    if tier is Tier.BULK:
        primary = os.getenv("GROQ_MODEL_BULK", "llama-3.1-8b-instant")
        secondary = os.getenv("GROQ_MODEL_QUALITY", "llama-3.3-70b-versatile")
    else:
        primary = os.getenv("GROQ_MODEL_QUALITY", "llama-3.3-70b-versatile")
        secondary = os.getenv("GROQ_MODEL_BULK", "llama-3.1-8b-instant")

    if pin:
        return Waterfall(
            providers=[GroqProvider(primary, groq_key)],
            max_retries=6,
            max_wait_seconds=70.0,
        )

    providers: list[Provider] = [
        GroqProvider(primary, groq_key),
        GroqProvider(secondary, groq_key),
    ]
    gemini_model = os.getenv("GEMINI_MODEL", "").strip()
    if gemini_model:
        providers.append(GeminiProvider(gemini_model, gemini_key))
    return Waterfall(providers=providers)


def describe_waterfall(wf: Waterfall) -> str:
    parts = [
        f"{p.name}:{p.model}{'' if p.available() else ' (unconfigured)'}"
        for p in wf.providers
    ]
    return " -> ".join(parts)
