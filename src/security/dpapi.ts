/**
 * DPAPI secret-protection driver.
 *
 * The gateway protects API keys at rest with Windows DPAPI (CurrentUser scope)
 * by delegating to a small PowerShell codec script. The Node process never
 * implements cryptography itself; it only marshals data to and from the
 * Windows crypto provider.
 *
 * Security properties enforced here:
 *  - Secret material only ever travels over the child's stdin/stdout pipes.
 *    It is never interpolated into argv, the command line, or an error message.
 *  - The child is spawned without a shell, with a fixed argv vector, so there
 *    is no shell interpolation surface at all.
 *  - Every invocation is bounded by a timeout; a hung child is killed.
 *  - Output is strictly validated. Malformed output fails closed.
 *  - Failures throw a typed error. There is no plaintext fallback path, ever.
 */

import { spawn } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Operations the DPAPI codec understands. */
export type DpapiMode = 'protect' | 'unprotect';

/** A single codec operation. */
export interface DpapiOp {
  readonly id: string;
  readonly mode: DpapiMode;
  readonly value: string;
}

/** Result of a single codec operation. */
export interface DpapiOpResult {
  readonly id: string;
  readonly ok: boolean;
  /** Present on success only. */
  readonly value?: string;
  /** Fixed error code on failure only. Never contains secret material. */
  readonly error?: string;
}

/**
 * Minimal interface for anything that can protect and unprotect a secret.
 *
 * A native (N-API) implementation can be added later without touching the
 * rest of the gateway, as long as it satisfies this contract.
 */
export interface DpapiDriver {
  /** Stable identifier, e.g. `powershell-dpapi`. */
  readonly id: string;
  protect(plaintext: string): Promise<string>;
  unprotect(ciphertext: string): Promise<string>;
  protectBatch(plaintexts: readonly string[]): Promise<readonly string[]>;
  unprotectBatch(ciphertexts: readonly string[]): Promise<readonly string[]>;
  /** Release any resources held by the driver. */
  close(): Promise<void>;
}

/** Machine-readable failure codes. Deliberately coarse so nothing leaks. */
export const DpapiErrorCode = {
  PowerShellNotFound: 'POWERSHELL_NOT_FOUND',
  ScriptNotFound: 'DPAPI_SCRIPT_NOT_FOUND',
  SpawnFailed: 'DPAPI_SPAWN_FAILED',
  Timeout: 'DPAPI_TIMEOUT',
  MalformedOutput: 'DPAPI_MALFORMED_OUTPUT',
  OperationFailed: 'DPAPI_OPERATION_FAILED',
  UnsupportedMode: 'DPAPI_UNSUPPORTED_MODE',
} as const;

export type DpapiErrorCodeValue = (typeof DpapiErrorCode)[keyof typeof DpapiErrorCode];

/** Error thrown by the DPAPI driver. Carries a code but never secret data. */
export class DpapiError extends Error {
  readonly code: DpapiErrorCodeValue;
  constructor(code: DpapiErrorCodeValue, message: string) {
    super(message);
    this.name = 'DpapiError';
    this.code = code;
  }
}

