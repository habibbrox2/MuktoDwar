/**
 * Redaction tests.
 *
 * The gateway must never log an API key, a bearer token, or a value it
 * knows to be secret.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  REDACTED,
  clearSecretValues,
  redactRequestSummary,
  redactString,
  redactValue,
  registerSecretValue,
  registeredSecretCount,
  unregisterSecretValue,
} from '../src/security/redact.js';

describe('redaction', () => {
  afterEach(() => {
    clearSecretValues();
  });

  it('redacts OpenAI-style keys', () => {
    const output = redactString('using key sk-abcdefghijklmnopqrstuvwxyz012345 now');
    expect(output).not.toContain('sk-abcdefghijklmnopqrstuvwxyz012345');
    expect(output).toContain(REDACTED);
  });

  it('redacts Google API keys', () => {
    const key = `AIza${'B'.repeat(30)}`;
    expect(redactString(`key=${key}`)).not.toContain(key);
  });

  it('redacts bearer tokens', () => {
    const output = redactString('Authorization: Bearer abcdefghijklmnop12345');
    expect(output).not.toContain('abcdefghijklmnop12345');
  });

  it('redacts secret-looking JSON fields', () => {
    const output = redactString('{"api_key":"my-super-secret-key","model":"x"}');
    expect(output).not.toContain('my-super-secret-key');
    expect(output).toContain('model');
  });

  it('redacts tokens in query strings', () => {
    const output = redactString('/v1/models?access_token=abcdef1234567890&x=1');
    expect(output).not.toContain('abcdef1234567890');
  });

  it('redacts JSON web tokens', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    expect(redactString(`token=${jwt}`)).not.toContain(jwt);
  });

  it('redacts an explicitly registered secret', () => {
    registerSecretValue('my-unique-provider-key-1234');
    const output = redactString('the key is my-unique-provider-key-1234 here');
    expect(output).not.toContain('my-unique-provider-key-1234');
    expect(registeredSecretCount()).toBe(1);
  });

  it('forgets a registered secret', () => {
    registerSecretValue('my-unique-provider-key-1234');
    unregisterSecretValue('my-unique-provider-key-1234');
    expect(registeredSecretCount()).toBe(0);
  });

  it('ignores very short values, which would corrupt unrelated output', () => {
    registerSecretValue('abc');
    expect(registeredSecretCount()).toBe(0);
  });

  it('redacts nested structures', () => {
    const output = redactValue({
      headers: { authorization: 'Bearer abcdefghijklmnop12345' },
      items: [{ apiKey: 'sk-abcdefghijklmnopqrstuvwxyz012345' }],
    });
    const text = JSON.stringify(output);
    expect(text).not.toContain('sk-abcdefghijklmnopqrstuvwxyz012345');
    expect(text).not.toContain('abcdefghijklmnop12345');
  });

  it('redacts error messages', () => {
    const output = redactValue(new Error('failed with sk-abcdefghijklmnopqrstuvwxyz012345'));
    expect(JSON.stringify(output)).not.toContain('sk-abcdefghijklmnopqrstuvwxyz012345');
  });

  it('strips the query string from a request summary', () => {
    const summary = redactRequestSummary({
      method: 'POST',
      url: '/v1/chat/completions?api_key=abcdef1234567890',
      statusCode: 200,
      durationMs: 12.7,
    });
    expect(summary.path).toBe('/v1/chat/completions');
    expect(JSON.stringify(summary)).not.toContain('abcdef1234567890');
    expect(summary.durationMs).toBe(13);
  });
});
