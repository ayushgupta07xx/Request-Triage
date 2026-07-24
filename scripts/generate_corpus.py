"""
Generates the labelled corpus and the adversarial set.

Ground truth comes from the generation spec, not from a model reading the
message afterwards: each cell is asked for messages of a known type and
urgency, and that requested pair becomes the label. This is disclosed in the
README because it means measured accuracy is an upper bound - the classifier
and the generator share a family of priors. It is honest synthetic data, not
a field estimate.

Resumable by construction. Every example is appended to JSONL the moment it
is produced, and a resumed run counts what already exists per cell and asks
only for the shortfall. A sweep that dies at example 280 of 300 costs twenty
examples, not a quota window.

Usage, from /home/ayushgupta15062003/code/request-triage:

    python3 scripts/generate_corpus.py --dry-run          # no API calls
    python3 scripts/generate_corpus.py --target corpus
    python3 scripts/generate_corpus.py --target adversarial
    python3 scripts/generate_corpus.py --split
"""

from __future__ import annotations

import argparse
import itertools
import json
import random
import sys
from collections import Counter
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from triage.llm import ProviderExhausted, Tier, build_waterfall, describe_waterfall  # noqa: E402
from triage.schemas import Channel, RequestType, Urgency  # noqa: E402

CORPUS_PATH = ROOT / "data" / "corpus" / "corpus.jsonl"
ADVERSARIAL_PATH = ROOT / "data" / "corpus" / "adversarial.jsonl"

BATCH_SIZE = 4
DEV_FRACTION = 2 / 3

# Generation runs hot. Classification later runs at 0.0 - these are opposite
# jobs. At temperature 0 an identical cell prompt returns identical messages
# on every call, which silently produced a corpus that was two-thirds
# duplicates on the first attempt.
GENERATION_TEMPERATURE = 1.0

# Rotated into the USER prompt only, never the system prompt, so the cached
# system prompt stays byte-identical and prompt caching still applies.
VARIETY_HINTS = [
    "a first-time borrower in their twenties, informal, writes in lower case",
    "a retired customer, formal and courteous, long sentences",
    "a self-employed customer referencing their accountant",
    "a customer writing from a phone between meetings, clipped",
    "a joint account holder writing on behalf of both parties",
    "a customer who has already phoned twice and says so",
    "a customer whose first language is not English, simple phrasing",
    "a landlord with a buy-to-let mortgage, businesslike",
    "a customer quoting a previous reference number and date",
    "a customer who is polite but clearly at the end of their patience",
    "a customer forwarding an earlier message with a one-line addition",
    "a meticulous customer who numbers their points",
]

# The `other` class gets its own roster. The product hints below actively
# contradict it - asking for a message about "a buy-to-let mortgage" while
# also demanding it be out of scope produced a class that was ~100% wrong on
# the first run. Never let two hint sources fight over the same cell.
OTHER_HINTS = [
    "a marketing email from an office supplies company, addressed to nobody",
    "a phishing attempt impersonating a different bank, urging a password reset",
    "a message plainly meant for a mobile phone provider about a contract",
    "an automated out-of-office auto-reply that has bounced into the inbox",
    "a customer of an entirely different lender who has the wrong address",
    "a supplier invoice misrouted from an accounts payable inbox",
    "a recruitment cold-email pitching contract developers",
    "an unintelligible fragment with no discernible request at all",
    "a newsletter subscription confirmation from a retail brand",
    "someone cold-selling search engine optimisation services",
    "a delivery notification for a parcel from an unrelated courier",
    "a chain message forwarded by mistake, no request in it",
]

PRODUCT_HINTS = [
    "a residential mortgage",
    "a buy-to-let mortgage",
    "a personal loan",
    "a secured homeowner loan",
    "a mortgage in arrears",
    "a fixed-rate deal approaching expiry",
]

