import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
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

// 4. Inject blob with postject (must be installed).
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