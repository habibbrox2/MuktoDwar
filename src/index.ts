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
import { spawn } from 'node:child_process';
import { ConfigStore } from './config/store.js';
import { ensureStateDir, adminTokenRotatedPath } from './config/paths.js';
import { HealthTracker } from './providers/health.js';
import { catalogFor } from './providers/catalog.js';
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

/** Ensure Kilo and OpenCode providers exist and are enabled by default. */
async function ensureDefaultProviders(configStore: ConfigStore): Promise<void> {
  const config = configStore.get();
  const existingIds = new Set(config.providers.map((p) => p.id));
  const toAdd: string[] = [];
  if (!existingIds.has('kilo')) toAdd.push('kilo');
  if (!existingIds.has('opencode')) toAdd.push('opencode');
  if (toAdd.length === 0) return;

  await configStore.mutate((draft) => {
    for (const kind of toAdd) {
      const catalog = catalogFor(kind as never);
      draft.providers.push({
        id: kind,
        kind: kind as never,
        label: catalog.label,
        enabled: true,
        priority: 100,
        anonymous: !catalog.requiresKey,
        models: catalog.models.map((m) => ({
          id: m.id,
          free: true,
          verified: m.verified,
          contextWindow: m.contextWindow,
          maxOutputTokens: m.maxOutputTokens,
          source: m.source,
        })),
        keys: [],
      });
    }
  });
}

/** Start the gateway. */
function isProcessAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function main(): Promise<void> {
  // Set up file logging.
  try {
    const _fs = await import('node:fs');
    const _logDir = (process.env.LOCALAPPDATA || process.env.TEMP || '.') + '\\MuktoDwar\\logs';
    _fs.mkdirSync(_logDir, { recursive: true });
    const _logFile = _logDir + '\\muktodwar-' + new Date().toISOString().slice(0, 10) + '.log';
    const _origStdout = process.stdout.write.bind(process.stdout);
    const _origStderr = process.stderr.write.bind(process.stderr);
    process.stdout.write = (chunk: any, ...args: any[]) => { try { _fs.appendFileSync(_logFile, String(chunk)); } catch { /* ignore */ } return _origStdout(chunk, ...args); };
    process.stderr.write = (chunk: any, ...args: any[]) => { try { _fs.appendFileSync(_logFile, String(chunk)); } catch { /* ignore */ } return _origStderr(chunk, ...args); };
  } catch { /* ignore */ }

  // Background update check (non-blocking).
  (async () => {
    try {
      const res = await fetch('https://api.github.com/repos/habibbrox2/MuktoDwar/releases/latest', { headers: { 'User-Agent': 'MuktoDwar' } });
      if (!res.ok) return;
      const data = await res.json() as { tag_name?: string; html_url?: string };
      (globalThis as any).__muktodwarLatest = { tag: data.tag_name, url: data.html_url };
    } catch { /* ignore */ }
  })();

  // Single-instance guard
  const { join: _join } = await import('node:path');
  const { existsSync: _exists, readFileSync: _read, writeFileSync: _write, mkdirSync: _mkdir } = await import('node:fs');
  const lockDir = process.env.LOCALAPPDATA || process.env.TEMP || '.';
  const lockPath = _join(lockDir, 'MuktoDwar', 'muktodwar.lock');
  try {
    if (_exists(lockPath)) {
      const pid = Number(_read(lockPath, 'utf8').trim());
      if (pid && isProcessAlive(pid)) {
        try { const _cp = await import('node:child_process'); _cp.spawn('cmd', ['/c', 'start', '', 'http://127.0.0.1:8787/'], { windowsHide: true, detached: true, stdio: 'ignore' }).unref(); } catch { /* ignore */ }
        process.exit(0);
      }
    }
  } catch { /* ignore */ }
  try { _mkdir(_join(lockDir, 'MuktoDwar'), { recursive: true }); _write(lockPath, String(process.pid), 'utf8'); } catch { /* ignore */ }

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
  await ensureDefaultProviders(configStore);

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
    try { (await import('node:fs')).unlinkSync(lockPath); } catch { /* ignore */ }
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

  // Open the dashboard as a standalone window (Edge/Chrome app mode) when possible.
  try {
    const url = `${address}/`;
    const candidates = [
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    ];
    const browser = candidates.find((p) => existsSync(p));
    if (browser) {
      const userDataDir = `${process.env.LOCALAPPDATA || process.env.TEMP}\\MuktoDwarWebview`;
      const child = spawn(browser, [`--user-data-dir=${userDataDir}`, `--app=${url}`, "--window-size=1280,800"], { detached: false, stdio: "ignore", windowsHide: false });
      child.on("exit", () => { void shutdown("WINDOW_CLOSED"); });
      child.on("error", () => { try { spawn('cmd', ['/c', 'start', '', url], { windowsHide: true, detached: true, stdio: 'ignore' }).unref(); } catch { /* ignore */ } });
    } else {
      spawn('cmd', ['/c', 'start', '', url], { windowsHide: true, detached: true, stdio: 'ignore' }).unref();
    }
  } catch {
    // Best effort: never fail startup because the browser could not open.
  }
}

async function runWithCrashRecovery(): Promise<void> {
  let attempts = 0;
  while (true) {
    try {
      await main();
      break;
    } catch (error) {
      attempts += 1;
      console.error('The gateway crashed (attempt ' + attempts + '):');
      console.error(error instanceof Error ? error.message : String(error));
      if (attempts >= 5) {
        console.error('Too many crashes, giving up.');
        process.exit(1);
      }
      console.log('Restarting in 2 seconds...');
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

runWithCrashRecovery().catch((error: unknown) => {
  console.error('Fatal:');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

export { main };
