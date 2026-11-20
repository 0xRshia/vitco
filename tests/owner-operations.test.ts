import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { all, database, hydrate, one, run } from '../src/lib/database';
import {
  availableTables,
  cafeById,
  createReservation,
  transitionOrder,
  transitionReservation,
} from '../src/lib/commerce';
import { ownerAnalytics } from '../src/lib/owner-analytics';
import { adminApi } from '../src/lib/platform';
import { dashboardRedirect } from '../src/lib/cafe-links';
import { topOrderedProducts } from '../src/lib/home-ranking';
import { adjustCategoryPrices } from '../src/lib/pricing';
import type { CartLine, Order, User } from '../src/lib/types';

const directory = mkdtempSync(join(tmpdir(), 'vitco-owner-unit-'));
process.env.DATABASE_PATH = join(directory, 'test.sqlite');
const owner: User = {
  id: 'owner',
  name: 'مدیر آزمون',
  email: 'owner@example.test',
  phone: '',
  points: 0,
  avatar: '',
};
const buyer: User = { ...owner, id: 'buyer', name: 'مشتری اول', email: 'buyer@example.test' };
const second: User = { ...owner, id: 'second', name: 'مشتری دوم', email: 'second@example.test' };
const foreign: User = { ...owner, id: 'foreign', name: 'مدیر دیگر', email: 'foreign@example.test' };
const tomorrow = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
const line = (quantity = 1): CartLine => ({
  key: randomUUID(),
  product_id: 'coffee',
  cafe_id: 'cafe',
  name: 'قهوه',
  image: '',
  price: 100,
  quantity,
  size_id: '',
  addon_ids: [],
  option_names: [],
  note: '',
});
function order(user: User, created: string, status: string, items: CartLine[], cafe = 'cafe') {
  const id = randomUUID(),
    total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  run(
    'INSERT INTO orders (id,user_id,cafe_id,mode,status,items,subtotal,discount,delivery_fee,points_used,total,address,pickup_at,note,created_at,updated_at,request_key) VALUES (?,?,?,?,?,?,?,0,0,0,?,NULL,?,?,?,?,?)',
    id,
    user.id,
    cafe,
    'pickup',
    status,
    JSON.stringify(items),
    total,
    total,
    '',
    '',
    created,
    created,
    id,
  );
  return id;
}
before(() => {
  database();
  for (const user of [owner, buyer, second, foreign])
    run(
      'INSERT INTO users (id,name,email,created_at) VALUES (?,?,?,?)',
      user.id,
      user.name,
      user.email,
      new Date().toISOString(),
    );
  for (const [id, ownerId] of [
    ['cafe', owner.id],
    ['foreign-cafe', foreign.id],
  ])
    run(
      'INSERT INTO cafes (id,owner_id,name,description,city,address,phone,capacity,opens,closes,pickup) VALUES (?,?,?,?,?,?,?,?,?,?,1)',
      id,
      ownerId,
      'کافه آزمون',
      'پایگاه موقت آزمون',
      'تهران',
      'خیابان آزمون',
      '09123456789',
      6,
      '08:00',
      '22:00',
    );
  for (const [id, category, price, cafe] of [
    ['coffee', 'قهوه', 100, 'cafe'],
    ['hot', 'نوشیدنی گرم', 200, 'cafe'],
    ['food', 'غذا', 300, 'cafe'],
    ['foreign-product', 'قهوه', 50, 'foreign-cafe'],
  ] as const)
    run(
      'INSERT INTO products (id,cafe_id,name,description,category,price) VALUES (?,?,?,?,?,?)',
      id,
      cafe,
      id,
      'آزمون',
      category,
      price,
    );
});
after(() => {
  database().close();
  rmSync(directory, { recursive: true, force: true });
});

