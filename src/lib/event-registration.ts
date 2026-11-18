import { randomUUID } from 'node:crypto';
import { notify } from './auth';
import { awardOrderPoints, cafeById, ownerCafe } from './commerce';
import { all, hydrate, one, run, transaction } from './database';
import type { CafeEvent, Order, User } from './types';
import * as v from './validation';
import { cafeAcceptsPayments } from './payment-intake';

type EventRow = CafeEvent & { status: NonNullable<CafeEvent['status']>; price: number };
type Registration = {
  event_id: string;
  user_id: string;
  status: string;
  order_id: string | null;
  hold_until: number;
};
const eventEnd = (event: Pick<CafeEvent, 'date' | 'time' | 'end_time'>) =>
  Date.parse(event.date + 'T' + (event.end_time || event.time) + ':00+03:30');
const counted =
  "(status IN ('registered','attended') OR (status='pending_payment' AND hold_until>?))";
function activeCount(id: string) {
  return one<{ count: number }>(
    'SELECT COUNT(*) count FROM event_registrations WHERE event_id=? AND ' + counted,
    id,
    Date.now(),
  )!.count;
}
function eventById(id: string) {
  const event = one<EventRow>('SELECT * FROM events WHERE id=?', id);
  v.ensure(event, 'رویداد پیدا نشد.', 404);
  return event;
}
const listing = `SELECT e.*,c.name cafe_name,(SELECT COUNT(*) FROM event_registrations j WHERE j.event_id=e.id AND ${counted}) registered,
 r.status IN ('registered','attended') joined,
 CASE WHEN r.status='pending_payment' AND r.hold_until<=? THEN 'expired' ELSE r.status END registration_status,
 r.order_id registration_order_id
 FROM events e JOIN cafes c ON c.id=e.cafe_id LEFT JOIN event_registrations r ON r.event_id=e.id AND r.user_id=?`;
export function listEvents(user: User | null, scope: 'public' | 'owner' | 'history' = 'public') {
  const now = Date.now();
  const where =
    scope === 'owner'
      ? 'c.owner_id=?'
      : scope === 'history'
        ? 'r.user_id=?'
        : "e.status IN ('published','completed')";
  return all(
    listing + ' WHERE ' + where + ' ORDER BY e.date,e.time',
    now,
    now,
    user?.id || '',
    ...(scope === 'public' ? [] : [user?.id || '']),
  ).map(hydrate<CafeEvent>);
}
export function publicEvent(user: User | null, id: string) {
  const now = Date.now();
  const row = one(
    listing + " WHERE e.id=? AND e.status IN ('published','completed')",
    now,
    now,
    user?.id || '',
    id,
  );
  v.ensure(row, 'رویداد پیدا نشد.', 404);
  return hydrate<CafeEvent>(row);
}

