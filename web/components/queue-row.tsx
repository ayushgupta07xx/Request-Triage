"use client";

import type { Case } from "@/lib/types";
import { TYPE_LABELS } from "@/lib/types";
import { UrgencyDot } from "./chips";

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
  return (
    <button
      onClick={onSelect}
      aria-current={selected}
      className={`w-full rounded-xl border px-3 py-2.5 text-left ${
        selected ? "" : "border-transparent hover:bg-secondary/60"
      }`}
      style={
        selected
          ? {
              background: "var(--accent)",
              borderColor: "var(--border-accent-strong)",
              boxShadow: "var(--shadow-accent-sm)",
            }
          : undefined
      }
    >
      <div className="flex items-center gap-2">
        <UrgencyDot urgency={c.urgency} />
        <span
          className="truncate text-[13px] font-medium"
          style={selected ? { color: "var(--accent-foreground)" } : undefined}
        >
          {c.subject || "(no subject)"}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-2 pl-4">
        <span className="text-[11px] text-muted-foreground">
          {TYPE_LABELS[c.request_type] ?? c.request_type}
        </span>
        {auto ? (
          <span className="text-[11px]" style={{ color: "var(--ok)" }}>
            · auto
          </span>
        ) : c.requires_review ? (
          <span className="text-[11px] text-muted-foreground">· review</span>
        ) : null}
        {c.decision_source === "keyword_fallback" ? (
          <span className="font-mono text-[10px] uppercase text-muted-foreground/70">
            floor
          </span>
        ) : null}
        <span className="ml-auto font-mono text-[10px] text-muted-foreground/70">
          {typeof c.confidence === "number" ? c.confidence.toFixed(2) : "—"}
        </span>
      </div>
    </button>
  );
}
