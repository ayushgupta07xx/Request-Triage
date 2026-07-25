"use client";

import { useEffect, useState } from "react";
import { loadDemoData } from "@/lib/data";
import type { DemoData } from "@/lib/types";
import Dashboard from "@/components/Dashboard";

export default function Page() {
  const [data, setData] = useState<DemoData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDemoData()
      .then(setData)
      .catch((e) => setError(e.message ?? "Could not load data."));
  }, []);

  if (error) {
    // Failure as direction, not mood: say what to do next.
    return (
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="text-lg font-semibold">Could not load the dashboard</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          {error} Run{" "}
          <code className="rounded bg-[var(--surface)] px-1">
            python3 scripts/export_demo.py
          </code>{" "}
          to generate <code>web/public/demo.json</code>, then reload.
        </p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <p className="text-sm text-[var(--muted)]">Loading…</p>
      </main>
    );
  }

  return <Dashboard data={data} />;
}
