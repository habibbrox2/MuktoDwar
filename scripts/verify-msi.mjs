/**
 * Verify that a built MuktoDwar MSI is a usable, self-contained package.
 *
 * Four things must hold:
 *  1. The package is large enough to contain the application payload
 *     (the single-file executable is around 90-100 MB).
 *  2. The cabinet that holds the payload is embedded in the package.
 *     Windows Installer marks an embedded cabinet with a leading '#' in the
 *     Media table. A missing '#' means the .msi depends on a loose .cab file
 *     next to it, which breaks every managed deployment.
 *  3. The package is built for x64. The application is a 64-bit program
 *     and belongs in the real Program Files; an x86 package would put it
 *     in Program Files (x86). The summary stream names the platform.
 *  4. The package puts a shortcut in the Start menu and one on the
 *     desktop. The directory identifiers of the two shortcuts are in the
 *     table strings.
 *
 * Usage: node scripts/verify-msi.mjs <path-to-msi>
 */
import { readFileSync, statSync } from 'node:fs';

const target = process.argv[2];
if (!target) {
  console.error('Usage: node scripts/verify-msi.mjs <path-to-msi>');
  process.exit(2);
}

const size = statSync(target).size;
const contents = readFileSync(target);
const text = contents.toString('latin1');

const problems = [];

if (size < 10 * 1024 * 1024) {
  problems.push(`The MSI is only ${size} bytes; the application payload is missing.`);
}

if (!text.includes('#app1.cab')) {
  problems.push('The MSI does not contain an embedded cabinet (#app1.cab); it depends on a loose .cab file.');
}

if (!text.includes('MuktoDwar')) {
  problems.push('The MSI does not look like a MuktoDwar package.');
}

if (!text.includes('x64;1033')) {
  problems.push('The MSI is not built for x64; it would install into Program Files (x86).');
}

if (!text.includes('ProgramMenuFolder')) {
  problems.push('The MSI does not put a shortcut in the Start menu.');
}

if (!text.includes('DesktopFolder')) {
  problems.push('The MSI does not put a shortcut on the desktop.');
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`error: ${problem}`);
  process.exit(1);
}

console.log(
  `MuktoDwar.msi verified: ${size} bytes, embedded cabinet present, x64, Start menu and desktop shortcuts.`,
);
