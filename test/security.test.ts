/**
 * Localhost guard and authentication tests.
 */

import { describe, expect, it } from 'vitest';
import {
  ALLOWED_BIND_HOSTS,
  LocalhostGuardError,
  assertLoopbackBind,
  isAllowedHostHeader,
  isLoopbackHostname,
  isSameOriginRequest,
} from '../src/security/localhost.js';
import {
  ADMIN_SESSION_COOKIE,
  AdminSessionStore,
  deriveSecretId,
  extractBearerToken,
  generateToken,
  safeEqual,
} from '../src/security/auth.js';

describe('localhost guard', () => {
  it('allows the loopback bind address', () => {
    expect(() => assertLoopbackBind('127.0.0.1')).not.toThrow();
  });

  it('refuses every non-loopback bind address', () => {
    for (const host of ['0.0.0.0', '::', '192.168.1.10', 'localhost', 'example.com', '']) {
      expect(() => assertLoopbackBind(host)).toThrow(LocalhostGuardError);
    }
  });

  it('only lists loopback addresses as allowed', () => {
    expect([...ALLOWED_BIND_HOSTS]).toEqual(['127.0.0.1']);
  });

  it('recognises loopback host names', () => {
    expect(isLoopbackHostname('localhost')).toBe(true);
    expect(isLoopbackHostname('127.0.0.1')).toBe(true);
    expect(isLoopbackHostname('127.1.2.3')).toBe(true);
    expect(isLoopbackHostname('[::1]')).toBe(true);
    expect(isLoopbackHostname('evil.example.com')).toBe(false);
    expect(isLoopbackHostname('10.0.0.1')).toBe(false);
  });

  it('accepts a loopback Host header with a port', () => {
    expect(isAllowedHostHeader('127.0.0.1:8787')).toBe(true);
    expect(isAllowedHostHeader('localhost:8787')).toBe(true);
    expect(isAllowedHostHeader('[::1]:8787')).toBe(true);
  });

  it('rejects a Host header pointing elsewhere', () => {
    expect(isAllowedHostHeader('evil.example.com')).toBe(false);
    expect(isAllowedHostHeader('10.0.0.5:8787')).toBe(false);
    expect(isAllowedHostHeader(undefined)).toBe(false);
    expect(isAllowedHostHeader('')).toBe(false);
  });

  it('rejects a cross-origin mutation', () => {
    expect(isSameOriginRequest({ origin: 'http://evil.example.com' })).toBe(false);
    expect(isSameOriginRequest({ origin: 'https://evil.example.com' })).toBe(false);
  });

  it('accepts a local origin and a request with no origin', () => {
    expect(isSameOriginRequest({ origin: 'http://127.0.0.1:8787' })).toBe(true);
    expect(isSameOriginRequest({ origin: 'http://localhost:8787' })).toBe(true);
    expect(isSameOriginRequest({})).toBe(true);
  });
});

describe('authentication', () => {
  it('compares strings safely', () => {
    expect(safeEqual('abcdef', 'abcdef')).toBe(true);
    expect(safeEqual('abcdef', 'abcdeg')).toBe(false);
    expect(safeEqual('abcdef', 'abcdefg')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });

  it('extracts a bearer token', () => {
    expect(extractBearerToken('Bearer abc123')).toBe('abc123');
    expect(extractBearerToken('bearer abc123')).toBe('abc123');
    expect(extractBearerToken('Basic abc123')).toBeNull();
    expect(extractBearerToken('Bearer ')).toBeNull();
    expect(extractBearerToken(undefined)).toBeNull();
  });

  it('generates distinct, URL-safe tokens', () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.length).toBeGreaterThan(32);
  });

  it('derives a stable, non-reversible secret id', () => {
    const id = deriveSecretId('sk', 'my-provider-key');
    expect(id).toMatch(/^sk_[0-9a-f]{16}$/);
    expect(id).not.toContain('my-provider-key');
    expect(deriveSecretId('sk', 'my-provider-key')).toBe(id);
    expect(deriveSecretId('sk', 'another-key')).not.toBe(id);
  });

  it('issues and validates admin sessions', () => {
    const sessions = new AdminSessionStore(60_000);
    const id = sessions.issue();
    expect(sessions.validate(id)).toBe(true);
    expect(sessions.validate('not-a-session')).toBe(false);
    expect(sessions.validate(undefined)).toBe(false);
  });

  it('revokes an admin session', () => {
    const sessions = new AdminSessionStore(60_000);
    const id = sessions.issue();
    sessions.revoke(id);
    expect(sessions.validate(id)).toBe(false);
  });

  it('expires an admin session', async () => {
    const sessions = new AdminSessionStore(1);
    const id = sessions.issue();
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(sessions.validate(id)).toBe(false);
  });

  it('names the session cookie consistently', () => {
    expect(ADMIN_SESSION_COOKIE).toBe('lag_session');
  });
});
