"use client";

import type { DemoData, RequestType, CaseStatus } from "@/lib/types";
import { TYPE_LABELS, STATUS_LABELS, SOURCE_LABELS } from "@/lib/types";
import { HEADLINE, SECONDARY, EVAL_NOTE } from "@/lib/metrics";
import InfoHint from "./info-hint";

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

// Numbers first, provenance on demand. Each card carries a label and a value;
// the sample size, interval and caveat live behind its hint, so the grid reads
// as four results rather than four paragraphs.
export default function Performance({ data }: { data: DemoData }) {
  const s = data.summary;
  const types = Object.keys(TYPE_LABELS) as RequestType[];
  const statuses = Object.keys(STATUS_LABELS) as CaseStatus[];

  return (
    <div>
      {/* ---- held-out results ------------------------------------------- */}
      <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        Held out · executed once, scored once
        <InfoHint>{EVAL_NOTE}</InfoHint>
      </div>

      <div className="rise mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {HEADLINE.map((m) => (
          <div key={m.label} className="surface card-lift rounded-2xl p-4">
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] text-muted-foreground">
                {m.label}
              </span>
              {m.detail ? (
                <InfoHint label={`${m.label} detail`}>{m.detail}</InfoHint>
              ) : null}
            </div>
            <div className="mt-1.5 text-[32px] font-bold leading-none tracking-tight">
              {m.value}
            </div>
          </div>
        ))}
      </div>

      <div className="rise2 mt-3 flex flex-wrap gap-x-6 gap-y-1 font-mono text-[11px] text-muted-foreground">
        {SECONDARY.map((m) => (
          <span key={m.label} className="inline-flex items-center gap-1.5">
            {m.label} <span className="text-foreground">{m.value}</span>
            {m.detail ? (
              <InfoHint label={`${m.label} detail`}>{m.detail}</InfoHint>
            ) : null}
          </span>
        ))}
      </div>

      {/* ---- loaded batch ----------------------------------------------- */}
      <div className="mt-10 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        Loaded batch · {data.generated_from}
      </div>

      <div className="rise3 mt-3 grid gap-3 lg:grid-cols-2">
        <div className="surface card-lift rounded-2xl p-4">
          <div className="text-[12px] font-semibold">
            Volume by type and status
          </div>
          <table className="mt-3 w-full text-[12px]">
            <thead>
              <tr className="text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground/80">
                <th className="pb-2 pr-3 font-normal">Type</th>
                {statuses.map((st) => (
                  <th key={st} className="pb-2 pr-3 font-normal">
                    {STATUS_LABELS[st]}
                  </th>
                ))}
                <th className="pb-2 font-normal">All</th>
              </tr>
            </thead>
            <tbody>
              {types.map((t) => {
                const row = s.type_status[t] ?? {};
                return (
                  <tr key={t} className="border-t">
                    <td className="py-2 pr-3 text-muted-foreground">
                      {TYPE_LABELS[t]}
                    </td>
                    {statuses.map((st) => (
                      <td
                        key={st}
                        className="py-2 pr-3 font-mono tabular-nums"
                        style={
                          st === "auto_resolved" && (row[st] ?? 0) > 0
                            ? { color: "var(--ok)" }
                            : undefined
                        }
                      >
                        {row[st] ?? 0}
                      </td>
                    ))}
                    <td className="py-2 font-mono font-medium tabular-nums">
                      {s.by_type[t] ?? 0}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="grid gap-3">
          <div className="surface card-lift rounded-2xl p-4">
            <div className="text-[12px] font-semibold">This batch</div>
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-[12px] text-muted-foreground">
              <span>
                cases <span className="text-foreground">{s.total_cases}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                automated{" "}
                <span
                  className="text-foreground"
                  style={{
                    color: s.automation_rate > 0 ? "var(--ok)" : undefined,
                  }}
                >
                  {pct(s.automation_rate)}
                </span>
                {s.automation_rate === 0 ? (
                  <InfoHint>
                    0% automated is the derived policy working as measured: on
                    this tier only billing disputes cleared the pre-registered
                    95% precision bar for auto-handling, and that branch always
                    ends with a human by design. Restraint is the configured
                    behaviour.
                  </InfoHint>
                ) : null}
              </span>
              <span>
                review{" "}
                <span className="text-foreground">{pct(s.review_rate)}</span>
              </span>
              <span>
                SLA breaches{" "}
                <span className="text-foreground">{s.sla_breach_count}</span>
              </span>
            </div>
          </div>

          <div className="surface card-lift rounded-2xl p-4">
            <div className="flex items-center gap-1.5 text-[12px] font-semibold">
              Decision source
              <InfoHint>
                Every case records which tier decided it. Rows decided by the
                deterministic keyword floor are capped at 0.60 confidence and
                always route to a human.
              </InfoHint>
            </div>
            <div className="mt-3 space-y-2.5">
              {Object.entries(s.by_decision_source).map(([src, n]) => {
                const share = s.total_cases ? (n ?? 0) / s.total_cases : 0;
                return (
                  <div key={src}>
                    <div className="flex justify-between font-mono text-[11px]">
                      <span className="text-muted-foreground">
                        {SOURCE_LABELS[src as keyof typeof SOURCE_LABELS] ??
                          src}
                      </span>
                      <span>{n}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${share * 100}%`,
                          background: "var(--primary)",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
