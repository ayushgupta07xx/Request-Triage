# Sample 5 — `other`

Lifted verbatim from `web/public/demo-dev200.json`, the committed development batch. Nothing here was written by hand.

## Input

- **channel** `shared_inbox`
- **from** `outofoffice@example.com`
- **subject** Auto Reply: Out of Office Notification

```text
Hello, this is an automated out of office reply. I am currently unavailable from 24th June until 4th July and will respond to your email upon my return. Please expect a delay in my response and thank you for your patience.
```

## Corpus label (ground truth)

`other` / `low`   ·   example `other__low_016`

## What the model proposed

`other` / `low`   ·   confidence `1.0`

## What the system decided

- **type / urgency** `other` / `low`
- **confidence** `1.0`
- **decided by** `llm_primary`
- **guardrails fired** none
- **status** `awaiting_human`
- **needs a human** `False`
- **entities extracted** `date_mentioned=24th June`

**Model's stated rationale.** The message is an automated out of office reply.

## Steps executed (2)

**1. `route_to_team`** — succeeded
   Routed to human triage — no automated response generated
   routed to: `Triage Queue`
**2. `log_outcome`** — succeeded
   log_outcome

---

Model `llama-3.1-8b-instant` · prompt `v1` · 591 ms · case `case_fe64d044321d`
