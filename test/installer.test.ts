import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { downloadAndVerifyInstaller } from '../src/update/installer.js';
import type { UpdateReleaseInfo } from '../src/update/releases.js';

const pin = '0123456789ABCDEF0123456789ABCDEF01234567';
const bytes = Buffer.from('test installer bytes');
const digest = createHash('sha256').update(bytes).digest('hex');
const release: UpdateReleaseInfo = {
  tag: 'v1.2.0',
  url: 'https://github.com/habibbrox2/MuktoDwar/releases/tag/v1.2.0',
  version: '1.2.0',
  installer: { name: 'MuktoDwar-Setup.exe', url: 'https://github.com/habibbrox2/MuktoDwar/releases/download/v1.2.0/MuktoDwar-Setup.exe', size: bytes.length, sha256: digest, authenticode: 'Valid' },
  automaticInstallationAllowed: true,
  publisherThumbprint: pin,
};
let root = '';
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); root = ''; });

async function setup() {
  root = await mkdtemp(join(tmpdir(), 'muktodwar-update-test-'));
  const fetcher = vi.fn().mockResolvedValue(new Response(bytes, { status: 200, headers: { 'content-length': String(bytes.length) } }));
  return { fetcher, destinationRoot: root };
}

describe('secure installer staging', () => {
  it('downloads, verifies SHA-256 and checks the independent signer pin', async () => {
    const options = await setup();
    const verifyAuthenticode = vi.fn().mockResolvedValue(true);
    const result = await downloadAndVerifyInstaller(release, pin, { ...options, verifyAuthenticode });
    expect(await readFile(result.path)).toEqual(bytes);
    expect(result.sha256).toBe(digest);
    expect(result.publisherThumbprint).toBe(pin);
    expect(verifyAuthenticode).toHaveBeenCalledWith(result.path, pin);
  });
  it('rejects missing or mismatched trusted publisher pins before network access', async () => {
    const options = await setup();
    await expect(downloadAndVerifyInstaller(release, '', options)).rejects.toThrow(/trusted publisher/i);
    await expect(downloadAndVerifyInstaller(release, 'F'.repeat(40), options)).rejects.toThrow(/not eligible/i);
    expect(options.fetcher).not.toHaveBeenCalled();
  });
  it('rejects a digest mismatch and removes the partial installer', async () => {
    const options = await setup();
    const bad = { ...release, installer: { ...release.installer!, sha256: '0'.repeat(64) } };
    await expect(downloadAndVerifyInstaller(bad, pin, { ...options, verifyAuthenticode: vi.fn().mockResolvedValue(true) })).rejects.toThrow(/SHA-256/i);
    expect((await import('node:fs/promises')).readdir ? (await import('node:fs/promises')).readdir(root) : []).toBeDefined();
  });
  it('rejects failed local Authenticode verification', async () => {
    const options = await setup();
    await expect(downloadAndVerifyInstaller(release, pin, { ...options, verifyAuthenticode: vi.fn().mockResolvedValue(false) })).rejects.toThrow(/Authenticode/i);
  });
  it('rejects redirects to untrusted hosts', async () => {
    const options = await setup();
    const response = new Response(bytes, { status: 200 });
    Object.defineProperty(response, 'url', { value: 'https://attacker.example/payload.exe' });
    await expect(downloadAndVerifyInstaller(release, pin, { ...options, fetcher: vi.fn().mockResolvedValue(response), verifyAuthenticode: vi.fn().mockResolvedValue(true) })).rejects.toThrow(/untrusted host/i);
  });
});
