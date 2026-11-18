import { randomUUID } from 'node:crypto';
import { all, one, run, hydrate, transaction } from './database';
import { ensure, object, text, integer, list, date, time } from './validation';
import { notify } from './auth';
import { today } from './format';
import { cafeAcceptsPayments } from './payment-intake';
import { cafeAccess, cafeHours, platformAdmin } from './cafe-access';
import type { TableContext } from './table-service';
import { changeLoyaltyPoints, earnOrderPoints } from './loyalty';
import { cafeFeatures } from './cafe-features';
import type {
  Cafe,
  CafeTable,
  Product,
  User,
  CartLine,
  Address,
  Coupon,
  Order,
  Reservation,
} from './types';

export function cafeById(id: string) {
  const row = one(
    'SELECT c.*, (SELECT AVG(rating) FROM reviews WHERE cafe_id=c.id AND visible=1) rating,(SELECT COUNT(*) FROM reviews WHERE cafe_id=c.id AND visible=1) review_count FROM cafes c WHERE c.id=?',
    id,
  );
  ensure(row, 'کافه پیدا نشد.', 404);
  return hydrate<Cafe>(row);
}
export function ownerCafe(user: User, id: string) {
  const cafe = cafeById(id);
  ensure(cafe.owner_id === user.id, 'دسترسی به این کافه مجاز نیست.', 403);
  return cafe;
}
export function productById(id: string, vipCafeId = '') {
  const row = one(
    `SELECT p.*,c.name cafe_name FROM products p JOIN cafes c ON c.id=p.cafe_id
     WHERE p.id=? AND (p.vip_only=0 OR p.cafe_id=?) AND NOT EXISTS(SELECT 1 FROM menu_categories m WHERE m.cafe_id=p.cafe_id AND m.name=p.category AND visible=0)`,
    id,
    vipCafeId,
  );
  ensure(row, 'محصول پیدا نشد.', 404);
  return hydrate<Product>(row);
}
export function quote(
  user: User | null,
  input: Record<string, unknown>,
  table: TableContext | null = null,
) {
  const rows = list(input.items, 40);
  ensure(rows.length, 'سبد خرید شما خالی است.');
  let cafeId = '';
  const vipCafeId = table?.vip && cafeFeatures(table.cafe_id).vip_menu ? table.cafe_id : '';
  const items: CartLine[] = rows.map((value) => {
    const item = object(value),
      p = productById(text(item.product_id, 'محصول', 1, 100), vipCafeId);
    ensure(p.available, 'یکی از محصولات دیگر موجود نیست.');
    if (!cafeId) cafeId = p.cafe_id;
    ensure(cafeId === p.cafe_id, 'محصولات سبد باید از یک کافه باشند.');
    const quantity = integer(item.quantity, 'تعداد', 1, 20);
    const sizeId = text(item.size_id ?? '', 'اندازه', 0, 100);
    const size = p.sizes.find((s) => s.id === sizeId);
    ensure(p.sizes.length === 0 ? !sizeId : Boolean(size), 'اندازه محصول معتبر نیست.');
    const addonIds = list(item.addon_ids ?? [], 10).map((a) => text(a, 'افزودنی', 1, 100));
    ensure(
      new Set(addonIds).size === addonIds.length && addonIds.length <= p.max_addons,
      'تعداد افزودنی‌ها معتبر نیست.',
    );
    const addons = addonIds.map((id) => {
      const a = p.addons.find((a) => a.id === id);
      ensure(a, 'افزودنی محصول معتبر نیست.');
      return a;
    });
    const price = p.price + (size?.price || 0) + addons.reduce((sum, a) => sum + a.price, 0);
    return {
      key: randomUUID(),
      product_id: p.id,
      cafe_id: p.cafe_id,
      name: p.name,
      image: p.image,
      price,
      size_id: sizeId,
      addon_ids: addonIds,
      option_names: [...(size ? [size.name] : []), ...addons.map((a) => a.name)],
      quantity,
      note: text(item.note ?? '', 'یادداشت', 0, 300),
    };
  });
  const cafe = cafeById(cafeId);
  ensure(
    cafe.owner_id && cafe.active && !cafe.is_demo,
    'سفارش آنلاین این کافه فعال نیست. منو فقط برای مشاهده در دسترس است.',
    409,
  );
  const mode = text(input.mode, 'روش دریافت', 1, 20);
  ensure(
    mode !== 'delivery',
    'ارسال به آدرس دیگر ارائه نمی‌شود. دریافت از کافه یا رزرو میز را انتخاب کنید.',
  );
  ensure(['pickup', 'dine_in'].includes(mode), 'روش دریافت معتبر نیست.');
  ensure(mode === 'dine_in' || cafe.pickup, 'این روش دریافت برای کافه فعال نیست.');
  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  let coupon: Coupon | undefined;
  const code = text(input.coupon ?? '', 'کد تخفیف', 0, 40).toUpperCase();
  if (code) {
    coupon = one<Coupon>(
      'SELECT * FROM coupons WHERE cafe_id=? AND code=? AND (recipient_id IS NULL OR recipient_id=?)',
      cafeId,
      code,
      user?.id ?? '',
    );
    ensure(
      coupon && coupon.expires >= today() && coupon.uses < coupon.max_uses,
      'کد تخفیف نامعتبر یا منقضی شده است.',
    );
  }
  const discount = coupon ? Math.floor((subtotal * coupon.percent) / 100) : 0;
  const balance =
    one<{ points: number }>(
      'SELECT points FROM loyalty_balances WHERE user_id=? AND cafe_id=?',
      user?.id ?? '',
      cafeId,
    )?.points || 0;
  const requestedPoints = integer(input.points ?? 0, 'امتیاز همین کافه', 0, balance);
  const pointsUsed = Math.min(requestedPoints, Math.floor((subtotal - discount) / 1000));
  const deliveryFee = 0;
  return {
    cafe,
    mode: mode as Order['mode'],
    items,
    subtotal,
    discount,
    delivery_fee: deliveryFee,
    points_used: pointsUsed,
    total: subtotal - discount - pointsUsed * 1000 + deliveryFee,
    coupon,
  };
}
export function createOrder(
  user: User,
  input: Record<string, unknown>,
  table: TableContext | null = null,
) {
  return transaction(() => createOrderRecord(user, input, table));
}
// Shared only inside a transaction, so a reservation and its meal order commit together.
function createOrderRecord(
  user: User,
  input: Record<string, unknown>,
  table: TableContext | null = null,
) {
  const requestKey = text(input.request_key, 'شناسه درخواست', 10, 100);
  const existing = one<{ id: string; kind: string }>(
    'SELECT id,kind FROM orders WHERE user_id=? AND request_key=?',
    user.id,
    requestKey,
  );
  if (existing) {
    ensure(existing.kind === 'menu', 'این شناسه برای فاکتور حضوری استفاده شده است.', 409);
    return existing.id;
  }
  const q = quote(user, input, table);
  const paymentMethod = text(input.payment_method ?? 'offline', 'روش پرداخت', 1, 20);
  ensure(['offline', 'zarinpal'].includes(paymentMethod), 'روش پرداخت معتبر نیست.');
  if (paymentMethod === 'zarinpal') {
    ensure(cafeAcceptsPayments(q.cafe.id), 'پرداخت آنلاین این کافه هنوز فعال نیست.', 409);
    ensure(
      q.total > 0 && q.total <= 100000000,
      'برای پرداخت آنلاین مبلغ سفارش باید بیشتر از صفر و حداکثر صد میلیون تومان باشد.',
    );
  }
  if (input.expected_total !== undefined)
    ensure(
      integer(input.expected_total, 'مبلغ مورد انتظار', 0, Number.MAX_SAFE_INTEGER) === q.total,
      'قیمت سفارش تغییر کرده است. مبلغ تازه را بررسی و دوباره ثبت کنید.',
      409,
    );
  const reservationId = text(input.reservation_id ?? '', 'رزرو', 0, 100);
  if (table) {
    ensure(
      q.mode === 'dine_in' && table.cafe_id === q.cafe.id && !reservationId,
      'سفارش باید برای همان میز و شعبه ثبت شود.',
      403,
    );
  } else if (q.mode === 'dine_in') {
    const reservation = one<Reservation>(
      'SELECT * FROM reservations WHERE id=? AND user_id=? AND cafe_id=?',
      reservationId,
      user.id,
      q.cafe.id,
    );
    ensure(
      reservation && ['pending', 'confirmed'].includes(reservation.status),
      'رزرو معتبری برای این سفارش انتخاب نشده است.',
    );
    ensure(
      Date.parse(reservation.date + 'T' + reservation.time + ':00+03:30') + 3600000 > Date.now(),
      'زمان این رزرو گذشته است.',
    );
    ensure(
      !one('SELECT id FROM orders WHERE reservation_id=?', reservationId),
      'برای این رزرو قبلاً سفارش ثبت شده است.',
      409,
    );
  } else ensure(!reservationId, 'فقط سفارش داخل کافه می‌تواند به رزرو متصل شود.');
  let address: Address | null = null;
  if (q.mode === 'delivery') {
    const row = one(
      'SELECT * FROM addresses WHERE id=? AND user_id=?',
      text(input.address_id, 'آدرس', 1, 100),
      user.id,
    );
    ensure(row, 'آدرس تحویل را انتخاب کنید.');
    address = hydrate<Address>(row);
    ensure(address.city.trim() === q.cafe.city.trim(), 'آدرس تحویل باید در شهر کافه باشد.');
  }
  const pickupAt = text(input.pickup_at ?? '', 'زمان دریافت', 0, 40);
  if (pickupAt) {
    const parsed = new Date(pickupAt);
    ensure(
      Number.isFinite(parsed.getTime()) &&
        parsed.getTime() > Date.now() &&
        parsed.getTime() < Date.now() + 7 * 86400000,
      'زمان دریافت باید در هفت روز آینده باشد.',
    );
    const hm = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Tehran',
      hour: '2-digit',
      minute: '2-digit',
    }).format(parsed);
    ensure(q.mode === 'pickup', 'زمان دریافت فقط برای سفارش بیرون‌بر است.');
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(parsed);
    const hours = cafeHours(q.cafe, day);
    ensure(hm >= hours.opens && hm < hours.closes, 'زمان دریافت خارج از ساعت کاری کافه است.');
  }
  const id = randomUUID(),
    now = new Date().toISOString();
  run(
    'INSERT INTO orders (id,user_id,cafe_id,mode,status,items,subtotal,discount,delivery_fee,points_used,total,address,pickup_at,note,created_at,updated_at,request_key,reservation_id,payment_method,table_name) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    id,
    user.id,
    q.cafe.id,
    q.mode,
    'pending',
    JSON.stringify(q.items),
    q.subtotal,
    q.discount,
    q.delivery_fee,
    q.points_used,
    q.total,
    address ? JSON.stringify(address) : null,
    pickupAt,
    text(input.note ?? '', 'یادداشت', 0, 500),
    now,
    now,
    requestKey,
    reservationId,
    paymentMethod,
    table?.table_name ?? '',
  );
  if (q.points_used) {
    changeLoyaltyPoints(user.id, q.cafe.id, -q.points_used, 'استفاده از امتیاز در سفارش');
  }
  if (q.coupon) run('UPDATE coupons SET uses=uses+1 WHERE id=?', q.coupon.id);
  notify(
    user.id,
    'سفارش شما ثبت شد',
    `سفارش شما در ${q.cafe.name} در انتظار تأیید است.`,
    '/orders/' + id,
  );
  notify(
    q.cafe.owner_id!,
    'سفارش جدید',
    `${user.name} یک سفارش جدید ثبت کرد.`,
    '/dashboard?tab=orders',
  );
  return id;
}
export function transitionOrder(user: User, id: string, status: string, minutes?: unknown) {
  return transaction(() => transitionOrderRecord(user, id, status, minutes));
}
function transitionOrderRecord(user: User, id: string, status: string, minutes?: unknown) {
  const order = one<Order>('SELECT * FROM orders WHERE id=?', id);
  ensure(order, 'سفارش پیدا نشد.', 404);
  const cafe = cafeById(order.cafe_id);
  const owner = cafeAccess(user, cafe, 'orders') || platformAdmin(user);
  ensure(owner || order.user_id === user.id, 'دسترسی مجاز نیست.', 403);
  ensure(order.kind !== 'event', 'برای لغو بلیت از بخش ثبت‌نام‌های من استفاده کنید.', 409);
  if (order.kind === 'invoice')
    ensure(
      status === 'cancelled' && order.status === 'pending',
      'فاکتور حضوری فقط پس از تأیید درگاه تسویه می‌شود و مرحله آماده‌سازی ندارد.',
      409,
    );
  if (order.payment_method === 'zarinpal') {
    ensure(
      order.payment_status !== 'pending',
      'نتیجه پرداخت هنوز مشخص نیست. ابتدا وضعیت پرداخت را بررسی کنید.',
      409,
    );
    if (status !== 'cancelled')
      ensure(
        order.payment_status === 'paid',
        'پیش از آماده‌سازی سفارش باید پرداخت آنلاین تأیید شود.',
        409,
      );
  }
  if (!owner)
    ensure(status === 'cancelled' && order.status === 'pending', 'این سفارش دیگر قابل لغو نیست.');
  const transitions: Record<string, string[]> = {
    pending: ['preparing', 'approved', 'rejected', 'cancelled'],
    approved: ['preparing', 'rejected', 'cancelled'],
    preparing: [order.mode === 'delivery' ? 'delivering' : 'ready', 'cancelled'],
    ready: ['completed'],
    delivering: ['completed'],
    completed: [],
    cancelled: [],
  };
  ensure(transitions[order.status]?.includes(status), 'تغییر وضعیت سفارش مجاز نیست.');
  const now = new Date().toISOString();
  if (minutes !== undefined)
    ensure(status === 'preparing', 'زمان آماده‌سازی را هنگام شروع آماده‌سازی وارد کنید.');
  if (status === 'preparing')
    run(
      'UPDATE orders SET preparation_minutes=?,preparation_started_at=? WHERE id=?',
      minutes === undefined ? null : integer(minutes, 'دقیقه آماده‌سازی', 1, 240),
      now,
      id,
    );
  run('UPDATE orders SET status=?,updated_at=? WHERE id=?', status, now, id);
  const ended = status === 'cancelled' || status === 'rejected';
  if (ended && order.payment_method === 'zarinpal' && order.payment_status === 'paid') {
    run("UPDATE orders SET payment_status='refund_required' WHERE id=?", id);
    notify(
      cafe.owner_id!,
      'درخواست بازگشت وجه',
      'یک سفارش پرداخت‌شده لغو شد. بازگشت وجه باید در حساب پذیرنده پیگیری و تأیید شود.',
      '/dashboard?tab=orders',
    );
  }
  if (ended && order.points_used) {
    changeLoyaltyPoints(order.user_id, order.cafe_id, order.points_used, 'بازگشت امتیاز سفارش');
  }
  if (status === 'completed') awardOrderPoints(order);
  notify(
    order.user_id,
    'وضعیت سفارش تغییر کرد',
    'جزئیات جدید سفارش خود را ببینید.',
    '/orders/' + id,
  );
}
// Called once inside the transaction that moves an order to completed.
export function awardOrderPoints(order: Pick<Order, 'total' | 'user_id' | 'cafe_id'>) {
  earnOrderPoints(order.user_id, order.cafe_id, order.total);
}
export function availableSlots(cafe: Cafe, selectedDate: string, exclude = '') {
  const hours = cafeHours(cafe, selectedDate);
  const [oh, om] = hours.opens.split(':').map(Number),
    [ch, cm] = hours.closes.split(':').map(Number);
  const result: { time: string; remaining: number }[] = [];
  if (!cafe.active || !cafe.owner_id) return result;
  const booked = all<{ time: string; guests: number }>(
    "SELECT time,guests FROM reservations WHERE cafe_id=? AND date=? AND id<>? AND status IN ('pending','confirmed')",
    cafe.id,
    selectedDate,
    exclude,
  );
  for (let minute = oh * 60 + om; minute + 60 <= ch * 60 + cm; minute += 60) {
    const t =
      String(Math.floor(minute / 60)).padStart(2, '0') + ':' + String(minute % 60).padStart(2, '0');
    if (new Date(`${selectedDate}T${t}:00+03:30`).getTime() <= Date.now()) continue;
    result.push({
      time: t,
      remaining: Math.max(
        0,
        cafe.capacity -
          booked.filter((b) => overlaps(b.time, t)).reduce((sum, b) => sum + b.guests, 0),
      ),
    });
  }
  return result;
}
function overlaps(a: string, b: string) {
  const minutes = (value: string) => {
    const [h, m] = value.split(':').map(Number);
    return h * 60 + m;
  };
  return Math.abs(minutes(a) - minutes(b)) < 60;
}
export function availableTables(
  cafe: Cafe,
  selectedDate: string,
  selectedTime: string,
  guests: number,
  exclude = '',
): (CafeTable & { available: boolean })[] {
  const booked = all<{ time: string; table_id: string }>(
    "SELECT time,table_id FROM reservations WHERE cafe_id=? AND date=? AND id<>? AND status IN ('pending','confirmed')",
    cafe.id,
    selectedDate,
    exclude,
  );
  const slot = availableSlots(cafe, selectedDate, exclude).find((s) => s.time === selectedTime);
  return cafe.tables.map((table) => ({
    ...table,
    available: Boolean(
      slot &&
      table.enabled !== false &&
      slot.remaining >= guests &&
      table.seats >= guests &&
      !booked.some((b) => b.table_id === table.id && overlaps(b.time, selectedTime)),
    ),
  }));
}
export function createReservation(user: User, input: Record<string, unknown>) {
  const requestKey = text(input.request_key, 'شناسه درخواست', 10, 100);
  return transaction(() => {
    const existing = one<{ id: string }>(
      'SELECT id FROM reservations WHERE user_id=? AND request_key=?',
      user.id,
      requestKey,
    );
    if (existing) return existing.id;
    const cafe = cafeById(text(input.cafe_id, 'کافه', 1, 100));
    const selectedDate = date(input.date),
      selectedTime = time(input.time),
      guests = integer(input.guests, 'تعداد نفرات', 1, 20);
    ensure(
      new Date(selectedDate + 'T12:00:00Z').getTime() < Date.now() + 31 * 86400000,
      'رزرو فقط تا سی روز آینده امکان‌پذیر است.',
    );
    const slot = availableSlots(cafe, selectedDate).find((s) => s.time === selectedTime);
    ensure(
      slot && slot.remaining >= guests,
      'ظرفیت این ساعت کافی نیست. ساعت دیگری انتخاب کنید.',
      409,
    );
    const tableId = text(input.table_id ?? '', 'میز', 0, 100);
    const table = availableTables(cafe, selectedDate, selectedTime, guests).find(
      (t) => t.id === tableId,
    );
    if (cafe.tables.length) ensure(table?.available, 'یک میز آزاد با ظرفیت کافی انتخاب کنید.', 409);
    else ensure(!tableId, 'میز انتخاب‌شده معتبر نیست.');
    const id = randomUUID();
    run(
      'INSERT INTO reservations (id,cafe_id,user_id,date,time,guests,note,status,created_at,request_key,table_id,table_name) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      id,
      cafe.id,
      user.id,
      selectedDate,
      selectedTime,
      guests,
      text(input.note ?? '', 'یادداشت', 0, 500),
      'pending',
      new Date().toISOString(),
      requestKey,
      tableId,
      table?.name || '',
    );
    const items = list(input.items ?? [], 40);
    ensure(
      !cafe.is_demo ||
        (!items.length && (!input.payment_method || input.payment_method === 'offline')),
      'رزرو آزمایشی بدون سفارش و پرداخت انجام می‌شود.',
    );
    if (items.length) {
      ensure(
        items.every(
          (item) => productById(text(object(item).product_id, 'محصول', 1, 100)).cafe_id === cafe.id,
        ),
        'محصولات سفارش باید متعلق به همین کافه باشند.',
      );
      createOrderRecord(user, {
        items,
        mode: 'dine_in',
        reservation_id: id,
        request_key: 'reserve:' + id,
        note: input.note ?? '',
        expected_total: input.expected_total,
        payment_method: input.payment_method,
      });
    }
    notify(
      user.id,
      'درخواست رزرو ثبت شد',
      cafe.is_demo
        ? 'درخواست آزمایشی ذخیره شد؛ رزرو واقعی انجام نشده است.'
        : 'درخواست شما برای کافه ارسال شد و در انتظار تأیید است.',
      '/reservations',
    );
    notify(
      cafe.owner_id!,
      'درخواست رزرو جدید',
      `${user.name} درخواست رزرو میز دارد.`,
      '/dashboard?tab=reservations',
    );
    return id;
  });
}
export function transitionReservation(user: User, id: string, status: string) {
  transaction(() => {
    const r = one<Reservation>('SELECT * FROM reservations WHERE id=?', id);
    ensure(r, 'رزرو پیدا نشد.', 404);
    const cafe = cafeById(r.cafe_id),
      owner = cafeAccess(user, cafe, 'reservations');
    ensure(owner || r.user_id === user.id, 'دسترسی مجاز نیست.', 403);
    ensure(['pending', 'confirmed'].includes(r.status), 'این رزرو قابل تغییر نیست.');
    ensure(
      owner
        ? ['confirmed', 'rejected', 'completed', 'no_show', 'cancelled'].includes(status)
        : status === 'cancelled',
      'وضعیت معتبر نیست.',
    );
    ensure(
      r.status === 'pending'
        ? ['confirmed', 'rejected', 'cancelled'].includes(status)
        : ['completed', 'no_show', 'cancelled'].includes(status),
      'تغییر وضعیت رزرو مجاز نیست.',
    );
    if (['cancelled', 'rejected', 'no_show'].includes(status)) {
      const order = one<Order>('SELECT * FROM orders WHERE reservation_id=?', id);
      if (
        order &&
        !['cancelled', 'rejected'].includes(order.status) &&
        !(status === 'no_show' && order.status === 'completed')
      )
        transitionOrderRecord(user, order.id, 'cancelled');
    }
    run('UPDATE reservations SET status=? WHERE id=?', status, id);
    notify(
      r.user_id,
      'وضعیت رزرو تغییر کرد',
      'آخرین وضعیت رزرو خود را بررسی کنید.',
      '/reservations/' + id,
    );
  });
}
