"""
Retrieval-grounded drafting for the general-enquiry branch.

The enquiry branch is the only place the system answers a customer rather than
acknowledging them, so it is the only place a draft can be wrong in a way that
matters. Three rules follow from that:

1. An answer is only ever composed FROM a matched entry. There is no
   free-text generation path here at all - the model's job ended at
   classification and extraction. A draft either cites a source or does not
   exist.

2. No match means no automation. `lookup` returning None is what the engine
   reads to demote an otherwise auto-resolvable case back to a human. The
   `grounded: true` flag in workflows.yaml stops being decoration and becomes
   an enforced contract: a branch that declares it must produce a grounded
   answer or hand the case over.

3. Some topics are excluded on purpose. Complaints, bereavement, financial
   difficulty and vulnerability have no entries, and `_NEVER_AUTO` blocks a
   match even when other terms score well. A customer expressing dissatisfaction
   is a DISP matter, not an FAQ; a customer mentioning arrears needs a person.
   The absence of an entry is a deliberate control, not a gap in coverage -
   the same asymmetry the guardrails use, applied to drafting.

This is content, like workflows.yaml is content, and an ops manager could
maintain it without a developer. It is kept in-module rather than in a second
YAML file so the vendored serverless bundle stays self-contained - one fewer
artifact for scripts/sync_api.py to keep in step. Promoting it to YAML
alongside workflows.yaml is the natural next step, not a redesign.

Matching is pure, deterministic and costs no tokens: the same request always
produces the same draft, and a batch can be replayed offline from cached
classifications.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

from .schemas import ExtractedEntities

# --------------------------------------------------------------------------
# Entry shape
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class KBEntry:
    id: str
    title: str
    source: str  # what gets cited in the draft and shown on the case card
    products: tuple[str, ...]  # entity-level product hints; () = any product
    triggers: tuple[str, ...]  # lowercase phrases; multi-word ones score higher
    answer: str


@dataclass(frozen=True)
class KBMatch:
    entry: KBEntry
    score: int
    matched: tuple[str, ...]


# --------------------------------------------------------------------------
# The knowledge base
#
# Northgate Servicing, UK consumer lending and mortgage servicing. Figures are
# the fictional firm's own published terms - a real KB carries real numbers,
# and a draft that says "please refer to your terms" is not an answer.
# --------------------------------------------------------------------------

KB: tuple[KBEntry, ...] = (
    KBEntry(
        id="fixed_rate_expiry",
        title="Fixed-rate deal ending and product transfers",
        source="Product Terms - Fixed Rate Transfers (PT-04, v4.2)",
        products=("mortgage", "buy-to-let mortgage", "residential mortgage"),
        triggers=(
            "fixed rate",
            "fixed-rate",
            "fixed deal",
            "deal ending",
            "deal expires",
            "deal is ending",
            "comes to an end",
            "product transfer",
            "renewal",
            "remortgage",
            "rate expiring",
        ),
        answer=(
            "We write to you around four months before a fixed-rate deal ends, "
            "and you can switch to a new product from that point onwards - "
            "online, or by calling the servicing team. Product transfers for "
            "existing customers carry no arrangement fee and no new valuation. "
            "If no new product is selected, the account moves to our Standard "
            "Variable Rate, currently 7.24%, on the first payment after the "
            "fixed period ends."
        ),
    ),
    KBEntry(
        id="current_rates",
        title="Interest rates and how they change",
        source="Rates Bulletin - effective 1 July 2026",
        products=(),
        triggers=(
            "interest rate",
            "interest rates",
            "current rate",
            "current rates",
            "rates and fees",
            "what rate",
            "svr",
            "standard variable",
            "base rate",
            "tracker",
        ),
        answer=(
            "Our Standard Variable Rate is currently 7.24%. Tracker products "
            "follow the Bank of England base rate plus the margin shown in your "
            "offer, and move within one calendar month of a base rate change. "
            "Fixed products are unaffected for the length of the fixed period. "
            "Any change to your monthly payment is confirmed in writing at least "
            "14 days before it takes effect."
        ),
    ),
    KBEntry(
        id="fees_and_charges",
        title="Fees and charges",
        source="Tariff of Charges (TOC-2026-01)",
        products=(),
        triggers=(
            "fee",
            "fees",
            "charges",
            "arrangement fee",
            "valuation fee",
            "early repayment charge",
            "erc",
            "exit fee",
            "admin fee",
            "tariff",
        ),
        answer=(
            "The product arrangement fee is £999, payable up front or added to "
            "the loan. Standard valuations start at £250 and depend on property "
            "value. Early repayment charges apply during a fixed period and "
            "taper from 5% to 1% of the amount repaid, as set out in your offer. "
            "A £90 closing administration fee applies when an account is "
            "redeemed. The full tariff is available on request."
        ),
    ),
    KBEntry(
        id="buy_to_let",
        title="Buy-to-let lending criteria",
        source="Buy-to-Let Lending Criteria (LC-BTL-11)",
        products=("buy-to-let mortgage", "buy to let", "btl", "buy-to-let"),
        triggers=(
            "buy to let",
            "buy-to-let",
            "btl",
            "rental income",
            "rental cover",
            "landlord",
            "portfolio",
            "letting",
            "tenant",
        ),
        answer=(
            "Buy-to-let affordability is assessed on rental cover: we require "
            "145% of the monthly payment at a stressed rate of 5.5% for "
            "higher-rate taxpayers, or 125% for basic-rate taxpayers. Minimum "
            "personal income is £25,000. Landlords with four or more mortgaged "
            "properties are treated as portfolio landlords and need a portfolio "
            "review before a new application proceeds."
        ),
    ),
    KBEntry(
        id="redemption",
        title="Redemption and settlement figures",
        source="Servicing Manual - Redemptions (SM-09)",
        products=(),
        triggers=(
            "redemption",
            "redemption statement",
            "settlement figure",
            "pay off",
            "payoff",
            "paying off",
            "settle the loan",
            "close the account",
            "close my mortgage",
        ),
        answer=(
            "A redemption statement is issued within five working days of the "
            "request and is valid for 30 days from the date of issue. It shows "
            "the outstanding balance, any early repayment charge, daily interest "
            "to the redemption date, and the closing administration fee. "
            "Requests can be made through your online account or in writing."
        ),
    ),
    KBEntry(
        id="overpayments",
        title="Overpayments and allowances",
        source="Product Terms - Overpayments (PT-07)",
        products=(),
        triggers=(
            "overpayment",
            "overpayments",
            "overpay",
            "pay extra",
            "lump sum",
            "additional payment",
            "reduce the term",
        ),
        answer=(
            "You can overpay up to 10% of the outstanding balance in each "
            "calendar year without incurring an early repayment charge. "
            "Overpayments are applied to capital and reduce the interest "
            "charged from the day they are received. They can be made as "
            "one-off payments or as a regular increase to your monthly amount, "
            "and you can choose to shorten the term or lower future payments."
        ),
    ),
    KBEntry(
        id="payment_date",
        title="Payment dates and direct debits",
        source="Servicing Manual - Payments (SM-03)",
        products=(),
        triggers=(
            "payment date",
            "collection date",
            "direct debit",
            "change my payment",
            "monthly payment date",
            "when is my payment",
            "payment taken",
        ),
        answer=(
            "Your payment date can be set to any day from the 1st to the 28th "
            "of the month. Changes need ten working days' notice so the direct "
            "debit instruction can be updated, and one change per twelve months "
            "is free. Moving the date may mean a slightly larger or smaller "
            "first payment as interest is calculated daily."
        ),
    ),
    KBEntry(
        id="statements",
        title="Statements and balances",
        source="Servicing Manual - Statements (SM-05)",
        products=(),
        triggers=(
            "statement",
            "statements",
            "annual statement",
            "mortgage statement",
            "balance",
            "outstanding balance",
            "transaction history",
        ),
        answer=(
            "An annual statement is issued each April covering the previous "
            "twelve months. Interim statements can be requested at any time and "
            "are produced within five working days. Your current balance, recent "
            "payments and transaction history are available at any time through "
            "your online account."
        ),
    ),
    KBEntry(
        id="porting",
        title="Moving home and porting your mortgage",
        source="Product Terms - Portability (PT-12)",
        products=("mortgage", "residential mortgage"),
        triggers=(
            "moving home",
            "porting",
            "port my mortgage",
            "take my mortgage with me",
            "new property",
            "moving house",
            "transfer my mortgage",
        ),
        answer=(
            "Most of our products are portable, so the rate can move with you to "
            "a new property subject to a fresh affordability assessment and "
            "valuation. Apply before exchanging contracts. If you repay and "
            "complete on the new property within three months, any early "
            "repayment charge paid is refunded."
        ),
    ),
    KBEntry(
        id="secured_loan",
        title="Secured homeowner loans (second charge)",
        source="Secured Lending Guide (SL-02)",
        products=("secured loan", "homeowner loan", "second charge"),
        triggers=(
            "secured loan",
            "homeowner loan",
            "second charge",
            "secured homeowner",
            "secured borrowing",
        ),
        answer=(
            "A secured homeowner loan sits as a second charge on your property "
            "and runs alongside your mortgage with its own rate, term and "
            "monthly payment. Balances and settlement figures are handled by the "
            "secured loans team and are shown separately from your mortgage. "
            "These agreements are regulated, and the same early repayment terms "
            "in your credit agreement apply."
        ),
    ),
    KBEntry(
        id="application_process",
        title="Applying and decisions in principle",
        source="New Lending - Application Guide (NL-01)",
        products=(),
        triggers=(
            "decision in principle",
            "agreement in principle",
            "how do i apply",
            "application process",
            "how long does it take",
            "apply for a mortgage",
            "new application",
        ),
        answer=(
            "A decision in principle takes around fifteen minutes online and is "
            "valid for 90 days with no impact on your credit file. A full "
            "application usually reaches a formal offer within two to three "
            "weeks once we have proof of income, three months of bank "
            "statements, identification and the valuation."
        ),
    ),
)


# --------------------------------------------------------------------------
# Topics that must never be answered from a template
#
# These are not gaps in the knowledge base - they are the reason the knowledge
# base has a boundary. A message carrying any of them is handed to a person
# even when its surface topic matches an entry cleanly.
# --------------------------------------------------------------------------

_NEVER_AUTO: tuple[str, ...] = (
    # dissatisfaction: a DISP matter, not an FAQ
    "complaint",
    "complain",
    "dissatisfied",
    "unhappy",
    "ombudsman",
    "fos",
    "escalate",
    # financial difficulty: the hardship branch owns these
    "struggling",
    "cannot afford",
    "can't afford",
    "cant afford",
    "afford the payments",
    "arrears",
    "behind on",
    "missed payment",
    "hardship",
    "redundan",
    "lost my job",
    "payment holiday",
    "forbearance",
    # vulnerability and life events
    "bereave",
    "passed away",
    "deceased",
    "probate",
    "power of attorney",
    "mental health",
    "terminal",
    "vulnerable",
    "divorce",
    "separation",
)


# --------------------------------------------------------------------------
# Matching
# --------------------------------------------------------------------------

MIN_SCORE = 4  # below this the match is incidental, not a real topic hit
MARGIN = 2  # top entry must clearly beat the runner-up, else it is ambiguous

_WORD = re.compile(r"[a-z0-9£%/'-]+")


def _norm(text: Optional[str]) -> str:
    """Lowercase, punctuation-stripped, single-spaced - and padded, so that
    `in` tests match on whole tokens rather than inside longer words."""
    return " " + " ".join(_WORD.findall((text or "").lower())) + " "


def blocked_topic(subject: str, body: str) -> Optional[str]:
    """Return the term that forbids automation, if any."""
    haystack = _norm(subject) + _norm(body)
    for term in _NEVER_AUTO:
        if term in haystack:
            return term
    return None


def lookup(
    subject: str,
    body: str,
    entities: Optional[ExtractedEntities] = None,
) -> Optional[KBMatch]:
    """
    Find the single entry that answers this enquiry, or None.

    None is a meaningful result, not a failure: the engine reads it as
    "this case cannot be resolved without a person".
    """
    if blocked_topic(subject, body):
        return None

    subj = _norm(subject)
    bod = _norm(body)
    product = _norm(entities.product) if entities and entities.product else ""

    scored: list[tuple[int, KBEntry, tuple[str, ...]]] = []
    for entry in KB:
        score = 0
        matched: list[str] = []
        for trigger in entry.triggers:
            token = _norm(trigger).strip()
            weight = 2 if " " in token else 1
            if f" {token} " in subj:
                score += weight * 2  # the subject line is the strongest signal
                matched.append(trigger)
            elif f" {token} " in bod:
                score += weight
                matched.append(trigger)
        if product and entry.products:
            if any(_norm(p).strip() in product for p in entry.products):
                score += 2
        if score:
            scored.append((score, entry, tuple(matched)))

    if not scored:
        return None

    scored.sort(key=lambda row: -row[0])
    top_score, top_entry, top_matched = scored[0]

    if top_score < MIN_SCORE:
        return None
    if len(scored) > 1 and top_score - scored[1][0] < MARGIN:
        # two topics fit equally well; guessing between them is exactly the
        # kind of decision a person should make
        return None

    return KBMatch(entry=top_entry, score=top_score, matched=top_matched)


def compose_answer(match: KBMatch, greeting: str) -> str:
    """
    Build the customer-facing draft. Every draft cites the entry it came from
    and offers a route back to a human - an automated reply that cannot be
    questioned is not an acceptable reply.
    """
    return (
        f"{greeting}\n\n"
        f"{match.entry.answer}\n\n"
        f"Source: {match.entry.source}\n\n"
        "If this does not fully answer your question, reply to this message "
        "and a colleague will pick it up.\n\n"
        "Kind regards,\nCustomer Operations"
    )


# --------------------------------------------------------------------------
# Startup validation - the same posture workflows.yaml takes: content is
# checked when it loads, not when a customer is waiting on it.
# --------------------------------------------------------------------------


def _validate() -> None:
    ids = [e.id for e in KB]
    assert len(ids) == len(set(ids)), f"duplicate KB ids: {ids}"
    for e in KB:
        assert e.triggers, f"{e.id}: no triggers"
        assert e.answer.strip(), f"{e.id}: empty answer"
        assert e.source.strip(), f"{e.id}: entry must cite a source"
        for t in e.triggers:
            assert t == t.lower(), f"{e.id}: trigger not lowercase: {t!r}"
        # Deliberately NOT checked: whether an answer contains a _NEVER_AUTO
        # term. An entry may legitimately mention one -- the fees entry says
        # "arrears admin fee". Blocking is decided on the INBOUND message, never
        # on the answer text. (What stood here was an assertion disjoined with
        # a literal true, so it could never fail and checked nothing.)


_validate()
