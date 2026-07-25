"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadDataset, prefetchBakedDatasets } from "@/lib/data";
import type { DemoData } from "@/lib/types";
import CaseCarousel, { HandoffBar } from "@/components/case-carousel";

export default function Landing() {
  const [dev, setDev] = useState<DemoData | null>(null);

  useEffect(() => {
    let alive = true;
    // The carousel shows four cards from one batch. It used to wait on every
    // dataset including a serverless round trip to Turso, which is why the
    // animation appeared a beat late on a page that cannot display a live case.
    loadDataset("dev200")
      .then((d) => alive && setDev(d))
      .catch(() => alive && setDev(null));
    // Warm the desk's data while the visitor reads the hero, so "Open the desk"
    // lands on a cache hit. dev200 is shared, so this costs one extra request.
    prefetchBakedDatasets();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="relative flex min-h-[calc(100dvh-64px)] flex-col">
      <main className="page-enter mx-auto grid w-full max-w-7xl flex-1 items-center gap-14 px-8 py-12 lg:grid-cols-[1fr_1fr]">
        {/* ---- left: thesis ---------------------------------------------- */}
        <div>
          <div className="rise font-mono text-[11px] uppercase tracking-[0.18em] text-primary">
            Bounded-autonomy request processing
          </div>
          <h1 className="rise mt-4 text-balance text-[44px] font-bold leading-[1.06] tracking-tight sm:text-[56px]">
            The model decides.
            <br />
            The state machine executes.
          </h1>
          <p className="rise2 mt-5 max-w-[52ch] text-[15px] leading-relaxed text-muted-foreground">
            Handoff works a lending desk&apos;s shared inbox — classifies,
            extracts, drafts and routes every request — and hands anything
            uncertain to a human.
          </p>

          <div className="rise2 mt-7 flex flex-wrap items-center gap-3">
            <Link
              href="/desk"
              className="lift rounded-full bg-primary px-5 py-2.5 text-[14px] font-semibold text-primary-foreground"
              style={{ boxShadow: "var(--shadow-accent)" }}
            >
              Open the desk
            </Link>
            <Link
              href="/performance"
              className="lift rounded-full px-5 py-2.5 text-[14px] font-medium text-foreground"
              style={{ border: "1px solid var(--border-accent-strong)" }}
            >
              Performance
            </Link>
          </div>

          <div className="rise3 mt-12 grid max-w-md grid-cols-3 gap-6">
            {[
              ["100%", "executed end-to-end"],
              ["88.0%", "held-out accuracy"],
              ["+41 pts", "vs keyword baseline"],
            ].map(([v, l]) => (
              <div key={l}>
                <div className="text-[22px] font-bold tracking-tight">{v}</div>
                <div className="mt-0.5 font-mono text-[10px] tracking-[0.05em] text-muted-foreground">
                  {l}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ---- right: the living demo ------------------------------------ */}
        <div className="rise2">
          {dev ? (
            <>
              <CaseCarousel data={dev} />
              <HandoffBar automated={dev.summary.automation_rate} />
            </>
          ) : (
            <div
              className="h-[280px] rounded-2xl bg-card"
              style={{ border: "1px solid var(--border-accent)" }}
            />
          )}
        </div>
      </main>

      {/* ---- footer ------------------------------------------------------ */}
      <footer className="flex items-center justify-between px-7 py-5">
        <span className="select-none text-[16px] font-bold tracking-tight">
          Hand<span className="text-primary">off</span>
        </span>
        <span className="font-mono text-[11px] tracking-[0.05em] text-muted-foreground">
          © Northgate Servicing · consumer lending operations
        </span>
      </footer>
    </div>
  );
}
