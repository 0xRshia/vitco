import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { one, run, transaction } from './database';
import { hash, notify } from './auth';
import { awardOrderPoints, cafeById } from './commerce';
import { AppError, ensure, text } from './validation';
import type { Order, PaymentStatus, Reservation, User } from './types';
import {
  getZarinpalConfig,
  requestZarinpalPayment,
  verifyZarinpalPayment,
  inquireZarinpalPayment,
  ZarinpalError,
  type ZarinpalTransport,
} from './zarinpal';

type Payment = {
  id: string;
  order_id: string;
  authority: string;
  merchant_id: string;
  sandbox: number;
  amount_rial: number;
  callback_origin: string;
  state_hash: string;
  status: 'creating' | 'pending' | 'unknown' | 'paid' | 'failed';
  ref_id: string;
  provider_code: number | null;
  created_at: number;
  updated_at: number;
  verify_lock_until: number;
};
type Resolution = { status: PaymentStatus; ref_id: string; resume?: boolean };
const creatingLease = 60000;
const verificationLease = 120000;
const activeSql =
  "SELECT * FROM payments WHERE order_id=? AND status IN ('creating','pending','unknown') ORDER BY created_at DESC,rowid DESC LIMIT 1";
const paymentById = (id: string) => one<Payment>('SELECT * FROM payments WHERE id=?', id);
function orderById(id: string) {
  const order = one<Order>('SELECT * FROM orders WHERE id=?', text(id, 'سفارش', 1, 100));
  ensure(order, 'سفارش پیدا نشد.', 404);
  return order;
}
function snapshot(order: Order): Resolution {
  return { status: order.payment_status, ref_id: order.payment_ref };
}
function reservationExpired(order: Order) {
  if (!order.reservation_id) return false;
  const reservation = one<Reservation>(
    'SELECT * FROM reservations WHERE id=?',
    order.reservation_id,
  );
  return (
    !reservation ||
    !['pending', 'confirmed'].includes(reservation.status) ||
    Date.parse(reservation.date + 'T' + reservation.time + ':00+03:30') + 3600000 <= Date.now()
  );
}
function payableOrder(order: Order) {
  ensure(order.payment_method === 'zarinpal', 'روش پرداخت این سفارش آنلاین نیست.', 409);
  ensure(order.status === 'pending', 'این سفارش دیگر قابل پرداخت نیست.', 409);
  ensure(!reservationExpired(order), 'زمان رزرو این سفارش گذشته یا رزرو لغو شده است.', 409);
  ensure(
    order.payment_status !== 'refund_required',
    'این پرداخت نیازمند پیگیری بازگشت وجه است.',
    409,
  );
}
function updateOrderAfterFailure(orderId: string) {
  if (!one(activeSql, orderId))
    run(
      "UPDATE orders SET payment_status='failed',updated_at=? WHERE id=? AND payment_status NOT IN ('paid','refund_required')",
      new Date().toISOString(),
      orderId,
    );
}
function failAttempt(paymentId: string, providerCode: number | null = null) {
  return transaction(() => {
    const payment = paymentById(paymentId)!;
    if (payment.status === 'paid') return snapshot(orderById(payment.order_id));
    run(
      "UPDATE payments SET status='failed',provider_code=?,verify_lock_until=0,updated_at=? WHERE id=?",
      providerCode,
      Date.now(),
      paymentId,
    );
    updateOrderAfterFailure(payment.order_id);
    return snapshot(orderById(payment.order_id));
  });
}
function uncertainAttempt(paymentId: string, providerCode: number | null = null) {
  return transaction(() => {
    const payment = paymentById(paymentId)!;
    if (payment.status === 'paid') return snapshot(orderById(payment.order_id));
    const another = one<Payment>(activeSql, payment.order_id);
    // A late callback for an old attempt must not collide with a newer active attempt.
    const status = !another || another.id === paymentId ? 'unknown' : payment.status;
    run(
      'UPDATE payments SET status=?,provider_code=?,verify_lock_until=0,updated_at=? WHERE id=?',
      status,
      providerCode,
      Date.now(),
      paymentId,
    );
    run(
      "UPDATE orders SET payment_status='pending',updated_at=? WHERE id=? AND payment_status NOT IN ('paid','refund_required')",
      new Date().toISOString(),
      payment.order_id,
    );
    return { ...snapshot(orderById(payment.order_id)), status: 'pending' as const };
  });
}
function finalize(paymentId: string, refId: string): Resolution {
  return transaction(() => {
    const payment = paymentById(paymentId)!,
      order = orderById(payment.order_id);
    if (payment.status === 'paid') return snapshot(order);
    const previousPaid = one<Payment>(
      "SELECT * FROM payments WHERE order_id=? AND status='paid' AND id<>? LIMIT 1",
      order.id,
      paymentId,
    );
    const refundRequired = Boolean(
      previousPaid ||
      order.status === 'cancelled' ||
      order.payment_status === 'refund_required' ||
      reservationExpired(order) ||
      !Number.isSafeInteger(order.total * 10) ||
      payment.amount_rial !== order.total * 10,
    );
    run(
      "UPDATE payments SET status='paid',ref_id=?,provider_code=NULL,verify_lock_until=0,updated_at=? WHERE id=?",
      refId,
      Date.now(),
      paymentId,
    );
    const paymentStatus: PaymentStatus = refundRequired ? 'refund_required' : 'paid';
    run(
      'UPDATE orders SET payment_status=?,payment_ref=?,updated_at=? WHERE id=?',
      paymentStatus,
      order.payment_ref || refId,
      new Date().toISOString(),
      order.id,
    );
    if (refundRequired) {
      const cafe = cafeById(order.cafe_id);
      if (cafe.owner_id)
        notify(
          cafe.owner_id,
          'نیاز به بررسی بازگشت وجه',
          'پرداختی برای سفارش لغوشده، رزرو گذشته یا پرداخت تکراری تأیید شده است. مبلغ و شماره تراکنش‌ها را بررسی و بازگشت وجه را از حساب پذیرنده پیگیری کنید.',
          '/dashboard?tab=orders',
        );
      notify(
        order.user_id,
        'پرداخت نیازمند پیگیری است',
        'وجه پرداختی ثبت شد، اما سفارش قابل پذیرش نیست. برای بررسی بازگشت وجه با کافه یا پشتیبانی تماس بگیرید.',
        '/orders/' + order.id,
      );
    } else if (order.kind === 'invoice') {
      run("UPDATE orders SET status='completed' WHERE id=?", order.id);
      awardOrderPoints(order);
      const cafe = cafeById(order.cafe_id);
      if (cafe.owner_id)
        notify(
          cafe.owner_id,
          'فاکتور حضوری تسویه شد',
          'پرداخت فاکتور حضوری در زرین‌پال تأیید شد. رسید را در بخش فروش ببینید.',
          '/dashboard?tab=orders',
        );
      notify(
        order.user_id,
        'فاکتور حضوری تسویه شد',
        'پرداخت فاکتور شما در زرین‌پال تأیید و رسید تسویه ثبت شد.',
        '/orders/' + order.id,
      );
    } else
      notify(
        order.user_id,
        'پرداخت سفارش تأیید شد',
        'پرداخت شما در زرین‌پال تأیید شد. سفارش برای تأیید کافه ارسال شده است.',
        '/orders/' + order.id,
      );
    return { status: paymentStatus, ref_id: order.payment_ref || refId };
  });
}

