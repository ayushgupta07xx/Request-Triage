# Sample 2 — `general_enquiry`

Lifted verbatim from `web/public/demo-dev200.json`, the committed development batch. Nothing here was written by hand.

## Input

- **channel** `shared_inbox`
- **from** `john.smith@example.com`
- **subject** Re: Buy-to-Let Mortgage - Further Enquiry

```text
Hi, just wanted to add I'm planning to rent the flat out on a 12 month AST. Thanks for your previous email, best - John.
```

## Corpus label (ground truth)

`general_enquiry` / `low`   ·   example `general_enquiry__low_000`

## What the model proposed

`general_enquiry` / `low`   ·   confidence `1.0`

## What the system decided

- **type / urgency** `general_enquiry` / `low`
- **confidence** `1.0`
- **decided by** `llm_primary`
- **guardrails fired** none
- **status** `auto_resolved`
- **needs a human** `False`
- **entities extracted** `customer_name=John, product=Buy-to-Let Mortgage`

**Model's stated rationale.** The customer is asking for further information, specifically about renting the flat out on a 12 month AST.

## Steps executed (2)

**1. `generate_response`** — succeeded
   Draft answer grounded in the knowledge base, with source cited
**2. `log_outcome`** — succeeded
   log_outcome

## Generated outputs

**from `generate_response`**

```text
Dear John,

Buy-to-let affordability is assessed on rental cover: we require 145% of the monthly payment at a stressed rate of 5.5% for higher-rate taxpayers, or 125% for basic-rate taxpayers. Minimum personal income is £25,000. Landlords with four or more mortgaged properties are treated as portfolio landlords and need a portfolio review before a new application proceeds.

Source: Buy-to-Let Lending Criteria (LC-BTL-11)

If this does not fully answer your question, reply to this message and a colleague will pick it up.

Kind regards,
Customer Operations
```

---

Model `llama-3.1-8b-instant` · prompt `v1` · 506 ms · case `case_c6652b7bc287`
