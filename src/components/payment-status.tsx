'use client';
import { useState } from 'react';
import { CreditCard, RotateCcw, ShieldCheck } from 'lucide-react';
import { api, useApp } from '@/lib/client';
import type { Bootstrap, Order } from '@/lib/types';
import { ErrorBox } from './ui';

export type PaymentMethod = 'offline' | 'zarinpal';

export function onlinePaymentForCafe(
  config: Bootstrap['onlinePayment'] | undefined,
  cafeId: string | undefined,
) {
  return Boolean(
    config?.available && cafeId && (config.all_cafes || config.cafe_ids.includes(cafeId)),
  );
}

export function paymentIsPending(order: Pick<Order, 'payment_method' | 'payment_status'>) {
  return order.payment_method === 'zarinpal' && order.payment_status === 'pending';
}

export const paymentStatusLabels: Record<Order['payment_status'], string> = {
  unpaid: 'در انتظار پرداخت',
  pending: 'در انتظار نتیجه پرداخت',
  paid: 'پرداخت تأیید شده',
  failed: 'پرداخت انجام نشده',
  refund_required: 'نیازمند بازگشت وجه',
};

export function PaymentMethodPicker({
  available,
  sandbox,
  value,
  onChange,
  disabled = false,
}: {
  available: boolean;
  sandbox: boolean;
  value: PaymentMethod;
  onChange: (value: PaymentMethod) => void;
  disabled?: boolean;
}) {
  if (!available)
    return (
      <div className="payment-info">
        <CreditCard size={20} />
        <div>
          <strong>پرداخت هنگام دریافت</strong>
          <small>مستقیماً به کافه پرداخت می‌کنید.</small>
        </div>
      </div>
    );
  return (
    <fieldset className="payment-method-picker" disabled={disabled}>
      <legend>روش پرداخت</legend>
      <label className={'payment-method-option ' + (value === 'offline' ? 'selected' : '')}>
        <input
          type="radio"
          name="payment_method"
          value="offline"
          checked={value === 'offline'}
          onChange={() => onChange('offline')}
        />
        <span>
          <strong>پرداخت هنگام دریافت</strong>
          <small>پرداخت مستقیم به کافه</small>
        </span>
      </label>
      <label className={'payment-method-option ' + (value === 'zarinpal' ? 'selected' : '')}>
        <input
          type="radio"
          name="payment_method"
          value="zarinpal"
          checked={value === 'zarinpal'}
          onChange={() => onChange('zarinpal')}
        />
        <span>
          <strong>پرداخت آنلاین با زرین‌پال</strong>
          <small>پس از ثبت، پرداخت را از صفحه سفارش ادامه دهید.</small>
        </span>
      </label>
      {sandbox && (
        <p className="notice">درگاه در حالت آزمایشی است؛ این روش برای پرداخت واقعی فعال نیست.</p>
      )}
    </fieldset>
  );
}

export function PaymentStatus({ order, onUpdated }: { order: Order; onUpdated: () => void }) {
  const { refresh } = useApp();
  const [busy, setBusy] = useState<'pay' | 'verify' | null>(null),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  if (order.payment_method !== 'zarinpal') return <p className="muted">روش پرداخت: هنگام دریافت</p>;
  const canPay =
    order.status === 'pending' && ['unpaid', 'pending', 'failed'].includes(order.payment_status);
  const canVerify = ['pending', 'failed'].includes(order.payment_status);
  async function perform(action: 'pay' | 'verify') {
    if (busy) return;
    setBusy(action);
    setError('');
    setMessage('');
    try {
      if (action === 'pay') {
        const result = await api<{ url?: string; paid?: boolean }>('payments', 'POST', {
          order_id: order.id,
        });
        if (result.paid) {
          onUpdated();
          await refresh();
        } else if (result.url) window.location.assign(result.url);
        else throw new Error('نشانی درگاه دریافت نشد. دوباره وضعیت پرداخت را بررسی کنید.');
      } else {
        const result = await api<{ status: Order['payment_status']; ref_id?: string }>(
          'payments/' + order.id + '/verify',
          'POST',
          {},
        );
        if (result.status === 'pending')
          setMessage('نتیجه پرداخت هنوز مشخص نشده است. پیش از پرداخت دوباره، نتیجه را بررسی کنید.');
        onUpdated();
        await refresh();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="order-payment-status stack" aria-label="وضعیت پرداخت سفارش">
      <h3>
        <CreditCard size={19} /> پرداخت آنلاین با زرین‌پال
      </h3>
      <p className={'payment-status-label payment-status-' + order.payment_status}>
        {paymentStatusLabels[order.payment_status] || 'وضعیت پرداخت نامشخص است'}
      </p>
      {order.payment_ref && (
        <p>
          شماره پیگیری: <bdi className="payment-reference">{order.payment_ref}</bdi>
        </p>
      )}
      {order.payment_status === 'paid' && (
        <p className="muted">پرداخت این سفارش از طریق درگاه تأیید شده است.</p>
      )}
      {canPay && order.payment_status === 'unpaid' && (
        <p className="muted">
          سفارش ثبت شده است؛ کافه پس از تأیید پرداخت می‌تواند آماده‌سازی آن را شروع کند.
        </p>
      )}
      {order.payment_status === 'refund_required' && (
        <p className="notice">
          مبلغ پرداخت‌شده به بررسی و هماهنگی کافه یا پشتیبانی برای بازگشت وجه نیاز دارد. بازگشت وجه
          خودکار انجام نشده است.
        </p>
      )}
      {order.payment_status === 'pending' && (
        <p className="notice">
          پرداخت در حال بررسی است. تا مشخص شدن نتیجه، امکان لغو سفارش وجود ندارد.
        </p>
      )}
      {order.payment_status === 'failed' && (
        <p className="muted">
          پرداخت این سفارش تأیید نشده است. اگر مبلغی از حساب شما کسر شده، ابتدا نتیجه پرداخت را
          بررسی کنید.
        </p>
      )}
      {error && <ErrorBox message={error} />}
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {canPay && (
        <button
          type="button"
          className="button primary full"
          disabled={Boolean(busy)}
          onClick={() => void perform('pay')}
        >
          <CreditCard size={18} />
          {busy === 'pay'
            ? 'در حال اتصال به درگاه…'
            : order.payment_status === 'pending'
              ? 'ادامه پرداخت'
              : 'پرداخت آنلاین'}
        </button>
      )}
      {canVerify && (
        <button
          type="button"
          className="button secondary full"
          disabled={Boolean(busy)}
          onClick={() => void perform('verify')}
        >
          <RotateCcw size={17} />
          {busy === 'verify' ? 'در حال بررسی پرداخت…' : 'بررسی نتیجه پرداخت'}
        </button>
      )}
      <p className="payment-security-note">
        <ShieldCheck size={16} /> اطلاعات کارت فقط در درگاه پرداخت وارد می‌شود.
      </p>
    </section>
  );
}
