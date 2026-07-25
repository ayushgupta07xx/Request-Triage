"use client";

import { useMemo, useState } from "react";
import type { Case, RequestType, CaseStatus } from "@/lib/types";
import { TYPE_LABELS, STATUS_LABELS } from "@/lib/types";
import CaseCard from "./CaseCard";

type TypeFilter = RequestType | "all";
type StatusFilter = CaseStatus | "all";

export default function CaseList({ cases }: { cases: Case[] }) {
  const [type, setType] = useState<TypeFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [reviewOnly, setReviewOnly] = useState(false);

  const filtered = useMemo(
    () =>
      cases.filter(
        (c) =>
          (type === "all" || c.request_type === type) &&
          (status === "all" || c.status === status) &&
          (!reviewOnly || c.requires_review)
      ),
    [cases, type, status, reviewOnly]
  );

  const types = Object.keys(TYPE_LABELS) as RequestType[];
  const statuses = Object.keys(STATUS_LABELS) as CaseStatus[];

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <label className="text-[var(--muted)]">
          Type{" "}
          <select
            value={type}
            onChange={(e) => setType(e.target.value as TypeFilter)}
            className="rounded border border-[var(--line)] bg-[var(--bg)] px-1 py-0.5"
          >
            <option value="all">All</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>

        <label className="text-[var(--muted)]">
          Status{" "}
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className="rounded border border-[var(--line)] bg-[var(--bg)] px-1 py-0.5"
          >
            <option value="all">All</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1 text-[var(--muted)]">
          <input
            type="checkbox"
            checked={reviewOnly}
            onChange={(e) => setReviewOnly(e.target.checked)}
          />
          Review queue only
        </label>

        <span className="ml-auto text-xs text-[var(--muted)]">
          {filtered.length} of {cases.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          No cases match these filters.
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => (
            <CaseCard key={c.case_id} c={c} />
          ))}
        </div>
      )}
    </section>
  );
}
