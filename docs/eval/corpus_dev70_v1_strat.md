
# Evaluation: `corpus_dev70_v1_strat`

- rows: **60**
- models: llama-3.3-70b-versatile
- prompt versions: v1
- floor comparison run: corpus_dev_floor
- generated: 2026-07-24 14:48 UTC (offline, zero API calls)

## Headline

| metric | value | 95% CI (Wilson) |
|---|---|---|
| type accuracy | 51/60 (85.0%) | [73.9%, 91.9%] |
| urgency exact | 27/60 (45.0%) | [33.1%, 57.5%] |
| urgency within-one | 51/60 (85.0%) | [73.9%, 91.9%] |
| branch completion | 60/60 (100.0%) | [94.0%, 100.0%] |
| flagged for review (as run) | 51/60 (85.0%) | [73.9%, 91.9%] |

## Gate status

- configured threshold: **0.9**
- model-decided rows: 60
- confidence range observed: **0.80 - 1.00**
- distinct confidence values: 3 -> [0.8, 0.9, 1.0]
- rows the gate would flag: **1/60 (1.7%)**

> **COARSE SIGNAL.** Only 3 distinct confidence values, so the sweep can express very few operating points. Treat the sweep as a choice among a handful of fixed points, not a continuous curve.

## Type confusion matrix

| true \ pred | bill | hard | enq | svc | other | n | recall |
|---|---|---|---|---|---|---|---|
| **bill** | **10** | 0 | 0 | 2 | 0 | 12 | 83% |
| **hard** | 0 | **11** | 0 | 1 | 0 | 12 | 92% |
| **enq** | 0 | 1 | **10** | 1 | 0 | 12 | 83% |
| **svc** | 0 | 3 | 0 | **9** | 0 | 12 | 75% |
| **other** | 1 | 0 | 0 | 0 | **11** | 12 | 92% |

## Per-class precision / recall (Wilson 95% CI)

| class | support | precision | P CI | recall | R CI | F1 |
|---|---|---|---|---|---|---|
| bill | 12 | 90.9% (10/11) | [62.3%, 98.4%] | 83.3% (10/12) | [55.2%, 95.3%] | 0.87 |
| hard | 12 | 73.3% (11/15) | [48.0%, 89.1%] | 91.7% (11/12) | [64.6%, 98.5%] | 0.81 |
| enq | 12 | 100.0% (10/10) | [72.2%, 100.0%] | 83.3% (10/12) | [55.2%, 95.3%] | 0.91 |
| svc | 12 | 69.2% (9/13) | [42.4%, 87.3%] | 75.0% (9/12) | [46.8%, 91.1%] | 0.72 |
| other | 12 | 100.0% (11/11) | [74.1%, 100.0%] | 91.7% (11/12) | [64.6%, 98.5%] | 0.96 |

### Worst confusion pairs (targets for the next prompt version)

- **svc -> hard**: 3
- **bill -> svc**: 2
- **other -> bill**: 1
- **enq -> svc**: 1
- **enq -> hard**: 1
- **hard -> svc**: 1

## Urgency confusion matrix

| true \ pred | low | medi | high | crit | n | recall |
|---|---|---|---|---|---|---|
| **low** | **12** | 4 | 2 | 0 | 18 | 67% |
| **medi** | 6 | **9** | 3 | 0 | 18 | 50% |
| **high** | 1 | 7 | **6** | 0 | 14 | 43% |
| **crit** | 2 | 4 | 4 | **0** | 10 | 0% |

## Urgency

- exact: 27/60 (45.0%)  [33.1%, 57.5%]
- within one level: 51/60 (85.0%)  [73.9%, 91.9%]
- over-escalated: 9/60 (15.0%) | under-escalated: 24/60 (40.0%)
- mean signed error: -0.37 levels

Error magnitude distribution:
| |delta| | count |
|---|---|
| 0 | 27 |
| 1 | 24 |
| 2 | 7 |
| 3 | 2 |

> Net **under**-escalation. This is the costly direction: an urgent case sitting in a slow queue is an SLA breach. Worth a prompt fix.

## Accuracy by decision source

| source | n | type acc | CI | urgency exact | flagged | branch complete |
|---|---|---|---|---|---|---|
| guardrail_override | 1 | 100.0% | [20.7%, 100.0%] | 100.0% | 100% | 100% |
| llm_primary | 59 | 84.7% | [73.5%, 91.8%] | 44.1% | 85% | 100% |

## Calibration (accuracy by stated confidence)

| stated confidence | n | actual accuracy | 95% CI | gap |
|---|---|---|---|---|
| 0.80 | 1 | 0.0% | [0.0%, 79.3%] | -80.0% |
| 0.90 | 50 | 84.0% | [71.5%, 91.7%] | -6.0% |
| 1.00 | 9 | 100.0% | [70.1%, 100.0%] | +0.0% |

