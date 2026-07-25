"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// SafetyVision-style scroll reveal: content rises in as it enters view,
// once. Works inside internal scroll containers too, since intersection is
// computed against all clipping ancestors. Reduced motion shows instantly.
export default function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setSeen(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.12 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: seen ? 1 : 0,
        transform: seen ? "none" : "translateY(14px)",
        transition: `opacity 0.6s cubic-bezier(0.2,0.7,0.3,1) ${delay}ms, transform 0.6s cubic-bezier(0.2,0.7,0.3,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}
