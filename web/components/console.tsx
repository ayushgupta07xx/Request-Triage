"use client";

import { useEffect, useMemo, useState } from "react";
import type { DemoData, Case, RequestType } from "@/lib/types";
import { TYPE_LABELS } from "@/lib/types";
import { DATASETS, type DatasetKey } from "@/lib/data";
import QueueRow from "./queue-row";
import CaseDetail from "./case-detail";
import InfoHint from "./info-hint";

type TypeFilter = RequestType | "all";
type StatusFilter = "any" | "review" | "auto" | "queued" | "escalated";

export function DatasetToggle({
  dataset,
  onChange,
  hintPlacement = "bottom-right",
}: {
  dataset: DatasetKey;
  onChange: (k: DatasetKey) => void;
  hintPlacement?:
    | "bottom"
    | "bottom-right"
    | "left"
    | "right"
    | "top"
    | "top-right";
}) {
  const meta = DATASETS.find((d) => d.key === dataset);
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center rounded-full bg-secondary p-0.5">
        {DATASETS.map((d) => (
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
}: {
  all: Record<DatasetKey, DemoData>;
}) {
  const [dataset, setDataset] = useState<DatasetKey>("dev200");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("any");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const data = all[dataset];

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
                Auto, queued and escalated partition the batch — every case is
                in exactly one. Flagged cuts across them: the classification
                itself was uncertain. A queued case is not a failure; the branch
                prepared the work and a person finishes it.
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
              {statusFilter === "auto"
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
            <CaseDetail c={selected} />
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
