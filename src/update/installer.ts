/**
 * Public update installer boundary.
 *
 * Trust comes exclusively from the build-time publisher pin. Callers cannot
 * supply or override the trust anchor or Authenticode verifier.
 */
import { PRIMARY_TRUSTED_PUBLISHER_THUMBPRINT } from './trusted-publisher.js';
import type { UpdateReleaseInfo } from './releases.js';
import { downloadAndVerifyInstallerCore, type VerifiedInstaller } from './installer-core.js';

export type { VerifiedInstaller } from './installer-core.js';

/** Stage a release installer only when this build has an embedded publisher pin. */
export async function downloadAndVerifyInstaller(release: UpdateReleaseInfo): Promise<VerifiedInstaller> {
  const pin = PRIMARY_TRUSTED_PUBLISHER_THUMBPRINT;
  if (!pin) throw new Error('This build has no trusted Windows publisher configured.');
  return downloadAndVerifyInstallerCore(release, pin);
}
