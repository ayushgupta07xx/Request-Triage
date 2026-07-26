"use client";

// Live mode. The reviewer's own message goes through the SAME process_request
// the batch used, so nothing here is a second implementation of the pipeline:
// the response is the same flat card scripts/export_demo.py bakes, and it is
// rendered by the same CaseDetail chapters the desk uses.
//
// The outage control is the reliability evidence, made self-serve. It does not
// animate a failure: it forces the first N provider tiers to fail for real, so
// the waterfall falls through and the card reports what actually decided the
// case (llm_primary -> llm_secondary -> keyword_fallback).

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { Case } from "@/lib/types";
import { invalidateLiveDataset } from "@/lib/data";
import CaseDetail from "./case-detail";
import InfoHint from "./info-hint";

type LiveCase = Case & {
  _live?: boolean;
  _skipped_tiers?: number;
  _waterfall?: string;
};

type RunMeta = {
  duplicate: boolean;
  dupOf: string | null;
  expected: string | null;
  actual: string | null;
  drift: boolean;
  source: string;
  latency: number | null;
  skipped: number;
};

type Ready = {
  ok: boolean;
  live_mode: boolean;
  tier: string;
  providers: string | null;
  tiers: string[];
  storage?: "turso" | "ephemeral" | "none";
  detail: string | null;
};

const CHANNELS = [
  { value: "shared_inbox", label: "Shared inbox" },
  { value: "web_form", label: "Web form" },
  { value: "email_batch", label: "Batch upload" },
] as const;

// The pipeline, as the system actually runs it. Exactly one stage is a model,
// and it is the only one wearing the accent: the diagram has to carry the
// claim on slide two, or it is decoration. Guardrails take the guard colour
// because that is what they are everywhere else in the product.
const PIPELINE = [
  { key: "intake", label: "Intake", sub: "3 channels", tone: null },
  { key: "dedupe", label: "Dedupe", sub: "pre-model", tone: null },
  {
    key: "classify",
    label: "Classify",
    sub: "type · urgency",
    tone: "var(--ok)",
    tint: "var(--accent)",
  },
  {
    key: "guardrails",
    label: "Guardrails",
    sub: "escalate only",
    tone: "var(--guard)",
    tint: "var(--guard-soft)",
  },
  { key: "execute", label: "Execute", sub: "from config", tone: null },
] as const;

// What EXECUTE fans out into. Descriptions are the branch's defining
// behaviour, not its step count -- the counts live in workflows.yaml and are
// not worth asserting from memory here.
const BRANCHES = [
  { key: "billing", label: "Billing dispute", note: "collections suppressed first" },
  { key: "enquiry", label: "General enquiry", note: "grounded draft, or none" },
  { key: "service", label: "Service request", note: "routed, SLA started" },
  {
    key: "hardship",
    label: "Financial hardship",
    note: "never auto-resolves",
    tone: "var(--guard)",
  },
  { key: "other", label: "Out of scope", note: "logged, not failed" },
] as const;

// Connectors read against both backgrounds; --border alone disappears in dark.
const RAIL = "var(--muted-foreground)";

// How deep the waterfall runs is a property of the deployment, not a constant:
// with a Gemini model configured the chain is three providers, so "all tiers
// down" is skip=3, not skip=2. Options come from the readiness response.
function outageOptions(tiers: string[]) {
  const n = tiers.length;
  if (!n) return [{ n: 0, label: "None", detail: "The quality tier answers." }];
  const short = (t: string) => t.split(":").pop() ?? t;
  const opts = [
    { n: 0, label: "None", detail: `${short(tiers[0])} answers · llm_primary` },
  ];
  for (let k = 1; k < n; k += 1) {
    opts.push({
      n: k,
      label: String(k),
      detail: `${short(tiers[k])} answers · llm_secondary, degraded`,
    });
  }
  opts.push({
    n,
    label: "All",
    detail: "keyword floor answers · capped 0.60 · never auto-resolves",
  });
  return opts;
}

