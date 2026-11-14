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
      ZARINPAL_MERCHANT_ID: '',
      ZARINPAL_ENV: '',
      ZARINPAL_CAFE_IDS: '',
      ...overrides,
    },
  });
}
test('optional providers may stay disabled for local pay-on-receipt operation', () => {
  const result = inspect();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /غیرفعال؛ اختیاری/);
});

const merchantId = '12345678-abcd-1234-abcd-123456789abc';
const livePayment = {
  ZARINPAL_MERCHANT_ID: merchantId,
  ZARINPAL_ENV: 'live',
  ZARINPAL_CAFE_IDS: 'cafe-one,cafe-two',
  APP_ORIGIN: 'https://vitco.example.com',
};

test('Zarinpal stays disabled when absent and fails incomplete or invalid configuration without exposing values', () => {
  assert.match(inspect().stdout, /درگاه زرین‌پال: غیرفعال/);
  for (const overrides of [
    { ZARINPAL_MERCHANT_ID: merchantId },
    { ZARINPAL_MERCHANT_ID: ' ' },
    { ...livePayment, ZARINPAL_MERCHANT_ID: 'truncated-merchant-never-print' },
    { ...livePayment, ZARINPAL_MERCHANT_ID: merchantId + ' ' },
    { ...livePayment, ZARINPAL_ENV: '' },
    { ...livePayment, ZARINPAL_ENV: 'production' },
    { ...livePayment, ZARINPAL_ENV: 'Live' },
    { ...livePayment, ZARINPAL_CAFE_IDS: '' },
    { ...livePayment, ZARINPAL_CAFE_IDS: 'cafe-one,' },
    { ...livePayment, ZARINPAL_CAFE_IDS: 'cafe-one, cafe-two' },
    { ...livePayment, ZARINPAL_CAFE_IDS: 'cafe-one,cafe-one' },
    { ...livePayment, ZARINPAL_CAFE_IDS: '*,cafe-one' },
    { ...livePayment, ZARINPAL_CAFE_IDS: '../cafe-one' },
  ]) {
    const result = inspect(overrides);
    assert.equal(result.status, 1);
    for (const value of [merchantId, 'truncated-merchant-never-print']) {
      assert.ok(!result.stdout.includes(value));
      assert.ok(!result.stderr.includes(value));
    }
  }
});

test('live Zarinpal requires a canonical public HTTPS origin even in local readiness mode', () => {
  for (const APP_ORIGIN of [
    '',
    'http://vitco.example.com',
    'https://localhost',
    'https://127.0.0.2',
    'https://10.0.0.1',
    'https://192.168.1.1',
    'https://172.16.0.1',
    'https://[::1]',
    'https://cafe.local',
    'https://vitco.example.com/path',
    'https://vitco.example.com/',
    'https://user:secret@vitco.example.com',
  ]) {
    assert.equal(inspect({ ...livePayment, APP_ORIGIN }).status, 1, APP_ORIGIN);
  }
  assert.equal(inspect(livePayment).status, 0);
  assert.equal(inspect({ ...livePayment, ZARINPAL_CAFE_IDS: '*' }, true).status, 0);
});

test('sandbox configuration is explicit and remains clearly a non-live environment', () => {
  const result = inspect({
    ...livePayment,
    ZARINPAL_ENV: 'sandbox',
    APP_ORIGIN: 'http://localhost:3000',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /فقط محیط آزمایشی/);
  assert.ok(!result.stdout.includes(merchantId));
  assert.equal(inspect({ ...livePayment, ZARINPAL_ENV: 'sandbox', APP_ORIGIN: '' }).status, 1);
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
