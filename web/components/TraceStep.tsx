import type { TraceStep as Step } from "@/lib/types";

// One executed step. Shows the action, its outcome, the human-readable
// summary, and -- when the step produced one -- the composite artifact (e.g.
// the drafted acknowledgement). Artifacts are the "legible to a Tier-1
// associate" output the brief asks for: never a JSON dump.
export default function TraceStep({ step, index }: { step: Step; index: number }) {
  const failed = step.outcome && step.outcome !== "succeeded";
  return (
    <li className="border-l-2 border-[var(--line)] pl-3">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-[var(--muted)] tabular-nums">{index + 1}.</span>
        <span className="font-medium">{step.action}</span>
        {step.outcome ? (
          <span
            className={
              failed
                ? "text-xs text-red-600"
                : "text-xs text-[var(--muted)]"
            }
          >
            {step.outcome}
          </span>
        ) : null}
        {step.target ? (
          <span className="text-xs text-[var(--muted)]">→ {step.target}</span>
        ) : null}
      </div>

      {step.summary ? (
        <p className="mt-0.5 text-xs text-[var(--muted)]">{step.summary}</p>
      ) : null}

      {step.artifact ? (
        <pre className="mt-1 whitespace-pre-wrap rounded bg-[var(--surface)] p-2 text-xs">
          {step.artifact}
        </pre>
      ) : null}

      {step.error ? (
        <p className="mt-0.5 text-xs text-red-600">{step.error}</p>
      ) : null}
    </li>
  );
}