# --------------------------------------------------------------------------
# Distribution
#
# Deliberately not a uniform cross-product. Hardship is never low urgency;
# enquiries are rarely critical. A flat grid would be easier to generate and
# would misrepresent an operations queue.
# --------------------------------------------------------------------------
CORPUS_SPEC: dict[tuple[RequestType, Urgency], int] = {
    (RequestType.BILLING_DISPUTE, Urgency.LOW): 9,
    (RequestType.BILLING_DISPUTE, Urgency.MEDIUM): 24,
    (RequestType.BILLING_DISPUTE, Urgency.HIGH): 21,
    (RequestType.BILLING_DISPUTE, Urgency.CRITICAL): 6,
    (RequestType.GENERAL_ENQUIRY, Urgency.LOW): 39,
    (RequestType.GENERAL_ENQUIRY, Urgency.MEDIUM): 18,
    (RequestType.GENERAL_ENQUIRY, Urgency.HIGH): 6,
    (RequestType.GENERAL_ENQUIRY, Urgency.CRITICAL): 3,
    (RequestType.SERVICE_REQUEST, Urgency.LOW): 18,
    (RequestType.SERVICE_REQUEST, Urgency.MEDIUM): 33,
    (RequestType.SERVICE_REQUEST, Urgency.HIGH): 15,
    (RequestType.SERVICE_REQUEST, Urgency.CRITICAL): 3,
    (RequestType.FINANCIAL_HARDSHIP, Urgency.MEDIUM): 9,
    (RequestType.FINANCIAL_HARDSHIP, Urgency.HIGH): 24,
    (RequestType.FINANCIAL_HARDSHIP, Urgency.CRITICAL): 18,
    (RequestType.OTHER, Urgency.LOW): 33,
    (RequestType.OTHER, Urgency.MEDIUM): 12,
    (RequestType.OTHER, Urgency.HIGH): 6,
    (RequestType.OTHER, Urgency.CRITICAL): 3,
}

# Each adversarial kind carries the label a competent human reviewer would
# assign. These are the cases that separate a classifier from a keyword match.
ADVERSARIAL_SPEC: dict[str, dict] = {
    "multi_intent": {
        "count": 8,
        "type": RequestType.BILLING_DISPUTE,
        "urgency": Urgency.HIGH,
        "brief": (
            "MANDATORY: every message must contain TWO clearly separate "
            "requests - a billing dispute AND an unrelated service request "
            "(for example an address change or a statement copy). The second "
            "request must be unmistakable and must not be about the dispute. "
            "The dispute is the dominant intent."
        ),
    },
    "buried_hardship": {
        "count": 6,
        "type": RequestType.FINANCIAL_HARDSHIP,
        "urgency": Urgency.CRITICAL,
        "brief": (
            "Opens as a routine enquiry and only discloses serious financial "
            "difficulty in the third or fourth sentence, without drama."
        ),
    },
    "polite_fury": {
        "count": 4,
        "type": RequestType.BILLING_DISPUTE,
        "urgency": Urgency.CRITICAL,
        "brief": (
            "Extremely polite, formal wording that nonetheless threatens "
            "regulatory referral. Tone and urgency deliberately mismatch."
        ),
    },
    "garbled": {
        "count": 4,
        "type": RequestType.SERVICE_REQUEST,
        "urgency": Urgency.MEDIUM,
        "brief": (
            "Typed hastily on a phone. Poor punctuation, typos, no greeting, "
            "but the underlying request is still recoverable."
        ),
    },
    "out_of_scope": {
        "count": 4,
        "type": RequestType.OTHER,
        "urgency": Urgency.LOW,
        "brief": (
            "Marketing mail, a wrong-number message or a supplier invoice "
            "that reached a customer inbox by mistake."
        ),
    },
    "terse": {
        "count": 4,
        "type": RequestType.GENERAL_ENQUIRY,
        "urgency": Urgency.LOW,
        "brief": "Under fifteen words. Genuinely ambiguous but answerable.",
    },
}

# Byte-identical on every call so prompt caching applies. Nothing is
# interpolated into this string.
SYSTEM_PROMPT = """You write realistic inbound customer messages for a UK consumer lending and mortgage servicing operations desk, for use as labelled test data.

Rules:
- Write what a real customer would send. Vary register, length, punctuation and competence.
- Never state the category or urgency in the message itself.
- No placeholder text. Invent plausible names, reference numbers and amounts.
- Vary the opening. Do not begin every message the same way.
- Return ONLY a JSON object of the form:
  {"examples": [{"subject": "...", "body": "...", "sender": "name@example.com"}]}
"""


