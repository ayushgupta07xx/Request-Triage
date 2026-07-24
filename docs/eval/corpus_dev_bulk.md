
# Evaluation: `corpus_dev_bulk`

- rows: **200**
- models: keyword-floor, llama-3.1-8b-instant
- prompt versions: v1
- floor comparison run: corpus_dev_floor
- generated: 2026-07-24 12:58 UTC (offline, zero API calls)

## Headline

| metric | value | 95% CI (Wilson) |
|---|---|---|
| type accuracy | 141/200 (70.5%) | [63.8%, 76.4%] |
| urgency exact | 80/200 (40.0%) | [33.5%, 46.9%] |
| urgency within-one | 175/200 (87.5%) | [82.2%, 91.4%] |
| branch completion | 200/200 (100.0%) | [98.1%, 100.0%] |
| flagged for review (as run) | 15/200 (7.5%) | [4.6%, 12.0%] |

## Gate status

- configured threshold: **0.72**
- model-decided rows: 190
- confidence range observed: **0.80 - 1.00**
- distinct confidence values: 3 -> [0.8, 0.9, 1.0]
- rows the gate would flag: **0/190 (0.0%)**

> **INERT GATE.** The threshold (0.72) sits at or below the lowest observed model confidence (0.80). It cannot fire on any model-decided row. Review volume is coming entirely from the keyword floor and the guardrails, not from the confidence gate.

## Type confusion matrix

| true \ pred | bill | hard | enq | svc | other | n | recall |
|---|---|---|---|---|---|---|---|
| **bill** | **25** | 2 | 3 | 9 | 1 | 40 | 62% |
| **hard** | 0 | **27** | 1 | 6 | 0 | 34 | 79% |
| **enq** | 0 | 3 | **25** | 13 | 3 | 44 | 57% |
| **svc** | 0 | 5 | 2 | **39** | 0 | 46 | 85% |
| **other** | 2 | 0 | 3 | 6 | **25** | 36 | 69% |

## Per-class precision / recall (Wilson 95% CI)

| class | support | precision | P CI | recall | R CI | F1 |
|---|---|---|---|---|---|---|
| bill | 40 | 92.6% (25/27) | [76.6%, 97.9%] | 62.5% (25/40) | [47.0%, 75.8%] | 0.75 |
| hard | 34 | 73.0% (27/37) | [57.0%, 84.6%] | 79.4% (27/34) | [63.2%, 89.7%] | 0.76 |
| enq | 44 | 73.5% (25/34) | [56.9%, 85.4%] | 56.8% (25/44) | [42.2%, 70.3%] | 0.64 |
| svc | 46 | 53.4% (39/73) | [42.1%, 64.4%] | 84.8% (39/46) | [71.8%, 92.4%] | 0.66 |
| other | 36 | 86.2% (25/29) | [69.4%, 94.5%] | 69.4% (25/36) | [53.1%, 82.0%] | 0.77 |

### Worst confusion pairs (targets for the next prompt version)

- **enq -> svc**: 13
- **bill -> svc**: 9
- **other -> svc**: 6
- **hard -> svc**: 6
- **svc -> hard**: 5
- **other -> enq**: 3

## Urgency confusion matrix

| true \ pred | low | medi | high | crit | n | recall |
|---|---|---|---|---|---|---|
| **low** | **43** | 12 | 11 | 0 | 66 | 65% |
| **medi** | 24 | **6** | 34 | 0 | 64 | 9% |
| **high** | 10 | 7 | **29** | 2 | 48 | 60% |
| **crit** | 3 | 1 | 16 | **2** | 22 | 9% |

## Urgency

- exact: 80/200 (40.0%)  [33.5%, 46.9%]
- within one level: 175/200 (87.5%)  [82.2%, 91.4%]
- over-escalated: 59/200 (29.5%) | under-escalated: 61/200 (30.5%)
- mean signed error: -0.04 levels

Error magnitude distribution:
| |delta| | count |
|---|---|
| 0 | 80 |
| 1 | 95 |
| 2 | 22 |
| 3 | 3 |

> Net **under**-escalation. This is the costly direction: an urgent case sitting in a slow queue is an SLA breach. Worth a prompt fix.

## Accuracy by decision source

| source | n | type acc | CI | urgency exact | flagged | branch complete |
|---|---|---|---|---|---|---|
| keyword_fallback | 10 | 30.0% | [10.8%, 60.3%] | 20.0% | 100% | 100% |
| llm_primary | 190 | 72.6% | [65.9%, 78.5%] | 41.1% | 3% | 100% |

> 10 rows degraded to the keyword floor under TPM pressure. They drag headline type accuracy down by **2.1 points** (72.6% on model-decided rows vs 70.5% overall). The headline stays the all-rows number - degradation is part of the system's real behaviour - but the split is reported so the cause is legible.

## Calibration (accuracy by stated confidence)

