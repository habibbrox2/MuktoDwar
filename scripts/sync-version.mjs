/**
 * Keep every version string in the repository in step with package.json.
 *
 * The version appears in more than one place: the runtime that answers
 * /health, the two Windows installers, and the documentation. When they
 * drift apart the installer claims a version the application does not
 * report, which is exactly the kind of small lie that is hard to notice.
 *
 * This script rewrites them from package.json:
 *
 *   node scripts/sync-version.mjs          write the current version
 *   node scripts/sync-version.mjs --check  fail if anything is out of step
 *
 * The check runs as part of `npm run verify`, so CI refuses a build whose
 * version strings disagree.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = pkg.version;

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`package.json has an unexpected version: ${version}`);
  process.exit(1);
}

/**
 * Every place the version is written.
 *
 * Each entry lists the patterns that find the version and the text that
 * replaces them. The replacement is given as a function, so a `$` in the
 * version can never be read as a back-reference.
 */
const targets = [
  {
    file: join(root, 'src', 'version.ts'),
    find: [/export const GATEWAY_VERSION = '[^']*';/],
    write: () => `export const GATEWAY_VERSION = '${version}';`,
  },
  {
    file: join(root, 'installer', 'muktodwar.iss'),
    find: [/#define MyAppVersion "[^"]*"/],
    write: () => `#define MyAppVersion "${version}"`,
  },
  {
    file: join(root, 'installer', 'muktodwar.wxs'),
    find: [
      /(\n\s*Version=")[^"]*(")/,
      /(\n\s*\* Application version \.+ )[^ ]*( \(identical in both installers\))/,
    ],
    write: (match, ...groups) => match.replace(/(\d+\.\d+\.\d+)/, version),
  },
  {
    file: join(root, 'docs', 'connect-a-client.md'),
    find: [/("status": "ok", "version": ")[^"]*(")/],
    write: (match, ...groups) => match.replace(/\d+\.\d+\.\d+/, version),
  },
];

const drift = [];

for (const target of targets) {
  const original = readFileSync(target.file, 'utf8');
  let updated = original;

  for (const pattern of target.find) {
    if (!pattern.test(updated)) {
      drift.push(`${target.file.replace(root + '\\', '')}: no match for ${pattern}`);
      continue;
    }
    updated = updated.replace(pattern, target.write);
  }

  if (updated === original) continue;

  if (check) {
    drift.push(`${target.file.replace(root + '\\', '')}: version is out of step`);
    continue;
  }

  writeFileSync(target.file, updated, 'utf8');
  console.log(`updated ${target.file.replace(root + '\\', '')}`);
}

if (check) {
  if (drift.length > 0) {
    console.error(`The version strings do not match package.json (${version}):`);
    for (const line of drift) console.error('  - ' + line);
    console.error('Run: npm run sync:version');
    process.exit(1);
  }
  console.log(`Every version string matches package.json (${version}).`);
  process.exit(0);
}

console.log(`Version set to ${version}.`);
