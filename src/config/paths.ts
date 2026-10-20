/**
 * Filesystem paths, atomic writes, and ACL hardening.
 *
 * All runtime state lives under %LOCALAPPDATA%\LocalAIGateway so that a
 * reinstall or a repository wipe does not destroy configuration. Writes are
 * atomic (write to a temp file in the same directory, then rename) so an
 * interrupted write can never leave a truncated configuration file behind.
 */

import { constants } from 'node:fs';
import { access, chmod, mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Directory that holds all gateway state. */
export function stateDir(): string {
  const base = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local');
  return join(base, 'LocalAIGateway');
}

/** Path of the persisted configuration document. */
export function configPath(): string {
  return join(stateDir(), 'config.json');
}

/** Path of the persisted (encrypted) secret index. */
export function secretsPath(): string {
  return join(stateDir(), 'secrets.json');
}

/** Path of the file that records the admin session secret id. */
export function adminTokenPath(): string {
  return join(stateDir(), 'admin-token.txt');
}

/** Path of the marker written once the admin token has been rotated. */
export function adminTokenRotatedPath(): string {
  return join(stateDir(), 'admin-token-rotated');
}

/** Ensure the state directory exists and is readable. */
export async function ensureStateDir(): Promise<string> {
  const dir = stateDir();
  await mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Write a file atomically.
 *
 * The temporary file is created in the destination directory so that the
 * final rename is a same-volume operation and therefore atomic.
 */
export async function atomicWriteFile(
  filePath: string,
  contents: string,
  mode = 0o600,
): Promise<void> {
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });
  const tempPath = join(dir, `.${basename(filePath)}.${process.pid}.${randomUUID()}.tmp`);

  const handle = await open(tempPath, 'w', mode);
  try {
    await handle.writeFile(contents, 'utf8');
    // Flush to disk before the rename so a power loss cannot leave a
    // zero-length file where a valid document used to be.
    await handle.sync();
  } finally {
    await handle.close();
  }

  try {
    await rename(tempPath, filePath);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }

  await chmod(filePath, mode).catch(() => {
    // chmod is advisory on some filesystems; failure here is not fatal
    // because the ACL hardening step below is the real protection.
  });
}

/** Read a UTF-8 file, returning null when it does not exist. */
export async function readFileIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

/** True when the path exists. */
export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/** Size of a file in bytes, or 0 when it does not exist. */
export async function fileSize(filePath: string): Promise<number> {
  try {
    const info = await stat(filePath);
    return info.size;
  } catch {
    return 0;
  }
}

/**
 * Restrict a path to the current Windows user and administrators.
 *
 * DPAPI already binds a ciphertext to the current user, so this is defence
 * in depth: it stops other local accounts from reading the file at all, and
 * it stops the plaintext portions (model names, routing settings) from being
 * edited by another account.
 *
 * Failure is reported to the caller but is not fatal; the file remains
 * protected by DPAPI for secret material.
 */
export async function restrictToCurrentUser(targetPath: string): Promise<boolean> {
  if (process.platform !== 'win32') {
    await chmod(targetPath, 0o600).catch(() => undefined);
    return false;
  }
  const user = process.env.USERNAME;
  if (!user) return false;
  try {
    await execFileAsync('icacls', [
      targetPath,
      '/inheritance:r',
      '/grant:r',
      `${user}:(F)`,
      '*S-1-5-32-544:(F)',
    ], { windowsHide: true, timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}
