# Handoff — incoming request processing for a UK lending operations desk

**The model decides. The state machine executes.**

A triage system for a consumer lending / mortgage servicing desk. It reads an
incoming request from a web form, a batch upload or a shared inbox, classifies
it by **type** and **urgency** as independent axes, runs a deterministic branch
of remediation steps, and hands anything it cannot safely finish to a person.

The brief's pain words are the design targets: request handling that is *slow*,
*inconsistent* and *dependent on individual judgment*. Every claim below is
measured on a held-out split, not asserted.

**Live demo:** https://handoff-triage.vercel.app · **Repo:** https://github.com/ayushgupta07xx/Request-Triage · **Deck:** [five slides](docs/Ayush_Gupta_Incoming_Request_Processing_Workflow.pdf)

---

## Quickstart

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # add GROQ_API_KEY (and GEMINI_API_KEY for holdout)

# batch a corpus split through the full pipeline
python3 scripts/run_batch.py --split dev --tier bulk

# recompute every metric offline from the cached run — no API calls
python3 scripts/run_eval.py --run data/runs/corpus_dev_bulk.jsonl

# bake a run into the console's data and start the UI
python3 scripts/export_demo.py --db data/runs/corpus_dev_bulk_kb.db \
    --out web/public/demo-dev200.json
cd web && npm install && npm run dev
```

The console opens in **demo mode** against committed batch data — no keys, no
network. Sample inputs per branch are in `data/corpus/`.

---

## How a request is processed

```
intake → duplicate check → classify (LLM) → guardrails → gates → branch → audit
         (pre-model)       type + urgency   escalate-only  4 gates  steps    store
