#!/usr/bin/env python3
"""Guarded patch: let DatasetToggle take an explicit option list, and give the
desk the Live dataset while the performance page keeps only the scored pair.

Run from the repo root:  python3 patch/apply.py
Nothing is written unless every anchor matches exactly once.
"""

from __future__ import annotations

import sys
from pathlib import Path

TARGET = Path("web/components/console.tsx")

EDITS: list[tuple[str, str]] = [
    # 1. import the desk list and the meta type
    (
        'import { DATASETS, type DatasetKey } from "@/lib/data";',
        "import {\n"
        "  DATASETS,\n"
        "  DESK_DATASETS,\n"
        "  type DatasetKey,\n"
        "  type DatasetMeta,\n"
        '} from "@/lib/data";',
    ),
    # 2. accept an option list, defaulting to the measured pair so the
    #    performance page is unaffected
    (
        "export function DatasetToggle({\n"
        "  dataset,\n"
        "  onChange,\n"
        '  hintPlacement = "bottom-right",\n'
        "}: {\n"
        "  dataset: DatasetKey;\n"
        "  onChange: (k: DatasetKey) => void;",
        "export function DatasetToggle({\n"
        "  dataset,\n"
        "  onChange,\n"
        '  hintPlacement = "bottom-right",\n'
        "  options = DATASETS,\n"
        "}: {\n"
        "  dataset: DatasetKey;\n"
        "  onChange: (k: DatasetKey) => void;\n"
        "  options?: DatasetMeta[];",
    ),
    # 3. render from the option list rather than the global
    (
        "  const meta = DATASETS.find((d) => d.key === dataset);",
        "  const meta = options.find((d) => d.key === dataset);",
    ),
    (
        "        {DATASETS.map((d) => (",
        "        {options.map((d) => (",
    ),
    # 4. the desk toggle offers Live
    (
        "          <DatasetToggle\n            dataset={dataset}\n            onChange={setDataset}",
        "          <DatasetToggle\n            options={DESK_DATASETS}\n            dataset={dataset}\n            onChange={setDataset}",
    ),
]


def main() -> int:
    if not TARGET.is_file():
        print(f"missing {TARGET}", file=sys.stderr)
        return 1

    text = TARGET.read_text(encoding="utf-8")
    staged = text
    problems: list[str] = []

    for i, (old, new) in enumerate(EDITS, start=1):
        count = staged.count(old)
        if count != 1:
            head = old.splitlines()[0][:60]
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
