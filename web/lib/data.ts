import type { DemoData } from "./types";

// Two baked datasets, one per model tier. The toggle between them is the
// tiering argument made operable: the 8B bulk tier grounds and closes half of
// enquiry volume and shows visible keyword-floor degradation, while the 70B
// quality tier is more accurate and — on the derived per-class gate — declines
// to automate anything at all. Same code, same branches, different deciding
// model.

export type DatasetKey = "dev200" | "test100";

export interface DatasetMeta {
  key: DatasetKey;
  label: string;
  tier: string;
  file: string;
  note: string;
}

export const DATASETS: DatasetMeta[] = [
  {
    key: "dev200",
    label: "Development batch",
    tier: "llama-3.1-8b-instant",
    file: "/demo-dev200.json",
    note: "200 cases · bulk tier · includes rows that fell to the deterministic floor",
  },
  {
    key: "test100",
    label: "Held-out test",
    tier: "llama-3.3-70b-versatile",
    file: "/demo-test100.json",
    note: "100 cases · quality tier · executed once, single-tier provenance verified",
  },
];

// No explicit cache directive. `force-cache` here meant the browser served a
// stale copy after every re-export and ignored a hard reload, because an
// in-Request cache mode overrides the reload — the batch data would silently
// lag the pipeline. Static JSON under /public gets sane headers from the host;
// let those decide.
async function fetchOne(file: string): Promise<DemoData> {
  const res = await fetch(file);
  if (!res.ok) throw new Error(`Failed to load ${file} (${res.status})`);
  return (await res.json()) as DemoData;
}

export async function loadAllDatasets(): Promise<Record<DatasetKey, DemoData>> {
  // Paths come from DATASETS so there is one place to change them.
  const entries = await Promise.all(
    DATASETS.map(async (d) => [d.key, await fetchOne(d.file)] as const)
  );
  return Object.fromEntries(entries) as Record<DatasetKey, DemoData>;
}