async function resolveAttempt(
  paymentId: string,
  directVerify: boolean,
  transport: ZarinpalTransport,
): Promise<Resolution> {
  const claim = transaction(() => {
    const payment = paymentById(paymentId)!;
    const order = orderById(payment.order_id);
    if (payment.status === 'paid') return { result: snapshot(order) };
    if (!payment.authority) {
      if (Date.now() - payment.updated_at >= creatingLease) {
        run(
          "UPDATE payments SET status='failed',verify_lock_until=0,updated_at=? WHERE id=?",
          Date.now(),
          payment.id,
        );
        updateOrderAfterFailure(order.id);
        return { result: snapshot(orderById(order.id)) };
      }
      return { result: { status: 'pending' as const, ref_id: order.payment_ref } };
    }
    if (payment.verify_lock_until > Date.now())
      return { result: { status: 'pending' as const, ref_id: order.payment_ref } };
    const lock = Date.now() + verificationLease;
    run('UPDATE payments SET verify_lock_until=? WHERE id=?', lock, payment.id);
    return { payment, lock };
  });
  if ('result' in claim) return claim.result!;
  const { payment, lock } = claim;
  try {
    const credentials = {
      merchantId: payment.merchant_id,
      sandbox: Boolean(payment.sandbox),
      authority: payment.authority,
    };
    if (!directVerify) {
      const inquiry = await inquireZarinpalPayment(credentials, transport);
      if (inquiry.status === 'FAILED' || inquiry.status === 'REVERSED')
        return failAttempt(payment.id);
      if (inquiry.status === 'IN_BANK')
        return { ...uncertainAttempt(payment.id), status: 'pending', resume: true };
    }
    const verified = await verifyZarinpalPayment(
      { ...credentials, amountRial: payment.amount_rial },
      transport,
    );
    return finalize(payment.id, verified.refId);
  } catch (error) {
    if (error instanceof ZarinpalError && error.providerCode === -51)
      return failAttempt(payment.id, error.providerCode);
    return uncertainAttempt(payment.id, error instanceof ZarinpalError ? error.providerCode : null);
  } finally {
    run(
      'UPDATE payments SET verify_lock_until=0 WHERE id=? AND verify_lock_until=?',
      payment.id,
      lock,
    );
  }
}

