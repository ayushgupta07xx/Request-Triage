# Sample 4 — `financial_hardship`

Lifted verbatim from `web/public/demo-dev200.json`, the committed development batch. Nothing here was written by hand.

## Input

- **channel** `shared_inbox`
- **from** `emilybennett90@example.com`
- **subject** urgent - can i extend the rate deal on my mortgage?

```text
hi, i'm not sure if you got my last message but i'm struggling to pay my mortgage this month. i was wondering if you could help me extend my fixed rate deal as my renewal is coming up soon. it's a real emergency because if i don't extend it, my payments will increase and i don't know how i'll cope. can you please get back to me ASAP?
```

## Corpus label (ground truth)

`financial_hardship` / `high`   ·   example `financial_hardship__high_020`

## What the model proposed

`financial_hardship` / `critical`   ·   confidence `1.0`   ·   secondary `service_request`

## What the system decided

- **type / urgency** `financial_hardship` / `critical`
- **confidence** `1.0`
- **decided by** `llm_primary`
- **guardrails fired** `hardship_disclosure`
- **status** `escalated`
- **needs a human** `True` — guardrail
- **entities extracted** `product=mortgage`
- **SLA due** `2026-07-25T10:30:25.469717Z` · breached `False`

> Urgency differs from the corpus label by one level (`high` vs `critical`). Adjacent urgency only shifts queue position; the branch and its steps are unchanged. This is the 91%-within-one figure in practice.

**Model's stated rationale.** i'm struggling to pay my mortgage this month, and if i don't extend it, my payments will increase and i don't know how i'll cope.

## Steps executed (6)

**1. `pause_automation`** — succeeded
   All automated contact and collections activity suspended for this account
**2. `escalate`** — succeeded
   Flagged for mandatory human review before any outbound contact
**3. `notify_supervisor`** — succeeded
   Hardship team supervisor alerted
   routed to: `Customer Support — Hardship Specialist`
**4. `generate_response`** — succeeded
   Holding acknowledgement drafted — for human approval, not auto-send (held for human approval)
**5. `set_follow_up`** — succeeded
   Priority follow-up against the critical SLA
   due: `2026-07-25T10:30:25.469717Z`
**6. `log_outcome`** — succeeded
   log_outcome

## Generated outputs

**from `pause_automation`**

```text
Hardship disclosed — automation paused pending human assessment
```

**from `generate_response`**

```text
Dear Customer,

Thank you for telling us about your circumstances - we know that is not always easy to do. A specialist from our support team will contact you personally to discuss the options available. No automated collections activity will take place on your account in the meantime.

Kind regards,
Customer Support
```

---

Model `llama-3.1-8b-instant` · prompt `v1` · 438 ms · case `case_f9f94199deb4`
