
# Evaluation: `corpus_test70_v2`

- rows: **100**
- models: llama-3.3-70b-versatile
- prompt versions: v1
- floor comparison run: corpus_test_floor
- generated: 2026-07-25 06:58 UTC (offline, zero API calls)

## Headline

| metric | value | 95% CI (Wilson) |
|---|---|---|
| type accuracy | 88/100 (88.0%) | [80.2%, 93.0%] |
| urgency exact | 52/100 (52.0%) | [42.3%, 61.5%] |
| urgency within-one | 91/100 (91.0%) | [83.8%, 95.2%] |
| branch completion | 100/100 (100.0%) | [96.3%, 100.0%] |
| flagged for review (as run) | 85/100 (85.0%) | [76.7%, 90.7%] |

## Gate status

- configured threshold: **1.0**
- model-decided rows: 100
- confidence range observed: **0.80 - 1.00**
- distinct confidence values: 3 -> [0.8, 0.9, 1.0]
- rows the gate would flag: **89/100 (89.0%)**

> **COARSE SIGNAL.** Only 3 distinct confidence values, so the sweep can express very few operating points. Treat the sweep as a choice among a handful of fixed points, not a continuous curve.

## Type confusion matrix

| true \ pred | bill | hard | enq | svc | other | n | recall |
|---|---|---|---|---|---|---|---|
| **bill** | **18** | 1 | 0 | 1 | 0 | 20 | 90% |
| **hard** | 0 | **14** | 0 | 3 | 0 | 17 | 82% |
| **enq** | 1 | 0 | **18** | 3 | 0 | 22 | 82% |
| **svc** | 0 | 0 | 1 | **22** | 0 | 23 | 96% |
| **other** | 0 | 0 | 0 | 2 | **16** | 18 | 89% |

## Per-class precision / recall (Wilson 95% CI)

| class | support | precision | P CI | recall | R CI | F1 |
|---|---|---|---|---|---|---|
| bill | 20 | 94.7% (18/19) | [75.4%, 99.1%] | 90.0% (18/20) | [69.9%, 97.2%] | 0.92 |
| hard | 17 | 93.3% (14/15) | [70.2%, 98.8%] | 82.4% (14/17) | [59.0%, 93.8%] | 0.87 |
| enq | 22 | 94.7% (18/19) | [75.4%, 99.1%] | 81.8% (18/22) | [61.5%, 92.7%] | 0.88 |
| svc | 23 | 71.0% (22/31) | [53.4%, 83.9%] | 95.7% (22/23) | [79.0%, 99.2%] | 0.81 |
| other | 18 | 100.0% (16/16) | [80.6%, 100.0%] | 88.9% (16/18) | [67.2%, 96.9%] | 0.94 |

### Worst confusion pairs (targets for the next prompt version)

- **enq -> svc**: 3
- **hard -> svc**: 3
- **other -> svc**: 2
- **svc -> enq**: 1
- **enq -> bill**: 1
- **bill -> svc**: 1

## Urgency confusion matrix

| true \ pred | low | medi | high | crit | n | recall |
|---|---|---|---|---|---|---|
| **low** | **23** | 9 | 1 | 0 | 33 | 70% |
| **medi** | 8 | **17** | 7 | 0 | 32 | 53% |
| **high** | 3 | 9 | **12** | 0 | 24 | 50% |
| **crit** | 1 | 4 | 6 | **0** | 11 | 0% |

## Urgency

- exact: 52/100 (52.0%)  [42.3%, 61.5%]
- within one level: 91/100 (91.0%)  [83.8%, 95.2%]
- over-escalated: 17/100 (17.0%) | under-escalated: 31/100 (31.0%)
- mean signed error: -0.22 levels

Error magnitude distribution:
| |delta| | count |
|---|---|
| 0 | 52 |
| 1 | 39 |
| 2 | 8 |
| 3 | 1 |

> Net **under**-escalation. This is the costly direction: an urgent case sitting in a slow queue is an SLA breach. Worth a prompt fix.

## Accuracy by decision source

| source | n | type acc | CI | urgency exact | flagged | branch complete |
|---|---|---|---|---|---|---|
| llm_primary | 100 | 88.0% | [80.2%, 93.0%] | 52.0% | 85% | 100% |

## Calibration (accuracy by stated confidence)

| stated confidence | n | actual accuracy | 95% CI | gap |
|---|---|---|---|---|
| 0.80 | 4 | 50.0% | [15.0%, 85.0%] | -30.0% |
| 0.90 | 85 | 88.2% | [79.7%, 93.5%] | -1.8% |
| 1.00 | 11 | 100.0% | [74.1%, 100.0%] | +0.0% |