export async function startPayment(
  user: User,
  orderId: string,
  transport: ZarinpalTransport = fetch,
): Promise<{ url: string } | { paid: true }> {
  const initial = orderById(orderId);
  ensure(initial.user_id === user.id, 'فقط خریدار می‌تواند پرداخت این سفارش را آغاز کند.', 403);
  if (initial.payment_status === 'paid') return { paid: true };
  payableOrder(initial);
  const active = one<Payment>(activeSql, initial.id);
  if (active) {
    const resolution = await resolveAttempt(active.id, false, transport);
    if (resolution.status === 'paid') return { paid: true };
    ensure(
      resolution.status !== 'refund_required',
      'این پرداخت نیازمند پیگیری بازگشت وجه است.',
      409,
    );
    if (resolution.status === 'pending') {
      if (resolution.resume && active.authority) {
        payableOrder(orderById(orderId));
        return {
          url:
            (active.sandbox ? 'https://sandbox.zarinpal.com' : 'https://payment.zarinpal.com') +
            '/pg/StartPay/' +
            active.authority,
        };
      }
      throw new AppError(
        'نتیجه درخواست پرداخت قبلی هنوز مشخص نیست. وضعیت پرداخت را دوباره بررسی کنید.',
        409,
      );
    }
  }
  const config = getZarinpalConfig();
  ensure(
    config && (config.cafeIds === '*' || config.cafeIds.includes(initial.cafe_id)),
    'پرداخت آنلاین این کافه هنوز فعال نیست.',
    503,
  );
  const state = randomBytes(32).toString('hex');
  const payment = transaction(() => {
    const order = orderById(orderId);
    if (order.payment_status === 'paid') return null;
    payableOrder(order);
    ensure(!one(activeSql, order.id), 'درخواست پرداخت دیگری در حال بررسی است.', 409);
    const cafe = cafeById(order.cafe_id);
    ensure(cafe.active && cafe.owner_id, 'پذیرش سفارش این کافه فعال نیست.', 409);
    const amountRial = order.total * 10;
    ensure(
      Number.isSafeInteger(amountRial) && amountRial > 0 && amountRial <= 1000000000,
      'مبلغ پرداخت آنلاین معتبر نیست.',
    );
    const now = Date.now(),
      id = randomUUID();
    run(
      "INSERT INTO payments (id,order_id,merchant_id,sandbox,amount_rial,callback_origin,state_hash,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'creating',?,?)",
      id,
      order.id,
      config.merchantId,
      config.sandbox ? 1 : 0,
      amountRial,
      config.origin,
      hash(state),
      now,
      now,
    );
    run(
      "UPDATE orders SET payment_status='pending',updated_at=? WHERE id=?",
      new Date().toISOString(),
      order.id,
    );
    return paymentById(id)!;
  });
  if (!payment) return { paid: true };
  let authority = '';
  try {
    const callbackUrl = new URL('/api/payments/callback', payment.callback_origin);
    callbackUrl.searchParams.set('payment', payment.id);
    callbackUrl.searchParams.set('state', state);
    const requested = await requestZarinpalPayment(
      {
        merchantId: payment.merchant_id,
        sandbox: Boolean(payment.sandbox),
        amountRial: payment.amount_rial,
        callbackUrl: callbackUrl.toString(),
        description: 'پرداخت سفارش ویتکو ' + payment.order_id,
        orderId: payment.order_id,
      },
      transport,
    );
    authority = requested.authority;
    const accepted = transaction(() => {
      const current = paymentById(payment.id)!,
        order = orderById(payment.order_id);
      // A process pause or lease recovery must never deliver a retired attempt's URL.
      if (
        current.status !== 'creating' ||
        order.status !== 'pending' ||
        order.payment_status === 'paid' ||
        order.payment_status === 'refund_required' ||
        reservationExpired(order)
      ) {
        run(
          "UPDATE payments SET authority=?,status='failed',updated_at=? WHERE id=? AND status<>'paid'",
          authority,
          Date.now(),
          payment.id,
        );
        updateOrderAfterFailure(order.id);
        return false;
      }
      run(
        "UPDATE payments SET authority=?,status='pending',updated_at=? WHERE id=?",
        authority,
        Date.now(),
        payment.id,
      );
      return true;
    });
    ensure(accepted, 'درخواست پرداخت دیگر قابل استفاده نیست. وضعیت سفارش را بررسی کنید.', 409);
    return { url: requested.url };
  } catch (error) {
    transaction(() => {
      const current = paymentById(payment.id)!;
      if (current.status !== 'creating') return;
      const uncertain = !(error instanceof ZarinpalError) || error.retryable;
      run(
        'UPDATE payments SET status=?,authority=?,provider_code=?,updated_at=? WHERE id=?',
        uncertain ? 'unknown' : 'failed',
        authority,
        error instanceof ZarinpalError ? error.providerCode : null,
        Date.now(),
        payment.id,
      );
      if (!uncertain) updateOrderAfterFailure(payment.order_id);
    });
    if (error instanceof AppError) throw error;
    throw new AppError(
      'درخواست پرداخت به نتیجه نرسید. پیش از تلاش دوباره، وضعیت سفارش را بررسی کنید.',
      502,
    );
  }
}

