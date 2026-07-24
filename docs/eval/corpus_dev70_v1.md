
# Evaluation: `corpus_dev70_v1`

- rows: **60**
- models: llama-3.3-70b-versatile
- prompt versions: v1
- floor comparison run: corpus_dev_floor
- generated: 2026-07-24 14:44 UTC (offline, zero API calls)

## Headline

| metric | value | 95% CI (Wilson) |
|---|---|---|
| type accuracy | 51/60 (85.0%) | [73.9%, 91.9%] |
| urgency exact | 33/60 (55.0%) | [42.5%, 66.9%] |
| urgency within-one | 57/60 (95.0%) | [86.3%, 98.3%] |
| branch completion | 60/60 (100.0%) | [94.0%, 100.0%] |
| flagged for review (as run) | 60/60 (100.0%) | [94.0%, 100.0%] |

## Gate status

- configured threshold: **0.9**
- model-decided rows: 60
- confidence range observed: **0.80 - 0.90**
- distinct confidence values: 2 -> [0.8, 0.9]
- rows the gate would flag: **5/60 (8.3%)**

> **COARSE SIGNAL.** Only 2 distinct confidence values, so the sweep can express very few operating points. Treat the sweep as a choice among a handful of fixed points, not a continuous curve.

## Type confusion matrix

| true \ pred | bill | hard | enq | svc | other | n | recall |
|---|---|---|---|---|---|---|---|
| **bill** | **33** | 1 | 3 | 3 | 0 | 40 | 82% |
| **hard** | 0 | **0** | 0 | 0 | 0 | 0 | 0% |
| **enq** | 0 | 0 | **18** | 2 | 0 | 20 | 90% |
| **svc** | 0 | 0 | 0 | **0** | 0 | 0 | 0% |
| **other** | 0 | 0 | 0 | 0 | **0** | 0 | 0% |

## Per-class precision / recall (Wilson 95% CI)

| class | support | precision | P CI | recall | R CI | F1 |
|---|---|---|---|---|---|---|
| bill | 40 | 100.0% (33/33) | [89.6%, 100.0%] | 82.5% (33/40) | [68.0%, 91.3%] | 0.90 |
| hard | 0 | 0.0% (0/1) | [0.0%, 79.3%] | 0.0% (0/0) | [0.0%, 100.0%] | 0.00 |
| enq | 20 | 85.7% (18/21) | [65.4%, 95.0%] | 90.0% (18/20) | [69.9%, 97.2%] | 0.88 |
| svc | 0 | 0.0% (0/5) | [0.0%, 43.4%] | 0.0% (0/0) | [0.0%, 100.0%] | 0.00 |
| other | 0 | 0.0% (0/0) | [0.0%, 100.0%] | 0.0% (0/0) | [0.0%, 100.0%] | 0.00 |

### Worst confusion pairs (targets for the next prompt version)

- **bill -> svc**: 3
- **bill -> enq**: 3
- **enq -> svc**: 2
- **bill -> hard**: 1

## Urgency confusion matrix

| true \ pred | low | medi | high | crit | n | recall |
|---|---|---|---|---|---|---|
| **low** | **13** | 13 | 0 | 0 | 26 | 50% |
| **medi** | 2 | **13** | 1 | 0 | 16 | 81% |
| **high** | 0 | 7 | **7** | 0 | 14 | 50% |
| **crit** | 0 | 3 | 1 | **0** | 4 | 0% |

## Urgency

- exact: 33/60 (55.0%)  [42.5%, 66.9%]
- within one level: 57/60 (95.0%)  [86.3%, 98.3%]
- over-escalated: 14/60 (23.3%) | under-escalated: 13/60 (21.7%)
- mean signed error: -0.03 levels

Error magnitude distribution:
| |delta| | count |
|---|---|
| 0 | 33 |
| 1 | 24 |
| 2 | 3 |

> Net **over**-escalation. The cheap direction - a case arrives at a human sooner than needed. Consistent with the escalate-only guardrail design, and within-one errors only shift queue position.

## Accuracy by decision source

| source | n | type acc | CI | urgency exact | flagged | branch complete |
|---|---|---|---|---|---|---|
| llm_primary | 60 | 85.0% | [73.9%, 91.9%] | 55.0% | 100% | 100% |

## Calibration (accuracy by stated confidence)

