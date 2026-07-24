
# Evaluation: `corpus_dev_bulk_v2`

- rows: **200**
- models: keyword-floor, llama-3.1-8b-instant
- prompt versions: v2
- floor comparison run: corpus_dev_floor
- generated: 2026-07-24 14:19 UTC (offline, zero API calls)

## Headline

| metric | value | 95% CI (Wilson) |
|---|---|---|
| type accuracy | 142/200 (71.0%) | [64.4%, 76.8%] |
| urgency exact | 80/200 (40.0%) | [33.5%, 46.9%] |
| urgency within-one | 178/200 (89.0%) | [83.9%, 92.6%] |
| branch completion | 200/200 (100.0%) | [98.1%, 100.0%] |
| flagged for review (as run) | 161/200 (80.5%) | [74.5%, 85.4%] |

## Gate status

- configured threshold: **1.0**
- model-decided rows: 189
- confidence range observed: **0.80 - 1.00**
- distinct confidence values: 4 -> [0.8, 0.9, 0.95, 1.0]
- rows the gate would flag: **88/189 (46.6%)**

> **COARSE SIGNAL.** Only 4 distinct confidence values, so the sweep can express very few operating points. Treat the sweep as a choice among a handful of fixed points, not a continuous curve.

## Type confusion matrix

| true \ pred | bill | hard | enq | svc | other | n | recall |
|---|---|---|---|---|---|---|---|
| **bill** | **33** | 2 | 3 | 2 | 0 | 40 | 82% |
| **hard** | 0 | **24** | 1 | 9 | 0 | 34 | 71% |
| **enq** | 2 | 5 | **24** | 10 | 3 | 44 | 55% |
| **svc** | 0 | 4 | 5 | **36** | 1 | 46 | 78% |
| **other** | 5 | 0 | 3 | 3 | **25** | 36 | 69% |

## Per-class precision / recall (Wilson 95% CI)

| class | support | precision | P CI | recall | R CI | F1 |
|---|---|---|---|---|---|---|
| bill | 40 | 82.5% (33/40) | [68.0%, 91.3%] | 82.5% (33/40) | [68.0%, 91.3%] | 0.82 |
| hard | 34 | 68.6% (24/35) | [52.0%, 81.4%] | 70.6% (24/34) | [53.8%, 83.2%] | 0.70 |
| enq | 44 | 66.7% (24/36) | [50.3%, 79.8%] | 54.5% (24/44) | [40.1%, 68.3%] | 0.60 |
| svc | 46 | 60.0% (36/60) | [47.4%, 71.4%] | 78.3% (36/46) | [64.4%, 87.7%] | 0.68 |
| other | 36 | 86.2% (25/29) | [69.4%, 94.5%] | 69.4% (25/36) | [53.1%, 82.0%] | 0.77 |

### Worst confusion pairs (targets for the next prompt version)

- **enq -> svc**: 10
- **hard -> svc**: 9
- **svc -> enq**: 5
- **other -> bill**: 5
- **enq -> hard**: 5
- **svc -> hard**: 4

## Urgency confusion matrix

| true \ pred | low | medi | high | crit | n | recall |
|---|---|---|---|---|---|---|
| **low** | **39** | 18 | 9 | 0 | 66 | 59% |
| **medi** | 15 | **11** | 37 | 1 | 64 | 17% |
| **high** | 8 | 11 | **28** | 1 | 48 | 58% |
| **crit** | 3 | 1 | 16 | **2** | 22 | 9% |

## Urgency

- exact: 80/200 (40.0%)  [33.5%, 46.9%]
- within one level: 178/200 (89.0%)  [83.9%, 92.6%]
- over-escalated: 66/200 (33.0%) | under-escalated: 54/200 (27.0%)
- mean signed error: +0.04 levels

Error magnitude distribution:
| |delta| | count |
|---|---|
| 0 | 80 |
| 1 | 98 |
| 2 | 19 |
| 3 | 3 |

> Net **over**-escalation. The cheap direction - a case arrives at a human sooner than needed. Consistent with the escalate-only guardrail design, and within-one errors only shift queue position.

## Accuracy by decision source

| source | n | type acc | CI | urgency exact | flagged | branch complete |
|---|---|---|---|---|---|---|
| guardrail_override | 3 | 100.0% | [43.8%, 100.0%] | 66.7% | 100% | 100% |
| keyword_fallback | 11 | 36.4% | [15.2%, 64.6%] | 27.3% | 100% | 100% |
| llm_primary | 186 | 72.6% | [65.8%, 78.5%] | 40.3% | 79% | 100% |

> 11 rows degraded to the keyword floor under TPM pressure. They drag headline type accuracy down by **2.0 points** (73.0% on model-decided rows vs 71.0% overall). The headline stays the all-rows number - degradation is part of the system's real behaviour - but the split is reported so the cause is legible.

## Calibration (accuracy by stated confidence)

| stated confidence | n | actual accuracy | 95% CI | gap |
|---|---|---|---|---|
| 0.80 | 5 | 80.0% | [37.6%, 96.4%] | +0.0% |
| 0.90 | 82 | 64.6% | [53.8%, 74.1%] | -25.4% |
| 0.95 | 1 | 0.0% | [0.0%, 79.3%] | -95.0% |
| 1.00 | 101 | 80.2% | [71.4%, 86.8%] | -19.8% |

