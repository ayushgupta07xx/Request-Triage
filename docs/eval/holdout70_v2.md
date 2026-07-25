
# Evaluation: `holdout70_v2`

- rows: **40**
- models: llama-3.3-70b-versatile
- prompt versions: v1
- floor comparison run: (none supplied)
- generated: 2026-07-25 06:50 UTC (offline, zero API calls)

## Headline

| metric | value | 95% CI (Wilson) |
|---|---|---|
| type accuracy | 37/40 (92.5%) | [80.1%, 97.4%] |
| urgency exact | 25/40 (62.5%) | [47.0%, 75.8%] |
| urgency within-one | 38/40 (95.0%) | [83.5%, 98.6%] |
| branch completion | 40/40 (100.0%) | [91.2%, 100.0%] |
| flagged for review (as run) | 35/40 (87.5%) | [73.9%, 94.5%] |

## Gate status

- configured threshold: **0.72**
- model-decided rows: 40
- confidence range observed: **0.90 - 1.00**
- distinct confidence values: 3 -> [0.9, 0.99, 1.0]
- rows the gate would flag: **0/40 (0.0%)**

> **INERT GATE.** The threshold (0.72) sits at or below the lowest observed model confidence (0.90). It cannot fire on any model-decided row. Review volume is coming entirely from the keyword floor and the guardrails, not from the confidence gate.

## Type confusion matrix

| true \ pred | bill | hard | enq | svc | other | n | recall |
|---|---|---|---|---|---|---|---|
| **bill** | **7** | 1 | 0 | 0 | 0 | 8 | 88% |
| **hard** | 0 | **7** | 0 | 0 | 0 | 7 | 100% |
| **enq** | 0 | 0 | **8** | 1 | 0 | 9 | 89% |
| **svc** | 0 | 1 | 0 | **8** | 0 | 9 | 89% |
| **other** | 0 | 0 | 0 | 0 | **7** | 7 | 100% |

## Per-class precision / recall (Wilson 95% CI)

| class | support | precision | P CI | recall | R CI | F1 |
|---|---|---|---|---|---|---|
| bill | 8 | 100.0% (7/7) | [64.6%, 100.0%] | 87.5% (7/8) | [52.9%, 97.8%] | 0.93 |
| hard | 7 | 77.8% (7/9) | [45.3%, 93.7%] | 100.0% (7/7) | [64.6%, 100.0%] | 0.88 |
| enq | 9 | 100.0% (8/8) | [67.6%, 100.0%] | 88.9% (8/9) | [56.5%, 98.0%] | 0.94 |
| svc | 9 | 88.9% (8/9) | [56.5%, 98.0%] | 88.9% (8/9) | [56.5%, 98.0%] | 0.89 |
| other | 7 | 100.0% (7/7) | [64.6%, 100.0%] | 100.0% (7/7) | [64.6%, 100.0%] | 1.00 |

### Worst confusion pairs (targets for the next prompt version)

- **svc -> hard**: 1
- **enq -> svc**: 1
- **bill -> hard**: 1

## Urgency confusion matrix

| true \ pred | low | medi | high | crit | n | recall |
|---|---|---|---|---|---|---|
| **low** | **12** | 0 | 0 | 0 | 12 | 100% |
| **medi** | 1 | **4** | 6 | 1 | 12 | 33% |
| **high** | 1 | 0 | **5** | 5 | 11 | 45% |
| **crit** | 0 | 0 | 1 | **4** | 5 | 80% |

## Urgency

- exact: 25/40 (62.5%)  [47.0%, 75.8%]
- within one level: 38/40 (95.0%)  [83.5%, 98.6%]
- over-escalated: 12/40 (30.0%) | under-escalated: 3/40 (7.5%)
- mean signed error: +0.23 levels

Error magnitude distribution:
| |delta| | count |
|---|---|
| 0 | 25 |
| 1 | 13 |
| 2 | 2 |

> Net **over**-escalation. The cheap direction - a case arrives at a human sooner than needed. Consistent with the escalate-only guardrail design, and within-one errors only shift queue position.

## Accuracy by decision source

| source | n | type acc | CI | urgency exact | flagged | branch complete |
|---|---|---|---|---|---|---|
| guardrail_override | 5 | 60.0% | [23.1%, 88.2%] | 40.0% | 100% | 100% |
| llm_primary | 35 | 97.1% | [85.5%, 99.5%] | 65.7% | 86% | 100% |

## Calibration (accuracy by stated confidence)

| stated confidence | n | actual accuracy | 95% CI | gap |
|---|---|---|---|---|
| 0.90 | 28 | 89.3% | [72.8%, 96.3%] | -0.7% |
| 0.99 | 5 | 100.0% | [56.6%, 100.0%] | +1.0% |
| 1.00 | 7 | 100.0% | [64.6%, 100.0%] | +0.0% |

**Expected calibration error (ECE): 0.006**

> Reasonably calibrated within the resolution of the signal.

## Operating points

Definitions: **automation rate** = auto-handled / all 40 rows. **auto precision** = correct type among auto-handled. **errors escaped** = wrong cases actioned with no human in the loop.
Eligible for automation: 29/40 (72.5%) (0 floor rows and 11 guardrail-escalated rows are excluded by construction).
Target auto-handled precision: **>= 95%**

### A. Confidence gate alone

| gate | auto n | automation | review rate | auto precision | 95% CI | errors escaped | per 100 |
|---|---|---|---|---|---|---|---|
| confidence >= 0.90 | 29 | 72.5% | 27.5% | 96.6% | [82.8%, 99.4%] | 1 | 2.5 |
| confidence >= 0.99 | 10 | 25.0% | 75.0% | 100.0% | [72.2%, 100.0%] | 0 | 0.0 |
| confidence >= 1.00 | 7 | 17.5% | 82.5% | 100.0% | [64.6%, 100.0%] | 0 | 0.0 |

### D. Per-class confidence thresholds

One global cut point forces the same operating point onto classes with very different confusability. Lowest threshold reaching target, per predicted class:

| predicted class | threshold | auto n | auto precision |
|---|---|---|---|
| bill | 0.90 | 5 | 100.0% |
| hard | 0.99 | 2 | 100.0% |
| enq | 0.90 | 7 | 100.0% |
| svc | 0.99 | 1 | 100.0% |
| other | 1.00 | 7 | 100.0% |

| gate | auto n | automation | review rate | auto precision | 95% CI | errors escaped | per 100 |
|---|---|---|---|---|---|---|---|
| per-class thresholds | 22 | 55.0% | 45.0% | 100.0% | [85.1%, 100.0%] | 0 | 0.0 |

## Reliability and edge cases

- branch completion: **40/40 (100.0%)**  [91.2%, 100.0%]
- actions per case: min 2, mean 4.2, max 6
- latency ms: p50 657, p95 879, max 1072
- guardrail firings: 16 across 5 rules
  - regulatory_escalation: 6
  - hardship_disclosure: 5
  - hardship_possible: 3
  - vulnerability_indicator: 1
  - complaint_language: 1
- status distribution: {'awaiting_human': 31, 'escalated': 9}
