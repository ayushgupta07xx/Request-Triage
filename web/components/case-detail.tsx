"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Case } from "@/lib/types";
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

export default function CaseDetail({ c }: { c: Case }) {
  const overridden =
    c.was_overridden && (c.guardrail_triggers?.length ?? 0) > 0;

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
            className="no-bar max-h-full overflow-y-auto px-2 py-4"
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
                  <ol className="mt-5 space-y-5 pl-4">
                    {c.trace.map((s, n) => (
                      <li key={n}>
                        <div className="flex items-baseline gap-2.5 text-[14.5px]">
                          <span className="font-mono text-[12px] text-muted-foreground/70">
                            {String(n + 1).padStart(2, "0")}
                          </span>
                          <span className="font-medium">{s.action}</span>
                          {s.target ? (
                            <span className="text-muted-foreground">
                              → {s.target}
                            </span>
                          ) : null}
                          {s.outcome && s.outcome !== "succeeded" ? (
                            <span style={{ color: "var(--u-critical)" }}>
                              {s.outcome}
                            </span>
                          ) : null}
                        </div>
                        {s.summary ? (
                          <div className="mt-1 pl-8 text-[13px] text-muted-foreground">
                            {s.summary}
                          </div>
                        ) : null}
                        {s.artifact ? (
                          <pre
                            className="ml-8 mt-2.5 max-w-[56ch] whitespace-pre-wrap rounded-xl p-4 font-sans text-[13px] leading-relaxed text-muted-foreground"
                            style={{
                              background: "var(--secondary)",
                              border: "1px solid var(--border-accent)",
                            }}
                          >
                            {s.artifact}
                          </pre>
                        ) : null}
                      </li>
                    ))}
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
