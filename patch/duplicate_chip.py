#!/usr/bin/env python3
"""Guarded patch: make the outcome partition reconcile when duplicates exist.

Auto + Queued + Escalated summed to 3 against a total of 10 on the live
dataset, because a duplicate is a terminal status belonging to none of them.
The chip only renders when there is at least one, so the two baked datasets
look exactly as they do today.

Run from the repo root:  python3 patch/duplicate_chip.py
Nothing is written unless all five anchors match exactly once.
"""

from __future__ import annotations

import sys
from pathlib import Path

TARGET = Path("web/components/console.tsx")

EDITS: list[tuple[str, str]] = [
    # 1. filter union
    (
        'type StatusFilter = "any" | "review" | "auto" | "queued" | "escalated";',
        "type StatusFilter =\n"
        '  | "any"\n'
        '  | "review"\n'
        '  | "auto"\n'
        '  | "queued"\n'
        '  | "escalated"\n'
        '  | "duplicate";',
    ),
    # 2. count them
    (
        "  const escalatedCount = useMemo(\n"
        '    () => byType.filter((c) => c.status === "escalated").length,\n'
        "    [byType]\n"
        "  );",
        "  const escalatedCount = useMemo(\n"
        '    () => byType.filter((c) => c.status === "escalated").length,\n'
        "    [byType]\n"
        "  );\n"
        "  // Resends caught by the content fingerprint before any model call.\n"
        "  // Zero on the baked batches, which is why the chip is conditional.\n"
        "  const duplicateCount = useMemo(\n"
        '    () => byType.filter((c) => c.status === "duplicate").length,\n'
        "    [byType]\n"
        "  );",
    ),
    # 3. make the filter selectable
    (
        '                ? c.status === "escalated"\n' "                : true",
        '                ? c.status === "escalated"\n'
        '                : statusFilter === "duplicate"\n'
        '                  ? c.status === "duplicate"\n'
        "                  : true",
    ),
    # 4. the hint claimed a three-way partition
    (
        "                Auto, queued and escalated partition the batch — every case is\n"
        "                in exactly one. Flagged cuts across them: the classification\n"
        "                itself was uncertain. A queued case is not a failure; the branch\n"
        "                prepared the work and a person finishes it.",
        "                Auto, queued, escalated and duplicate partition the batch —\n"
        "                every case is in exactly one. Flagged cuts across them: the\n"
        "                classification itself was uncertain. A queued case is not a\n"
        "                failure; the branch prepared the work and a person finishes it.\n"
        "                A duplicate was suppressed by content fingerprint before any\n"
        "                model call, so it cost nothing to receive.",
    ),
    # 5. the chip itself, after Queued
    (
        "              Queued {queuedCount}\n" "            </button>",
        "              Queued {queuedCount}\n"
        "            </button>\n"
        "            {duplicateCount > 0 ? (\n"
        "              <button\n"
        "                onClick={() =>\n"
        "                  setStatusFilter((v) =>\n"
        '                    v === "duplicate" ? "any" : "duplicate"\n'
        "                  )\n"
        "                }\n"
        '                title="Resend caught by content fingerprint before any model call"\n'
        '                className={chip(statusFilter === "duplicate")}\n'
        "              >\n"
        "                Duplicate {duplicateCount}\n"
        "              </button>\n"
        "            ) : null}",
    ),
]


def main() -> int:
    if not TARGET.is_file():
        print(f"missing {TARGET}", file=sys.stderr)
        return 1

    staged = TARGET.read_text(encoding="utf-8")
    problems: list[str] = []

    for i, (old, new) in enumerate(EDITS, start=1):
        count = staged.count(old)
        if count != 1:
            head = old.splitlines()[0].strip()[:58]
            problems.append(f"anchor {i}: matched {count}x (want 1) -> {head!r}")
            continue
        staged = staged.replace(old, new, 1)
        print(f"  ok   anchor {i}")

    if problems:
        print("\nABORTED - nothing written:", file=sys.stderr)
        for p in problems:
            print("  " + p, file=sys.stderr)
        return 1

    TARGET.write_text(staged, encoding="utf-8")
    print(f"\nwrote {TARGET}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
