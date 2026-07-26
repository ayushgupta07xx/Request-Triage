"use client";

import type { Case } from "@/lib/types";
import { TYPE_LABELS } from "@/lib/types";
import { UrgencyDot } from "./chips";

// A row in the queue. Selection is marked with a rail and a neutral fill, not
// with an accent wash: --accent as a background is a low-contrast smear at
// this size, and tinting the subject with --accent-foreground spends the
// colour that means "machine-resolved work" on a line that has nothing to do
// with it. The rail is 3px of real accent instead, which reads as deliberate.
//
// Metadata is one convention rather than three. Every marker is a small mono
// token, and colour is only spent where it carries meaning: guard amber for a
// guardrail catch, --ok for work the system closed, neutral for the floor and
// for a suppressed duplicate. "review" is deliberately absent — it is true of
// most of the queue, so as a per-row marker it is noise, and the Uncertain
// filter above answers the question better.

function Token({
  children,
  color,
}: {
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <span
      className="shrink-0 font-mono text-[9.5px] uppercase tracking-[0.12em]"
      style={{
        color: color ?? "var(--muted-foreground)",
        opacity: color ? 1 : 0.65,
      }}
    >
      {children}
    </span>
  );
}

export default function QueueRow({
  c,
  selected,
  onSelect,
}: {
  c: Case;
  selected: boolean;
  onSelect: () => void;
}) {
  const auto = c.status === "auto_resolved";
  const duplicate = c.status === "duplicate";
  const floor = c.decision_source === "keyword_fallback";
  const guard = (c.guardrail_triggers?.length ?? 0) > 0;

  return (
    <button
      onClick={onSelect}
      aria-current={selected}
      className={`group relative w-full rounded-xl py-2.5 pl-4 pr-3 text-left transition-colors ${
        selected ? "bg-secondary" : "hover:bg-secondary/50"
      }`}
    >
      {/* the same vocabulary the case timeline uses: a rail marks the current
          thing. Faintly present on hover so the row answers before the click. */}
      <span
        aria-hidden
        className="absolute bottom-2 left-0 top-2 w-[3px] rounded-full transition-opacity duration-200"
        style={{
          background: "var(--primary)",
          opacity: selected ? 1 : 0,
        }}
      />
      {!selected ? (
        <span
          aria-hidden
          className="absolute bottom-2 left-0 top-2 w-[3px] rounded-full opacity-0 transition-opacity duration-200 group-hover:opacity-30"
          style={{ background: "var(--primary)" }}
        />
      ) : null}

      <div className="flex items-center gap-2">
        <UrgencyDot urgency={c.urgency} />
        <span
          className={`truncate text-[13px] ${
            selected ? "font-semibold" : "font-medium"
          }`}
        >
          {c.subject || "(no subject)"}
        </span>
      </div>

      <div className="mt-1 flex items-center gap-2 pl-4">
        <span className="truncate text-[11px] text-muted-foreground">
          {TYPE_LABELS[c.request_type] ?? c.request_type}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {duplicate ? (
            <Token>dup</Token>
          ) : guard ? (
            <Token color="var(--guard)">guard</Token>
          ) : floor ? (
            <Token>floor</Token>
          ) : null}
          {auto ? <Token color="var(--ok)">auto</Token> : null}
          <span className="font-mono text-[10.5px] tabular-nums text-muted-foreground">
            {typeof c.confidence === "number" ? c.confidence.toFixed(2) : "—"}
          </span>
        </span>
      </div>
    </button>
  );
}
