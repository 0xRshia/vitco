import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { all, database, one, run } from '../src/lib/database';
import { createOrder, createReservation, transitionOrder } from '../src/lib/commerce';
import { startPayment, checkPayment, paymentCallback } from '../src/lib/payments';
import type { Order, User } from '../src/lib/types';
import type { ZarinpalTransport } from '../src/lib/zarinpal';

const directory = mkdtempSync(join(tmpdir(), 'vitco-payments-'));
process.env.DATABASE_PATH = join(directory, 'test.sqlite');
const keys = ['ZARINPAL_MERCHANT_ID', 'ZARINPAL_ENV', 'ZARINPAL_CAFE_IDS', 'APP_ORIGIN'] as const;
const previous = keys.map((key) => process.env[key]);
const merchantId = '00000000-0000-4000-8000-000000000002';
const owner: User = {
  id: 'owner',
  name: 'مدیر پرداخت',
  email: 'owner@example.test',
  phone: '',
  avatar: '',
  points: 0,
};
const buyer: User = { ...owner, id: 'buyer', name: 'خریدار پرداخت', email: 'buyer@example.test' };
const stranger: User = {
  ...owner,
  id: 'stranger',
  name: 'حساب دیگر',
  email: 'stranger@example.test',
};
const authority = () => 'S' + randomUUID().replaceAll('-', '') + '000';
const json = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
const paymentRows = (orderId: string) =>
  all<{
    id: string;
    status: string;
    authority: string;
    state_hash: string;
    verify_lock_until: number;
    amount_rial: number;
    ref_id: string;
  }>('SELECT * FROM payments WHERE order_id=? ORDER BY rowid', orderId);
const orderRow = (orderId: string) => one<Order>('SELECT * FROM orders WHERE id=?', orderId)!;
function makeOrder(paymentMethod = 'zarinpal') {
  return createOrder(buyer, {
    items: [{ product_id: 'coffee', quantity: 1, size_id: '', addon_ids: [] }],
    mode: 'pickup',
    payment_method: paymentMethod,
    request_key: randomUUID(),
  });
}
function inputFrom(callback: URL, status = 'OK') {
  return {
    payment: callback.searchParams.get('payment'),
    state: callback.searchParams.get('state'),
    Authority: callback.searchParams.get('authority'),
    Status: status,
  };
}
function gateway(options: { inquiry?: string; verifyCode?: number; ref?: string } = {}) {
  const calls = { request: 0, inquiry: 0, verify: 0 };
  let callback = new URL('https://unused.example.com'),
    expectedAmount = 0;
  const token = authority();
  const transport: ZarinpalTransport = async (url, init) => {
    const body = JSON.parse(String(init.body));
    assert.equal(body.merchant_id, merchantId);
    if (url.endsWith('/request.json')) {
      calls.request += 1;
      callback = new URL(body.callback_url);
      callback.searchParams.set('authority', token);
      expectedAmount = body.amount;
      assert.equal(body.currency, 'IRR');
      assert.equal(body.metadata.auto_verify, false);
      return json({ data: { code: 100, authority: token } });
    }
    assert.equal(body.authority, token);
    if (url.endsWith('/inquiry.json')) {
      calls.inquiry += 1;
      return json({ data: { code: 100, status: options.inquiry || 'PAID' } });
    }
    calls.verify += 1;
    assert.equal(body.amount, expectedAmount);
    return json({
      data: { code: options.verifyCode || 100, ref_id: options.ref || '12345678901234567890' },
    });
  };
  return { transport, calls, token, callback: () => callback, amount: () => expectedAmount };
}
before(() => {
  process.env.ZARINPAL_MERCHANT_ID = merchantId;
  process.env.ZARINPAL_ENV = 'sandbox';
  process.env.ZARINPAL_CAFE_IDS = '*';
  process.env.APP_ORIGIN = 'http://localhost:3100';
  database();
  for (const user of [owner, buyer, stranger])
    run(
      'INSERT INTO users (id,name,email,created_at) VALUES (?,?,?,?)',
      user.id,
      user.name,
      user.email,
      new Date().toISOString(),
    );
  run(
    'INSERT INTO cafes (id,owner_id,name,description,city,address,phone,capacity,pickup,active) VALUES (?,?,?,?,?,?,?,?,1,1)',
    'cafe',
    owner.id,
    'کافه پرداخت',
    'پایگاه موقت آزمون',
    'تهران',
    'خیابان آزمون',
    '09123456789',
    20,
  );
  run(
    'INSERT INTO products (id,cafe_id,name,description,category,price) VALUES (?,?,?,?,?,?)',
    'coffee',
    'cafe',
    'قهوه',
    'آزمون',
    'قهوه',
    123456,
  );
});
after(() => {
  keys.forEach((key, index) => {
    if (previous[index] === undefined) delete process.env[key];
    else process.env[key] = previous[index];
  });
  database().close();
  rmSync(directory, { recursive: true, force: true });
});

