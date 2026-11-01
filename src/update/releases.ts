/**
 * Read-only GitHub release metadata for the in-app update notice.
 *
 * This module deliberately does not download or execute installers. SHA-256
 * values from a release manifest are integrity metadata only; publisher
 * authenticity must still be established by local Authenticode verification.
 */

export interface UpdateReleaseInfo {
  tag: string;
  url: string;
  version: string;
  installer: {
    name: 'MuktoDwar-Setup.exe';
    url: string;
    size: number;
    sha256: string;
    authenticode: 'Valid' | 'NotSigned';
  } | null;
  automaticInstallationAllowed: boolean;
  publisherThumbprint: string | null;
}

interface GitHubAsset {
  name?: string;
  browser_download_url?: string;
  size?: number;
}

interface GitHubRelease {
  tag_name?: string;
  html_url?: string;
  assets?: GitHubAsset[];
}

interface ManifestFile {
  name?: string;
  size?: number;
  sha256?: string;
  authenticode?: string;
}

interface UpdateManifest {
  schemaVersion?: number;
  version?: string;
  tag?: string | null;
  authenticodeSigned?: boolean;
  automaticInstallationAllowed?: boolean;
  publisherThumbprint?: string | null;
  files?: ManifestFile[];
}

const RELEASE_API = 'https://api.github.com/repos/habibbrox2/MuktoDwar/releases/latest';
const RELEASE_PAGE = 'https://github.com/habibbrox2/MuktoDwar/releases/tag/';
const MANIFEST_NAME = 'update-manifest.json';
const INSTALLER_NAME = 'MuktoDwar-Setup.exe';
const SHA256 = /^[a-f0-9]{64}$/i;
const THUMBPRINT = /^[a-f0-9]{40}$/i;

function validVersion(value: unknown): value is string {
  return typeof value === 'string' && /^\d+\.\d+\.\d+$/.test(value);
}

function isNewerVersion(candidate: string, current: string): boolean {
  const next = candidate.split('.').map(Number);
  const installed = current.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (next[index]! > installed[index]!) return true;
    if (next[index]! < installed[index]!) return false;
  }
  return false;
}

function isTrustedReleaseAsset(asset: GitHubAsset, tag: string): boolean {
  return asset.name === MANIFEST_NAME &&
    asset.browser_download_url === `https://github.com/habibbrox2/MuktoDwar/releases/download/${tag}/${MANIFEST_NAME}`;
}

/** Fetch and validate latest release metadata; network failures fail closed. */
export async function fetchLatestRelease(
  currentVersion: string,
  fetcher: typeof fetch = fetch,
): Promise<UpdateReleaseInfo | null> {
  if (!validVersion(currentVersion)) return null;

  const releaseResponse = await fetcher(RELEASE_API, {
    headers: { 'User-Agent': 'MuktoDwar', Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(8_000),
  });
  if (!releaseResponse.ok) return null;

  const release = await releaseResponse.json() as GitHubRelease;
  const tag = release.tag_name ?? '';
  if (!/^v\d+\.\d+\.\d+$/.test(tag) || release.html_url !== RELEASE_PAGE + tag) return null;
  if (!isNewerVersion(tag.slice(1), currentVersion)) return null;

  const assets = Array.isArray(release.assets) ? release.assets : [];
  const manifestAsset = assets.find((asset) => isTrustedReleaseAsset(asset, tag));
  if (!manifestAsset?.browser_download_url) {
    return { tag, url: RELEASE_PAGE + tag, version: tag.slice(1), installer: null,
      automaticInstallationAllowed: false, publisherThumbprint: null };
  }

  if (typeof manifestAsset.size !== 'number' || manifestAsset.size <= 0 || manifestAsset.size > 64 * 1024) return null;
  const manifestResponse = await fetcher(manifestAsset.browser_download_url, {
    headers: { 'User-Agent': 'MuktoDwar' },
    redirect: 'follow',
    signal: AbortSignal.timeout(8_000),
  });
  if (!manifestResponse.ok) return null;
  if (manifestResponse.url) {
    try {
      const finalHost = new URL(manifestResponse.url).hostname;
      if (finalHost !== 'github.com' && finalHost !== 'release-assets.githubusercontent.com') return null;
    } catch { return null; }
  }
  const manifestText = await manifestResponse.text();
  if (manifestText.length > 64 * 1024) return null;

  let manifest: UpdateManifest;
  try { manifest = JSON.parse(manifestText) as UpdateManifest; } catch { return null; }
  if (manifest.schemaVersion !== 1 || manifest.tag !== tag || !validVersion(manifest.version) ||
      manifest.version !== tag.slice(1) || !Array.isArray(manifest.files)) return null;

  const file = manifest.files.find((entry) => entry.name === INSTALLER_NAME);
  const asset = assets.find((entry) => entry.name === INSTALLER_NAME);
  const validFile = !!file && !!asset?.browser_download_url &&
    asset.browser_download_url === `https://github.com/habibbrox2/MuktoDwar/releases/download/${tag}/${INSTALLER_NAME}` &&
    Number.isSafeInteger(file.size) && file.size! > 0 && file.size === asset.size &&
    typeof file.sha256 === 'string' && SHA256.test(file.sha256) &&
    (file.authenticode === 'Valid' || file.authenticode === 'NotSigned');

  const thumbprint = typeof manifest.publisherThumbprint === 'string' &&
    THUMBPRINT.test(manifest.publisherThumbprint) ? manifest.publisherThumbprint.toUpperCase() : null;
  const autoAllowed = manifest.authenticodeSigned === true &&
    manifest.automaticInstallationAllowed === true &&
    file?.authenticode === 'Valid' && thumbprint !== null && validFile;

  const installer = validFile ? {
    name: INSTALLER_NAME as 'MuktoDwar-Setup.exe',
    url: asset!.browser_download_url!,
    size: file!.size!,
    sha256: file!.sha256!.toLowerCase(),
    authenticode: file!.authenticode as 'Valid' | 'NotSigned',
  } : null;

  return {
    tag,
    url: RELEASE_PAGE + tag,
    version: manifest.version,
    installer,
    automaticInstallationAllowed: autoAllowed,
    publisherThumbprint: autoAllowed ? thumbprint : null,
  };
}