const PRESETS = [
  {
    id: "hardship",
    label: "Buried hardship",
    note: "Reads as a service request. Discloses hardship in the fourth sentence.",
    channel: "shared_inbox",
    subject: "VERY URGENT fix rate finish / need redemption statement MOR-994821",
    body:
      "Hello. My fixed rate deal is finish on 30 November. I need you to send me payoff quote redemption paper urgently for my new lender. I ask for this last week on phone but nothing come. My new bank say if I do not give paper by tomorrow they cancel my new deal. If I go to your standard variable rate I cannot pay. I am disabled and live on small benefit, I cannot afford big jump in payment, my family will have no money for food and heat. Please send payoff quote to my email today or I must report to financial ombudsman because this is making me very sick with stress. Account number MOR-994821.",
  },
  {
    id: "enquiry",
    label: "Answerable enquiry",
    note: "Matches a knowledge-base entry, so the draft is composed from it and cites the source.",
    channel: "web_form",
    subject: "Fixed rate ending in September",
    body:
      "Hello, my fixed rate deal comes to an end in September and I am not sure what happens next. Can you tell me when I am able to switch to a new product, and whether there is any arrangement fee or valuation to pay if I stay with you? Thanks, Rachel.",
  },
  {
    id: "billing",
    label: "Billing dispute",
    note: "Suppresses collections activity before anything else runs.",
    channel: "shared_inbox",
    subject: "Incorrect £150 late payment fee — account 40029188",
    body:
      "I am writing again about the £150 late payment fee applied to my buy-to-let account (mortgage ref 40029188) on 2nd December. My payment was made on time via Faster Payments and you have already acknowledged an internal system delay on your end. Please remove this charge and confirm in writing that my next direct debit will be the agreed amount only.",
  },
  {
    id: "other",
    label: "Out of scope",
    note: "An honest branch, not a failure. Routed to the triage queue and logged.",
    channel: "shared_inbox",
    subject: "Auto Reply: Out of Office Notification",
    body:
      "Thank you for your message. I am currently out of the office until Monday 8th with limited access to email. For urgent matters please contact the main switchboard. This is an automated response.",
  },
] as const;

function Defs({ rows }: { rows: [string, string][] }) {
  // grid, not flex: one shared key column means every value starts at the same
  // x. With flex each row sized independently and the values stepped raggedly.
  return (
    <div className="mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1.5">
      {rows.map(([k, v]) => (
        <Fragment key={k}>
          <span className="font-mono text-[11px] font-bold leading-snug">{k}</span>
          <span className="text-[12px] leading-snug">{v}</span>
        </Fragment>
      ))}
    </div>
  );
}

function Eyebrow({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {children}
      </span>
      {hint ? <InfoHint placement="bottom">{hint}</InfoHint> : null}
    </span>
  );
}

