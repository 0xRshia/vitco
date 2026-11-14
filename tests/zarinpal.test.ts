import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getZarinpalConfig,
  isCafeOnlinePayable,
  zarinpalPublicConfig,
  requestZarinpalPayment,
  verifyZarinpalPayment,
  inquireZarinpalPayment,
  ZarinpalError,
  type ZarinpalTransport,
} from '../src/lib/zarinpal';

const merchantId = '00000000-0000-4000-8000-000000000001';
const liveAuthority = 'A' + '0'.repeat(35),
  sandboxAuthority = 'S' + '1'.repeat(35);
const environmentKeys = [
  'ZARINPAL_MERCHANT_ID',
  'ZARINPAL_ENV',
  'ZARINPAL_CAFE_IDS',
  'APP_ORIGIN',
] as const;
const validConfig = {
  ZARINPAL_MERCHANT_ID: merchantId,
  ZARINPAL_ENV: 'live',
  ZARINPAL_CAFE_IDS: '*',
  APP_ORIGIN: 'https://vitco.example.com',
};
function withEnvironment(values: Record<string, string>, work: () => void) {
  const before = environmentKeys.map((key) => process.env[key]);
  try {
    for (const key of environmentKeys) process.env[key] = values[key] || '';
    work();
  } finally {
    environmentKeys.forEach((key, index) => {
      if (before[index] === undefined) delete process.env[key];
      else process.env[key] = before[index];
    });
  }
}
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const requestInput = {
  merchantId,
  sandbox: false,
  amountRial: 1200000,
  callbackUrl: 'https://vitco.example.com/api/payments/callback?state=opaque',
  description: 'پرداخت سفارش ویتکو',
  orderId: 'order-one',
};
const verifyInput = { merchantId, sandbox: false, amountRial: 1200000, authority: liveAuthority };

test('configuration is explicit, fail closed, scoped, and never exposes the terminal ID publicly', () => {
  withEnvironment({}, () => {
    assert.equal(getZarinpalConfig(), null);
    assert.deepEqual(zarinpalPublicConfig(), {
      available: false,
      cafe_ids: [],
      all_cafes: false,
      sandbox: false,
    });
  });
  for (const overrides of [
    { ZARINPAL_MERCHANT_ID: 'truncated' },
    { ZARINPAL_MERCHANT_ID: merchantId + ' ' },
    { ZARINPAL_ENV: '' },
    { ZARINPAL_ENV: 'Live' },
    { ZARINPAL_ENV: 'production' },
    { ZARINPAL_CAFE_IDS: '' },
    { ZARINPAL_CAFE_IDS: 'one, one' },
    { ZARINPAL_CAFE_IDS: 'one,one' },
    { ZARINPAL_CAFE_IDS: 'one,' },
    { ZARINPAL_CAFE_IDS: '*,one' },
    { ZARINPAL_CAFE_IDS: '../one' },
  ])
    withEnvironment({ ...validConfig, ...overrides }, () =>
      assert.equal(getZarinpalConfig(), null),
    );
  withEnvironment(validConfig, () => {
    assert.equal(getZarinpalConfig()?.merchantId, merchantId);
    assert.equal(isCafeOnlinePayable('any-cafe'), true);
    assert.deepEqual(zarinpalPublicConfig(), {
      available: true,
      cafe_ids: [],
      all_cafes: true,
      sandbox: false,
    });
    assert.equal(JSON.stringify(zarinpalPublicConfig()).includes(merchantId), false);
  });
  withEnvironment({ ...validConfig, ZARINPAL_CAFE_IDS: 'one,two' }, () => {
    assert.equal(isCafeOnlinePayable('one'), true);
    assert.equal(isCafeOnlinePayable('other'), false);
    assert.deepEqual(zarinpalPublicConfig().cafe_ids, ['one', 'two']);
  });
});

