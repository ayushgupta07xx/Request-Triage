# Decision log

Every non-obvious choice in this system, why it was made, and what evidence
changed it. Entries that record a **failed** experiment are marked; they are
kept deliberately, because a decision log that only contains successes is a
sales document rather than an engineering record.

Numbers cite the run they came from. All of them are reproducible offline from
the committed corpus and `scripts/run_eval.py` — nothing here is asserted.

---

## 1. The model decides, the state machine executes

**Decision.** The LLM performs perception only — classify, extract, draft. All
control flow, side effects and status transitions are deterministic Python
driven by `workflows.yaml`.

**Why.** The role is agentic AI engineering, and the obvious question is why
this isn't a free agent. Because the system has the power to pause collections
on a customer account. Anything with that power needs replayable, auditable
control flow. Bounded autonomy is the feature, not a limitation — and
regulated clients pay for restraint.

**Consequence.** Every case is reconstructable from its audit row. "What did
the model say" and "what did the system decide" are separate fields
(`LLMClassification` vs `Classification`) precisely so both questions have
answers.

---

## 2. Branches live in config, not code

**Decision.** Guardrails, SLAs, routing targets, per-branch steps and
auto-handling policies are all `workflows.yaml`, validated against schema enums
at startup.

**Why.** An operations manager can add a request type or retune an SLA by
editing a file. No developer, no deploy. That is the difference between a demo
and something an operations floor adopts.

**Evidence it's real.** A typo'd action, a one-step branch, an unknown urgency
and a `financial_hardship` entry in a class gate all fail loudly at load with a
precise message.

---

## 3. The confidence gate was inert — found by measurement, not by luck

**Decision changed.** The original threshold was 0.72, a placeholder.

**What we found.** On dev-200, the 8B model's stated confidence took exactly
three values: 0.80 (n=3), 0.90 (n=95), 1.00 (n=92). **The threshold sat below
the entire support of the distribution — it had never fired on a single
model-decided row and could not.** Review volume (15/200) came entirely from
the keyword floor (10) and guardrails (5). The system looked well-calibrated at
a 7.5% review rate against a 30% error rate. It was not; the gate was decorative.

**Why it matters as a story.** Sweeping 0.72 → 0.75 → 0.80 would have produced
identical output, and we would have called the result "tuned". `run_eval.py`
now detects this class of bug directly and prints `INERT GATE`.

---

## 4. Confidence is coarse but not worthless — and calibration is published unflattering

| stated confidence | n | actual accuracy |
|---|---|---|
| 0.80 | 3 | 0% |
| 0.90 | 95 | 62% |
| 1.00 | 92 | 86% |

ECE 0.221 on 8B. The model says 1.00 and is right 86% of the time.

**Decision.** Publish the calibration table whichever way it comes out.

**The argument it supports.** You should *not* trust what the model says — that
is the design. We measured the overstatement precisely in order to refuse to
rely on it. A system that trusted the 1.00 would auto-action 90 cases at 85.6%
precision (13 wrong actions). Ours actions 44 at 100%.

---

## 5. Uncertainty is architectural, not self-reported — **and it is model-specific**

**8B.** Keyword-floor agreement is load-bearing: agreement → 92% accurate
(67/73); disagreement catches 88% of model errors. A 42%-accurate keyword
matcher is a poor classifier and a useful second opinion.

**70B.** The same rule flags 67 of 104 rows to catch 11 errors. Agreement gives
86.5% against an 84.6% baseline — +1.9 points for a 64% review rate.
Disagreements between a 35%-accurate floor and an 85%-accurate model are mostly
the floor being wrong.

**Decision (policy v3).** Gates are configured **per deciding model**. 70B uses
per-class confidence gates; 8B keeps the ensemble rule where it demonstrably
works; a model with no derived policy never auto-handles anything — absence of
evidence is a review reason.

**The general claim.** Every uncertainty signal we tested is a property of the
(model, prompt) pair, not of the architecture. Thresholds must be re-derived
when either changes. That is why the operating point is config, not code.

