"use client";

import { useEffect, useMemo, useState } from "react";
import type { DemoData, Case, RequestType } from "@/lib/types";
import { TYPE_LABELS } from "@/lib/types";
import {
  DATASETS,
  DESK_DATASETS,
  type DatasetKey,
  type DatasetMeta,
} from "@/lib/data";
import Link from "next/link";
import QueueRow from "./queue-row";
import CaseDetail from "./case-detail";
import InfoHint from "./info-hint";

type TypeFilter = RequestType | "all";
type StatusFilter =
  | "any"
  | "review"
  | "auto"
  | "queued"
  | "escalated"
  | "duplicate";

export function DatasetToggle({
  dataset,
  onChange,
  hintPlacement = "bottom-right",
  options = DATASETS,
}: {
  dataset: DatasetKey;
  onChange: (k: DatasetKey) => void;
  options?: DatasetMeta[];
  hintPlacement?:
    | "bottom"
    | "bottom-right"
    | "left"
    | "right"
    | "top"
    | "top-right";
}) {
  const meta = options.find((d) => d.key === dataset);
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center rounded-full bg-secondary p-0.5">
        {options.map((d) => (
          <button
            key={d.key}
            onClick={() => onChange(d.key)}
            className={`rounded-full px-2.5 py-1 text-[11px] ${
              dataset === d.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground"
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>
      <InfoHint placement={hintPlacement}>
        <span className="font-mono text-[10.5px]">{meta?.tier}</span>
        <br />
        {meta?.note}
      </InfoHint>
    </div>
  );
}

export default function Console({
  all,
  onReviewed,
}: {
  all: Record<DatasetKey, DemoData>;
  onReviewed?: (updated: Case) => void;
}) {
  const [dataset, setDataset] = useState<DatasetKey>("dev200");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("any");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const data = all[dataset];

  // The live tier starts empty and stays empty until something is processed
  // through it — unlike the baked batches, which ship with the deploy. That is
  // a normal state, not a filter that hid everything, so it gets its own copy.
  const liveEmpty = dataset === "live" && data.cases.length === 0;

  // Counts are computed over the type-filtered slice, so the status group
  // always answers "how much of what I'm looking at did the machine close".
  const byType = useMemo(
    () =>
      data.cases.filter(
        (c) => typeFilter === "all" || c.request_type === typeFilter
      ),
    [data.cases, typeFilter]
  );

  const reviewCount = useMemo(
    () => byType.filter((c) => c.requires_review).length,
    [byType]
  );
  const autoCount = useMemo(
    () => byType.filter((c) => c.status === "auto_resolved").length,
    [byType]
  );
  const queuedCount = useMemo(
    () => byType.filter((c) => c.status === "awaiting_human").length,
    [byType]
  );
  const escalatedCount = useMemo(
    () => byType.filter((c) => c.status === "escalated").length,
    [byType]
  );
  // Resends caught by the content fingerprint before any model call.
  // Zero on the baked batches, which is why the chip is conditional.
  const duplicateCount = useMemo(
    () => byType.filter((c) => c.status === "duplicate").length,
    [byType]
  );

  const filtered = useMemo(
    () =>
      byType.filter((c) =>
        statusFilter === "review"
          ? c.requires_review
          : statusFilter === "auto"
            ? c.status === "auto_resolved"
            : statusFilter === "queued"
              ? c.status === "awaiting_human"
              : statusFilter === "escalated"
                ? c.status === "escalated"
                : statusFilter === "duplicate"
                  ? c.status === "duplicate"
                  : true
      ),
    [byType, statusFilter]
  );

  useEffect(() => {
    if (!filtered.some((c) => c.case_id === selectedId)) {
      setSelectedId(filtered[0]?.case_id ?? null);
    }
  }, [filtered, selectedId]);

  const selected: Case | null =
    filtered.find((c) => c.case_id === selectedId) ?? null;

  const types = Object.keys(TYPE_LABELS) as RequestType[];

  const chip = (active: boolean) =>
    `rounded-full px-2.5 py-1 text-[11px] ${
      active
        ? "bg-primary text-primary-foreground"
        : "bg-secondary text-muted-foreground hover:text-foreground"
    }`;

  return (
    <div className="grid h-[calc(100dvh-64px)] grid-cols-[300px_minmax(0,1fr)] lg:grid-cols-[340px_minmax(0,1fr)]">
      {/* ---- queue pane ------------------------------------------------- */}
      <aside className="flex min-h-0 flex-col border-r">
        {/* type */}
        <div className="flex flex-wrap items-center gap-1.5 px-4 pt-4">
          <button
            onClick={() => setTypeFilter("all")}
            className={chip(typeFilter === "all")}
          >
            All
          </button>
          {types.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={chip(typeFilter === t)}
            >
              {TYPE_LABELS[t].split(" ")[0]}
            </button>
          ))}
        </div>

        {/* outcome — its own group, with counts, so auto-resolved work is
            visible rather than buried at the bottom of a review-first queue */}
        {/* Outcome. The three partition chips sum to the batch; the flag is a
            separate axis on its own line, because a case can be queued AND
            flagged and a single row of chips reads as if they were exclusive.
            The hint opens sideways into the detail pane - the sidebar is too
            narrow to hold a panel, and a bottom-anchored one grows off-screen. */}
        <div
          className="mt-3 border-t px-4 pb-2.5 pt-2.5"
          style={{ borderColor: "var(--border-accent)" }}
        >
          <div className="flex items-center gap-1">
            <span className="inline-flex items-center gap-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground/70">
              Outcome
              <InfoHint placement="side">
                Auto, queued, escalated and duplicate partition the batch —
                every case is in exactly one. Flagged cuts across them: the
                classification itself was uncertain. A queued case is not a
                failure; the branch prepared the work and a person finishes it.
                A duplicate was suppressed by content fingerprint before any
                model call, so it cost nothing to receive.
              </InfoHint>
            </span>
            <span className="ml-auto font-mono text-[10px] text-muted-foreground/70">
              {filtered.length}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <button
              onClick={() =>
                setStatusFilter((v) => (v === "auto" ? "any" : "auto"))
              }
              title="Closed by the system with a grounded answer, no human involved"
              className={chip(statusFilter === "auto")}
              style={
                statusFilter === "auto"
                  ? {
                      background: "var(--ok)",
                      color: "var(--primary-foreground)",
                    }
                  : undefined
              }
            >
              Auto {autoCount}
            </button>
            <button
              onClick={() =>
                setStatusFilter((v) => (v === "queued" ? "any" : "queued"))
              }
              title="Branch ran and prepared the work; an associate completes it"
              className={chip(statusFilter === "queued")}
            >
              Queued {queuedCount}
            </button>
            {duplicateCount > 0 ? (
              <button
                onClick={() =>
                  setStatusFilter((v) =>
                    v === "duplicate" ? "any" : "duplicate"
                  )
                }
                title="Resend caught by content fingerprint before any model call"
                className={chip(statusFilter === "duplicate")}
              >
                Duplicate {duplicateCount}
              </button>
            ) : null}
            <button
              onClick={() =>
                setStatusFilter((v) => (v === "escalated" ? "any" : "escalated"))
              }
              title="Automation paused and handed to a specialist"
              className={chip(statusFilter === "escalated")}
            >
              Escalated {escalatedCount}
            </button>
          </div>

          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-muted-foreground/50">
              Flag
            </span>
            <button
              onClick={() =>
                setStatusFilter((v) => (v === "review" ? "any" : "review"))
              }
              title="Classification was uncertain — a person checks the label"
              className={chip(statusFilter === "review")}
            >
              Uncertain {reviewCount}
            </button>
          </div>
        </div>

        <div className="pane min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
          {filtered.length === 0 ? (
            <p className="px-3 pt-6 text-center text-[12px] leading-relaxed text-muted-foreground">
              {liveEmpty
                ? "Nothing processed on this tier yet."
                : statusFilter === "auto"
                  ? "Nothing auto-resolved here — on the held-out tier the derived policy automates nothing, by design."
                  : "No cases match. Clear a filter."}
            </p>
          ) : (
            filtered.map((c) => (
              <QueueRow
                key={c.case_id}
                c={c}
                selected={c.case_id === selectedId}
                onSelect={() => setSelectedId(c.case_id)}
              />
            ))
          )}
        </div>

        <div
          className="border-t px-4 py-2.5"
          style={{ borderColor: "var(--border-accent)" }}
        >
          <DatasetToggle
            options={DESK_DATASETS}
            dataset={dataset}
            onChange={setDataset}
            hintPlacement="right"
          />
        </div>
      </aside>

      {/* ---- detail pane ------------------------------------------------ */}
      <section className="min-h-0 p-5">
        {selected ? (
          <div key={selected.case_id} className="h-full">
            <CaseDetail
              c={selected}
              // Only live cases exist in the store, so only live cases can be
              // acted on. A button on a baked export could not write anything
              // — it would be a demo of a feature rather than the feature.
              reviewable={dataset === "live"}
              onReviewed={onReviewed}
            />
          </div>
        ) : liveEmpty ? (
          <div className="max-w-[44ch] pt-8">
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              Live queue
            </div>
            <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
              Nothing processed yet. Run a request through{" "}
              <Link
                href="/live"
                className="text-foreground underline decoration-dotted underline-offset-4 transition-colors hover:decoration-solid"
              >
                Live
              </Link>{" "}
              and it lands here as a real case — open it, review it, correct it.
            </p>
          </div>
        ) : (
          <p className="pt-8 text-[13px] text-muted-foreground">
            Select a case from the queue.
          </p>
        )}
      </section>
    </div>
  );
}
