import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'build', 'muktodwar.exe');
const bundle = join(root, 'build', 'sea-bundle.cjs');

// 1. Bundle the app into a single CommonJS file.
execFileSync('npx', ['esbuild', 'src/index.ts', '--bundle', '--platform=node', '--format=cjs', `--outfile=${bundle}`, '--target=node22'], {
  stdio: 'inherit',
  cwd: root,
  shell: true,
});

// 2. Generate SEA blob.
execFileSync(process.execPath, ['--experimental-sea-config', join(root, 'sea-config.json')], {
  stdio: 'inherit',
  cwd: root,
});

// 3. Copy node binary to output exe.
mkdirSync(dirname(out), { recursive: true });
copyFileSync(process.execPath, out);

// 4. Convert to Windows GUI subsystem so no console window appears.
function findEditbin() {
  const roots = [
    'C:\\Program Files (x86)\\Microsoft Visual Studio',
    'C:\\Program Files\\Microsoft Visual Studio',
  ];
  const wanted = 'editbin.exe';
  // Search a bounded tree for editbin.exe. Visual Studio lays it out as
  // <edition>\<component>\VC\Tools\MSVC\<toolset>\bin\Hostx64\x64\editbin.exe,
  // where <component> may be BuildTools/Community/Professional/Enterprise.
  const search = (dir, depth) => {
    if (depth > 12) return null;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return null;
    }
    const candidates = [];
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isFile() && entry.name.toLowerCase() === wanted) {
        candidates.push(full);
      } else if (entry.isDirectory()) {
        const nested = search(full, depth + 1);
        if (nested) candidates.push(nested);
      }
    }
    if (candidates.length === 0) return null;
    return (
      candidates.find((p) => p.includes('Hostx64\\x64')) ??
      candidates.find((p) => p.includes('Hostx86\\x86')) ??
      candidates[0]
    );
  };
  for (const root of roots) {
    if (!existsSync(root)) continue;
    const found = search(root, 0);
    if (found) return found;
  }
  return null;
}

const editbin = findEditbin();
if (editbin) {
  execFileSync(editbin, ['/SUBSYSTEM:WINDOWS', out], { stdio: 'inherit' });
  console.log('Applied GUI subsystem via', editbin);
} else {
  console.warn('editbin.exe not found; console window may appear.');
}

// 5. Inject blob with postject (must be installed).
const fuse = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';
try {
  execFileSync('npx', ['postject', out, 'NODE_SEA_BLOB', join(root, 'dist', 'sea-prep.blob'), '--sentinel-fuse', fuse], {
    stdio: 'inherit',
    cwd: root,
    shell: true,
  });
} catch (err) {
  console.error('postject injection failed. Install postject: npm i -D postject');
  process.exit(1);
}

console.log('Built:', out);