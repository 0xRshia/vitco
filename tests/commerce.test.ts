import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { User, Cafe, Order } from '../src/lib/types';

const temporary = mkdtempSync(join(tmpdir(), 'vitrin-unit-'));
process.env.DATABASE_PATH = join(temporary, 'test.sqlite');
import { database, run, one } from '../src/lib/database';
import {
  quote,
  createOrder,
  transitionOrder,
  availableSlots,
  createReservation,
  transitionReservation,
  cafeById,
} from '../src/lib/commerce';
import { passwordHash, passwordMatches } from '../src/lib/auth';
const owner: User = {
  id: 'owner',
  name: 'مالک آزمایشی',
  email: 'owner@example.test',
  phone: '',
  points: 0,
  avatar: '',
};
const buyer: User = {
  id: 'buyer',
  name: 'خریدار آزمایشی',
  email: 'buyer@example.test',
  phone: '',
  points: 10,
  avatar: '',
};
const stranger: User = { ...buyer, id: 'stranger', email: 'stranger@example.test' };
const tomorrow = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
const base = () => ({
  items: [
    { product_id: 'test-coffee', size_id: 'large', addon_ids: ['milk'], quantity: 2, note: '' },
  ],
  mode: 'pickup',
  coupon: '',
  points: 0,
  request_key: randomUUID(),
});
before(() => {
  database();
  for (const user of [owner, buyer, stranger])
    run(
      'INSERT INTO users (id,name,email,points,created_at) VALUES (?,?,?,?,?)',
      user.id,
      user.name,
      user.email,
      user.points,
      new Date().toISOString(),
    );
  run(
    'INSERT INTO cafes (id,owner_id,name,description,city,address,phone,capacity,opens,closes,pickup,delivery,delivery_fee) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    'test-cafe',
    owner.id,
    'کافه تست',
    'فقط در پایگاه داده موقت تست',
    'تهران',
    'نشانی آزمون',
    '09123456789',
    4,
    '08:00',
    '22:00',
    1,
    1,
    25000,
  );
  run(
    'INSERT INTO products (id,cafe_id,name,description,category,price,sizes,addons) VALUES (?,?,?,?,?,?,?,?)',
    'test-coffee',
    'test-cafe',
    'قهوه تست',
    'آزمون قیمت',
    'قهوه',
    100000,
    JSON.stringify([{ id: 'large', name: 'بزرگ', price: 20000 }]),
    JSON.stringify([{ id: 'milk', name: 'شیر', price: 10000 }]),
  );
  run(
    'INSERT INTO coupons (id,cafe_id,code,percent,expires,max_uses) VALUES (?,?,?,?,?,?)',
    'coupon',
    'test-cafe',
    'TEN',
    10,
    tomorrow,
    1,
  );
  run(
    'INSERT INTO loyalty_balances (user_id,cafe_id,points) VALUES (?,?,?)',
    buyer.id,
    'test-cafe',
    10,
  );
});
after(() => {
  database().close();
  rmSync(temporary, { recursive: true, force: true });
});
test('server pricing ignores client-provided names and prices', () => {
  const input = base();
  Object.assign(input.items[0], { price: 1, name: 'tampered' });
  const q = quote(buyer, input);
  assert.equal(q.subtotal, 260000);
  assert.equal(q.items[0].name, 'قهوه تست');
  assert.equal(q.total, 260000);
});
test('invalid options, duplicate addons, quantities and cross-cafe carts are rejected', () => {
  for (const item of [
    { ...base().items[0], size_id: 'invented' },
    { ...base().items[0], addon_ids: ['milk', 'milk'] },
    { ...base().items[0], quantity: -1 },
    { ...base().items[0], quantity: 1.5 },
  ])
    assert.throws(() => quote(buyer, { ...base(), items: [item] }));
  assert.throws(() =>
    quote(buyer, {
      ...base(),
      items: [...base().items, { product_id: 'vitrin-1', size_id: '', addon_ids: [], quantity: 1 }],
    }),
  );
});
test('source listings cannot accept local orders', () => {
  assert.throws(
    () =>
      createOrder(buyer, {
        ...base(),
        items: [{ product_id: 'vitrin-1', size_id: '', addon_ids: [], quantity: 1 }],
      }),
    /فعال نیست/,
  );
});
test('coupon and points are applied transactionally; duplicate submission is idempotent', () => {
  const input = { ...base(), coupon: 'TEN', points: 5 };
  const id = createOrder(buyer, input);
  assert.equal(createOrder(buyer, input), id);
  const order = one<Order>('SELECT * FROM orders WHERE id=?', id)!;
  assert.equal(order.discount, 26000);
  assert.equal(order.total, 229000);
  assert.equal(one<{ points: number }>('SELECT points FROM users WHERE id=?', buyer.id)!.points, 5);
  assert.equal(one<{ uses: number }>('SELECT uses FROM coupons WHERE id=?', 'coupon')!.uses, 1);
  assert.throws(() => createOrder(buyer, { ...base(), coupon: 'TEN' }), /نامعتبر/);
  transitionOrder(buyer, id, 'cancelled');
  assert.equal(
    one<{ points: number }>('SELECT points FROM users WHERE id=?', buyer.id)!.points,
    10,
  );
  assert.throws(() => transitionOrder(buyer, id, 'cancelled'));
});
test('order transitions enforce ownership and reward completed orders exactly once', () => {
  const id = createOrder(buyer, base());
  assert.throws(() => transitionOrder(stranger, id, 'cancelled'), /دسترسی/);
  assert.throws(() => transitionOrder(buyer, id, 'completed'));
  transitionOrder(owner, id, 'preparing');
  assert.throws(() => transitionOrder(buyer, id, 'cancelled'));
  transitionOrder(owner, id, 'ready');
  transitionOrder(owner, id, 'completed');
  assert.equal(
    one<{ points: number }>('SELECT points FROM users WHERE id=?', buyer.id)!.points,
    36,
  );
  assert.throws(() => transitionOrder(owner, id, 'completed'));
});
test('delivery requires the buyers own address in the cafe city', () => {
  assert.throws(() => createOrder(buyer, { ...base(), mode: 'delivery', address_id: 'missing' }));
  run(
    'INSERT INTO addresses (id,user_id,title,city,street,receiver,phone) VALUES (?,?,?,?,?,?,?)',
    'other-address',
    stranger.id,
    'خانه',
    'تهران',
    'خیابان تست',
    'گیرنده',
    '09123456789',
  );
  assert.throws(() =>
    createOrder(buyer, { ...base(), mode: 'delivery', address_id: 'other-address' }),
  );
});
test('booking capacity, duplicate submissions, cancellation and past slots are enforced', () => {
  const input = {
    cafe_id: 'test-cafe',
    date: tomorrow,
    time: '10:00',
    guests: 3,
    note: '',
    request_key: randomUUID(),
  };
  const id = createReservation(buyer, input);
  assert.equal(createReservation(buyer, input), id);
  const cafe = cafeById('test-cafe');
  assert.equal(availableSlots(cafe, tomorrow).find((s) => s.time === '10:00')!.remaining, 1);
  assert.throws(
    () => createReservation(stranger, { ...input, guests: 2, request_key: randomUUID() }),
    /ظرفیت/,
  );
  assert.throws(() => transitionReservation(stranger, id, 'cancelled'));
  transitionReservation(buyer, id, 'cancelled');
  assert.equal(availableSlots(cafe, tomorrow).find((s) => s.time === '10:00')!.remaining, 4);
  assert.throws(() =>
    createReservation(buyer, { ...input, date: '2020-01-01', request_key: randomUUID() }),
  );
});
test('password hashes are salted and correct credentials are verified', () => {
  const one = passwordHash('some long password'),
    two = passwordHash('some long password');
  assert.notEqual(one, two);
  assert.equal(passwordMatches('some long password', one), true);
  assert.equal(passwordMatches('incorrect', one), false);
});
test('points from another cafe cannot be spent at this cafe', () => {
  assert.equal(stranger.points, 10);
  assert.throws(() => quote(stranger, { ...base(), points: 1 }), /امتیاز همین کافه/);
});
