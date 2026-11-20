'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { cafeCustomerHref } from '@/lib/cafe-links';
import type { cafeCustomerProfile, cafeCustomers } from '@/lib/cafe-customers';
import { api, useApp, useResource } from '@/lib/client';
import { dateLabel, digits, money } from '@/lib/format';
import { Badge, ErrorBox, Field, Form, Loading } from './ui';

export function CafeCustomers({ cafeId, memberId }: { cafeId: string; memberId?: string }) {
  return memberId ? (
    <CustomerProfile key={cafeId + ':' + memberId} cafeId={cafeId} memberId={memberId} />
  ) : (
    <CustomerDirectory key={cafeId} cafeId={cafeId} />
  );
}

function CustomerDirectory({ cafeId }: { cafeId: string }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const resource = useResource<ReturnType<typeof cafeCustomers>>(
    'operations/' +
      encodeURIComponent(cafeId) +
      '/customers?' +
      new URLSearchParams({ q: search, page: String(page) }),
  );
  const data = resource.data;
  return (
    <section className="panel stack">
      <h2>فهرست مشتریان</h2>
      <Field label="جستجوی مشتری">
        <input
          type="search"
          placeholder="نام، شماره همراه یا ایمیل"
          maxLength={254}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </Field>
      {resource.loading ? (
        <Loading />
      ) : resource.error ? (
        <ErrorBox message={resource.error} retry={resource.reload} />
      ) : (
        data && (
          <>
            {data.customers.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>مشتری</th>
                      <th>اطلاعات تماس</th>
                      <th>امتیاز</th>
                      <th>سطح باشگاه</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.customers.map((member) => (
                      <tr key={member.id}>
                        <td>
                          <Link className="text-link" href={cafeCustomerHref(cafeId, member.id)}>
                            {member.name}
                          </Link>
                        </td>
                        <td>
                          <bdi>{member.phone || member.email || 'ثبت نشده'}</bdi>
                        </td>
                        <td>{digits(member.points)}</td>
                        <td>{member.tier || 'بدون سطح'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">
                {search
                  ? 'مشتری مطابق جستجو پیدا نشد.'
                  : 'هنوز مشتری دارای سفارش، رزرو یا امتیاز در این کافه ثبت نشده است.'}
              </p>
            )}
            {(page > 1 || data.has_more) && (
              <nav className="button-row" aria-label="صفحه‌های مشتریان">
                <button
                  className="button secondary"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  صفحه قبل
                </button>
                <span>صفحه {digits(page)}</span>
                <button
                  className="button secondary"
                  disabled={!data.has_more}
                  onClick={() => setPage(page + 1)}
                >
                  صفحه بعد
                </button>
              </nav>
            )}
          </>
        )
      )}
    </section>
  );
}

function CustomerProfile({ cafeId, memberId }: { cafeId: string; memberId: string }) {
  const endpoint =
    'operations/' + encodeURIComponent(cafeId) + '/customers/' + encodeURIComponent(memberId);
  const resource = useResource<ReturnType<typeof cafeCustomerProfile>>(endpoint);
  const pending = useRef({ signature: '', key: '' });
  const { toast } = useApp();
  const data = resource.data;
  return (
    <section className="stack">
      <Link className="text-link" href={cafeCustomerHref(cafeId)}>
        بازگشت به فهرست مشتریان
      </Link>
      {resource.loading ? (
        <Loading />
      ) : resource.error ? (
        <ErrorBox message={resource.error} retry={resource.reload} />
      ) : (
        data && (
          <>
            <article className="panel stack">
              <div className="card-heading">
                <h2>{data.customer.name}</h2>
                {Boolean(data.customer.suspended) && <span className="badge">حساب غیرفعال</span>}
              </div>
              {data.customer.phone && (
                <div className="list-row">
                  <span>شماره همراه</span>
                  <bdi>{digits(data.customer.phone)}</bdi>
                </div>
              )}
              {data.customer.email && (
                <div className="list-row">
                  <span>ایمیل</span>
                  <bdi>{data.customer.email}</bdi>
                </div>
              )}
              <div className="list-row">
                <span>امتیاز در این کافه</span>
                <strong>{digits(data.customer.points)}</strong>
              </div>
              {data.customer.tier && (
                <div className="list-row">
                  <span>سطح باشگاه</span>
                  <strong>{data.customer.tier}</strong>
                </div>
              )}
              <div className="list-row">
                <span>خرید تکمیل‌شده</span>
                <strong>
                  {digits(data.purchase.count)} خرید · {money(data.purchase.total)}
                </strong>
              </div>
            </article>
            <section className="panel stack">
              <h3>آخرین سفارش‌ها</h3>
              {data.orders.length ? (
                data.orders.map((order) => (
                  <div className="list-row" key={order.id}>
                    <span>{dateLabel(order.created_at, true)}</span>
                    <Badge status={order.status} />
                    <strong>{money(order.total)}</strong>
                  </div>
                ))
              ) : (
                <p className="muted">سفارشی در این کافه ثبت نشده است.</p>
              )}
            </section>
            <section className="panel stack">
              <h3>رزروهای مشتری</h3>
              {data.reservations.length ? (
                data.reservations.map((booking) => (
                  <div className="list-row" key={booking.id}>
                    <span>
                      {dateLabel(booking.date)} · {digits(booking.time)}
                    </span>
                    <Badge status={booking.status} />
                    <span>{digits(booking.guests)} نفر</span>
                  </div>
                ))
              ) : (
                <p className="muted">رزروی در این کافه ثبت نشده است.</p>
              )}
            </section>
            <section className="panel stack">
              <h3>گردش امتیاز مشتری</h3>
              {data.ledger.length ? (
                data.ledger.map((entry) => (
                  <div className="list-row" key={entry.id}>
                    <span>
                      {entry.reason}
                      <br />
                      <small className="muted">{dateLabel(entry.created_at, true)}</small>
                    </span>
                    <strong dir="ltr">
                      {entry.delta > 0 && '+'}
                      {digits(entry.delta)}
                    </strong>
                  </div>
                ))
              ) : (
                <p className="muted">تراکنش امتیازی برای این مشتری ثبت نشده است.</p>
              )}
            </section>
            {data.can_adjust && (
              <Form
                className="panel"
                onSubmit={async (form) => {
                  const input = {
                    delta: String(form.get('delta') ?? ''),
                    reason: String(form.get('reason') ?? '').trim(),
                  };
                  const signature = JSON.stringify(input);
                  if (pending.current.signature !== signature)
                    pending.current = { signature, key: crypto.randomUUID() };
                  await api(endpoint, 'POST', { ...input, request_key: pending.current.key });
                  pending.current = { signature: '', key: '' };
                  toast('تغییر امتیاز مشتری ثبت شد.');
                  resource.reload();
                }}
              >
                <h3>تغییر امتیاز مشتری</h3>
                <Field label="تعداد امتیاز (افزایش یا کاهش)">
                  <input type="number" min={-100000} max={100000} name="delta" />
                </Field>
                <Field label="دلیل تغییر">
                  <input name="reason" minLength={3} maxLength={200} />
                </Field>
              </Form>
            )}
          </>
        )
      )}
    </section>
  );
}
