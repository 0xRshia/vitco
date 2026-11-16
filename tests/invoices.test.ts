import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { all, database, hydrate, one, run } from '../src/lib/database';
import { createInvoice, quoteInvoice } from '../src/lib/invoices';
import { createOrder, transitionOrder } from '../src/lib/commerce';
import { startPayment, paymentCallback } from '../src/lib/payments';
import { ownerAnalytics } from '../src/lib/owner-analytics';
import { today } from '../src/lib/format';
import type { Order, User } from '../src/lib/types';
import type { ZarinpalTransport } from '../src/lib/zarinpal';

const directory = mkdtempSync(join(tmpdir(), 'vitco-invoices-'));
process.env.DATABASE_PATH = join(directory, 'test.sqlite');
const keys = ['ZARINPAL_MERCHANT_ID', 'ZARINPAL_ENV', 'ZARINPAL_CAFE_IDS', 'APP_ORIGIN'] as const;
const previous = keys.map((key) => process.env[key]);
const owner: User = {
  id: 'owner',
  name: 'مدیر فاکتور',
  email: 'owner@example.test',
  phone: '',
  points: 0,
  avatar: '',
};
const buyer: User = { ...owner, id: 'buyer', name: 'مشتری فاکتور', email: 'buyer@example.test' };
const other: User = { ...owner, id: 'other', name: 'حساب دیگر', email: 'other@example.test' };
const count = () => one<{ count: number }>('SELECT COUNT(*) count FROM orders')!.count;
const payload = (patch: Record<string, unknown> = {}) => ({
  cafe_id: 'cafe',
  amount: 500000,
  expected_total: 350000,
  request_key: randomUUID(),
  ...patch,
});
const order = (id: string) => hydrate<Order>(one('SELECT * FROM orders WHERE id=?', id));

before(() => {
  process.env.ZARINPAL_MERCHANT_ID = '00000000-0000-4000-8000-000000000003';
  process.env.ZARINPAL_ENV = 'sandbox';
  process.env.ZARINPAL_CAFE_IDS = '*';
  process.env.APP_ORIGIN = 'http://localhost:3100';
  database();
  for (const user of [owner, buyer, other])
    run(
      'INSERT INTO users (id,name,email,created_at) VALUES (?,?,?,?)',
      user.id,
      user.name,
      user.email,
      new Date().toISOString(),
    );
  for (const [id, percent] of [
    ['cafe', 30],
    ['other-cafe', 0],
  ] as const)
    run(
      'INSERT INTO cafes (id,owner_id,name,description,city,address,phone,active,pickup,invoice_discount_percent) VALUES (?,?,?,?,?,?,?,1,1,?)',
      id,
      owner.id,
      'کافه فاکتور',
      'پایگاه موقت فاکتور',
      'تهران',
      'نشانی آزمون',
      '09123456789',
      percent,
    );
  run(
    'INSERT INTO products (id,cafe_id,name,description,category,price) VALUES (?,?,?,?,?,?)',
    'coffee',
    'cafe',
    'قهوه',
    'تست',
    'قهوه',
    50000,
  );
  for (const [id, cafe, code, percent, expires, max, uses] of [
    ['coupon-small', 'cafe', 'SMALL', 10, '2099-12-31', 10, 0],
    ['coupon-large', 'cafe', 'LARGE', 40, '2099-12-31', 10, 0],
    ['coupon-limit', 'cafe', 'ONCE', 50, '2099-12-31', 1, 0],
    ['coupon-expired', 'cafe', 'EXPIRED', 40, '2020-01-01', 10, 0],
    ['coupon-used', 'cafe', 'USED', 40, '2099-12-31', 1, 1],
    ['coupon-other', 'other-cafe', 'OTHER', 40, '2099-12-31', 10, 0],
    ['coupon-free', 'cafe', 'FREE', 100, '2099-12-31', 10, 0],
  ])
    run(
      'INSERT INTO coupons (id,cafe_id,code,percent,expires,max_uses,uses) VALUES (?,?,?,?,?,?,?)',
      id,
      cafe,
      code,
      percent,
      expires,
      max,
      uses,
    );
});
after(() => {
  keys.forEach((key, i) => {
    if (previous[i] === undefined) delete process.env[key];
    else process.env[key] = previous[i];
  });
  database().close();
  rmSync(directory, { recursive: true, force: true });
});

