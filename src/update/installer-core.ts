/**
 * Securely stage a release installer for an explicitly confirmed update.
 * Internal verification core. Only installer.ts may call this module.
 */
import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import type { UpdateReleaseInfo } from './releases.js';

const execFileAsync = promisify(execFile);
const MAX_INSTALLER_BYTES = 250 * 1024 * 1024;
const THUMBPRINT = /^[a-f0-9]{40}$/i;
const ALLOWED_DOWNLOAD_HOSTS = new Set(['github.com', 'release-assets.githubusercontent.com']);

export interface VerifiedInstaller {
  readonly path: string;
  readonly sha256: string;
  readonly publisherThumbprint: string;
}

export interface InstallerVerificationOptions {
  readonly fetcher?: typeof fetch;
  readonly destinationRoot?: string;
  readonly verifyAuthenticode?: (path: string, trustedThumbprint: string) => Promise<boolean>;
}

function expectedAssetUrl(tag: string): string {
  return `https://github.com/habibbrox2/MuktoDwar/releases/download/${tag}/MuktoDwar-Setup.exe`;
}

/** Verify local Windows trust status and an independently configured signer pin. */
export async function verifyWindowsAuthenticode(filePath: string, trustedThumbprint: string): Promise<boolean> {
  if (process.platform !== 'win32' || !THUMBPRINT.test(trustedThumbprint)) return false;
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$sig = Get-AuthenticodeSignature -LiteralPath $env:MUKTODWAR_VERIFY_PATH",
    "if ($sig.Status.ToString() -ne 'Valid') { exit 2 }",
    "$thumb = ($sig.SignerCertificate.Thumbprint -replace '[^0-9A-Fa-f]', '').ToUpperInvariant()",
    "if ($thumb -ne $env:MUKTODWAR_TRUSTED_THUMBPRINT) { exit 3 }",
    "exit 0",
  ].join('; ');
  try {
    await execFileAsync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'AllSigned', '-Command', script], {
      windowsHide: true,
      timeout: 20_000,
      env: { ...process.env, MUKTODWAR_VERIFY_PATH: filePath, MUKTODWAR_TRUSTED_THUMBPRINT: trustedThumbprint.toUpperCase() },
    });
    return true;
  } catch { return false; }
}

/** Download, hash-check and locally verify the installer; never executes it. */
export async function downloadAndVerifyInstallerCore(
  release: UpdateReleaseInfo,
  trustedPublisherThumbprint: string,
  options: InstallerVerificationOptions = {},
): Promise<VerifiedInstaller> {
  const pin = trustedPublisherThumbprint.replace(/[^a-f0-9]/gi, '').toUpperCase();
  if (!THUMBPRINT.test(pin)) throw new Error('A trusted publisher certificate thumbprint is required.');
  if (!release.automaticInstallationAllowed || !release.installer ||
      release.installer.name !== 'MuktoDwar-Setup.exe' ||
      (release.publisherThumbprint ?? '').replace(/[^a-f0-9]/gi, '').toUpperCase() !== pin ||
      !/^v\d+\.\d+\.\d+$/.test(release.tag) ||
      release.url !== `https://github.com/habibbrox2/MuktoDwar/releases/tag/${release.tag}` ||
      release.installer.url !== expectedAssetUrl(release.tag) ||
      !Number.isSafeInteger(release.installer.size) || release.installer.size <= 0 ||
      release.installer.size > MAX_INSTALLER_BYTES ||
      !/^[a-f0-9]{64}$/i.test(release.installer.sha256)) {
    throw new Error('Release metadata is not eligible for secure installer verification.');
  }

  const response = await (options.fetcher ?? fetch)(release.installer.url, {
    headers: { 'User-Agent': 'MuktoDwar' }, redirect: 'follow', signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok || !response.body) throw new Error('Installer download failed.');
  // Native fetch exposes the final URL after redirects. An empty URL is
  // ambiguous (notably in custom fetch adapters), so never stage in that case.
  if (!response.url) throw new Error('Installer download final URL could not be verified.');
  let finalUrl: URL;
  try { finalUrl = new URL(response.url); } catch { throw new Error('Installer download URL is invalid.'); }
  if (finalUrl.protocol !== 'https:' || !ALLOWED_DOWNLOAD_HOSTS.has(finalUrl.hostname)) {
    throw new Error('Installer download redirected to an untrusted host.');
  }
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > 0 && declaredLength !== release.installer.size) {
    throw new Error('Installer download size does not match the release manifest.');
  }

  const directory = await mkdtemp(join(options.destinationRoot ?? tmpdir(), 'muktodwar-update-'));
  const filePath = join(directory, `MuktoDwar-Setup-${randomUUID()}.exe`);
  let received = 0;
  const hash = createHash('sha256');
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      if (received > MAX_INSTALLER_BYTES || received > release.installer!.size) {
        callback(new Error('Installer download exceeded its declared size.'));
        return;
      }
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(response.body as import('node:stream/web').ReadableStream), limiter,
      createWriteStream(filePath, { flags: 'wx', mode: 0o600 }));
    const digest = hash.digest('hex');
    if (received !== release.installer.size || digest !== release.installer.sha256.toLowerCase()) {
      throw new Error('Installer SHA-256 or size verification failed.');
    }
    const verify = options.verifyAuthenticode ?? verifyWindowsAuthenticode;
    if (!(await verify(filePath, pin))) throw new Error('Windows Authenticode verification failed or publisher does not match the trusted pin.');
    return { path: filePath, sha256: digest, publisherThumbprint: pin };
  } catch (error) {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}
