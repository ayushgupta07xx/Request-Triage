"use client";

import { useEffect, useState } from "react";
import { loadAllDatasets, type DatasetKey } from "@/lib/data";
import type { DemoData } from "@/lib/types";
import Console from "@/components/console";

export default function DeskPage() {
  const [all, setAll] = useState<Record<DatasetKey, DemoData> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAllDatasets()
      .then(setAll)
      .catch((e) => setError(e.message ?? "Could not load data."));
  }, []);

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
      <main className="grid h-[calc(100dvh-53px)] place-items-center">
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