test('live callbacks require canonical public HTTPS; sandbox is explicitly labeled and permits localhost', () => {
  for (const APP_ORIGIN of [
    '',
    'http://vitco.example.com',
    'https://localhost',
    'https://cafe.local',
    'https://127.0.0.2',
    'https://10.0.0.1',
    'https://192.168.1.1',
    'https://172.16.0.1',
    'https://100.64.0.1',
    'https://169.254.1.1',
    'https://[::1]',
    'https://vitco.example.test',
    'https://vitco.example.com/',
    'https://vitco.example.com/path',
    'https://user:password@vitco.example.com',
    'https://vitco.example.com:443',
  ]) {
    withEnvironment({ ...validConfig, APP_ORIGIN }, () =>
      assert.equal(getZarinpalConfig(), null, APP_ORIGIN),
    );
  }
  withEnvironment(
    { ...validConfig, ZARINPAL_ENV: 'sandbox', APP_ORIGIN: 'http://localhost:3100' },
    () => {
      assert.equal(getZarinpalConfig()?.sandbox, true);
      assert.equal(zarinpalPublicConfig().sandbox, true);
    },
  );
});

test('request sends exact stored rial amount, explicit IRR, callback-controlled verification, and trusted redirect', async () => {
  let calls = 0;
  const transport: ZarinpalTransport = async (url, init) => {
    calls += 1;
    assert.equal(url, 'https://payment.zarinpal.com/pg/v4/payment/request.json');
    assert.equal(init.method, 'POST');
    assert.equal(init.redirect, 'error');
    assert.equal(init.signal instanceof AbortSignal, true);
    assert.deepEqual(JSON.parse(String(init.body)), {
      merchant_id: merchantId,
      amount: 1200000,
      currency: 'IRR',
      callback_url: requestInput.callbackUrl,
      description: requestInput.description,
      metadata: { order_id: 'order-one', auto_verify: false },
    });
    return response({ data: { code: 100, authority: liveAuthority }, errors: [] });
  };
  assert.deepEqual(await requestZarinpalPayment(requestInput, transport), {
    authority: liveAuthority,
    url: 'https://payment.zarinpal.com/pg/StartPay/' + liveAuthority,
  });
  assert.equal(calls, 1);
  const sandbox = await requestZarinpalPayment(
    { ...requestInput, sandbox: true, callbackUrl: 'http://localhost:3100/api/payments/callback' },
    async (url) => {
      assert.equal(url, 'https://sandbox.zarinpal.com/pg/v4/payment/request.json');
      return response({ data: { code: 100, authority: sandboxAuthority } });
    },
  );
  assert.equal(sandbox.url, 'https://sandbox.zarinpal.com/pg/StartPay/' + sandboxAuthority);
});

test('verification accepts provider codes 100/101 and preserves large numeric reference IDs exactly', async () => {
  for (const code of [100, 101]) {
    const verified = await verifyZarinpalPayment(verifyInput, async (url, init) => {
      assert.equal(url, 'https://payment.zarinpal.com/pg/v4/payment/verify.json');
      assert.deepEqual(JSON.parse(String(init.body)), {
        merchant_id: merchantId,
        amount: 1200000,
        authority: liveAuthority,
      });
      return new Response(
        '{"data":{"code":' +
          code +
          ',"ref_id":900719925474099312345,"message":"quoted \\\"ref_id\\\":12, braces }"},"errors":[]}',
      );
    });
    assert.equal(verified.refId, '900719925474099312345');
  }
  assert.deepEqual(
    await verifyZarinpalPayment(verifyInput, async () =>
      response({ data: { code: 100, ref_id: '123456' } }),
    ),
    { refId: '123456' },
  );
  assert.deepEqual(
    await verifyZarinpalPayment(verifyInput, async () =>
      response({ data: { code: 100, ref_id: 201 } }),
    ),
    { refId: '201' },
  );
});

test('inquiry exposes only documented advisory states and never substitutes for verification', async () => {
  for (const status of ['VERIFIED', 'PAID', 'IN_BANK', 'FAILED', 'REVERSED'] as const) {
    assert.deepEqual(
      await inquireZarinpalPayment(
        { merchantId, sandbox: false, authority: liveAuthority },
        async (url, init) => {
          assert.equal(url, 'https://payment.zarinpal.com/pg/v4/payment/inquiry.json');
          assert.deepEqual(JSON.parse(String(init.body)), {
            merchant_id: merchantId,
            authority: liveAuthority,
          });
          return response({ data: { code: 100, status } });
        },
      ),
      { status },
    );
  }
  await assert.rejects(
    inquireZarinpalPayment({ merchantId, sandbox: false, authority: liveAuthority }, async () =>
      response({ data: { code: 100, status: 'UNKNOWN' } }),
    ),
    ZarinpalError,
  );
});