| stated confidence | n | actual accuracy | 95% CI | gap |
|---|---|---|---|---|
| 0.80 | 5 | 100.0% | [56.6%, 100.0%] | +20.0% |
| 0.90 | 55 | 83.6% | [71.7%, 91.1%] | -6.4% |

**Expected calibration error (ECE): 0.075**

> Reasonably calibrated within the resolution of the signal.

## Deterministic floor vs LLM

| system | type accuracy | 95% CI |
|---|---|---|
| keyword floor (published baseline) | 14/60 (23.3%) | [14.4%, 35.4%] |
| LLM waterfall | 51/60 (85.0%) | [73.9%, 91.9%] |
| **uplift** | **+61.7%** | |

### Disagreement as a free uncertainty signal

Model-decided rows: 60

| | LLM wrong | LLM right |
|---|---|---|
| **floor disagrees** | 8 | 37 |
| **floor agrees** | 1 | 14 |

- precision of disagreement as an error flag: 8/45 (17.8%)
- recall of LLM errors caught: **8/9 (88.9%)**
- accuracy when the two systems **agree**: **14/15 (93.3%)**  [70.2%, 98.8%]
- flagging every disagreement costs review rate 45/60 (75.0%)

> A 42%-accurate keyword matcher is a poor classifier but a useful second opinion. Agreement between two independently-constructed systems is evidence; it costs no tokens and no latency.
> **Limitation to disclose:** the corpus is LLM-generated, so 'the floor also got it right' partly measures how keyword-obvious the example is. On real inbound traffic this signal would likely be weaker.

## Operating points

Definitions: **automation rate** = auto-handled / all 60 rows. **auto precision** = correct type among auto-handled. **errors escaped** = wrong cases actioned with no human in the loop.
Eligible for automation: 57/60 (95.0%) (0 floor rows and 3 guardrail-escalated rows are excluded by construction).
Target auto-handled precision: **>= 95%**

### A. Confidence gate alone

| gate | auto n | automation | review rate | auto precision | 95% CI | errors escaped | per 100 |
|---|---|---|---|---|---|---|---|
| confidence >= 0.80 | 57 | 95.0% | 5.0% | 86.0% | [74.7%, 92.7%] | 8 | 13.3 |
| confidence >= 0.90 | 54 | 90.0% | 10.0% | 85.2% | [73.4%, 92.3%] | 8 | 13.3 |

### B. Ensemble gate: floor must agree

| gate | auto n | automation | review rate | auto precision | 95% CI | errors escaped | per 100 |
|---|---|---|---|---|---|---|---|
| floor agrees (any confidence) | 14 | 23.3% | 76.7% | 100.0% | [78.5%, 100.0%] | 0 | 0.0 |

### C. Ensemble + confidence (the combined gate)

| gate | auto n | automation | review rate | auto precision | 95% CI | errors escaped | per 100 |
|---|---|---|---|---|---|---|---|
| agree AND conf >= 0.80 | 14 | 23.3% | 76.7% | 100.0% | [78.5%, 100.0%] | 0 | 0.0 |
| agree AND conf >= 0.90 | 14 | 23.3% | 76.7% | 100.0% | [78.5%, 100.0%] | 0 | 0.0 |

> **Operating point available today:** require floor agreement and confidence >= 0.80. Automates 23% of volume at 100.0% precision, with 0 errors escaping to customers across the split. Derived by sweep on dev; the test split remains untouched.

### D. Per-class confidence thresholds

One global cut point forces the same operating point onto classes with very different confusability. Lowest threshold reaching target, per predicted class:

| predicted class | threshold | auto n | auto precision |
|---|---|---|---|
| bill | 0.80 | 32 | 100.0% |
| hard | none reaches target | 0 | - |
| enq | none reaches target | 0 | - |
| svc | none reaches target | 0 | - |
| other | none reaches target | 0 | - |

| gate | auto n | automation | review rate | auto precision | 95% CI | errors escaped | per 100 |
|---|---|---|---|---|---|---|---|
| per-class thresholds | 32 | 53.3% | 46.7% | 100.0% | [89.3%, 100.0%] | 0 | 0.0 |

## Reliability and edge cases

- branch completion: **60/60 (100.0%)**  [94.0%, 100.0%]
- actions per case: min 2, mean 4.0, max 6
- latency ms: p50 743, p95 1090, max 1842
- guardrail firings: 3 across 1 rules
  - hardship_possible: 3
- status distribution: {'awaiting_human': 59, 'escalated': 1}
