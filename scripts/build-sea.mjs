import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
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
  for (const r of roots) {
    if (!existsSync(r)) continue;
    // search recursively for editbin.exe
    const stack = [r];
    while (stack.length) {
      const dir = stack.pop();
      let entries;
      try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
      for (const e of entries) {
        const full = join(dir, e.name);
        if (e.isDirectory()) stack.push(full);
        else if (e.name === 'editbin.exe') return full;
      }
    }
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