export function deleteDraftEvent(user: User, id: string) {
  transaction(() => {
    const event = eventById(id);
    ownerCafe(user, event.cafe_id);
    v.ensure(
      event.status === 'draft' && !one('SELECT 1 FROM event_registrations WHERE event_id=?', id),
      'فقط پیش‌نویس بدون ثبت‌نام قابل حذف است.',
      409,
    );
    run('DELETE FROM events WHERE id=?', id);
  });
}
export function registerEvent(user: User, id: string) {
  return transaction(() => {
    const event = eventById(id);
    v.ensure(
      event.status === 'published' && eventEnd(event) > Date.now(),
      'مهلت ثبت‌نام این رویداد گذشته یا ثبت‌نام بسته است.',
      409,
    );
    const before = one<Registration>(
      'SELECT * FROM event_registrations WHERE event_id=? AND user_id=?',
      id,
      user.id,
    );
    v.ensure(
      !before || !['registered', 'attended'].includes(before.status),
      'قبلاً در این رویداد ثبت‌نام کرده‌اید.',
      409,
    );
    if (before?.status === 'pending_payment' && before.hold_until > Date.now())
      return before.order_id;
    v.ensure(activeCount(id) < event.capacity, 'ظرفیت رویداد تکمیل است.', 409);
    let orderId: string | null = null;
    let hold = 0;
    if (event.price > 0) {
      v.ensure(cafeAcceptsPayments(event.cafe_id), 'پرداخت آنلاین این رویداد در دسترس نیست.', 409);
      const cafe = cafeById(event.cafe_id);
      v.ensure(
        cafe.active && cafe.owner_id && !cafe.is_demo,
        'پرداخت آنلاین این رویداد در دسترس نیست.',
        409,
      );
      orderId = randomUUID();
      hold = Math.min(Date.now() + 15 * 60000, eventEnd(event));
      const now = new Date().toISOString();
      run(
        `INSERT INTO orders(id,user_id,cafe_id,kind,mode,status,items,subtotal,discount,delivery_fee,points_used,
        total,address,pickup_at,note,created_at,updated_at,request_key,payment_method)
        VALUES (?,?,?,'event','dine_in','pending','[]',?,0,0,0,?,NULL,'',?,?,?,?,'zarinpal')`,
        orderId,
        user.id,
        event.cafe_id,
        event.price,
        event.price,
        event.title,
        now,
        now,
        'event:' + orderId,
      );
    }
    if (before?.order_id) cancelEventOrder(before.order_id);
    run(
      `INSERT INTO event_registrations(event_id,user_id,status,order_id,hold_until) VALUES (?,?,?,?,?)
      ON CONFLICT(event_id,user_id) DO UPDATE SET status=excluded.status,order_id=excluded.order_id,hold_until=excluded.hold_until`,
      id,
      user.id,
      orderId ? 'pending_payment' : 'registered',
      orderId,
      hold,
    );
    if (!orderId) notify(user.id, 'ثبت‌نام رویداد انجام شد', event.title, '/registrations');
    return orderId;
  });
}
function cancelEventOrder(id: string) {
  run(
    `UPDATE orders SET status='cancelled',updated_at=?,payment_status=CASE WHEN payment_status='paid'
    THEN 'refund_required' ELSE payment_status END WHERE id=? AND kind='event'`,
    new Date().toISOString(),
    id,
  );
}
function cancelRegistration(registration: Registration) {
  if (registration.order_id) cancelEventOrder(registration.order_id);
  run(
    "UPDATE event_registrations SET status='cancelled',hold_until=0 WHERE event_id=? AND user_id=?",
    registration.event_id,
    registration.user_id,
  );
}
export function expireEventHolds() {
  transaction(() => {
    const rows = all<Registration>(
      "SELECT * FROM event_registrations WHERE status='pending_payment' AND hold_until<=?",
      Date.now(),
    );
    for (const row of rows) {
      if (row.order_id) cancelEventOrder(row.order_id);
      run(
        "UPDATE event_registrations SET status='expired',hold_until=0 WHERE event_id=? AND user_id=?",
        row.event_id,
        row.user_id,
      );
    }
  });
}
export function leaveEvent(user: User, id: string) {
  transaction(() => {
    const event = eventById(id);
    const row = one<Registration>(
      'SELECT * FROM event_registrations WHERE event_id=? AND user_id=?',
      id,
      user.id,
    );
    v.ensure(
      row && ['registered', 'pending_payment'].includes(row.status),
      'ثبت‌نام فعالی پیدا نشد.',
      404,
    );
    v.ensure(eventEnd(event) > Date.now(), 'مهلت لغو ثبت‌نام گذشته است.', 409);
    cancelRegistration(row);
    if (row.order_id) {
      const payment = one<{ payment_status: string }>(
        'SELECT payment_status FROM orders WHERE id=?',
        row.order_id,
      );
      if (payment?.payment_status === 'refund_required') {
        const cafe = cafeById(event.cafe_id);
        if (cafe.owner_id)
          notify(cafe.owner_id, 'لغو بلیت پرداخت‌شده', event.title, '/dashboard?tab=orders');
      }
    }
  });
}
export function eventTicketPayable(orderId: string) {
  const row = one<{
    status: string;
    hold_until: number;
    date: string;
    time: string;
    end_time: string;
    event_status: string;
  }>(
    `SELECT
    r.status,r.hold_until,e.date,e.time,e.end_time,e.status event_status
    FROM event_registrations r JOIN events e ON e.id=r.event_id WHERE r.order_id=?`,
    orderId,
  );
  return Boolean(
    row &&
    row.status === 'pending_payment' &&
    row.event_status === 'published' &&
    row.hold_until > Date.now() &&
    eventEnd(row) > Date.now(),
  );
}
export function settleEventTicket(orderId: string, refundRequired: boolean) {
  if (refundRequired) {
    run(
      "UPDATE event_registrations SET status='cancelled',hold_until=0 WHERE order_id=? AND status='pending_payment'",
      orderId,
    );
    run("UPDATE orders SET status='cancelled' WHERE id=? AND kind='event'", orderId);
    return;
  }
  run(
    "UPDATE event_registrations SET status='registered',hold_until=0 WHERE order_id=? AND status='pending_payment'",
    orderId,
  );
  run("UPDATE orders SET status='completed' WHERE id=?", orderId);
}
export function setEventState(user: User, id: string, next: unknown) {
  transaction(() => {
    const event = eventById(id);
    ownerCafe(user, event.cafe_id);
    if (next === 'published') {
      v.ensure(
        event.status === 'draft' && eventEnd(event) > Date.now(),
        'این رویداد قابل انتشار نیست.',
        409,
      );
      run("UPDATE events SET status='published' WHERE id=?", id);
    } else if (next === 'cancelled') {
      v.ensure(['draft', 'published'].includes(event.status), 'رویداد قابل لغو نیست.', 409);
      for (const r of all<Registration>(
        "SELECT * FROM event_registrations WHERE event_id=? AND status IN ('registered','pending_payment')",
        id,
      )) {
        cancelRegistration(r);
        notify(r.user_id, 'رویداد لغو شد', event.title, '/registrations');
      }
      run("UPDATE events SET status='cancelled' WHERE id=?", id);
    } else if (next === 'completed') {
      v.ensure(
        event.status === 'published' && eventEnd(event) <= Date.now(),
        'رویداد هنوز پایان نیافته است.',
        409,
      );
      run("UPDATE events SET status='completed' WHERE id=?", id);
    } else throw new v.AppError('وضعیت رویداد معتبر نیست.');
  });
}
export function eventGuests(user: User, id: string) {
  ownerCafe(user, eventById(id).cafe_id);
  return all<{ id: string; name: string; status: string; order_id: string | null }>(
    `SELECT r.user_id id,u.name,r.status,r.order_id
    FROM event_registrations r JOIN users u ON u.id=r.user_id WHERE r.event_id=? ORDER BY u.name`,
    id,
  );
}
export function attendEvent(user: User, id: string, guest: unknown) {
  const event = eventById(id);
  ownerCafe(user, event.cafe_id);
  v.ensure(
    ['published', 'completed'].includes(event.status) &&
      Date.parse(event.date + 'T' + event.time + ':00+03:30') <= Date.now(),
    'ثبت حضور از زمان شروع رویداد ممکن است.',
    409,
  );
  const guestId = v.text(guest, 'شرکت‌کننده', 1, 100);
  transaction(() => {
    const change = run(
      "UPDATE event_registrations SET status='attended' WHERE event_id=? AND user_id=? AND status='registered'",
      id,
      guestId,
    );
    v.ensure(change.changes, 'ثبت‌نام فعالی پیدا نشد.', 404);
    const order = one<Pick<Order, 'total' | 'user_id' | 'cafe_id'>>(
      "SELECT o.total,o.user_id,o.cafe_id FROM event_registrations r JOIN orders o ON o.id=r.order_id WHERE r.event_id=? AND r.user_id=? AND o.payment_status='paid'",
      id,
      guestId,
    );
    if (order) awardOrderPoints(order);
  });
}
export function saveEvent(user: User, input: Record<string, unknown>, id: string) {
  const cafeId = v.text(input.cafe_id, 'کافه', 1, 100);
  ownerCafe(user, cafeId);
  const day = v.date(input.date),
    start = v.time(input.time),
    end = input.end_time ? v.time(input.end_time) : '';
  v.ensure(!end || end > start, 'ساعت پایان رویداد باید پس از ساعت شروع باشد.');
  v.ensure(
    Date.parse(day + 'T' + start + ':00+03:30') > Date.now(),
    'زمان رویداد باید در آینده باشد.',
  );
  const title = v.text(input.title, 'عنوان', 3, 120),
    description = v.text(input.description, 'توضیحات', 5, 3000);
  const capacity = v.integer(input.capacity, 'ظرفیت', 1, 500),
    image = v.imagePath(input.image);
  const price = v.integer(input.price ?? 0, 'قیمت بلیت', 0, 100000000);
  transaction(() => {
    if (id) {
      const event = eventById(id);
      v.ensure(event.cafe_id === cafeId, 'رویداد پیدا نشد.', 404);
      v.ensure(['draft', 'published'].includes(event.status), 'رویداد قابل ویرایش نیست.', 409);
      const registered = activeCount(id);
      v.ensure(capacity >= registered, 'ظرفیت نمی‌تواند کمتر از تعداد ثبت‌نام‌های فعلی باشد.', 409);
      v.ensure(
        price === event.price || registered === 0,
        'با ثبت‌نام فعال، تغییر قیمت بلیت مجاز نیست.',
        409,
      );
      run(
        'UPDATE events SET title=?,description=?,date=?,time=?,capacity=?,image=?,end_time=?,price=? WHERE id=?',
        title,
        description,
        day,
        start,
        capacity,
        image,
        end,
        price,
        id,
      );
    } else {
      const status = input.status === 'draft' ? 'draft' : 'published';
      run(
        'INSERT INTO events(title,description,date,time,capacity,image,end_time,price,status,id,cafe_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        title,
        description,
        day,
        start,
        capacity,
        image,
        end,
        price,
        status,
        randomUUID(),
        cafeId,
      );
    }
  });
}
