const REDACTED = '[REDACTED]';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'currentpassword',
  'newpassword',
  'confirmpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'cookie',
  'set-cookie',
  'secret',
  'jwt',
  'jwtsecret',
  'apikey',
  'privatekey',
]);

export function redactSensitiveData(value: unknown): unknown {
  return redactValue(value, new WeakSet<object>());
}

function redactValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return '[Circular]';
    }

    seen.add(value);

    return value.map((item) => redactValue(item, seen));
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (seen.has(value)) {
    return '[Circular]';
  }

  seen.add(value);

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      isSensitiveKey(key) ? REDACTED : redactValue(item, seen),
    ]),
  );
}

function isSensitiveKey(key: string) {
  const normalized = key.replace(/[_\s-]/g, '').toLowerCase();

  return SENSITIVE_KEYS.has(key.toLowerCase()) || SENSITIVE_KEYS.has(normalized);
}
