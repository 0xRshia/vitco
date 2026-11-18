import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  accountingOverview,
  createFinancialExport,
  readFinancialExport,
  recordManualEntry,
} from '../src/lib/accounting';
import {
  manageStaff,
  rescheduleOptions,
  rescheduleReservation,
  saveMenuCategory,
} from '../src/lib/cafe-operations';
import { complementaryItems, setFeatures } from '../src/lib/cafe-features';
import { createOrder, createReservation, quote, transitionOrder } from '../src/lib/commerce';
import { issueReminders, savePreferences } from '../src/lib/customer-settings';
import { all, database, one, run, transaction } from '../src/lib/database';
import {
  expireEventHolds,
  eventGuests,
  leaveEvent,
  listEvents,
  registerEvent,
  saveEvent,
  setEventState,
} from '../src/lib/event-registration';
import { today } from '../src/lib/format';
import {
  earnOrderPoints,
  loyaltyManagement,
  myLoyalty,
  redeemReward,
  saveLoyalty,
} from '../src/lib/loyalty';
import {
  changeMeeting,
  meetingChat,
  meetingDetail,
  meetings,
  saveMeeting,
  writeMeetingChat,
} from '../src/lib/meetings';
import { paymentCallback, startPayment } from '../src/lib/payments';
import { adminApi, publicArticles, submitContact } from '../src/lib/platform';
import {
  bindTable,
  cashierQueue,
  changeTableCode,
  latestCashierCall,
  requestCashier,
  tableCodesFor,
  tableContext,
  tableGuest,
  updateCashierCall,
} from '../src/lib/table-service';
import { ticketsApi } from '../src/lib/tickets';
import type { User } from '../src/lib/types';
import type { ZarinpalTransport } from '../src/lib/zarinpal';

const directory = mkdtempSync(join(tmpdir(), 'vitco-services-'));
process.env.DATABASE_PATH = join(directory, 'test.sqlite');
const member = (id: string): User => ({
  id,
  name: id,
  email: id + '@example.test',
  phone: '',
  points: 0,
  avatar: '',
});
const owner = member('owner'),
  buyer = member('buyer'),
  manager = member('manager'),
  visitor = member('visitor'),
  admin = member('admin');
const future = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
const items = [{ product_id: 'coffee', quantity: 1, size_id: '', addon_ids: [] }];
const merchantId = '00000000-0000-4000-8000-000000000012';
const params = new URLSearchParams();
const snapshots = (id: string) =>
  one<{ status: string; payment_status: string }>(
    'SELECT status,payment_status FROM orders WHERE id=?',
    id,
  );

before(() => {
  Object.assign(process.env, {
    PLATFORM_ADMIN_USER_ID: admin.id,
    APP_ORIGIN: 'http://localhost:3100',
    ZARINPAL_MERCHANT_ID: merchantId,
    ZARINPAL_ENV: 'sandbox',
    ZARINPAL_CAFE_IDS: 'branch',
  });
  for (const user of [owner, buyer, manager, visitor, admin])
    run(
      'INSERT INTO users(id,name,email,created_at) VALUES (?,?,?,?)',
      user.id,
      user.name,
      user.email,
      new Date().toISOString(),
    );
  for (const [id, ownerId, parent] of [
    ['cafe', owner.id, null],
    ['branch', owner.id, 'cafe'],
    ['other', visitor.id, null],
  ]) {
    run(
      `INSERT INTO cafes(id,owner_id,parent_id,name,description,city,address,phone,capacity,tables)
      VALUES (?,?,?,?,?,?,?,?,?,?)`,
      id,
      ownerId,
      parent,
      'کافه ' + id,
      'پایگاه موقت آزمون',
      'تهران',
      'خیابان آزمون',
      '09123456789',
      8,
      JSON.stringify([
        { id: 'garden', name: 'میز حیاط', seats: 4 },
        { id: 'vip', name: 'میز ویژه', seats: 4, vip: true },
      ]),
    );
  }
  for (const [id, category, vip] of [
    ['coffee', 'قهوه', 0],
    ['cake', 'کیک', 0],
    ['private', 'دسر', 1],
  ] as const)
    run(
      'INSERT INTO products(id,cafe_id,name,description,category,price,vip_only) VALUES (?,?,?,?,?,?,?)',
      id,
      'branch',
      id,
      'منوی آزمون',
      category,
      120000,
      vip,
    );
  run('UPDATE users SET email=NULL,phone=? WHERE id=?', '09123456714', manager.id);
  manageStaff(owner, 'branch', { contact: '۰۹۱۲۳۴۵۶۷۱۴', role: 'manager' });
});
after(() => {
  database().close();
  rmSync(directory, { recursive: true, force: true });
});

