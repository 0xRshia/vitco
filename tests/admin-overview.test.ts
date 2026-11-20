import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { adminOverview } from '../src/lib/admin-overview';
import { adminApi } from '../src/lib/platform';
import type { User } from '../src/lib/types';
import { database, run } from '../src/lib/database';

const directory = mkdtempSync(join(tmpdir(), 'vitco-admin-report-'));
process.env.DATABASE_PATH = join(directory, 'report.sqlite');
const firstDay = '2026-03-20T20:30:00.000Z'; // Saturday, Farvardin 1 at midnight in Tehran
const asOf = Date.parse('2026-03-21T00:30:00.000Z');

before(() => {
  run('INSERT INTO users(id,name,created_at) VALUES(?,?,?)', 'buyer', 'مشتری', firstDay);
  for (const [id, demo] of [
    ['cafe', 0],
    ['test-cafe', 1],
  ] as const) {
    run(
      "INSERT INTO cafes(id,name,description,city,address,phone,is_demo) VALUES(?,?,'','','','',?)",
      id,
      id,
      demo,
    );
  }
  function record(id: string, at: string, total: number, status = 'completed', cafe = 'cafe') {
    const lines = [
      { name: 'قهوه', price: 10, quantity: 2 },
      { name: 'کیک', price: 8, quantity: 1 },
    ];
    run(
      `INSERT INTO orders(id,user_id,cafe_id,mode,status,items,subtotal,discount,delivery_fee,points_used,total,pickup_at,note,created_at,updated_at,request_key)
      VALUES (?,'buyer',?,'pickup',?,?,?,0,0,0,?,'','',?,?,?)`,
      id,
      cafe,
      status,
      JSON.stringify(lines),
      total,
      total,
      at,
      at,
      id,
    );
  }
  record('previous', '2026-03-20T20:29:59.999Z', 30);
  record('first', firstDay, 28);
  record('cancelled', '2026-03-20T22:00:00.000Z', 90, 'cancelled');
  record('demo', firstDay, 100, 'completed', 'test-cafe');
  record('later', '2026-04-21T20:30:00.000Z', 25);
});
after(() => {
  database().close();
  rmSync(directory, { recursive: true, force: true });
});

test('counts real orders in the Tehran period and ranks completed line items independently', () => {
  for (const period of ['today', 'week', 'month', 'year']) {
    const report = adminOverview(period, asOf);
    assert.equal(report.from, firstDay);
    assert.deepEqual(report.current, { orders: 2, revenue: 28 });
    assert.equal(report.previous.revenue, 30);
    assert.deepEqual(
      report.cafes.map((cafe) => [cafe.id, cafe.orders, cafe.revenue]),
      [['cafe', 2, 28]],
    );
    assert.deepEqual(
      report.products.map((item) => [item.name, item.quantity, item.revenue]),
      [
        ['قهوه', 2, 20],
        ['کیک', 1, 8],
      ],
    );
    assert.equal(
      report.recent.some((item) => item.id === 'demo'),
      false,
    );
  }
  const today = adminOverview('today', asOf);
  assert.deepEqual(
    today.performance.map((point) => point.orders),
    [1, 1, 0, 0, 0],
  );
  assert.deepEqual(
    new Map(today.statuses.map((row) => [row.status, row.count])),
    new Map([
      ['completed', 1],
      ['cancelled', 1],
    ]),
  );
  assert.equal(adminOverview('unknown', asOf).period, 'week');
});

test('groups the year by Persian month and counts orders exactly at the reporting instant', () => {
  const report = adminOverview('year', Date.parse('2026-04-21T20:30:00.000Z'));
  assert.deepEqual(
    report.performance.map((point) => [point.bucket, point.orders, point.revenue]),
    [
      [firstDay, 2, 28],
      ['2026-04-20T20:30:00.000Z', 1, 25],
    ],
  );
});

test('requires platform administration to read reports through the existing API', () => {
  process.env.PLATFORM_ADMIN_USER_ID = 'authorized';
  const user: User = { id: 'buyer', name: 'مشتری', avatar: '', points: 0, email: '', phone: '' };
  const params = new URLSearchParams({ period: 'month' });
  assert.throws(() => adminApi(user, ['admin'], 'GET', {}, params), { status: 403 });
  const result = adminApi({ ...user, id: 'authorized' }, ['admin'], 'GET', {}, params);
  assert.ok('overview' in result && result.overview);
  assert.equal(result.overview.period, 'month');
  assert.equal(result.orders, 5);
});
