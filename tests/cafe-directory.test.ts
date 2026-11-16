import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fixture from './fixtures/hmghadam-cafes.json';
import { database, one, run } from '../src/lib/database';
import {
  importCafeDirectory,
  parseCafeDirectory,
  directoryStatus,
  syncCafeDirectory,
} from '../src/lib/cafe-directory';
import {
  cafeById,
  availableSlots,
  createReservation,
  transitionReservation,
  ownerCafe,
} from '../src/lib/commerce';
import { RESERVATION_DEMO_ID, configureReservationDemo } from '../src/lib/reservation-demo';
import { isCafeOnlinePayable } from '../src/lib/zarinpal';
import { createInvoice } from '../src/lib/invoices';
import type { User } from '../src/lib/types';

// Two real records from the live 2026-11-16 Store export, reduced to consumed fields.
const temporary = mkdtempSync(join(tmpdir(), 'vitco-directory-'));
process.env.DATABASE_PATH = join(temporary, 'test.sqlite');
process.env.RESERVATION_DEMO_ENABLED = '1';
after(() => {
  database().close();
  rmSync(temporary, { recursive: true, force: true });
});

test('source coordinates, venue photos, identity and only verified amenities are preserved', () => {
  const cafes = parseCafeDirectory(fixture);
  assert.equal(cafes.length, 2);
  assert.equal(cafes[0].latitude, fixture[0].latitude);
  assert.equal(cafes[1].longitude, fixture[1].longitude);
  assert.equal(cafes[1].image, fixture[1].cover_image_url);
  assert.ok(cafes[1].images.includes(fixture[1].photos[0].url));
  assert.deepEqual(cafes[1].amenities, ['outdoor']);
  assert.equal(cafes[0].image, '');
  assert.equal(cafes[0].external_menu_url, '');
  assert.equal(cafes[0].source, fixture[0].source_url);
  const invalidCoordinates = parseCafeDirectory([{ ...fixture[0], latitude: 200, longitude: 51 }]);
  assert.equal(invalidCoordinates[0].latitude, null);
  assert.equal(invalidCoordinates[0].longitude, null);
  const invalidUrl = parseCafeDirectory([{ ...fixture[0], menu_url: 'javascript:alert(1)' }]);
  assert.equal(invalidUrl[0].external_menu_url, '');
  assert.throws(() => parseCafeDirectory([fixture[0], fixture[0]]));
});

test('imports are idempotent, remain browse-only and cannot overwrite operator or favorite records', () => {
  importCafeDirectory(fixture);
  const id = 'invara-' + fixture[0].place_id;
  const cafe = cafeById(id);
  assert.equal(cafe.owner_id, null);
  assert.equal(cafe.active, false);
  assert.equal(cafe.city, ''); // The source has no structured city or hours.
  assert.equal(cafe.opens, '');
  assert.deepEqual(availableSlots(cafe, '2099-01-01'), []);
  run(
    'INSERT INTO users (id,name,created_at) VALUES (?,?,?)',
    'directory-owner',
    'مدیر آزمون',
    new Date().toISOString(),
  );
  run('INSERT INTO favorites (user_id,cafe_id) VALUES (?,?)', 'directory-owner', id);
  importCafeDirectory(fixture);
  assert.equal(
    one<{ count: number }>('SELECT COUNT(*) count FROM cafes WHERE directory_source=?', 'hmghadam')
      ?.count,
    2,
  );
  assert.equal(one<{ count: number }>('SELECT COUNT(*) count FROM favorites')?.count, 1);
  run(
    'UPDATE cafes SET owner_id=?,name=? WHERE id=?',
    'directory-owner',
    'نام تعیین‌شده توسط مالک',
    id,
  );
  importCafeDirectory(fixture);
  assert.equal(cafeById(id).name, 'نام تعیین‌شده توسط مالک');
  const timestamp = directoryStatus().synced_at;
  assert.throws(() => importCafeDirectory([{ ...fixture[1], name: '' }]));
  assert.equal(directoryStatus().synced_at, timestamp);
});

