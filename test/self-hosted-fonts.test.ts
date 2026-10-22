/**
 * Self-hosted font tests.
 *
 * MuktoDwar is local-only: the admin console must not reach out to a remote
 * font provider, and the published site must render the same offline as
 * online. These tests fail when a Google Fonts link creeps back in or when a
 * self-hosted font file goes missing.
 */

import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const fonts = join(root, 'assets', 'fonts');

/** Font files the console and the site both depend on. */
const consoleFonts = ['inter.woff2', 'hindsiliguri-400.woff2', 'hindsiliguri-600.woff2', 'hindsiliguri-700.woff2'];
const siteFonts = ['inter-300-800.woff2', 'hindsiliguri-400.woff2', 'hindsiliguri-600.woff2', 'hindsiliguri-700.woff2', 'firacode-400.woff2', 'firacode-600.woff2'];

/** A WOFF2 file starts with the ASCII tag "wOF2". */
function isWoff2(buffer: Buffer): boolean {
  return buffer.subarray(0, 4).toString('ascii') === 'wOF2';
}

describe('self-hosted fonts', () => {
  it('ships every font file the console needs', async () => {
    for (const name of consoleFonts) {
      const file = join(fonts, name);
      expect((await stat(file)).size).toBeGreaterThan(1000);
      expect(isWoff2(await readFile(file))).toBe(true);
    }
  });

  it('ships every font file the site needs', async () => {
    for (const name of siteFonts) {
      const file = join(fonts, name);
      expect((await stat(file)).size).toBeGreaterThan(1000);
      expect(isWoff2(await readFile(file))).toBe(true);
    }
  });

  it('never calls out to a remote font provider', async () => {
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

  it('declares every self-hosted face with a local source', async () => {
    const consoleCss = await readFile(join(root, 'src', 'ui', 'styles.css'), 'utf8');
    expect(consoleCss).toContain("url('/fonts/inter.woff2')");
    expect(consoleCss).toContain("url('/fonts/hindsiliguri-400.woff2')");
    expect(consoleCss).toContain("url('/fonts/hindsiliguri-600.woff2')");
    expect(consoleCss).toContain("url('/fonts/hindsiliguri-700.woff2')");

    const siteCss = await readFile(join(root, 'site', 'assets', 'site.css'), 'utf8');
    expect(siteCss).toContain("url('fonts/inter-300-800.woff2')");
    expect(siteCss).toContain("url('fonts/firacode-400.woff2')");
  });
});