test('invoice arithmetic uses integer toman, a single largest discount and exact rounding', () => {
  assert.deepEqual(quoteInvoice({ cafe_id: 'cafe', amount: '۵۰۰۰۰۰' }), {
    cafe_id: 'cafe',
    subtotal: 500000,
    automatic_percent: 30,
    coupon_percent: 0,
    applied_percent: 30,
    coupon: '',
    discount: 150000,
    total: 350000,
  });
  assert.equal(quoteInvoice({ cafe_id: 'cafe', amount: 500001, coupon: ' small ' }).total, 350001);
  assert.equal(quoteInvoice({ cafe_id: 'cafe', amount: 500000, coupon: 'large' }).total, 300000);
  for (const amount of [0, -10, 1.5, 100000001, NaN, Infinity, 'invalid'])
    assert.throws(() => quoteInvoice({ cafe_id: 'cafe', amount }));
  assert.equal(quoteInvoice({ cafe_id: 'vitrin-aala', amount: 500000 }).discount, 0);
});
test('invoice coupon scope, expiry, usage limits and nonzero gateway amount are enforced', () => {
  for (const coupon of ['OTHER', 'EXPIRED', 'USED', 'MISSING', 'FREE'])
    assert.throws(() => quoteInvoice({ cafe_id: 'cafe', amount: 500000, coupon }));
  assert.equal(
    one<{ uses: number }>('SELECT uses FROM coupons WHERE id=?', 'coupon-large')!.uses,
    0,
  );
});
test('stale invoice totals and invalid cafés fail atomically without consuming coupons', () => {
  const before = count();
  assert.throws(
    () => createInvoice(buyer, payload({ expected_total: 1, coupon: 'LARGE' })),
    /تغییر کرده/,
  );
  assert.throws(() => createInvoice(buyer, payload({ cafe_id: 'vitrin-aala' })), /فعال نیست/);
  run('UPDATE cafes SET active=0 WHERE id=?', 'other-cafe');
  assert.throws(() => createInvoice(buyer, payload({ cafe_id: 'other-cafe' })), /فعال نیست/);
  run('UPDATE cafes SET active=1 WHERE id=?', 'other-cafe');
  assert.equal(count(), before);
  assert.equal(
    one<{ uses: number }>('SELECT uses FROM coupons WHERE id=?', 'coupon-large')!.uses,
    0,
  );
});
test('gateway-disabled invoice creation cannot create an unpaid pseudo-payment', () => {
  const before = count();
  process.env.ZARINPAL_CAFE_IDS = 'other-cafe';
  try {
    assert.throws(() => createInvoice(buyer, payload()), /درگاه/);
  } finally {
    process.env.ZARINPAL_CAFE_IDS = '*';
  }
  assert.equal(count(), before);
});
test('idempotent invoice creation binds amount, café, coupon and total; no fictional menu items', () => {
  const input = payload({ coupon: 'ONCE', expected_total: 250000 });
  const id = createInvoice(buyer, input);
  assert.equal(createInvoice(buyer, input), id);
  assert.throws(() => createInvoice(buyer, { ...input, amount: 500001 }), /شناسه/);
  assert.throws(() => createOrder(buyer, { request_key: input.request_key }), /فاکتور حضوری/);
  assert.equal(
    one<{ uses: number }>('SELECT uses FROM coupons WHERE id=?', 'coupon-limit')!.uses,
    1,
  );
  assert.deepEqual(order(id).items, []);
  assert.equal(order(id).kind, 'invoice');
  assert.equal(order(id).reservation_id, '');
  assert.equal(order(id).payment_status, 'unpaid');
  assert.equal(order(id).status, 'pending');
  assert.throws(() => transitionOrder(owner, id, 'preparing'), /فاکتور حضوری/);
  assert.throws(() => transitionOrder(owner, id, 'completed'), /فاکتور حضوری/);
  assert.throws(() => transitionOrder(other, id, 'cancelled'), /دسترسی/);
  transitionOrder(buyer, id, 'cancelled');
  assert.equal(order(id).status, 'cancelled');
});
test('verified invoice settles once, earns existing loyalty once, and reports revenue without invented product sales', async () => {
  const input = payload();
  const id = createInvoice(other, input);
  const initial = ownerAnalytics(owner, { from: today(), to: today(), cafe: 'cafe' });
  const token = 'S' + randomUUID().replaceAll('-', '') + '000';
  let callback: URL | undefined;
  let calls = 0;
  const transport: ZarinpalTransport = async (url, init) => {
    const body = JSON.parse(String(init.body));
    assert.equal(body.amount, 3500000);
    if (url.endsWith('/request.json')) {
      callback = new URL(body.callback_url);
      return new Response(JSON.stringify({ data: { code: 100, authority: token } }));
    }
    calls++;
    return new Response(JSON.stringify({ data: { code: 100, ref_id: '12345678901234567890' } }));
  };
  await startPayment(other, id, transport);
  assert.throws(() => transitionOrder(other, id, 'cancelled'), /نتیجه پرداخت/);
  const response = {
    payment: callback!.searchParams.get('payment'),
    state: callback!.searchParams.get('state'),
    Authority: token,
    Status: 'OK',
  };
  assert.equal((await paymentCallback(response, transport)).result, 'success');
  await paymentCallback(response, transport);
  assert.equal(calls, 1);
  assert.equal(order(id).status, 'completed');
  assert.equal(order(id).payment_status, 'paid');
  assert.equal(
    one<{ points: number }>('SELECT points FROM users WHERE id=?', other.id)!.points,
    35,
  );
  assert.equal(
    one<{ points: number }>(
      'SELECT points FROM loyalty_balances WHERE user_id=? AND cafe_id=?',
      other.id,
      'cafe',
    )!.points,
    35,
  );
  const report = ownerAnalytics(owner, { from: today(), to: today(), cafe: 'cafe' });
  assert.equal(report.sales - initial.sales, 350000);
  assert.equal(report.completed_order_count - initial.completed_order_count, 1);
  assert.deepEqual(report.top_items, initial.top_items);
  assert.deepEqual(report.item_customers, initial.item_customers);
  assert.equal(report.customers.find((c) => c.user_id === other.id)!.latest_order.kind, 'invoice');
  assert.equal(all('SELECT * FROM invoice_details WHERE order_id=?', id).length, 1);
});
