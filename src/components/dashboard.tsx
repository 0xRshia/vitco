'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import {
  Plus,
  Store,
  Coffee,
  ReceiptText,
  CalendarCheck,
  CalendarDays,
  TicketPercent,
  Pencil,
  ArrowUpLeft,
  Check,
  X,
  Users,
  CircleDollarSign,
  Headphones,
  LocateFixed,
  Trash2,
} from 'lucide-react';
import { api, useApp, useResource } from '@/lib/client';
import { money, digits, dateLabel, statusLabels, amenities, today } from '@/lib/format';
import type {
  Cafe,
  Product,
  Order,
  Reservation,
  Coupon,
  CafeEvent,
  Option,
  Ticket,
} from '@/lib/types';
import { PageTitle, Empty, Loading, ErrorBox, Field, Modal, Form, LoginGate, Badge } from './ui';
import { ImageUpload } from './account';
import { PersianDateInput, PersianTimeInput } from './persian-date';

type Dashboard = {
  cafes: Cafe[];
  products: Product[];
  orders: Order[];
  reservations: Reservation[];
  coupons: Coupon[];
  events: CafeEvent[];
  tickets: (Ticket & { customer_name: string; reply?: string })[];
};
export function DashboardView() {
  const { data: app, refresh, toast } = useApp(),
    query = useSearchParams();
  const resource = useResource<Dashboard>(app?.user ? 'dashboard' : null);
  const [tab, setTab] = useState(query.get('tab') || 'cafes'),
    [modal, setModal] = useState<'cafe' | 'product' | 'coupon' | 'event' | null>(null),
    [editing, setEditing] = useState<Cafe | Product | CafeEvent | null>(null),
    [order, setOrder] = useState<Order | null>(null);
  const data = resource.data;
  async function updated() {
    await refresh();
    resource.reload();
    setModal(null);
    setEditing(null);
    toast('تغییرات ذخیره شد.');
  }
  async function status(type: string, id: string, status: string) {
    try {
      await api(type + '/' + id, 'PATCH', { status });
      resource.reload();
      await refresh();
      toast('وضعیت به‌روز شد.');
    } catch (e) {
      toast((e as Error).message);
    }
  }
  const tabs = [
    { id: 'cafes', label: 'کافه‌های من', icon: Store },
    { id: 'products', label: 'مدیریت منو', icon: Coffee },
    { id: 'orders', label: 'سفارش‌ها', icon: ReceiptText },
    { id: 'reservations', label: 'رزروها', icon: CalendarCheck },
    { id: 'events', label: 'رویدادها', icon: CalendarDays },
    { id: 'coupons', label: 'کدهای تخفیف', icon: TicketPercent },
    { id: 'support', label: 'پیام‌های مشتریان', icon: Headphones },
  ];
  return (
    <>
      <PageTitle
        title="ویترین کافه شما"
        description="از اولین فنجان تا قرار بعدی؛ کسب‌وکارت را از اینجا مدیریت کن."
        action={
          app?.user && (
            <button
              className="button primary"
              onClick={() => {
                setEditing(null);
                setModal('cafe');
              }}
            >
              <Plus size={18} />
              ثبت کافه
            </button>
          )
        }
      />
      <LoginGate>
        {resource.loading ? (
          <Loading />
        ) : resource.error ? (
          <ErrorBox message={resource.error} retry={resource.reload} />
        ) : (
          data && (
            <>
              <div className="dashboard-stats">
                {[
                  { label: 'کافه‌های شما', value: digits(data.cafes.length), icon: Store },
                  {
                    label: 'سفارش‌های فعال',
                    value: digits(
                      data.orders.filter((o) => !['completed', 'cancelled'].includes(o.status))
                        .length,
                    ),
                    icon: ReceiptText,
                  },
                  {
                    label: 'رزروهای پیش رو',
                    value: digits(
                      data.reservations.filter(
                        (r) => r.date >= today() && ['pending', 'confirmed'].includes(r.status),
                      ).length,
                    ),
                    icon: CalendarCheck,
                  },
                  {
                    label: 'فروش تکمیل‌شده',
                    value: money(
                      data.orders
                        .filter((o) => o.status === 'completed')
                        .reduce((s, o) => s + o.total, 0),
                    ),
                    icon: CircleDollarSign,
                  },
                ].map((s) => (
                  <div className="panel stat-card" key={s.label}>
                    <s.icon size={22} />
                    <strong>{s.value}</strong>
                    <span>{s.label}</span>
                  </div>
                ))}
              </div>
              <div className="tabs dashboard-tabs">
                {tabs.map((t) => (
                  <button
                    className={tab === t.id ? 'active' : ''}
                    key={t.id}
                    onClick={() => setTab(t.id)}
                  >
                    <t.icon size={17} />
                    {t.label}
                  </button>
                ))}
              </div>
              {tab === 'cafes' &&
                (data.cafes.length ? (
                  <div className="stack">
                    {data.cafes.map((c) => (
                      <div className="panel management-row" key={c.id}>
                        <div>
                          <h3>{c.name}</h3>
                          <p>
                            {c.city}، {c.address}
                          </p>
                          <span className="badge">
                            {c.active ? 'پذیرش سفارش و رزرو فعال' : 'پذیرش سفارش و رزرو غیرفعال'}
                          </span>
                        </div>
                        <div className="button-row">
                          <Link className="button secondary" href={'/cafes/' + c.id}>
                            مشاهده
                            <ArrowUpLeft size={16} />
                          </Link>
                          <button
                            className="button secondary"
                            onClick={() => {
                              setEditing(c);
                              setModal('cafe');
                            }}
                          >
                            <Pencil size={16} />
                            ویرایش
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty
                    title="کافه شما، در ویترین شهر"
                    description="اطلاعات واقعی کافه‌تان را ثبت کنید، منو بسازید و پذیرای سفارش و رزرو مشتریان باشید."
                  />
                ))}
              {tab === 'products' && (
                <>
                  <div className="management-heading">
                    <h2>محصولات منو</h2>
                    <button
                      className="button primary"
                      disabled={!data.cafes.length}
                      onClick={() => {
                        setEditing(null);
                        setModal('product');
                      }}
                    >
                      <Plus size={17} />
                      محصول جدید
                    </button>
                  </div>
                  {data.products.length ? (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>محصول</th>
                            <th>دسته‌بندی</th>
                            <th>قیمت</th>
                            <th>وضعیت</th>
                            <th>مدیریت</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.products.map((p) => (
                            <tr key={p.id}>
                              <td>{p.name}</td>
                              <td>{p.category}</td>
                              <td>{money(p.price)}</td>
                              <td>{p.available ? 'موجود' : 'ناموجود'}</td>
                              <td>
                                <button
                                  className="button secondary compact"
                                  onClick={() => {
                                    setEditing(p);
                                    setModal('product');
                                  }}
                                >
                                  <Pencil size={15} />
                                  ویرایش
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <Empty
                      title="منوی شما از اینجا شروع می‌شود"
                      description="پس از ثبت کافه، محصولات، قیمت‌ها و افزودنی‌های واقعی منو را وارد کنید."
                    />
                  )}
                </>
              )}
              {tab === 'orders' &&
                (data.orders.length ? (
                  <div className="stack">
                    {data.orders.map((o) => (
                      <div key={o.id} className="panel management-order">
                        <div className="card-heading">
                          <h3>
                            {o.customer_name} · {o.cafe_name}
                          </h3>
                          <Badge status={o.status} />
                        </div>
                        <p>{o.items.map((i) => `${digits(i.quantity)} × ${i.name}`).join('، ')}</p>
                        <div className="list-row">
                          <span>
                            {o.mode === 'pickup' ? 'تحویل از کافه' : 'ارسال به آدرس'} ·{' '}
                            {dateLabel(o.created_at, true)}
                          </span>
                          <strong>{money(o.total)}</strong>
                        </div>
                        <div className="button-row">
                          <button className="button secondary compact" onClick={() => setOrder(o)}>
                            جزئیات سفارش
                          </button>
                          {o.status === 'pending' && (
                            <>
                              <button
                                className="button primary compact"
                                onClick={() => status('orders', o.id, 'preparing')}
                              >
                                تأیید و آماده‌سازی
                              </button>
                              <button
                                className="button danger-outline compact"
                                onClick={() => status('orders', o.id, 'cancelled')}
                              >
                                رد سفارش
                              </button>
                            </>
                          )}
                          {o.status === 'preparing' && (
                            <button
                              className="button primary compact"
                              onClick={() =>
                                status('orders', o.id, o.mode === 'pickup' ? 'ready' : 'delivering')
                              }
                            >
                              {o.mode === 'pickup' ? 'آماده دریافت' : 'تحویل به پیک'}
                            </button>
                          )}
                          {['ready', 'delivering'].includes(o.status) && (
                            <button
                              className="button primary compact"
                              onClick={() => status('orders', o.id, 'completed')}
                            >
                              تأیید تحویل و تکمیل
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty
                    title="هنوز سفارشی دریافت نکرده‌اید"
                    description="با فعال کردن سفارش در تنظیمات کافه و افزودن محصولات به منو، آماده پذیرش سفارش شوید."
                  />
                ))}
              {tab === 'reservations' &&
                (data.reservations.length ? (
                  <div className="stack">
                    {data.reservations.map((r) => (
                      <div className="panel" key={r.id}>
                        <div className="card-heading">
                          <h3>
                            {r.customer_name} · {r.cafe_name}
                          </h3>
                          <Badge status={r.status} />
                        </div>
                        <p>
                          {dateLabel(r.date)} · ساعت {digits(r.time)} · {digits(r.guests)} نفر
                        </p>
                        {r.note && <p className="muted">{r.note}</p>}
                        <div className="button-row">
                          {r.status === 'pending' && (
                            <button
                              className="button primary compact"
                              onClick={() => status('reservations', r.id, 'confirmed')}
                            >
                              تأیید رزرو
                            </button>
                          )}
                          {r.status === 'confirmed' && (
                            <button
                              className="button primary compact"
                              onClick={() => status('reservations', r.id, 'completed')}
                            >
                              تکمیل حضور
                            </button>
                          )}
                          {['pending', 'confirmed'].includes(r.status) && (
                            <button
                              className="button danger-outline compact"
                              onClick={() => status('reservations', r.id, 'cancelled')}
                            >
                              لغو رزرو
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty
                    title="منتظر اولین قرار هستیم"
                    description="رزروهای مشتریان پس از ثبت درخواست، برای تأیید اینجا نمایش داده می‌شوند."
                  />
                ))}
              {tab === 'coupons' && (
                <>
                  <div className="management-heading">
                    <h2>کدهای تخفیف</h2>
                    <button
                      className="button primary"
                      disabled={!data.cafes.length}
                      onClick={() => setModal('coupon')}
                    >
                      <Plus size={17} />
                      کد جدید
                    </button>
                  </div>
                  {data.coupons.length ? (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>کد</th>
                            <th>تخفیف</th>
                            <th>اعتبار</th>
                            <th>تعداد استفاده</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.coupons.map((c) => (
                            <tr key={c.id}>
                              <td>{c.code}</td>
                              <td>{digits(c.percent)}٪</td>
                              <td>{dateLabel(c.expires)}</td>
                              <td>
                                {digits(c.uses)} از {digits(c.max_uses)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <Empty
                      title="تخفیفی ثبت نشده است"
                      description="برای مشتریان کافه‌تان یک کد تخفیف با اعتبار و تعداد استفاده مشخص بسازید."
                    />
                  )}
                </>
              )}
              {tab === 'events' && (
                <>
                  <div className="management-heading">
                    <h2>رویدادهای کافه</h2>
                    <button
                      className="button primary"
                      disabled={!data.cafes.length}
                      onClick={() => {
                        setEditing(null);
                        setModal('event');
                      }}
                    >
                      <Plus size={17} />
                      رویداد جدید
                    </button>
                  </div>
                  {data.events.length ? (
                    <div className="stack">
                      {data.events.map((e) => (
                        <div className="panel management-row" key={e.id}>
                          <div>
                            <h3>{e.title}</h3>
                            <p>
                              {dateLabel(e.date)} · {digits(e.time)}
                            </p>
                            <span className="muted">
                              {digits(e.registered)} ثبت‌نام از {digits(e.capacity)} نفر
                            </span>
                          </div>
                          <button
                            className="button secondary"
                            onClick={() => {
                              setEditing(e);
                              setModal('event');
                            }}
                          >
                            <Pencil size={16} />
                            ویرایش
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Empty
                      title="یک بهانه تازه برای دیدار"
                      description="رویداد کافه را با تاریخ، ساعت و ظرفیت واقعی منتشر کنید."
                    />
                  )}
                </>
              )}
              {tab === 'support' &&
                (data.tickets.length ? (
                  <div className="stack">
                    {data.tickets.map((t) => (
                      <article className="panel" key={t.id}>
                        <h3>{t.subject}</h3>
                        <small>
                          {t.customer_name} · {dateLabel(t.created_at, true)}
                        </small>
                        <p>{t.body}</p>
                        <p className="muted">
                          برای پیگیری، سفارش مرتبط را در بخش سفارش‌ها بررسی کنید.
                        </p>
                        {t.replies.map((reply) => (
                          <div className="ticket-reply" key={reply.id}>
                            <strong>{reply.name}</strong>
                            <p>{reply.body}</p>
                            <small>{dateLabel(reply.created_at, true)}</small>
                          </div>
                        ))}
                        <Form
                          onSubmit={async (form) => {
                            await api('tickets/' + t.id + '/replies', 'POST', {
                              body: form.get('body'),
                            });
                            resource.reload();
                            toast('پاسخ در حساب مشتری ثبت شد.');
                          }}
                        >
                          <Field label="پاسخ به مشتری">
                            <textarea name="body" maxLength={3000} />
                          </Field>
                        </Form>
                      </article>
                    ))}
                  </div>
                ) : (
                  <Empty
                    title="پیام تازه‌ای دریافت نشده"
                    description="درخواست‌های پشتیبانی مربوط به سفارش‌های کافه شما اینجا نمایش داده می‌شوند."
                  />
                ))}
              <Modal
                open={modal === 'cafe'}
                title={editing ? 'ویرایش کافه' : 'کافه‌تان را معرفی کنید'}
                onClose={() => setModal(null)}
              >
                {modal === 'cafe' && (
                  <CafeEditor
                    key={editing?.id || 'new'}
                    cafe={editing as Cafe | null}
                    onDone={updated}
                  />
                )}
              </Modal>
              <Modal
                open={modal === 'product'}
                title={editing ? 'ویرایش محصول' : 'یک طعم تازه به منو'}
                onClose={() => setModal(null)}
              >
                {modal === 'product' && (
                  <ProductEditor
                    key={editing?.id || 'new'}
                    product={editing as Product | null}
                    cafes={data.cafes}
                    onDone={updated}
                  />
                )}
              </Modal>
              <Modal
                open={modal === 'event'}
                title={editing ? 'ویرایش رویداد' : 'یک قرار تازه'}
                onClose={() => setModal(null)}
              >
                {modal === 'event' && (
                  <EventEditor
                    key={editing?.id || 'new'}
                    event={editing as CafeEvent | null}
                    cafes={data.cafes}
                    onDone={updated}
                  />
                )}
              </Modal>
              <Modal open={modal === 'coupon'} title="ساخت کد تخفیف" onClose={() => setModal(null)}>
                {modal === 'coupon' && (
                  <Form
                    onSubmit={async (f) => {
                      await api('dashboard/coupons', 'POST', Object.fromEntries(f));
                      await updated();
                    }}
                  >
                    <CafeSelect cafes={data.cafes} />
                    <Field label="کد تخفیف">
                      <input name="code" minLength={3} maxLength={40} />
                    </Field>
                    <Field label="درصد تخفیف">
                      <input name="percent" type="number" min={1} max={100} />
                    </Field>
                    <Field label="تاریخ پایان اعتبار">
                      <PersianDateInput name="expires" min={today()} />
                    </Field>
                    <Field label="حداکثر تعداد استفاده">
                      <input name="max_uses" type="number" min={1} />
                    </Field>
                  </Form>
                )}
              </Modal>
              <Modal
                open={Boolean(order)}
                title="جزئیات سفارش مشتری"
                onClose={() => setOrder(null)}
              >
                {order && (
                  <div className="form">
                    <h3>{order.customer_name}</h3>
                    {order.items.map((i) => (
                      <div className="receipt-item" key={i.key}>
                        <div>
                          <strong>
                            {i.name} × {digits(i.quantity)}
                          </strong>
                          <small>
                            {i.option_names.join('، ')} · {i.note}
                          </small>
                        </div>
                        <strong>{money(i.price * i.quantity)}</strong>
                      </div>
                    ))}
                    {order.address && (
                      <div className="notice">
                        {order.address.city}، {order.address.street}
                        <br />
                        {order.address.receiver} · {digits(order.address.phone)}
                      </div>
                    )}
                    {order.pickup_at && <p>زمان دریافت: {dateLabel(order.pickup_at, true)}</p>}
                    <p>{order.note}</p>
                    <strong>مبلغ قابل دریافت: {money(order.total)}</strong>
                  </div>
                )}
              </Modal>
            </>
          )
        )}
      </LoginGate>
    </>
  );
}
function CafeSelect({ cafes, value }: { cafes: Cafe[]; value?: string }) {
  return (
    <Field label="کافه">
      <select name="cafe_id" defaultValue={value || cafes[0]?.id} disabled={Boolean(value)}>
        {cafes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {value && <input type="hidden" name="cafe_id" value={value} />}
    </Field>
  );
}
function CafeEditor({ cafe, onDone }: { cafe: Cafe | null; onDone: () => Promise<void> }) {
  const [image, setImage] = useState(cafe?.image || ''),
    [latitude, setLatitude] = useState(cafe?.latitude?.toString() || ''),
    [longitude, setLongitude] = useState(cafe?.longitude?.toString() || '');
  const { toast } = useApp();
  return (
    <Form
      onSubmit={async (form) => {
        await api('dashboard/cafes', cafe ? 'PUT' : 'POST', {
          ...Object.fromEntries(form),
          id: cafe?.id,
          image,
          latitude,
          longitude,
          amenities: form.getAll('amenities'),
          delivery: form.get('delivery') === 'on',
          pickup: form.get('pickup') === 'on',
          active: form.get('active') === 'on',
        });
        await onDone();
      }}
    >
      <ImageUpload value={image} onChange={setImage} label="کافه" />
      <Field label="نام کافه">
        <input name="name" defaultValue={cafe?.name} />
      </Field>
      <Field label="معرفی کافه">
        <textarea name="description" defaultValue={cafe?.description} maxLength={2000} />
      </Field>
      <div className="form-grid">
        <Field label="شهر">
          <input name="city" defaultValue={cafe?.city} />
        </Field>
        <Field label="شماره همراه کافه">
          <input name="phone" defaultValue={cafe?.phone} inputMode="tel" />
        </Field>
      </div>
      <Field label="نشانی کامل">
        <textarea name="address" defaultValue={cafe?.address} />
      </Field>
      <div className="form-grid">
        <Field label="عرض جغرافیایی (اختیاری)">
          <input
            value={latitude}
            onChange={(e) => setLatitude(e.target.value)}
            inputMode="decimal"
          />
        </Field>
        <Field label="طول جغرافیایی (اختیاری)">
          <input
            value={longitude}
            onChange={(e) => setLongitude(e.target.value)}
            inputMode="decimal"
          />
        </Field>
      </div>
      <button
        type="button"
        className="text-link"
        onClick={() =>
          navigator.geolocation?.getCurrentPosition(
            (p) => {
              setLatitude(String(p.coords.latitude));
              setLongitude(String(p.coords.longitude));
            },
            () => toast('دسترسی به موقعیت ممکن نشد.'),
          )
        }
      >
        <LocateFixed size={17} />
        استفاده از موقعیت فعلی کافه
      </button>
      <div className="form-grid">
        <Field label="ساعت شروع">
          <PersianTimeInput name="opens" defaultValue={cafe?.opens || '08:00'} />
        </Field>
        <Field label="ساعت پایان">
          <PersianTimeInput name="closes" defaultValue={cafe?.closes || '22:00'} />
        </Field>
      </div>
      <Field label="ظرفیت هر بازه یک‌ساعته" hint="تعداد نفرات قابل پذیرش را وارد کنید.">
        <input
          name="capacity"
          type="number"
          min={1}
          max={500}
          defaultValue={cafe?.capacity || 20}
        />
      </Field>
      <fieldset className="option-group">
        <legend>امکانات کافه</legend>
        <div className="amenities-checkboxes">
          {Object.entries(amenities).map(([id, label]) => (
            <label className="check-row" key={id}>
              <input
                type="checkbox"
                name="amenities"
                value={id}
                defaultChecked={cafe?.amenities.includes(id)}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="stack">
        <label className="check-row">
          <input type="checkbox" name="pickup" defaultChecked={cafe?.pickup ?? true} />
          تحویل سفارش از کافه
        </label>
        <label className="check-row">
          <input type="checkbox" name="delivery" defaultChecked={cafe?.delivery} />
          ارسال در محدوده شهر کافه
        </label>
        <Field label="هزینه ارسال (تومان)">
          <input name="delivery_fee" type="number" min={0} defaultValue={cafe?.delivery_fee || 0} />
        </Field>
        <label className="check-row">
          <input type="checkbox" name="active" defaultChecked={cafe?.active ?? true} />
          پذیرش سفارش و رزرو فعال باشد
        </label>
      </div>
    </Form>
  );
}
function OptionEditor({
  title,
  options,
  setOptions,
}: {
  title: string;
  options: Option[];
  setOptions: (o: Option[]) => void;
}) {
  return (
    <fieldset className="option-group">
      <legend>{title}</legend>
      {options.map((o, i) => (
        <div className="option-editor-row" key={o.id}>
          <input
            aria-label={title + '، نام گزینه'}
            placeholder="نام گزینه"
            value={o.name}
            onChange={(e) =>
              setOptions(options.map((v, n) => (n === i ? { ...v, name: e.target.value } : v)))
            }
          />
          <input
            aria-label={title + '، قیمت اضافه'}
            type="number"
            min={0}
            placeholder="قیمت اضافه"
            value={o.price}
            onChange={(e) =>
              setOptions(
                options.map((v, n) => (n === i ? { ...v, price: Number(e.target.value) } : v)),
              )
            }
          />
          <button
            type="button"
            className="icon-button"
            aria-label="حذف گزینه"
            onClick={() => setOptions(options.filter((_, n) => n !== i))}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="text-link"
        disabled={options.length >= 10}
        onClick={() => setOptions([...options, { id: crypto.randomUUID(), name: '', price: 0 }])}
      >
        <Plus size={16} />
        افزودن گزینه
      </button>
    </fieldset>
  );
}
function ProductEditor({
  product,
  cafes,
  onDone,
}: {
  product: Product | null;
  cafes: Cafe[];
  onDone: () => Promise<void>;
}) {
  const [image, setImage] = useState(product?.image || ''),
    [sizes, setSizes] = useState<Option[]>(product?.sizes || []),
    [addons, setAddons] = useState<Option[]>(product?.addons || []);
  return (
    <Form
      onSubmit={async (form) => {
        await api('dashboard/products', product ? 'PUT' : 'POST', {
          ...Object.fromEntries(form),
          id: product?.id,
          image,
          sizes,
          addons,
          available: form.get('available') === 'on',
        });
        await onDone();
      }}
    >
      <CafeSelect cafes={cafes} value={product?.cafe_id} />
      <ImageUpload value={image} onChange={setImage} label="محصول" />
      <Field label="نام محصول">
        <input name="name" defaultValue={product?.name} />
      </Field>
      <Field label="توضیحات">
        <textarea name="description" defaultValue={product?.description} />
      </Field>
      <div className="form-grid">
        <Field label="دسته‌بندی">
          <input name="category" defaultValue={product?.category} placeholder="مثلاً نوشیدنی گرم" />
        </Field>
        <Field label="قیمت پایه (تومان)">
          <input name="price" type="number" min={0} defaultValue={product?.price} />
        </Field>
      </div>
      <OptionEditor title="اندازه‌ها و قیمت اضافه" options={sizes} setOptions={setSizes} />
      <OptionEditor title="افزودنی‌ها" options={addons} setOptions={setAddons} />
      <Field label="حداکثر افزودنی قابل انتخاب">
        <input
          name="max_addons"
          type="number"
          min={0}
          max={10}
          defaultValue={product?.max_addons ?? 2}
        />
      </Field>
      <label className="check-row">
        <input type="checkbox" name="available" defaultChecked={product?.available ?? true} />
        محصول موجود است
      </label>
    </Form>
  );
}
function EventEditor({
  event,
  cafes,
  onDone,
}: {
  event: CafeEvent | null;
  cafes: Cafe[];
  onDone: () => Promise<void>;
}) {
  const [image, setImage] = useState(event?.image || '');
  return (
    <Form
      onSubmit={async (form) => {
        await api('dashboard/events', event ? 'PUT' : 'POST', {
          ...Object.fromEntries(form),
          id: event?.id,
          image,
        });
        await onDone();
      }}
    >
      <CafeSelect cafes={cafes} value={event?.cafe_id} />
      <ImageUpload value={image} onChange={setImage} label="رویداد" />
      <Field label="عنوان رویداد">
        <input name="title" defaultValue={event?.title} />
      </Field>
      <Field label="توضیحات رویداد">
        <textarea name="description" defaultValue={event?.description} />
      </Field>
      <div className="form-grid">
        <Field label="تاریخ">
          <PersianDateInput name="date" min={today()} defaultValue={event?.date} />
        </Field>
        <Field label="ساعت">
          <PersianTimeInput name="time" defaultValue={event?.time} />
        </Field>
      </div>
      <Field label="ظرفیت مهمان‌ها">
        <input name="capacity" type="number" min={1} max={500} defaultValue={event?.capacity} />
      </Field>
    </Form>
  );
}
