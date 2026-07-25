# Sample 3 — `service_request`

Lifted verbatim from `web/public/demo-dev200.json`, the committed development batch. Nothing here was written by hand.

## Input

- **channel** `shared_inbox`
- **from** `sarah.wilson@ntlworld.com`
- **subject** Follow-up: Secured Homeowner Loan

```text
This is now my third phone call regarding the secured homeowner loan in my name, ref number HS567. Can you please assist me in requesting a payoff quote for this loan as I need to close it out urgently? My loan balance is approximately £22,000.
```

## Corpus label (ground truth)

`service_request` / `medium`   ·   example `service_request__medium_031`

## What the model proposed

`service_request` / `high`   ·   confidence `0.4`

## What the system decided

- **type / urgency** `service_request` / `high`
- **confidence** `0.4`
- **decided by** `keyword_fallback`
- **guardrails fired** none
- **status** `awaiting_human`
- **needs a human** `True` — degraded to keyword floor
- **entities extracted** `account_reference=number`
- **SLA due** `2026-07-25T12:15:25.308093Z` · breached `False`

> Urgency differs from the corpus label by one level (`medium` vs `high`). Adjacent urgency only shifts queue position; the branch and its steps are unchanged. This is the 91%-within-one figure in practice.

**Model's stated rationale.** Keyword match (1 hit(s) for service_request); model unavailable.

## Steps executed (5)

**1. `generate_response`** — succeeded
   Draft confirmation restating the requested action and expected timeline
**2. `route_to_team`** — succeeded
   Route to servicing with extracted entities attached
   routed to: `Servicing Operations`
**3. `start_sla_timer`** — succeeded
   SLA clock started against the classified urgency
   due: `2026-07-25T12:15:25.308093Z`
**4. `set_follow_up`** — succeeded
   Follow-up task raised for the assigned team
   due: `2026-07-25T12:15:25.308106Z`
**5. `log_outcome`** — succeeded
   log_outcome

## Generated outputs

**from `generate_response`**

```text
Dear Customer,

We have received your request (reference number) and passed it to our servicing team. You will receive confirmation once the requested change or document has been actioned.

Kind regards,
Customer Operations
```

---

Model `keyword-floor` · prompt `v1` · 5146 ms · case `case_2dd80b445ffb`
