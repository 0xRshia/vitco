'use client';

import { useState } from 'react';
import { useResource } from '@/lib/client';
import type { PaymentActivity } from '@/lib/payment-activity';
import { dateLabel, money } from '@/lib/format';
import { paymentStatusLabels } from './payment-status';
import { ErrorBox, Field, Loading } from './ui';

const statuses: Record<PaymentActivity['status'], string> = {
  creating: 'در حال ایجاد',
  pending: 'در انتظار نتیجه',
  unknown: 'نتیجه نامشخص',
  paid: 'تأییدشده',
  failed: 'ناموفق',
};
const orderKinds: Record<PaymentActivity['kind'], string> = {
  menu: 'سفارش منو',
  invoice: 'صورت‌حساب حضوری',
  event: 'بلیت رویداد',
};
export function PaymentActivityView({ id }: { id: string }) {
  const [status, setStatus] = useState('');
  const report = useResource<{ payments: PaymentActivity[] }>(
    'operations/' + id + '/payments' + (status ? '?status=' + status : ''),
  );
  return (
    <section className="panel stack">
      <h2>تراکنش‌های درگاه</h2>
      <Field label="وضعیت تراکنش">
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">همه وضعیت‌ها</option>
          {Object.entries(statuses).map(([key, title]) => (
            <option value={key} key={key}>
              {title}
            </option>
          ))}
        </select>
      </Field>
      {report.loading ? (
        <Loading />
      ) : report.error ? (
        <ErrorBox message={report.error} retry={report.reload} />
      ) : report.data?.payments.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>تاریخ</th>
                <th>سفارش</th>
                <th>مبلغ</th>
                <th>وضعیت</th>
                <th>شماره پیگیری</th>
              </tr>
            </thead>
            <tbody>
              {report.data.payments.map((row) => (
                <tr key={row.id}>
                  <td>{dateLabel(new Date(row.created_at).toISOString(), true)}</td>
                  <td>
                    {orderKinds[row.kind]} <bdi>{row.order_id.slice(0, 8)}</bdi>
                  </td>
                  <td>{money(row.amount_rial / 10)}</td>
                  <td>
                    {statuses[row.status]}
                    {!!row.sandbox && ' · آزمایشی'}
                    {row.status === 'paid' && row.payment_status === 'refund_required' && (
                      <p>{paymentStatusLabels.refund_required}</p>
                    )}
                  </td>
                  <td>
                    <bdi>{row.ref_id || '–'}</bdi>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>تراکنشی با این وضعیت پیدا نشد.</p>
      )}
    </section>
  );
}
