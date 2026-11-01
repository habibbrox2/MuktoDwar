import { describe, expect, it, vi } from 'vitest';
import { fetchLatestRelease } from '../src/update/releases.js';

const tag = 'v1.2.0';
const manifest = {
  schemaVersion: 1,
  version: '1.2.0',
  tag,
  authenticodeSigned: false,
  automaticInstallationAllowed: false,
  publisherThumbprint: null,
  files: [{
    name: 'MuktoDwar-Setup.exe',
    size: 1024,
    sha256: 'a'.repeat(64),
    authenticode: 'NotSigned',
  }],
};

function releaseResponse() {
  return new Response(JSON.stringify({
    tag_name: tag,
    html_url: `https://github.com/habibbrox2/MuktoDwar/releases/tag/${tag}`,
    assets: [
      {
        name: 'update-manifest.json',
        size: 512,
        browser_download_url: `https://github.com/habibbrox2/MuktoDwar/releases/download/${tag}/update-manifest.json`,
      },
      {
        name: 'MuktoDwar-Setup.exe',
        size: 1024,
        browser_download_url: `https://github.com/habibbrox2/MuktoDwar/releases/download/${tag}/MuktoDwar-Setup.exe`,
      },
    ],
  }), { status: 200 });
}

describe('trusted update release metadata', () => {
  it('returns an unsigned release as not eligible for automatic installation', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(releaseResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify(manifest), { status: 200 }));

    const result = await fetchLatestRelease('1.1.4', fetcher as typeof fetch);
    expect(result?.tag).toBe(tag);
    expect(result?.installer?.sha256).toBe('a'.repeat(64));
    expect(result?.automaticInstallationAllowed).toBe(false);
    expect(result?.publisherThumbprint).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('rejects a manifest whose tag does not match the release', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(releaseResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...manifest, tag: 'v9.9.9' }), { status: 200 }));

    expect(await fetchLatestRelease('1.1.4', fetcher as typeof fetch)).toBeNull();
  });

  it('rejects a manifest with an unsafe or malformed installer digest', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(releaseResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ...manifest,
        files: [{ ...manifest.files[0], sha256: 'not-a-hash' }],
      }), { status: 200 }));

    const result = await fetchLatestRelease('1.1.4', fetcher as typeof fetch);
    expect(result?.installer).toBeNull();
    expect(result?.automaticInstallationAllowed).toBe(false);
  });

  it('rejects a non-semver local version without making a network request', async () => {
    const fetcher = vi.fn();
    expect(await fetchLatestRelease('1.1.4-beta', fetcher as typeof fetch)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('fails closed when the GitHub release endpoint is unavailable', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('unavailable', { status: 503 }));
    expect(await fetchLatestRelease('1.1.4', fetcher as typeof fetch)).toBeNull();
  });
});
