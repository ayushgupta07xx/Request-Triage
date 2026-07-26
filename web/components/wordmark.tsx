"use client";

// The product mark, drawn from the same vocabulary as the rest of the app: a
// filled dot, a connector, a hollow ring. Machine, then handover, then person.
// It is the thesis at 20 pixels, and it means the wordmark reads as a product
// rather than as a page heading.
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
        <circle cx="4.2" cy="10" r="2.6" fill="var(--primary)" />
        <path
          d="M7.9 10 H12.2"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          opacity="0.75"
        />
        <circle
          cx="15.4"
          cy="10"
          r="2.6"
          stroke="currentColor"
          strokeWidth="1.3"
          opacity="0.75"
        />
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
