import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { smsAvailable, mailAvailable } from '../src/lib/auth';

const script = fileURLToPath(new URL('../scripts/check-readiness.mjs', import.meta.url));
function inspect(overrides: Record<string, string> = {}, production = false) {
  return spawnSync(process.execPath, [script, ...(production ? ['--production'] : [])], {
    encoding: 'utf8',
    env: {
      ...process.env,
      APP_ORIGIN: 'http://localhost:3000',
      KAVENEGAR_API_KEY: '',
      KAVENEGAR_TEMPLATE: '',
      RESEND_API_KEY: '',
      MAIL_FROM: '',
      SUPPORT_USER_ID: '',
      ...overrides,
    },
  });
}
test('optional providers may stay disabled for local pay-on-receipt operation', () => {
  const result = inspect();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /غیرفعال؛ اختیاری/);
});
test('partial provider configuration fails without exposing credentials', () => {
  const secret = 'test-only-secret-never-print-this';
  const result = inspect({ RESEND_API_KEY: secret });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /تنظیمات ناقص/);
  assert.ok(!result.stdout.includes(secret));
  assert.ok(!result.stderr.includes(secret));
});
test('deployment configuration requires a canonical public HTTPS origin', () => {
  for (const APP_ORIGIN of [
    '',
    'http://example.test',
    'https://localhost',
    'https://example.test/path',
    'https://example.test/',
    'https://user:secret@example.test',
    ' https://example.test',
  ]) {
    assert.equal(inspect({ APP_ORIGIN }, true).status, 1, APP_ORIGIN);
  }
  assert.equal(inspect({ APP_ORIGIN: 'https://vitco.example.test' }, true).status, 0);
});
test('whitespace-only provider keys never enable sign-in or recovery', () => {
  const keys = ['KAVENEGAR_API_KEY', 'KAVENEGAR_TEMPLATE', 'RESEND_API_KEY', 'MAIL_FROM'] as const;
  const previous = keys.map((key) => process.env[key]);
  try {
    keys.forEach((key) => {
      process.env[key] = '  ';
    });
    assert.equal(smsAvailable(), false);
    assert.equal(mailAvailable(), false);
  } finally {
    keys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
  }
});
