"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { Case, CaseStatus, TraceStep } from "@/lib/types";
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
//
// triage/engine.py also appends HELD_SUFFIX to every drafted step that is not
// auto-sent. On a branch whose configured summary already says as much, the row
// states it twice; on a branch that does not, the suffix is the only thing
// telling a reviewer the draft was never sent. So it is stripped only when the
// sentence before it is already carrying the meaning.
const HELD_SUFFIX = " (held for human approval)";

// A grounded draft names its source in the body of the artifact. The branch's
// configured summary claims one unconditionally, so the claim is checked
// against the draft itself before it is shown.
const GROUNDED_CLAIM = /grounded in the knowledge base/i;
const CITES_SOURCE = /(^|\n)\s*Source:/i;
const UNGROUNDED_SUMMARY =
  "Draft prepared, but no knowledge-base entry matched \u2014 nothing to cite, so the case goes to a person";

// The enquiry branch declares log_outcome as auto_resolved and its summary
// says the case closed without a person. The gates can revoke that status and
// the configured sentence does not know it. Fixing the config only reaches
// runs that happen afterwards, so the console reconciles the claim against the
// status the case actually ended in -- which covers the committed batches and
// every case already in the store.
const CLOSED_CLAIM = /closed without a person/i;
const HELD_OUTCOME_SUMMARY =
  "Outcome logged; the drafted answer is on the case and it stays with a person";

function stepSummary(s: TraceStep, status?: CaseStatus): string | null {
  let text = (s.summary ?? "").trim();
  if (!text || text === s.action) return null;
  if (text.endsWith(HELD_SUFFIX)) {
    const head = text.slice(0, -HELD_SUFFIX.length).trim();
    if (/human approval/i.test(head)) text = head;
  }
  if (
    s.action === "generate_response" &&
    GROUNDED_CLAIM.test(text) &&
    !CITES_SOURCE.test(s.artifact ?? "")
  ) {
    return UNGROUNDED_SUMMARY;
  }
  if (
    s.action === "log_outcome" &&
    CLOSED_CLAIM.test(text) &&
    status !== "auto_resolved"
  ) {
    return HELD_OUTCOME_SUMMARY;
  }
  return text || null;
}

// Mirrors the two constants in triage/engine.py. A human review step is not a
// branch step and should not look like one.
const HUMAN_STEP = "Human review:";

// Mirrors HUMAN_REVIEW_APPROVED in triage/engine.py. Approval is recorded as a
// trace step, so the card reads its own persisted state rather than tracking a
// separate client-side flag that could drift from the store.
const HUMAN_APPROVED_STEP = "Human review: disposition confirmed";

// Mirrors HUMAN_REVIEW_CORRECTED in triage/engine.py. Used to fold a long
// correction history, never to drop it.
const HUMAN_CORRECTED_STEP = "Human review: label corrected";

// The SLA window as a duration rather than a deadline. A countdown against a
// batch executed weeks ago would read as nonsense; the window itself is the
// operationally meaningful number and it is stable forever.
function windowBetween(from: string | null, to: string | null): string | null {
  if (!from || !to) return null;
  const ms = new Date(to).getTime() - new Date(from).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
}

// Outbound copy. This is the only artifact a customer would ever read, so it
// is the only one that gets a container -- and the strip says plainly whether
// it is going anywhere.
function DraftedReply({ text, held }: { text: string; held: boolean }) {
  return (
    <div
      className="mt-3 max-w-[74ch] overflow-hidden rounded-xl"
      style={{ background: "var(--card)", border: "1px solid var(--border)" }}
    >
      <div
        className="flex items-center justify-between gap-3 px-4 py-2"
        style={{ background: "var(--secondary)" }}
      >
        <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground">
          Drafted reply
        </span>
        <span
          className="font-mono text-[9.5px] uppercase tracking-[0.16em]"
          style={{ color: held ? "var(--guard)" : "var(--ok)" }}
        >
          {held ? "held for approval" : "sent"}
        </span>
      </div>
      <p className="whitespace-pre-wrap px-4 py-3.5 text-[13px] leading-[1.7] text-foreground/85">
        {text}
      </p>
    </div>
  );
}