---

## 6. **FAILED EXPERIMENT** — top-2 margin as a graded uncertainty signal

**Hypothesis.** Stated confidence is too coarse (3 values) to express an
operating point. Asking for a ranked top-2 and gating on the margin
(p1 − p2) should produce a continuous signal.

**Result.** Prompt v2 emitted `alt_type` on only 87 of 189 rows despite the
instruction "always a different class, never null". Margin took **five**
distinct values, **equalled confidence exactly on 103/189 rows (54%)** because
the model reported a zero-probability runner-up, and accuracy across margin
buckets was non-monotonic (80% at 0.60, 63% at 0.80, 80% at 1.00).

**Conclusion.** A small instruct model emits confidence as a stylistic token,
not a probability. You cannot extract calibration by asking more precisely.
The fields are retained so the negative result stays reproducible; nothing
gates on them.

---

## 7. **REVERTED** — prompt v2, and why aggregate accuracy is the wrong headline

v2 added an ordered cascade with negative clauses, anchored urgency
definitions, and the top-2 fields. Measured against v1 under **identical**
policy (the first comparison was confounded — v2 ran under a different
guardrail config, so `scripts/ab_prompts.py` recomputes triggers for both):

| | v1 | v2 |
|---|---|---|
| type accuracy | 70.5% | 71.0% |
| best gate ≥95% precision | 57 auto @ 96.5% | **none exists** |
| substantive classes only | 21 @ 100% | 17 @ 82.4% |
| hardship recall | 79% | 71% |

**The finding.** v2 is fractionally *ahead* on aggregate accuracy and loses at
every operating point. v1's errors concentrate where the ensemble check catches
them; v2's spread into the high-confidence agreeing region where nothing does.

**So: for a triage system, aggregate accuracy is the wrong headline metric.**
What matters is not how often the model is right, but whether its errors land
where a cheap check can see them.

**Honest caveat.** No individual difference is significant at n=200. But every
metric points the same way, none favours v2, and reverting cost nothing —
`corpus_dev_bulk.jsonl` already measured v1. The revert was verified
byte-identical by replaying 5 cached examples and comparing the model's
proposal (`scripts/diag/verify_v1_restore.py`).

---

## 8. Guardrails fail on inputs correlated with the model

**What we found.** The hardship guardrail fired 5 times on dev-200 and **every
single time the model had already reached the same conclusion.** It never once
overrode a wrong decision.

**Why.** The phrase list encoded explicit distress idioms ("struggling to pay",
"lost my job") — exactly the cases the LLM already gets right. Every genuine
miss expressed hardship through *consequence*: staff laid off, rental income
collapsed, "about to miss my next payment", "losing my flat". Consequence is
unbounded in surface form.

**The general lesson.** A deterministic override built from the same surface
features the model reads is not a second line of defence. Its failures are
correlated with the failures it exists to catch.

**Evidence for the rebuild.** Phrase mining on dev (`scripts/diag/` and the
config comments) measured every candidate: the existing list caught 5/34
hardship at 0 false positives; adding every candidate reached 20/34 but cost 21
false positives on 166 non-hardship messages. The high-yield generic terms were
the dirty ones — `arrears` 4 hits / 19 false positives, `overdue` 1/4. Rejected
phrases are recorded **in the config with their measured counts**, so the file
shows what was tested and discarded, not only what survived.

---

## 9. A rule kept for a reason it does not serve is worse than no rule

The tier-2 `hardship_possible` guardrail fires on 20 dev rows, 12 genuinely
hardship — and **all 12 were already flagged by other rules. Its marginal
hardship-safety value is zero.**

But excluding those rows lifts auto-handled precision from 91.2% to 96.5%
(errors escaping 6 → 2 per 200), because its phrases mark genuinely ambiguous
messages. It is kept for that reason and **described by that reason** in the
config.

---

