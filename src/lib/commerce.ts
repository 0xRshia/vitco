import { randomUUID } from 'node:crypto';
import { all, one, run, hydrate, transaction } from './database';
import { ensure, object, text, integer, list, date, time } from './validation';
import { notify } from './auth';
import { today } from './format';
import type { Cafe, Product, User, CartLine, Address, Coupon, Order, Reservation } from './types';

export function cafeById(id: string) {
  const row = one(
    'SELECT c.*, (SELECT AVG(rating) FROM reviews WHERE cafe_id=c.id) rating,(SELECT COUNT(*) FROM reviews WHERE cafe_id=c.id) review_count FROM cafes c WHERE c.id=?',
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
export function productById(id: string) {
  const row = one(
    'SELECT p.*,c.name cafe_name FROM products p JOIN cafes c ON c.id=p.cafe_id WHERE p.id=?',
    id,
  );
  ensure(row, 'محصول پیدا نشد.', 404);
  return hydrate<Product>(row);
}
export function quote(user: User, input: Record<string, unknown>) {
  const rows = list(input.items, 40);
  ensure(rows.length, 'سبد خرید شما خالی است.');
  let cafeId = '';
  const items: CartLine[] = rows.map((value) => {
    const item = object(value),
      p = productById(text(item.product_id, 'محصول', 1, 100));
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
    cafe.owner_id && cafe.active,
    'سفارش آنلاین این کافه فعال نیست. منو فقط برای مشاهده در دسترس است.',
    409,
  );
  const mode = text(input.mode, 'روش دریافت', 1, 20);
  ensure(mode === 'delivery' || mode === 'pickup', 'روش دریافت معتبر نیست.');
  ensure(mode === 'delivery' ? cafe.delivery : cafe.pickup, 'این روش دریافت برای کافه فعال نیست.');
  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  let coupon: Coupon | undefined;
  const code = text(input.coupon ?? '', 'کد تخفیف', 0, 40).toUpperCase();
  if (code) {
    coupon = one<Coupon>('SELECT * FROM coupons WHERE cafe_id=? AND code=?', cafeId, code);
    ensure(
      coupon && coupon.expires >= today() && coupon.uses < coupon.max_uses,
      'کد تخفیف نامعتبر یا منقضی شده است.',
    );
  }
  const discount = coupon ? Math.floor((subtotal * coupon.percent) / 100) : 0;
  const balance =
    one<{ points: number }>(
      'SELECT points FROM loyalty_balances WHERE user_id=? AND cafe_id=?',
      user.id,
      cafeId,
    )?.points || 0;
  const requestedPoints = integer(input.points ?? 0, 'امتیاز همین کافه', 0, balance);
  const pointsUsed = Math.min(requestedPoints, Math.floor((subtotal - discount) / 1000));
  const deliveryFee = mode === 'delivery' ? cafe.delivery_fee : 0;
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
export function createOrder(user: User, input: Record<string, unknown>) {
  const requestKey = text(input.request_key, 'شناسه درخواست', 10, 100);
  return transaction(() => {
    const existing = one<{ id: string }>(
      'SELECT id FROM orders WHERE user_id=? AND request_key=?',
      user.id,
      requestKey,
    );
    if (existing) return existing.id;
    const q = quote(user, input);
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
      ensure(hm >= q.cafe.opens && hm < q.cafe.closes, 'زمان دریافت خارج از ساعت کاری کافه است.');
    }
    const id = randomUUID(),
      now = new Date().toISOString();
    run(
      'INSERT INTO orders (id,user_id,cafe_id,mode,status,items,subtotal,discount,delivery_fee,points_used,total,address,pickup_at,note,created_at,updated_at,request_key) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
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
    );
    if (q.points_used) {
      run('UPDATE users SET points=points-? WHERE id=?', q.points_used, user.id);
      run(
        'UPDATE loyalty_balances SET points=points-? WHERE user_id=? AND cafe_id=?',
        q.points_used,
        user.id,
        q.cafe.id,
      );
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
  });
}
export function transitionOrder(user: User, id: string, status: string) {
  return transaction(() => {
    const order = one<Order>('SELECT * FROM orders WHERE id=?', id);
    ensure(order, 'سفارش پیدا نشد.', 404);
    const cafe = cafeById(order.cafe_id);
    const owner = cafe.owner_id === user.id;
    ensure(owner || order.user_id === user.id, 'دسترسی مجاز نیست.', 403);
    if (!owner)
      ensure(status === 'cancelled' && order.status === 'pending', 'این سفارش دیگر قابل لغو نیست.');
    const transitions: Record<string, string[]> = {
      pending: ['preparing', 'cancelled'],
      preparing: [order.mode === 'pickup' ? 'ready' : 'delivering', 'cancelled'],
      ready: ['completed'],
      delivering: ['completed'],
      completed: [],
      cancelled: [],
    };
    ensure(transitions[order.status]?.includes(status), 'تغییر وضعیت سفارش مجاز نیست.');
    run('UPDATE orders SET status=?,updated_at=? WHERE id=?', status, new Date().toISOString(), id);
    if (status === 'cancelled' && order.points_used) {
      run('UPDATE users SET points=points+? WHERE id=?', order.points_used, order.user_id);
      run(
        'UPDATE loyalty_balances SET points=points+? WHERE user_id=? AND cafe_id=?',
        order.points_used,
        order.user_id,
        order.cafe_id,
      );
    }
    if (status === 'completed') {
      run(
        'UPDATE users SET points=points+? WHERE id=?',
        Math.floor(order.total / 10000),
        order.user_id,
      );
      run(
        'INSERT INTO loyalty_balances (user_id,cafe_id,points) VALUES (?,?,?) ON CONFLICT(user_id,cafe_id) DO UPDATE SET points=points+excluded.points',
        order.user_id,
        order.cafe_id,
        Math.floor(order.total / 10000),
      );
    }
    notify(
      order.user_id,
      'وضعیت سفارش تغییر کرد',
      'جزئیات جدید سفارش خود را ببینید.',
      '/orders/' + id,
    );
  });
}
export function availableSlots(cafe: Cafe, selectedDate: string) {
  const [oh, om] = cafe.opens.split(':').map(Number),
    [ch, cm] = cafe.closes.split(':').map(Number);
  const result: { time: string; remaining: number }[] = [];
  if (!cafe.active || !cafe.owner_id) return result;
  const booked = all<{ time: string; guests: number }>(
    "SELECT time,SUM(guests) guests FROM reservations WHERE cafe_id=? AND date=? AND status IN ('pending','confirmed') GROUP BY time",
    cafe.id,
    selectedDate,
  );
  for (let minute = oh * 60 + om; minute + 60 <= ch * 60 + cm; minute += 60) {
    const t =
      String(Math.floor(minute / 60)).padStart(2, '0') + ':' + String(minute % 60).padStart(2, '0');
    if (new Date(`${selectedDate}T${t}:00+03:30`).getTime() <= Date.now()) continue;
    result.push({
      time: t,
      remaining: Math.max(0, cafe.capacity - (booked.find((b) => b.time === t)?.guests || 0)),
    });
  }
  return result;
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
    const id = randomUUID();
    run(
      'INSERT INTO reservations (id,cafe_id,user_id,date,time,guests,note,status,created_at,request_key) VALUES (?,?,?,?,?,?,?,?,?,?)',
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
    );
    notify(
      user.id,
      'درخواست رزرو ثبت شد',
      'درخواست شما برای کافه ارسال شد و در انتظار تأیید است.',
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
      owner = cafe.owner_id === user.id;
    ensure(owner || r.user_id === user.id, 'دسترسی مجاز نیست.', 403);
    ensure(['pending', 'confirmed'].includes(r.status), 'این رزرو قابل تغییر نیست.');
    ensure(
      owner ? ['confirmed', 'completed', 'cancelled'].includes(status) : status === 'cancelled',
      'وضعیت معتبر نیست.',
    );
    ensure(
      r.status === 'pending'
        ? ['confirmed', 'cancelled'].includes(status)
        : ['completed', 'cancelled'].includes(status),
      'تغییر وضعیت رزرو مجاز نیست.',
    );
    run('UPDATE reservations SET status=? WHERE id=?', status, id);
    notify(
      r.user_id,
      'وضعیت رزرو تغییر کرد',
      'آخرین وضعیت رزرو خود را بررسی کنید.',
      '/reservations',
    );
  });
}