def _user_prompt(
    rt: RequestType, urg: Urgency, n: int, brief: str = "", nonce: int = 0
) -> str:
    guidance = {
        RequestType.BILLING_DISPUTE: "disputes a charge, fee, interest amount or how a payment was applied",
        RequestType.GENERAL_ENQUIRY: "asks for information answerable from published policy - rates, terms, process",
        RequestType.SERVICE_REQUEST: "asks for an action on the account - statement copy, address change, payment date change, payoff quote",
        RequestType.FINANCIAL_HARDSHIP: "discloses difficulty paying, loss of income, or personal circumstances affecting ability to pay",
        RequestType.OTHER: (
            "is not a customer of this lender at all, or whose message has nothing "
            "to do with lending - marketing, spam, phishing, wrong-company mail, "
            "misrouted invoices, automated bounces or unintelligible fragments. "
            "CRITICAL: the message must NOT mention a mortgage, loan, account, "
            "application or balance held with us, and must not ask us for anything"
        ),
    }[rt]
    urgency_note = {
        Urgency.LOW: "No time pressure. Routine.",
        Urgency.MEDIUM: "Some time pressure or mild frustration.",
        Urgency.HIGH: "Clear urgency, repeated contact, or money at stake now.",
        Urgency.CRITICAL: "Severe - regulatory threat, vulnerability, or immediate financial harm.",
    }[urg]
    extra = f"\nAdditional constraint: {brief}" if brief else ""
    rng = random.Random(nonce)
    if rt is RequestType.OTHER:
        voices = rng.sample(OTHER_HINTS, min(n, len(OTHER_HINTS)))
        roster = "\n".join(f"  {i + 1}. {v}" for i, v in enumerate(voices))
    else:
        voices = rng.sample(VARIETY_HINTS, min(n, len(VARIETY_HINTS)))
        products = [rng.choice(PRODUCT_HINTS) for _ in range(n)]
        roster = "\n".join(
            f"  {i + 1}. {v}, writing about {p}"
            for i, (v, p) in enumerate(zip(voices, products))
        )
    return (
        f"Write {n} distinct messages from a customer who {guidance}.\n"
        f"Urgency level to convey: {urgency_note}{extra}\n\n"
        f"Write one message in each of these voices, in order:\n{roster}\n\n"
        f"The {n} messages must differ from each other in opening line, "
        f"length and vocabulary. Return exactly {n} examples."
    )


MAX_ROUNDS_PER_CELL = 12


def _normalise(text: str) -> str:
    """Collapse whitespace and case so near-identical bodies collide."""
    return " ".join(text.lower().split())


def _read_existing(path: Path) -> list[dict]:
    if not path.exists():
        return []
    rows = []
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def _append(path: Path, row: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(row, ensure_ascii=False) + "\n")


_DRY_RUN_COUNTER = itertools.count(1)


def _fake_batch(rt: RequestType, urg: Urgency, n: int, seed: int) -> list[dict]:
    """Placeholder bodies must be unique or the dedupe pass rejects them all."""
    rng = random.Random(seed)
    out = []
    for _ in range(n):
        k = next(_DRY_RUN_COUNTER)
        out.append(
            {
                "subject": f"[dry-run] {rt.value} {urg.value} #{k}",
                "body": (
                    f"[dry-run placeholder {k} for {rt.value} at "
                    f"{urg.value} urgency, token {rng.randint(10000, 99999)}]"
                ),
                "sender": f"dry{k}@example.com",
            }
        )
    return out


