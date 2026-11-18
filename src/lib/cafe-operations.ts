import { randomUUID } from 'node:crypto';
import { all, hydrate, one, run, transaction } from './database';
import { cafeAccess, requireCafeAccess, staffRoles } from './cafe-access';
import { availableSlots, availableTables, cafeById, ownerCafe } from './commerce';
import type { Cafe, Order, Reservation, User } from './types';
import * as v from './validation';
import { today } from './format';
import { categoryKinds, defaultCategoryKind, productCategory, type CategoryKind } from './catalog';
import { cafeFeatures } from './cafe-features';
import { findMemberByContact, notify } from './auth';

export type WorkingHour = { weekday: number; opens: string; closes: string };
export type MenuCategory = {
  id: string;
  name: string;
  image: string;
  position: number;
  visible: boolean;
  kind: CategoryKind;
};
export type StaffMember = { user_id: string; name: string; role: string };
export type ServiceLocation = { id: string; name: string; parent_id: string | null; role: string };

export function publicBranches(cafe: Cafe) {
  const root = cafe.parent_id || cafe.id;
  return all<Pick<Cafe, 'id' | 'name' | 'address'>>(
    'SELECT id,name,address FROM cafes WHERE (parent_id=? OR id=?) AND active=1 AND owner_id IS NOT NULL ORDER BY parent_id IS NOT NULL,name',
    root,
    root,
  );
}
export function workingHours(cafeId: string) {
  return all<WorkingHour>(
    'SELECT weekday,opens,closes FROM cafe_hours WHERE cafe_id=? ORDER BY weekday',
    cafeId,
  );
}
export function menuCategoriesFor(cafeId: string, managed = false) {
  return all(
    'SELECT id,name,image,position,visible,kind FROM menu_categories WHERE cafe_id=?' +
      (managed ? '' : ' AND visible=1') +
      ' ORDER BY position,name',
    cafeId,
  ).map(hydrate<MenuCategory>);
}
export function staffMembers(user: User, cafeId: string) {
  ownerCafe(user, cafeId);
  return all<StaffMember>(
    'SELECT s.user_id,u.name,s.role FROM cafe_staff s JOIN users u ON u.id=s.user_id WHERE s.cafe_id=? ORDER BY u.name',
    cafeId,
  );
}
export function manageStaff(user: User, cafeId: string, input: Record<string, unknown>) {
  const cafe = ownerCafe(user, cafeId);
  if (input.remove) {
    run(
      'DELETE FROM cafe_staff WHERE cafe_id=? AND user_id=?',
      cafeId,
      v.text(input.user_id, 'کاربر', 1, 100),
    );
    return;
  }
  const staff = findMemberByContact(input.contact ?? input.email);
  v.ensure(staff, 'حساب فعال کارمند پیدا نشد.', 404);
  v.ensure(staff.id !== cafe.owner_id, 'مالک کافه به همه بخش‌ها دسترسی دارد.');
  const role = v.text(input.role, 'نقش', 1, 20);
  v.ensure(
    staffRoles.some((value) => value === role),
    'نقش نامعتبر است.',
  );
  run(
    'INSERT INTO cafe_staff(cafe_id,user_id,role) VALUES (?,?,?) ON CONFLICT(cafe_id,user_id) DO UPDATE SET role=excluded.role',
    cafeId,
    staff.id,
    role,
  );
}
export function setWorkingHours(user: User, cafeId: string, input: unknown) {
  ownerCafe(user, cafeId);
  const hours = v.list(input, 7).map((item) => {
    const row = v.object(item);
    const weekday = v.integer(row.weekday, 'روز هفته', 0, 6);
    if (row.closed === true) return { weekday, opens: '', closes: '' };
    const opens = v.time(row.opens),
      closes = v.time(row.closes);
    v.ensure(opens < closes, 'ساعت پایان باید بعد از شروع باشد.');
    return { weekday, opens, closes };
  });
  v.ensure(
    new Set(hours.map((hour) => hour.weekday)).size === hours.length,
    'روز هفته تکراری است.',
  );
  transaction(() => {
    run('DELETE FROM cafe_hours WHERE cafe_id=?', cafeId);
    for (const hour of hours)
      run(
        'INSERT INTO cafe_hours(cafe_id,weekday,opens,closes) VALUES (?,?,?,?)',
        cafeId,
        hour.weekday,
        hour.opens,
        hour.closes,
      );
    const bookings = all<Reservation>(
      "SELECT * FROM reservations WHERE cafe_id=? AND date>=? AND status IN ('pending','confirmed')",
      cafeId,
      today(),
    );
    const cafe = cafeById(cafeId);
    for (const booking of bookings) {
      if (Date.parse(booking.date + 'T' + booking.time + ':00+03:30') <= Date.now()) continue;
      v.ensure(
        availableSlots(cafe, booking.date).some((slot) => slot.time === booking.time),
        'ساعت کاری جدید با یک رزرو فعال تداخل دارد.',
        409,
      );
    }
  });
}
export function saveMenuCategory(user: User, cafeId: string, input: Record<string, unknown>) {
  ownerCafe(user, cafeId);
  const id = v.text(input.id ?? '', 'دسته‌بندی', 0, 100);
  const name = productCategory(v.text(input.name, 'نام دسته‌بندی', 1, 60));
  const kind = input.kind ?? defaultCategoryKind(name);
  v.ensure(
    typeof kind === 'string' && Object.hasOwn(categoryKinds, kind),
    'نوع دسته‌بندی معتبر نیست.',
  );
  const image = v.imagePath(input.image),
    position = v.integer(input.position ?? 0, 'ترتیب', 0, 10000);
  const visible = input.visible !== false ? 1 : 0;
  transaction(() => {
    const existing = id
      ? one<MenuCategory>('SELECT * FROM menu_categories WHERE id=? AND cafe_id=?', id, cafeId)
      : null;
    if (id) v.ensure(existing, 'دسته پیدا نشد.', 404);
    v.ensure(
      !one('SELECT 1 FROM menu_categories WHERE cafe_id=? AND name=? AND id<>?', cafeId, name, id),
      'این دسته از قبل وجود دارد.',
      409,
    );
    if (existing) {
      run(
        'UPDATE menu_categories SET name=?,image=?,position=?,visible=?,kind=? WHERE id=?',
        name,
        image,
        position,
        visible,
        kind,
        id,
      );
      if (existing.name !== name)
        run(
          'UPDATE products SET category=? WHERE cafe_id=? AND category=?',
          name,
          cafeId,
          existing.name,
        );
    } else {
      run(
        'INSERT INTO menu_categories(id,cafe_id,name,image,position,visible,kind) VALUES (?,?,?,?,?,?,?)',
        randomUUID(),
        cafeId,
        name,
        image,
        position,
        visible,
        kind,
      );
    }
  });
}
export function deleteMenuCategory(user: User, cafeId: string, id: string) {
  ownerCafe(user, cafeId);
  transaction(() => {
    const group = one<{ name: string }>(
      'SELECT name FROM menu_categories WHERE id=? AND cafe_id=?',
      id,
      cafeId,
    );
    v.ensure(group, 'دسته‌بندی پیدا نشد.', 404);
    v.ensure(
      !one('SELECT 1 FROM products WHERE cafe_id=? AND category=?', cafeId, group.name),
      'ابتدا محصولات را به دسته دیگری منتقل کنید.',
      409,
    );
    run('DELETE FROM menu_categories WHERE id=? AND cafe_id=?', id, cafeId);
  });
}

