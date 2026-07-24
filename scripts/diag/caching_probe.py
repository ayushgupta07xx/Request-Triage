"""
Caching + per-call cost probe (scripts/diag/, committed - may run twice).

Sends the REAL classifier SYSTEM_PROMPT to the 70B quality model twice, a few
seconds apart, and prints the usage block each time. Answers two questions with
one cheap experiment (2 small calls):

  1. Is prompt caching actually active on our model? Groq's docs list caching
     support only for the gpt-oss family, NOT the llama models we use. If the
     docs are right, cached_tokens is 0/absent on BOTH calls even though the
     system prompt is byte-identical. This measures that on our own key instead
     of asserting it from a doc.

  2. What does a real classification call cost in tokens? total_tokens here is
     the planning number for how many test/holdout rows fit in the 100K/day 70B
     TPD pool - the number the headers never expose.

Run from repo root:
    python3 scripts/diag/caching_probe.py
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env")

from triage.classifier import SYSTEM_PROMPT  # noqa: E402

MODEL = os.getenv("GROQ_MODEL_QUALITY", "llama-3.3-70b-versatile")
KEY = os.getenv("GROQ_API_KEY", "")
URL = "https://api.groq.com/openai/v1/chat/completions"

# A representative user message (matches classifier._user_prompt shape).
USER = (
    "Subject: Overcharged on my mortgage statement\n\n"
    "Message:\nI have been charged an arrangement fee of 250 that I never "
    "agreed to. Please explain why this appears on my latest statement and "
    "reverse it if it is an error."
)


def one_call(label: str) -> dict | None:
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": USER},
        ],
        "temperature": 0.0,
        "response_format": {"type": "json_object"},
    }
    with httpx.Client(timeout=60.0) as client:
        r = client.post(URL, headers={"Authorization": f"Bearer {KEY}"}, json=payload)
    if r.status_code != 200:
        print(f"[{label}] HTTP {r.status_code}: {r.text[:200]}")
        return None
    usage = r.json().get("usage", {}) or {}
    cached = (usage.get("prompt_tokens_details") or {}).get("cached_tokens")
    print(
        f"[{label}] prompt={usage.get('prompt_tokens')} "
        f"completion={usage.get('completion_tokens')} "
        f"total={usage.get('total_tokens')} cached_tokens={cached}"
    )
    return usage


def main() -> None:
    if not KEY:
        sys.exit("no GROQ_API_KEY in .env")
    print(f"model: {MODEL}")
    print(f"system prompt chars: {len(SYSTEM_PROMPT)}")
    u1 = one_call("call-1 (cold: creates cache if supported)")
    time.sleep(3)
    u2 = one_call("call-2 (warm: cache hit here IF supported)")

    print("\n--- verdict ---")
    c2 = (u2 or {}).get("prompt_tokens_details", {}) or {}
    cached2 = c2.get("cached_tokens") or 0
    if cached2 and cached2 > 0:
        print(f"CACHING ACTIVE: call-2 served {cached2} cached tokens.")
    else:
        print(
            "NO CACHING: call-2 reports 0/absent cached_tokens despite an "
            "identical system prompt - consistent with llama models being "
            "unsupported for caching. Every call pays full prompt cost."
        )
    per_call = (u2 or u1 or {}).get("total_tokens")
    if per_call:
        print(f"real per-call cost: ~{per_call} total_tokens")
        print(f"  100-row test  ~= {per_call * 100:,} tokens")
        print(f"  40-row holdout ~= {per_call * 40:,} tokens")
        print("  (70B pool = 100,000 tokens/day, rolling)")


if __name__ == "__main__":
    main()
