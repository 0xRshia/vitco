'use client';
import { useState } from 'react';
import Link from 'next/link';
import { cafeCustomerHref } from '@/lib/cafe-links';
import { BarChart3, Users, ReceiptText, TrendingUp, Search, SlidersHorizontal } from 'lucide-react';
import { api, useResource } from '@/lib/client';
import { money, digits, dateLabel, today } from '@/lib/format';
import { menuCategories } from '@/lib/catalog';
import type { Cafe, Product, OwnerAnalytics } from '@/lib/types';
import { Badge, Empty, ErrorBox, Field, Loading } from './ui';
import { PersianDateInput } from './persian-date';

function daysBefore(date: string, days: number) {
  const value = new Date(date + 'T12:00:00Z');
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}
const searchable = (value: string) =>
  value.normalize('NFKC').replace(/ي/g, 'ی').replace(/ك/g, 'ک').trim().toLocaleLowerCase('fa');

export function OwnerInsights({ cafes, view }: { cafes: Cafe[]; view: 'crm' | 'sales' }) {
  const [from, setFrom] = useState(() => daysBefore(today(), 29)),
    [to, setTo] = useState(today),
    [cafe, setCafe] = useState(''),
    [itemSearch, setItemSearch] = useState('');
  const valid = Boolean(from && to && from <= to);
  const resource = useResource<OwnerAnalytics>(
    valid ? 'dashboard/analytics?' + new URLSearchParams({ from, to, cafe }) : null,
  );
  const data = resource.data;
  const matchingItems =
    data?.item_customers.filter((item) => searchable(item.name).includes(searchable(itemSearch))) ||
    [];
  return (
    <section className="owner-insights stack">
      <div>
        <h2>{view === 'crm' ? 'مدیریت ارتباط با مشتریان' : 'گزارش مدیریت و فروش'}</h2>
        <p className="muted">
          بازه زمانی و کافه را انتخاب کنید. تاریخ‌ها بر اساس ساعت تهران محاسبه می‌شوند.
        </p>
      </div>
      <div className="panel owner-filters">
        <Field label="از تاریخ">
          <PersianDateInput value={from} onChange={setFrom} />
        </Field>
        <Field label="تا تاریخ">
          <PersianDateInput value={to} onChange={setTo} />
        </Field>
        <Field label="کافه گزارش">
          <select value={cafe} onChange={(e) => setCafe(e.target.value)}>
            <option value="">همه کافه‌های من</option>
            {cafes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
        {view === 'crm' && cafes.length > 0 && (
          <nav aria-label="پرونده مشتریان کافه‌ها" className="stack">
            {cafes
              .filter((item) => !cafe || item.id === cafe)
              .map((item) => (
                <Link key={item.id} className="text-link" href={cafeCustomerHref(item.id)}>
                  پرونده مشتریان {item.name}
                </Link>
              ))}
          </nav>
        )}
      </div>
      {!valid ? (
        <ErrorBox message="تاریخ پایان باید برابر یا بعد از تاریخ شروع باشد." />
      ) : resource.loading ? (
        <Loading />
      ) : resource.error ? (
        <ErrorBox message={resource.error} retry={resource.reload} />
      ) : (
        data &&
        (view === 'crm' ? (
          <>
            <div className="owner-metrics">
              <div className="panel stat-card">
                <Users size={22} />
                <strong>{digits(data.new_customer_count)}</strong>
                <span>مشتریان تازه از طریق ویتکو</span>
              </div>
              <div className="panel stat-card">
                <ReceiptText size={22} />
                <strong>{digits(data.customers.length)}</strong>
                <span>مشتریان دارای سفارش در بازه</span>
              </div>
            </div>
            <p className="notice">
              مشتری تازه یعنی اولین سفارش لغونشده هر مشتری در هر کافه از طریق ویتکو در این بازه.
              مراجعه یا خرید خارج از ویتکو قابل ردیابی نیست. در گزارش همه کافه‌ها، یک مشتری می‌تواند
              برای چند کافه شمرده شود.
            </p>
            <h3>آخرین سفارش مشتریان فعال در بازه</h3>
            {data.customers.length ? (
              <div className="stack">
                {data.customers.map((customer) => (
                  <article
                    className="panel owner-customer"
                    key={customer.cafe_id + ':' + customer.user_id}
                  >
                    <div className="card-heading">
                      <div>
                        <h3>
                          {customer.has_profile ? (
                            <Link href={cafeCustomerHref(customer.cafe_id, customer.user_id)}>
                              {customer.customer_name}
                            </Link>
                          ) : (
                            customer.customer_name
                          )}
                        </h3>
                        <small className="muted">{customer.cafe_name}</small>
                      </div>
                      <Badge status={customer.latest_order.status} />
                    </div>
                    <p>
                      {customer.latest_order.kind === 'invoice'
                        ? 'پرداخت فاکتور حضوری'
                        : customer.latest_order.items
                            .map((item) => digits(item.quantity) + ' × ' + item.name)
                            .join('، ')}
                    </p>
                    <div className="list-row">
                      <span>
                        آخرین سفارش لغونشده · {dateLabel(customer.latest_order.created_at, true)}
                      </span>
                      <strong>{money(customer.latest_order.total)}</strong>
                    </div>
                    <small className="muted">
                      اولین سفارش از ویتکو: {dateLabel(customer.first_order_at, true)}
                    </small>
                  </article>
                ))}
              </div>
            ) : (
              <Empty
                title="مشتری‌ای در این بازه ثبت نشده"
                description="پس از ثبت سفارش واقعی از طریق ویتکو، نام مشتری و آخرین سفارش او اینجا نمایش داده می‌شود."
              />
            )}
          </>
        ) : (
          <>
            <div className="owner-metrics">
              <div className="panel stat-card">
                <ReceiptText size={22} />
                <strong>{digits(data.order_count)}</strong>
                <span>تعداد سفارش‌ها در بازه، با همه وضعیت‌ها</span>
              </div>
              <div className="panel stat-card">
                <BarChart3 size={22} />
                <strong>{money(data.sales)}</strong>
                <span>فروش سفارش‌های تکمیل‌شده · {digits(data.completed_order_count)} سفارش</span>
              </div>
              <div className="panel stat-card">
                <TrendingUp size={22} />
                <strong>
                  {data.sales_change_percent === null
                    ? 'بدون مبنای مقایسه'
                    : (data.sales_change_percent > 0 ? '+' : '') +
                      digits(data.sales_change_percent) +
                      '٪'}
                </strong>
                <span>تغییر نسبت به بازه قبلی با همین مدت</span>
              </div>
            </div>
            <SalesChart data={data} />
            <section className="panel stack">
              <h3>پرفروش‌ترین آیتم‌ها از طریق ویتکو</h3>
              <p className="muted">
                بر اساس تعداد آیتم در سفارش‌های تکمیل‌شده این بازه؛ سفارش‌های لغوشده محاسبه
                نمی‌شوند.
              </p>
              {data.top_items.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>آیتم</th>
                        <th>تعداد فروخته‌شده</th>
                        <th>تعداد سفارش</th>
                        <th>مبلغ آیتم‌ها پیش از تخفیف</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.top_items.slice(0, 10).map((item) => (
                        <tr key={item.product_id}>
                          <td>{item.name}</td>
                          <td>{digits(item.quantity)}</td>
                          <td>{digits(item.order_count)}</td>
                          <td>{money(item.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="notice">در این بازه سفارش تکمیل‌شده‌ای وجود ندارد.</p>
              )}
            </section>
            <section className="panel stack">
              <h3>
                <Search size={19} /> هر مشتری چند بار این آیتم را سفارش داده؟
              </h3>
              <Field label="جستجوی آیتم در سفارش‌های تکمیل‌شده">
                <input
                  type="search"
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  placeholder="نام آیتم را وارد کنید"
                />
              </Field>
              {matchingItems.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>آیتم</th>
                        <th>مشتری</th>
                        <th>کافه</th>
                        <th>دفعات سفارش</th>
                        <th>تعداد آیتم</th>
                        <th>آخرین سفارش در بازه</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matchingItems.map((item) => (
                        <tr key={item.cafe_id + ':' + item.product_id + ':' + item.user_id}>
                          <td>{item.name}</td>
                          <td>{item.customer_name}</td>
                          <td>{item.cafe_name}</td>
                          <td>{digits(item.order_count)}</td>
                          <td>{digits(item.quantity)}</td>
                          <td>{dateLabel(item.last_order_at, true)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="notice">آیتمی با این نام در سفارش‌های تکمیل‌شده این بازه پیدا نشد.</p>
              )}
            </section>
          </>
        ))
      )}
    </section>
  );
}

function SalesChart({ data }: { data: OwnerAnalytics }) {
  const days = data.daily_sales;
  const max = Math.max(1, ...days.map((day) => day.sales));
  const points = days.map((day, index) => ({
    ...day,
    x: days.length === 1 ? 410 : 70 + (index * 680) / Math.max(1, days.length - 1),
    y: 185 - (day.sales / max) * 150,
  }));
  return (
    <figure className="panel owner-sales-chart">
      <figcaption>
        <h3>نمودار افت و رشد فروش</h3>
        <p className="muted">فروش روزانه سفارش‌های تکمیل‌شده در بازه انتخابی، به تومان</p>
      </figcaption>
      <p className="owner-chart-mobile-scale muted">
        محور فروش: از {digits(0)} تا {money(data.sales > 0 ? max : 0)}
      </p>
      <svg
        viewBox="0 0 800 230"
        role="img"
        aria-labelledby="owner-sales-chart-title"
        aria-describedby="owner-sales-chart-description"
      >
        <title id="owner-sales-chart-title">روند فروش روزانه ویتکو</title>
        <desc id="owner-sales-chart-description">
          مجموع فروش {money(data.sales)}. جزئیات هر روز در جدول زیر نمودار قابل مشاهده است.
        </desc>
        {[0, 0.5, 1].map((ratio) => (
          <g key={ratio}>
            <line
              x1="70"
              x2="750"
              y1={185 - ratio * 150}
              y2={185 - ratio * 150}
              className="owner-chart-grid"
            />
            <text x="60" y={190 - ratio * 150} textAnchor="end">
              {digits(Math.round(max * ratio))}
            </text>
          </g>
        ))}
        {data.sales > 0 && points.length > 0 && (
          <polyline
            points={points.map((point) => point.x + ',' + point.y).join(' ')}
            className="owner-chart-line"
          />
        )}
        {points.length === 1 && data.sales > 0 && (
          <circle cx={points[0].x} cy={points[0].y} r="5" className="owner-chart-dot" />
        )}
        {points.length > 0 && (
          <>
            <text x="70" y="218" textAnchor="start">
              {dateLabel(days[0].date)}
            </text>
            <text x="750" y="218" textAnchor="end">
              {dateLabel(days[days.length - 1].date)}
            </text>
          </>
        )}
        {data.sales === 0 && (
          <text x="410" y="108" textAnchor="middle">
            فروش تکمیل‌شده‌ای در این بازه ثبت نشده است.
          </text>
        )}
      </svg>
      {days.length > 0 && (
        <div className="owner-chart-mobile-dates">
          <span>از {dateLabel(days[0].date)}</span>
          <span>تا {dateLabel(days[days.length - 1].date)}</span>
        </div>
      )}
      {data.sales === 0 && (
        <p className="owner-chart-mobile-scale muted">
          فروش تکمیل‌شده‌ای در این بازه ثبت نشده است.
        </p>
      )}
      <p className="muted">
        بازه قبلی: {dateLabel(data.previous_from)} تا {dateLabel(data.previous_to)} · فروش:{' '}
        {money(data.previous_sales)}
      </p>
      <details>
        <summary>مشاهده اعداد روزانه</summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>روز</th>
                <th>سفارش تکمیل‌شده</th>
                <th>فروش</th>
              </tr>
            </thead>
            <tbody>
              {days.map((day) => (
                <tr key={day.date}>
                  <td>{dateLabel(day.date)}</td>
                  <td>{digits(day.order_count)}</td>
                  <td>{money(day.sales)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

type PriceChange = { id: string; name: string; old_price: number; new_price: number };
type PricePreview = { changes: PriceChange[]; count: number };

export function CategoryPricing({
  cafes,
  products,
  onDone,
}: {
  cafes: Cafe[];
  products: Product[];
  onDone: () => Promise<void>;
}) {
  const [cafe, setCafe] = useState(cafes[0]?.id || ''),
    [category, setCategory] = useState(''),
    [reason, setReason] = useState('inflation'),
    [mode, setMode] = useState('percent'),
    [amount, setAmount] = useState(''),
    [preview, setPreview] = useState<PricePreview | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const categories = menuCategories(products.filter((item) => item.cafe_id === cafe));
  function clearPreview() {
    setPreview(null);
    setError('');
  }
  async function submit(apply: boolean) {
    if (busy) return;
    if (!cafe || !category || amount.trim() === '') {
      setError('کافه، دسته‌بندی و مقدار تغییر را وارد کنید.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await api<PricePreview>('dashboard/prices', 'POST', {
        cafe_id: cafe,
        category,
        reason,
        mode,
        amount: Number(amount),
        preview: !apply,
        ...(apply && preview
          ? { expected: preview.changes.map((item) => ({ id: item.id, price: item.old_price })) }
          : {}),
      });
      if (apply) {
        setPreview(null);
        await onDone();
      } else setPreview(result);
    } catch (e) {
      setError((e as Error).message);
      if (apply) setPreview(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="panel owner-bulk-pricing">
      <summary>
        <SlidersHorizontal size={18} /> تغییر گروهی قیمت یک دسته‌بندی
      </summary>
      <p className="muted">
        مالیات یا تورم را به شکل درصدی، یا یک مبلغ ثابت به قیمت پایه همه آیتم‌های این دسته اضافه یا
        از آن کم کنید. پیش از اعمال، قیمت‌های جدید را بررسی کنید. اندازه‌ها و افزودنی‌ها قیمت
        جداگانه دارند.
      </p>
      <fieldset disabled={busy} className="stack">
        <div className="owner-filters">
          <Field label="کافه تغییر قیمت">
            <select
              value={cafe}
              onChange={(e) => {
                setCafe(e.target.value);
                setCategory('');
                clearPreview();
              }}
            >
              <option value="">انتخاب کافه</option>
              {cafes.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="دسته‌بندی تغییر قیمت">
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                clearPreview();
              }}
            >
              <option value="">انتخاب دسته‌بندی</option>
              <option value="نوشیدنی">همه نوشیدنی‌ها و قهوه</option>
              <option value="فست فود">فست فود (پیتزا، برگر و ساندویچ)</option>
              {categories
                .filter((item) => !['نوشیدنی', 'فست فود'].includes(item))
                .map((item) => (
                  <option value={item} key={item}>
                    {item}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="دلیل تغییر">
            <select
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                clearPreview();
              }}
            >
              <option value="inflation">تورم</option>
              <option value="tax">مالیات</option>
              <option value="manual">تغییر دلخواه</option>
            </select>
          </Field>
        </div>
        <div className="owner-filters">
          <Field label="نوع تغییر">
            <select
              value={mode}
              onChange={(e) => {
                setMode(e.target.value);
                clearPreview();
              }}
            >
              <option value="percent">درصدی</option>
              <option value="fixed">مبلغ ثابت (تومان)</option>
            </select>
          </Field>
          <Field
            label={mode === 'percent' ? 'درصد تغییر' : 'مبلغ تغییر (تومان)'}
            hint="برای کاهش قیمت، مقدار منفی وارد کنید."
          >
            <input
              type="number"
              inputMode="decimal"
              step={mode === 'percent' ? '0.01' : '1'}
              min={mode === 'percent' ? -100 : -100000000}
              max={mode === 'percent' ? 1000 : 100000000}
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                clearPreview();
              }}
            />
          </Field>
        </div>
        <p className="notice">
          این تغییر روی قیمت پایه منو اعمال می‌شود و مالیات جداگانه‌ای به صورتحساب اضافه نمی‌کند.
          سفارش‌های قبلی تغییر نمی‌کنند.
        </p>
        <button
          type="button"
          className="button secondary"
          disabled={!products.length || busy}
          onClick={() => void submit(false)}
        >
          {busy ? 'در حال بررسی…' : 'پیش‌نمایش قیمت‌های جدید'}
        </button>
        {error && <ErrorBox message={error} />}
        {preview && (
          <div className="stack" aria-live="polite">
            <h3>{digits(preview.count)} آیتم در این دسته‌بندی</h3>
            {preview.changes.length ? (
              <>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>آیتم</th>
                        <th>قیمت فعلی</th>
                        <th>قیمت جدید</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.changes.map((item) => (
                        <tr key={item.id}>
                          <td>{item.name}</td>
                          <td>{money(item.old_price)}</td>
                          <td>{money(item.new_price)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button type="button" className="button primary" onClick={() => void submit(true)}>
                  اعمال قیمت‌های نمایش‌داده‌شده روی {digits(preview.count)} آیتم
                </button>
              </>
            ) : (
              <p className="notice">آیتمی برای این دسته‌بندی ثبت نشده است.</p>
            )}
          </div>
        )}
      </fieldset>
    </details>
  );
}