// An audit record is evidence, not correspondence. It gets no container at
// all: a rule and a mono line, so it can never be mistaken at a glance for
// something that left the building.
function AuditRecord({ text }: { text: string }) {
  return (
    <div className="mt-2.5 flex max-w-[82ch] items-start gap-3">
      <span
        aria-hidden
        className="mt-[8px] h-px w-4 shrink-0"
        style={{ background: "var(--border)" }}
      />
      <span className="whitespace-pre-wrap font-mono text-[11.5px] leading-relaxed text-muted-foreground">
        {text}
      </span>
    </div>
  );
}

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

// One stage on the decision path. Deliberately the same rail, dot, indent and
// tone rules as a step in the execution timeline: the two chapters describe
// one pipeline, so they should read as one drawing. The rail is the argument —
// proposal, then guardrails, then decision, in that order, always.
function PathStep({
  label,
  color,
  hint,
  last,
  children,
}: {
  label: string;
  color?: string;
  hint?: React.ReactNode;
  last: boolean;
  children: React.ReactNode;
}) {
  const tone = color ?? "var(--border-accent-strong)";
  return (
    <li className={`relative pl-7 ${last ? "" : "pb-9"}`}>
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
      <div className="flex items-center gap-2">
        <span
          className="font-mono text-[11px] uppercase tracking-[0.16em]"
          style={{ color: color ?? "var(--muted-foreground)" }}
        >
          {label}
        </span>
        {hint ? <InfoHint placement="side">{hint}</InfoHint> : null}
      </div>
      <div className="mt-2.5">{children}</div>
    </li>
  );
}

