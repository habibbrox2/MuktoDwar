/**
 * Self-hosted font tests.
 *
 * MuktoDwar is local-only: the admin console must not reach out to a remote
 * font provider, and the published site must render the same offline as
 * online. These tests fail when a Google Fonts link creeps back in, when a
 * font file goes missing, or when a font ships the wrong subset and leaves
 * Bengali text to a fallback face.
 */

import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { woff2CodePoints } from '../scripts/read-woff2-coverage.mjs';

/**
 * The Latin subsets the console and the site both depend on.
 *
 * Hind Siliguri ships as two subsets per weight: one for Latin characters
 * and one for Bengali. The Latin file has no Bengali glyphs and the Bengali
 * file has no Latin glyphs, so a surface that declares only one of them
 * renders half its text in a fallback face. Both are listed here.
 */
const latinFonts = [
  'inter.woff2',
  'inter-300-800.woff2',
  'hindsiliguri-400.woff2',
  'hindsiliguri-600.woff2',
  'hindsiliguri-700.woff2',
  'firacode-latin.woff2',
];

const bengaliFonts = [
  'hindsiliguri-bengali-400.woff2',
  'hindsiliguri-bengali-600.woff2',
  'hindsiliguri-bengali-700.woff2',
];

/** A WOFF2 file starts with the ASCII tag "wOF2". */
function isWoff2(buffer: Buffer): boolean {
  return buffer.subarray(0, 4).toString('ascii') === 'wOF2';
}

/** The code points a string needs. */
function codePoints(text: string): number[] {
  return [...text].map((character) => character.codePointAt(0)!);
}

describe('self-hosted fonts', () => {
  it('ships every font file the surfaces depend on', async () => {
    for (const name of [...latinFonts, ...bengaliFonts]) {
      const file = join(process.cwd(), 'assets', 'fonts', name);
      expect((await stat(file)).size, name).toBeGreaterThan(1000);
      expect(isWoff2(await readFile(file)), name).toBe(true);
    }
  });

  it('gives the Latin subsets the Latin characters', async () => {
    for (const name of latinFonts) {
      const points = woff2CodePoints(join(process.cwd(), 'assets', 'fonts', name));
      for (const code of codePoints('ABCabcxyz019 -.,/')) {
        expect(points.has(code), `${name} is missing U+${code.toString(16)}`).toBe(true);
      }
    }
  });

  it('gives the Bengali subsets the Bengali characters', async () => {
    for (const name of bengaliFonts) {
      const points = woff2CodePoints(join(process.cwd(), 'assets', 'fonts', name));
      for (const code of codePoints('আউকখগঘচছজটঠডঢণতথদধনপফবভমযরলশষসহািীুূেৈোৌ')) {
        expect(points.has(code), `${name} is missing U+${code.toString(16)}`).toBe(true);
      }
    }
  });

  it('never calls out to a remote font provider', async () => {
    const root = process.cwd();
    const surfaces = [
      join(root, 'src', 'ui', 'index.html'),
      join(root, 'src', 'ui', 'styles.css'),
      join(root, 'src', 'ui', 'app.js'),
      join(root, 'site', 'index.html'),
      join(root, 'site', 'assets', 'site.css'),
    ];
    for (const surface of surfaces) {
      const source = await readFile(surface, 'utf8');
      expect(source, surface).not.toMatch(/fonts\.(googleapis|gstatic)\.com/i);
    }
  });

  it('declares both the Latin and the Bengali Hind Siliguri faces', async () => {
    const root = process.cwd();
    for (const surface of [join(root, 'src', 'ui', 'styles.css'), join(root, 'site', 'assets', 'site.css')]) {
      const source = await readFile(surface, 'utf8');
      expect(source, surface).toContain('hindsiliguri-bengali-400.woff2');
      expect(source, surface).toContain('hindsiliguri-bengali-600.woff2');
      expect(source, surface).toContain('hindsiliguri-bengali-700.woff2');
      // Every Bengali face needs a range, or the browser cannot tell the
      // two subsets apart and picks the Latin one for Bengali text.
      const bengaliFaces = source.match(/@font-face\s*\{[^}]*bengali[^}]*\}/g) ?? [];
      expect(bengaliFaces.length, surface).toBeGreaterThanOrEqual(3);
      for (const face of bengaliFaces) expect(face, surface).toContain('unicode-range');
    }
  });
});