test('QR binds per-browser sessions, scopes VIP products, and records guest orders and cashier activity in one branch', () => {
  assert.throws(() => setFeatures(owner, 'cafe', { package: 'premium' }), { status: 403 });
  setFeatures(admin, 'cafe', {
    package: 'premium',
    vip_cafe: true,
    vip_tables: true,
    vip_menu: true,
    recommendations: true,
  });
  changeTableCode(owner, 'branch', 'vip', true);
  changeTableCode(owner, 'branch', 'garden', true);
  const [ordinary, special] = tableCodesFor(owner, 'branch');
  const regularVisit = bindTable(ordinary.code, undefined);
  const vipVisit = bindTable(special.code, undefined);
  assert.equal(regularVisit.table.vip, false);
  assert.equal(vipVisit.table.vip, true);
  assert.equal(tableContext(special.code), null);
  assert.equal(bindTable(special.code, vipVisit.token).token, vipVisit.token);
  assert.throws(
    () =>
      quote(
        null,
        { items: [{ ...items[0], product_id: 'private' }], mode: 'dine_in' },
        regularVisit.table,
      ),
    { status: 404 },
  );
  const menu = {
    items: [{ ...items[0], product_id: 'private' }],
    mode: 'dine_in',
    request_key: randomUUID(),
  };
  assert.equal(quote(null, menu, vipVisit.table).total, 120000);
  assert.deepEqual(
    complementaryItems('branch', ['coffee'], false).map((row) => row.id),
    ['cake'],
  );
  saveMenuCategory(owner, 'branch', { name: 'کیک', kind: 'dessert', visible: false });
  assert.deepEqual(complementaryItems('branch', ['coffee'], false), []);
  assert.deepEqual(
    complementaryItems('branch', ['coffee'], true).map((row) => row.id),
    ['private'],
  );
  const guest = tableGuest(vipVisit.token, true)!;
  const orderId = createOrder(guest, menu, vipVisit.table);
  assert.ok(guest);
  assert.equal(tableGuest(regularVisit.token), null);
  assert.equal(createOrder(guest, menu, vipVisit.table), orderId);
  assert.equal(
    one<{ table_name: string }>('SELECT table_name FROM orders WHERE id=?', orderId)?.table_name,
    special.name,
  );
  assert.throws(() => transitionOrder(visitor, orderId, 'preparing', 10), { status: 403 });
  transitionOrder(manager, orderId, 'preparing', 12);
  assert.equal(
    one<{ preparation_minutes: number }>(
      'SELECT preparation_minutes FROM orders WHERE id=?',
      orderId,
    )?.preparation_minutes,
    12,
  );
  const callId = requestCashier(vipVisit.token);
  assert.equal(requestCashier(vipVisit.token), callId);
  assert.throws(() => cashierQueue(manager, 'cafe'), { status: 403 });
  assert.equal(cashierQueue(manager, 'branch')[0].id, callId);
  updateCashierCall(manager, 'branch', callId, 'accepted');
  assert.equal(latestCashierCall(vipVisit.token)?.status, 'accepted');
  changeTableCode(owner, 'branch', 'vip', false);
  assert.equal(tableContext(vipVisit.token), null);
  assert.equal(cashierQueue(owner, 'branch')[0].status, 'cancelled');
});