| stated confidence | n | actual accuracy | 95% CI | gap |
|---|---|---|---|---|
| 0.80 | 3 | 0.0% | [0.0%, 56.2%] | -80.0% |
| 0.90 | 95 | 62.1% | [52.1%, 71.2%] | -27.9% |
| 1.00 | 92 | 85.9% | [77.3%, 91.6%] | -14.1% |

**Expected calibration error (ECE): 0.221**

> Badly calibrated: stated confidence systematically overstates accuracy. Reported as-is - a calibration table that flatters the model is worth nothing, and the overstatement is itself the finding driving the gate design.

## Deterministic floor vs LLM

| system | type accuracy | 95% CI |
|---|---|---|
| keyword floor (published baseline) | 84/200 (42.0%) | [35.4%, 48.9%] |
| LLM waterfall | 141/200 (70.5%) | [63.8%, 76.4%] |
| **uplift** | **+28.5%** | |

### Disagreement as a free uncertainty signal

Model-decided rows: 190

| | LLM wrong | LLM right |
|---|---|---|
| **floor disagrees** | 46 | 71 |
| **floor agrees** | 6 | 67 |

- precision of disagreement as an error flag: 46/117 (39.3%)
- recall of LLM errors caught: **46/52 (88.5%)**
- accuracy when the two systems **agree**: **67/73 (91.8%)**  [83.2%, 96.2%]
- flagging every disagreement costs review rate 117/190 (61.6%)

> A 42%-accurate keyword matcher is a poor classifier but a useful second opinion. Agreement between two independently-constructed systems is evidence; it costs no tokens and no latency.
> **Limitation to disclose:** the corpus is LLM-generated, so 'the floor also got it right' partly measures how keyword-obvious the example is. On real inbound traffic this signal would likely be weaker.

## Operating points

Definitions: **automation rate** = auto-handled / all 200 rows. **auto precision** = correct type among auto-handled. **errors escaped** = wrong cases actioned with no human in the loop.
Eligible for automation: 185/200 (92.5%) (10 floor rows and 5 guardrail-escalated rows are excluded by construction).
Target auto-handled precision: **>= 95%**

### A. Confidence gate alone

| gate | auto n | automation | review rate | auto precision | 95% CI | errors escaped | per 100 |
|---|---|---|---|---|---|---|---|
| confidence >= 0.80 | 185 | 92.5% | 7.5% | 71.9% | [65.0%, 77.9%] | 52 | 26.0 |
| confidence >= 0.90 | 182 | 91.0% | 9.0% | 73.1% | [66.2%, 79.0%] | 49 | 24.5 |
| confidence >= 1.00 | 90 | 45.0% | 55.0% | 85.6% | [76.8%, 91.4%] | 13 | 6.5 |

### B. Ensemble gate: floor must agree

| gate | auto n | automation | review rate | auto precision | 95% CI | errors escaped | per 100 |
|---|---|---|---|---|---|---|---|
| floor agrees (any confidence) | 68 | 34.0% | 66.0% | 91.2% | [82.1%, 95.9%] | 6 | 3.0 |

### C. Ensemble + confidence (the combined gate)

| gate | auto n | automation | review rate | auto precision | 95% CI | errors escaped | per 100 |
|---|---|---|---|---|---|---|---|
| agree AND conf >= 0.80 | 68 | 34.0% | 66.0% | 91.2% | [82.1%, 95.9%] | 6 | 3.0 |
| agree AND conf >= 0.90 | 68 | 34.0% | 66.0% | 91.2% | [82.1%, 95.9%] | 6 | 3.0 |
| agree AND conf >= 1.00 | 49 | 24.5% | 75.5% | 95.9% | [86.3%, 98.9%] | 2 | 1.0 |

> **Operating point available today:** require floor agreement and confidence >= 1.00. Automates 24% of volume at 95.9% precision, with 2 errors escaping to customers across the split. Derived by sweep on dev; the test split remains untouched.

### D. Per-class confidence thresholds

One global cut point forces the same operating point onto classes with very different confusability. Lowest threshold reaching target, per predicted class:

| predicted class | threshold | auto n | auto precision |
|---|---|---|---|
| bill | none reaches target | 0 | - |
| hard | none reaches target | 0 | - |
| enq | none reaches target | 0 | - |
| svc | none reaches target | 0 | - |
| other | 1.00 | 24 | 100.0% |

| gate | auto n | automation | review rate | auto precision | 95% CI | errors escaped | per 100 |
|---|---|---|---|---|---|---|---|
| per-class thresholds | 24 | 12.0% | 88.0% | 100.0% | [86.2%, 100.0%] | 0 | 0.0 |

## Reliability and edge cases

- branch completion: **200/200 (100.0%)**  [98.1%, 100.0%]
- actions per case: min 2, mean 4.2, max 6
- latency ms: p50 445, p95 1048, max 7128
- guardrail firings: 5 across 1 rules
  - hardship_disclosure: 5
- status distribution: {'awaiting_human': 129, 'escalated': 37, 'auto_resolved': 34}
