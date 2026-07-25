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
import CaseDetail from "./case-detail";
import InfoHint from "./info-hint";

type LiveCase = Case & {
  _live?: boolean;
  _skipped_tiers?: number;
  _waterfall?: string;
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
    <div className="flex items-center gap-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        {children}
      </span>
      {hint ? <InfoHint placement="bottom">{hint}</InfoHint> : null}
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
  const [toast, setToast] = useState<{
    title: string;
    body: string;
    drift: boolean;
  } | null>(null);
  const [toastIn, setToastIn] = useState(false);
  const toastTimers = useRef<number[]>([]);
  const outages = outageOptions(ready?.tiers ?? []);
  const tierNames = (ready?.tiers ?? []).map((t) => t.split(":").pop() ?? t);
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

  const clearToast = useCallback(() => {
    toastTimers.current.forEach(window.clearTimeout);
    toastTimers.current = [];
    setToastIn(false);
    setToast(null);
  }, []);

  useEffect(() => () => toastTimers.current.forEach(window.clearTimeout), []);

  // Which model actually answered, versus the one the selected tier implies.
  // A silent fallthrough (daily quota spent on the primary, say) is correct
  // behaviour but invisible unless you read the chip, so announce it.
  const announce = useCallback(
    (card: LiveCase, requestedSkip: number, chain: string[]) => {
      const short = chain.map((t) => t.split(":").pop() ?? t);
      const expected =
        requestedSkip >= short.length ? "keyword-floor" : short[requestedSkip];
      const actual = card.model_name ?? "unknown";
      const drift = Boolean(expected) && actual !== expected;
      setToast({
        title: drift ? "Degraded automatically" : "Answered by",
        body: drift
          ? `${expected} was unavailable, so ${actual} answered · ${card.decision_source}`
          : `${actual} · ${card.decision_source}${card.latency_ms ? ` · ${card.latency_ms}ms` : ""}`,
        drift,
      });
      window.requestAnimationFrame(() => setToastIn(true));
      toastTimers.current.push(
        window.setTimeout(() => setToastIn(false), 4600),
        window.setTimeout(() => setToast(null), 5000),
      );
    },
    [],
  );

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
    clearToast();
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
      announce(card, skip, ready?.tiers ?? []);
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
  }, [body, subject, channel, skip, busy, ready, announce, clearToast]);

  const disabled = busy || !body.trim() || ready?.live_mode === false;

  return (
    <div className="grid h-[calc(100dvh-64px)] grid-cols-1 lg:grid-cols-[minmax(0,27rem)_minmax(0,1fr)]">
      {/* ---------------------------------------------------- compose pane */}
      <section className="no-bar overflow-y-auto border-b px-6 py-6 lg:border-b-0 lg:border-r">
        <Eyebrow
          hint={
            <>
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
            </>
          }
        >
          Live mode
        </Eyebrow>
        <h1 className="mt-1.5 text-[20px] font-bold tracking-tight">
          Run a real request
        </h1>
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
          {ready === null
            ? "checking…"
            : ready.live_mode
              ? `${ready.tier} tier · ${ready.tiers.length} providers${
                  ready.storage === "turso" ? " · persisted" : ""
                }`
              : "live mode not configured"}
        </p>
        {ready && !ready.live_mode ? (
          <p className="mt-2 text-[12px] leading-relaxed" style={{ color: "var(--primary)" }}>
            {ready.detail}
          </p>
        ) : null}

        <div className="mt-5">
          <Eyebrow
            hint={
              <>
                Four messages, four branches. Each sets its own channel.
                <Defs
                  rows={[
                    ["Hardship", "Looks like a service request; hides “cannot afford” in sentence four."],
                    ["Enquiry", "Matches a knowledge-base entry, so the draft cites its source."],
                    ["Billing", "Suppresses collections before anything else runs."],
                    ["Out of scope", "An honest branch, not a failure. Routed and logged."],
                  ]}
                />
              </>
            }
          >
            Examples
          </Eyebrow>
          <div className="mt-2 flex flex-wrap gap-1.5">
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
          </div>
        </div>

        <div className="mt-5">
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
          <div className="mt-2 flex flex-wrap gap-1.5">
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
        </div>

        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject (optional)"
          className="mt-5 w-full rounded-lg bg-transparent px-3 py-2 text-[13px] ring-1 ring-border placeholder:text-muted-foreground focus:outline-none focus:ring-2"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={7}
          placeholder="Paste a customer request…"
          className="no-bar mt-2 w-full resize-y rounded-lg bg-transparent px-3 py-2 text-[13px] leading-relaxed ring-1 ring-border placeholder:text-muted-foreground focus:outline-none focus:ring-2"
        />
        <div className="mt-1 text-right font-mono text-[10px] text-muted-foreground">
          {body.length} / 8000
        </div>

        <div className="mt-4">
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
          <div className="mt-2 flex gap-1.5">
            {outages.map((o) => (
              <button
                key={o.n}
                onClick={() => setSkip(o.n)}
                className={`lift min-w-[3.2rem] rounded-lg px-3 py-1.5 text-[12px] font-medium ${
                  skip === o.n
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground ring-1 ring-border hover:text-foreground"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 font-mono text-[10.5px] leading-relaxed text-muted-foreground">
            {outages.find((o) => o.n === skip)?.detail ?? ""}
          </p>
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
        {result && result._skipped_tiers ? (
          <div
            className="shrink-0 px-6 pb-1 pt-4 font-mono text-[10px] uppercase tracking-[0.14em]"
            style={{ color: "var(--primary)" }}
          >
            simulated · {result._skipped_tiers} provider
            {result._skipped_tiers > 1 ? "s" : ""} offline
          </div>
        ) : null}
        <div className="min-h-0 flex-1">
          {result ? (
            <CaseDetail key={result.case_id} c={result} />
          ) : (
            <div className="grid h-full place-items-center px-8">
              <p className="max-w-xs text-center text-[13px] leading-relaxed text-muted-foreground">
                {busy
                  ? "Classifying, gating, executing the branch."
                  : "Pick an example, then process it."}
              </p>
            </div>
          )}
        </div>

        {toast ? (
          <div
            className={`pointer-events-none absolute bottom-5 right-12 z-20 max-w-[20rem] rounded-xl px-4 py-3 transition-opacity duration-300 ${
              toastIn ? "opacity-100" : "opacity-0"
            }`}
            style={{
              background: "var(--card)",
              border: `1px solid ${toast.drift ? "var(--primary)" : "var(--border-accent)"}`,
              boxShadow: "var(--shadow-accent)",
            }}
          >
            <p
              className="font-mono text-[10px] uppercase tracking-[0.16em]"
              style={{ color: toast.drift ? "var(--primary)" : "var(--ok)" }}
            >
              {toast.title}
            </p>
            <p className="mt-1 font-mono text-[11.5px] leading-snug">{toast.body}</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
