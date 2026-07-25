# Sample 1 — `billing_dispute`

Lifted verbatim from `web/public/demo-dev200.json`, the committed development batch. Nothing here was written by hand.

## Input

- **channel** `shared_inbox`
- **from** `alan.edwards@example.co.uk`
- **subject** Request for a Review of My Outstanding Balance

```text
Dear Sir or Madam, I am writing to respectfully bring to your attention a concern I have regarding my outstanding balance for my residential mortgage. Upon reviewing my recent statement, I noticed an increase in my monthly payments, yet the interest charged seems to have escalated at an alarming rate, which has resulted in a larger outstanding balance than expected.
Could you kindly assist me in reviewing this matter and provide clarification on the interest rate applicable to my account? I appreciate your prompt attention to this matter, and I thank you for your assistance in resolving this issue.
```

## Corpus label (ground truth)

`billing_dispute` / `low`   ·   example `billing_dispute__low_001`

## What the model proposed

`billing_dispute` / `medium`   ·   confidence `0.9`

## What the system decided

- **type / urgency** `billing_dispute` / `medium`
- **confidence** `0.9`
- **decided by** `llm_primary`
- **guardrails fired** none
- **status** `awaiting_human`
- **needs a human** `False`
- **entities extracted** `product=residential mortgage`
- **SLA due** `2026-07-25T18:15:24.751328Z` · breached `False`

> Urgency differs from the corpus label by one level (`low` vs `medium`). Adjacent urgency only shifts queue position; the branch and its steps are unchanged. This is the 91%-within-one figure in practice.

**Model's stated rationale.** The customer is disputing an increase in interest charged and the resulting outstanding balance.

## Steps executed (5)

**1. `generate_response`** — succeeded
   Draft acknowledgement confirming the disputed item is under review
**2. `suppress_collections`** — succeeded
   Apply collections hold for the disputed amount while investigation is open
**3. `route_to_team`** — succeeded
   Route to disputes queue with extracted account reference
   routed to: `Disputes Team`
**4. `set_follow_up`** — succeeded
   Follow-up reminder set against the urgency SLA
   due: `2026-07-25T18:15:24.751328Z`
**5. `log_outcome`** — succeeded
   log_outcome

## Generated outputs

**from `generate_response`**

```text
Dear Customer,

Thank you for contacting us about the amount in question. We have logged your dispute and placed a hold on any related collections activity while we investigate. A member of our disputes team will contact you with an update.

Kind regards,
Customer Operations
```

**from `suppress_collections`**

```text
Dispute open — collections activity suspended per policy
```

---

Model `llama-3.1-8b-instant` · prompt `v1` · 521 ms · case `case_fa1503f6ce84`