## 10. The pre-registered bar, and the class it cost us

Before looking at the pooled 70B numbers, the rule for granting a class an
automation gate was fixed: **precision ≥95% point estimate AND n ≥ 15**, with
`financial_hardship` ineligible regardless (its branch never auto-resolves by
design; the loader rejects it).

Result on 105 pooled 70B rows:

| class | at conf ≥0.90 | verdict |
|---|---|---|
| billing_dispute | 31/31 (100%) | **passes** |
| other | 11/11 (100%) | **fails — n=11 < 15** |
| general_enquiry | 22/25 (88%) | fails on merit |
| service_request | 9/16 (56%) | fails on merit |
| financial_hardship | 6/8 (75%) | ineligible by design |

**`other` was perfect on every observation and still does not automate.** The
bar existed before the numbers, and n=11 is exactly the small-sample perfection
it was written to resist.

---

## 11. What "automated" actually means here

Under policy v3 the live 70B system **never auto-resolves a case — it
auto-routes one.** Billing cases pass their gate and go straight to the
Disputes queue with the collections hold applied and no human re-checking the
label. The only branch that closes cases is `general_enquiry`, which failed its
gate. The automation claim is about *triage labour*, not resolution, and that
is the more defensible claim.

---

## 12. Corpus labels are AI-generated, and two are demonstrably wrong

Ground truth comes from the generation spec, so measured accuracy is an
**upper bound** — classifier and generator share a family of priors.

Reading the "missed hardship" cases surfaced actual label errors: a landlord
asking about a variable rate to advise tenants, and a customer exploring a
fixed-rate extension on accountant's advice, are both labelled
`financial_hardship` and contain no distress signal. The model called them
correctly and was scored wrong.

**Decision: labels are not edited.** Editing labels to improve a headline is
indefensible. The corpus stays frozen, the number stays unadjusted, and the
noise is disclosed — which makes the published accuracy a floor rather than a
ceiling. A cross-family holdout generated by a different model family is the
mitigation.

---

## 13. Bugs found by our own tooling

- **Sampling.** `--limit 60` took the first 60 rows of a class-ordered corpus,
  so the first "70B transfer check" measured only `billing_dispute` and
  `general_enquiry`. Caught by the confusion matrix's support column showing
  three classes at zero. `--limit` now stratifies with a fixed seed.
- **Guardrail de-escalation.** The confidence check was skipped whenever *any*
  guardrail fired, including urgency-only rules. A message containing
  "unacceptable" could auto-handle at 0.80 — a guardrail causing a
  de-escalation, which the design forbids. Now only a guardrail that forces a
  *different type* suppresses the check.
- **Audit trail.** `review_reason` recorded only the first reason. A case held
  for three independent reasons was indistinguishable from one held on a
  borderline threshold. Now every reason is recorded and guardrails are named.

---

## 14. What was deliberately not built

- **No fine-tuning.** No labelled real data exists. Prompt and guardrails are
  cheaper to iterate and inspect. Fine-tuning is the *next* step, using the
  review queue's human overrides — the system harvests its own training data.
- **No vector store.** Enquiry drafts are grounded in a small keyword-matched
  knowledge base. It is retrieval-grounded drafting, and calling it RAG would
  oversell it.
- **No workflow-engine layer (n8n/Retool).** Auditability, testability and
  version control. `workflows.yaml` delivers the declarative benefit anyway.
- **No prompt v3.** Two iterations produced redistribution, not improvement.
  Expected value of a third was a point or two against a 33-minute run; the
  time was worth more elsewhere. Knowing when to stop iterating is a decision.

---

## 15. What breaks at 10,000 requests/day