// Built as a list so the connecting rail knows which stage is last: a case
// with no guardrail catch has two stages, not three, and the rail has to end
// on the real one.
function DecisionPath({ c, overridden }: { c: Case; overridden: boolean }) {
  const steps: {
    key: string;
    label: string;
    color?: string;
    hint: string;
    body: React.ReactNode;
  }[] = [];

  if (c.proposal) {
    steps.push({
      key: "proposed",
      label: "Model proposed",
      hint: "The LLM's classification is an untrusted proposal. Deterministic guardrails see it before it becomes a decision, and the audit trail keeps both.",
      body: (
        <div>
          <div className="text-[16px] text-muted-foreground">
            <span className="font-semibold text-foreground">
              {TYPE_LABELS[
                c.proposal.request_type as keyof typeof TYPE_LABELS
              ] ?? c.proposal.request_type}
            </span>{" "}
            at{" "}
            <span style={{ color: `var(--u-${c.proposal.urgency})` }}>
              {c.proposal.urgency}
            </span>
            {typeof c.proposal.confidence === "number" ? (
              <span className="font-mono text-[12px] text-muted-foreground/70">
                {" "}
                · {c.proposal.confidence.toFixed(2)}
              </span>
            ) : null}
          </div>
          {/* which model, on which prompt. The first thing an auditor asks,
              and it was sitting in the payload unused. */}
          {c.model_name ? (
            <div className="mt-1.5 font-mono text-[10.5px] text-muted-foreground">
              {c.model_name}
              {c.prompt_version ? (
                <>
                  <span className="opacity-40"> · </span>prompt{" "}
                  {c.prompt_version}
                </>
              ) : null}
            </div>
          ) : null}
          {/* the model's own reasoning, in its own words */}
          {c.rationale ? (
            <p
              className="mt-3 max-w-[62ch] border-l pl-3.5 text-[13px] leading-relaxed text-muted-foreground"
              style={{ borderColor: "var(--border)" }}
            >
              {c.rationale}
            </p>
          ) : null}
        </div>
      ),
    });
  }

  if (c.guardrail_triggers.length > 0) {
    steps.push({
      key: "guardrails",
      label: "Guardrails",
      color: "var(--guard)",
      hint: "Deterministic phrase filters run on the raw text before the model's proposal is trusted. They can only escalate — force a more serious type, raise urgency, or demand review — never de-escalate.",
      body: (
        <div className="flex flex-wrap items-center gap-2">
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
      ),
    });
  }

  steps.push({
    key: "decided",
    label: "Decided",
    hint: "The final classification after guardrails. Held-for-review cases wait for an associate, who can override type and urgency; every override is kept as labelled training signal.",
    body: (
      <div>
        <div className="text-[16px] text-muted-foreground">
          <span className="font-semibold text-foreground">
            {TYPE_LABELS[c.request_type] ?? c.request_type}
          </span>{" "}
          at{" "}
          <span style={{ color: `var(--u-${c.urgency})` }}>{c.urgency}</span>
          {c.requires_review ? <span> · held for review</span> : null}
        </div>
        {/* why it was held. The engine records this and nothing displayed it. */}
        {c.review_reason ? (
          <div className="mt-2 max-w-[62ch] font-mono text-[11.5px] leading-relaxed text-muted-foreground">
            {c.review_reason}
          </div>
        ) : null}
      </div>
    ),
  });

  return (
    <ol className="pl-1">
      {steps.map((s, n) => (
        <PathStep
          key={s.key}
          label={s.label}
          color={s.color}
          hint={s.hint}
          last={n === steps.length - 1}
        >
          {s.body}
        </PathStep>
      ))}
    </ol>
  );
}

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
      <Eyebrow hint="In production this sits behind the associate's SSO role; the demo leaves it open so you can exercise the loop. An override re-runs the corrected branch through the real engine and keeps the disagreement as labelled training signal. Corrections stack until someone approves; approval closes the record, so override is unavailable after it.">
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
        {/* Approval is a commitment, so it closes the override path: a
            disposition cannot be quietly changed after someone has signed off
            on it. Corrections still stack freely up until that point. */}
        <button
          type="button"
          disabled={busy !== null || approved}
          onClick={() => setOpen((v) => !v)}
          className={`${pickChip(open && !approved)} disabled:cursor-not-allowed disabled:opacity-40`}
        >
          Override
        </button>
        {approved ? (
          <span
            title="Override is only available before approval"
            aria-label="Override is only available before approval"
            className="inline-flex items-center"
            style={{ color: "var(--primary)" }}
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
              <rect x="4" y="10.5" width="16" height="9.5" rx="2.5" />
              <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
            </svg>
          </span>
        ) : null}
      </div>

      {/* Height animated with grid-template-rows rather than a guessed
          max-height, and the panel stays mounted so confirming closes it
          smoothly instead of unmounting mid-gesture. */}
      <div
        className="grid transition-all duration-300"
        style={{
          gridTemplateRows: open && !approved ? "1fr" : "0fr",
          opacity: open && !approved ? 1 : 0,
          transitionTimingFunction: "var(--ease-out)",
        }}
        aria-hidden={!open || approved}
      >
        <div
          className={`min-h-0 overflow-hidden ${
            open && !approved ? "" : "pointer-events-none"
          }`}
        >
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
        </div>
      </div>

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

  // A repeatedly corrected case would otherwise stack an unbounded number of
  // near-identical blocks and push the branch's own output off the pane. The
  // two most recent corrections stay open; older ones collapse to a single
  // line. This is a display cap only — every one of them is still in the
  // payload, the store, and the API response.
  const [showAllCorrections, setShowAllCorrections] = useState(false);
  const correctionIndices = c.trace
    .map((s, n) => (s.summary === HUMAN_CORRECTED_STEP ? n : -1))
    .filter((n) => n >= 0);
  const hiddenCorrections = new Set<number>(
    showAllCorrections
      ? []
      : correctionIndices.slice(0, Math.max(0, correctionIndices.length - 2))
  );
  const firstHiddenCorrection = correctionIndices[0] ?? -1;

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
            <div className="mx-auto w-full max-w-[800px]">
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
                      {/* the clock this desk is actually run against */}
                      {windowBetween(c.created_at, c.sla_due_at) ? (
                        <span>
                          SLA{" "}
                          <span className="text-foreground">
                            {windowBetween(c.created_at, c.sla_due_at)}
                          </span>
                        </span>
                      ) : null}
                      {c.sla_breached ? (
                        <span
                          className="uppercase tracking-[0.14em]"
                          style={{ color: "var(--u-critical)" }}
                        >
                          breached
                        </span>
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
                      <div className="mt-1 font-mono text-[11px] text-muted-foreground/70">
                        {c.channel} ·{" "}
                        <span className="text-foreground/75">{c.sender}</span>
                      </div>
                      {/* The customer's own words, ruled off so they read as
                          quoted material rather than as system output. */}
                      {c.body ? (
                        <p
                          className="mt-3.5 max-w-[68ch] whitespace-pre-wrap border-l pl-4 text-[14.5px] leading-[1.75] text-muted-foreground"
                          style={{ borderColor: "var(--border)" }}
                        >
                          {c.body}
                        </p>
                      ) : null}
                      {/* Extraction is one of the things the brief asks for.
                          A labelled grid says so; a wrapping row of pairs
                          reads as leftover metadata. */}
                      {Object.keys(c.entities ?? {}).length > 0 &&
                      c.decision_source !== "keyword_fallback" ? (
                        <div className="mt-5">
                          <div className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted-foreground/70">
                            Extracted
                          </div>
                          <div className="mt-2 grid grid-cols-[max-content_1fr] gap-x-5 gap-y-1.5 font-mono text-[11.5px]">
                            {Object.entries(c.entities).map(([k, v]) => (
                              <Fragment key={k}>
                                <span className="text-muted-foreground">
                                  {k}
                                </span>
                                <span className="text-foreground">
                                  {String(v)}
                                </span>
                              </Fragment>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </>
              ) : null}

              {/* ============ chapter 2 · the decision path ============= */}
              {i === 1 ? <DecisionPath c={c} overridden={overridden} /> : null}

              {/* ============ chapter 3 · what was executed ============= */}
              {i === 2 ? (
                <div>
                  <Eyebrow>Executed · {c.n_actions} steps</Eyebrow>
                  {/* A runbook, so the markers are numbered. Branch steps are
                      numbered; a human event is not a branch step and gets a
                      plain marker in the guard colour instead. */}
                  <ol className="mt-6">
                    {c.trace.map((s, n) => {
                      const human = (s.summary ?? "").startsWith(HUMAN_STEP);

                      if (hiddenCorrections.has(n)) {
                        if (n !== firstHiddenCorrection) return null;
                        return (
                          <li key={n} className="relative pb-5 pl-7">
                            <span
                              aria-hidden
                              className="absolute left-[4px] top-3.5 h-full w-px"
                              style={{ background: "var(--border)" }}
                            />
                            <span
                              aria-hidden
                              className="absolute left-0 top-[5px] h-[9px] w-[9px] rounded-full border-2"
                              style={{
                                borderColor: "var(--border)",
                                background: "var(--background)",
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => setShowAllCorrections(true)}
                              className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70 transition-colors hover:text-foreground"
                            >
                              {hiddenCorrections.size} earlier correction
                              {hiddenCorrections.size === 1 ? "" : "s"} · kept in
                              the record · show
                            </button>
                          </li>
                        );
                      }

                      const failed = s.outcome === "failed";
                      const rawSummary = stepSummary(s, c.status);
                      // The engine records a human event against log_outcome,
                      // so a run of corrections would render as four identical
                      // LOG OUTCOME rows. The row says what it actually is,
                      // and the summary sheds the prefix the label now carries.
                      const summary =
                        human && rawSummary
                          ? rawSummary.slice(HUMAN_STEP.length).trim()
                          : rawSummary;
                      const last = n === c.trace.length - 1;
                      const heldDraft = (s.summary ?? "").endsWith(HELD_SUFFIX);
                      const due = windowBetween(c.created_at, s.due_at);

                      // Two steps in a branch carry an outcome rather than an
                      // activity, so those two get a filled dot in the colour
                      // of the thing they report. The draft mirrors its own
                      // badge: teal if it went, amber if a person has to
                      // release it. The log takes the case's ACTUAL terminal
                      // status rather than the one workflows.yaml declared,
                      // because a gate may have revoked it. Everything else is
                      // routine and stays an outline.
                      const isDraft = s.action === "generate_response";
                      const isLog = s.action === "log_outcome";
                      const logTone =
                        c.status === "auto_resolved"
                          ? "var(--ok)"
                          : c.status === "escalated"
                            ? "var(--guard)"
                            : "var(--muted-foreground)";
                      const tone = failed
                        ? "var(--u-critical)"
                        : human
                          ? "var(--guard)"
                          : isDraft
                            ? heldDraft
                              ? "var(--guard)"
                              : "var(--ok)"
                            : isLog
                              ? logTone
                              : "var(--border)";
                      const filled = failed || human || isDraft || isLog;
                      const ink = failed
                        ? "var(--u-critical)"
                        : human
                          ? "var(--guard)"
                          : "var(--foreground)";

                      return (
                        <li
                          key={n}
                          className={`relative pl-7 ${last ? "" : "pb-5"}`}
                        >
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
                            style={{
                              borderColor: tone,
                              background: filled ? tone : "var(--background)",
                            }}
                          />

                          {/* the header uses the full width: what ran on the
                              left, where it went on the right */}
                          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
                            <span
                              className="font-mono text-[11px] uppercase tracking-[0.14em]"
                              style={{ color: ink }}
                            >
                              {human
                                ? "Human review"
                                : (ACTION_LABELS[s.action] ??
                                  s.action.replace(/_/g, " "))}
                            </span>
                            <span className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-muted-foreground">
                              {due ? <span>due +{due}</span> : null}
                              {s.target ? (
                                <span className="rounded-full bg-secondary px-2 py-0.5">
                                  {s.target}
                                </span>
                              ) : null}
                              {s.outcome && s.outcome !== "succeeded" ? (
                                <span
                                  className="uppercase tracking-wider"
                                  style={{
                                    color: failed
                                      ? "var(--u-critical)"
                                      : "var(--muted-foreground)",
                                  }}
                                >
                                  {s.outcome}
                                </span>
                              ) : null}
                            </span>
                          </div>

                          {summary ? (
                            <p className="mt-1.5 max-w-[72ch] text-[13.5px] leading-relaxed text-muted-foreground">
                              {summary}
                            </p>
                          ) : null}

                          {s.artifact ? (
                            isDraft ? (
                              <DraftedReply
                                text={s.artifact}
                                held={heldDraft}
                              />
                            ) : (
                              <AuditRecord text={s.artifact} />
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

                  {/* the record's own identifiers, closing the chapter */}
                  <div className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-4 font-mono text-[10px] text-muted-foreground">
                    <span className="text-foreground/70">{c.case_id}</span>
                    <span className="opacity-40">·</span>
                    <span className="text-foreground/70">{c.trace_id}</span>
                    {c.branch ? (
                      <span className="ml-auto">branch {c.branch}</span>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* ---- chapter cue ------------------------------------------------
          The scrim matters: bottom padding only clears the cue when a chapter
          is scrolled to its end, so mid-scroll a draft card used to run
          straight under the text. The fade masks it at every position. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-2 pt-10"
        style={{
          background:
            "linear-gradient(to top, var(--background) 45%, transparent)",
        }}
      >
        <span className="font-mono text-[10px] tracking-[0.12em] text-muted-foreground/50">
          {i < total - 1 ? `scroll ↓  ${chapters[i + 1]}` : `${total} / ${total}`}
        </span>
      </div>
    </div>
  );
}