test('admin profiles rank completed purchases and keep customer activity isolated', (t) => {
  database().exec('BEGIN');
  t.after(() => database().exec('ROLLBACK'));
  const previousAdmin = process.env.PLATFORM_ADMIN_USER_ID;
  process.env.PLATFORM_ADMIN_USER_ID = owner.id;
  t.after(() => {
    if (previousAdmin === undefined) delete process.env.PLATFORM_ADMIN_USER_ID;
    else process.env.PLATFORM_ADMIN_USER_ID = previousAdmin;
  });
  const timestamp = '2026-09-10T09:00:00Z';
  order(buyer, timestamp, 'completed', [line(2), line(3)]);
  order(buyer, timestamp, 'cancelled', [line(15)], 'foreign-cafe');
  order(second, timestamp, 'completed', [line(12)], 'foreign-cafe');
  run(
    'INSERT INTO reviews (id,user_id,cafe_id,rating,body,created_at) VALUES (?,?,?,?,?,?),(?,?,?,?,?,?)',
    'review-buyer',
    buyer.id,
    'cafe',
    5,
    'قهوه عالی بود',
    timestamp,
    'review-second',
    second.id,
    'foreign-cafe',
    4,
    'برخورد خوب بود',
    timestamp,
  );
  const path = ['admin', 'users', buyer.id];
  const profile = adminApi(owner, path, 'GET', {}, new URLSearchParams());
  assert.ok('insights' in profile && profile.insights);
  assert.equal(profile.insights.favoriteCafe?.id, 'cafe');
  assert.equal(profile.insights.products.length, 1);
  assert.equal(profile.insights.products[0].quantity, 5);
  assert.deepEqual(
    profile.insights.reviews.map((review) => review.id),
    ['review-buyer'],
  );
  assert.throws(() => adminApi(second, path, 'GET', {}, new URLSearchParams()), { status: 403 });
});

test('source dashboard customer links keep the selected café and member', () => {
  assert.equal(
    dashboardRedirect(['dashboard', 'cafes', 'my-cafe', 'loyalty', 'members']),
    '/operations/my-cafe?tab=customers',
  );
  assert.equal(
    dashboardRedirect(['dashboard', 'cafes', 'my-cafe', 'loyalty', 'members', 'my-user']),
    '/operations/my-cafe?tab=customers&member=my-user',
  );
  assert.equal(
    dashboardRedirect(['dashboard', 'admin', 'users', 'my-user']),
    '/admin/users/my-user',
  );
});

test('home ranks current public products across cafés by quantities in completed menu orders', (t) => {
  database().exec('BEGIN');
  t.after(() => database().exec('ROLLBACK'));
  assert.deepEqual(topOrderedProducts(), []);
  run(`INSERT INTO products (id,cafe_id,name,description,category,price)
       VALUES ('cake','cafe','کیک','','دسر',100)`);
  const now = new Date().toISOString();
  const item = (product_id: string, quantity: number) => ({ ...line(quantity), product_id });
  order(buyer, now, 'completed', [item('coffee', 3), item('coffee', 2)]);
  order(second, now, 'completed', [item('food', 4), item('cake', 2), item('hot', 1)]);
  order(buyer, now, 'completed', [item('foreign-product', 7)], 'foreign-cafe');
  order(buyer, now, 'completed', [item('coffee', 10)], 'foreign-cafe');
  for (const status of ['pending', 'cancelled', 'rejected'])
    order(buyer, now, status, [item('hot', 20)]);
  const invoice = order(buyer, now, 'completed', [item('hot', 20)]);
  run("UPDATE orders SET kind='invoice' WHERE id=?", invoice);
  const ranked = topOrderedProducts();
  assert.deepEqual(
    ranked.map((product) => product.id),
    ['foreign-product', 'coffee', 'food', 'cake'],
  );
  assert.equal(ranked[0].cafe_name, 'کافه آزمون');
  assert.deepEqual(ranked[0].sizes, []);
  assert.equal(ranked[0].available, true);

  run("UPDATE products SET available=0 WHERE id='coffee'");
  run("UPDATE products SET vip_only=1 WHERE id='food'");
  run(`INSERT INTO menu_categories (id,cafe_id,name,position,visible)
       VALUES ('hidden','cafe','نوشیدنی گرم',0,0)`);
  run("UPDATE cafes SET active=0 WHERE id='foreign-cafe'");
  assert.deepEqual(
    topOrderedProducts().map((product) => product.id),
    ['cake'],
  );
  run("UPDATE cafes SET active=1,is_demo=1 WHERE id='foreign-cafe'");
  assert.deepEqual(
    topOrderedProducts().map((product) => product.id),
    ['cake'],
  );
});