test('invalid request inputs fail before transport; provider responses cannot create untrusted redirects or fake success', async () => {
  let calls = 0;
  const never: ZarinpalTransport = async () => {
    calls += 1;
    throw new Error('must not call');
  };
  for (const input of [
    { ...requestInput, amountRial: 0 },
    { ...requestInput, amountRial: 1.5 },
    { ...requestInput, amountRial: Number.MAX_SAFE_INTEGER + 1 },
    { ...requestInput, amountRial: 1000000001 },
    { ...requestInput, merchantId: 'partial' },
    { ...requestInput, callbackUrl: 'http://localhost:3000/callback' },
    { ...requestInput, callbackUrl: 'https://user:secret@vitco.example.com/callback' },
  ])
    await assert.rejects(requestZarinpalPayment(input, never));
  await assert.rejects(
    verifyZarinpalPayment({ ...verifyInput, authority: sandboxAuthority }, never),
  );
  assert.equal(calls, 0);
  for (const data of [
    { code: 100, authority: 'https://evil.example/path' },
    { code: 100, authority: sandboxAuthority },
    { code: 101, authority: liveAuthority },
    { code: 100 },
  ]) {
    await assert.rejects(
      requestZarinpalPayment(requestInput, async () => response({ data })),
      ZarinpalError,
    );
  }
  for (const ref_id of [null, 0, -1, 'not-paid', '1e12', true])
    await assert.rejects(
      verifyZarinpalPayment(verifyInput, async () => response({ data: { code: 100, ref_id } })),
      ZarinpalError,
    );
});

test('provider failures and timeouts are sanitized, distinguish uncertainty, and never automatically retry', async () => {
  for (const code of [-9, -10, -12, -14, -50, -51, -53, -54]) {
    await assert.rejects(
      verifyZarinpalPayment(verifyInput, async () =>
        response({ data: {}, errors: { code, message: 'diagnostic secret ' + merchantId } }, 400),
      ),
      (error: unknown) => {
        assert.ok(error instanceof ZarinpalError);
        assert.equal(error.providerCode, code);
        assert.equal(error.message.includes(merchantId), false);
        assert.equal(error.message.includes('diagnostic'), false);
        return true;
      },
    );
  }
  let calls = 0;
  await assert.rejects(
    requestZarinpalPayment(requestInput, async () => {
      calls += 1;
      throw new DOMException('secret diagnostic', 'TimeoutError');
    }),
    (error: unknown) => {
      assert.ok(error instanceof ZarinpalError);
      assert.equal(error.retryable, true);
      assert.equal(error.message.includes('secret'), false);
      return true;
    },
  );
  assert.equal(calls, 1);
  for (const transport of [
    async () => new Response('<html>gateway unavailable</html>', { status: 502 }),
    async () => response({ data: { code: 100, ref_id: 201 } }, 500),
    async () => new Response('{"data":', { status: 200 }),
    async () => new Response('x'.repeat(65537)),
  ])
    await assert.rejects(verifyZarinpalPayment(verifyInput, transport), ZarinpalError);
});

test('stored snapshot credentials remain usable for reconciliation after current configuration is disabled', async () => {
  const saved = environmentKeys.map((key) => process.env[key]);
  try {
    for (const key of environmentKeys) process.env[key] = '';
    assert.equal(getZarinpalConfig(), null);
    assert.equal(
      (
        await verifyZarinpalPayment(verifyInput, async () =>
          response({ data: { code: 101, ref_id: '201' } }),
        )
      ).refId,
      '201',
    );
  } finally {
    environmentKeys.forEach((key, index) => {
      if (saved[index] === undefined) delete process.env[key];
      else process.env[key] = saved[index];
    });
  }
});
