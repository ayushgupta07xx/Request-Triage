#!/usr/bin/env python3
"""End-to-end check of the review API, against local or production.

Runs twice by design - once against the merged local uvicorn, once against the
deployed functions - because local success proves nothing about the deployed
path. `uvicorn --app-dir` puts the vendored package on sys.path for us and has
already hidden a ModuleNotFoundError that 500'd every hosted request.

Every case this script reviews is one it minted itself, via /api/classify with
every provider tier simulated down. The deterministic keyword floor answers,
which costs zero tokens and leaves the seeded showcase cases untouched. The
minted cases are printed at the end with the SQL to remove them.

Usage:
    python3 scripts/diag/test_review_api.py --base http://localhost:8000
    python3 scripts/diag/test_review_api.py --base https://handoff-triage.vercel.app
"""

from __future__ import annotations

import argparse
import sys
import time
import uuid

import httpx

TYPES = [
    "billing_dispute",
    "general_enquiry",
    "service_request",
    "financial_hardship",
    "other",
]

RESULTS: list[tuple[bool, str, str]] = []
MINTED: list[str] = []


def check(ok: bool, name: str, detail: str = "") -> bool:
    RESULTS.append((ok, name, detail))
    print(f"  {'PASS' if ok else 'FAIL'}  {name}{('  — ' + detail) if detail else ''}")
    return ok


def info(name: str, detail: str) -> None:
    RESULTS.append((True, f"(info) {name}", detail))
    print(f"  info  {name} — {detail}")


def mint(client: httpx.Client, subject: str, body: str, outages: int) -> dict | None:
    """Create a live case decided by the keyword floor: zero tokens, disposable."""
    tag = uuid.uuid4().hex[:8]
    r = client.post(
        "/api/classify",
        json={
            "subject": f"{subject} [{tag}]",
            "body": f"{body} Reference {tag}.",
            "sender": "stage1-check@local",
            "channel": "shared_inbox",
            "simulate_outage": outages,
        },
        timeout=60.0,
    )
    if r.status_code != 200:
        check(False, f"mint '{subject}'", f"HTTP {r.status_code}: {r.text[:160]}")
        return None
    card = r.json()
    if card.get("status") == "duplicate":
        check(False, f"mint '{subject}'", "suppressed as duplicate; rerun in a minute")
        return None
    MINTED.append(card["case_id"])
    return card


def review(client: httpx.Client, **payload) -> httpx.Response:
    return client.post("/api/review", json=payload, timeout=60.0)