test('analytics uses inclusive Tehran dates, real first orders, historical prices and owner isolation', () => {
  order(buyer, '2026-11-08T21:00:00.000Z', 'completed', [line()]);
  order(second, '2026-11-09T20:29:59.999Z', 'cancelled', [line(9)]);
  const completedId = order(second, '2026-11-09T20:30:00.000Z', 'completed', [line(2), line(3)]);
  order(buyer, '2026-11-10T10:00:00.000Z', 'pending', [line()]);
  const latest = order(second, '2026-11-11T20:30:00.000Z', 'pending', [line(2)]);
  order(foreign, '2026-11-10T10:00:00.000Z', 'completed', [line(90)], 'foreign-cafe');
  const result = ownerAnalytics(owner, { from: '2026-11-10', to: '2026-11-11' });
  assert.equal(result.order_count, 2);
  assert.equal(result.sales, 500);
  assert.equal(result.previous_sales, 100);
  assert.equal(result.sales_change_percent, 400);
  assert.equal(result.new_customer_count, 1);
  assert.equal(result.customers.length, 2);
  assert.equal(result.customers.find((c) => c.user_id === second.id)?.latest_order.id, latest);
  assert.deepEqual(
    result.top_items.map((p) => [p.quantity, p.order_count, p.revenue]),
    [[5, 1, 500]],
  );
  assert.equal(result.item_customers[0].order_count, 1);
  assert.deepEqual(
    result.daily_sales.map((d) => [d.date, d.sales]),
    [
      ['2026-11-10', 500],
      ['2026-11-11', 0],
    ],
  );
  assert.equal(result.previous_from, '2026-11-08');
  assert.equal(result.previous_to, '2026-11-09');
  assert.throws(
    () => ownerAnalytics(foreign, { from: '2026-11-10', to: '2026-11-11', cafe: 'cafe' }),
    /دسترسی/,
  );
  assert.throws(() => ownerAnalytics(owner, { from: '2026-11-12', to: '2026-11-10' }));
  assert.equal(
    hydrate<Order>(one('SELECT * FROM orders WHERE id=?', completedId)).items[0].price,
    100,
  );
});

test('category price changes require a current preview and apply atomically within ownership', () => {
  const input = {
    cafe_id: 'cafe',
    category: 'نوشیدنی',
    mode: 'percent',
    amount: 10,
    reason: 'inflation',
    preview: true,
  };
  const preview = adjustCategoryPrices(owner, input);
  assert.equal(preview.count, 2);
  assert.equal(
    one<{ price: number }>('SELECT price FROM products WHERE id=?', 'coffee')!.price,
    100,
  );
  const expected = preview.changes.map((c) => ({ id: c.id, price: c.old_price }));
  assert.throws(() => adjustCategoryPrices(second, input), /دسترسی/);
  assert.throws(
    () => adjustCategoryPrices(owner, { ...input, preview: false, expected: [] }),
    /پیش‌نمایش/,
  );
  adjustCategoryPrices(owner, { ...input, preview: false, expected });
  assert.equal(
    one<{ price: number }>('SELECT price FROM products WHERE id=?', 'coffee')!.price,
    110,
  );
  assert.equal(one<{ price: number }>('SELECT price FROM products WHERE id=?', 'hot')!.price, 220);
  assert.equal(one<{ price: number }>('SELECT price FROM products WHERE id=?', 'food')!.price, 300);
  assert.equal(
    one<{ price: number }>('SELECT price FROM products WHERE id=?', 'foreign-product')!.price,
    50,
  );
  assert.throws(
    () => adjustCategoryPrices(owner, { ...input, preview: false, expected }),
    /پیش‌نمایش/,
  );
  assert.throws(
    () => adjustCategoryPrices(owner, { ...input, mode: 'fixed', amount: -200 }),
    /قیمت نهایی/,
  );
  assert.equal(one<{ price: number }>('SELECT price FROM products WHERE id=?', 'hot')!.price, 220);
  assert.equal(all('SELECT id FROM price_adjustments').length, 1);
  const historical = all<Order>(
    'SELECT * FROM orders WHERE status=? AND cafe_id=?',
    'completed',
    'cafe',
  ).map(hydrate<Order>);
  assert.equal(historical[0].items[0].price, 100);
});

