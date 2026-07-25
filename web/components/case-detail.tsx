"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Case, TraceStep } from "@/lib/types";
import { TYPE_LABELS } from "@/lib/types";
import InfoHint from "./info-hint";
import {
  UrgencyChip,
  StatusChip,
  GuardChip,
  SecondaryChip,
  SourceChip,
} from "./chips";

// The record reads as chapters, not as a document: one chapter owns the pane,
// and a scroll gesture REPLACES it with the next. No page scrollbar, no dead
// space between sections. A chapter taller than the pane scrolls internally
// first, and only hands the gesture on once it reaches its own end.

const SWAP_OUT = 240; // fade the outgoing chapter
const SWAP_LOCK = 620; // ignore further gestures until the incoming settles

function Eyebrow({
  children,
  color,
  hint,
}: {
  children: React.ReactNode;
  color?: string;
  hint?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden
        className="h-[9px] w-[9px] rounded-full border-2"
        style={{
          borderColor: color ?? "var(--border-accent-strong)",
          background: "var(--card)",
        }}
      />
      <span
        className="font-mono text-[11px] uppercase tracking-[0.16em]"
        style={{ color: color ?? "var(--muted-foreground)" }}
      >
        {children}
      </span>
      {hint ? <InfoHint placement="side">{hint}</InfoHint> : null}
    </div>
  );
}

// Identifiers stay identifiers - the brief names four of these actions, and a
// reviewer looking for them should find them - but they read as labels rather
// than as raw enum values.
const ACTION_LABELS: Record<string, string> = {
  generate_response: "generate response",
  route_to_team: "route to team",
  set_follow_up: "set follow-up",
  log_outcome: "log outcome",
  escalate: "escalate",
  notify_supervisor: "notify supervisor",
  pause_automation: "pause automation",
  suppress_collections: "suppress collections",
  start_sla_timer: "start SLA timer",
};

// The engine falls back to the action name when a step declares no summary, so
// a trace row would otherwise print its own title twice. Older baked runs still
// carry those rows, which is why this is handled here and not only in config.
function stepSummary(s: TraceStep): string | null {
  const text = (s.summary ?? "").trim();
  if (!text || text === s.action) return null;
  return text;
}

// Mirrors the two constants in triage/engine.py. A human review step is not a
// branch step and should not look like one.
const HUMAN_STEP = "Human review:";

// Mirrors HUMAN_REVIEW_APPROVED in triage/engine.py. Approval is recorded as a
// trace step, so the card reads its own persisted state rather than tracking a
// separate client-side flag that could drift from the store.
const HUMAN_APPROVED_STEP = "Human review: disposition confirmed";

const REVIEW_TYPES = [
  "billing_dispute",
  "general_enquiry",
  "service_request",
  "financial_hardship",
  "other",
] as const;

const REVIEW_URGENCIES = ["low", "medium", "high", "critical"] as const;

// Same shape as the queue's filter chips, so the review picker reads as part
// of the console rather than a form bolted onto it.
const pickChip = (active: boolean) =>
  `rounded-full px-2.5 py-1 text-[11px] transition-colors ${
    active
      ? "bg-primary text-primary-foreground"
      : "bg-secondary text-muted-foreground hover:text-foreground"
  }`;

