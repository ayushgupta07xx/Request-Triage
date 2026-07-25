# Sample requests — one per branch

One real request per branch, with the output the system actually produced.
Every example is lifted from `web/public/demo-dev200.json` (the committed
development batch) and matched back to its corpus row, so three things stay
distinct: the corpus label, what the model proposed, and what the system
decided. Regenerate with `python3 scripts/make_samples.py` — no API calls.

**Selection rule.** Each branch is illustrated by a case whose corpus label
matches that branch, so the example demonstrates the branch it belongs to.
Misclassifications are not hidden — they are measured and characterised in
`docs/eval/` (confusion matrix, per-class precision and recall) and in the
README's limitations, including `service_request` acting as a sink class.

| Branch | Walkthrough | Status | Decided by | Guardrails | Steps |
| --- | --- | --- | --- | --- | --- |
| `billing_dispute` | [1_billing_dispute.md](1_billing_dispute.md) | `awaiting_human` | `llm_primary` | — | 5 |
| `general_enquiry` | [2_general_enquiry.md](2_general_enquiry.md) | `auto_resolved` | `llm_primary` | — | 2 |
| `service_request` | [3_service_request.md](3_service_request.md) | `awaiting_human` | `keyword_fallback` | — | 5 |
| `financial_hardship` | [4_financial_hardship.md](4_financial_hardship.md) | `escalated` | `llm_primary` | `hardship_disclosure` | 6 |
| `other` | [5_other.md](5_other.md) | `awaiting_human` | `llm_primary` | — | 2 |

`inputs.jsonl` holds the five inputs alone, in the same shape as
`data/corpus/`, so they can be fed straight back through the pipeline.
