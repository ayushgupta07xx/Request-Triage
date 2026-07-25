import type { DemoData } from "./types";

// Load the baked demo dataset. It is served as a static asset from public/,
// so this is a single same-origin fetch of a CDN-cached file -- the cold open
// stays fast, and re-pointing at a new run (corpus_test70_v2) is just a
// re-export of demo.json with no rebuild.
export async function loadDemoData(): Promise<DemoData> {
  const res = await fetch("/demo.json", { cache: "force-cache" });
  if (!res.ok) {
    throw new Error(`Failed to load demo.json (${res.status})`);
  }
  return (await res.json()) as DemoData;
}