def status_of(client: httpx.Client, case_id: str) -> dict | None:
    """Re-read through the endpoint that serves the console, not the write reply."""
    r = client.get("/api/cases", params={"limit": 200}, timeout=60.0)
    if r.status_code != 200:
        return None
    for c in r.json().get("cases", []):
        if c.get("case_id") == case_id:
            return c
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True, help="e.g. http://localhost:8000")
    args = ap.parse_args()
    client = httpx.Client(base_url=args.base.rstrip("/"))

    print(f"\n=== review API check against {args.base} ===\n")

    # --- readiness ---------------------------------------------------------
    r = client.get("/api/review", timeout=60.0)
    if not check(
        r.status_code == 200, "GET /api/review returns 200", f"HTTP {r.status_code}"
    ):
        return 1
    ready = r.json()
    check(
        ready.get("storage") == "turso",
        "store is configured and healthy",
        str(ready.get("storage")),
    )

    # How many tiers to knock out so the floor answers. The live console
    # derives its "All" button from the same chain.
    chain = []
    rc = client.get("/api/classify", timeout=60.0)
    if rc.status_code == 200:
        for value in rc.json().values():
            if isinstance(value, list) and value:
                chain = value
                break
    outages = len(chain) or 3
    info("provider tiers to simulate down", f"{outages} (floor answers, 0 tokens)")

    # --- approve -----------------------------------------------------------
    print("\n-- approve --")
    a = mint(
        client,
        "Payment taken twice",
        "You have taken two payments this month for the same instalment.",
        outages,
    )
    if a is None:
        return 1
    check(
        a["status"] in ("awaiting_human", "escalated"),
        "minted case is reviewable",
        a["status"],
    )
    check(
        a["decision_source"] == "keyword_fallback",
        "minted by the floor, no model call",
        a["decision_source"],
    )

    r = review(
        client,
        case_id=a["case_id"],
        action="approve",
        note="checked against account notes",
    )
    ok = check(
        r.status_code == 200,
        "approve returns 200",
        f"HTTP {r.status_code}: {r.text[:160]}",
    )
    if ok:
        card = r.json()
        check(card.get("_review") == "approved", "response marks the case approved")
        check(
            card["status"] == a["status"],
            "approve moved nothing",
            f"{a['status']} -> {card['status']}",
        )
        summaries = [s.get("summary") for s in card.get("trace", [])]
        check("Human review: disposition confirmed" in summaries, "audit step appended")
        served = status_of(client, a["case_id"])
        check(
            bool(served)
            and "Human review: disposition confirmed"
            in [s.get("summary") for s in served.get("trace", [])],
            "persisted — visible through /api/cases",
        )

    r = review(client, case_id=a["case_id"], action="approve")
    check(r.status_code == 409, "second approve is refused", f"HTTP {r.status_code}")

    # An approval is the record that a person looked; it is never undone. The
    # operational answer to a mis-click is to correct forward, which must work
    # on a case that has already been approved.
    r = review(
        client,
        case_id=a["case_id"],
        action="override",
        request_type="financial_hardship",
        note="approved by mistake",
    )
    check(
        r.status_code == 200,
        "an approved case can still be corrected",
        f"HTTP {r.status_code}: {r.text[:120]}",
    )

    # --- override ----------------------------------------------------------
    print("\n-- override --")
    b = mint(
        client,
        "Wrong charge on my account",
        "There is a fee on my statement I did not agree to.",
        outages,
    )
    if b is None:
        return 1
    target = next(
        t for t in TYPES if t != b["request_type"] and t != "financial_hardship"
    )
    r = review(
        client,
        case_id=b["case_id"],
        action="override",
        request_type=target,
        urgency="high",
        note="reviewer correction",
    )
    ok = check(
        r.status_code == 200,
        f"override {b['request_type']} -> {target}",
        f"HTTP {r.status_code}: {r.text[:160]}",
    )
    if ok:
        card = r.json()
        check(card.get("_review") == "overridden", "response marks the case overridden")
        check(
            card["request_type"] == target, "corrected label is the acted-on decision"
        )
        check(card["urgency"] == "high", "urgency correction applied")
        check(
            card["decision_source"] == "human_override",
            "provenance is human_override",
            card["decision_source"],
        )
        check(
            card["branch"] == target,
            "the corrected branch ran",
            str(card.get("branch")),
        )
        check(
            len(card.get("trace", [])) >= 2,
            "branch executed at least two steps",
            f"{len(card.get('trace', []))} steps",
        )
        audit = [
            s.get("artifact")
            for s in card.get("trace", [])
            if s.get("summary") == "Human review: label corrected"
        ]
        check(
            bool(audit) and "reviewer corrected to" in (audit[0] or ""),
            "three-layer audit line recorded",
        )
        if audit:
            info("audit line", audit[0][:150])
        served = status_of(client, b["case_id"])
        check(
            bool(served) and served["decision_source"] == "human_override",
            "persisted — visible through /api/cases",
        )
        check(
            bool(served) and served["case_id"] == b["case_id"],
            "same case_id — no second row forked",
        )

    # Corrections are append-only: correcting again to a DIFFERENT label is
    # accepted and recorded on top, while re-submitting the decision already in
    # force is refused as a no-op.
    again = "other" if target != "other" else "service_request"
    r = review(client, case_id=b["case_id"], action="override", request_type=again)
    check(
        r.status_code == 200,
        "a second correction is accepted",
        f"HTTP {r.status_code}: {r.text[:120]}",
    )
    if r.status_code == 200:
        steps = [s.get("summary") for s in r.json().get("trace", [])]
        # Exactly two: the first correction and this one. ">= 1" passed while
        # the re-run was silently discarding the first, which is precisely the
        # kind of assertion that agrees with whoever wrote it.
        check(
            steps.count("Human review: label corrected") == 2,
            "both corrections survive in the trace",
            f"{steps.count('Human review: label corrected')} correction step(s)",
        )
    r = review(client, case_id=b["case_id"], action="override", request_type=again)
    check(
        r.status_code == 409,
        "re-submitting the current label is refused",
        f"HTTP {r.status_code}",
    )

    # --- the safety claim --------------------------------------------------
    print("\n-- grounding survives a human being certain --")
    c = mint(
        client,
        "Zorbit quandle",
        "Frimbulate wossname thruntle pib, quandle zorbit.",
        outages,
    )
    if c is not None and c["request_type"] != "general_enquiry":
        r = review(
            client,
            case_id=c["case_id"],
            action="override",
            request_type="general_enquiry",
            note="reads like a question",
        )
        if check(
            r.status_code == 200,
            "override into the grounded branch",
            f"HTTP {r.status_code}: {r.text[:160]}",
        ):
            card = r.json()
            check(
                card["status"] != "auto_resolved",
                "ungrounded enquiry did NOT close itself",
                f"status={card['status']}",
            )
            info(
                "grounded branch outcome",
                f"{card['status']} (no KB source, so a person keeps it)",
            )
    elif c is not None:
        info("skipped", "floor already labelled it general_enquiry; nothing to correct")

    # --- rejections --------------------------------------------------------
    print("\n-- rejections --")
    r = review(client, case_id="case_does_not_exist", action="approve")
    check(r.status_code == 404, "unknown case_id -> 404", f"HTTP {r.status_code}")
    r = review(client, case_id=a["case_id"], action="sideways")
    check(r.status_code == 400, "unknown action -> 400", f"HTTP {r.status_code}")
    r = review(client, case_id=a["case_id"], action="override")
    check(
        r.status_code == 400, "override without a type -> 400", f"HTTP {r.status_code}"
    )
    r = review(
        client, case_id=a["case_id"], action="override", request_type="not_a_type"
    )
    check(r.status_code == 400, "unknown request_type -> 400", f"HTTP {r.status_code}")
    r = review(
        client,
        case_id=a["case_id"],
        action="override",
        request_type="other",
        urgency="yesterday",
    )
    check(r.status_code == 400, "unknown urgency -> 400", f"HTTP {r.status_code}")

    # --- summary -----------------------------------------------------------
    failed = [name for ok, name, _ in RESULTS if not ok]
    print(f"\n{'=' * 62}")
    print(f"{len(RESULTS) - len(failed)} checks passed, {len(failed)} failed")
    for name in failed:
        print(f"  FAILED: {name}")
    if MINTED:
        ids = ", ".join(f"'{c}'" for c in MINTED)
        print(f"\nMinted {len(MINTED)} disposable case(s). To remove them:")
        print(f'  turso db shell handoff "DELETE FROM cases WHERE case_id IN ({ids})"')
    print(f"{'=' * 62}\n")
    return 1 if failed else 0


if __name__ == "__main__":
    time.sleep(0)
    sys.exit(main())
