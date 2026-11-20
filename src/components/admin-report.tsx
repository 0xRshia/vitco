'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { AdminOverview, AdminPeriod } from '@/lib/admin-overview';
import { dateLabel, digits, money } from '@/lib/format';
import { Badge, Field } from './ui';

const periods: Record<AdminPeriod, string> = {
  today: 'امروز',
  week: 'این هفته',
  month: 'این ماه',
  year: 'امسال',
};
const activityLabels = { orders: 'سفارش', reviews: 'دیدگاه', users: 'حساب جدید', tickets: 'تیکت' };
const bucketFormats: Record<AdminPeriod, Intl.DateTimeFormatOptions> = {
  today: { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
  week: { weekday: 'short', day: 'numeric', month: 'short' },
  month: { day: 'numeric', month: 'short' },
  year: { month: 'long' },
};

export function ReportPeriodSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (period: string) => void;
}) {
  return (
    <Field label="بازه گزارش عملکرد">
      <select
        value={Object.hasOwn(periods, value) ? value : 'week'}
        onChange={(event) => onChange(event.target.value)}
      >
        {Object.entries(periods).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
    </Field>
  );
}

function PerformanceChart({ report }: { report: AdminOverview }) {
  const [metric, setMetric] = useState<'orders' | 'revenue'>('revenue');
  const format = new Intl.DateTimeFormat('fa-IR', {
    timeZone: 'Asia/Tehran',
    ...bucketFormats[report.period],
  });
  const metricLabel = metric === 'orders' ? 'تعداد سفارش' : 'فروش';
  const metricValue = metric === 'orders' ? digits : money;
  const points = report.performance;
  const max = Math.max(1, ...points.map((point) => point[metric]));
  return (
    <figure className="panel stack admin-performance">
      <figcaption className="card-heading">
        <h3>روند سفارش و فروش</h3>
        <Field label="نمایش نمودار">
          <select
            value={metric}
            onChange={(event) => setMetric(event.target.value === 'orders' ? 'orders' : 'revenue')}
          >
            <option value="revenue">فروش</option>
            <option value="orders">تعداد سفارش</option>
          </select>
        </Field>
      </figcaption>
      {report.current[metric] > 0 ? (
        <>
          <div className="admin-performance-bars" aria-hidden="true">
            {points.map((point) => (
              <span
                key={point.bucket}
                style={{ height: (point[metric] / max) * 100 + '%' }}
                title={format.format(new Date(point.bucket)) + ' · ' + metricValue(point[metric])}
              />
            ))}
          </div>
          <div className="card-heading muted">
            <span>{format.format(new Date(points[0].bucket))}</span>
            <span>{format.format(new Date(points[points.length - 1].bucket))}</span>
          </div>
        </>
      ) : (
        <p className="muted">
          {metric === 'orders'
            ? 'در این بازه سفارشی ثبت نشده است.'
            : 'در این بازه فروش تکمیل‌شده‌ای ثبت نشده است.'}
        </p>
      )}
      <details>
        <summary>جدول {metricLabel} در این بازه</summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>زمان</th>
                <th>سفارش</th>
                <th>فروش تکمیل‌شده</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.bucket}>
                  <th scope="row">{format.format(new Date(point.bucket))}</th>
                  <td>{digits(point.orders)}</td>
                  <td>{money(point.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

export function AdminReport({ report }: { report: AdminOverview }) {
  return (
    <section className="stack service-section">
      <header>
        <h2>عملکرد ویتکو</h2>
        <p className="muted">
          {dateLabel(report.from)} تا {dateLabel(report.through, true)} به وقت تهران
        </p>
      </header>
      <div className="owner-metrics">
        <div className="panel stat-card">
          <span>فروش سفارش‌های تکمیل‌شده</span>
          <strong>{money(report.current.revenue)}</strong>
          <small>کل دوره قبل · {money(report.previous.revenue)}</small>
        </div>
        <div className="panel stat-card">
          <span>سفارش‌های ثبت‌شده در بازه</span>
          <strong>{digits(report.current.orders)}</strong>
          <small>کل دوره قبل · {digits(report.previous.orders)} سفارش</small>
        </div>
      </div>
      <PerformanceChart report={report} />
      <div className="service-card-grid">
        <section className="panel">
          <h3>کافه‌ها به ترتیب فروش</h3>
          {report.cafes.map((cafe) => (
            <div className="list-row" key={cafe.id}>
              <span>
                {cafe.name}
                <br />
                <small>{digits(cafe.orders)} سفارش</small>
              </span>
              <strong>{money(cafe.revenue)}</strong>
            </div>
          ))}
          {!report.cafes.length && <p className="muted">در این بازه سفارشی ثبت نشده است.</p>}
        </section>
        <section className="panel">
          <h3>پرفروش‌ترین اقلام منو</h3>
          <p className="muted">مبلغ اقلام سفارش‌های تکمیل‌شده پیش از تخفیف</p>
          {report.products.map((item) => (
            <div className="list-row" key={item.name}>
              <span>
                {item.name}
                <br />
                <small>{digits(item.quantity)} عدد</small>
              </span>
              <strong>{money(item.revenue)}</strong>
            </div>
          ))}
          {!report.products.length && (
            <p className="muted">در این بازه قلمی از منو فروخته نشده است.</p>
          )}
        </section>
        <section className="panel">
          <h3>وضعیت سفارش‌های بازه</h3>
          {report.statuses.map((row) => (
            <div className="list-row" key={row.status}>
              <Badge status={row.status} />
              <strong>{digits(row.count)} سفارش</strong>
            </div>
          ))}
          {!report.statuses.length && <p className="muted">در این بازه سفارشی ثبت نشده است.</p>}
        </section>
        <section className="panel">
          <h3>آخرین فعالیت‌ها</h3>
          {report.recent.map((item) => (
            <div className="list-row" key={item.kind + item.id}>
              <span>
                <Link
                  className="text-link"
                  href={
                    item.kind === 'tickets'
                      ? '/support/' + encodeURIComponent(item.id)
                      : item.kind === 'users'
                        ? '/admin/users/' + encodeURIComponent(item.id)
                        : '/admin/' + item.kind
                  }
                >
                  {activityLabels[item.kind]} · {item.name}
                </Link>
              </span>
              <small>{dateLabel(item.at, true)}</small>
            </div>
          ))}
          {!report.recent.length && <p className="muted">فعالیتی ثبت نشده است.</p>}
        </section>
      </div>
    </section>
  );
}