/** Configuration for {@link PowerShellDpapiDriver}. */
export interface PowerShellDpapiOptions {
  /** Absolute path to powershell.exe. */
  readonly executablePath: string;
  /** Absolute path to the codec script. */
  readonly scriptPath: string;
  /** Hard upper bound on a single codec invocation, in milliseconds. */
  readonly timeoutMs?: number;
  /** Hard cap on accepted stdout size, in bytes. */
  readonly maxOutputBytes?: number;
  /** Hard cap on accepted stdin size, in bytes. */
  readonly maxInputBytes?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_INPUT_BYTES = 1024 * 1024;

interface RawCodecResponse {
  readonly fatal?: string;
  readonly results?: ReadonlyArray<{
    readonly id?: string;
    readonly ok?: boolean;
    readonly value?: string;
    readonly error?: string;
  }>;
}

/**
 * Locate the DPAPI codec script.
 *
 * The script lives in `scripts/` at the repository root. This module may be
 * loaded from `src/` (ts-node/tsx) or from `dist/` (compiled), so the lookup
 * walks upwards from this file until it finds a directory that contains
 * `scripts/dpapi.ps1`.
 */
export async function findDpapiScript(startDir?: string): Promise<string | null> {
  const here = startDir ?? dirname(fileURLToPath(import.meta.url));
  let dir = resolve(here);
  for (let depth = 0; depth < 8; depth += 1) {
    const candidate = join(dir, 'scripts', 'dpapi.ps1');
    try {
      await access(candidate, constants.R_OK);
      return candidate;
    } catch {
      // keep walking
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Environment passed to the codec child.
 *
 * PowerShell and .NET expect a normal Windows process environment. When the
 * child received only `SystemRoot`, script startup on one machine (the
 * GitHub Actions Windows runner) took ~29s — far beyond the codec timeout —
 * because profile and temp path lookups had nothing to resolve. The list is
 * an explicit allowlist rather than the parent's full environment so that no
 * gateway-specific secret can leak into the child process.
 */
function codecEnvironment(): NodeJS.ProcessEnv {
  const allow = [
    'SystemRoot',
    'windir',
    'SystemDrive',
    'ComSpec',
    'PATH',
    'PATHEXT',
    'TEMP',
    'TMP',
    'USERNAME',
    'USERPROFILE',
    'HOMEDRIVE',
    'HOMEPATH',
    'APPDATA',
    'LOCALAPPDATA',
    'PUBLIC',
    'ProgramData',
    'ProgramFiles',
    'ProgramFiles(x86)',
    'ProgramW6432',
    'OS',
    'PROCESSOR_ARCHITECTURE',
    'PROCESSOR_ARCHITEW6432',
    'NUMBER_OF_PROCESSORS',
    'PSModulePath',
  ];
  const env: NodeJS.ProcessEnv = {};
  for (const name of allow) {
    const value = process.env[name];
    if (value !== undefined && value !== '') env[name] = value;
  }
  if (env.SystemRoot === undefined) env.SystemRoot = 'C:\\Windows';
  return env;
}

/** Locate powershell.exe via well-known install locations. */
export async function findPowerShell(): Promise<string | null> {
  const candidates = [
    join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    join(process.env.SystemRoot ?? 'C:\\Windows', 'SysWOW64', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK | constants.R_OK);
      return candidate;
    } catch {
      // try next
    }
  }
  return null;
}

/**
 * Validates that a value looks like DPAPI ciphertext produced by our codec:
 * standard base64 with a sensible length floor.
 */
function assertCiphertext(value: string): void {
  if (value.length === 0 || value.length > 64 * 1024) {
    throw new DpapiError(DpapiErrorCode.MalformedOutput, 'DPAPI ciphertext has an implausible length.');
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new DpapiError(DpapiErrorCode.MalformedOutput, 'DPAPI ciphertext is not valid base64.');
  }
}

/**
 * DPAPI driver backed by a PowerShell subprocess.
 *
 * The driver is stateless: ciphertext lives in the caller's store, and the
 * driver only ever handles the encode/decode step.
 */
export class PowerShellDpapiDriver implements DpapiDriver {
  readonly id = 'powershell-dpapi';
  private readonly options: Required<PowerShellDpapiOptions>;
  private closed = false;

  constructor(options: PowerShellDpapiOptions) {
    this.options = {
      timeoutMs: DEFAULT_TIMEOUT_MS,
      maxOutputBytes: DEFAULT_MAX_OUTPUT_BYTES,
      maxInputBytes: DEFAULT_MAX_INPUT_BYTES,
      ...options,
    };
  }

  async protect(plaintext: string): Promise<string> {
    const [out] = await this.protectBatch([plaintext]);
    if (out === undefined) {
      throw new DpapiError(DpapiErrorCode.OperationFailed, 'DPAPI protect returned no result.');
    }
    return out;
  }

  async unprotect(ciphertext: string): Promise<string> {
    const [out] = await this.unprotectBatch([ciphertext]);
    if (out === undefined) {
      throw new DpapiError(DpapiErrorCode.OperationFailed, 'DPAPI unprotect returned no result.');
    }
    return out;
  }

  async protectBatch(plaintexts: readonly string[]): Promise<readonly string[]> {
    if (plaintexts.length === 0) return [];
    const ops: DpapiOp[] = plaintexts.map((value, index) => ({
      id: `p${index}`,
      mode: 'protect',
      value,
    }));
    return this.runBatch(ops, plaintexts.length);
  }

  async unprotectBatch(ciphertexts: readonly string[]): Promise<readonly string[]> {
    if (ciphertexts.length === 0) return [];
    const ops: DpapiOp[] = ciphertexts.map((value, index) => ({
      id: `u${index}`,
      mode: 'unprotect',
      value,
    }));
    return this.runBatch(ops, ciphertexts.length);
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  /**
   * Execute one batched codec round-trip.
   *
   * All operations travel in a single child process so that storing N keys
   * costs one process spawn rather than N.
   */
  private async runBatch(ops: readonly DpapiOp[], expected: number): Promise<readonly string[]> {
    if (this.closed) {
      throw new DpapiError(DpapiErrorCode.SpawnFailed, 'DPAPI driver is closed.');
    }
    const payload = JSON.stringify({ ops });
    if (Buffer.byteLength(payload, 'utf8') > this.options.maxInputBytes) {
      throw new DpapiError(DpapiErrorCode.SpawnFailed, 'DPAPI request exceeds the maximum input size.');
    }

    const stdout = await this.invoke(payload);
    return this.parseResponse(stdout, expected);
  }

  /** Spawn the codec and collect stdout, enforcing the timeout. */
  private invoke(payload: string): Promise<string> {
    return new Promise<string>((resolvePromise, rejectPromise) => {
      const argv = [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        this.options.scriptPath,
      ];

      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(this.options.executablePath, argv, {
          // No shell: argv is passed to CreateProcess verbatim, so there is no
          // shell interpolation surface and no secret ever touches a command line.
          shell: false,
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: codecEnvironment(),
        });
      } catch (error) {
        rejectPromise(
          new DpapiError(
            DpapiErrorCode.SpawnFailed,
            `Failed to start the DPAPI codec: ${error instanceof Error ? error.message : 'unknown error'}`,
          ),
        );
        return;
      }

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let stdoutBytes = 0;
      let settled = false;
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, this.options.timeoutMs);
      // Do not hold the event loop open on the timer.
      timer.unref?.();

      const finish = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };

      child.stdout?.on('data', (chunk: Buffer) => {
        stdoutBytes += chunk.length;
        if (stdoutBytes > this.options.maxOutputBytes) {
          child.kill('SIGKILL');
          finish(() =>
            rejectPromise(
              new DpapiError(DpapiErrorCode.MalformedOutput, 'DPAPI codec produced too much output.'),
            ),
          );
          return;
        }
        stdoutChunks.push(chunk);
      });

      // stderr is drained and discarded. It is never surfaced, because a
      // PowerShell error record can echo request content.
      child.stderr?.on('data', (chunk: Buffer) => {
        if (stderrChunks.length < 32) stderrChunks.push(chunk);
      });

      child.on('error', (error: NodeJS.ErrnoException) => {
        finish(() => {
          const code =
            error.code === 'ENOENT'
              ? DpapiErrorCode.PowerShellNotFound
              : DpapiErrorCode.SpawnFailed;
          rejectPromise(new DpapiError(code, `DPAPI codec could not be started: ${error.message}`));
        });
      });

      child.on('close', (code: number | null) => {
        finish(() => {
          if (timedOut) {
            rejectPromise(
              new DpapiError(
                DpapiErrorCode.Timeout,
                `DPAPI codec did not complete within ${this.options.timeoutMs}ms.`,
              ),
            );
            return;
          }
          if (code !== 0) {
            rejectPromise(
              new DpapiError(
                DpapiErrorCode.OperationFailed,
                `DPAPI codec exited with status ${code ?? 'unknown'}.`,
              ),
            );
            return;
          }
          resolvePromise(Buffer.concat(stdoutChunks).toString('utf8'));
        });
      });

      child.stdin?.on('error', () => {
        // The child may exit before we finish writing; the close handler
        // reports the real failure. Swallow so we do not crash on EPIPE.
      });
      child.stdin?.end(payload, 'utf8');
    });
  }

  /** Strictly validate the codec's JSON response. */
  private parseResponse(stdout: string, expected: number): readonly string[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      throw new DpapiError(DpapiErrorCode.MalformedOutput, 'DPAPI codec returned invalid JSON.');
    }
    if (typeof parsed !== 'object' || parsed === null) {
      throw new DpapiError(DpapiErrorCode.MalformedOutput, 'DPAPI codec returned an unexpected shape.');
    }
    const response = parsed as RawCodecResponse;
    if (typeof response.fatal === 'string') {
      throw new DpapiError(DpapiErrorCode.OperationFailed, `DPAPI codec reported ${response.fatal}.`);
    }
    if (!Array.isArray(response.results) || response.results.length !== expected) {
      throw new DpapiError(
        DpapiErrorCode.MalformedOutput,
        'DPAPI codec returned an unexpected number of results.',
      );
    }

    const values: string[] = [];
    for (const result of response.results) {
      if (typeof result?.id !== 'string' || typeof result?.ok !== 'boolean') {
        throw new DpapiError(DpapiErrorCode.MalformedOutput, 'DPAPI codec returned a malformed result.');
      }
      if (!result.ok) {
        const code = typeof result.error === 'string' ? result.error : DpapiErrorCode.OperationFailed;
        throw new DpapiError(
          code === 'DPAPI_OPERATION_FAILED' ? DpapiErrorCode.OperationFailed : DpapiErrorCode.OperationFailed,
          'DPAPI operation failed; the secret could not be processed.',
        );
      }
      if (typeof result.value !== 'string') {
        throw new DpapiError(DpapiErrorCode.MalformedOutput, 'DPAPI codec returned a missing value.');
      }
      if (result.id.startsWith('p')) {
        assertCiphertext(result.value);
      }
      values.push(result.value);
    }
    return values;
  }
}

/**
 * Read the codec script to confirm it exists and is non-empty.
 * Used at startup to fail fast with a clear diagnostic.
 */
export async function assertDpapiScriptUsable(scriptPath: string): Promise<void> {
  try {
    const contents = await readFile(scriptPath, 'utf8');
    if (!contents.includes('ProtectedData')) {
      throw new DpapiError(
        DpapiErrorCode.ScriptNotFound,
        'The DPAPI codec script does not reference ProtectedData.',
      );
    }
  } catch (error) {
    if (error instanceof DpapiError) throw error;
    throw new DpapiError(DpapiErrorCode.ScriptNotFound, 'The DPAPI codec script could not be read.');
  }
}
