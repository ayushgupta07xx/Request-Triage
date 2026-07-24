"""
Pre-flight guard + resume-scrub for the one-shot 70B measurement runs
(scripts/diag/, committed - runs more than once, by design).

The test split is spent the instant its rows return, and a run that starts
without enough daily token headroom degrades mid-way. Tonight that cost us the
first attempt. This tool makes tomorrow a checklist instead of a gamble.

Two subcommands:

  preflight  Confirm the measurement patch is live, read live rate-limit
             headroom from a 1-token probe, and refuse (exit 1) if the run
             will not fit the daily token pool with margin. Does NOT read TPD
             directly (headers do not expose it) - it checks RPD headroom and
             prints the token arithmetic for you to confirm against the console.

  scrub      Remove every non-70B row (fell to 8B, Gemini, or the keyword
             floor) from an existing run's .jsonl so that re-invoking
             run_batch with the SAME --name re-attempts exactly those rows
             instead of skipping them as 'done'. Banked 70B rows are kept.

Usage from repo root:
    python3 scripts/diag/run_guard.py preflight --rows 100
    python3 scripts/diag/run_guard.py scrub data/runs/corpus_test70_v2.jsonl
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env")

MODEL = os.getenv("GROQ_MODEL_QUALITY", "llama-3.3-70b-versatile")
KEY = os.getenv("GROQ_API_KEY", "")
URL = "https://api.groq.com/openai/v1/chat/completions"

TOKENS_PER_CALL = 602  # measured on this key via caching_probe.py, no caching
TPD_CEILING = 100_000  # free-tier llama-3.3-70b-versatile
MARGIN = 0.12  # require 12% headroom over the estimate

# Rows whose provenance is the 70B quality model. Anything else in a pinned
# run means the target could not serve and must be re-attempted, never kept.
GOOD_SOURCES = {"llm_primary"}
GOOD_MODELS = {MODEL}


def _probe_headroom() -> dict:
    payload = {
        "model": MODEL,
        "messages": [{"role": "user", "content": "hi"}],
        "max_tokens": 1,
    }
    with httpx.Client(timeout=30.0) as client:
        r = client.post(URL, headers={"Authorization": f"Bearer {KEY}"}, json=payload)
    h = r.headers
    return {
        "status": r.status_code,
        "rpd_limit": h.get("x-ratelimit-limit-requests"),
        "rpd_remaining": h.get("x-ratelimit-remaining-requests"),
        "rpd_reset": h.get("x-ratelimit-reset-requests"),
        "tpm_remaining": h.get("x-ratelimit-remaining-tokens"),
    }


def preflight(rows: int) -> int:
    if not KEY:
        print("FAIL: no GROQ_API_KEY in .env")
        return 1

    # 1. Is the measurement patch actually live?
    try:
        from triage.llm import build_waterfall

        import inspect

        sig = inspect.signature(build_waterfall)
        has_pin = "pin" in sig.parameters
    except Exception as exc:  # noqa: BLE001
        print(f"FAIL: cannot import build_waterfall: {exc}")
        return 1
    if not has_pin:
        print("FAIL: build_waterfall has no 'pin' parameter - patch not applied")
        return 1
    print("ok: build_waterfall(pin=...) present")

    # 2. Live headroom probe (costs 1 request, ~1 token).
    hp = _probe_headroom()
    if hp["status"] != 200:
        print(f"FAIL: probe returned HTTP {hp['status']} - bucket may be dry")
        return 1
    rpd_left = int(hp["rpd_remaining"]) if hp["rpd_remaining"] else 0
    print(
        f"ok: RPD remaining {rpd_left}/{hp['rpd_limit']} "
        f"(reset {hp['rpd_reset']}), TPM remaining {hp['tpm_remaining']}"
    )

    # 3. Token arithmetic (headers do not expose TPD - confirm vs console).
    need = rows * TOKENS_PER_CALL
    need_margin = int(need * (1 + MARGIN))
    print(
        f"\nestimate: {rows} rows x {TOKENS_PER_CALL} = {need:,} tokens "
        f"({need_margin:,} with {int(MARGIN * 100)}% margin)"
    )
    print(f"70B daily ceiling: {TPD_CEILING:,} tokens (rolling, UTC day)")

    fails = []
    if rpd_left < rows * (1 + MARGIN):
        fails.append(f"RPD headroom {rpd_left} < {rows} rows + margin")
    if need_margin > TPD_CEILING:
        fails.append(
            f"estimate {need_margin:,} exceeds the whole daily pool - split "
            f"the run across models or days"
        )
    if fails:
        for f in fails:
            print(f"FAIL: {f}")
        return 1

    print(
        "\nPASS (headers). TPD is NOT in headers - before firing, confirm on "
        f"console.groq.com that today's 70B token usage leaves >= {need_margin:,}."
    )
    return 0


def scrub(path: Path) -> int:
    if not path.exists():
        print(f"FAIL: {path} not found")
        return 1
    rows = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    kept, dropped = [], []
    for r in rows:
        good = (
            r.get("decision_source") in GOOD_SOURCES and r.get("model") in GOOD_MODELS
        )
        (kept if good else dropped).append(r)
    if not dropped:
        print(f"clean: all {len(kept)} rows are 70B - nothing to scrub")
        return 0
    backup = path.with_suffix(".jsonl.prescrub")
    path.rename(backup)
    with open(path, "w", encoding="utf-8") as fh:
        for r in kept:
            fh.write(json.dumps(r) + "\n")
    print(
        f"scrubbed {path.name}: kept {len(kept)} 70B rows, dropped "
        f"{len(dropped)} non-70B ({backup.name} is the pre-scrub backup).\n"
        f"re-run the SAME run_batch command; it will re-attempt only the "
        f"{len(dropped)} dropped example_ids."
    )
    return 0


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    pf = sub.add_parser("preflight")
    pf.add_argument("--rows", type=int, required=True)
    sc = sub.add_parser("scrub")
    sc.add_argument("path")
    args = ap.parse_args()

    if args.cmd == "preflight":
        sys.exit(preflight(args.rows))
    else:
        sys.exit(scrub(Path(args.path)))


if __name__ == "__main__":
    main()
