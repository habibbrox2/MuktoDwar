/**
 * Gateway entrypoint.
 *
 * Boot order matters:
 *  1. Load and validate the configuration.
 *  2. Fail closed if the bind address is not loopback.
 *  3. Initialise the DPAPI driver and the secret store.
 *  4. Ensure the gateway and admin tokens exist.
 *  5. Bind to 127.0.0.1.
 *
 * The admin token is printed to the console exactly once, at creation, so
 * the operator can paste it into the admin UI. It is never written to disk
 * in plaintext and never returned by an API endpoint.
 */

import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ConfigStore } from './config/store.js';
import { ensureStateDir, adminTokenRotatedPath } from './config/paths.js';
import { HealthTracker } from './providers/health.js';
import { PowerShellDpapiDriver, assertDpapiScriptUsable, findDpapiScript, findPowerShell } from './security/dpapi.js';
import { SecretStore } from './security/secret-store.js';
import { AdminSessionStore, deriveSecretId, generateToken } from './security/auth.js';
import { assertLoopbackBind } from './security/localhost.js';
import { registerSecretValue } from './security/redact.js';
import { buildApp } from './app.js';

/** Create the DPAPI driver, or exit with a clear diagnostic. */
async function createDriver(): Promise<PowerShellDpapiDriver> {
  if (process.platform !== 'win32') {
    console.error(
      'The Local AI Gateway requires Windows: secret storage uses Windows DPAPI, which has no equivalent here.',
    );
    process.exit(1);
  }

  const executablePath = await findPowerShell();
  if (!executablePath) {
    console.error('powershell.exe could not be found. The gateway cannot protect secrets.');
    process.exit(1);
  }

  const scriptPath = await findDpapiScript();
  if (!scriptPath) {
    console.error('The DPAPI codec script (scripts/dpapi.ps1) could not be found.');
    process.exit(1);
  }
  await assertDpapiScriptUsable(scriptPath);

  return new PowerShellDpapiDriver({ executablePath, scriptPath });
}

/** Ensure the gateway and admin tokens exist, printing a new admin token once. */
async function ensureTokens(secrets: SecretStore): Promise<void> {
  const existing = secrets.list();

  const gateway = existing.find((record) => record.kind === 'gateway-token');
  if (!gateway) {
    const token = generateToken(32);
    await secrets.set(deriveSecretId('gwt', token), 'gateway-token', token, 'Gateway token');
    registerSecretValue(token);
  }

  const admin = existing.find((record) => record.kind === 'admin-token');
  if (!admin) {
    const token = generateToken(32);
    await secrets.set(deriveSecretId('adt', token), 'admin-token', token, 'Admin token');
    registerSecretValue(token);
    console.log('');
    console.log('  Administrator token (shown once — copy it now):');
    console.log(`  ${token}`);
    console.log('');
  }
}

/**
 * Print the stored admin token, only when explicitly asked to.
 *
 * This exists so an operator who has lost the token can recover it without
 * deleting the secret store. It runs only in response to an explicit flag,
 * never on a normal start, so the token is never written to console output
 * as a side effect of running the gateway.
 */
async function showExistingAdminToken(secrets: SecretStore): Promise<void> {
  const admin = secrets.list().find((record) => record.kind === 'admin-token');
  if (!admin) {
    console.error('No administrator token exists yet. Start the gateway once to create one.');
    return;
  }
  const token = await secrets.get(admin.id).catch(() => null);
  if (!token) {
    console.error('The administrator token could not be decrypted.');
    return;
  }
  console.log(token);
}

/**
 * Replace the administrator token, printing the new value exactly once.
 *
 * The previous token stops working immediately. The new token stays valid
 * until it is rotated again — from this command or from the admin dashboard
 * (Tokens section). Nothing is written to disk in plaintext.
 */
async function rotateAdminToken(secrets: SecretStore): Promise<void> {
  const existing = secrets.list().find((record) => record.kind === 'admin-token');
  if (existing) await secrets.remove(existing.id);
  const token = generateToken(32);
  await secrets.set(deriveSecretId('adt', token), 'admin-token', token, 'Admin token');
  registerSecretValue(token);
  writeFileSync(adminTokenRotatedPath(), new Date().toISOString(), { mode: 0o600 });
  console.log('');
  console.log('  New administrator token (shown once \u2014 copy it now):');
  console.log(`  ${token}`);
  console.log('');
}

/** Start the gateway. */
async function main(): Promise<void> {
  await ensureStateDir();

  const configStore = new ConfigStore();
  const config = await configStore.load();

  // Fail closed before anything else happens.
  assertLoopbackBind(config.gateway.host);

  const driver = await createDriver();
  const secrets = new SecretStore(driver);
  await secrets.load();

  // Rotating the administrator token is an explicit, deliberate action. It
  // runs before ensureTokens so a first-ever run with this flag prints only
  // the token that will actually be used, never a superseded one.
  if (process.argv.includes('--rotate-admin-token')) {
    await rotateAdminToken(secrets);
    await driver.close();
    process.exit(0);
  }

  await ensureTokens(secrets);

  // Recovering a lost admin token is an explicit, deliberate action. It is
  // never part of a normal start, so the token never reaches console output
  // as a side effect.
  if (process.argv.includes('--show-admin-token')) {
    await showExistingAdminToken(secrets);
    await driver.close();
    process.exit(0);
  }

  // Register the secret values so they can never be logged.
  for (const record of secrets.list()) {
    const value = await secrets.get(record.id).catch(() => null);
    registerSecretValue(value);
  }

  const health = new HealthTracker({
    failureThreshold: config.routing.circuitBreaker.failureThreshold,
    cooldownMs: config.routing.cooldownMs,
    breakerThreshold: config.routing.circuitBreaker.failureThreshold,
    breakerOpenMs: config.routing.circuitBreaker.openMs,
  });

  const sessions = new AdminSessionStore();
  const { app } = await buildApp({ configStore, secrets, health, sessions });

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n  ${signal} received, shutting down.`);
    secrets.clearCache();
    await driver.close();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  const address = await app.listen({ host: config.gateway.host, port: config.gateway.port });
  console.log('');
  console.log('  MuktoDwar \u2014 Local AI Gateway');
  console.log(`  Listening on ${address}`);
  console.log(`  Admin UI:       ${address}/`);
  console.log(`  OpenAI API:     ${address}/v1`);
  console.log('');
}

/** True when the module is the process entrypoint. */
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  const here = fileURLToPath(import.meta.url);
  return existsSync(here) && entry.replace(/\\/g, '/').endsWith(here.replace(/\\/g, '/').split('/').pop() ?? '');
}

if (isEntryPoint()) {
  main().catch((error: unknown) => {
    console.error('The gateway failed to start:');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

export { main };
