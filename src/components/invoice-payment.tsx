'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  CreditCard,
  Info,
  MapPin,
  Pencil,
  Percent,
  ReceiptText,
  TicketPercent,
} from 'lucide-react';
import { api, useApp, useResource } from '@/lib/client';
import { digits, latin, money } from '@/lib/format';
import type { InvoiceQuote, Order } from '@/lib/types';
import { onlinePaymentForCafe } from './payment-status';
import { Empty, ErrorBox, Field, Modal, PageTitle } from './ui';

type InvoiceAttempt = {
  userId: string;
  payload: {
    cafe_id: string;
    amount: number;
    coupon: string;
    expected_total: number;
    request_key: string;
  };
  orderId?: string;
};
export function InvoicePaymentView() {
  const { data, refresh } = useApp(),
    query = useSearchParams(),
    router = useRouter();
  const cafeId = query.get('cafe') || '';
  const cafe = data?.cafes.find((cafe) => cafe.id === cafeId);
  const [amount, setAmount] = useState(''),
    [quote, setQuote] = useState<InvoiceQuote | null>(null);
  const [step, setStep] = useState<'amount' | 'review'>('amount');
  const [code, setCode] = useState(''),
    [codeInput, setCodeInput] = useState('');
  const [couponOpen, setCouponOpen] = useState(false),
    [helpOpen, setHelpOpen] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [attempt, setAttempt] = useState<InvoiceAttempt | null>(null);
  const restored = useRef(false),
    submitting = useRef(false);
  const storageKey = 'vitco-invoice:' + cafeId;
  const available = Boolean(
    cafe?.owner_id &&
    cafe.active &&
    !cafe.is_demo &&
    onlinePaymentForCafe(data?.onlinePayment, cafeId),
  );
  const number = Number(amount);
  const validAmount =
    /^\d+$/.test(amount) && Number.isSafeInteger(number) && number > 0 && number <= 100000000;
  const pending = attempt?.userId === data?.user?.id ? attempt : null;
  const recovered = useResource<{ order: Order }>(
    pending?.orderId ? 'orders/' + pending.orderId : null,
  );
  const closed =
    recovered.data?.order.kind === 'invoice' &&
    ['completed', 'cancelled'].includes(recovered.data.order.status) &&
    !['pending', 'refund_required'].includes(recovered.data.order.payment_status);
  useEffect(() => {
    if (restored.current || !data) return;
    restored.current = true;
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
      if (saved && typeof saved.amount === 'string' && /^\d{0,9}$/.test(saved.amount))
        setAmount(saved.amount);
      if (saved && typeof saved.code === 'string' && saved.code.length <= 40) {
        setCode(saved.code);
        setCodeInput(saved.code);
      }
      const old = saved?.attempt;
      if (
        old?.userId === data.user?.id &&
        old?.payload?.cafe_id === cafeId &&
        typeof old.payload.request_key === 'string' &&
        Number.isSafeInteger(old.payload.amount) &&
        Number.isSafeInteger(old.payload.expected_total) &&
        typeof old.payload.coupon === 'string'
      ) {
        setAttempt(old);
        setAmount(String(old.payload.amount));
        setCode(old.payload.coupon);
        setStep('review');
      }
    } catch {
      /* A damaged draft never supplies a server total or payment status. */
    }
  }, [data, cafeId, storageKey]);
  function saveDraft(
    nextAmount = amount,
    nextCode = code,
    nextAttempt: InvoiceAttempt | null = attempt,
  ) {
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({ amount: nextAmount, code: nextCode, attempt: nextAttempt }),
      );
    } catch {
      /* Payment idempotency also lives on the server. */
    }
  }
  async function review(coupon = code) {
    if (busy || !validAmount || pending) return;
    setBusy(true);
    setError('');
    try {
      const next = await api<InvoiceQuote>('invoices/quote', 'POST', {
        cafe_id: cafeId,
        amount: number,
        coupon,
      });
      setQuote(next);
      setCode(next.coupon);
      setCodeInput(next.coupon);
      setStep('review');
      setCouponOpen(false);
      saveDraft(amount, next.coupon, null);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function checkout() {
    if (submitting.current || closed || !available || (!quote && !pending)) return;
    if (!data?.user) {
      saveDraft();
      router.push('/login?next=' + encodeURIComponent('/bill?cafe=' + cafeId));
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError('');
    let current = pending || {
      userId: data.user.id,
      payload: {
        cafe_id: cafeId,
        amount: number,
        coupon: code,
        expected_total: quote!.total,
        request_key: crypto.randomUUID(),
      },
    };
    setAttempt(current);
    saveDraft(String(current.payload.amount), current.payload.coupon, current);
    try {
      if (!current.orderId) {
        const result = await api<{ id: string }>('invoices', 'POST', current.payload);
        current = { ...current, orderId: result.id };
        setAttempt(current);
        saveDraft(String(current.payload.amount), current.payload.coupon, current);
      }
      const result = await api<{ url?: string; paid?: boolean }>('payments', 'POST', {
        order_id: current.orderId,
      });
      if (result.paid) {
        await refresh();
        router.push('/orders/' + current.orderId);
      } else if (result.url) window.location.assign(result.url);
      else throw new Error('نشانی درگاه دریافت نشد. وضعیت فاکتور را بررسی کنید.');
    } catch (error) {
      const failure = error as Error & { status?: number };
      setError(failure.message);
      if (!current.orderId && failure.status && failure.status >= 400 && failure.status < 500) {
        setAttempt(null);
        saveDraft(amount, code, null);
        setQuote(null);
        setStep('amount');
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  if (!cafe)
    return (
      <>
        <PageTitle title="پرداخت حضوری" />
        <Empty
          title="ابتدا کافه را انتخاب کن"
          description="کافه‌ای که در آن حضور داری پیدا کن و مبلغ فاکتورت را وارد کن."
          href="/cafes"
          label="پیدا کردن کافه"
        />
      </>
    );
  return (
    <div className="invoice-page">
      <PageTitle
        title={cafe.name}
        description="پرداخت صورت‌حساب حضوری"
        back={'/cafes/' + cafe.id}
      />
      <ol className="invoice-progress" aria-label="مراحل پرداخت حضوری">
        <li className="done">
          <ReceiptText size={17} />
          مبلغ فاکتور
        </li>
        <li className={step === 'review' ? 'done' : ''}>
          <Percent size={17} />
          تخفیف‌ها
        </li>
        <li>
          <CreditCard size={17} />
          پرداخت
        </li>
      </ol>
      <p className="invoice-location">
        <MapPin size={21} />
        <span>
          {cafe.city}، {cafe.address}
          <small>مبلغ را مطابق فاکتور کافه وارد کن و هنگام حضور در کافه پرداخت کن.</small>
        </span>
      </p>
      {step === 'amount' ? (
        <>
          <form
            className="invoice-amount-card"
            onSubmit={(event) => {
              event.preventDefault();
              void review();
            }}
          >
            <Field label="مبلغ فاکتور (تومان)">
              <div className="invoice-amount-input">
                <input
                  autoFocus
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={15}
                  value={amount ? new Intl.NumberFormat('fa-IR').format(number) : ''}
                  placeholder="۰"
                  onChange={(event) => {
                    const raw = latin(event.target.value).replace(/[٬,\s]/g, '');
                    if (/^\d{0,9}$/.test(raw)) {
                      setAmount(raw);
                      setQuote(null);
                      setError('');
                      saveDraft(raw, code, null);
                    }
                  }}
                />
                <span>تومان</span>
              </div>
            </Field>
            <p className="invoice-rial-equivalent">
              {validAmount
                ? digits(new Intl.NumberFormat('en-US').format(number * 10)) + ' ریال'
                : 'حداکثر صد میلیون تومان'}
            </p>
            <div className="invoice-quick-amounts">
              {[100000, 200000, 500000].map((value) => (
                <button
                  type="button"
                  key={value}
                  disabled={number + value > 100000000}
                  onClick={() => {
                    setAmount(String(number + value));
                    setQuote(null);
                    setError('');
                    saveDraft(String(number + value), code, null);
                  }}
                >
                  + {digits(value / 1000)} هزار
                </button>
              ))}
              <button
                type="button"
                className="text-link"
                onClick={() => {
                  setAmount('');
                  setQuote(null);
                  saveDraft('', code, null);
                }}
              >
                پاک کردن
              </button>
            </div>
            <button type="button" className="invoice-help" onClick={() => setHelpOpen(true)}>
              <Info size={17} />
              مبلغ فاکتور را چطور وارد کنم؟
            </button>
            <div className="invoice-checkout-bar">
              <button className="button primary full" type="submit" disabled={!validAmount || busy}>
                {busy ? 'در حال محاسبه…' : 'ادامه'}
                <ArrowLeft size={18} />
              </button>
            </div>
          </form>
        </>
      ) : (
        <div className="invoice-review">
          <section className="invoice-total-card" aria-label="مبلغ قابل پرداخت فاکتور">
            <span>مبلغ قابل پرداخت</span>
            <strong>{money(pending?.payload.expected_total ?? quote?.total ?? 0)}</strong>
            {quote?.discount ||
            (pending && pending.payload.amount > pending.payload.expected_total) ? (
              <div className="invoice-total-discount">
                <del>{money(pending?.payload.amount ?? quote!.subtotal)}</del>
                <span>{quote ? digits(quote.applied_percent) + '٪ تخفیف' : 'تخفیف ثبت‌شده'}</span>
              </div>
            ) : (
              <p className="muted">تخفیف فعالی برای این فاکتور ثبت نشده است.</p>
            )}
            <button
              className="text-link"
              disabled={busy || Boolean(pending)}
              onClick={() => {
                setStep('amount');
                setQuote(null);
                setError('');
              }}
            >
              <Pencil size={16} />
              ویرایش مبلغ فاکتور
            </button>
          </section>
          {!pending && (
            <section className="invoice-benefits">
              <h2>تخفیف‌ها</h2>
              <div className="invoice-card">
                <div className="invoice-benefit-row">
                  <span className="invoice-feature-icon">
                    <Percent size={22} />
                  </span>
                  <span>
                    <strong>
                      تخفیف حضوری{Boolean(quote?.automatic_percent) && <small>خودکار</small>}
                    </strong>
                    <p>
                      {quote?.automatic_percent
                        ? digits(quote.automatic_percent) + '٪ روی مبلغ فاکتور'
                        : 'تخفیف حضوری توسط کافه ثبت نشده است'}
                    </p>
                  </span>
                  {Boolean(quote?.automatic_percent) && <b>{digits(quote!.automatic_percent)}٪</b>}
                </div>
                <button
                  className="invoice-benefit-row"
                  disabled={busy}
                  onClick={() => {
                    setCodeInput(code);
                    setCouponOpen(true);
                  }}
                >
                  <span className="invoice-feature-icon coupon">
                    <TicketPercent size={21} />
                  </span>
                  <span>
                    <strong>کد تخفیف</strong>
                    <p>{code || 'اگر کد داری، اینجا وارد کن'}</p>
                  </span>
                  <ChevronLeft size={18} />
                </button>
                {code && (
                  <p className="invoice-coupon-note">
                    {quote?.coupon_percent && quote.coupon_percent > quote.automatic_percent
                      ? 'کد تخفیف اعمال شد.'
                      : 'تخفیف حضوری برابر یا بیشتر است و اعمال شده است.'}{' '}
                    تخفیف‌ها با هم جمع نمی‌شوند.
                  </p>
                )}
              </div>
            </section>
          )}
          <section className="invoice-gateways">
            <h2>انتخاب درگاه پرداخت</h2>
            <label className={'invoice-card invoice-gateway' + (!available ? ' unavailable' : '')}>
              <CreditCard size={27} />
              <span>
                <strong>پرداخت آنلاین با زرین‌پال</strong>
                <small>
                  {available
                    ? data?.onlinePayment.sandbox
                      ? 'درگاه آزمایشی؛ بدون تراکنش بانکی واقعی'
                      : 'پرداخت امن با کارت بانکی'
                    : 'درگاه آنلاین این کافه هنوز فعال نشده است'}
                </small>
              </span>
              <input
                type="radio"
                name="invoice-gateway"
                value="zarinpal"
                aria-label="زرین‌پال"
                checked={available}
                disabled={!available || busy}
                readOnly
              />
            </label>
          </section>
          <section className="invoice-details">
            <h2>جزئیات پرداخت</h2>
            <div className="invoice-card">
              <div className="list-row">
                <span>مبلغ فاکتور</span>
                <strong>{money(pending?.payload.amount ?? quote?.subtotal ?? 0)}</strong>
              </div>
              <div className="list-row">
                <span>
                  تخفیف{quote?.applied_percent ? ` (${digits(quote.applied_percent)}٪)` : ''}
                </span>
                <strong className="invoice-saving">
                  −{' '}
                  {money(
                    pending
                      ? pending.payload.amount - pending.payload.expected_total
                      : quote?.discount || 0,
                  )}
                </strong>
              </div>
              <div className="list-row invoice-final-total">
                <strong>مبلغ قابل پرداخت</strong>
                <strong>{money(pending?.payload.expected_total ?? quote?.total ?? 0)}</strong>
              </div>
            </div>
          </section>
          {pending && (
            <p className="notice" role="status">
              {pending.orderId ? (
                <>
                  فاکتور ثبت شده است.{' '}
                  <Link className="text-link" href={'/orders/' + pending.orderId}>
                    مشاهده وضعیت و رسید
                  </Link>
                </>
              ) : (
                'نتیجه ثبت فاکتور مشخص نیست. برای جلوگیری از ثبت دوباره، همان درخواست را بازیابی کنید.'
              )}
            </p>
          )}
          {closed && (
            <button
              className="button secondary full"
              onClick={() => {
                setAttempt(null);
                setQuote(null);
                setStep('amount');
                setError('');
                saveDraft(amount, code, null);
              }}
            >
              شروع فاکتور جدید
            </button>
          )}
          <p className="invoice-terms">
            با پرداخت، <Link href="/terms">شرایط استفاده از ویتکو</Link> را می‌پذیری.
          </p>
          <div className="invoice-checkout-bar">
            <button
              className="button primary full"
              disabled={closed || !available || busy || (!quote && !pending)}
              onClick={() => void checkout()}
            >
              {closed
                ? 'فاکتور قبلی بسته شده است'
                : busy
                  ? 'در حال اتصال…'
                  : !available
                    ? 'درگاه پرداخت هنوز فعال نیست'
                    : !data?.user
                      ? 'ورود و ادامه پرداخت'
                      : pending
                        ? 'بازیابی و ادامه پرداخت'
                        : 'پرداخت ' + money(quote?.total || 0)}
              <ArrowLeft size={18} />
            </button>
          </div>
        </div>
      )}
      {error && (
        <div className="invoice-error">
          <ErrorBox message={error} />
        </div>
      )}
      <Modal
        open={couponOpen}
        title="کد تخفیف فاکتور"
        presentation="sheet"
        onClose={() => {
          if (!busy) setCouponOpen(false);
        }}
      >
        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            void review(codeInput.trim());
          }}
        >
          <Field label="کد تخفیف">
            <input
              value={codeInput}
              onChange={(event) => setCodeInput(event.target.value)}
              maxLength={40}
              autoComplete="off"
              disabled={busy}
            />
          </Field>
          <p className="muted">تخفیف بزرگ‌تر از میان کد و تخفیف حضوری اعمال می‌شود.</p>
          {error && <ErrorBox message={error} />}
          <button className="button primary full" disabled={busy || !codeInput.trim()}>
            {busy ? 'در حال بررسی…' : 'اعمال کد'}
            <Check size={18} />
          </button>
          {code && (
            <button
              type="button"
              disabled={busy}
              className="text-link"
              onClick={() => void review('')}
            >
              حذف کد تخفیف
            </button>
          )}
        </form>
      </Modal>
      <Modal open={helpOpen} title="وارد کردن مبلغ فاکتور" onClose={() => setHelpOpen(false)}>
        <p>
          مبلغ نهایی فاکتوری که از صندوق‌دار گرفته‌ای را به تومان وارد کن؛ قبل از تخفیف ویتکو. اگر
          مبلغ فاکتور به ریال است، آن را بر ده تقسیم کن. پیش از پرداخت، نام کافه و مبلغ را با
          صندوق‌دار بررسی کن.
        </p>
      </Modal>
    </div>
  );
}
