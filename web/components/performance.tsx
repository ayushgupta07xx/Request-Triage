"use client";

import type { DemoData, RequestType, CaseStatus } from "@/lib/types";
import { TYPE_LABELS, STATUS_LABELS, SOURCE_LABELS } from "@/lib/types";
import { HEADLINE, SECONDARY, EVAL_NOTE } from "@/lib/metrics";
import InfoHint from "./info-hint";

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

// Status split for the This-batch bar: table order, one colour per terminal
// state. Awaiting-human is the neutral bulk; auto-resolved is the only
// segment that earns the accent; escalated borrows the high-urgency amber
// (escalations here are overwhelmingly the hardship guardrail firing);
// duplicates sit at border-grey — they cost nothing, so they barely show.
const STATUS_SPLIT: { key: CaseStatus; color: string }[] = [
  { key: "awaiting_human", color: "var(--muted-foreground)" },
  { key: "auto_resolved", color: "var(--ok)" },
  { key: "escalated", color: "var(--u-high)" },
  { key: "duplicate", color: "var(--border)" },
];

// Numbers first, provenance on the face. Each headline card carries one line
// of provenance — sample size or interval — so a screenshot of the grid is
// self-certifying without any card outgrowing its neighbours. Contrast does
// the work everywhere else: connective words muted, identifiers at full
// strength. The hints that remain are the ones carrying an argument, not the
// ones carrying a number.
export default function Performance({ data }: { data: DemoData }) {
  const s = data.summary;
  const types = Object.keys(TYPE_LABELS) as RequestType[];
  const statuses = Object.keys(STATUS_LABELS) as CaseStatus[];

  return (
    <div>
      {/* ---- held-out results ------------------------------------------- */}
      <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em]">
        <span className="text-foreground">Held out</span>
        <span className="text-muted-foreground">
          · executed once, scored once
        </span>
        <InfoHint>{EVAL_NOTE}</InfoHint>
      </div>

      <div className="rise mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {HEADLINE.map((m) => (
          <div key={m.label} className="surface card-lift rounded-2xl p-5">
            <div className="text-[11px] text-muted-foreground">{m.label}</div>
            <div className="mt-2 text-[32px] font-bold leading-none tracking-tight">
              {m.value}
            </div>
            {m.caption ? (
              <div className="mt-2 whitespace-nowrap font-mono text-[10px] text-muted-foreground opacity-70">
                {m.caption}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {/* secondary metrics: an even three-up strip, not leftover text */}
      <div className="rise2 mt-4 grid grid-cols-3 divide-x divide-border">
        {SECONDARY.map((m) => (
          <div key={m.label} className="px-4 text-center">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {m.label}
            </div>
            <div className="mt-1 font-mono text-[13px] text-foreground">
              {m.value}
            </div>
            {m.caption ? (
              <div className="mt-0.5 font-mono text-[10px] text-muted-foreground opacity-70">
                {m.caption}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {/* ---- loaded batch ----------------------------------------------- */}
      <div className="mt-10 flex items-center gap-2 font-mono text-[10px] tracking-[0.16em]">
        <span className="uppercase text-muted-foreground">Loaded batch ·</span>
        <span className="tracking-normal text-foreground">
          {data.generated_from}
        </span>
      </div>

      <div className="rise3 mt-3 grid gap-3 lg:grid-cols-2">
        <div className="surface card-lift rounded-2xl p-5">
          <div className="text-[12px] font-semibold">
            Volume by type and status
          </div>
          <table className="mt-3 w-full text-[12px]">
            <thead>
              <tr className="text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground/80">
                <th className="pb-2 pr-3 font-normal">Type</th>
                {statuses.map((st) => (
                  <th key={st} className="pb-2 pl-3 text-right font-normal">
                    {STATUS_LABELS[st]}
                  </th>
                ))}
                <th className="pb-2 pl-3 text-right font-normal">All</th>
              </tr>
            </thead>
            <tbody>
              {types.map((t) => {
                const row = s.type_status[t] ?? {};
                return (
                  <tr key={t} className="border-t">
                    <td className="py-2 pr-3">{TYPE_LABELS[t]}</td>
                    {statuses.map((st) => {
                      const v = row[st] ?? 0;
                      return (
                        <td
                          key={st}
                          className="py-2 pl-3 text-right font-mono tabular-nums"
                          style={{
                            color:
                              st === "auto_resolved" && v > 0
                                ? "var(--ok)"
                                : undefined,
                            opacity: v === 0 ? 0.35 : 1,
                          }}
                        >
                          {v}
                        </td>
                      );
                    })}
                    <td className="py-2 pl-3 text-right font-mono font-medium tabular-nums">
                      {s.by_type[t] ?? 0}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="grid gap-3">
          <div className="surface card-lift rounded-2xl p-5">
            <div className="text-[12px] font-semibold">This batch</div>
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 font-mono text-[12px] text-muted-foreground">
              <span>
                cases <span className="text-foreground">{s.total_cases}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                auto-resolved{" "}
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
                    0% auto-resolved is the derived policy working as measured:
                    on this tier only billing disputes cleared the
                    pre-registered 95% precision bar for auto-handling, and
                    that branch always ends with a human by design. Restraint
                    is the configured behaviour.
                  </InfoHint>
                ) : null}
              </span>
              <span>
                uncertain{" "}
                <span className="text-foreground">{pct(s.review_rate)}</span>
              </span>
              <span>
                SLA breaches{" "}
                <span className="text-foreground">{s.sla_breach_count}</span>
              </span>
            </div>

            {/* the batch's shape: every case lands in exactly one segment */}
            <div className="mt-5">
              <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                {STATUS_SPLIT.map(({ key, color }) => {
                  const n = s.by_status[key] ?? 0;
                  if (n === 0) return null;
                  return (
                    <div
                      key={key}
                      style={{
                        width: `${(n / (s.total_cases || 1)) * 100}%`,
                        background: color,
                      }}
                    />
                  );
                })}
              </div>
              {/* spread edge to edge so the first and last markers line up
                  with the ends of the bar they index */}
              <div className="mt-2.5 flex items-center justify-between font-mono text-[10px] text-muted-foreground">
                {STATUS_SPLIT.map(({ key, color }) => {
                  const n = s.by_status[key] ?? 0;
                  return (
                    <span
                      key={key}
                      className="inline-flex items-center gap-1.5 whitespace-nowrap"
                      style={{ opacity: n === 0 ? 0.45 : 1 }}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: color }}
                      />
                      {STATUS_LABELS[key]} {n}
                    </span>
                  );
                })}
              </div>
              <div className="mt-4 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground opacity-70">
                100% classified, branched and executed
              </div>
            </div>
          </div>

          <div className="surface card-lift rounded-2xl p-5">
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