test('only buyer starts payment; buyer and café owner may check; offline orders never contact provider', async () => {
  const id = makeOrder(),
    provider = gateway();
  await assert.rejects(startPayment(owner, id, provider.transport), /خریدار/);
  await assert.rejects(startPayment(stranger, id, provider.transport), /خریدار/);
  await assert.rejects(checkPayment(stranger, id, provider.transport), /دسترسی/);
  assert.deepEqual(await checkPayment(owner, id, provider.transport), {
    status: 'unpaid',
    ref_id: '',
  });
  assert.throws(() => transitionOrder(owner, id, 'preparing'), /پرداخت آنلاین/);
  const offline = makeOrder('offline');
  await assert.rejects(startPayment(buyer, offline, provider.transport), /آنلاین نیست/);
  assert.deepEqual(await checkPayment(buyer, offline, provider.transport), {
    status: 'unpaid',
    ref_id: '',
  });
  assert.equal(provider.calls.request, 0);
});

test('stored rial amount, secure callback binding, and repeated callbacks finalize exactly once without rewards', async () => {
  const id = makeOrder(),
    provider = gateway();
  const points = one<{ points: number }>('SELECT points FROM users WHERE id=?', buyer.id)!.points;
  const started = await startPayment(buyer, id, provider.transport);
  assert.ok('url' in started);
  assert.equal(provider.amount(), 1234560);
  assert.equal(orderRow(id).payment_status, 'pending');
  const stored = paymentRows(id)[0],
    callback = inputFrom(provider.callback());
  assert.notEqual(stored.state_hash, callback.state);
  await assert.rejects(
    paymentCallback({ ...callback, state: 'f'.repeat(64) }, provider.transport),
    /شناسه بازگشت/,
  );
  await assert.rejects(
    paymentCallback({ ...callback, Authority: authority() }, provider.transport),
    /مطابقت/,
  );
  assert.equal(provider.calls.verify, 0);
  assert.throws(() => transitionOrder(buyer, id, 'cancelled'), /نتیجه پرداخت/);
  const result = await paymentCallback(callback, provider.transport);
  assert.deepEqual(result, { origin: 'http://localhost:3100', orderId: id, result: 'success' });
  assert.equal(orderRow(id).payment_status, 'paid');
  assert.equal(orderRow(id).payment_ref, '12345678901234567890');
  assert.equal(paymentRows(id)[0].status, 'paid');
  assert.equal(paymentRows(id)[0].verify_lock_until, 0);
  await paymentCallback(callback, provider.transport);
  await checkPayment(owner, id, provider.transport);
  assert.deepEqual(await startPayment(buyer, id, provider.transport), { paid: true });
  assert.equal(provider.calls.verify, 1);
  assert.equal(provider.calls.request, 1);
  assert.equal(
    one<{ points: number }>('SELECT points FROM users WHERE id=?', buyer.id)!.points,
    points,
  );
  transitionOrder(owner, id, 'preparing');
});

test('NOK is advisory: pending bank session resumes one authority, and paid inquiry still requires verify', async () => {
  const id = makeOrder(),
    provider = gateway({ inquiry: 'IN_BANK' });
  const first = await startPayment(buyer, id, provider.transport);
  assert.equal(
    (await paymentCallback(inputFrom(provider.callback(), 'NOK'), provider.transport)).result,
    'pending',
  );
  assert.equal(orderRow(id).payment_status, 'pending');
  assert.deepEqual(await startPayment(buyer, id, provider.transport), first);
  assert.equal(provider.calls.request, 1);
  assert.equal(provider.calls.verify, 0);
  const paid: ZarinpalTransport = async (url, init) =>
    url.endsWith('/inquiry.json')
      ? json({ data: { code: 100, status: 'PAID' } })
      : provider.transport(url, init);
  assert.equal(
    (await paymentCallback(inputFrom(provider.callback(), 'NOK'), paid)).result,
    'success',
  );
  assert.equal(provider.calls.verify, 1);
});