test('authenticated refresh uses the supported export, shares one request and retains real saved data on failure', async (t) => {
  process.env.CAFE_DIRECTORY_USERNAME = 'test-reader';
  process.env.CAFE_DIRECTORY_PASSWORD = 'test-only-secret';
  delete process.env.CAFE_DIRECTORY_FILE;
  importCafeDirectory(fixture, new Date(0));
  const urls: string[] = [];
  const transport: typeof fetch = async (input, init) => {
    const url = String(input);
    urls.push(url);
    if (url.endsWith('/api/admin/login')) {
      assert.equal(new Headers(init?.headers).get('Origin'), 'https://data.hmghadam.com');
      return new Response('{}', {
        headers: { 'Set-Cookie': 'hg_crawler_session=test-session; HttpOnly' },
      });
    }
    assert.equal(new Headers(init?.headers).get('Cookie'), 'hg_crawler_session=test-session');
    if (url.endsWith('/download/stores.json')) return Response.json(fixture);
    assert.ok(url.endsWith('/api/admin/logout'));
    return Response.json({});
  };
  await Promise.all([syncCafeDirectory(transport, true), syncCafeDirectory(transport, true)]);
  assert.deepEqual(
    urls,
    ['/api/admin/login', '/download/stores.json', '/api/admin/logout'].map(
      (p) => 'https://data.hmghadam.com' + p,
    ),
  );
  assert.equal(directoryStatus().status, 'ready');
  const last = directoryStatus().synced_at;
  const future = Date.now() + 16 * 60000;
  t.mock.method(Date, 'now', () => future);
  await syncCafeDirectory(async () => new Response('unauthorized', { status: 401 }), true);
  assert.equal(directoryStatus().status, 'stale');
  assert.equal(directoryStatus().synced_at, last);
  assert.equal(directoryStatus().cafe_count, 2);
  assert.equal(cafeById('invara-' + fixture[1].place_id).latitude, fixture[1].latitude);
  assert.ok(!JSON.stringify(directoryStatus()).includes('test-only-secret'));
});

test('opt-in test café books a real cancellable request without enabling payments or a physical map pin', () => {
  const cafe = cafeById(RESERVATION_DEMO_ID);
  assert.equal(cafe.is_demo, true);
  assert.equal(cafe.latitude, null);
  const customer: User = {
    id: 'directory-owner',
    name: 'مهمان آزمون',
    email: '',
    phone: '',
    points: 0,
    avatar: '',
  };
  assert.throws(() => ownerCafe(customer, cafe.id));
  const date = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const slot = availableSlots(cafe, date)[0];
  const payload = {
    cafe_id: cafe.id,
    date,
    time: slot.time,
    guests: 2,
    table_id: 'demo-two',
    request_key: 'directory-demo-reservation',
  };
  assert.throws(() => createReservation(customer, { ...payload, payment_method: 'zarinpal' }));
  const id = createReservation(customer, payload);
  assert.equal(createReservation(customer, payload), id);
  assert.equal(availableSlots(cafe, date)[0].remaining, 4);
  assert.throws(() =>
    createReservation(customer, { ...payload, request_key: 'directory-demo-conflict' }),
  );
  transitionReservation(customer, id, 'cancelled');
  assert.equal(availableSlots(cafe, date)[0].remaining, 6);
  assert.equal(one<{ count: number }>('SELECT COUNT(*) count FROM orders')?.count, 0);
  process.env.ZARINPAL_ENV = 'sandbox';
  process.env.ZARINPAL_MERCHANT_ID = '12345678-1234-1234-1234-123456789abc';
  process.env.ZARINPAL_CAFE_IDS = '*';
  process.env.APP_ORIGIN = 'http://localhost:3000';
  assert.equal(isCafeOnlinePayable(cafe.id), false);
  assert.throws(() =>
    createInvoice(customer, {
      cafe_id: cafe.id,
      amount: 1000,
      expected_total: 1000,
      request_key: 'demo-invoice-request',
    }),
  );
  delete process.env.RESERVATION_DEMO_ENABLED;
  configureReservationDemo(database());
  assert.equal(cafeById(cafe.id).active, false);
});
