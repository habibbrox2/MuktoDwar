/**
 * Build-time publisher trust anchors.
 *
 * Release workflow replaces this file before verification/build. The checked-in
 * default is intentionally empty: unsigned builds cannot auto-install updates.
 */
export const TRUSTED_PUBLISHER_THUMBPRINTS: readonly string[] = Object.freeze([]);
export const PRIMARY_TRUSTED_PUBLISHER_THUMBPRINT: string | null =
  TRUSTED_PUBLISHER_THUMBPRINTS[0] ?? null;

export function normalizePublisherThumbprint(value: string): string {
  return value.replace(/[^a-f0-9]/gi, "").toUpperCase();
}

export function isTrustedPublisherThumbprint(value: string): boolean {
  const normalized = normalizePublisherThumbprint(value);
  return /^[A-F0-9]{40}$/.test(normalized) &&
    TRUSTED_PUBLISHER_THUMBPRINTS.includes(normalized);
}