test('private meeting approval, invites, capacity, chat, and moderation are scoped to the meeting', () => {
  const id = saveMeeting(buyer, {
    cafe_id: 'branch',
    title: 'قرار گروهی',
    description: 'گفت‌وگو در شعبه',
    date: future,
    time: '18:00',
    end_time: '19:00',
    visibility: 'private',
    capacity: 2,
  });
  assert.throws(() => meetingDetail(id, null), { status: 404 });
  assert.throws(() => changeMeeting(visitor, id, 'approve', {}), { status: 403 });
  changeMeeting(manager, id, 'approve', {});
  assert.ok(!meetings(null, null).some((row) => row.id === id));
  assert.throws(() => changeMeeting(visitor, id, 'join', {}), { status: 403 });
  changeMeeting(buyer, id, 'invite', { email: visitor.email });
  assert.equal(meetingDetail(id, visitor).joined, true);
  assert.throws(() => changeMeeting(buyer, id, 'invite', { email: admin.email }), { status: 409 });
  assert.throws(() => meetingChat(admin, id), { status: 403 });
  writeMeetingChat(visitor, id, { body: 'درود' });
  const [message] = meetingChat(buyer, id);
  assert.equal(message.body, 'درود');
  assert.throws(() => writeMeetingChat(visitor, id, { hide: message.id }), { status: 403 });
  writeMeetingChat(manager, id, { hide: message.id });
  assert.deepEqual(meetingChat(buyer, id), []);
  changeMeeting(buyer, id, 'remove-member', { email: visitor.email });
  assert.throws(() => meetingChat(visitor, id), { status: 403 });
});

test('reservation editors exclude the current booking and preserve bookings when the new time conflicts', () => {
  const primary = createReservation(buyer, {
    cafe_id: 'branch',
    date: future,
    time: '10:00',
    table_id: 'garden',
    guests: 4,
    request_key: randomUUID(),
  });
  createReservation(visitor, {
    cafe_id: 'branch',
    date: future,
    time: '11:00',
    table_id: 'garden',
    guests: 3,
    request_key: randomUUID(),
  });
  assert.throws(() => rescheduleOptions(visitor, 'branch', primary, params), { status: 403 });
  assert.throws(() => rescheduleOptions(owner, 'cafe', primary, params), { status: 404 });
  const availability = rescheduleOptions(
    manager,
    'branch',
    primary,
    new URLSearchParams({ time: '10:00' }),
  );
  assert.equal(availability.tables.find((row) => row.id === 'garden')?.available, true);
  assert.throws(
    () =>
      rescheduleReservation(manager, 'branch', primary, {
        date: future,
        time: '11:00',
        table_id: 'garden',
        guests: 4,
      }),
    { status: 409 },
  );
  assert.equal(
    one<{ time: string }>('SELECT time FROM reservations WHERE id=?', primary)?.time,
    '10:00',
  );
  rescheduleReservation(manager, 'branch', primary, {
    date: future,
    time: '12:00',
    table_id: 'garden',
    guests: 3,
  });
  assert.equal(
    one<{ time: string }>('SELECT time FROM reservations WHERE id=?', primary)?.time,
    '12:00',
  );
  assert.ok(
    one(
      'SELECT 1 FROM notifications WHERE user_id=? AND href=?',
      buyer.id,
      '/reservations/' + primary,
    ),
  );
});

