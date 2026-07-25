import type { Urgency, DecisionSource, CaseStatus } from "@/lib/types";
import { SOURCE_LABELS, STATUS_LABELS } from "@/lib/types";

// Small shared vocabulary. Colour only where it means something: urgency (the
// clock), guardrails (escalation), and the brand accent for machine-resolved
// work — all of which flip with the mode.

export function UrgencyDot({ urgency }: { urgency: Urgency }) {
  return (
    <span
      title={`Urgency: ${urgency}`}
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ background: `var(--u-${urgency})` }}
    />
  );
}

export function UrgencyChip({ urgency }: { urgency: Urgency }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium"
      style={{ color: `var(--u-${urgency})` }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: `var(--u-${urgency})` }}
      />
      {urgency}
    </span>
  );
}

export function SourceChip({ source }: { source: DecisionSource }) {
  const floor = source === "keyword_fallback";
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider"
      style={
        floor
          ? { background: "var(--secondary)", color: "var(--foreground)" }
          : {
              background: "var(--accent)",
              color: "var(--accent-foreground)",
            }
      }
    >
      {SOURCE_LABELS[source] ?? source}
    </span>
  );
}

export function StatusChip({ status }: { status: CaseStatus }) {
  const auto = status === "auto_resolved";
  return (
    <span
      className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[11px]"
      style={auto ? { color: "var(--ok)" } : undefined}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function GuardChip({ id }: { id: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10px]"
      style={{ color: "var(--guard)", background: "var(--guard-soft)" }}
    >
      {id}
    </span>
  );
}

export function SecondaryChip({ type }: { type: string }) {
  return (
    <span
      title="Second intent flagged, not dropped"
      className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground"
    >
      +{type}
    </span>
  );
}
