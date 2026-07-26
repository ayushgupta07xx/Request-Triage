"use client";

// The product mark, drawn from the same vocabulary as the rest of the app: a
// hollow ring, a connector, a filled dot. A person is handed to, and the
// accent lands on the arrival — the same rhythm as the wordmark itself, where
// "Hand" is neutral and "off" carries the colour.
//
// The two ends are deliberately NOT the same r. SVG centres a stroke on its
// path, so a ring at r=2.5 with a 1.2 stroke reaches an outer radius of 3.1,
// while a filled disc renders at exactly its r. The dot is set at 2.9 rather
// than 3.1 because a solid shape reads optically heavier than an outline.
export default function Wordmark({
  size = "nav",
}: {
  size?: "nav" | "footer";
}) {
  const nav = size === "nav";
  const px = nav ? 21 : 16;
  const mark = nav ? 20 : 16;

  return (
    <span className="inline-flex items-center gap-2.5">
      <svg
        width={mark}
        height={mark}
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden
        className="shrink-0 text-muted-foreground"
      >
        <circle
          cx="5"
          cy="10"
          r="2.5"
          stroke="currentColor"
          strokeWidth="1.2"
          opacity="0.75"
        />
        <path
          d="M8.7 10 H11.4"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity="0.75"
        />
        <circle cx="15.05" cy="10" r="2.9" fill="var(--primary)" />
      </svg>
      <span
        className="select-none font-bold leading-none"
        style={{ fontSize: px, letterSpacing: "-0.025em" }}
      >
        Hand<span style={{ color: "var(--primary)" }}>off</span>
      </span>
    </span>
  );
}