test('online event checkout holds capacity and reconciles verified and expired tickets', async () => {
  saveEvent(
    owner,
    {
      cafe_id: 'branch',
      title: 'رویداد پولی کافه',
      description: 'آزمون ظرفیت و پرداخت',
      date: future,
      time: '17:00',
      end_time: '18:00',
      capacity: 1,
      price: 150000,
      status: 'draft',
    },
    '',
  );
  const event = listEvents(owner, 'owner').find((row) => row.title === 'رویداد پولی کافه')!;
  assert.ok(!listEvents(null).some((row) => row.id === event.id));
  setEventState(owner, event.id, 'published');
  const first = registerEvent(buyer, event.id)!;
  assert.equal(registerEvent(buyer, event.id), first);
  assert.throws(() => registerEvent(visitor, event.id), { status: 409 });
  const authority = 'S' + randomUUID().replaceAll('-', '') + '000';
  let callback: URL;
  const transport: ZarinpalTransport = async (url, init) => {
    const payload = JSON.parse(String(init.body));
    assert.equal(payload.amount, 1500000);
    assert.equal(payload.merchant_id, merchantId);
    if (url.endsWith('/request.json')) {
      callback = new URL(payload.callback_url);
      return Response.json({ data: { code: 100, authority } });
    }
    assert.ok(url.endsWith('/verify.json'));
    return Response.json({ data: { code: 100, ref_id: '9823456789' } });
  };
  adminApi(admin, ['admin', 'payments'], 'PATCH', { enabled: false }, params);
  await assert.rejects(() => startPayment(buyer, first, transport), { status: 503 });
  adminApi(admin, ['admin', 'payments'], 'PATCH', { enabled: true }, params);
  await startPayment(buyer, first, transport);
  adminApi(admin, ['admin', 'payments'], 'PATCH', { enabled: false }, params);
  const callbackData = () => ({
    payment: callback.searchParams.get('payment'),
    state: callback.searchParams.get('state'),
    Authority: authority,
    Status: 'OK',
  });
  const paid = await paymentCallback(callbackData(), transport);
  assert.equal(paid.result, 'success');
  assert.deepEqual({ ...snapshots(first) }, { status: 'completed', payment_status: 'paid' });
  assert.equal(eventGuests(owner, event.id)[0].status, 'registered');
  leaveEvent(buyer, event.id);
  assert.equal(snapshots(first)?.payment_status, 'refund_required');

  adminApi(admin, ['admin', 'payments'], 'PATCH', { enabled: true }, params);
  const late = registerEvent(visitor, event.id)!;
  const lateAuthority = 'S' + randomUUID().replaceAll('-', '') + '000';
  const lateTransport: ZarinpalTransport = async (url, init) => {
    if (url.endsWith('/request.json')) {
      callback = new URL(JSON.parse(String(init.body)).callback_url);
      return Response.json({ data: { code: 100, authority: lateAuthority } });
    }
    return Response.json({ data: { code: 100, ref_id: '9823456790' } });
  };
  await startPayment(visitor, late, lateTransport);
  run('UPDATE event_registrations SET hold_until=? WHERE order_id=?', Date.now() - 1, late);
  expireEventHolds();
  assert.equal(snapshots(late)?.status, 'cancelled');
  await paymentCallback({ ...callbackData(), Authority: lateAuthority }, lateTransport);
  assert.equal(snapshots(late)?.payment_status, 'refund_required');
  assert.equal(
    eventGuests(owner, event.id).find((row) => row.id === visitor.id)?.status,
    'expired',
  );
});

