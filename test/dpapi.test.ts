/**
 * DPAPI driver tests.
 *
 * These exercise the real Windows DPAPI codec, because a mock would not
 * prove that the secret is actually protected at rest. The failure paths
 * are covered with injected executables and scripts.
 */

import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DpapiError,
  DpapiErrorCode,
  PowerShellDpapiDriver,
  assertDpapiScriptUsable,
  findDpapiScript,
  findPowerShell,
} from '../src/security/dpapi.js';

/** Locate the real codec script. */
async function realScript(): Promise<string> {
  const script = await findDpapiScript();
  if (!script) throw new Error('The DPAPI codec script could not be found.');
  return script;
}

describe('DPAPI driver', () => {
  it('finds powershell.exe and the codec script', async () => {
    const exe = await findPowerShell();
    const script = await findDpapiScript();
    expect(exe).toMatch(/powershell\.exe$/i);
    expect(script).toMatch(/dpapi\.ps1$/i);
  });

  it('round-trips a secret without exposing the plaintext', async () => {
    const driver = new PowerShellDpapiDriver({
      executablePath: (await findPowerShell())!,
      scriptPath: await realScript(),
    });

    const secret = 'sk-test-Ω-😀-0123456789abcdef';
    const ciphertext = await driver.protect(secret);

    expect(ciphertext).not.toContain('sk-test');
    expect(ciphertext.length).toBeGreaterThan(64);
    expect(ciphertext).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);

    const recovered = await driver.unprotect(ciphertext);
    expect(recovered).toBe(secret);

    await driver.close();
  });

  it('produces different ciphertext for the same plaintext', async () => {
    const driver = new PowerShellDpapiDriver({
      executablePath: (await findPowerShell())!,
      scriptPath: await realScript(),
    });
    const a = await driver.protect('same-input-value');
    const b = await driver.protect('same-input-value');
    expect(a).not.toBe(b);
    expect(await driver.unprotect(a)).toBe('same-input-value');
    expect(await driver.unprotect(b)).toBe('same-input-value');
    await driver.close();
  });

  it('batches many secrets in one round trip', async () => {
    const driver = new PowerShellDpapiDriver({
      executablePath: (await findPowerShell())!,
      scriptPath: await realScript(),
    });
    const values = ['alpha-secret', 'beta-secret', 'gamma-secret'];
    const encrypted = await driver.protectBatch(values);
    expect(encrypted).toHaveLength(3);
    const decrypted = await driver.unprotectBatch(encrypted);
    expect(decrypted).toEqual(values);
    await driver.close();
  });

  it('fails closed on corrupted ciphertext', async () => {
    const driver = new PowerShellDpapiDriver({
      executablePath: (await findPowerShell())!,
      scriptPath: await realScript(),
    });
    const ciphertext = await driver.protect('a-secret-value');
    const corrupted = `${ciphertext.slice(0, -8)}AAAAAAAA`;

    await expect(driver.unprotect(corrupted)).rejects.toThrow(DpapiError);
    await driver.close();
  });

  it('reports a missing PowerShell executable', async () => {
    const driver = new PowerShellDpapiDriver({
      executablePath: join(tmpdir(), 'definitely-not-powershell.exe'),
      scriptPath: await realScript(),
    });
    await expect(driver.protect('secret')).rejects.toMatchObject({
      code: DpapiErrorCode.PowerShellNotFound,
    });
    await driver.close();
  });

  it('reports a missing codec script', async () => {
    const driver = new PowerShellDpapiDriver({
      executablePath: (await findPowerShell())!,
      scriptPath: join(tmpdir(), 'missing-dpapi.ps1'),
    });
    await expect(driver.protect('secret')).rejects.toBeInstanceOf(DpapiError);
    await driver.close();
  });

  it('enforces a timeout on a hanging codec', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lag-slow-'));
    const slowScript = join(dir, 'slow.ps1');
    await writeFile(slowScript, 'Start-Sleep -Seconds 30\n', 'utf8');

    const driver = new PowerShellDpapiDriver({
      executablePath: (await findPowerShell())!,
      scriptPath: slowScript,
      timeoutMs: 1_500,
    });

    await expect(driver.protect('secret')).rejects.toMatchObject({
      code: DpapiErrorCode.Timeout,
    });
    await driver.close();
  }, 20_000);

  it('rejects malformed codec output', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lag-bad-'));
    const badScript = join(dir, 'bad.ps1');
    await writeFile(badScript, '[Console]::Out.Write("not json at all")\n', 'utf8');

    const driver = new PowerShellDpapiDriver({
      executablePath: (await findPowerShell())!,
      scriptPath: badScript,
    });

    await expect(driver.protect('secret')).rejects.toMatchObject({
      code: DpapiErrorCode.MalformedOutput,
    });
    await driver.close();
  });

  it('rejects a codec that returns the wrong number of results', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lag-count-'));
    const script = join(dir, 'count.ps1');
    await writeFile(script, '[Console]::Out.Write(\'{"results":[]}\')\n', 'utf8');

    const driver = new PowerShellDpapiDriver({
      executablePath: (await findPowerShell())!,
      scriptPath: script,
    });

    await expect(driver.protect('secret')).rejects.toMatchObject({
      code: DpapiErrorCode.MalformedOutput,
    });
    await driver.close();
  });

  it('never writes secret material to stderr or to the error message', async () => {
    const driver = new PowerShellDpapiDriver({
      executablePath: (await findPowerShell())!,
      scriptPath: await realScript(),
    });
    const secret = 'sk-must-not-leak-1234567890';
    const ciphertext = await driver.protect(secret);
    const corrupted = `${ciphertext.slice(0, -8)}AAAAAAAA`;

    try {
      await driver.unprotect(corrupted);
      expect.unreachable('unprotect should have thrown');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain(secret);
      expect(message).not.toContain(corrupted.slice(0, 32));
    }
    await driver.close();
  });

  it('rejects a codec script that does not reference ProtectedData', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'lag-wrong-'));
    const script = join(dir, 'wrong.ps1');
    await writeFile(script, 'Write-Output "hello"\n', 'utf8');
    await expect(assertDpapiScriptUsable(script)).rejects.toMatchObject({
      code: DpapiErrorCode.ScriptNotFound,
    });
  });
});