export function cafeTour(user: User, cafeId: string, value: unknown) {
  ownerCafe(user, cafeId);
  const url = v.text(value ?? '', 'پیوند تور', 0, 500);
  if (url) {
    v.ensure(cafeFeatures(cafeId).tour, 'تور مجازی برای این شعبه فعال نیست.', 409);
    let parsed: URL | undefined;
    try {
      parsed = new URL(url);
    } catch {
      /* handled below */
    }
    v.ensure(
      parsed?.protocol === 'https:' && !parsed.username && !parsed.password,
      'پیوند تور باید یک نشانی HTTPS معتبر باشد.',
    );
  }
  run('UPDATE cafes SET tour_url=? WHERE id=?', url, cafeId);
}

export function kitchenOrders(user: User, cafeId: string) {
  requireCafeAccess(user, cafeById(cafeId), 'orders');
  return all(
    `SELECT id,cafe_id,table_name,mode,status,items,note,created_at,preparation_minutes,preparation_started_at,
      payment_method,payment_status FROM orders WHERE cafe_id=? AND kind='menu'
      AND status IN ('pending','approved','preparing','ready','delivering')
      AND (payment_method='offline' OR payment_status='paid') ORDER BY created_at LIMIT 200`,
    cafeId,
  ).map(
    hydrate<
      Pick<
        Order,
        | 'id'
        | 'cafe_id'
        | 'table_name'
        | 'status'
        | 'items'
        | 'note'
        | 'created_at'
        | 'preparation_minutes'
        | 'preparation_started_at'
        | 'mode'
      >
    >,
  );
}
export function staffReservations(user: User, cafeId: string, date: string) {
  requireCafeAccess(user, cafeById(cafeId), 'reservations');
  return all<Reservation>(
    `SELECT r.*,u.name customer_name FROM reservations r JOIN users u ON u.id=r.user_id
    WHERE r.cafe_id=? AND r.date=? ORDER BY r.time,r.created_at`,
    cafeId,
    date,
  );
}

