/**
 * Site build for the MuktoDwar GitHub Pages site.
 *
 * The canonical brand SVGs live in `assets/brand/`. This script assembles
 * the publishable site into `dist-site/`:
 *
 *   site/**            -> dist-site/**
 *   assets/brand/*.svg -> dist-site/assets/brand/*.svg
 *   assets/fonts/*.woff2 -> dist-site/assets/fonts/*.woff2
 *
 * It then checks that every local asset referenced by the built HTML
 * actually exists, so a renamed or missing logo fails the build instead of
 * shipping a broken image.
 *
 * Usage:
 *   node scripts/build-site.mjs            # build only
 *   node scripts/build-site.mjs --serve    # build, then serve on :4173
 */

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { cp, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const siteDir = join(root, 'site');
const brandDir = join(root, 'assets', 'brand');
const fontDir = join(root, 'assets', 'fonts');
const outDir = join(root, 'dist-site');

/** MIME types for the handful of extensions the site uses. */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

/** Build the site into dist-site. */
async function build() {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  await cp(siteDir, outDir, { recursive: true });
  await mkdir(join(outDir, 'assets', 'brand'), { recursive: true });
  await cp(brandDir, join(outDir, 'assets', 'brand'), { recursive: true });
  await mkdir(join(outDir, 'assets', 'fonts'), { recursive: true });
  await cp(fontDir, join(outDir, 'assets', 'fonts'), { recursive: true });

  await verify();
}

/** Fail when the built HTML references a local asset that is not there. */
async function verify() {
  const html = await readFile(join(outDir, 'index.html'), 'utf8');
  const references = new Set();

  for (const match of html.matchAll(/(?:src|href)\s*=\s*"([^"]+)"/g)) {
    const value = match[1];
    if (!value || value.startsWith('#') || value.startsWith('http')) continue;
    references.add(value.split('#')[0].split('?')[0]);
  }

  const missing = [];
  for (const reference of references) {
    const target = join(outDir, reference);
    try {
      await stat(target);
    } catch {
      missing.push(reference);
    }
  }

  if (missing.length > 0) {
    throw new Error(`The site references missing assets:\n  ${missing.join('\n  ')}`);
  }

  console.log(`site: ${references.size} local asset reference(s) verified`);

  await verifyStylesheets();
}

/**
 * Fail when a stylesheet points at a local file that is not there.
 *
 * A CSS `url()` is resolved against the stylesheet's own directory, not the
 * page, so a wrong relative path silently breaks a font or image without
 * ever appearing in the HTML reference list above.
 */
async function verifyStylesheets() {
  const stylesheets = [];
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.endsWith('.css')) stylesheets.push(full);
    }
  };
  await walk(outDir);

  const missing = [];
  let count = 0;

  for (const stylesheet of stylesheets) {
    const source = await readFile(stylesheet, 'utf8');
    const base = dirname(stylesheet);
    for (const match of source.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
      const value = match[1];
      if (!value || value.startsWith('#') || value.startsWith('http') || value.startsWith('data:')) continue;
      count += 1;
      const target = resolve(base, value.split('#')[0].split('?')[0]);
      try {
        await stat(target);
      } catch {
        missing.push(`${relative(outDir, stylesheet)} -> ${value}`);
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(`The stylesheets reference missing files:\n  ${missing.join('\n  ')}`);
  }

  if (count > 0) console.log(`site: ${count} stylesheet url(s) verified`);
}

/** Serve dist-site for a local look at the published result. */
async function serve(port) {
  createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', `http://localhost:${port}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';

    const target = join(outDir, pathname);
    if (!target.startsWith(outDir)) {
      response.writeHead(403).end('Forbidden');
      return;
    }

    try {
      const info = await stat(target);
      if (!info.isFile()) throw new Error('not a file');
    } catch {
      response.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
      return;
    }

    response.writeHead(200, {
      'content-type': MIME[extname(target)] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    createReadStream(target).pipe(response);
  }).listen(port, '127.0.0.1', () => {
    console.log(`site: serving http://127.0.0.1:${port}/`);
  });
}

await build();

if (process.argv.includes('--serve')) {
  // PORT is sometimes present but set to 0, which would bind a random port.
  const requested = Number(process.env.SITE_PORT ?? 4173);
  const port = Number.isInteger(requested) && requested > 0 ? requested : 4173;
  await serve(port);
}
