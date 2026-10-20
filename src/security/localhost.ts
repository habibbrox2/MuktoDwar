/**
 * Localhost guard.
 *
 * The gateway is a local-only service. This module is the single place that
 * decides whether a bind address is acceptable, and it fails closed: if the
 * address cannot be proven to be loopback, startup aborts.
 *
 * Two independent checks are applied:
 *  1. The listen address must be a loopback literal.
 *  2. Inbound requests must carry a loopback `Host` header, which blocks
 *     DNS-rebinding attacks that would otherwise let a remote page reach a
 *     service bound to 127.0.0.1.
 */

/** Addresses the gateway is allowed to bind to. */
export const ALLOWED_BIND_HOSTS = ['127.0.0.1'] as const;

/** Loopback host names a browser may use to reach the gateway. */
const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** Raised when a bind address is not loopback. */
export class LocalhostGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalhostGuardError';
  }
}

/**
 * Assert that the gateway is bound to loopback only.
 *
 * @throws {LocalhostGuardError} when the host is not an allowed bind address.
 */
export function assertLoopbackBind(host: string): void {
  const normalized = host.trim().toLowerCase();
  if (!(ALLOWED_BIND_HOSTS as readonly string[]).includes(normalized)) {
    throw new LocalhostGuardError(
      `Refusing to start: the gateway may only bind to ${ALLOWED_BIND_HOSTS.join(', ')}, but was asked to bind to "${host}".`,
    );
  }
}

/**
 * True when a hostname refers to the loopback interface.
 */
export function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  if (LOOPBACK_HOSTNAMES.has(normalized)) return true;
  // Any address in 127.0.0.0/8 is loopback.
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalized);
}

/**
 * Validate the `Host` header of an inbound request.
 *
 * A request whose Host header is not loopback is rejected. This stops a
 * remote page from resolving an attacker-controlled domain to 127.0.0.1 and
 * then talking to the gateway as if it were a local origin.
 */
export function isAllowedHostHeader(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false;
  // Strip the port. A Host header may be "127.0.0.1:8787" or "[::1]:8787".
  const withoutPort = hostHeader.startsWith('[')
    ? hostHeader.slice(0, hostHeader.indexOf(']') + 1)
    : hostHeader.split(':')[0];
  if (withoutPort === undefined) return false;
  return isLoopbackHostname(withoutPort);
}

/**
 * Determine whether a request origin matches the local origin of the
 * gateway. Used to reject cross-origin state-changing requests.
 */
export function isSameOriginRequest(headers: {
  origin?: string | undefined;
  host?: string | undefined;
}): boolean {
  const origin = headers.origin;
  if (!origin) {
    // A request without an Origin header is not a browser cross-origin
    // request. Non-browser clients (the OpenAI SDK, curl) omit it, and
    // those are authenticated by the bearer token instead.
    return true;
  }
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  return isLoopbackHostname(parsed.hostname);
}
