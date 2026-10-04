'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Check,
  CalendarDays,
  ChevronLeft,
  Clock3,
  MapPin,
  ShoppingBag,
  Bike,
  Store,
  Trash2,
  Plus,
  TicketPercent,
  Gift,
  CreditCard,
  ReceiptText,
  Headphones,
  PackageCheck,
  ChefHat,
  CircleCheck,
  X,
  Users,
  CalendarCheck,
  Printer,
  RotateCcw,
} from 'lucide-react';
import { api, useApp, useResource } from '@/lib/client';
import { PersianDateInput, PersianTimeInput } from './persian-date';
import { money, digits, dateLabel, daysAhead, today, statusLabels } from '@/lib/format';
import type { Address, Order, Reservation } from '@/lib/types';
import {
  PageTitle,
  SectionTitle,
  Empty,
  Loading,
  ErrorBox,
  Media,
  Quantity,
  Field,
  Submit,
  LoginGate,
  Badge,
  Modal,
  Confirm,
} from './ui';

type Quote = {
  subtotal: number;
  discount: number;
  delivery_fee: number;
  points_used: number;
  total: number;
};
export function CartView() {
  const { data, cart, setCart, mode, setMode, refresh, toast } = useApp(),
    router = useRouter();
  const addresses = useResource<{ addresses: Address[] }>(data?.user ? 'addresses' : null);
  const [address, setAddress] = useState(''),
    [couponInput, setCouponInput] = useState(''),
    [coupon, setCoupon] = useState(''),
    [usePoints, setUsePoints] = useState(false),
    [note, setNote] = useState(''),
    [pickup, setPickup] = useState(''),
    [pickupTime, setPickupTime] = useState('09:00'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [quote, setQuote] = useState<Quote | null>(null),
    [quoting, setQuoting] = useState(false),
    [clear, setClear] = useState(false);
  const requestKey = useRef({ signature: '', key: '' });
  const cafe = data?.cafes.find((c) => c.id === cart[0]?.cafe_id);
  const estimated = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const cafePoints = data?.rewards.find((r) => r.cafe_id === cafe?.id)?.points || 0;
  const points = usePoints ? Math.min(cafePoints, Math.floor(estimated / 1000)) : 0;
  const quotePayload = JSON.stringify({ items: cart, mode, coupon, points });
  useEffect(() => {
    if (!data?.user || !cart.length) return;
    let active = true;
    setQuoting(true);
    setQuote(null);
    setError('');
    api<Quote>('quote', 'POST', JSON.parse(quotePayload))
      .then((q) => {
        if (active) setQuote(q);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setQuoting(false);
      });
    return () => {
      active = false;
    };
  }, [quotePayload, data?.user?.id]);
  useEffect(() => {
    if (!address && addresses.data?.addresses.length)
      setAddress(
        (addresses.data.addresses.find((a) => a.is_default) || addresses.data.addresses[0]).id,
      );
  }, [addresses.data, address]);
  async function checkout() {
    setBusy(true);
    setError('');
    try {
      const payload = {
        ...JSON.parse(quotePayload),
        address_id: address,
        note,
        pickup_at: pickup ? pickup + 'T' + pickupTime + ':00+03:30' : '',
      };
      const signature = JSON.stringify(payload);
      if (requestKey.current.signature !== signature)
        requestKey.current = { signature, key: crypto.randomUUID() };
      const result = await api<{ id: string }>('orders', 'POST', {
        ...payload,
        request_key: requestKey.current.key,
      });
      setCart([]);
      await refresh();
      router.push('/orders/' + result.id + '?success=1');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!cart.length)
    return (
      <>
        <PageTitle title="سبد خرید" />
        <Empty
          title="سبدت منتظر یک طعم تازه است"
          description="از منوی کافه‌ها انتخاب کن و اولین محصول را به سبد اضافه کن."
          href="/menu"
          label="دیدن منوی کافه‌ها"
        />
      </>
    );
  return (
    <>
      <PageTitle
        title="سبد خرید شما"
        description={cafe?.name}
        back="/menu"
        action={
          <button className="button secondary" onClick={() => setClear(true)}>
            <Trash2 size={17} />
            خالی کردن سبد
          </button>
        }
      />
      <div className="checkout-layout">
        <div className="stack">
          <div className="segmented">
            <button
              className={mode === 'delivery' ? 'active' : ''}
              onClick={() => setMode('delivery')}
            >
              <Bike size={18} />
              ارسال به آدرس
            </button>
            <button className={mode === 'pickup' ? 'active' : ''} onClick={() => setMode('pickup')}>
              <Store size={18} />
              تحویل از کافه
            </button>
          </div>
          <section>
            <SectionTitle title="انتخاب‌های خوش‌طعم تو" href="/menu" label="افزودن محصول" />
            <div className="stack">
              {cart.map((item) => (
                <article className="cart-item panel" key={item.key}>
                  <Media src={item.image} alt={item.name} />
                  <div className="cart-item-content">
                    <Link href={'/products/' + item.product_id}>
                      <h3>{item.name}</h3>
                    </Link>
                    <p>{item.option_names.join('، ')}</p>
                    {item.note && <small>{item.note}</small>}
                    <div className="cart-item-controls">
                      <Quantity
                        value={item.quantity}
                        onChange={(quantity) =>
                          setCart(cart.map((i) => (i.key === item.key ? { ...i, quantity } : i)))
                        }
                      />
                      <strong>{money(item.price * item.quantity)}</strong>
                    </div>
                  </div>
                  <button
                    className="icon-button"
                    aria-label={'حذف ' + item.name}
                    onClick={() => setCart(cart.filter((i) => i.key !== item.key))}
                  >
                    <Trash2 size={17} />
                  </button>
                </article>
              ))}
            </div>
          </section>
          <section className="panel form">
            <h2>{mode === 'delivery' ? 'تحویل به کدام آدرس؟' : 'دریافت از کافه'}</h2>
            {mode === 'delivery' ? (
              <>
                {addresses.loading ? (
                  <Loading />
                ) : addresses.error ? (
                  <ErrorBox message={addresses.error} />
                ) : addresses.data?.addresses.length ? (
                  <select
                    aria-label="آدرس تحویل"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  >
                    {addresses.data.addresses.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title} · {a.city}، {a.street}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="muted">برای دریافت سفارش، یک آدرس ثبت کنید.</p>
                )}
                <Link className="text-link" href="/addresses">
                  <Plus size={16} />
                  مدیریت آدرس‌ها
                </Link>
              </>
            ) : (
              <>
                <p className="icon-text">
                  <MapPin size={18} />
                  {cafe?.city}، {cafe?.address}
                </p>
                <Field
                  label="زمان دریافت (اختیاری)"
                  hint="خالی بگذارید تا سفارش برای اولین زمان ممکن آماده شود."
                >
                  <div className="form-grid">
                    <PersianDateInput value={pickup} onChange={setPickup} min={today()} />
                    <PersianTimeInput value={pickupTime} onChange={setPickupTime} />
                  </div>
                </Field>
              </>
            )}
            <Field label="یادداشت برای کافه (اختیاری)">
              <textarea
                maxLength={500}
                placeholder="نکته‌ای برای آماده‌سازی یا تحویل داری؟"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
          </section>
        </div>
        <aside className="order-summary panel">
          <h2>خلاصه سفارش</h2>
          <div className="list-row">
            <span>قیمت محصولات</span>
            <strong>{quote ? money(quote.subtotal) : 'در حال محاسبه…'}</strong>
          </div>
          <div className="list-row">
            <span>هزینه ارسال</span>
            <strong>{quote ? money(quote.delivery_fee) : '—'}</strong>
          </div>
          {Boolean(quote?.discount) && (
            <div className="list-row green">
              <span>تخفیف</span>
              <strong>− {money(quote!.discount)}</strong>
            </div>
          )}
          {Boolean(quote?.points_used) && (
            <div className="list-row green">
              <span>تخفیف امتیازها</span>
              <strong>− {money(quote!.points_used * 1000)}</strong>
            </div>
          )}
          <div className="coupon-form">
            <label htmlFor="coupon">
              <TicketPercent size={17} />
              کد تخفیف داری؟
            </label>
            <div>
              <input
                id="coupon"
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value)}
                placeholder="کد تخفیف"
              />
              <button onClick={() => setCoupon(couponInput.trim())}>اعمال</button>
            </div>
            {coupon && (
              <button
                className="text-link"
                onClick={() => {
                  setCoupon('');
                  setCouponInput('');
                }}
              >
                حذف کد تخفیف
                <X size={14} />
              </button>
            )}
          </div>
          {data?.user && (
            <label className="check-row points-row">
              <input
                type="checkbox"
                checked={usePoints}
                onChange={(e) => setUsePoints(e.target.checked)}
                disabled={!cafePoints}
              />
              <span>
                استفاده از {digits(cafePoints)} امتیاز
                <small>امتیاز همین کافه؛ هر امتیاز هزار تومان</small>
              </span>
              <Gift size={20} />
            </label>
          )}
          <div className="summary-total">
            <span>مبلغ قابل پرداخت</span>
            <strong>{quoting ? 'در حال محاسبه…' : quote ? money(quote.total) : '—'}</strong>
          </div>
          <div className="payment-info">
            <CreditCard size={20} />
            <div>
              <strong>پرداخت هنگام دریافت</strong>
              <small>مستقیماً به کافه پرداخت می‌کنید.</small>
            </div>
          </div>
          {error && <ErrorBox message={error} />}
          <button
            className="button primary full"
            disabled={
              busy ||
              (Boolean(data?.user) && (!quote || quoting || (mode === 'delivery' && !address)))
            }
            onClick={() => (data?.user ? void checkout() : router.push('/login'))}
          >
            {busy ? 'در حال ثبت سفارش…' : data?.user ? 'ثبت سفارش' : 'ورود و ادامه سفارش'}
            <ArrowLeft size={18} />
          </button>
          <p className="checkout-terms">
            با ثبت سفارش، <Link href="/terms">شرایط استفاده</Link> را می‌پذیرید.
          </p>
        </aside>
      </div>
      <Confirm
        open={clear}
        title="سبد خرید خالی شود؟"
        description="همه محصولات از سبد حذف می‌شوند."
        onClose={() => setClear(false)}
        onConfirm={() => {
          setCart([]);
          setClear(false);
        }}
      />
    </>
  );
}
export function OrdersView({ id }: { id?: string }) {
  const { data: app, setCart, toast, refresh } = useApp(),
    query = useSearchParams(),
    router = useRouter();
  const resource = useResource<{ orders?: Order[]; order?: Order }>(
    app?.user ? 'orders' + (id ? '/' + id : '') : null,
  );
  const [tab, setTab] = useState('active'),
    [mode, setMode] = useState('all'),
    [cancel, setCancel] = useState(false),
    [reorder, setReorder] = useState<Order | null>(null),
    [busy, setBusy] = useState(false);
  const orders = (resource.data?.orders || []).filter(
    (o) =>
      (tab === 'active'
        ? !['completed', 'cancelled'].includes(o.status)
        : ['completed', 'cancelled'].includes(o.status)) &&
      (mode === 'all' || o.mode === mode),
  );
  const order = resource.data?.order;
  const steps =
    order?.mode === 'delivery'
      ? ['pending', 'preparing', 'delivering', 'completed']
      : ['pending', 'preparing', 'ready', 'completed'];
  return (
    <>
      <PageTitle
        title={id ? 'جزئیات سفارش' : 'سفارش‌های من'}
        description={
          id ? 'از ثبت تا تحویل، همراه سفارش شما.' : 'طعم‌های قبلی و سفارش‌هایی که در راه‌اند.'
        }
        back={id ? '/orders' : undefined}
      />
      <LoginGate>
        {resource.loading ? (
          <Loading />
        ) : resource.error ? (
          <ErrorBox message={resource.error} retry={resource.reload} />
        ) : order ? (
          <>
            {query.get('success') === '1' && (
              <div className="order-success">
                <span>
                  <Check size={28} />
                </span>
                <div>
                  <h2>سفارش شما ثبت شد!</h2>
                  <p>درخواست برای کافه ارسال شد. پس از تأیید کافه، وضعیت آن اینجا به‌روز می‌شود.</p>
                </div>
              </div>
            )}
            <div className="checkout-layout">
              <div className="stack">
                <section className="panel">
                  <div className="card-heading">
                    <h2>{order.cafe_name}</h2>
                    <Badge status={order.status} />
                  </div>
                  <p className="muted">{dateLabel(order.created_at, true)}</p>
                  {order.status !== 'cancelled' && (
                    <div className="order-timeline">
                      {steps.map((s, i) => (
                        <div key={s} className={steps.indexOf(order.status) >= i ? 'done' : ''}>
                          <span>
                            {i === 0 ? (
                              <ReceiptText size={20} />
                            ) : i === 1 ? (
                              <ChefHat size={20} />
                            ) : i === 2 ? (
                              <PackageCheck size={20} />
                            ) : (
                              <CircleCheck size={20} />
                            )}
                          </span>
                          <strong>{statusLabels[s]}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                  <button className="text-link" onClick={resource.reload}>
                    <RotateCcw size={15} />
                    به‌روزرسانی وضعیت
                  </button>
                </section>
                <section className="panel">
                  <h2>اقلام سفارش</h2>
                  {order.items.map((i) => (
                    <div key={i.key} className="receipt-item">
                      <div>
                        <strong>{i.name}</strong>
                        <small>
                          {i.option_names.join('، ')}
                          {i.note ? ' · ' + i.note : ''}
                        </small>
                      </div>
                      <span>{digits(i.quantity)} عدد</span>
                      <strong>{money(i.quantity * i.price)}</strong>
                    </div>
                  ))}
                </section>
                <section className="panel">
                  <h2>{order.mode === 'delivery' ? 'نشانی تحویل' : 'دریافت از کافه'}</h2>
                  <p>
                    {order.address
                      ? `${order.address.city}، ${order.address.street}`
                      : order.cafe_name}
                  </p>
                  {order.address && (
                    <p>
                      {order.address.receiver} · {digits(order.address.phone)}
                    </p>
                  )}
                  {order.pickup_at && <p>زمان دریافت: {dateLabel(order.pickup_at, true)}</p>}
                  {order.note && <p>یادداشت: {order.note}</p>}
                </section>
              </div>
              <aside className="order-summary panel">
                <h2>رسید سفارش</h2>
                <div className="list-row">
                  <span>محصولات</span>
                  <strong>{money(order.subtotal)}</strong>
                </div>
                <div className="list-row">
                  <span>ارسال</span>
                  <strong>{money(order.delivery_fee)}</strong>
                </div>
                <div className="list-row">
                  <span>تخفیف و امتیاز</span>
                  <strong>{money(order.discount + order.points_used * 1000)}</strong>
                </div>
                <div className="summary-total">
                  <span>مبلغ نهایی</span>
                  <strong>{money(order.total)}</strong>
                </div>
                <p className="muted">روش پرداخت: هنگام دریافت</p>
                <div className="stack">
                  <Link href={'/support?order=' + order.id} className="button secondary">
                    <Headphones size={18} />
                    پشتیبانی سفارش
                  </Link>
                  <button className="button secondary" onClick={() => window.print()}>
                    <Printer size={18} />
                    چاپ رسید
                  </button>
                  {order.status === 'pending' && (
                    <button className="button danger-outline" onClick={() => setCancel(true)}>
                      لغو سفارش
                    </button>
                  )}
                  {['completed', 'cancelled'].includes(order.status) && (
                    <button className="button primary" onClick={() => setReorder(order)}>
                      <RotateCcw size={17} />
                      سفارش دوباره
                    </button>
                  )}
                </div>
              </aside>
            </div>
            <Confirm
              open={cancel}
              title="سفارش لغو شود؟"
              description="پس از لغو، امتیازهای استفاده‌شده به حساب شما برمی‌گردد."
              onClose={() => setCancel(false)}
              onConfirm={async () => {
                if (busy) return;
                setBusy(true);
                try {
                  await api('orders/' + order.id, 'PATCH', { status: 'cancelled' });
                  setCancel(false);
                  resource.reload();
                  await refresh();
                  toast('سفارش لغو شد.');
                } catch (e) {
                  toast((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            />
          </>
        ) : (
          <>
            <div className="order-filters">
              <div className="tabs">
                <button
                  className={tab === 'active' ? 'active' : ''}
                  onClick={() => setTab('active')}
                >
                  سفارش‌های جاری
                </button>
                <button
                  className={tab === 'history' ? 'active' : ''}
                  onClick={() => setTab('history')}
                >
                  تاریخچه سفارش‌ها
                </button>
              </div>
              <select value={mode} aria-label="نوع سفارش" onChange={(e) => setMode(e.target.value)}>
                <option value="all">همه سفارش‌ها</option>
                <option value="delivery">ارسال به آدرس</option>
                <option value="pickup">تحویل از کافه</option>
              </select>
            </div>
            {orders.length ? (
              <div className="stack">
                {orders.map((o) => (
                  <Link className="order-card panel" key={o.id} href={'/orders/' + o.id}>
                    <span className="action-icon peach">
                      {o.mode === 'pickup' ? <Store size={25} /> : <Bike size={25} />}
                    </span>
                    <div>
                      <h3>{o.cafe_name}</h3>
                      <p>{o.items.map((i) => i.name).join('، ')}</p>
                      <small>{dateLabel(o.created_at, true)}</small>
                    </div>
                    <div className="order-card-end">
                      <Badge status={o.status} />
                      <strong>{money(o.total)}</strong>
                    </div>
                    <ChevronLeft size={18} />
                  </Link>
                ))}
              </div>
            ) : (
              <Empty
                title={
                  tab === 'active' ? 'هنوز سفارشی در راه نیست' : 'تاریخچه سفارشت اینجا شکل می‌گیرد'
                }
                description="به منوی کافه‌ها سر بزن و طعم مورد علاقه‌ات را انتخاب کن."
                href="/menu"
                label="انتخاب از منو"
              />
            )}
          </>
        )}
      </LoginGate>
      <Confirm
        open={Boolean(reorder)}
        title="این سفارش را دوباره می‌خواهی؟"
        description="اقلام این سفارش جایگزین سبد فعلی می‌شوند. قیمت و موجودی هنگام ثبت دوباره بررسی می‌شوند."
        onClose={() => setReorder(null)}
        onConfirm={() => {
          if (reorder) {
            setCart(reorder.items.map((i) => ({ ...i, key: crypto.randomUUID() })));
            router.push('/cart');
          }
        }}
      />
    </>
  );
}
export function ReserveView() {
  const { data, toast, refresh } = useApp(),
    query = useSearchParams();
  const [cafeId, setCafeId] = useState(
      query.get('cafe') || data?.cafes.find((c) => c.owner_id && c.active)?.id || '',
    ),
    [date, setDate] = useState(today()),
    [time, setTime] = useState(''),
    [guests, setGuests] = useState(2),
    [note, setNote] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState(false),
    [calendar, setCalendar] = useState(false);
  const key = useRef({ signature: '', key: '' });
  const cafe = data?.cafes.find((c) => c.id === cafeId);
  const slots = useResource<{ slots: { time: string; remaining: number }[] }>(
    cafeId ? 'slots/' + cafeId + '?date=' + date : null,
  );
  useEffect(() => setTime(''), [date, cafeId]);
  const days = daysAhead(calendar ? 30 : 7);
  async function submit() {
    setError('');
    setBusy(true);
    try {
      const payload = { cafe_id: cafeId, date, time, guests, note };
      const signature = JSON.stringify(payload);
      if (key.current.signature !== signature)
        key.current = { signature, key: crypto.randomUUID() };
      await api('reservations', 'POST', { ...payload, request_key: key.current.key });
      setSuccess(true);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle
        title="یک میز برای لحظه‌های خوب"
        description="کافه، روز و ساعت را انتخاب کن؛ ادامه‌اش با ما."
        back="/cafes"
      />
      <div className="reservation-layout">
        <section className="panel reservation-form">
          <h2>
            <Store size={20} />
            کجا قرار بگذاریم؟
          </h2>
          <Field label="کافه">
            <select value={cafeId} onChange={(e) => setCafeId(e.target.value)}>
              <option value="">کافه را انتخاب کنید</option>
              {data?.cafes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {!c.owner_id || !c.active ? ' · رزرو غیرفعال' : ''}
                </option>
              ))}
            </select>
          </Field>
          {cafe && (
            <p className="icon-text muted">
              <MapPin size={17} />
              {cafe.city}، {cafe.address}
            </p>
          )}
          <div className="section-title">
            <h2>
              <CalendarDays size={20} />
              کِی همدیگر را ببینیم؟
            </h2>
            <button className="text-link" onClick={() => setCalendar(!calendar)}>
              {calendar ? 'نمای هفته' : 'تقویم کامل'}
            </button>
          </div>
          <div className={'date-picker ' + (calendar ? 'expanded' : '')}>
            {days.map((d) => {
              const parsed = new Date(d + 'T12:00:00+03:30');
              return (
                <button key={d} className={date === d ? 'selected' : ''} onClick={() => setDate(d)}>
                  <small>
                    {new Intl.DateTimeFormat('fa-IR', { weekday: 'short' }).format(parsed)}
                  </small>
                  <strong>
                    {new Intl.DateTimeFormat('fa-IR', { day: 'numeric' }).format(parsed)}
                  </strong>
                  <small>
                    {new Intl.DateTimeFormat('fa-IR', { month: 'short' }).format(parsed)}
                  </small>
                </button>
              );
            })}
          </div>
          <h2>
            <Clock3 size={20} />
            ساعت قرار
          </h2>
          {slots.loading ? (
            <Loading />
          ) : slots.error ? (
            <ErrorBox message={slots.error} />
          ) : slots.data?.slots.length ? (
            <div className="time-picker">
              {slots.data.slots.map((s) => (
                <button
                  key={s.time}
                  className={time === s.time ? 'selected' : ''}
                  disabled={s.remaining < guests}
                  onClick={() => setTime(s.time)}
                >
                  {digits(s.time)}
                  <small>{s.remaining >= guests ? 'قابل رزرو' : 'ظرفیت ناکافی'}</small>
                </button>
              ))}
            </div>
          ) : (
            <div className="notice">
              {!cafeId
                ? 'ابتدا کافه را انتخاب کنید.'
                : !cafe?.owner_id
                  ? 'رزرو آنلاین این کافه در این سامانه فعال نیست.'
                  : 'ساعت آزادی برای این روز وجود ندارد. روز دیگری انتخاب کنید.'}
            </div>
          )}
          <h2>
            <Users size={20} />
            چند نفر هستید؟
          </h2>
          <div className="guest-picker">
            <Quantity
              value={guests}
              max={20}
              onChange={(n) => {
                setGuests(n);
                if ((slots.data?.slots.find((s) => s.time === time)?.remaining || 0) < n)
                  setTime('');
              }}
            />
            <span>{digits(guests)} نفر</span>
          </div>
          <Field label="درخواست ویژه (اختیاری)">
            <textarea
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="مثلاً میزی در فضای باز یا مناسبت ویژه…"
            />
          </Field>
        </section>
        <aside className="booking-summary">
          <div className="booking-art">
            <img src="/images/hero.webp" alt="قهوه و شیرینی برای یک قرار خوب" />
          </div>
          <div className="panel">
            <span className="eyebrow">خلاصه قرار شما</span>
            <h2>{cafe?.name || 'یک قرار تازه'}</h2>
            <div className="list-row">
              <span>روز</span>
              <strong>{dateLabel(date)}</strong>
            </div>
            <div className="list-row">
              <span>ساعت</span>
              <strong>{time ? digits(time) : 'انتخاب نشده'}</strong>
            </div>
            <div className="list-row">
              <span>تعداد مهمان</span>
              <strong>{digits(guests)} نفر</strong>
            </div>
            <p className="muted">
              مدت هر رزرو یک ساعت است. درخواست شما پس از ثبت، برای تأیید به کافه ارسال می‌شود.
            </p>
            {error && <ErrorBox message={error} />}
            <button
              className="button primary full"
              disabled={busy || !time || !cafe?.owner_id}
              onClick={() => {
                if (!data?.user) {
                  window.location.href = '/login';
                  return;
                }
                void submit();
              }}
            >
              {busy ? 'در حال ثبت…' : data?.user ? 'ثبت درخواست رزرو' : 'ورود و ادامه رزرو'}
              <ArrowLeft size={18} />
            </button>
          </div>
        </aside>
      </div>
      <Modal open={success} title="درخواست رزرو ثبت شد" onClose={() => setSuccess(false)}>
        <div className="booking-success">
          <span className="empty-icon">
            <CalendarCheck size={40} />
          </span>
          <h3>یک قدم تا قرار بعدی</h3>
          <p>کافه باید درخواست شما را تأیید کند. وضعیت را در بخش رزروهای من ببینید.</p>
          <Link className="button primary" href="/reservations">
            مشاهده رزروهای من
            <ArrowLeft size={17} />
          </Link>
        </div>
      </Modal>
    </>
  );
}
export function ReservationsView() {
  const { data: app, toast } = useApp();
  const resource = useResource<{ reservations: Reservation[] }>(app?.user ? 'reservations' : null);
  const [tab, setTab] = useState('active'),
    [cancel, setCancel] = useState<Reservation | null>(null);
  const reservations =
    resource.data?.reservations.filter((r) =>
      tab === 'active'
        ? ['pending', 'confirmed'].includes(r.status) && r.date >= today()
        : !['pending', 'confirmed'].includes(r.status) || r.date < today(),
    ) || [];
  return (
    <>
      <PageTitle
        title="قرارهای من"
        description="برای وقت‌هایی که از قبل برای خودت کنار گذاشته‌ای."
        action={
          <Link className="button primary" href="/reserve">
            <Plus size={18} />
            رزرو میز تازه
          </Link>
        }
      />
      <LoginGate>
        <div className="tabs">
          <button className={tab === 'active' ? 'active' : ''} onClick={() => setTab('active')}>
            قرارهای پیش رو
          </button>
          <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
            قرارهای گذشته
          </button>
        </div>
        {resource.loading ? (
          <Loading />
        ) : resource.error ? (
          <ErrorBox message={resource.error} />
        ) : reservations.length ? (
          <div className="reservation-grid">
            {reservations.map((r) => (
              <article className="reservation-card panel" key={r.id}>
                <div className="card-heading">
                  <span className="action-icon peach">
                    <CalendarCheck size={24} />
                  </span>
                  <Badge status={r.status} />
                </div>
                <Link href={'/cafes/' + r.cafe_id}>
                  <h2>{r.cafe_name}</h2>
                </Link>
                <div className="reservation-details">
                  <p>
                    <CalendarDays size={17} />
                    {dateLabel(r.date)}
                  </p>
                  <p>
                    <Clock3 size={17} />
                    {digits(r.time)}
                  </p>
                  <p>
                    <Users size={17} />
                    {digits(r.guests)} نفر
                  </p>
                </div>
                {r.note && <p className="muted">{r.note}</p>}
                <div className="card-bottom">
                  <Link href={'/cafes/' + r.cafe_id} className="text-link">
                    مشاهده کافه
                    <ChevronLeft size={16} />
                  </Link>
                  {['pending', 'confirmed'].includes(r.status) && (
                    <button className="text-link danger-text" onClick={() => setCancel(r)}>
                      لغو رزرو
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            title={tab === 'active' ? 'جای یک قرار خوب خالی است' : 'هنوز خاطره‌ای اینجا ثبت نشده'}
            description="یک کافه انتخاب کن و برای قرار بعدی میز رزرو کن."
            href="/reserve"
            label="رزرو میز"
          />
        )}
      </LoginGate>
      <Confirm
        open={Boolean(cancel)}
        title="این قرار لغو شود؟"
        description="با لغو رزرو، ظرفیت برای دیگر مهمان‌ها آزاد می‌شود."
        onClose={() => setCancel(null)}
        onConfirm={async () => {
          try {
            await api('reservations/' + cancel?.id, 'PATCH', { status: 'cancelled' });
            setCancel(null);
            resource.reload();
            toast('رزرو لغو شد.');
          } catch (e) {
            toast((e as Error).message);
          }
        }}
      />
    </>
  );
}