test('configuration may be disabled after initiation without breaking snapshot reconciliation', async () => {
  const id = makeOrder(),
    provider = gateway({ verifyCode: 101 });
  await startPayment(buyer, id, provider.transport);
  process.env.ZARINPAL_MERCHANT_ID = '';
  process.env.APP_ORIGIN = 'http://other-localhost:3000';
  try {
    assert.equal((await checkPayment(buyer, id, provider.transport)).status, 'paid');
    const callback = await paymentCallback(inputFrom(provider.callback()), provider.transport);
    assert.equal(callback.origin, 'http://localhost:3100');
  } finally {
    process.env.ZARINPAL_MERCHANT_ID = merchantId;
    process.env.APP_ORIGIN = 'http://localhost:3100';
  }
});

test('concurrent initiation creates one attempt and never sends duplicate gateway requests', async () => {
  const id = makeOrder(),
    provider = gateway();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const transport: ZarinpalTransport = async (url, init) => {
    await gate;
    return provider.transport(url, init);
  };
  const first = startPayment(buyer, id, transport);
  await assert.rejects(startPayment(buyer, id, provider.transport), /هنوز مشخص نیست/);
  assert.equal(paymentRows(id).length, 1);
  release();
  await first;
  assert.equal(provider.calls.request, 1);
});

test('verification lease makes simultaneous checks idempotent and releases the lock', async () => {
  const id = makeOrder(),
    provider = gateway();
  await startPayment(buyer, id, provider.transport);
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((resolve) => {
      release = resolve;
    }),
    waiting = new Promise<void>((resolve) => {
      entered = resolve;
    });
  const transport: ZarinpalTransport = async (url, init) => {
    if (url.endsWith('/verify.json')) {
      entered();
      await gate;
    }
    return provider.transport(url, init);
  };
  const first = checkPayment(buyer, id, transport);
  await waiting;
  assert.equal((await checkPayment(owner, id, provider.transport)).status, 'pending');
  assert.equal(provider.calls.verify, 0);
  assert.equal(provider.calls.inquiry, 1);
  release();
  assert.equal((await first).status, 'paid');
  assert.equal(provider.calls.verify, 1);
  assert.equal(paymentRows(id)[0].verify_lock_until, 0);
});

test('transport uncertainty blocks new charges; no-authority attempts retire only after their lease', async () => {
  const id = makeOrder();
  let calls = 0;
  const uncertain: ZarinpalTransport = async () => {
    calls += 1;
    throw new Error('transport failed');
  };
  await assert.rejects(startPayment(buyer, id, uncertain), /ارتباط مطمئن/);
  assert.equal(paymentRows(id)[0].status, 'unknown');
  await assert.rejects(startPayment(buyer, id, uncertain), /هنوز مشخص نیست/);
  assert.equal(calls, 1);
  run('UPDATE payments SET updated_at=? WHERE order_id=?', Date.now() - 61000, id);
  const provider = gateway();
  await startPayment(buyer, id, provider.transport);
  assert.deepEqual(
    paymentRows(id).map((p) => p.status),
    ['failed', 'pending'],
  );
  assert.equal(provider.calls.request, 1);
});

test('inquiry errors preserve uncertainty and only confirmed failure permits a new attempt', async () => {
  const id = makeOrder(),
    first = gateway();
  await startPayment(buyer, id, first.transport);
  const outage: ZarinpalTransport = async () => {
    throw new Error('outage');
  };
  assert.equal((await checkPayment(buyer, id, outage)).status, 'pending');
  await assert.rejects(startPayment(buyer, id, outage), /هنوز مشخص نیست/);
  assert.equal(paymentRows(id).length, 1);
  const second = gateway();
  const retry: ZarinpalTransport = async (url, init) =>
    url.endsWith('/inquiry.json')
      ? json({ data: { code: 100, status: 'FAILED' } })
      : second.transport(url, init);
  await startPayment(buyer, id, retry);
  assert.deepEqual(
    paymentRows(id).map((p) => p.status),
    ['failed', 'pending'],
  );
  assert.equal(second.calls.request, 1);
});