test('loyalty redemptions stay attached to the recipient, and accounting exports use actual sales and authorized locations', () => {
  saveLoyalty(owner, 'branch', {
    action: 'program',
    name: 'باشگاه شعبه',
    active: true,
    spend_per_point: 10000,
  });
  saveLoyalty(owner, 'branch', { action: 'tier', name: 'عضو طلایی', threshold: 10 });
  saveLoyalty(owner, 'branch', { action: 'reward', name: 'ده درصد تخفیف', cost: 5, percent: 10 });
  const id = createOrder(buyer, { items, mode: 'pickup', request_key: randomUUID() });
  for (const stage of ['preparing', 'ready', 'completed']) transitionOrder(owner, id, stage);
  assert.equal(myLoyalty(buyer).programs[0].points, 12);
  const reward = loyaltyManagement(owner, 'branch').rewards[0].id;
  const key = randomUUID(),
    code = redeemReward(buyer, 'branch', reward, key);
  assert.equal(redeemReward(buyer, 'branch', reward, key), code);
  assert.equal(myLoyalty(buyer).programs[0].points, 7);
  assert.equal(quote(buyer, { items, mode: 'pickup', coupon: code }).total, 108000);
  assert.throws(() => quote(visitor, { items, mode: 'pickup', coupon: code }), /کد تخفیف/);
  recordManualEntry(manager, 'branch', { date: today(), amount: -15000, description: '=1+2' });
  recordManualEntry(owner, 'cafe', { date: today(), amount: 8000, description: 'درآمد شعبه اصلی' });
  const overview = accountingOverview(owner, 'cafe', new URLSearchParams({ branches: '1' }));
  assert.equal(overview.totals.offline, 120000);
  assert.equal(overview.totals.manual, -7000);
  assert.throws(() => accountingOverview(manager, 'cafe', params), { status: 403 });
  const exportId = createFinancialExport(manager, 'branch', {});
  const csv = readFinancialExport(owner, 'branch', exportId);
  assert.match(csv, /"'=1\+2",-15000/);
  assert.match(csv, /"سفارش منو",120000/);
  assert.throws(() => readFinancialExport(visitor, 'branch', exportId), { status: 403 });
});

test('earning rules apply spend minimums, purchase bonuses and member tier multipliers', () => {
  saveLoyalty(owner, 'cafe', {
    action: 'program',
    name: 'باشگاه کافه',
    active: true,
    spend_per_point: 10000,
  });
  saveLoyalty(owner, 'cafe', {
    action: 'rule',
    name: 'امتیاز خرید کامل',
    kind: 'fixed',
    minimum: 100000,
    value: 5,
  });
  saveLoyalty(owner, 'cafe', {
    action: 'rule',
    name: 'امتیاز سطح طلایی',
    kind: 'tier',
    minimum: 10,
    value: 50,
  });
  transaction(() => earnOrderPoints(buyer.id, 'cafe', 50000));
  transaction(() => earnOrderPoints(buyer.id, 'cafe', 100000));
  transaction(() => earnOrderPoints(buyer.id, 'cafe', 100000));
  const program = myLoyalty(buyer).programs.find((item) => item.cafe_id === 'cafe')!;
  assert.equal(program.points, 42);
  assert.equal(loyaltyManagement(owner, 'cafe').totals.credits, 42);
});