SQLite → Postgres or Turso; batch runner → queue workers with retry semantics;
per-class model routing (billing is cheap and clean at 8B, hardship is not);
prompt-cache economics begin to matter, but only if the workload moves to a cache-supported model family — the current llama models cache nothing (see #16); and the review queue needs
real workflow tooling, since at a 70% review rate the bottleneck is human
capacity, not model throughput. The honest answer to "why is automation only
~30%" is that the precision bar was set at 95% and this is what 95% costs
today — raising it means better perception, not a looser gate.

---
## 16. Measuring on a rate-limited free tier — a contamination caught, then instrumented

The held-out test split was run once on 70B and the run was **voided before a
single prediction was scored**, because 36 of its 100 rows had been answered by
the wrong model. This entry records why, and the four findings the failure
forced out — each measured against the vendor, not assumed.

**The daily reset is a rolling window, not a clock.** The build plan assumed the
Groq daily bucket reset at a fixed 05:30 IST (midnight UTC). It does not. A
one-request probe returned `x-ratelimit-remaining-requests: 942` with
`x-ratelimit-reset-requests: 1h23m31s`; 1000 − 942 = 58 requests spent, and
58 × 86.4s (one request's share of a 1000/day allowance) = 1h23m31s exactly.
The allowance refills continuously, ~one request every 86 seconds, confirmed on
our own headers. **Consequence.** Runs are scheduled by measured headroom, never
by wall-clock.

**Prompt caching never applied.** The classifier and LLM layer both carried a
comment: the system prompt is byte-identical so caching applies and cached
tokens do not count against the limit. Groq caches only the gpt-oss family; the
llama models this system uses are unsupported. Measured on-key
(`scripts/diag/caching_probe.py`): the identical system prompt sent twice
returned `cached_tokens: None` both times, at 602 total tokens per call. Every
call pays full prompt cost. **Decision.** The prompt stays byte-identical — for
determinism, and so the benefit lands automatically if the workload ever moves
to a cache-supported model — but the rate-limit claim is withdrawn, and the
scale note in #15 corrected: caching cannot dominate token spend on a model that
does not cache.

**The run degraded because production behaviour is wrong for measurement.** With
no caching each call costs ~602 tokens; an unpaced runner issues calls in bursts
toward the 30 requests-per-minute ceiling, and 30 × 602 ≈ 18,000 tokens crosses
the 12,000 tokens-per-minute limit inside a rolling minute. On the resulting 429
the waterfall did exactly what production requires — it degraded to the 8B model
to keep answering fast — and 35 rows were classified by 8B, one by the keyword
floor. An operations floor cannot block a waiting customer, so fast-but-8B beats
slow-but-70B there. A measurement run has the opposite objective: a silent
same-family substitution masquerades as a 70B decision and contaminates the
headline. **Decision.** A `--pin` mode pins to the target tier alone and waits
out per-minute congestion; if the tier genuinely cannot serve it raises rather
than substitutes, surfacing a *visible* keyword-floor row we can see and re-run,
never a hidden 8B swap. Same waterfall, one flag, inverted objective — production
still degrades by default.

**The void was pre-registered and accuracy-blind.** The criterion for discarding
— was the row served by 70B — is a property of provenance, decided and written
down before the run, with no reference to whether the predictions were right.
Discarding therefore introduced no accuracy information into any decision: it
replaced a broken instrument, it did not fish for a better number. The split is
described honestly as **executed once, scored never**; the voided run files are
kept on disk as evidence, not deleted.

**We were blind to the daily token pool, and fixed it.** The rate-limit headers
expose remaining requests-per-day and tokens-per-*minute*, but not
tokens-per-*day* — the one number that actually bounded the run. Flying on
inference, the day's 70B token pool was over-run (the console later showed 122.7K
against a 100K ceiling; earlier runs had not yet aged out of the rolling window).
Two changes close this: every call now records its `usage` block into the run
row, ending token-cost-by-inference; and a pre-flight guard
(`scripts/diag/run_guard.py`) refuses to start a run whose measured cost will not
fit the pool with margin, with a resume-scrub that drops non-70B rows so a re-run
re-attempts only the failures. **Consequence.** The failure that produced this
entry cannot recur silently — the tooling now measures what was previously
assumed.