```

**Classification** is the only place the model acts. It proposes a type
(`billing_dispute`, `general_enquiry`, `service_request`, `financial_hardship`,
`other`), an urgency (`low`/`medium`/`high`/`critical`), extracted entities and
a rationale. That proposal is stored separately from the final decision, so the
audit trail always answers *what did the model say* versus *what did the system
decide*.

**Everything after classification is deterministic.** Control flow, side effects
and drafts are code and config, never model output. Four independent gates can
demote a case toward a human, and none can promote one:

| Gate | Effect |
|---|---|
| Guardrails | Hardship / vulnerability / regulatory phrases override the model — escalate only, never de-escalate |
| Confidence | Per-class thresholds on the quality tier; LLM-and-floor agreement on the bulk tier |
| Grounding | A branch declaring `grounded: true` that produced no sourced answer is demoted |
| Provider floor | Keyword-decided rows are capped at 0.60 confidence and never auto-resolve |

**Degradation** is a three-tier waterfall: Groq 70B → Groq 8B → deterministic
keyword floor. Production degrades to stay fast; measurement runs pin to a
single tier (`--pin`) because a silent same-family swap contaminates
provenance. Every case records which tier decided it.

**Branches are data.** `triage/workflows.yaml` holds the steps, routing, SLAs
and guardrails, validated against schema enums at load. An operations manager
adds a request type by editing config — no developer, no deploy.

---

## Branches and action coverage

The brief's four named actions across all five branches:

| Branch | generate_response | route_to_team | set_follow_up | log_outcome | branch-specific |
|---|---|---|---|---|---|
| `billing_dispute` | ✓ | ✓ Disputes Team | ✓ | → `awaiting_human` | `suppress_collections` |
| `general_enquiry` | ✓ grounded | — self-serve | ✓ if high/critical | → `auto_resolved` | — |
| `service_request` | ✓ | ✓ Servicing Ops | ✓ | → `awaiting_human` | `start_sla_timer` |
| `financial_hardship` | ✓ | — escalation path | ✓ | → `escalated` | `pause_automation`, `escalate`, `notify_supervisor` |
| `other` | — | ✓ Triage Queue | — | → `awaiting_human` | — |

Every named action is exercised by at least two branches; every branch runs
2–6 steps. Urgency modulates *within* a branch: it sets the SLA clock, adds
conditional steps, and routes to a senior handler above a per-branch threshold.

**The hardship branch pauses automation as its first step and never
auto-resolves.** The asymmetry is argued from cost: a false escalation wastes
minutes of an associate's time; a missed hardship disclosure is a regulatory
and human failure.

## One end-to-end example per branch

| Input | Decision | What ran | Outcome |
|---|---|---|---|
| *"concern with mortgage arrears… please provide a breakdown of charges"* | `billing_dispute` / medium · 0.90 | draft acknowledgement → collections hold → Disputes Team → SLA follow-up → log | `awaiting_human` |
| *"my fixed rate deal is ending in September"* | `general_enquiry` / low · 1.00 | KB match `fixed_rate_expiry` → sourced draft → log | `auto_resolved` |
| *"third call about my secured homeowner loan, ref HS567, need a payoff quote"* | `service_request` / high · floor 0.40 | draft → Servicing Ops → SLA timer → follow-up → log | `awaiting_human` |
| *"struggling to pay my mortgage this month… I don't know how I'll cope"* | `financial_hardship` / critical · **guardrail override** | pause automation → escalate → notify supervisor → supportive draft → follow-up → log | `escalated` |
| *"sort out my O2 upgrade, they're giving customers free 5G"* | `other` / low · 1.00 | Triage Queue → log | `awaiting_human` |

Row 4 is the system's point: the model proposed a lesser type, the
`hardship_disclosure` guardrail overrode it, and no automation ran at all.

---

## Results

Measured on a **100-example held-out split, executed once and scored once**, on
`llama-3.3-70b-versatile` with single-tier provenance verified.

| | |
|---|---|
| **Type accuracy** | **88.0%** (95% CI 80.2–93.0) |
| Keyword-floor baseline, same split | 47.0% → **+41 points** |
| Cross-family holdout (40, Gemini-generated) | **92.5%** (80.1–97.4) |
| Branch completion | **100%** (100/100 test, 40/40 holdout) |
| Urgency | 52% exact · **91% within one level** |
| Calibration error (ECE) | 0.027, on a coarse signal — only three distinct confidence values |

Full confusion matrices, per-class precision/recall with Wilson intervals, the
threshold sweep and calibration buckets are in `docs/eval/`.

**Automation:** 8.5% on the 200-case development batch; **0% on the held-out
batch.** Both are the derived policy behaving correctly, not a shortfall — see
below.

## Why the gates are set where they are

Thresholds were **derived by sweep** over cached development runs, at an
operating point of ≥95% precision on anything auto-handled, with a minimum
sample bar of n≥15 per class.

On the quality tier only `billing_dispute` cleared it, at 0.90.
`general_enquiry` (88%) and `service_request` (56%) failed on merit; `other`
scored 11/11 but failed the sample bar — the bar exists precisely to resist
small-sample perfection. And the billing-dispute branch ends in
`awaiting_human` by design, because a disputed charge should not be closed by a
machine. **The held-out batch therefore automates nothing, and that is the
honest reading of a conservative policy** — not a broken pipeline.

On the bulk tier the gate is an ensemble: the model and the deterministic floor
must agree *and* confidence must be 1.00.

Automation is bounded by **knowledge-base coverage, not model quality**. Eleven
entries buy 8.5%. Entry twelve is a config edit.

---

## Limitations

- **The corpus is LLM-generated.** Labels are therefore an upper bound on real
  performance. Mitigated, not eliminated, by a cross-family holdout generated
  by a different model family, which converges at 92.5%.
- **Confidence is coarse.** The model emits three distinct values; ECE of 0.027
  is real but measured over a weak signal. Finer confidence needs either
  logprobs or a calibration head.
- **Urgency is subjective.** 52% exact looks low; 91% within-one is the number
  that matters, because adjacent errors only shift queue position and the
  branch design absorbs them.
- **Critical recall is 0/11 on the held-out split.** Audited row by row: most
  are synthetic label artefacts where the generator marked routine text
  critical. The one genuine distress case was caught by the hardship guardrail,
  not by urgency. Reported as measured rather than relabelled.
- **`service_request` is a sink class** at 71% precision — it absorbs
  misclassifications from three other types.
- **Retrieval is keyword-matched, not embedded.** Eleven entries, no vector
  store. Honest scope for a three-day build; the interface for swapping in
  embeddings is `triage/kb.lookup`.
- **SQLite and in-process execution.** At ~10k requests/day this needs
  Postgres, queue workers and per-class model routing.
- **No fine-tuning.** There is no labelled real data. The review queue captures
  every human override as training signal, which is what a next version would
  learn from.

---

## Stack

Python 3.11 · pydantic · PyYAML · httpx · Groq (`llama-3.3-70b-versatile`
quality, `llama-3.1-8b-instant` bulk) · Gemini for the cross-family holdout ·
SQLite locally, libSQL/Turso on the hosted deploy · Next.js 14 + Tailwind · FastAPI on Vercel serverless functions.

`docs/` carries the decision log, evaluation reports and diagnostics.
