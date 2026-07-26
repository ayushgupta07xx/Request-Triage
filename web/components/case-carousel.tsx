"use client";

import { useEffect, useMemo, useState } from "react";
import type { Case, DemoData } from "@/lib/types";
import { TYPE_LABELS } from "@/lib/types";
import { UrgencyChip, GuardChip, SourceChip } from "./chips";
import InfoHint from "./info-hint";

// The product demo as a living card: real cases from the committed batch,
// cycling on a hold -> fade -> swap rhythm. Each showcases one behaviour the
// system is built around. Nothing here is mocked -- every card is a persisted
// case from the audit record.

// The first swap is the page's proof that these are real cases cycling rather
// than a screenshot. It has to land before a reader's attention moves to the
// nav, so the opening hold is shorter than the ones that follow.
const FIRST_HOLD = 1600;
const HOLD = 2700;
const FADE = 550;

function pickShowcase(cases: Case[]): Case[] {
  const picks: Case[] = [];
  const used = new Set<string>();
  const take = (c?: Case) => {
    if (c && !used.has(c.case_id)) {
      picks.push(c);
      used.add(c.case_id);
    }
  };
  take(
    cases.find(
      (c) => c.was_overridden && (c.guardrail_triggers?.length ?? 0) > 0
    )
  );
  take(cases.find((c) => c.status === "auto_resolved"));
  take(cases.find((c) => c.decision_source === "keyword_fallback"));
  take(
    cases.find((c) => c.secondary_type && c.decision_source === "llm_primary")
  );
  if (picks.length === 0) picks.push(...cases.slice(0, 3));
  return picks;
}

function storyOf(c: Case): string {
  if (c.was_overridden && (c.guardrail_triggers?.length ?? 0) > 0)
    return "guardrail escalated over the model";
  if (c.status === "auto_resolved") return "resolved · no human involved";
  if (c.decision_source === "keyword_fallback")
    return "provider outage · deterministic floor · routed to a human";
  if (c.secondary_type) return "second intent flagged, not dropped";
  return "classified, executed, audited";
}

export function HandoffBar({ automated }: { automated: number }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const a = Math.round(automated * 100);
  const h = 100 - a;
  const grow = (delay: number) => ({
    transformOrigin: "left center",
    transform: mounted ? "scaleX(1)" : "scaleX(0)",
    transition: `transform 620ms cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
  });
  return (
    <div className="mt-5">
      {/* The whole-batch claim leads. The split below is what happened after,
          and both halves of it are work the system did. */}
      <div className="flex items-center justify-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        <span className="text-foreground">Every request</span>
        <span>· classified, branched, executed</span>
        <InfoHint placement="bottom" label="What the split means">
          Every request is received, classified, entity-extracted, branched,
          drafted, routed and logged with no person involved. The split below is
          only what closed itself — the rest reach an associate already prepared.
          That is the design: a disputed charge or a hardship disclosure should
          never close automatically.
        </InfoHint>
      </div>

      <div
        className="mt-3 flex h-3 w-full overflow-hidden rounded-full"
        style={{ background: "var(--secondary)" }}
      >
        <div style={{ width: `${a}%`, background: "var(--ok)", ...grow(0) }} />
        <div
          style={{
            width: `${h}%`,
            background: "var(--muted-foreground)",
            ...grow(90),
          }}
        />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 font-mono text-[10.5px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--ok)" }}
          />
          Resolved without a person <span className="text-foreground">{a}%</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--muted-foreground)" }}
          />
          Prepared, then handed over{" "}
          <span className="text-foreground">{h}%</span>
        </span>
      </div>
    </div>
  );
}

export default function CaseCarousel({ data }: { data: DemoData }) {
  const showcase = useMemo(() => pickShowcase(data.cases), [data.cases]);
  const [idx, setIdx] = useState(0);
  const [show, setShow] = useState(true);

  useEffect(() => {
    if (showcase.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let holdT = 0;
    let fadeT = 0;
    const schedule = (hold: number) => {
      holdT = window.setTimeout(() => {
        setShow(false);
        fadeT = window.setTimeout(() => {
          setIdx((i) => (i + 1) % showcase.length);
          setShow(true);
          schedule(HOLD);
        }, FADE);
      }, hold);
    };
    schedule(FIRST_HOLD);
    return () => {
      window.clearTimeout(holdT);
      window.clearTimeout(fadeT);
    };
  }, [showcase.length]);

  const c = showcase[idx];
  if (!c) return null;

  return (
    <div
      style={{
        opacity: show ? 1 : 0,
        transition: `opacity ${FADE}ms cubic-bezier(0.33,0,0.2,1)`,
      }}
    >
      <div key={c.case_id} className="surface card-lift rounded-2xl p-8">
        <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          <span>Decision</span>
          <SourceChip source={c.decision_source} />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2.5">
          <span className="text-[30px] font-bold leading-tight tracking-tight">
            {TYPE_LABELS[c.request_type] ?? c.request_type}
          </span>
          <UrgencyChip urgency={c.urgency} />
        </div>

        <div
          className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t pt-4 font-mono text-[11.5px] text-muted-foreground"
          style={{ borderColor: "var(--border-accent)" }}
        >
          <span>
            CONF{" "}
            <span className="text-foreground">
              {typeof c.confidence === "number" ? c.confidence.toFixed(2) : "—"}
            </span>
          </span>
          {c.guardrail_triggers?.map((g) => <GuardChip key={g} id={g} />)}
          {typeof c.latency_ms === "number" ? <span>{c.latency_ms}MS</span> : null}
        </div>

        <div className="mt-3 font-mono text-[10px] tracking-[0.05em] text-muted-foreground">
          {storyOf(c)}
        </div>
      </div>

      {showcase.length > 1 ? (
        <div className="mt-3 flex justify-center gap-1.5">
          {showcase.map((_, i) => (
            <span
              key={i}
              className="h-1.5 rounded-full transition-all duration-300"
              style={{
                width: i === idx ? 14 : 6,
                background:
                  i === idx ? "var(--primary)" : "var(--border-accent-strong)",
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