function ReviewRow({
  c,
  canReview,
  humanDecided,
  onReviewed,
}: {
  c: Case;
  canReview: boolean;
  humanDecided: boolean;
  onReviewed?: (updated: Case) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<null | "approve" | "override">(null);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<string>(c.request_type);
  const [urgency, setUrgency] = useState<string>(c.urgency);
  const approved = c.trace.some((s) => s.summary === HUMAN_APPROVED_STEP);

  // What a person already corrected, shown as layers: what the earlier layer
  // proposed, and what the reviewer settled on. Both halves of the training
  // pair on one line — and it sits ABOVE the controls rather than replacing
  // them, because a correction can itself be corrected.
  const strip = humanDecided ? (
    <div className="mb-6">
      <Eyebrow color="var(--guard)">Human override</Eyebrow>
      <div className="mt-2 pl-4 font-mono text-[11.5px] text-muted-foreground">
        {c.proposal ? (
          <>
            proposed{" "}
            <span className="text-foreground">
              {c.proposal.request_type} / {c.proposal.urgency}
            </span>
            {" · "}
          </>
        ) : null}
        corrected to{" "}
        <span className="text-foreground">
          {c.request_type} / {c.urgency}
        </span>
      </div>
    </div>
  ) : null;

  if (!canReview) {
    return <div className="mt-6">{strip}</div>;
  }

  const send = async (action: "approve" | "override") => {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "approve"
            ? { case_id: c.case_id, action }
            : { case_id: c.case_id, action, request_type: type, urgency }
        ),
      });
      const body = await res.json();
      // FastAPI puts the refusal in `detail`, and the refusals are the
      // interesting part: 409 on a second override, 503 when the store cannot
      // be written. Showing the reason beats a generic failure.
      if (!res.ok) throw new Error(body?.detail ?? `HTTP ${res.status}`);
      setOpen(false);
      onReviewed?.(body as Case);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Review failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-6">
      {strip}
      <Eyebrow hint="In production this sits behind the associate's SSO role; the demo leaves it open so you can exercise the loop. An override re-runs the corrected branch through the real engine and keeps the disagreement as labelled training signal.">
        Review
      </Eyebrow>
      <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-4">
        <button
          type="button"
          disabled={busy !== null || approved}
          onClick={() => send("approve")}
          className={
            approved
              ? `${pickChip(true)} disabled:opacity-100`
              : `${pickChip(false)} disabled:opacity-50`
          }
        >
          {approved
            ? "\u2713 Approved"
            : busy === "approve"
              ? "Confirming…"
              : "Approve"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => setOpen((v) => !v)}
          className={`${pickChip(open)} disabled:opacity-50`}
        >
          Override
        </button>
      </div>

      {open ? (
        <div className="mt-3 space-y-2 pl-4">
          <div className="flex flex-wrap gap-1.5">
            {REVIEW_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={pickChip(type === t)}
              >
                {TYPE_LABELS[t] ?? t}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {REVIEW_URGENCIES.map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUrgency(u)}
                className={pickChip(urgency === u)}
              >
                {u}
              </button>
            ))}
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => send("override")}
              className={`${pickChip(true)} ml-2 disabled:opacity-50`}
            >
              {busy === "override" ? "Re-running…" : "Confirm"}
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="mt-2 pl-4 font-mono text-[11px]" style={{ color: "var(--destructive)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export default function CaseDetail({
  c,
  reviewable = false,
  onReviewed,
}: {
  c: Case;
  // CaseDetail does not know which dataset it renders, and should not. The
  // desk passes this only for live cases, so the baked batches and the
  // live-mode result pane cannot grow buttons by accident: the prop is simply
  // absent there.
  reviewable?: boolean;
  onReviewed?: (updated: Case) => void;
}) {
  const humanDecided = c.decision_source === "human_override";
  // `was_overridden` only means "differs from the proposal", which a human
  // correction also satisfies. The guardrail block below must not claim the
  // guardrail produced a label a person chose.
  const overridden =
    c.was_overridden &&
    (c.guardrail_triggers?.length ?? 0) > 0 &&
    !humanDecided;
  // A corrected case stays reviewable. A mis-click has to be fixable, and the
  // endpoint records the second correction on top of the first rather than
  // replacing it.
  const canReview =
    reviewable &&
    (c.status === "awaiting_human" || c.status === "escalated");

  const chapters = ["Decision", "Decision path", "Execution"] as const;
  const total = chapters.length;

  const [i, setI] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [visible, setVisible] = useState(true);
  const locked = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const touchY = useRef<number | null>(null);

  const go = useCallback(
    (d: 1 | -1) => {
      const next = i + d;
      if (next < 0 || next >= total || locked.current) return;
      locked.current = true;
      setDir(d);
      setVisible(false);
      window.setTimeout(() => {
        setI(next);
        if (innerRef.current) innerRef.current.scrollTop = 0;
        setVisible(true);
        window.setTimeout(() => {
          locked.current = false;
        }, SWAP_LOCK - SWAP_OUT);
      }, SWAP_OUT);
    },
    [i, total]
  );

  // Wheel: non-passive so the gesture can be consumed rather than scrolling
  // an ancestor. A chapter with overflow gets to use the gesture first.
  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      if (locked.current) {
        e.preventDefault();
        return;
      }
      const el = innerRef.current;
      const atBottom =
        !el || el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
      const atTop = !el || el.scrollTop <= 4;
      if (e.deltaY > 8 && atBottom && i < total - 1) {
        e.preventDefault();
        go(1);
      } else if (e.deltaY < -8 && atTop && i > 0) {
        e.preventDefault();
        go(-1);
      }
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [go, i, total]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchY.current = e.touches[0]?.clientY ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchY.current;
    const end = e.changedTouches[0]?.clientY;
    touchY.current = null;
    if (start == null || end == null) return;
    const dy = start - end;
    if (Math.abs(dy) < 45) return;
    const el = innerRef.current;
    const atBottom =
      !el || el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
    const atTop = !el || el.scrollTop <= 4;
    if (dy > 0 && atBottom) go(1);
    else if (dy < 0 && atTop) go(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "PageDown") {
      e.preventDefault();
      go(1);
    } else if (e.key === "ArrowUp" || e.key === "PageUp") {
      e.preventDefault();
      go(-1);
    }
  };

  const jump = (n: number) => {
    if (n === i || locked.current) return;
    go(n > i ? 1 : -1);
  };

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      className="relative h-full overflow-hidden outline-none"
    >
      {/* ---- chapter rail --------------------------------------------- */}
      <div className="absolute right-1 top-1/2 z-10 flex -translate-y-1/2 flex-col items-center gap-2">
        {chapters.map((label, n) => (
          <button
            key={label}
            onClick={() => jump(n)}
            aria-label={label}
            aria-current={n === i}
            className="group flex h-4 w-4 items-center justify-center"
          >
            <span
              className="rounded-full transition-all duration-300"
              style={{
                width: n === i ? 4 : 5,
                height: n === i ? 16 : 5,
                background:
                  n === i ? "var(--primary)" : "var(--border-accent-strong)",
                opacity: n === i ? 1 : 0.5,
              }}
            />
          </button>
        ))}
      </div>

      {/* ---- the single live chapter ----------------------------------- */}
      <div
        className="h-full"
        style={{
          opacity: visible ? 1 : 0,
          transition: `opacity ${SWAP_OUT}ms var(--ease)`,
        }}
      >
        <div
          key={i}
          className={`flex h-full flex-col justify-center ${
            dir === 1 ? "chap-down" : "chap-up"
          }`}
        >
          <div
            ref={innerRef}
            className="no-bar max-h-full overflow-y-auto px-2 pb-12 pt-4"
          >
            <div className="mx-auto w-full max-w-[660px]">
              {/* ============ chapter 1 · the verdict + the message ===== */}
              {i === 0 ? (
                <>
                  <div className="surface card-lift rounded-2xl p-6">
                    <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      Decision
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
                      <h2 className="text-[27px] font-bold leading-tight tracking-tight">
                        {TYPE_LABELS[c.request_type] ?? c.request_type}
                      </h2>
                      <UrgencyChip urgency={c.urgency} />
                      {c.secondary_type ? (
                        <SecondaryChip type={c.secondary_type} />
                      ) : null}
                      <span className="ml-auto">
                        <StatusChip status={c.status} />
                      </span>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t pt-3.5 font-mono text-[11.5px] text-muted-foreground">
                      <span>
                        CONF{" "}
                        <span className="text-foreground">
                          {typeof c.confidence === "number"
                            ? c.confidence.toFixed(2)
                            : "—"}
                        </span>
                      </span>
                      <SourceChip source={c.decision_source} />
                      {typeof c.latency_ms === "number" ? (
                        <span>{c.latency_ms}ms</span>
                      ) : null}
                      {c.rationale ? (
                        <InfoHint label="Model rationale" placement="side">
                          {c.rationale}
                        </InfoHint>
                      ) : null}
                    </div>
                  </div>

                  {canReview || humanDecided ? (
                    <ReviewRow
                      c={c}
                      canReview={canReview}
                      humanDecided={humanDecided}
                      onReviewed={onReviewed}
                    />
                  ) : null}

                  <div className="mt-8">
                    <Eyebrow>Received</Eyebrow>
                    <div className="mt-3 pl-4">
                      <div className="text-[15px] font-semibold">
                        {c.subject || "(no subject)"}
                      </div>
                      <div className="mt-1 font-mono text-[11px] text-muted-foreground/80">
                        {c.channel} · {c.sender}
                      </div>
                      {c.body ? (
                        <p className="mt-3 max-w-[58ch] whitespace-pre-wrap text-[14.5px] leading-[1.75] text-muted-foreground">
                          {c.body}
                        </p>
                      ) : null}
                      {Object.keys(c.entities ?? {}).length > 0 &&
                      c.decision_source !== "keyword_fallback" ? (
                        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11.5px]">
                          {Object.entries(c.entities).map(([k, v]) => (
                            <span key={k}>
                              <span className="text-muted-foreground/70">
                                {k}
                              </span>{" "}
                              <span>{String(v)}</span>
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </>
              ) : null}

              {/* ============ chapter 2 · the decision path ============= */}
              {i === 1 ? (
                <div className="space-y-9">
                  {c.proposal ? (
                    <div>
                      <Eyebrow hint="The LLM's classification is an untrusted proposal. Deterministic guardrails see it before it becomes a decision, and the audit trail keeps both.">
                        Model proposed
                      </Eyebrow>
                      <div className="mt-2.5 pl-4 text-[16px] text-muted-foreground">
                        <span className="font-semibold text-foreground">
                          {TYPE_LABELS[
                            c.proposal.request_type as keyof typeof TYPE_LABELS
                          ] ?? c.proposal.request_type}
                        </span>{" "}
                        at{" "}
                        <span
                          style={{ color: `var(--u-${c.proposal.urgency})` }}
                        >
                          {c.proposal.urgency}
                        </span>
                        {typeof c.proposal.confidence === "number" ? (
                          <span className="font-mono text-[12px] text-muted-foreground/70">
                            {" "}
                            · {c.proposal.confidence.toFixed(2)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {c.guardrail_triggers.length > 0 ? (
                    <div>
                      <Eyebrow
                        color="var(--guard)"
                        hint="Deterministic phrase filters run on the raw text before the model's proposal is trusted. They can only escalate — force a more serious type, raise urgency, or demand review — never de-escalate."
                      >
                        Guardrails
                      </Eyebrow>
                      <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-4">
                        {c.guardrail_triggers.map((g) => (
                          <GuardChip key={g} id={g} />
                        ))}
                        {overridden && c.proposal ? (
                          <span className="font-mono text-[12px] text-muted-foreground">
                            {c.proposal.request_type}/{c.proposal.urgency} →{" "}
                            <span className="text-foreground">
                              {c.request_type}/{c.urgency}
                            </span>
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  <div>
                    <Eyebrow hint="The final classification after guardrails. Held-for-review cases wait for an associate, who can override type and urgency; every override is kept as labelled training signal.">
                      Decided
                    </Eyebrow>
                    <div className="mt-2.5 pl-4 text-[16px] text-muted-foreground">
                      <span className="font-semibold text-foreground">
                        {TYPE_LABELS[c.request_type] ?? c.request_type}
                      </span>{" "}
                      at{" "}
                      <span style={{ color: `var(--u-${c.urgency})` }}>
                        {c.urgency}
                      </span>
                      {c.requires_review ? <span> · held for review</span> : null}
                    </div>
                  </div>
                </div>
              ) : null}

              {/* ============ chapter 3 · what was executed ============= */}
              {i === 2 ? (
                <div>
                  <Eyebrow>Executed · {c.n_actions} steps</Eyebrow>
                  <ol className="mt-5 pl-1">
                    {c.trace.map((s, n) => {
                      const human = (s.summary ?? "").startsWith(HUMAN_STEP);
                      const failed = s.outcome === "failed";
                      const summary = stepSummary(s);
                      const last = n === c.trace.length - 1;
                      // Colour carries meaning or it is noise: a failure, a
                      // human event, everything else neutral.
                      const tone = failed
                        ? "var(--u-critical)"
                        : human
                          ? "var(--guard)"
                          : "var(--border-accent-strong)";
                      return (
                        <li key={n} className={`relative pl-7 ${last ? "" : "pb-6"}`}>
                          {last ? null : (
                            <span
                              aria-hidden
                              className="absolute left-[4px] top-3.5 h-full w-px"
                              style={{ background: "var(--border)" }}
                            />
                          )}
                          <span
                            aria-hidden
                            className="absolute left-0 top-[5px] h-[9px] w-[9px] rounded-full border-2"
                            style={{ borderColor: tone, background: "var(--card)" }}
                          />
                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                            <span
                              className="font-mono text-[10px] uppercase tracking-[0.16em]"
                              style={{ color: tone }}
                            >
                              {ACTION_LABELS[s.action] ?? s.action.replace(/_/g, " ")}
                            </span>
                            {s.target ? (
                              <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                                {s.target}
                              </span>
                            ) : null}
                            {s.outcome && s.outcome !== "succeeded" ? (
                              <span
                                className="font-mono text-[10px] uppercase tracking-wider"
                                style={{
                                  color: failed
                                    ? "var(--u-critical)"
                                    : "var(--muted-foreground)",
                                }}
                              >
                                {s.outcome}
                              </span>
                            ) : null}
                          </div>
                          {summary ? (
                            <div className="mt-1.5 max-w-[58ch] text-[13.5px] leading-relaxed text-muted-foreground">
                              {summary}
                            </div>
                          ) : null}
                          {s.artifact ? (
                            s.action === "generate_response" ? (
                              // Outbound copy. It gets the card, because this is
                              // the thing a customer would actually receive.
                              <pre
                                className="mt-2.5 max-w-[58ch] whitespace-pre-wrap rounded-xl p-4 font-sans text-[13px] leading-relaxed text-muted-foreground"
                                style={{
                                  background: "var(--secondary)",
                                  border: "1px solid var(--border-accent)",
                                }}
                              >
                                {s.artifact}
                              </pre>
                            ) : (
                              // An audit record, not a message. Quieter, mono,
                              // no border - it is evidence, not correspondence.
                              <div
                                className="mt-2 max-w-[62ch] whitespace-pre-wrap rounded-lg px-3 py-2 font-mono text-[11.5px] leading-relaxed text-muted-foreground"
                                style={{ background: "var(--secondary)" }}
                              >
                                {s.artifact}
                              </div>
                            )
                          ) : null}
                          {s.error ? (
                            <div
                              className="mt-1.5 font-mono text-[11px]"
                              style={{ color: "var(--u-critical)" }}
                            >
                              {s.error}
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ol>
                  <div className="mt-6 pl-4 font-mono text-[10px] text-muted-foreground/60">
                    {c.case_id} · {c.trace_id}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* ---- chapter cue ------------------------------------------------ */}
      <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
        <span className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground/50">
          {i < total - 1 ? `scroll ↓  ${chapters[i + 1]}` : `${total} / ${total}`}
        </span>
      </div>
    </div>
  );
}
