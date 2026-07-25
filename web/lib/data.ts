import type { DemoData } from "./types";

// Three datasets, but not three of a kind.
//
// dev200 and test100 are *measured* batches: fixed splits with ground-truth
// labels, which is what makes accuracy meaningful for them. The toggle between
// those two is the tiering argument made operable — the 8B bulk tier grounds
// and closes half of enquiry volume and shows visible keyword-floor
// degradation, while the 70B quality tier is more accurate and, on the derived
// per-class gate, declines to automate anything at all.
//
// "live" is different in kind: cases a visitor created, persisted to libSQL,
// with no labels attached. Accuracy is undefined for it, which is why the
// performance page keeps using DATASETS (the measured pair) while the desk
// uses DESK_DATASETS. Showing Live on a page of scored metrics would imply we
// can grade it. We cannot.

export type DatasetKey = "dev200" | "test100" | "live";

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

export const LIVE_DATASET: DatasetMeta = {
  key: "live",
  label: "Live",
  tier: "whichever tier answered",
  file: "/api/cases",
  note: "Seeded with three examples, then whatever anyone processes on the Live page — persisted to libSQL and shared across visitors. No ground-truth labels, so these are never scored.",
};

// The desk shows everything; the performance page shows only what can be scored.
export const DESK_DATASETS: DatasetMeta[] = [...DATASETS, LIVE_DATASET];

export function emptyDataset(from = "live"): DemoData {
  return {
    generated_from: from,
    schema_version: 1,
    summary: {
      total_cases: 0,
      automation_rate: 0,
      review_rate: 0,
      sla_breach_count: 0,
      sla_reference: null,
      by_type: {},
      by_status: {},
      by_urgency: {},
      by_decision_source: {},
      type_status: {},
      usage_total_tokens: 0,
    },
    cases: [],
  } as unknown as DemoData;
}

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
  const baked = await Promise.all(
    DATASETS.map(async (d) => [d.key, await fetchOne(d.file)] as const)
  );

  // The live set must never take the page down with it: no endpoint (local dev
  // without uvicorn), no database, or a transport failure all resolve to an
  // empty dataset. Every key is always present, so callers can index without
  // guarding.
  let live: DemoData;
  try {
    live = await fetchOne(LIVE_DATASET.file);
  } catch {
    live = emptyDataset("live (unavailable)");
  }

  return Object.fromEntries([...baked, ["live", live] as const]) as Record<
    DatasetKey,
    DemoData
  >;
}