**Expected calibration error (ECE): 0.063**

> Reasonably calibrated within the resolution of the signal.

## Deterministic floor vs LLM

| system | type accuracy | 95% CI |
|---|---|---|
| keyword floor (published baseline) | 21/60 (35.0%) | [24.2%, 47.6%] |
| LLM waterfall | 51/60 (85.0%) | [73.9%, 91.9%] |
| **uplift** | **+50.0%** | |

### Disagreement as a free uncertainty signal

Model-decided rows: 60

| | LLM wrong | LLM right |
|---|---|---|
| **floor disagrees** | 5 | 31 |
| **floor agrees** | 4 | 20 |

- precision of disagreement as an error flag: 5/36 (13.9%)
- recall of LLM errors caught: **5/9 (55.6%)**
- accuracy when the two systems **agree**: **20/24 (83.3%)**  [64.1%, 93.3%]
- flagging every disagreement costs review rate 36/60 (60.0%)

> A 42%-accurate keyword matcher is a poor classifier but a useful second opinion. Agreement between two independently-constructed systems is evidence; it costs no tokens and no latency.
> **Limitation to disclose:** the corpus is LLM-generated, so 'the floor also got it right' partly measures how keyword-obvious the example is. On real inbound traffic this signal would likely be weaker.

## Operating points

Definitions: **automation rate** = auto-handled / all 60 rows. **auto precision** = correct type among auto-handled. **errors escaped** = wrong cases actioned with no human in the loop.
Eligible for automation: 53/60 (88.3%) (0 floor rows and 7 guardrail-escalated rows are excluded by construction).
Target auto-handled precision: **>= 95%**

### A. Confidence gate alone

| gate | auto n | automation | review rate | auto precision | 95% CI | errors escaped | per 100 |
|---|---|---|---|---|---|---|---|
| confidence >= 0.80 | 53 | 88.3% | 11.7% | 86.8% | [75.2%, 93.5%] | 7 | 11.7 |
| confidence >= 0.90 | 52 | 86.7% | 13.3% | 88.5% | [77.0%, 94.6%] | 6 | 10.0 |
| confidence >= 1.00 | 9 | 15.0% | 85.0% | 100.0% | [70.1%, 100.0%] | 0 | 0.0 |

### B. Ensemble gate: floor must agree

| gate | auto n | automation | review rate | auto precision | 95% CI | errors escaped | per 100 |
|---|---|---|---|---|---|---|---|
| floor agrees (any confidence) | 18 | 30.0% | 70.0% | 88.9% | [67.2%, 96.9%] | 2 | 3.3 |

### C. Ensemble + confidence (the combined gate)

| gate | auto n | automation | review rate | auto precision | 95% CI | errors escaped | per 100 |
|---|---|---|---|---|---|---|---|
| agree AND conf >= 0.80 | 18 | 30.0% | 70.0% | 88.9% | [67.2%, 96.9%] | 2 | 3.3 |
| agree AND conf >= 0.90 | 18 | 30.0% | 70.0% | 88.9% | [67.2%, 96.9%] | 2 | 3.3 |
| agree AND conf >= 1.00 | 9 | 15.0% | 85.0% | 100.0% | [70.1%, 100.0%] | 0 | 0.0 |

> **Operating point available today:** require floor agreement and confidence >= 1.00. Automates 15% of volume at 100.0% precision, with 0 errors escaping to customers across the split. Derived by sweep on dev; the test split remains untouched.

### D. Per-class confidence thresholds

One global cut point forces the same operating point onto classes with very different confusability. Lowest threshold reaching target, per predicted class:

| predicted class | threshold | auto n | auto precision |
|---|---|---|---|
| bill | 0.90 | 10 | 100.0% |
| hard | none reaches target | 0 | - |
| enq | 0.90 | 10 | 100.0% |
| svc | none reaches target | 0 | - |
| other | 0.90 | 11 | 100.0% |

| gate | auto n | automation | review rate | auto precision | 95% CI | errors escaped | per 100 |
|---|---|---|---|---|---|---|---|
| per-class thresholds | 31 | 51.7% | 48.3% | 100.0% | [89.0%, 100.0%] | 0 | 0.0 |

## Reliability and edge cases

- branch completion: **60/60 (100.0%)**  [94.0%, 100.0%]
- actions per case: min 2, mean 4.2, max 6
- latency ms: p50 684, p95 1033, max 1873
- guardrail firings: 8 across 2 rules
  - hardship_possible: 5
  - hardship_disclosure: 3
- status distribution: {'awaiting_human': 45, 'escalated': 15}
