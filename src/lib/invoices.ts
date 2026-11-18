import { randomUUID } from 'node:crypto';
import { cafeById } from './commerce';
import { hash, notify } from './auth';
import { one, run, transaction } from './database';
import { today } from './format';
import { ensure, integer, text } from './validation';
import { cafeAcceptsPayments } from './payment-intake';
import type { Coupon, InvoiceQuote, Order, User } from './types';

/** The larger of the café's automatic discount and its supplied coupon applies. */
export function quoteInvoice(input: Record<string, unknown>): InvoiceQuote {
  const cafe = cafeById(text(input.cafe_id, 'کافه', 1, 100));
  const subtotal = integer(input.amount, 'مبلغ فاکتور به تومان', 1, 100000000);
  const code = text(input.coupon ?? '', 'کد تخفیف', 0, 40).toUpperCase();
  let coupon: Coupon | undefined;
  if (code) {
    coupon = one<Coupon>(
      'SELECT * FROM coupons WHERE cafe_id=? AND code=? AND recipient_id IS NULL',
      cafe.id,
      code,
    );
    ensure(
      cafe.active &&
        cafe.owner_id &&
        coupon &&
        coupon.expires >= today() &&
        coupon.uses < coupon.max_uses,
      'کد تخفیف نامعتبر، منقضی یا ظرفیت آن تکمیل شده است.',
    );
  }
  const automatic = cafe.active && cafe.owner_id ? cafe.invoice_discount_percent : 0;
  const percent = Math.max(automatic, coupon?.percent || 0);
  const discount = Math.floor((subtotal * percent) / 100);
  ensure(subtotal > discount, 'مبلغ قابل پرداخت فاکتور باید حداقل یک تومان باشد.');
  return {
    cafe_id: cafe.id,
    subtotal,
    automatic_percent: automatic,
    coupon_percent: coupon?.percent || 0,
    applied_percent: percent,
    coupon: code,
    discount,
    total: subtotal - discount,
  };
}

export function createInvoice(user: User, input: Record<string, unknown>) {
  const key = text(input.request_key, 'شناسه درخواست', 10, 100);
  const cafeId = text(input.cafe_id, 'کافه', 1, 100);
  const amount = integer(input.amount, 'مبلغ فاکتور به تومان', 1, 100000000);
  const code = text(input.coupon ?? '', 'کد تخفیف', 0, 40).toUpperCase();
  const expected = integer(input.expected_total, 'مبلغ مورد انتظار', 1, 100000000);
  const signature = hash(JSON.stringify([cafeId, amount, code, expected]));
  return transaction(() => {
    const existing = one<Pick<Order, 'id' | 'kind'>>(
      'SELECT id,kind FROM orders WHERE user_id=? AND request_key=?',
      user.id,
      key,
    );
    if (existing) {
      const details = one<{ request_signature: string }>(
        'SELECT request_signature FROM invoice_details WHERE order_id=?',
        existing.id,
      );
      ensure(
        existing.kind === 'invoice' && details?.request_signature === signature,
        'این شناسه برای فاکتور دیگری استفاده شده است. وضعیت پرداخت قبلی را بررسی کنید.',
        409,
      );
      return existing.id;
    }
    const cafe = cafeById(cafeId);
    ensure(cafe.owner_id && cafe.active, 'پرداخت حضوری این کافه هنوز فعال نیست.', 409);
    ensure(cafeAcceptsPayments(cafe.id), 'درگاه پرداخت آنلاین این کافه هنوز فعال نیست.', 409);
    const quote = quoteInvoice({ cafe_id: cafeId, amount, coupon: code });
    ensure(
      quote.total === expected,
      'تخفیف یا مبلغ فاکتور تغییر کرده است. مبلغ تازه را بررسی و دوباره تأیید کنید.',
      409,
    );
    const coupon =
      code && quote.coupon_percent >= quote.automatic_percent
        ? one<Coupon>('SELECT * FROM coupons WHERE cafe_id=? AND code=?', cafe.id, code)
        : undefined;
    const id = randomUUID(),
      now = new Date().toISOString();
    run(
      "INSERT INTO orders (id,user_id,cafe_id,kind,mode,status,items,subtotal,discount,delivery_fee,points_used,total,address,pickup_at,note,created_at,updated_at,request_key,payment_method) VALUES (?,?,?,'invoice','dine_in','pending','[]',?,?,0,0,?,NULL,'','',?,?,?,'zarinpal')",
      id,
      user.id,
      cafe.id,
      quote.subtotal,
      quote.discount,
      quote.total,
      now,
      now,
      key,
    );
    run(
      'INSERT INTO invoice_details (order_id,automatic_percent,coupon_id,coupon_code,applied_percent,request_signature) VALUES (?,?,?,?,?,?)',
      id,
      quote.automatic_percent,
      coupon ? coupon.id : null,
      code,
      quote.applied_percent,
      signature,
    );
    if (coupon) run('UPDATE coupons SET uses=uses+1 WHERE id=?', coupon.id);
    notify(
      user.id,
      'فاکتور حضوری ثبت شد',
      'برای تسویه فاکتور، پرداخت آنلاین را تکمیل کنید.',
      '/orders/' + id,
    );
    return id;
  });
}