function editableReservation(user: User, cafeId: string, id: string) {
  const cafe = cafeById(cafeId);
  requireCafeAccess(user, cafe, 'reservations');
  const booking = one<Reservation>(
    'SELECT * FROM reservations WHERE cafe_id=? AND id=?',
    cafeId,
    id,
  );
  v.ensure(booking, 'رزرو پیدا نشد.', 404);
  v.ensure(
    ['pending', 'confirmed'].includes(booking.status) &&
      Date.parse(booking.date + 'T' + booking.time + ':00+03:30') > Date.now(),
    'این رزرو قابل تغییر نیست.',
    409,
  );
  return { cafe, booking };
}
export function rescheduleOptions(user: User, cafeId: string, id: string, params: URLSearchParams) {
  const { cafe, booking } = editableReservation(user, cafeId, id);
  const date = v.date(params.get('date') || booking.date);
  const time = params.get('time');
  const guests = v.integer(params.get('guests') || booking.guests, 'تعداد نفرات', 1, 20);
  return {
    slots: availableSlots(cafe, date, id).filter((slot) => slot.remaining >= guests),
    tables: time
      ? availableTables(cafe, date, v.time(time), guests, id).filter((table) => table.available)
      : [],
    requires_table: cafe.tables.length > 0,
  };
}
export function rescheduleReservation(
  user: User,
  cafeId: string,
  id: string,
  input: Record<string, unknown>,
) {
  transaction(() => {
    const { cafe, booking } = editableReservation(user, cafeId, id);
    const date = v.date(input.date),
      time = v.time(input.time),
      guests = v.integer(input.guests, 'تعداد نفرات', 1, 20);
    const tableId = v.text(input.table_id ?? '', 'میز', 0, 100),
      note = v.text(input.note ?? '', 'یادداشت', 0, 500);
    v.ensure(
      Date.parse(date + 'T12:00:00Z') < Date.now() + 31 * 86400000,
      'رزرو فقط تا سی روز آینده امکان‌پذیر است.',
      409,
    );
    const slot = availableSlots(cafe, date, id).find((item) => item.time === time);
    v.ensure(slot && slot.remaining >= guests, 'ساعت انتخاب‌شده ظرفیت کافی ندارد.', 409);
    const table = availableTables(cafe, date, time, guests, id).find(
      (item) => item.available && item.id === tableId,
    );
    v.ensure(cafe.tables.length ? table : !tableId, 'یک میز آزاد با ظرفیت کافی انتخاب کنید.', 409);
    const order = one<{ status: string; payment_status: string }>(
      'SELECT status,payment_status FROM orders WHERE reservation_id=?',
      id,
    );
    if (order)
      v.ensure(
        ['pending', 'approved', 'cancelled', 'rejected'].includes(order.status) &&
          order.payment_status !== 'pending',
        'پس از شروع آماده‌سازی یا تا زمان مشخص شدن نتیجه پرداخت، رزرو قابل تغییر نیست.',
        409,
      );
    run(
      'UPDATE reservations SET date=?,time=?,guests=?,table_id=?,table_name=?,note=? WHERE id=?',
      date,
      time,
      guests,
      tableId,
      table?.name || '',
      note,
      id,
    );
    if (order && ['pending', 'approved'].includes(order.status))
      run(
        'UPDATE orders SET table_name=?,updated_at=? WHERE reservation_id=?',
        table?.name || '',
        new Date().toISOString(),
        id,
      );
    if (
      booking.date !== date ||
      booking.time !== time ||
      booking.guests !== guests ||
      booking.table_id !== tableId
    )
      notify(
        booking.user_id,
        'جزئیات رزرو تغییر کرد',
        'ساعت و میز را در صفحه رزرو بررسی کنید.',
        '/reservations/' + id,
      );
  });
}
export function operationAccess(user: User, cafeId: string) {
  const cafe = cafeById(cafeId);
  const options = {
    owner: cafe.owner_id === user.id,
    kitchen: cafeAccess(user, cafe, 'orders'),
    cashier: cafeAccess(user, cafe, 'cashier'),
    reservations: cafeAccess(user, cafe, 'reservations'),
    meetings: cafeAccess(user, cafe, 'meetings'),
    accounting: cafeAccess(user, cafe, 'accounting'),
  };
  v.ensure(
    !cafe.is_demo && Object.values(options).some(Boolean),
    'دسترسی به این کافه مجاز نیست.',
    403,
  );
  return options;
}
