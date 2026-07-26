"use client";

import { useEffect, useState } from "react";
import { loadBakedDatasets, type BakedKey, type DatasetKey } from "@/lib/data";
import type { DemoData } from "@/lib/types";
import Performance from "@/components/performance";
import { DatasetToggle } from "@/components/console";

export default function PerformancePage() {
  // Only the measured batches. Live cases carry no ground-truth labels, so
  // accuracy is undefined for them — putting them on a page of scored metrics
  // would imply they had been graded. The toggle here never offers Live, and
  // this page never fetches it.
  const [all, setAll] = useState<Record<BakedKey, DemoData> | null>(null);
  const [dataset, setDataset] = useState<BakedKey>("test100");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadBakedDatasets()
      .then((d) => alive && setAll(d))
      .catch((e) => alive && setError(e.message ?? "Could not load data."));
    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return (
      <main className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-lg font-bold">Performance could not load</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          {error} Regenerate the baked batches with{" "}
          <code className="font-mono">scripts/export_demo.py</code>, then
          reload.
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

  // No page heading: the nav already names this page, and the desk does not
  // repeat its own name either. The dataset toggle rides on the results
  // eyebrow instead of owning a row of its own.
  return (
    <main className="page-enter mx-auto max-w-6xl px-6 py-8">
      <Performance
        data={all[dataset]}
        toolbar={
          <DatasetToggle
            dataset={dataset}
            onChange={(k: DatasetKey) => {
              if (k !== "live") setDataset(k);
            }}
          />
        }
      />
    </main>
  );
}
