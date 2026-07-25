import type { DemoData, RequestType, CaseStatus } from "@/lib/types";
import {
  TYPE_LABELS,
  STATUS_LABELS,
  SOURCE_LABELS,
} from "@/lib/types";
import StatCard from "./StatCard";
import CaseList from "./CaseList";

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

export default function Dashboard({ data }: { data: DemoData }) {
  const s = data.summary;
  const types = Object.keys(TYPE_LABELS) as RequestType[];
  const statuses = Object.keys(STATUS_LABELS) as CaseStatus[];

  const slaRef = s.sla_reference
    ? new Date(s.sla_reference).toISOString().replace("T", " ").slice(0, 16)
    : null;

  return (
    <main className="mx-auto max-w-5xl p-6">
      <header className="mb-6">
        <h1 className="text-xl font-semibold">Request Triage</h1>
        <p className="text-sm text-[var(--muted)]">
          Incoming request processing for a lending operations desk ·{" "}
          {s.total_cases} cases · source{" "}
          <code className="text-xs">{data.generated_from}</code>
        </p>
      </header>

      {/* headline metrics — the P&L language: automation, review, SLA */}
      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Cases" value={s.total_cases} />
        <StatCard
          label="Automation rate"
          value={pct(s.automation_rate)}
          hint="auto-resolved, no human"
        />
        <StatCard
          label="Human review"
          value={pct(s.review_rate)}
          hint="held for an associate"
        />
        <StatCard
          label="SLA breaches"
          value={s.sla_breach_count}
          hint={slaRef ? `as of ${slaRef} UTC` : undefined}
        />
      </section>

      {/* volumes by type AND status — the required cross-tab */}
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold">By type and status</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--muted)]">
                <th className="border-b border-[var(--line)] py-1 pr-3">
                  Type
                </th>
                {statuses.map((st) => (
                  <th
                    key={st}
                    className="border-b border-[var(--line)] py-1 pr-3"
                  >
                    {STATUS_LABELS[st]}
                  </th>
                ))}
                <th className="border-b border-[var(--line)] py-1">Total</th>
              </tr>
            </thead>
            <tbody>
              {types.map((t) => {
                const row = s.type_status[t] ?? {};
                const total = s.by_type[t] ?? 0;
                return (
                  <tr key={t}>
                    <td className="border-b border-[var(--line)] py-1 pr-3">
                      {TYPE_LABELS[t]}
                    </td>
                    {statuses.map((st) => (
                      <td
                        key={st}
                        className="border-b border-[var(--line)] py-1 pr-3 tabular-nums"
                      >
                        {row[st] ?? 0}
                      </td>
                    ))}
                    <td className="border-b border-[var(--line)] py-1 tabular-nums font-medium">
                      {total}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* decision-source split — the reliability/provenance evidence */}
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold">Decision source</h2>
        <div className="flex flex-wrap gap-3 text-sm">
          {Object.entries(s.by_decision_source).map(([src, n]) => (
            <div
              key={src}
              className="rounded border border-[var(--line)] px-3 py-1"
            >
              <span className="text-[var(--muted)]">
                {SOURCE_LABELS[src as keyof typeof SOURCE_LABELS] ?? src}:
              </span>{" "}
              <span className="tabular-nums font-medium">{n}</span>
            </div>
          ))}
        </div>
      </section>

      {/* the cases */}
      <section>
        <h2 className="mb-2 text-sm font-semibold">Cases</h2>
        <CaseList cases={data.cases} />
      </section>
    </main>
  );
}
