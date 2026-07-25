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
//
// Loading is per page, not all-at-once. An earlier version fetched everything
// everywhere, which put a serverless cold start and a round trip to Turso on
// the critical path of the landing page — a page that needs four cards from
// one batch and cannot display a live case at all.

export type DatasetKey = "dev200" | "test100" | "live";
export type BakedKey = "dev200" | "test100";

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

// No explicit cache directive on the fetch itself. `force-cache` here meant the
// browser served a stale copy after every re-export and ignored a hard reload,
// because an in-Request cache mode overrides the reload — the batch data would
// silently lag the pipeline. Static JSON under /public gets sane headers from
// the host; let those decide.
async function fetchOne(file: string): Promise<DemoData> {
  const res = await fetch(file);
  if (!res.ok) throw new Error(`Failed to load ${file} (${res.status})`);
  return (await res.json()) as DemoData;
}

// The baked batches are immutable for the life of a deploy, so the second visit
// to a page should not pay for them again. Caching the *promise* rather than
// the result also collapses two components asking at once into one request.
// A rejection evicts itself, so a failed load is retried rather than remembered.
const bakedCache = new Map<string, Promise<DemoData>>();

function fetchBaked(file: string): Promise<DemoData> {
  const hit = bakedCache.get(file);
  if (hit) return hit;
  const pending = fetchOne(file).catch((err) => {
    bakedCache.delete(file);
    throw err;
  });
  bakedCache.set(file, pending);
  return pending;
}

/** One baked dataset. Used by the landing page, which needs a single batch. */
export function loadDataset(key: BakedKey): Promise<DemoData> {
  const meta = DATASETS.find((d) => d.key === key);
  if (!meta) return Promise.reject(new Error(`unknown dataset ${key}`));
  return fetchBaked(meta.file);
}

/** Both measured batches, raced. Used by the desk and the performance page. */
export async function loadBakedDatasets(): Promise<Record<BakedKey, DemoData>> {
  const entries = await Promise.all(
    DATASETS.map(async (d) => [d.key, await fetchBaked(d.file)] as const)
  );
  return Object.fromEntries(entries) as Record<BakedKey, DemoData>;
}

/**
 * The live set. Never cached — visitors add to it — and never throws: no
 * endpoint (local dev without uvicorn), no database, or a transport failure
 * all resolve to an empty dataset. Callers treat it as background work.
 */
export async function loadLiveDataset(): Promise<DemoData> {
  try {
    return await fetchOne(LIVE_DATASET.file);
  } catch {
    return emptyDataset("live (unavailable)");
  }
}

/** Warm the baked cache without blocking anything. */
export function prefetchBakedDatasets(): void {
  void loadBakedDatasets().catch(() => {});
}
