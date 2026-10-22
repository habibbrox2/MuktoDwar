/**
 * The gateway version.
 *
 * One place, so that /health, the update check and the installers can never
 * disagree. `npm run sync:version` copies the value from package.json into
 * the installers and the documentation, and `npm run verify` fails when
 * they have drifted apart.
 */
export const GATEWAY_VERSION = '1.1.3';
