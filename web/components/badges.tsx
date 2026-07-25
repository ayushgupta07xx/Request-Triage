import type { DecisionSource, Urgency } from "@/lib/types";
import { SOURCE_LABELS } from "@/lib/types";

// All badges share one neutral pill. Visual differentiation (urgency color
// ramp, floor warning tone, etc.) is deliberately left flat here for the
// polish pass -- the information is present and labelled; the styling is yours.
function Pill({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className="inline-flex items-center rounded border border-[var(--line)] bg-[var(--surface)] px-1.5 py-0.5 text-xs"
    >
      {children}
    </span>
  );
}

export function UrgencyBadge({ urgency }: { urgency: Urgency }) {
  return <Pill title="Classified urgency">{urgency}</Pill>;
}

export function SourceBadge({ source }: { source: DecisionSource }) {
  // Always visible: provenance is an auditability requirement, not a detail.
  return (
    <Pill title="Which tier decided this case">
      {SOURCE_LABELS[source] ?? source}
    </Pill>
  );
}

export function SecondaryIntentBadge({ type }: { type: string }) {
  return <Pill title="A second intent was detected and flagged">+{type}</Pill>;
}

export function DegradedBadge() {
  return (
    <Pill title="Decided by the deterministic keyword floor, not the model">
      degraded
    </Pill>
  );
}

export function ReviewBadge({ reason }: { reason: string | null }) {
  return <Pill title={reason ?? "Held for human review"}>review</Pill>;
}

export function OverrideBadge() {
  return (
    <Pill title="System decision differs from the model's proposal">
      overridden
    </Pill>
  );
}

export function SlaBreachBadge() {
  return <Pill title="Past its SLA at the reference instant">SLA breach</Pill>;
}
