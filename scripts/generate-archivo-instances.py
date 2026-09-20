#!/usr/bin/env python3
"""
Generate the static Archivo instances the Record's type ladder needs.

The mobile prototype types the record with Archivo and carries distance on the font's `wdth`
axis: material narrows as it recedes, 100 / 88 / 80 / 76 across D0–D4, with meta, verbs and a
line's moments at their own fixed widths. Desktop does the same thing with the variable font
directly (`@fontsource-variable/archivo`).

React Native cannot do that. There is no `fontVariationSettings` in RN core, so loading a
variable font on iOS gives you its default instance and nothing else. The axis has to be
resolved ahead of time, which is what this script does: one static TTF per width the
prototype actually draws, registered as its own family.

Run:  pnpm generate:fonts
In:   node_modules/@fontsource-variable/archivo/files/*.woff2   (latin subset, wdth axis)
Out:  assets/fonts/Archivo-*.ttf

Requires `fonttools` and `brotli`:  pip3 install --user fonttools brotli
"""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

try:
    from fontTools.ttLib import TTFont
    from fontTools.varLib import instancer
except ImportError:  # pragma: no cover - a developer-machine concern
    sys.exit("fonttools is not installed. Run: pip3 install --user fonttools brotli")

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "node_modules" / "@fontsource-variable" / "archivo" / "files"
OUT = ROOT / "assets" / "fonts"

# Every (weight, width, italic) the prototype actually draws. Nothing speculative: each entry
# names where it is used, so an unused instance is obvious and removable.
INSTANCES = [
    # weight, width, italic, why
    (400, 100, False, "D0 material, focus moment, capture field, quotations"),
    (400, 96, False, "the launch wordmark's width"),
    (400, 94, False, "a line's other moments in focus"),
    (400, 92, False, "the selected row's verb row"),
    (400, 90, False, "the traces block"),
    (400, 88, False, "D1 material"),
    (400, 80, False, "D2 material"),
    (400, 76, False, "D3 and D4 material"),
    (500, 96, False, "the launch wordmark"),
    # Agency. The colour system marks a verb with lightness AND weight, and on the phone the
    # weight has to be a family — see `record/ui/type.ts`.
    (540, 90, False, "verbs: the edge's notices, settings, sync, traces, held"),
    (540, 92, False, "verbs: a moment's own row in focus, the bordered buttons"),
    (540, 94, False, "verbs inside settings' own body copy"),
    # Voice is set in italic at every tier it can appear in.
    (400, 100, True, "D0 voice, focus voice, the live transcript"),
    (400, 94, True, "a line's other voice moments"),
    (400, 88, True, "D1 voice, guesses in Find"),
    (400, 80, True, "D2 voice"),
    (400, 76, True, "D3 and D4 voice"),
]


def family_name(weight: int, width: int, italic: bool) -> str:
    """The `fontFamily` string RN will use. Mirrors `record/ui/type.ts`."""
    return f"Archivo-{weight}-{width}{'-Italic' if italic else ''}"


def main() -> int:
    if not SRC.exists():
        sys.exit(f"missing {SRC} — run `pnpm install` first")
    OUT.mkdir(parents=True, exist_ok=True)

    sources = {
        False: SRC / "archivo-latin-wdth-normal.woff2",
        True: SRC / "archivo-latin-wdth-italic.woff2",
    }
    for italic, path in sources.items():
        if not path.exists():
            sys.exit(f"missing {path}")

    written = []
    for weight, width, italic, why in INSTANCES:
        font = TTFont(sources[italic])
        static = instancer.instantiateVariableFont(
            font, {"wght": weight, "wdth": width}, inplace=True, updateFontNames=False
        )

        name = family_name(weight, width, italic)
        # RN matches on the name table, not the filename, so both are set to the same thing.
        # PostScript names may not contain spaces; these have none by construction.
        records = static["name"]
        for name_id in (1, 3, 4, 6, 16, 17):
            records.setName(name, name_id, 3, 1, 0x409)
            records.setName(name, name_id, 1, 0, 0)

        dest = OUT / f"{name}.ttf"
        static.save(dest)
        static.close()
        written.append((dest, why))

    # The licence travels with the fonts, as OFL requires.
    licence = SRC.parent / "LICENSE"
    if licence.exists():
        shutil.copyfile(licence, OUT / "Archivo-LICENSE.txt")

    total = sum(p.stat().st_size for p, _ in written)
    for path, why in written:
        print(f"  {path.name:28} {path.stat().st_size // 1024:4} KB   {why}")
    print(f"\n{len(written)} instances, {total // 1024} KB total")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
