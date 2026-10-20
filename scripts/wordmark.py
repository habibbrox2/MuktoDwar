"""
Generate the MuktoDwar wordmark as pure SVG path data.

The brand wordmark must render identically on every machine — in the GitHub
README, in a favicon, on a machine that has never heard of Inter. A <text>
element cannot promise that, so the glyphs are converted to outlines once
and baked into the SVG.

Two details make the outlines correct:

* **Vertical orientation.** Font units are y-up, SVG units are y-down. The
  outlines are emitted with a y-flip so the baseline sits at y=0 and the
  cap height reaches y=-100, exactly like a normal SVG text baseline.
* **Kerning.** Inter stores kerning in GPOS, not in the legacy `kern` table,
  so the pairs are read straight out of the GPOS lookup list.

Usage:
    python scripts/wordmark.py <font.ttf>

Output on stdout: one line per word — "word<TAB>width<TAB>pathdata" — where
the path is scaled so the cap height is 100 SVG units and the baseline is
at y=0. The reported width excludes the trailing tracking.
"""

import sys

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

TARGET_CAP = 100.0  # SVG units for the cap height.
TRACKING = -2.0  # Tight tracking in SVG units, matching the brand sheet.


def _pair_kerning(font: TTFont):
    """Return {(first, second): x-advance adjustment} from the GPOS table."""
    if "GPOS" not in font:
        return {}

    kerning = {}
    for lookup in font["GPOS"].table.LookupList.Lookup:
        subtables = []
        if lookup.LookupType == 2:  # Pair positioning.
            subtables = lookup.SubTable
        elif lookup.LookupType == 9:  # Extension positioning.
            subtables = [lookup.ExtSubTable]

        for subtable in subtables:
            if subtable.Format == 1:
                for first, pair_set in zip(subtable.Coverage.glyphs, subtable.PairSet):
                    for record in pair_set.PairValueRecord:
                        if record.SecondGlyph and record.Value1.XAdvance:
                            kerning[(first, record.SecondGlyph)] = record.Value1.XAdvance
            elif subtable.Format == 2:
                first_classes = subtable.ClassDef1.classDefs
                second_classes = subtable.ClassDef2.classDefs
                for first, first_class in first_classes.items():
                    records = subtable.Class1Record[first_class].Class2Record
                    for second, second_class in second_classes.items():
                        if second_class >= len(records):
                            continue
                        advance = records[second_class].Value1.XAdvance
                        if advance:
                            kerning[(first, second)] = advance

    return kerning


def word_path(font: TTFont, word: str, kerning):
    """Return (path data, advance width) for a word, in SVG units."""
    glyph_set = font.getGlyphSet()
    cmap = font.getBestCmap()
    scale = TARGET_CAP / font["OS/2"].sCapHeight

    parts = []
    x = 0.0
    previous = None

    for character in word:
        name = cmap[ord(character)]
        pen = SVGPathPen(glyph_set, ntos=lambda value: f"{value:.2f}".rstrip("0").rstrip("."))
        # Flip y: font units run up, SVG units run down. The baseline stays
        # at y=0 and the cap height lands at y=-TARGET_CAP.
        scaled = TransformPen(pen, (scale, 0, 0, -scale, 0, 0))
        glyph_set[name].draw(scaled)
        commands = pen.getCommands()
        if commands:
            parts.append(f'<g transform="translate({x:.2f} 0)">{commands}</g>')

        advance = glyph_set[name].width * scale
        if previous is not None:
            advance += kerning.get((previous, name), 0) * scale
        x += advance + TRACKING
        previous = name

    # The trailing tracking of the last glyph is not part of the word.
    width = x - TRACKING
    return "".join(parts), width


def main() -> None:
    font = TTFont(sys.argv[1])
    kerning = _pair_kerning(font)
    for word in ("Mukto", "Dwar"):
        path, width = word_path(font, word, kerning)
        print(f"{word}\t{width:.2f}\t{path}")


if __name__ == "__main__":
    main()