export async function checkPayment(
  user: User,
  orderId: string,
  transport: ZarinpalTransport = fetch,
): Promise<{ status: PaymentStatus; ref_id: string }> {
  const order = orderById(orderId),
    cafe = cafeById(order.cafe_id);
  ensure(
    order.user_id === user.id || cafe.owner_id === user.id,
    'دسترسی به وضعیت این پرداخت مجاز نیست.',
    403,
  );
  if (
    order.payment_method !== 'zarinpal' ||
    ['paid', 'refund_required'].includes(order.payment_status)
  )
    return snapshot(order);
  const payment =
    one<Payment>(activeSql, order.id) ||
    one<Payment>(
      'SELECT * FROM payments WHERE order_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1',
      order.id,
    );
  if (!payment) return snapshot(order);
  const result = await resolveAttempt(payment.id, false, transport);
  return { status: result.status, ref_id: result.ref_id };
}

export async function paymentCallback(
  input: { payment: unknown; state: unknown; Authority: unknown; Status: unknown },
  transport: ZarinpalTransport = fetch,
): Promise<{ origin: string; orderId: string; result: 'success' | 'failed' | 'pending' }> {
  const payment = paymentById(text(input.payment, 'پرداخت', 1, 100));
  ensure(payment, 'تراکنش پیدا نشد.', 404);
  const state = text(input.state, 'شناسه بازگشت', 64, 64);
  ensure(
    /^[a-f\d]{64}$/.test(state) &&
      /^[a-f\d]{64}$/.test(payment.state_hash) &&
      timingSafeEqual(Buffer.from(hash(state), 'hex'), Buffer.from(payment.state_hash, 'hex')),
    'شناسه بازگشت پرداخت معتبر نیست.',
    403,
  );
  ensure(
    typeof input.Authority === 'string' &&
      input.Authority === payment.authority &&
      Boolean(payment.authority),
    'شناسه تراکنش با درخواست پرداخت مطابقت ندارد.',
    403,
  );
  ensure(input.Status === 'OK' || input.Status === 'NOK', 'وضعیت بازگشت درگاه معتبر نیست.');
  const resolution = await resolveAttempt(payment.id, input.Status === 'OK', transport);
  return {
    origin: payment.callback_origin,
    orderId: payment.order_id,
    result:
      resolution.status === 'paid'
        ? 'success'
        : resolution.status === 'pending'
          ? 'pending'
          : 'failed',
  };
}
