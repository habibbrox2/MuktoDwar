import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadAndVerifyInstaller } from '../src/update/installer.js';
import type { UpdateReleaseInfo } from '../src/update/releases.js';

const pin = 'A'.repeat(40);
const bytes = Buffer.from('verified test installer payload');
const digest = createHash('sha256').update(bytes).digest('hex');
const tag = 'v1.2.0';

function release(overrides: Partial<UpdateReleaseInfo> = {}): UpdateReleaseInfo {
  return {
    tag, version: '1.2.0',
    url: `https://github.com/habibbrox2/MuktoDwar/releases/tag/${tag}`,
    installer: {
      name: 'MuktoDwar-Setup.exe',
      url: `https://github.com/habibbrox2/MuktoDwar/releases/download/${tag}/MuktoDwar-Setup.exe`,
      size: bytes.length, sha256: digest, authenticode: 'Valid',
    },
    automaticInstallationAllowed: true, publisherThumbprint: pin, ...overrides,
  };
}

function downloadResponse(body: Buffer, url = 'https://release-assets.githubusercontent.com/download') {
  const response = new Response(body, { status: 200, headers: { 'content-length': String(body.length) } });
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

describe('secure installer staging', () => {
  const roots: string[] = [];
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it('requires an independently configured publisher thumbprint', async () => {
    await expect(downloadAndVerifyInstaller(release(), '')).rejects.toThrow(/trusted publisher certificate thumbprint/i);
  });

  it('rejects release metadata that does not match the trusted publisher pin before network access', async () => {
    const fetcher = vi.fn();
    await expect(downloadAndVerifyInstaller(release({ publisherThumbprint: 'B'.repeat(40) }), pin, {
      fetcher: fetcher as typeof fetch,
    })).rejects.toThrow(/metadata is not eligible/i);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects a download redirected to an untrusted host', async () => {
    const fetcher = vi.fn().mockResolvedValue(downloadResponse(bytes, 'https://attacker.example/payload'));
    await expect(downloadAndVerifyInstaller(release(), pin, {
      fetcher: fetcher as typeof fetch, verifyAuthenticode: vi.fn().mockResolvedValue(true),
    })).rejects.toThrow(/untrusted host/i);
  });

  it('rejects a payload whose SHA-256 does not match and removes partial staging files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'muktodwar-installer-test-'));
    roots.push(root);
    const fetcher = vi.fn().mockResolvedValue(downloadResponse(Buffer.from('tampered payload')));
    await expect(downloadAndVerifyInstaller(release(), pin, {
      fetcher: fetcher as typeof fetch, destinationRoot: root,
      verifyAuthenticode: vi.fn().mockResolvedValue(true),
    })).rejects.toThrow(/SHA-256 or size verification failed/i);
    expect(await readdir(root)).toEqual([]);
  });

  it('stages the installer only after hash and publisher verification succeed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'muktodwar-installer-test-'));
    roots.push(root);
    const verifyAuthenticode = vi.fn().mockResolvedValue(true);
    const fetcher = vi.fn().mockResolvedValue(downloadResponse(bytes));
    const staged = await downloadAndVerifyInstaller(release(), pin, {
      fetcher: fetcher as typeof fetch, destinationRoot: root, verifyAuthenticode,
    });
    expect(staged.sha256).toBe(digest);
    expect(staged.publisherThumbprint).toBe(pin);
    expect(await readFile(staged.path)).toEqual(bytes);
    expect(verifyAuthenticode).toHaveBeenCalledWith(staged.path, pin);
  });
});
