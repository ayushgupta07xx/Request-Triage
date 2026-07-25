"use client";

import { useState } from "react";
import type { Case } from "@/lib/types";
import { TYPE_LABELS, STATUS_LABELS } from "@/lib/types";
import TraceStep from "./TraceStep";
import {
  UrgencyBadge,
  SourceBadge,
  SecondaryIntentBadge,
  DegradedBadge,
  ReviewBadge,
  OverrideBadge,
  SlaBreachBadge,
} from "./badges";

// A single case, legible to a Tier-1 operations associate: the message, what
// the system decided and why, what it extracted, the exact steps it executed,
// and the drafts it produced. Everything a JSON dump would hide is surfaced
// as a labelled field.
export default function CaseCard({ c }: { c: Case }) {
  const [open, setOpen] = useState(false);
  const entityPairs = Object.entries(c.entities ?? {});
  const degraded = c.decision_source === "keyword_fallback";

  return (
    <article className="rounded border border-[var(--line)] p-4">
      {/* header: type + urgency + the badges that carry audit signal */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">
          {TYPE_LABELS[c.request_type] ?? c.request_type}
        </span>
        <UrgencyBadge urgency={c.urgency} />
        <SourceBadge source={c.decision_source} />
        {degraded ? <DegradedBadge /> : null}
        {c.secondary_type ? (
          <SecondaryIntentBadge type={c.secondary_type} />
        ) : null}
        {c.was_overridden ? <OverrideBadge /> : null}
        {c.requires_review ? <ReviewBadge reason={c.review_reason} /> : null}
        {c.sla_breached ? <SlaBreachBadge /> : null}
        <span className="ml-auto text-xs text-[var(--muted)]">
          {STATUS_LABELS[c.status] ?? c.status}
        </span>
      </div>

      {/* the message */}
      <div className="mt-2">
        {c.subject ? <div className="text-sm font-medium">{c.subject}</div> : null}
        <div className="text-xs text-[var(--muted)]">
          {c.channel}
          {c.sender ? ` · ${c.sender}` : ""}
        </div>
        {c.body ? (
          <p className="mt-1 line-clamp-3 text-sm text-[var(--fg)]">{c.body}</p>
        ) : null}
      </div>

      {/* confidence + rationale: why the system decided what it did */}
      <div className="mt-2 text-sm">
        {typeof c.confidence === "number" ? (
          <span className="text-[var(--muted)]">
            confidence{" "}
            <span className="tabular-nums text-[var(--fg)]">
              {c.confidence.toFixed(2)}
            </span>
          </span>
        ) : null}
        {c.rationale ? (
          <p className="mt-0.5 text-[var(--muted)]">{c.rationale}</p>
        ) : null}
      </div>

      {/* extracted entities */}
      {entityPairs.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {entityPairs.map(([k, v]) => (
            <span key={k}>
              <span className="text-[var(--muted)]">{k}:</span>{" "}
              <span className="tabular-nums">{String(v)}</span>
            </span>
          ))}
        </div>
      ) : null}

      {/* provenance: model proposed vs. system decided (only when they differ) */}
      {c.was_overridden && c.proposal ? (
        <div className="mt-2 rounded bg-[var(--surface)] p-2 text-xs">
          <span className="text-[var(--muted)]">Model proposed:</span>{" "}
          {c.proposal.request_type} / {c.proposal.urgency} —{" "}
          <span className="text-[var(--muted)]">system decided:</span>{" "}
          {c.request_type} / {c.urgency}
        </div>
      ) : null}

      {/* expandable execution trace */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="mt-3 text-xs underline"
        aria-expanded={open}
      >
        {open ? "Hide" : "Show"} {c.n_actions}-step trace
      </button>
      {open ? (
        <ol className="mt-2 space-y-2">
          {c.trace.map((step, i) => (
            <TraceStep key={i} step={step} index={i} />
          ))}
        </ol>
      ) : null}

      {/* footer: the audit line */}
      <div className="mt-3 text-[10px] text-[var(--muted)]">
        {c.case_id}
        {c.model_name ? ` · ${c.model_name}` : ""}
        {c.prompt_version ? ` · ${c.prompt_version}` : ""}
        {typeof c.latency_ms === "number" ? ` · ${c.latency_ms}ms` : ""}
      </div>
    </article>
  );
}
