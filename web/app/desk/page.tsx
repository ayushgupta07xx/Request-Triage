"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  emptyDataset,
  invalidateLiveDataset,
  loadBakedDatasets,
  loadLiveDataset,
  type BakedKey,
  type DatasetKey,
} from "@/lib/data";
import type { Case, DemoData } from "@/lib/types";
import Console from "@/components/console";

export default function DeskPage() {
  const [baked, setBaked] = useState<Record<BakedKey, DemoData> | null>(null);
  // The Live tab is present from the first frame and starts empty, so nothing
  // shifts when its data lands. The alternative — revealing the tab only once
  // loaded — moves the toggle under the cursor and hides the feature from
  // anyone who never waits.
  const [live, setLive] = useState<DemoData>(() => emptyDataset("live"));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    // First paint depends only on the baked batches: immutable per deploy and
    // served from /public, so usually a cache hit after the landing page.
    loadBakedDatasets()
      .then((d) => alive && setBaked(d))
      .catch((e) => alive && setError(e.message ?? "Could not load data."));

    // Live is background work by design. dev200 is the open tab on load, so
    // blocking the queue on a serverless cold start plus a round trip to Turso
    // bought nothing — it only delayed the page a reviewer is actually reading.
    loadLiveDataset().then((d) => alive && setLive(d));

    return () => {
      alive = false;
    };
  }, []);

  // A reviewed case is replaced in place. Every partition chip recomputes from
  // cases[], so Queued / Escalated / Review update on the next frame. The
  // `summary` block (automation rate, SLA breaches) still reflects the last
  // fetch and self-heals when the 30s TTL expires — recomputing it here would
  // reimplement build_dataset in TypeScript and give the dashboard two sources
  // of truth for the same numbers.
  const onReviewed = useCallback((updated: Case) => {
    setLive((prev) => ({
      ...prev,
      cases: prev.cases.map((c) =>
        c.case_id === updated.case_id ? updated : c
      ),
    }));
    invalidateLiveDataset();
  }, []);

  const all = useMemo(
    () =>
      baked ? ({ ...baked, live } as Record<DatasetKey, DemoData>) : null,
    [baked, live]
  );

  if (error) {
    return (
      <main className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-lg font-bold">The queue could not load</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          {error} Regenerate the baked batches with{" "}
          <code className="font-mono">scripts/export_demo.py</code> into{" "}
          <code className="font-mono">web/public/</code>, then reload.
        </p>
      </main>
    );
  }

  if (!all) {
    return (
      <main className="grid h-[calc(100dvh-64px)] place-items-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      </main>
    );
  }

  return (
    <main className="page-enter">
      <Console all={all} onReviewed={onReviewed} />
    </main>
  );
}
