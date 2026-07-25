import type { DemoData } from "./types";

// Two baked datasets, one per model tier. The toggle between them is the
// tiering argument made operable: the 8B bulk tier automates a third of
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

async function fetchOne(file: string): Promise<DemoData> {
  const res = await fetch(file, { cache: "force-cache" });
  if (!res.ok) throw new Error(`Failed to load ${file} (${res.status})`);
  return (await res.json()) as DemoData;
}

export async function loadAllDatasets(): Promise<Record<DatasetKey, DemoData>> {
  const [dev200, test100] = await Promise.all([
    fetchOne("/demo-dev200.json"),
    fetchOne("/demo-test100.json"),
  ]);
  return { dev200, test100 };
}