// The pipeline, drawn. Nodes settle left to right and each connector draws out
// of the node it leaves, so the sequence reads as flow rather than as five
// boxes appearing at once.
function Pipeline() {
  return (
    <div>
      <div className="flex items-stretch">
        {PIPELINE.map((s, n) => {
          const tone = s.tone ?? "var(--muted-foreground)";
          const tint = "tint" in s ? s.tint : "var(--secondary)";
          return (
            <Fragment key={s.key}>
              {n > 0 ? (
                <div
                  className="pipe-line flex min-w-[16px] flex-1 items-center self-start"
                  style={{ marginTop: 17, animationDelay: `${n * 160 - 70}ms` }}
                >
                  <span
                    className="h-px flex-1"
                    style={{ background: RAIL, opacity: 0.5 }}
                  />
                  <span
                    className="h-0 w-0"
                    style={{
                      borderTop: "4px solid transparent",
                      borderBottom: "4px solid transparent",
                      borderLeft: `5px solid ${RAIL}`,
                      opacity: 0.5,
                    }}
                  />
                </div>
              ) : null}
              <div
                className="pipe-node w-[7.6rem] shrink-0 overflow-hidden rounded-lg"
                style={{
                  border: `1px solid ${s.tone ?? "var(--border)"}`,
                  background: "var(--card)",
                  animationDelay: `${n * 160}ms`,
                }}
              >
                <div className="px-2.5 py-1.5" style={{ background: tint }}>
                  <span
                    className="font-mono text-[10px] uppercase tracking-[0.12em]"
                    style={{ color: tone }}
                  >
                    {s.label}
                  </span>
                </div>
                <div className="px-2.5 py-1.5">
                  <span className="font-mono text-[9.5px] leading-tight text-muted-foreground">
                    {s.sub}
                  </span>
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>

      <p
        className="pipe-node mx-auto mt-8 max-w-[52ch] text-center text-[12.5px] leading-relaxed text-muted-foreground"
        style={{ animationDelay: "980ms" }}
      >
        Exactly one stage is a model — it proposes a type, an urgency and the
        entities. Everything downstream of it is deterministic, replayable and
        written to the audit trail.
      </p>

      {/* EXECUTE fans out: one branch per request type, steps declared in
          config rather than in code. Centre drop, then a rail with a stub per
          branch — the same connector vocabulary as the case timeline. */}
      <div className="mt-8">
        <div
          className="pipe-line-v mx-auto w-px"
          style={{
            height: 22,
            background: RAIL,
            opacity: 0.5,
            animationDelay: "1240ms",
          }}
        />
        <div className="relative">
          <div
            className="pipe-line absolute left-[10%] right-[10%] top-0 h-px"
            style={{
              background: RAIL,
              opacity: 0.5,
              animationDelay: "1380ms",
            }}
          />
          <div className="flex items-start">
            {BRANCHES.map((b, n) => (
              <div
                key={b.key}
                className="pipe-node flex flex-1 flex-col items-center px-1"
                style={{ animationDelay: `${1470 + n * 90}ms` }}
              >
                <span
                  className="w-px"
                  style={{ height: 16, background: RAIL, opacity: 0.5 }}
                />
                <span
                  className="mt-2 rounded-full px-2.5 py-1 text-center text-[10.5px] leading-tight"
                  style={{
                    background: "var(--secondary)",
                    color:
                      "tone" in b ? (b.tone as string) : "var(--foreground)",
                  }}
                >
                  {b.label}
                </span>
                <span className="mt-1.5 text-center font-mono text-[9px] leading-tight text-muted-foreground">
                  {b.note}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// The waterfall as a stage rather than a list: only what has actually
// happened is on it. The tier that answers stands alone in the middle, and
// every tier it fell through is introduced along the top and then cut. The
// type shrinks with each step down the chain, so the box reads as weakening
// without a sentence saying so.
//
// The floor is deliberately NOT accent-coloured. chips.tsx already classes
// keyword_fallback as neutral -- "not the model's judgement" -- and the floor
// is capped at 0.60 and never auto-resolves, so accenting it here would
// contradict a decision the product has already made.
const ACTIVE_SIZE = [18, 15.5, 13.5, 11.5];

function Waterfall({ chain, skip }: { chain: string[]; skip: number }) {
  if (!chain.length) return null;
  const active = Math.min(skip, chain.length - 1);
  const dead = chain.slice(0, active);
  const answering = chain[active];
  const isFloor = active >= chain.length - 1;
  const source = isFloor
    ? "keyword_fallback"
    : active === 0
      ? "llm_primary"
      : "llm_secondary";

  return (
    <div className="relative mt-2.5 h-[84px] overflow-hidden rounded-lg px-3 py-2 ring-1 ring-border">
      {/* what has already failed, side by side, each cut as it arrives */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
        {dead.map((d) => (
          <span
            key={d}
            className="wf-in relative inline-block font-mono text-[9px] leading-tight text-muted-foreground"
            style={{ opacity: 0.55 }}
          >
            {d}
            <span
              aria-hidden
              className="wf-strike absolute left-0 top-1/2 h-px w-full"
              style={{ background: "currentColor", animationDelay: "130ms" }}
            />
          </span>
        ))}
      </div>

      {/* whatever is answering, alone in the middle */}
      <div className="pointer-events-none absolute inset-x-3 top-1/2 -translate-y-1/2 text-center">
        <span
          key={answering}
          className="wf-in inline-block font-mono leading-none"
          style={{
            fontSize: ACTIVE_SIZE[Math.min(active, ACTIVE_SIZE.length - 1)],
            color: isFloor ? "var(--muted-foreground)" : "var(--ok)",
          }}
        >
          {answering}
        </span>
      </div>

      <span
        key={source}
        className="wf-in absolute bottom-2 right-3 rounded-full bg-secondary px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
        title="Recorded on the case as its decision source"
      >
        {source}
      </span>
    </div>
  );
}

export default function LiveConsole() {
  const [ready, setReady] = useState<Ready | null>(null);
  const [channel, setChannel] = useState<string>("shared_inbox");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [skip, setSkip] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LiveCase | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const abort = useRef<AbortController | null>(null);
  // What actually happened on the last run. It is rendered as a bar above the
  // case and it stays there: a reviewer reading a degraded result should not
  // have to have been looking at the moment it arrived.
  const [meta, setMeta] = useState<RunMeta | null>(null);
  const outages = outageOptions(ready?.tiers ?? []);
  const tierNames = (ready?.tiers ?? []).map((t) => t.split(":").pop() ?? t);
  // The chain the request will actually walk, floor included. Rendering it
  // beats describing it: selecting an outage strikes the tiers it takes down
  // and lights the one that answers.
  const chain = [...tierNames, "keyword floor"];
  const outageDefs: [string, string][] = tierNames.length
    ? [
        ...tierNames.map(
          (name, i) =>
            [
              i === 0 ? "None" : String(i),
              i === 0
                ? `${name} answers`
                : `${tierNames.slice(0, i).join(" + ")} unavailable → ${name} answers`,
            ] as [string, string],
        ),
        [
          "All",
          "all providers unavailable → the keyword floor answers, capped at 0.60 and never auto-resolving",
        ],
      ]
    : [["None", "the quality tier answers"]];

  useEffect(() => {
    let alive = true;
    fetch("/api/classify", { method: "GET" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: Ready) => alive && setReady(d))
      .catch(() =>
        alive &&
        setReady({
          ok: false,
          live_mode: false,
          tier: "quality",
          providers: null,
          tiers: [],
          storage: "none",
          detail:
            "The live endpoint did not respond. Demo mode still shows the whole system offline.",
        }),
      );
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!busy) return;
    const t0 = Date.now();
    const id = window.setInterval(() => setElapsed(Date.now() - t0), 100);
    return () => window.clearInterval(id);
  }, [busy]);

  const applyPreset = useCallback((p: (typeof PRESETS)[number]) => {
    setChannel(p.channel);
    setSubject(p.subject);
    setBody(p.body);
    setError(null);
  }, []);

  const run = useCallback(async () => {
    if (!body.trim() || busy) return;
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    const timeout = window.setTimeout(() => ctrl.abort(), 75_000);

    setBusy(true);
    setError(null);
    setResult(null);
    setMeta(null);
    setElapsed(0);
    try {
      const res = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body,
          subject,
          channel,
          sender: "reviewer@demo",
          simulate_outage: skip,
        }),
        signal: ctrl.signal,
      });
      const text = await res.text();
      if (!res.ok) {
        let detail = text;
        try {
          detail = JSON.parse(text).detail ?? text;
        } catch {
          /* plain-text body */
        }
        throw new Error(detail || `HTTP ${res.status}`);
      }
      const card = JSON.parse(text) as LiveCase;
      setResult(card);
      // A duplicate never reaches a model: the fingerprint check runs before
      // classification, so an absent model_name is correct here rather than a
      // provider failure. Reading it as one would report an outage that never
      // happened.
      const short = (ready?.tiers ?? []).map((t) => t.split(":").pop() ?? t);
      const expected = skip >= short.length ? "keyword floor" : short[skip];
      const actual = card.model_name;
      setMeta({
        duplicate: card.status === "duplicate",
        dupOf: card.duplicate_of,
        expected,
        actual,
        // No model name and no expectation to compare against means we know
        // nothing, not that something failed.
        drift: Boolean(actual) && Boolean(expected) && actual !== expected,
        source: card.decision_source,
        latency: card.latency_ms,
        skipped: card._skipped_tiers ?? 0,
      });
      // The desk's Live tab must show this case the moment the reviewer walks
      // over to it, so drop the cached queue rather than let a TTL decide.
      invalidateLiveDataset();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        msg.includes("abort")
          ? "The request took longer than 75 seconds and was cancelled. The quality tier waits out per-minute rate limits, so this usually means the daily quota is spent."
          : msg,
      );
    } finally {
      window.clearTimeout(timeout);
      setBusy(false);
    }
  }, [body, subject, channel, skip, busy, ready]);

  const disabled = busy || !body.trim() || ready?.live_mode === false;
  const live = ready?.live_mode === true;

  return (
    <div className="grid h-[calc(100dvh-64px)] grid-cols-1 lg:grid-cols-[minmax(0,27rem)_minmax(0,1fr)]">
      {/* ---------------------------------------------------- compose pane */}
      <section className="no-bar overflow-y-auto border-b px-6 py-4 lg:border-b-0 lg:border-r">
        {/* No page name: the nav already says Live, and the desk and
            performance pages do not repeat their own names either. The hint
            the eyebrow carried rides the heading instead. */}
        <div className="flex items-center gap-2">
          <h1 className="text-[21px] font-bold tracking-tight">
            Run a real request
          </h1>
          <InfoHint placement="bottom" label="What live mode does">
            Runs the real pipeline on your message — same code as the committed
            batches.
            <Defs
              rows={[
                [
                  "Stored?",
                  "Yes, in a libSQL database — so repeat sends are caught as duplicates before any model call.",
                ],
                ["Auto-resolve?", "Rare here by design — enquiries have no auto-gate on this tier."],
              ]}
            />
          </InfoHint>
        </div>
        {/* status, not prose: the dot answers "is it up" before a word is read */}
        <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1">
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{
              background:
                ready === null
                  ? "var(--muted-foreground)"
                  : live
                    ? "var(--ok)"
                    : "var(--guard)",
            }}
          />
          <span className="font-mono text-[11px] text-muted-foreground">
            {ready === null ? (
              "checking…"
            ) : live ? (
              <>
                <span className="text-foreground">{ready.tier}</span> tier
                <span className="opacity-40"> · </span>
                <span className="text-foreground">{ready.tiers.length}</span>{" "}
                providers
                {ready.storage === "turso" ? (
                  <>
                    <span className="opacity-40"> · </span>persisted
                  </>
                ) : null}
              </>
            ) : (
              "live mode not configured"
            )}
          </span>
        </div>
        {ready && !live ? (
          <p className="mt-2 text-[12px] leading-relaxed" style={{ color: "var(--primary)" }}>
            {ready.detail}
          </p>
        ) : null}

        {/* Each control group leads with its own label on the same row, so a
            group costs one line of height instead of two. */}
        <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Eyebrow>Examples</Eyebrow>
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => applyPreset(p)}
              title={p.note}
              className="lift rounded-full px-3 py-1.5 text-[12px] text-muted-foreground ring-1 ring-border hover:text-foreground"
            >
              {p.label}
            </button>
          ))}
          {/* Wipe the form in one action. A reviewer who wants to type their
              own message should not have to select an example out by hand. */}
          <button
            type="button"
            onClick={() => {
              setSubject("");
              setBody("");
              setError(null);
            }}
            disabled={!subject && !body}
            title="Clear the subject and message"
            aria-label="Clear the subject and message"
            style={{ color: "var(--primary)" }}
            className="lift flex h-7 w-7 items-center justify-center rounded-full ring-1 ring-border transition-opacity hover:opacity-75 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5" />
            </svg>
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Eyebrow
            hint={
              <>
                Where the request arrived from. Recorded on the case and shown in
                its Received panel. It does not pick the branch — type does.
              </>
            }
          >
            Channel
          </Eyebrow>
          {CHANNELS.map((c) => (
            <button
              key={c.value}
              onClick={() => setChannel(c.value)}
              className={`lift rounded-full px-3 py-1.5 text-[12px] ${
                channel === c.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground ring-1 ring-border hover:text-foreground"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject (optional)"
          className="mt-4 w-full rounded-lg bg-transparent px-3 py-2 text-[13px] ring-1 ring-border placeholder:text-muted-foreground focus:outline-none focus:ring-2"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          placeholder="Paste a customer request…"
          className="no-bar mt-2 w-full resize-y rounded-lg bg-transparent px-3 py-2 text-[13px] leading-relaxed ring-1 ring-border placeholder:text-muted-foreground focus:outline-none focus:ring-2"
        />
        {/* only worth the line once there is something to count */}
        {body.length > 0 ? (
          <div className="mt-1 text-right font-mono text-[10px] text-muted-foreground">
            {body.length} / 8000
          </div>
        ) : null}

        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <Eyebrow
              hint={
                <>
                  Takes the first N providers offline inside the real waterfall,
                  so the fallthrough is genuine rather than animated.
                  <Defs rows={outageDefs} />
                  Guardrails stay active at every level, including the floor.
                </>
              }
            >
              Providers offline
            </Eyebrow>
            {outages.map((o) => (
              <button
                key={o.n}
                onClick={() => setSkip(o.n)}
                className={`lift min-w-[2.8rem] rounded-lg px-2.5 py-1 text-[12px] font-medium ${
                  skip === o.n
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground ring-1 ring-border hover:text-foreground"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <Waterfall chain={chain} skip={skip} />
        </div>

        <button
          onClick={run}
          disabled={disabled}
          className={`lift mt-5 w-full rounded-full px-4 py-2.5 text-[14px] font-semibold ${
            disabled
              ? "cursor-not-allowed text-muted-foreground ring-1 ring-border"
              : "bg-primary text-primary-foreground"
          }`}
        >
          {busy ? `Running… ${(elapsed / 1000).toFixed(1)}s` : "Process this request"}
        </button>

        {error ? (
          <p
            className="mt-3 rounded-lg px-3 py-2 text-[12px] leading-relaxed ring-1"
            style={{ color: "var(--primary)", borderColor: "var(--primary)" }}
          >
            {error}
          </p>
        ) : null}
      </section>

      {/* ----------------------------------------------------- result pane */}
      <section className="relative flex h-full flex-col overflow-hidden">
        {result && meta ? (
          <div className="shrink-0 border-b px-6 py-2.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span
                className="font-mono text-[10px] uppercase tracking-[0.16em]"
                style={{
                  color: meta.duplicate
                    ? "var(--guard)"
                    : meta.drift
                      ? "var(--primary)"
                      : "var(--ok)",
                }}
              >
                {meta.duplicate
                  ? "Suppressed as duplicate"
                  : meta.drift
                    ? "Degraded automatically"
                    : "Answered by"}
              </span>
              <span className="font-mono text-[11.5px] text-muted-foreground">
                {meta.duplicate ? (
                  <>
                    matched{" "}
                    <span className="text-foreground">
                      {meta.dupOf ?? "an earlier request"}
                    </span>{" "}
                    — no model was called
                  </>
                ) : (
                  <>
                    {meta.drift && meta.expected ? (
                      <>
                        <span className="line-through opacity-60">
                          {meta.expected}
                        </span>
                        {" → "}
                      </>
                    ) : null}
                    <span className="text-foreground">
                      {meta.actual ?? meta.source}
                    </span>
                    <span className="opacity-40"> · </span>
                    {meta.source}
                    {meta.latency ? (
                      <>
                        <span className="opacity-40"> · </span>
                        {meta.latency}ms
                      </>
                    ) : null}
                  </>
                )}
              </span>
              {meta.skipped ? (
                <span
                  className="ml-auto rounded-full bg-secondary px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em]"
                  style={{ color: "var(--primary)" }}
                >
                  simulated · {meta.skipped} offline
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
        <div className="min-h-0 flex-1">
          {result ? (
            <CaseDetail key={result.case_id} c={result} />
          ) : busy ? (
            <div className="grid h-full place-items-center px-8">
              <p className="max-w-xs text-center text-[13px] leading-relaxed text-muted-foreground">
                Classifying, gating, executing the branch.
              </p>
            </div>
          ) : (
            // Before anything has run, this pane explains the machine and then
            // offers the way in: the diagram is what happens to any message,
            // the list is four messages that each take a different branch.
            <div className="no-bar grid h-full place-items-center overflow-y-auto px-10 py-8">
              <div className="w-full max-w-[44rem]">
                <div
                  className="pipe-node font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground"
                  style={{ animationDelay: "0ms" }}
                >
                  How a request is processed
                </div>
                <div className="mt-5">
                  <Pipeline />
                </div>
              </div>
            </div>
          )}
        </div>

      </section>
    </div>
  );
}