**Expected calibration error (ECE): 0.221**

> Badly calibrated: stated confidence systematically overstates accuracy. Reported as-is - a calibration table that flatters the model is worth nothing, and the overstatement is itself the finding driving the gate design.

## Deterministic floor vs LLM

| system | type accuracy | 95% CI |
|---|---|---|
| keyword floor (published baseline) | 84/200 (42.0%) | [35.4%, 48.9%] |
| LLM waterfall | 142/200 (71.0%) | [64.4%, 76.8%] |
| **uplift** | **+29.0%** | |

### Disagreement as a free uncertainty signal

Model-decided rows: 189

| | LLM wrong | LLM right |
|---|---|---|
| **floor disagrees** | 44 | 75 |
| **floor agrees** | 7 | 63 |

- precision of disagreement as an error flag: 44/119 (37.0%)
- recall of LLM errors caught: **44/51 (86.3%)**
- accuracy when the two systems **agree**: **63/70 (90.0%)**  [80.8%, 95.1%]
- flagging every disagreement costs review rate 119/189 (63.0%)

> A 42%-accurate keyword matcher is a poor classifier but a useful second opinion. Agreement between two independently-constructed systems is evidence; it costs no tokens and no latency.
> **Limitation to disclose:** the corpus is LLM-generated, so 'the floor also got it right' partly measures how keyword-obvious the example is. On real inbound traffic this signal would likely be weaker.

## Operating points

Definitions: **automation rate** = auto-handled / all 200 rows. **auto precision** = correct type among auto-handled. **errors escaped** = wrong cases actioned with no human in the loop.
Eligible for automation: 166/200 (83.0%) (11 floor rows and 23 guardrail-escalated rows are excluded by construction).
Target auto-handled precision: **>= 95%**

### A. Confidence gate alone

| gate | auto n | automation | review rate | auto precision | 95% CI | errors escaped | per 100 |
|---|---|---|---|---|---|---|---|
| confidence >= 0.80 | 166 | 83.0% | 17.0% | 74.7% | [67.6%, 80.7%] | 42 | 21.0 |
| confidence >= 0.90 | 162 | 81.0% | 19.0% | 74.7% | [67.5%, 80.8%] | 41 | 20.5 |
| confidence >= 0.95 | 88 | 44.0% | 56.0% | 80.7% | [71.2%, 87.6%] | 17 | 8.5 |
| confidence >= 1.00 | 87 | 43.5% | 56.5% | 81.6% | [72.2%, 88.4%] | 16 | 8.0 |

### B. Ensemble gate: floor must agree

| gate | auto n | automation | review rate | auto precision | 95% CI | errors escaped | per 100 |
|---|---|---|---|---|---|---|---|
| floor agrees (any confidence) | 56 | 28.0% | 72.0% | 94.6% | [85.4%, 98.2%] | 3 | 1.5 |

### C. Ensemble + confidence (the combined gate)

| gate | auto n | automation | review rate | auto precision | 95% CI | errors escaped | per 100 |
|---|---|---|---|---|---|---|---|
| agree AND conf >= 0.80 | 56 | 28.0% | 72.0% | 94.6% | [85.4%, 98.2%] | 3 | 1.5 |
| agree AND conf >= 0.90 | 55 | 27.5% | 72.5% | 94.5% | [85.1%, 98.1%] | 3 | 1.5 |
| agree AND conf >= 0.95 | 39 | 19.5% | 80.5% | 92.3% | [79.7%, 97.3%] | 3 | 1.5 |
| agree AND conf >= 1.00 | 39 | 19.5% | 80.5% | 92.3% | [79.7%, 97.3%] | 3 | 1.5 |

> **No gate on today's signals reaches 95% precision.** The confidence scalar is too coarse to separate further. The fix is a better uncertainty signal, not a different cut point: emit a ranked top-2 and gate on the margin (p1 - p2), which also supplies the secondary_type field the multi-intent requirement needs.

### D. Per-class confidence thresholds

One global cut point forces the same operating point onto classes with very different confusability. Lowest threshold reaching target, per predicted class:

| predicted class | threshold | auto n | auto precision |
|---|---|---|---|
| bill | none reaches target | 0 | - |
| hard | none reaches target | 0 | - |
| enq | none reaches target | 0 | - |
| svc | 1.00 | 10 | 100.0% |
| other | 1.00 | 23 | 100.0% |

| gate | auto n | automation | review rate | auto precision | 95% CI | errors escaped | per 100 |
|---|---|---|---|---|---|---|---|
| per-class thresholds | 33 | 16.5% | 83.5% | 100.0% | [89.6%, 100.0%] | 0 | 0.0 |

## Reliability and edge cases

- branch completion: **200/200 (100.0%)**  [98.1%, 100.0%]
- actions per case: min 2, mean 4.2, max 6
- latency ms: p50 534, p95 5022, max 11406
- guardrail firings: 27 across 2 rules
  - hardship_possible: 20
  - hardship_disclosure: 7
- status distribution: {'awaiting_human': 161, 'escalated': 35, 'auto_resolved': 4}
