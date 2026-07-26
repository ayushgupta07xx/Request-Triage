"use client";

// The product mark: one request arrives, and it leaves one of two ways —
// closed by the machine, or prepared and handed to a person. The accent is on
// the branch the system completes itself, which is also the smaller of the
// two in practice; the neutral branch ends in a hollow ring, a person.
//
// It is the landing page's own split bar, reduced to a glyph, and it carries
// the same rhythm as the wordmark: neutral first, accent on the resolution.
export default function Wordmark({
  size = "nav",
}: {
  size?: "nav" | "footer";
}) {
  const nav = size === "nav";
  const px = nav ? 21 : 16;
  const mark = nav ? 21 : 17;

  return (
    <span className="inline-flex items-center gap-2.5">
      <svg
        width={mark}
        height={mark}
        viewBox="0 0 64 64"
        fill="none"
        aria-hidden
        className="shrink-0 text-muted-foreground"
      >
        <path
          d="M12 32h13"
          stroke="currentColor"
          strokeWidth="3.4"
          strokeLinecap="round"
          opacity="0.8"
        />
        <path
          d="M25 32c7 0 8-9 15-9"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="3.4"
          strokeLinecap="round"
        />
        <path
          d="M25 32c7 0 8 9 15 9"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.4"
          strokeLinecap="round"
          opacity="0.8"
        />
        <circle cx="46" cy="23" r="6" fill="var(--primary)" />
        <circle
          cx="46"
          cy="41"
          r="5"
          stroke="currentColor"
          strokeWidth="3"
          opacity="0.8"
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