test('a retired initiation never delivers a stale payment URL after a process pause', async () => {
  const id = makeOrder(),
    old = gateway(),
    current = gateway();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const delayed: ZarinpalTransport = async (url, init) => {
    await gate;
    return old.transport(url, init);
  };
  const first = startPayment(buyer, id, delayed);
  run('UPDATE payments SET updated_at=? WHERE order_id=?', Date.now() - 61000, id);
  await startPayment(buyer, id, current.transport);
  release();
  await assert.rejects(first, /دیگر قابل استفاده نیست/);
  assert.deepEqual(
    paymentRows(id).map((p) => p.status),
    ['failed', 'pending'],
  );
});

test('cancelled and expired-reservation payments are recorded for manual refund without fulfillment', async () => {
  const cancelled = makeOrder(),
    provider = gateway();
  await startPayment(buyer, cancelled, provider.transport);
  run("UPDATE orders SET status='cancelled' WHERE id=?", cancelled);
  assert.equal(
    (await paymentCallback(inputFrom(provider.callback()), provider.transport)).result,
    'failed',
  );
  assert.equal(orderRow(cancelled).payment_status, 'refund_required');
  assert.equal(paymentRows(cancelled)[0].status, 'paid');
  assert.ok(
    one(
      'SELECT id FROM notifications WHERE user_id=? AND title=?',
      owner.id,
      'نیاز به بررسی بازگشت وجه',
    ),
  );
  const date = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const reservation = createReservation(buyer, {
    cafe_id: 'cafe',
    date,
    time: '10:00',
    guests: 2,
    request_key: randomUUID(),
    payment_method: 'zarinpal',
    items: [{ product_id: 'coffee', quantity: 1, size_id: '', addon_ids: [] }],
  });
  const order = one<Order>('SELECT * FROM orders WHERE reservation_id=?', reservation)!;
  const late = gateway();
  await startPayment(buyer, order.id, late.transport);
  run("UPDATE reservations SET date='2020-01-01' WHERE id=?", reservation);
  await paymentCallback(inputFrom(late.callback()), late.transport);
  assert.equal(orderRow(order.id).payment_status, 'refund_required');
  assert.throws(() => transitionOrder(owner, order.id, 'preparing'), /پرداخت آنلاین/);
  const resumeReservation = createReservation(buyer, {
    cafe_id: 'cafe',
    date,
    time: '11:00',
    guests: 2,
    request_key: randomUUID(),
    payment_method: 'zarinpal',
    items: [{ product_id: 'coffee', quantity: 1, size_id: '', addon_ids: [] }],
  });
  const resumeOrder = one<Order>('SELECT * FROM orders WHERE reservation_id=?', resumeReservation)!;
  const resumeProvider = gateway();
  await startPayment(buyer, resumeOrder.id, resumeProvider.transport);
  await assert.rejects(
    startPayment(buyer, resumeOrder.id, async () => {
      run("UPDATE reservations SET date='2020-01-01' WHERE id=?", resumeReservation);
      return json({ data: { code: 100, status: 'IN_BANK' } });
    }),
    /زمان رزرو/,
  );
  assert.equal(resumeProvider.calls.verify, 0);
});

test('late double payment keeps both verified references and requires a manual refund', async () => {
  const id = makeOrder(),
    first = gateway({ ref: '111' }),
    second = gateway({ ref: '222' });
  await startPayment(buyer, id, first.transport);
  await startPayment(buyer, id, async (url, init) =>
    url.endsWith('/inquiry.json')
      ? json({ data: { code: 100, status: 'FAILED' } })
      : second.transport(url, init),
  );
  await paymentCallback(inputFrom(first.callback()), first.transport);
  assert.equal(orderRow(id).payment_status, 'paid');
  await paymentCallback(inputFrom(second.callback()), second.transport);
  assert.equal(orderRow(id).payment_status, 'refund_required');
  assert.equal(orderRow(id).payment_ref, '111');
  assert.deepEqual(
    paymentRows(id).map((p) => p.ref_id),
    ['111', '222'],
  );
});

test('verification always sends immutable attempt amount and detects changed order totals', async () => {
  const id = makeOrder(),
    provider = gateway();
  await startPayment(buyer, id, provider.transport);
  run('UPDATE orders SET total=total+1 WHERE id=?', id);
  await checkPayment(buyer, id, provider.transport);
  assert.equal(orderRow(id).payment_status, 'refund_required');
  assert.equal(paymentRows(id)[0].amount_rial, 1234560);
});