**Expected calibration error (ECE): 0.027**

> Reasonably calibrated within the resolution of the signal.

## Deterministic floor vs LLM

| system | type accuracy | 95% CI |
|---|---|---|
| keyword floor (published baseline) | 47/100 (47.0%) | [37.5%, 56.7%] |
| LLM waterfall | 88/100 (88.0%) | [80.2%, 93.0%] |
| **uplift** | **+41.0%** | |

### Disagreement as a free uncertainty signal

Model-decided rows: 100

| | LLM wrong | LLM right |
|---|---|---|
| **floor disagrees** | 10 | 44 |
| **floor agrees** | 2 | 44 |

- precision of disagreement as an error flag: 10/54 (18.5%)
- recall of LLM errors caught: **10/12 (83.3%)**
- accuracy when the two systems **agree**: **44/46 (95.7%)**  [85.5%, 98.8%]
- flagging every disagreement costs review rate 54/100 (54.0%)

> A 42%-accurate keyword matcher is a poor classifier but a useful second opinion. Agreement between two independently-constructed systems is evidence; it costs no tokens and no latency.
> **Limitation to disclose:** the corpus is LLM-generated, so 'the floor also got it right' partly measures how keyword-obvious the example is. On real inbound traffic this signal would likely be weaker.

## Operating points

Definitions: **automation rate** = auto-handled / all 100 rows. **auto precision** = correct type among auto-handled. **errors escaped** = wrong cases actioned with no human in the loop.
Eligible for automation: 86/100 (86.0%) (0 floor rows and 14 guardrail-escalated rows are excluded by construction).
Target auto-handled precision: **>= 95%**

### A. Confidence gate alone

| gate | auto n | automation | review rate | auto precision | 95% CI | errors escaped | per 100 |
|---|---|---|---|---|---|---|---|
| confidence >= 0.80 | 86 | 86.0% | 14.0% | 87.2% | [78.5%, 92.7%] | 11 | 11.0 |
| confidence >= 0.90 | 82 | 82.0% | 18.0% | 89.0% | [80.4%, 94.1%] | 9 | 9.0 |
| confidence >= 1.00 | 10 | 10.0% | 90.0% | 100.0% | [72.2%, 100.0%] | 0 | 0.0 |

### B. Ensemble gate: floor must agree

| gate | auto n | automation | review rate | auto precision | 95% CI | errors escaped | per 100 |
|---|---|---|---|---|---|---|---|
| floor agrees (any confidence) | 36 | 36.0% | 64.0% | 97.2% | [85.8%, 99.5%] | 1 | 1.0 |

### C. Ensemble + confidence (the combined gate)

| gate | auto n | automation | review rate | auto precision | 95% CI | errors escaped | per 100 |
|---|---|---|---|---|---|---|---|
| agree AND conf >= 0.80 | 36 | 36.0% | 64.0% | 97.2% | [85.8%, 99.5%] | 1 | 1.0 |
| agree AND conf >= 0.90 | 36 | 36.0% | 64.0% | 97.2% | [85.8%, 99.5%] | 1 | 1.0 |
| agree AND conf >= 1.00 | 10 | 10.0% | 90.0% | 100.0% | [72.2%, 100.0%] | 0 | 0.0 |

> **Operating point available today:** require floor agreement and confidence >= 0.80. Automates 36% of volume at 97.2% precision, with 1 errors escaping to customers across the split. Derived by sweep on dev; the test split remains untouched.

### D. Per-class confidence thresholds

One global cut point forces the same operating point onto classes with very different confusability. Lowest threshold reaching target, per predicted class:

| predicted class | threshold | auto n | auto precision |
|---|---|---|---|
| bill | none reaches target | 0 | - |
| hard | 0.90 | 6 | 100.0% |
| enq | none reaches target | 0 | - |
| svc | none reaches target | 0 | - |
| other | 0.90 | 15 | 100.0% |

| gate | auto n | automation | review rate | auto precision | 95% CI | errors escaped | per 100 |
|---|---|---|---|---|---|---|---|
| per-class thresholds | 21 | 21.0% | 79.0% | 100.0% | [84.5%, 100.0%] | 0 | 0.0 |

## Reliability and edge cases

- branch completion: **100/100 (100.0%)**  [96.3%, 100.0%]
- actions per case: min 2, mean 4.1, max 6
- latency ms: p50 588, p95 760, max 966
- guardrail firings: 15 across 2 rules
  - hardship_possible: 13
  - hardship_disclosure: 2
- status distribution: {'awaiting_human': 85, 'escalated': 15}
