'use client';
import { EventRoster } from './event-registrations';
import { LocationPicker } from './location-map';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState, type Dispatch, type SetStateAction } from 'react';
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
import {
  PageTitle,
  Empty,
  Loading,
  ErrorBox,
  Field,
  Modal,
  Form,
  LoginGate,
  Badge,
  Confirm,
} from './ui';
import { ImageUpload } from './account';
import { PersianDateInput, PersianTimeInput } from './persian-date';
import { paymentIsPending, paymentStatusLabels } from './payment-status';
import { OwnerInsights, CategoryPricing } from './owner-insights';
import { menuCategories, productCategory } from '@/lib/catalog';
import type { CafeFeatures } from '@/lib/cafe-features';

type Dashboard = {
  cafes: Cafe[];
  cafe_features: Record<string, CafeFeatures>;
  products: Product[];
  orders: Order[];
  reservations: Reservation[];
  coupons: Coupon[];
  events: CafeEvent[];
  tickets: (Ticket & { customer_name: string; reply?: string })[];
};
type GalleryImage = { id: string; url: string };
const loadGallery = (urls: string[] = []): GalleryImage[] =>
  urls.map((url, index) => ({ id: String(index), url }));
export function DashboardView() {
  const { data: app, refresh, toast } = useApp(),
    query = useSearchParams();
  const resource = useResource<Dashboard>(app?.user ? 'dashboard' : null);
  const [tab, setTab] = useState(query.get('tab') || 'cafes'),
    [modal, setModal] = useState<'cafe' | 'product' | 'coupon' | 'event' | null>(null),
    [editing, setEditing] = useState<Cafe | Product | CafeEvent | null>(null),
    [removeProduct, setRemoveProduct] = useState<Product | null>(null),
    [branchOf, setBranchOf] = useState(''),
    [eventRoster, setEventRoster] = useState<CafeEvent | null>(null),
    [removeEvent, setRemoveEvent] = useState<CafeEvent | null>(null),
    [order, setOrder] = useState<Order | null>(null),
    [selectedCafe, setSelectedCafe] = useState(''),
    [productCafe, setProductCafe] = useState(''),
    [productCategoryFilter, setProductCategoryFilter] = useState('');
  const data = resource.data;
  const filteredProducts =
    data?.products.filter(
      (product) =>
        (!productCafe || product.cafe_id === productCafe) &&
        (!productCategoryFilter || productCategory(product.category) === productCategoryFilter),
    ) || [];
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
  async function checkOrderPayment(id: string) {
    try {
      const result = await api<{ status: Order['payment_status'] }>(
        'payments/' + id + '/verify',
        'POST',
        {},
      );
      resource.reload();
      await refresh();
      toast(paymentStatusLabels[result.status]);
    } catch (error) {
      toast((error as Error).message);
    }
  }
  const tabs = [
    { id: 'cafes', label: 'کافه‌های من', icon: Store },
    { id: 'products', label: 'مدیریت منو', icon: Coffee },
    { id: 'crm', label: 'مدیریت مشتریان', icon: Users },
    { id: 'sales', label: 'مدیریت و فروش', icon: CircleDollarSign },
    { id: 'orders', label: 'سفارش‌ها', icon: ReceiptText },
    { id: 'reservations', label: 'رزروها', icon: CalendarCheck },
    { id: 'events', label: 'رویدادها', icon: CalendarDays },
    { id: 'coupons', label: 'کدهای تخفیف', icon: TicketPercent },
    { id: 'support', label: 'پیام‌های مشتریان', icon: Headphones },
  ];
  return (
    <>
      <PageTitle
        title="مدیریت کافه شما"
        description="از اولین فنجان تا قرار بعدی؛ کسب‌وکارت را از اینجا مدیریت کن."
        action={
          app?.user && (
            <button
              className="button primary"
              onClick={() => {
                setEditing(null);
                setBranchOf('');
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
                          {c.parent_id && (
                            <p>
                              شعبهٔ {data.cafes.find((parent) => parent.id === c.parent_id)?.name}
                            </p>
                          )}
                          <p>
                            {c.city}، {c.address}
                          </p>
                          <span className="badge">
                            {c.active ? 'پذیرش سفارش و رزرو فعال' : 'پذیرش سفارش و رزرو غیرفعال'}
                          </span>
                        </div>
                        <div className="button-row">
                          <Link className="button secondary" href={'/operations/' + c.id}>
                            فضای کار شعبه
                          </Link>
                          {!c.parent_id && (
                            <button
                              className="button secondary"
                              onClick={() => {
                                setBranchOf(c.id);
                                setEditing(null);
                                setModal('cafe');
                              }}
                            >
                              افزودن شعبه
                            </button>
                          )}
                          <button
                            className="button primary"
                            onClick={() => {
                              setProductCafe(c.id);
                              setTab('products');
                            }}
                          >
                            <Pencil size={16} />
                            تغییر آیتم و دسته‌بندی
                          </button>
                          <button
                            className="button secondary"
                            onClick={() => {
                              setSelectedCafe(c.id);
                              setEditing(null);
                              setModal('event');
                            }}
                          >
                            <CalendarDays size={16} />
                            ایجاد رویداد جدید
                          </button>
                          <Link className="button secondary" href={'/cafes/' + c.id}>
                            مشاهده
                            <ArrowUpLeft size={16} />
                          </Link>
                          <button
                            className="button secondary"
                            onClick={() => {
                              setEditing(c);
                              setBranchOf('');
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
                    title="کافه شما، در ویتکو"
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
                        setSelectedCafe(productCafe);
                        setEditing(null);
                        setModal('product');
                      }}
                    >
                      <Plus size={17} />
                      محصول جدید
                    </button>
                  </div>
                  <CategoryPricing cafes={data.cafes} products={data.products} onDone={updated} />
                  <div className="owner-filters">
                    <Field label="کافه محصولات">
                      <select value={productCafe} onChange={(e) => setProductCafe(e.target.value)}>
                        <option value="">همه کافه‌های من</option>
                        {data.cafes.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="دسته‌بندی محصولات">
                      <select
                        value={productCategoryFilter}
                        onChange={(e) => setProductCategoryFilter(e.target.value)}
                      >
                        <option value="">همه دسته‌بندی‌ها</option>
                        {menuCategories(data.products).map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  {filteredProducts.length ? (
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
                          {filteredProducts.map((p) => (
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
                                <button
                                  className="icon-button"
                                  aria-label={'حذف ' + p.name}
                                  onClick={() => setRemoveProduct(p)}
                                >
                                  <Trash2 size={17} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <Empty
                      title={
                        data.products.length
                          ? 'محصولی با این فیلتر پیدا نشد'
                          : 'منوی شما از اینجا شروع می‌شود'
                      }
                      description={
                        data.products.length
                          ? 'کافه یا دسته‌بندی دیگری انتخاب کنید.'
                          : 'پس از ثبت کافه، محصولات، قیمت‌ها و افزودنی‌های واقعی منو را وارد کنید.'
                      }
                    />
                  )}
                </>
              )}
              {(tab === 'crm' || tab === 'sales') && (
                <OwnerInsights cafes={data.cafes} view={tab} />
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
                        <p>
                          {o.kind === 'invoice'
                            ? 'فاکتور حضوری؛ بدون سفارش از منو'
                            : o.kind === 'event'
                              ? 'بلیت رویداد · ' + o.note
                              : o.items.map((i) => `${digits(i.quantity)} × ${i.name}`).join('، ')}
                        </p>
                        {o.payment_method === 'zarinpal' && (
                          <p className={'payment-status-label payment-status-' + o.payment_status}>
                            {paymentStatusLabels[o.payment_status]}
                            {o.payment_ref && (
                              <>
                                {' '}
                                · شماره پیگیری: <bdi>{o.payment_ref}</bdi>
                              </>
                            )}
                          </p>
                        )}
                        {o.payment_status === 'refund_required' && (
                          <p className="notice">
                            بازگشت وجه باید در حساب پذیرنده پیگیری شود؛ بازگشت خودکار انجام نشده
                            است.
                          </p>
                        )}
                        <div className="list-row">
                          <span>
                            {o.kind === 'invoice'
                              ? 'پرداخت فاکتور حضوری'
                              : o.kind === 'event'
                                ? 'بلیت رویداد'
                                : o.mode === 'dine_in'
                                  ? 'سفارش میز'
                                  : o.mode === 'pickup'
                                    ? 'تحویل از کافه'
                                    : 'ارسال به آدرس'}{' '}
                            · {dateLabel(o.created_at, true)}
                          </span>
                          <strong>{money(o.total)}</strong>
                        </div>
                        <div className="button-row">
                          <button className="button secondary compact" onClick={() => setOrder(o)}>
                            جزئیات سفارش
                          </button>
                          {paymentIsPending(o) && (
                            <button
                              className="button secondary compact"
                              onClick={() => void checkOrderPayment(o.id)}
                            >
                              بررسی پرداخت
                            </button>
                          )}
                          {o.kind !== 'event' && o.status === 'pending' && (
                            <>
                              {o.kind !== 'invoice' && (
                                <button
                                  className="button primary compact"
                                  disabled={
                                    o.payment_method === 'zarinpal' && o.payment_status !== 'paid'
                                  }
                                  onClick={() => status('orders', o.id, 'preparing')}
                                >
                                  تأیید و آماده‌سازی
                                </button>
                              )}
                              <button
                                className="button danger-outline compact"
                                disabled={paymentIsPending(o)}
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
                                status(
                                  'orders',
                                  o.id,
                                  o.mode === 'delivery' ? 'delivering' : 'ready',
                                )
                              }
                            >
                              {o.mode === 'delivery'
                                ? 'تحویل به پیک'
                                : o.mode === 'dine_in'
                                  ? 'آماده پذیرایی'
                                  : 'آماده دریافت'}
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
                        {r.table_name && <p>میز انتخابی: {r.table_name}</p>}
                        {r.order_id && (
                          <p className="muted">
                            سفارش منو همراه این رزرو ثبت شده است؛ جزئیات را در بخش سفارش‌ها ببینید.
                          </p>
                        )}
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
                              disabled={
                                r.payment_method === 'zarinpal' && r.payment_status === 'pending'
                              }
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
                        setSelectedCafe('');
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
                          <div className="button-row">
                            <span className="badge">
                              {
                                {
                                  draft: 'پیش‌نویس',
                                  published: 'منتشر شده',
                                  cancelled: 'لغو شده',
                                  completed: 'برگزار شده',
                                }[e.status || 'published']
                              }
                            </span>
                            <button className="button secondary" onClick={() => setEventRoster(e)}>
                              شرکت‌کننده‌ها
                            </button>
                            {['draft', 'published'].includes(e.status || 'published') && (
                              <>
                                <button
                                  className="button secondary"
                                  onClick={() => {
                                    setEditing(e);
                                    setModal('event');
                                  }}
                                >
                                  <Pencil size={16} /> ویرایش
                                </button>
                                {e.status === 'draft' && (
                                  <>
                                    <button
                                      className="button primary"
                                      onClick={() =>
                                        void status('dashboard/events', e.id, 'published')
                                      }
                                    >
                                      انتشار
                                    </button>
                                    <button
                                      type="button"
                                      className="button danger-outline"
                                      onClick={() => setRemoveEvent(e)}
                                    >
                                      حذف پیش‌نویس
                                    </button>
                                  </>
                                )}
                                <button
                                  className="button danger-outline"
                                  onClick={() => void status('dashboard/events', e.id, 'cancelled')}
                                >
                                  لغو رویداد
                                </button>
                                {e.status === 'published' &&
                                  Date.parse(e.date + 'T' + (e.end_time || e.time) + ':00+03:30') <=
                                    Date.now() && (
                                    <button
                                      className="button secondary"
                                      onClick={() =>
                                        void status('dashboard/events', e.id, 'completed')
                                      }
                                    >
                                      اتمام رویداد
                                    </button>
                                  )}
                              </>
                            )}
                          </div>
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
                title={editing ? 'ویرایش کافه' : branchOf ? 'ثبت شعبه' : 'کافه‌تان را معرفی کنید'}
                onClose={() => setModal(null)}
              >
                {modal === 'cafe' && (
                  <CafeEditor
                    key={editing?.id || 'new'}
                    cafe={editing as Cafe | null}
                    parentId={branchOf}
                    vipTables={Boolean(editing && data.cafe_features[editing.id]?.vip_tables)}
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
                    initialCafe={selectedCafe}
                    categories={menuCategories(data.products)}
                    features={data.cafe_features}
                    onDone={updated}
                  />
                )}
              </Modal>
              <Confirm
                open={Boolean(removeProduct)}
                title="حذف محصول"
                description={removeProduct?.name || ''}
                onClose={() => setRemoveProduct(null)}
                onConfirm={() => {
                  if (!removeProduct) return;
                  const id = removeProduct.id;
                  setRemoveProduct(null);
                  void api('dashboard/products/' + id, 'DELETE')
                    .then(updated)
                    .catch((error) => toast(error.message));
                }}
              />
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
                    initialCafe={selectedCafe}
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
                open={Boolean(eventRoster)}
                title="شرکت‌کننده‌های رویداد"
                onClose={() => setEventRoster(null)}
              >
                {eventRoster && <EventRoster key={eventRoster.id} event={eventRoster} />}
              </Modal>
              <Confirm
                open={Boolean(removeEvent)}
                title="پیش‌نویس رویداد حذف شود؟"
                description={removeEvent?.title || ''}
                onClose={() => setRemoveEvent(null)}
                onConfirm={async () => {
                  if (!removeEvent) return;
                  try {
                    await api('dashboard/events/' + removeEvent.id, 'DELETE');
                    await updated();
                  } catch (error) {
                    toast((error as Error).message);
                  } finally {
                    setRemoveEvent(null);
                  }
                }}
              />
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
                    {order.kind === 'invoice' && (
                      <p>فاکتور حضوری؛ مبلغ بر اساس صورت‌حساب کافه وارد شده است.</p>
                    )}
                    {order.kind === 'menu' && order.mode === 'dine_in' && (
                      <p>
                        {order.table_name ||
                          (order.reservation_id
                            ? 'سفارش همراه رزرو میز'
                            : 'سفارش برای پذیرایی در کافه')}
                      </p>
                    )}
                    <p>{order.note}</p>
                    <p>
                      {order.payment_method === 'zarinpal'
                        ? paymentStatusLabels[order.payment_status]
                        : 'پرداخت هنگام دریافت'}
                      {order.payment_ref && (
                        <>
                          {' '}
                          · شماره پیگیری: <bdi>{order.payment_ref}</bdi>
                        </>
                      )}
                    </p>
                    <strong>
                      {order.payment_status === 'paid' ? 'مبلغ پرداخت‌شده: ' : 'مبلغ سفارش: '}
                      {money(order.total)}
                    </strong>
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
function CafeSelect({
  cafes,
  value,
  initialValue,
  onChange,
}: {
  cafes: Cafe[];
  value?: string;
  initialValue?: string;
  onChange?: (id: string) => void;
}) {
  return (
    <Field label="کافه">
      <select
        name="cafe_id"
        defaultValue={value || initialValue || cafes[0]?.id}
        disabled={Boolean(value)}
        onChange={(event) => onChange?.(event.target.value)}
      >
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
function CafeEditor({
  cafe,
  parentId,
  vipTables,
  onDone,
}: {
  cafe: Cafe | null;
  parentId: string;
  vipTables: boolean;
  onDone: () => Promise<void>;
}) {
  const [image, setImage] = useState(cafe?.image || ''),
    [logo, setLogo] = useState(cafe?.logo || ''),
    [latitude, setLatitude] = useState(cafe?.latitude?.toString() || ''),
    [longitude, setLongitude] = useState(cafe?.longitude?.toString() || ''),
    [images, setImages] = useState(() => loadGallery(cafe?.images)),
    [tables, setTables] = useState<Cafe['tables']>(cafe?.tables || []);
  const { toast } = useApp();
  return (
    <Form
      onSubmit={async (form) => {
        await api('dashboard/cafes', cafe ? 'PUT' : 'POST', {
          ...Object.fromEntries(form),
          id: cafe?.id,
          parent_id: parentId || undefined,
          image,
          logo,
          images: images.map((item) => item.url).filter(Boolean),
          tables,
          latitude,
          longitude,
          amenities: form.getAll('amenities'),
          pickup: form.get('pickup') === 'on',
          active: form.get('active') === 'on',
        });
        await onDone();
      }}
    >
      <ImageUpload value={image} onChange={setImage} label="کافه" />
      <ImageUpload value={logo} onChange={setLogo} label="نشان کافه" />
      <GalleryEditor
        label="کافه"
        cover={image}
        setCover={setImage}
        images={images}
        setImages={setImages}
      />
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
      <LocationPicker
        value={
          latitude !== '' &&
          longitude !== '' &&
          Number.isFinite(Number(latitude)) &&
          Number.isFinite(Number(longitude))
            ? { latitude: Number(latitude), longitude: Number(longitude) }
            : null
        }
        onChange={(point) => {
          setLatitude(point ? String(point.latitude) : '');
          setLongitude(point ? String(point.longitude) : '');
        }}
      />
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
        <legend>میزهای قابل رزرو</legend>
        <p className="muted">
          نام و ظرفیت هر میز را ثبت کنید تا مشتری بتواند میز دلخواهش را انتخاب کند. ظرفیت کلی کافه
          همچنان بررسی می‌شود.
        </p>
        {tables.map((table, index) => (
          <div className="owner-table-editor" key={table.id}>
            <Field label={'نام میز ' + digits(index + 1)}>
              <input
                value={table.name}
                maxLength={80}
                onChange={(e) =>
                  setTables(
                    tables.map((item, i) =>
                      i === index ? { ...item, name: e.target.value } : item,
                    ),
                  )
                }
              />
            </Field>
            <Field label={'ظرفیت میز ' + digits(index + 1)}>
              <input
                type="number"
                min={1}
                max={20}
                value={table.seats}
                onChange={(e) =>
                  setTables(
                    tables.map((item, i) =>
                      i === index ? { ...item, seats: Number(e.target.value) } : item,
                    ),
                  )
                }
              />
            </Field>
            <button
              type="button"
              className="icon-button"
              aria-label={'حذف میز ' + (table.name || digits(index + 1))}
              onClick={() => setTables(tables.filter((_, i) => i !== index))}
            >
              <Trash2 size={17} />
            </button>
            <div className="service-inline service-table-options">
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={table.enabled !== false}
                  onChange={(event) =>
                    setTables(
                      tables.map((item) =>
                        item.id === table.id ? { ...item, enabled: event.target.checked } : item,
                      ),
                    )
                  }
                />{' '}
                میز فعال
              </label>
              {(vipTables || table.vip) && (
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={Boolean(table.vip)}
                    onChange={(event) =>
                      setTables(
                        tables.map((item) =>
                          item.id === table.id ? { ...item, vip: event.target.checked } : item,
                        ),
                      )
                    }
                  />{' '}
                  میز ویژه
                </label>
              )}
            </div>
          </div>
        ))}
        <button
          type="button"
          className="text-link"
          disabled={tables.length >= 50}
          onClick={() => setTables([...tables, { id: crypto.randomUUID(), name: '', seats: 2 }])}
        >
          <Plus size={16} />
          افزودن میز
        </button>
      </fieldset>
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
        <Field
          label="درصد تخفیف فاکتور حضوری"
          hint="از صفر تا ۹۹ درصد؛ صفر یعنی بدون تخفیف خودکار. اگر مشتری کد تخفیف داشته باشد، تخفیف بزرگ‌تر اعمال می‌شود و درصدها جمع نمی‌شوند."
        >
          <input
            name="invoice_discount_percent"
            type="number"
            min={0}
            max={99}
            step={1}
            defaultValue={cafe?.invoice_discount_percent || 0}
          />
        </Field>
        <label className="check-row">
          <input type="checkbox" name="active" defaultChecked={cafe?.active ?? true} />
          پذیرش سفارش و رزرو فعال باشد
        </label>
      </div>
    </Form>
  );
}
function GalleryEditor({
  label,
  cover,
  setCover,
  images,
  setImages,
}: {
  label: string;
  cover: string;
  setCover: (value: string) => void;
  images: GalleryImage[];
  setImages: Dispatch<SetStateAction<GalleryImage[]>>;
}) {
  function move(index: number) {
    setImages((before) => {
      const next = [...before];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }
  return (
    <fieldset className="option-group">
      <legend>عکس‌های بیشتر {label}</legend>
      <div className="owner-gallery-editor">
        {images.map(({ id, url }, index) => (
          <div key={id}>
            <ImageUpload
              value={url}
              onChange={(value) =>
                setImages((before) =>
                  before.map((item) => (item.id === id ? { ...item, url: value } : item)),
                )
              }
              label={label + '، عکس ' + digits(index + 1)}
            />
            <div className="service-inline">
              {url && index > 0 && (
                <button type="button" className="text-link" onClick={() => move(index)}>
                  جابه‌جایی به قبل
                </button>
              )}
              {url && url !== cover && (
                <button
                  type="button"
                  className="text-link"
                  onClick={() => {
                    setCover(url);
                    setImages((before) =>
                      before.flatMap((item) =>
                        item.id === id
                          ? cover && !before.some((entry) => entry.url === cover)
                            ? [{ id, url: cover }]
                            : []
                          : [item],
                      ),
                    );
                  }}
                >
                  انتخاب به‌عنوان تصویر اصلی
                </button>
              )}
              <button
                type="button"
                className="text-link"
                onClick={() => setImages((before) => before.filter((item) => item.id !== id))}
              >
                حذف از گالری
              </button>
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="text-link"
        disabled={images.length >= 10}
        onClick={() => {
          const id = crypto.randomUUID();
          setImages((before) => [...before, { id, url: '' }]);
        }}
      >
        <Plus size={16} /> افزودن عکس
      </button>
    </fieldset>
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
  initialCafe,
  categories,
  features,
  onDone,
}: {
  product: Product | null;
  cafes: Cafe[];
  initialCafe?: string;
  categories: string[];
  features: Record<string, CafeFeatures>;
  onDone: () => Promise<void>;
}) {
  const [image, setImage] = useState(product?.image || ''),
    [images, setImages] = useState(() => loadGallery(product?.images)),
    [sizes, setSizes] = useState<Option[]>(product?.sizes || []),
    [addons, setAddons] = useState<Option[]>(product?.addons || []),
    [cafeId, setCafeId] = useState(product?.cafe_id || initialCafe || cafes[0]?.id || '');
  const vipMenu = Boolean(features[cafeId]?.vip_menu || product?.vip_only);
  return (
    <Form
      onSubmit={async (form) => {
        await api('dashboard/products', product ? 'PUT' : 'POST', {
          ...Object.fromEntries(form),
          id: product?.id,
          image,
          images: images.map((item) => item.url).filter(Boolean),
          sizes,
          addons,
          available: form.get('available') === 'on',
          vip_only: vipMenu && form.has('vip_only'),
        });
        await onDone();
      }}
    >
      <CafeSelect
        cafes={cafes}
        value={product?.cafe_id}
        initialValue={initialCafe}
        onChange={setCafeId}
      />
      <ImageUpload value={image} onChange={setImage} label="محصول" />
      <GalleryEditor
        label="محصول"
        cover={image}
        setCover={setImage}
        images={images}
        setImages={setImages}
      />
      <Field label="نام محصول">
        <input name="name" defaultValue={product?.name} />
      </Field>
      <Field label="توضیحات">
        <textarea name="description" defaultValue={product?.description} />
      </Field>
      <div className="form-grid">
        <Field label="دسته‌بندی">
          <input
            name="category"
            list="owner-menu-categories"
            defaultValue={product ? productCategory(product.category) : ''}
            placeholder="دسته‌بندی را انتخاب یا وارد کنید"
          />
          <datalist id="owner-menu-categories">
            {categories.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
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
      {vipMenu && (
        <label className="check-row">
          <input type="checkbox" name="vip_only" defaultChecked={Boolean(product?.vip_only)} /> فقط
          برای میز ویژه
        </label>
      )}
    </Form>
  );
}
function EventEditor({
  event,
  cafes,
  initialCafe,
  onDone,
}: {
  event: CafeEvent | null;
  cafes: Cafe[];
  initialCafe?: string;
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
      <CafeSelect cafes={cafes} value={event?.cafe_id} initialValue={initialCafe} />
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
      <Field
        label="ساعت پایان رویداد"
        hint="برای نمایش رویداد در بخش در حال برگزاری، پایان آن را پس از ساعت شروع و در همان روز مشخص کنید."
      >
        <select name="end_time" defaultValue={event?.end_time || ''}>
          <option value="">ساعت پایان مشخص نشده</option>
          {Array.from({ length: 48 }, (_, index) => {
            const time =
              String(Math.floor(index / 2)).padStart(2, '0') + ':' + (index % 2 ? '30' : '00');
            return (
              <option key={time} value={time}>
                {digits(time)}
              </option>
            );
          })}
        </select>
      </Field>
      <Field label="ظرفیت مهمان‌ها">
        <input name="capacity" type="number" min={1} max={500} defaultValue={event?.capacity} />
      </Field>
      <Field label="قیمت بلیت به تومان" hint="برای رویداد رایگان، صفر را وارد کنید.">
        <input
          name="price"
          type="number"
          min="0"
          max="100000000"
          defaultValue={event?.price || 0}
        />
      </Field>
      {!event && (
        <Field label="وضعیت انتشار">
          <select name="status">
            <option value="published">منتشر شود</option>
            <option value="draft">پیش‌نویس</option>
          </select>
        </Field>
      )}
    </Form>
  );
}