test('specific tables cannot be double booked, require enough seats, and release on cancellation', () => {
  run(
    'UPDATE cafes SET tables=? WHERE id=?',
    JSON.stringify([
      { id: 'two', name: 'میز دونفره', seats: 2 },
      { id: 'four', name: 'میز چهارنفره', seats: 4 },
    ]),
    'cafe',
  );
  const input = {
    cafe_id: 'cafe',
    date: tomorrow,
    time: '10:00',
    guests: 2,
    table_id: 'two',
    request_key: randomUUID(),
  };
  const id = createReservation(buyer, input);
  assert.equal(createReservation(buyer, input), id);
  const tables = availableTables(cafeById('cafe'), tomorrow, '10:00', 2);
  assert.equal(tables.find((t) => t.id === 'two')!.available, false);
  assert.equal(tables.find((t) => t.id === 'four')!.available, true);
  assert.throws(() => createReservation(second, { ...input, request_key: randomUUID() }), /میز/);
  assert.throws(
    () =>
      createReservation(second, { ...input, time: '12:00', guests: 3, request_key: randomUUID() }),
    /میز/,
  );
  assert.throws(
    () =>
      createReservation(second, {
        ...input,
        time: '12:00',
        table_id: '',
        request_key: randomUUID(),
      }),
    /میز/,
  );
  createReservation(second, { ...input, time: '11:00', request_key: randomUUID() });
  transitionReservation(buyer, id, 'cancelled');
  assert.equal(
    availableTables(cafeById('cafe'), tomorrow, '10:00', 2).find((t) => t.id === 'two')!.available,
    true,
  );
});

test('reservation and server-priced meal order are atomic and idempotent', () => {
  const input = {
    cafe_id: 'cafe',
    date: tomorrow,
    time: '14:00',
    guests: 2,
    table_id: 'two',
    request_key: randomUUID(),
    items: [{ product_id: 'coffee', quantity: 2, size_id: '', addon_ids: [], price: 1 }],
  };
  const beforeCount = all('SELECT id FROM reservations').length;
  assert.throws(
    () =>
      createReservation(buyer, {
        ...input,
        items: [{ ...input.items[0], addon_ids: ['invented'] }],
      }),
    /افزودنی/,
  );
  assert.equal(all('SELECT id FROM reservations').length, beforeCount);
  assert.throws(
    () =>
      createReservation(buyer, {
        ...input,
        items: [{ ...input.items[0], product_id: 'foreign-product' }],
      }),
    /همین کافه/,
  );
  assert.equal(all('SELECT id FROM reservations').length, beforeCount);
  assert.throws(
    () => createReservation(buyer, { ...input, expected_total: 1 }),
    /قیمت سفارش تغییر/,
  );
  assert.equal(all('SELECT id FROM reservations').length, beforeCount);
  const id = createReservation(buyer, input);
  assert.equal(createReservation(buyer, input), id);
  const orders = all<Order>('SELECT * FROM orders WHERE reservation_id=?', id).map(hydrate<Order>);
  assert.equal(orders.length, 1);
  assert.equal(orders[0].mode, 'dine_in');
  assert.equal(orders[0].total, 220);
  assert.equal(orders[0].items[0].price, 110);
  assert.equal(
    one<{ table_name: string }>('SELECT table_name FROM reservations WHERE id=?', id)!.table_name,
    'میز دونفره',
  );
  transitionReservation(buyer, id, 'cancelled');
  assert.equal(
    one<{ status: string }>('SELECT status FROM orders WHERE reservation_id=?', id)!.status,
    'cancelled',
  );
  assert.equal(
    availableTables(cafeById('cafe'), tomorrow, '14:00', 2).find((t) => t.id === 'two')!.available,
    true,
  );
});

test('cancellation never orphans a meal being prepared and preserves authorization atomically', () => {
  const input = {
    cafe_id: 'cafe',
    date: tomorrow,
    time: '15:00',
    guests: 2,
    table_id: 'two',
    request_key: randomUUID(),
    items: [{ product_id: 'coffee', quantity: 1, size_id: '', addon_ids: [] }],
  };
  const id = createReservation(buyer, input);
  const orderId = one<{ id: string }>('SELECT id FROM orders WHERE reservation_id=?', id)!.id;
  transitionOrder(owner, orderId, 'preparing');
  assert.throws(() => transitionReservation(buyer, id, 'cancelled'), /قابل لغو/);
  assert.equal(
    one<{ status: string }>('SELECT status FROM reservations WHERE id=?', id)!.status,
    'pending',
  );
  assert.equal(
    one<{ status: string }>('SELECT status FROM orders WHERE id=?', orderId)!.status,
    'preparing',
  );
  transitionReservation(owner, id, 'cancelled');
  assert.equal(
    one<{ status: string }>('SELECT status FROM orders WHERE id=?', orderId)!.status,
    'cancelled',
  );
});
