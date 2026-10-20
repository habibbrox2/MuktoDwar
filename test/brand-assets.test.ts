import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const brand = join(process.cwd(), 'assets', 'brand');
const svgs = ['muktodwar-mark.svg', 'muktodwar-logo-dark.svg', 'muktodwar-logo-light.svg', 'muktodwar-logo-stacked-dark.svg', 'muktodwar-logo-stacked-light.svg', 'muktodwar-favicon.svg', 'muktodwar-logo-animated.svg', 'muktodwar-logo-animated-static.svg', 'muktodwar-github-banner.svg', 'muktodwar-wordmark-editable.svg'];
const binaries = ['muktodwar-logo-dark.png', 'muktodwar-logo-light.png', 'muktodwar-logo-stacked-dark.png', 'muktodwar-mark.png', 'muktodwar-icon-256.png', 'favicon-16.png', 'favicon-32.png', 'muktodwar-github-banner.png', 'muktodwar.ico', 'favicon.ico'];
async function dimensions(name: string) { const source = await readFile(join(brand, name)); return { width: source.readUInt32BE(16), height: source.readUInt32BE(20) }; }

describe('MuktoDwar brand assets', () => {
  it('ships safe canonical SVG masters', async () => {
    for (const name of svgs) { const source = await readFile(join(brand, name), 'utf8'); expect(source).toContain('<svg'); expect(source).not.toMatch(/<script|data:image|(?:href|src)=["']https?:\/\//i); }
  });
  it('ships all binary deliverables', async () => { for (const name of binaries) expect((await stat(join(brand, name))).size).toBeGreaterThan(100); });
  it('renders promised dimensions', async () => { await expect(dimensions('favicon-32.png')).resolves.toEqual({ width: 32, height: 32 }); await expect(dimensions('muktodwar-icon-256.png')).resolves.toEqual({ width: 256, height: 256 }); await expect(dimensions('muktodwar-github-banner.png')).resolves.toEqual({ width: 1280, height: 640 }); });
  it('creates a multi-resolution Windows icon', async () => { const icon = await readFile(join(brand, 'muktodwar.ico')); expect(icon.readUInt16LE(0)).toBe(0); expect(icon.readUInt16LE(2)).toBe(1); expect(icon.readUInt16LE(4)).toBe(5); expect([...Array(5).keys()].map((index) => icon[6 + index * 16])).toEqual([16, 24, 32, 48, 0]); });
  it('honors reduced motion in its animated logo', async () => { const source = await readFile(join(brand, 'muktodwar-logo-animated.svg'), 'utf8'); expect(source).toContain('prefers-reduced-motion'); expect(source).toContain('animation:'); });
});
