"use client";

import { useEffect, useMemo, useState } from "react";
import {
  emptyDataset,
  loadBakedDatasets,
  loadLiveDataset,
  type BakedKey,
  type DatasetKey,
} from "@/lib/data";
import type { DemoData } from "@/lib/types";
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
      <Console all={all} />
    </main>
  );
}
