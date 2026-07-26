"use client";

import { useEffect, useMemo, useState } from "react";
import type { Case, DemoData, Urgency } from "@/lib/types";
import { TYPE_LABELS } from "@/lib/types";
import {
  UrgencyChip,
  SourceChip,
  StatusChip,
  SecondaryChip,
} from "./chips";
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

// One slot per urgency level, so a visitor sees the whole ramp the desk
// routes on. Within a slot, a case whose terminal status is not yet on screen
// wins, then whichever demonstrates most -- a guardrail catch, a floor
// decision, a flagged second intent. Nothing is invented: a level this batch
// cannot supply is skipped rather than filled with a lookalike.
const URGENCY_SHOWCASE: Urgency[] = ["critical", "high", "medium", "low"];

function interest(c: Case): number {
  return (
    (c.guardrail_triggers?.length ? 3 : 0) +
    (c.decision_source === "keyword_fallback" ? 2 : 0) +
    (c.secondary_type ? 1 : 0)
  );
}

function pickShowcase(cases: Case[]): Case[] {
  const picks: Case[] = [];
  const usedIds = new Set<string>();
  const usedStatus = new Set<string>();

  for (const u of URGENCY_SHOWCASE) {
    const pool = cases.filter(
      (c) => c.urgency === u && !usedIds.has(c.case_id)
    );
    if (pool.length === 0) continue;
    pool.sort(
      (a, b) =>
        Number(usedStatus.has(a.status)) - Number(usedStatus.has(b.status)) ||
        interest(b) - interest(a)
    );
    const chosen = pool[0];
    picks.push(chosen);
    usedIds.add(chosen.case_id);
    usedStatus.add(chosen.status);
  }

  if (picks.length === 0) picks.push(...cases.slice(0, 4));
  return picks;
}

function storyOf(c: Case): string {
  if (c.was_overridden && (c.guardrail_triggers?.length ?? 0) > 0)
    return "guardrail escalated over the model";
  if (c.status === "auto_resolved") return "resolved · no human involved";
  if (c.decision_source === "keyword_fallback")
    return "provider outage · deterministic floor · routed to a human";
  if (c.secondary_type) return "second intent flagged, not dropped";
  if (c.status === "escalated")
    return "automation paused · handed to a specialist";
  if (c.status === "awaiting_human")
    return "branch prepared the work · an associate finishes it";
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
      {/* Identical to the Decision card in components/case-detail.tsx: same
          order, same chips, same divider, same meta row. A visitor should not
          meet one card here and a different one a click later. */}
      <div key={c.case_id} className="surface card-lift rounded-2xl p-8">
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          Decision
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
          <span className="text-[30px] font-bold leading-tight tracking-tight">
            {TYPE_LABELS[c.request_type] ?? c.request_type}
          </span>
          <UrgencyChip urgency={c.urgency} />
          {c.secondary_type ? <SecondaryChip type={c.secondary_type} /> : null}
          <span className="ml-auto">
            <StatusChip status={c.status} />
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t pt-3.5 font-mono text-[11.5px] text-muted-foreground">
          <span>
            CONF{" "}
            <span className="text-foreground">
              {typeof c.confidence === "number" ? c.confidence.toFixed(2) : "—"}
            </span>
          </span>
          <SourceChip source={c.decision_source} />
          {typeof c.latency_ms === "number" ? (
            <span>{c.latency_ms}ms</span>
          ) : null}
        </div>
      </div>

      {/* What this card is here to show. Outside the card on purpose — it is
          a caption for a landing page, not part of the product's own card. */}
      <div className="mt-3 text-center font-mono text-[10.5px] tracking-[0.05em] text-muted-foreground">
        {storyOf(c)}
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