def generate(
    spec_items: list[tuple[str, RequestType, Urgency, int, str]],
    path: Path,
    dry_run: bool,
    adversarial: bool,
) -> None:
    existing = _read_existing(path)
    have = Counter(r["cell"] for r in existing)
    seen = {_normalise(r["body"]) for r in existing}
    if existing:
        print(f"resuming: {len(existing)} example(s) already in {path.name}")

    wf = None
    if not dry_run:
        wf = build_waterfall(Tier.BULK)
        print("waterfall:", describe_waterfall(wf))

    produced = 0
    for cell, rt, urg, target, brief in spec_items:
        shortfall = target - have.get(cell, 0)
        if shortfall <= 0:
            continue
        rounds = 0
        rejected = 0
        while shortfall > 0:
            rounds += 1
            if rounds > MAX_ROUNDS_PER_CELL:
                print(f"\n  {cell}: giving up after {rounds} rounds, {rejected} dupes")
                break
            n = min(BATCH_SIZE, shortfall)
            if dry_run:
                batch = _fake_batch(rt, urg, n, seed=hash(cell) & 0xFFFF)
                degraded, model = False, "dry-run"
            else:
                try:
                    resp = wf.complete(
                        SYSTEM_PROMPT,
                        _user_prompt(
                            rt, urg, n, brief, nonce=rounds * 7919 + len(cell)
                        ),
                        temperature=GENERATION_TEMPERATURE,
                    )
                    batch = resp.json().get("examples", [])[:n]
                    degraded, model = resp.degraded, resp.model
                except ProviderExhausted as exc:
                    print(f"\nall providers exhausted: {exc}")
                    print(f"progress saved to {path} - rerun to resume")
                    return
                except (json.JSONDecodeError, KeyError, TypeError) as exc:
                    print(f"  malformed batch for {cell} ({exc}) - retrying cell")
                    continue

            for item in batch:
                body = item.get("body", "")
                key = _normalise(body)
                if not key or key in seen:
                    rejected += 1
                    continue
                seen.add(key)
                idx = have.get(cell, 0)
                _append(
                    path,
                    {
                        "example_id": f"{cell}_{idx:03d}",
                        "cell": cell,
                        "channel": Channel.SHARED_INBOX.value,
                        "sender": item.get("sender", "customer@example.com"),
                        "subject": item.get("subject", ""),
                        "body": item.get("body", ""),
                        "true_type": rt.value,
                        "true_urgency": urg.value,
                        "adversarial": adversarial,
                        "notes": brief or None,
                        "split": "unassigned",
                        "generated_by": model,
                        "degraded": degraded,
                    },
                )
                have[cell] = idx + 1
                produced += 1
                shortfall -= 1
            print(f"  {cell}: {have.get(cell, 0)}/{target}", end="\r")

    print(f"\ndone: {produced} new example(s), {len(_read_existing(path))} total")


def assign_splits() -> None:
    """Stratified 2:1 dev/test split. Test set is touched exactly once."""
    rows = _read_existing(CORPUS_PATH)
    if not rows:
        print("no corpus to split")
        return
    by_cell: dict[str, list[dict]] = {}
    for r in rows:
        by_cell.setdefault(r["cell"], []).append(r)

    rng = random.Random(20260724)
    for cell, group in by_cell.items():
        rng.shuffle(group)
        cut = round(len(group) * DEV_FRACTION)
        for i, r in enumerate(group):
            r["split"] = "dev" if i < cut else "test"

    with open(CORPUS_PATH, "w", encoding="utf-8") as fh:
        for r in rows:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")

    counts = Counter(r["split"] for r in rows)
    print(f"split assigned: dev={counts['dev']} test={counts['test']}")
    for rt in RequestType:
        d = sum(1 for r in rows if r["true_type"] == rt.value and r["split"] == "dev")
        t = sum(1 for r in rows if r["true_type"] == rt.value and r["split"] == "test")
        print(f"  {rt.value:20} dev={d:3}  test={t:3}")


def main() -> None:
    load_dotenv(ROOT / ".env")
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--target", choices=["corpus", "adversarial", "both"], default="corpus"
    )
    ap.add_argument("--dry-run", action="store_true", help="no API calls")
    ap.add_argument(
        "--split", action="store_true", help="assign dev/test splits and exit"
    )
    args = ap.parse_args()

    if args.split:
        assign_splits()
        return

    if args.target in ("corpus", "both"):
        items = [
            (f"{rt.value}__{urg.value}", rt, urg, n, "")
            for (rt, urg), n in CORPUS_SPEC.items()
        ]
        print(f"corpus target: {sum(CORPUS_SPEC.values())} examples")
        generate(items, CORPUS_PATH, args.dry_run, adversarial=False)

    if args.target in ("adversarial", "both"):
        items = [
            (f"adv_{kind}", cfg["type"], cfg["urgency"], cfg["count"], cfg["brief"])
            for kind, cfg in ADVERSARIAL_SPEC.items()
        ]
        total = sum(c["count"] for c in ADVERSARIAL_SPEC.values())
        print(f"adversarial target: {total} examples")
        generate(items, ADVERSARIAL_PATH, args.dry_run, adversarial=True)


if __name__ == "__main__":
    main()
