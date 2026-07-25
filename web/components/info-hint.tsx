"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// The interface shows; the hint explains only when asked.
//  * Full typography reset on the panel — a hint mounted inside an uppercase
//    mono eyebrow must not inherit any of that.
//  * Accent-tinted surface, accent hairline, accent shadow: part of the brand
//    skin, flips with the mode like everything else.
//  * Measured against its nearest CLIPPING ANCESTOR, not the viewport — inside
//    the desk, a chapter's own scroll container is what cuts a panel off long
//    before the window edge does.
//  * "side" opens into the empty column beside the text, wider, and is clamped
//    vertically so it can never run off the top or bottom of the chapter.

type Placement =
  | "bottom"
  | "bottom-right"
  | "left"
  | "right"
  | "top"
  | "top-right"
  | "side"
  | "side-left";

const MARGIN = 10;

/** Nearest ancestor that clips overflow; falls back to the viewport. */
function clipBounds(el: HTMLElement): {
  top: number;
  bottom: number;
  left: number;
  right: number;
} {
  let node: HTMLElement | null = el.parentElement;
  while (node) {
    const cs = window.getComputedStyle(node);
    if (
      /(auto|scroll|hidden|clip)/.test(cs.overflowY) ||
      /(auto|scroll|hidden|clip)/.test(cs.overflowX)
    ) {
      const r = node.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    }
    node = node.parentElement;
  }
  return {
    top: 0,
    bottom: window.innerHeight,
    left: 0,
    right: window.innerWidth,
  };
}

export default function InfoHint({
  children,
  label = "More info",
  placement = "bottom",
}: {
  children: ReactNode;
  label?: string;
  placement?: Placement;
}) {
  const [open, setOpen] = useState(false);
  const [resolved, setResolved] = useState<Placement>(placement);
  const [shift, setShift] = useState(0);
  const [ready, setReady] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Measure once per open, then reveal. One invisible frame avoids the panel
  // visibly jumping from one side to the other.
  useEffect(() => {
    if (!open) {
      setReady(false);
      setResolved(placement);
      setShift(0);
      return;
    }
    const trigger = ref.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;

    const t = trigger.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    const clip = clipBounds(trigger);

    let next: Placement = placement;
    let dy = 0;

    if (placement === "side" || placement === "side-left") {
      const fitsRight = t.right + p.width + MARGIN <= clip.right;
      const fitsLeft = t.left - p.width - MARGIN >= clip.left;
      next =
        placement === "side"
          ? fitsRight
            ? "side"
            : fitsLeft
              ? "side-left"
              : "bottom"
          : fitsLeft
            ? "side-left"
            : fitsRight
              ? "side"
              : "bottom";

      if (next === "side" || next === "side-left") {
        // centred on the trigger, then nudged back inside the clip box
        const top = t.top + t.height / 2 - p.height / 2;
        const bottom = top + p.height;
        if (top < clip.top + MARGIN) dy = clip.top + MARGIN - top;
        else if (bottom > clip.bottom - MARGIN)
          dy = clip.bottom - MARGIN - bottom;
      }
    } else if (placement === "bottom" || placement === "bottom-right") {
      const roomBelow = clip.bottom - t.bottom;
      const roomAbove = t.top - clip.top;
      if (roomBelow < p.height + MARGIN && roomAbove > roomBelow) {
        next = placement === "bottom-right" ? "top-right" : "top";
      }
      if (
        (next === "bottom" || next === "top") &&
        t.left + p.width + MARGIN > clip.right
      ) {
        next = next === "top" ? "top-right" : "bottom-right";
      }
    } else if (placement === "right") {
      if (t.right + p.width + MARGIN > clip.right) next = "left";
    } else if (placement === "left") {
      if (t.left - p.width - MARGIN < clip.left) next = "right";
    } else if (placement === "top" || placement === "top-right") {
      const roomAbove = t.top - clip.top;
      const roomBelow = clip.bottom - t.bottom;
      if (roomAbove < p.height + MARGIN && roomBelow > roomAbove) {
        next = placement === "top-right" ? "bottom-right" : "bottom";
      }
    }

    setResolved(next);
    setShift(dy);
    setReady(true);
  }, [open, placement]);

  const isSide = resolved === "side" || resolved === "side-left";

  const pos =
    resolved === "side"
      ? "left-full top-1/2 ml-3"
      : resolved === "side-left"
        ? "right-full top-1/2 mr-3"
        : resolved === "left"
          ? "right-full bottom-0 mr-2"
          : resolved === "right"
            ? "left-full bottom-0 ml-2"
            : resolved === "top"
              ? "left-0 bottom-full mb-2"
              : resolved === "top-right"
                ? "right-0 bottom-full mb-2"
                : resolved === "bottom-right"
                  ? "right-0 top-full mt-2"
                  : "left-0 top-full mt-2";

  const risesUp = resolved === "top" || resolved === "top-right";

  return (
    <span
      ref={ref}
      className="relative inline-flex align-middle"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
        style={{ boxShadow: "inset 0 0 0 1px var(--border-accent)" }}
      >
        ?
      </button>
      {open && (
        // outer span owns placement + the clamp offset; inner owns the entrance,
        // so the two transforms never fight each other
        <span
          ref={panelRef}
          className={`absolute z-30 block ${isSide ? "w-[19rem]" : "w-64"} ${pos}`}
          style={
            isSide
              ? { transform: `translateY(calc(-50% + ${shift}px))` }
              : undefined
          }
        >
          <span
            role="tooltip"
            className="block rounded-xl p-3 text-left font-sans text-xs font-normal normal-case leading-relaxed tracking-normal"
            style={{
              background: "var(--accent)",
              color: "var(--accent-foreground)",
              border: "1px solid var(--border-accent-strong)",
              boxShadow: "var(--shadow-accent-lg)",
              opacity: ready ? 1 : 0,
              transform: ready
                ? "none"
                : isSide
                  ? "translateX(-6px)"
                  : `translateY(${risesUp ? 6 : -6}px)`,
              transition:
                "opacity 180ms var(--ease-out), transform 180ms var(--ease-out)",
            }}
          >
            {children}
          </span>
        </span>
      )}
    </span>
  );
}
