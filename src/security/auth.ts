/**
 * Authentication for the gateway.
 *
 * Two credentials exist, both generated on first run and stored DPAPI-encrypted:
 *  - The gateway token authorises the OpenAI-compatible `/v1` API. Clients
 *    send it as `Authorization: Bearer <token>`.
 *  - The admin token authorises `/admin` endpoints and the admin UI. The
 *    browser exchanges it once for an httpOnly session cookie so the token
 *    itself never reaches browser storage.
 *
 * All comparisons are constant-time.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { SecretStore } from './secret-store.js';

/** Name of the admin session cookie. */
export const ADMIN_SESSION_COOKIE = 'lag_session';

/** How long an admin session stays valid, in milliseconds. */
export const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/** Errors raised by the authentication layer. */
export class AuthError extends Error {
  readonly statusCode: number;
  readonly code: string;
  constructor(code: string, message: string, statusCode = 401) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Compare two strings without leaking their contents through timing.
 *
 * Lengths are compared first; unequal lengths are rejected without running
 * the comparison, because a length mismatch is not a secret.
 */
export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) {
    // Still perform a comparison so the timing does not depend on the length.
    timingSafeEqual(bufferA, bufferA);
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}

/** Generate a URL-safe random token. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** A single admin session. */
interface AdminSession {
  readonly id: string;
  readonly expiresAt: number;
}

/** Issues and validates admin sessions. */
export class AdminSessionStore {
  private readonly sessions = new Map<string, AdminSession>();
  private readonly ttlMs: number;

  constructor(ttlMs: number = ADMIN_SESSION_TTL_MS) {
    this.ttlMs = ttlMs;
  }

  /** Create a session and return its opaque id. */
  issue(): string {
    const id = randomBytes(32).toString('base64url');
    this.sessions.set(id, { id, expiresAt: Date.now() + this.ttlMs });
    return id;
  }

  /** True when the session id is valid and unexpired. */
  validate(sessionId: string | undefined): boolean {
    if (!sessionId) return false;
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(sessionId);
      return false;
    }
    return true;
  }

  /** Revoke a session. */
  revoke(sessionId: string | undefined): void {
    if (sessionId) this.sessions.delete(sessionId);
  }

  /** Remove expired sessions. */
  prune(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (session.expiresAt <= now) this.sessions.delete(id);
    }
  }

  /** Number of live sessions. */
  get size(): number {
    return this.sessions.size;
  }
}

/** Extract a bearer token from the Authorization header. */
export function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match?.[1]) return null;
  const token = match[1].trim();
  return token.length > 0 ? token : null;
}

/**
 * Resolve the gateway token from the secret store.
 *
 * The token is read from the store on each call so that a rotated token
 * takes effect immediately.
 */
export async function resolveGatewayToken(secrets: SecretStore): Promise<string | null> {
  const records = secrets.list().filter((record) => record.kind === 'gateway-token');
  const first = records[0];
  if (!first) return null;
  try {
    return await secrets.get(first.id);
  } catch {
    return null;
  }
}

/**
 * Verify a request against the gateway token.
 *
 * @throws {AuthError} when the token is missing or wrong.
 */
export async function assertGatewayToken(
  request: FastifyRequest,
  secrets: SecretStore,
): Promise<void> {
  const presented = extractBearerToken(request.headers.authorization);
  if (!presented) {
    throw new AuthError('missing_token', 'A bearer token is required.');
  }
  const expected = await resolveGatewayToken(secrets);
  if (!expected) {
    throw new AuthError('no_token_configured', 'The gateway token has not been configured.', 503);
  }
  if (!safeEqual(presented, expected)) {
    throw new AuthError('invalid_token', 'The bearer token is not valid.');
  }
}

/**
 * Verify an admin request, accepting either the admin token as a bearer
 * token or a valid admin session cookie.
 */
export async function assertAdminAuth(
  request: FastifyRequest,
  secrets: SecretStore,
  sessions: AdminSessionStore,
): Promise<void> {
  const cookieSession = request.cookies[ADMIN_SESSION_COOKIE];
  if (sessions.validate(cookieSession)) return;

  const presented = extractBearerToken(request.headers.authorization);
  if (presented) {
    const adminRecords = secrets.list().filter((record) => record.kind === 'admin-token');
    const first = adminRecords[0];
    if (first) {
      try {
        const expected = await secrets.get(first.id);
        if (expected !== null && safeEqual(presented, expected)) return;
      } catch {
        // Fall through to the generic rejection below.
      }
    }
  }

  throw new AuthError('admin_unauthorized', 'Administrator authentication is required.');
}

/** Set the admin session cookie on a reply. */
export function setAdminSessionCookie(reply: FastifyReply, sessionId: string, secure: boolean): void {
  reply.setCookie(ADMIN_SESSION_COOKIE, sessionId, {
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    secure,
    maxAge: Math.floor(ADMIN_SESSION_TTL_MS / 1000),
  });
}

/** Clear the admin session cookie on a reply. */
export function clearAdminSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(ADMIN_SESSION_COOKIE, { path: '/' });
}

/**
 * Hash a token for indexing purposes.
 *
 * Used to derive stable, non-reversible ids for secrets so that a secret id
 * never embeds the secret itself.
 */
export function deriveSecretId(prefix: string, token: string): string {
  return `${prefix}_${createHash('sha256').update(token).digest('hex').slice(0, 16)}`;
}