test('ticket replies and files stay private, and reminders respect opt-in and do not repeat', async () => {
  const orderId = createOrder(buyer, { items, mode: 'pickup', request_key: randomUUID() });
  const file = Buffer.from('مدرک آزمون');
  const ticket = ticketsApi(
    buyer,
    ['tickets'],
    'POST',
    { order_id: orderId, subject: 'پیگیری سفارش', body: 'برای سفارش درخواست بررسی دارم.' },
    [{ name: 'مدرک.txt', content: file, size: file.byteLength }],
  ) as { id: string };
  const fileId = one<{ id: string }>(
    'SELECT id FROM ticket_attachments WHERE ticket_id=?',
    ticket.id,
  )!.id;
  assert.throws(
    () => ticketsApi(visitor, ['tickets', ticket.id, 'attachments', fileId], 'GET', {}),
    { status: 403 },
  );
  const response = ticketsApi(
    owner,
    ['tickets', ticket.id, 'attachments', fileId],
    'GET',
    {},
  ) as Response;
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(await response.text(), file.toString());
  ticketsApi(owner, ['tickets', ticket.id, 'replies'], 'POST', { body: 'درخواست شما بررسی شد.' });
  assert.throws(
    () => ticketsApi(buyer, ['tickets', ticket.id, 'replies'], 'POST', { body: 'پیام پیگیری' }),
    { status: 403 },
  );
  ticketsApi(buyer, ['tickets', ticket.id, 'messages'], 'POST', { body: 'ممنون، پاسخ را دیدم.' });
  assert.ok(
    one(
      'SELECT 1 FROM notifications WHERE user_id=? AND href=?',
      buyer.id,
      '/support/' + ticket.id,
    ),
  );
  ticketsApi(buyer, ['tickets', ticket.id, 'status'], 'PATCH', { status: 'closed' });
  assert.throws(
    () =>
      ticketsApi(owner, ['tickets', ticket.id, 'replies'], 'POST', { body: 'پیام پس از بسته شدن' }),
    { status: 409 },
  );

  const meeting = saveMeeting(buyer, {
    title: 'یادآوری قرار',
    description: 'آزمون یادآوری',
    date: future,
    time: '18:00',
    end_time: '19:00',
    visibility: 'public',
    capacity: 2,
  });
  changeMeeting(visitor, meeting, 'join', {});
  savePreferences(visitor, { reminders: false, telegram: false });
  run(
    'UPDATE meetings SET starts_at=?,ends_at=? WHERE id=?',
    new Date(Date.now() + 3600000).toISOString(),
    new Date(Date.now() + 7200000).toISOString(),
    meeting,
  );
  issueReminders();
  issueReminders();
  assert.deepEqual(
    all<{ user_id: string }>(
      'SELECT user_id FROM registration_reminders WHERE target_id=?',
      meeting,
    ).map((row) => row.user_id),
    [buyer.id],
  );
});

test('admin contents, messages, and suspension are persisted and inaccessible to ordinary accounts', () => {
  assert.throws(() => adminApi(buyer, ['admin', 'users'], 'GET', {}, params), { status: 403 });
  submitContact('partnership', {
    name: 'نام مشتری',
    contact: 'customer@example.test',
    subject: 'درخواست شعبه',
    body: 'مایل به همکاری با ویتکو هستیم.',
  });
  const inbox = adminApi(admin, ['admin', 'messages'], 'GET', {}, params) as {
    messages: { kind: string }[];
  };
  assert.equal(inbox.messages[0].kind, 'partnership');
  adminApi(admin, ['admin', 'categories'], 'POST', { name: 'قهوه' }, params);
  const article = {
    slug: 'راهنمای-قهوه',
    title: 'آشنایی با قهوه',
    category: 'قهوه',
    summary: 'راهنمای سفارش قهوه',
    body: 'انتخاب قهوه برای اولین دیدار در کافه.',
    published: false,
  };
  adminApi(admin, ['admin', 'articles'], 'POST', article, params);
  assert.throws(() => publicArticles(article.slug), { status: 404 });
  adminApi(
    admin,
    ['admin', 'articles', article.slug],
    'PUT',
    { ...article, published: true },
    params,
  );
  assert.equal(publicArticles(article.slug).article?.title, article.title);
  const users = adminApi(
    admin,
    ['admin', 'users'],
    'GET',
    {},
    new URLSearchParams({ q: buyer.email }),
  );
  assert.ok('users' in users && Array.isArray(users.users));
  assert.deepEqual(
    users.users.map((row) => row.id),
    [buyer.id],
  );
  run(
    'INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)',
    'test-session',
    buyer.id,
    Date.now() + 3600000,
  );
  adminApi(admin, ['admin', 'users', buyer.id], 'PATCH', { suspended: true }, params);
  assert.equal(one('SELECT 1 FROM sessions WHERE user_id=?', buyer.id), undefined);
  assert.equal(
    one<{ suspended: number }>('SELECT suspended FROM users WHERE id=?', buyer.id)?.suspended,
    1,
  );
});
