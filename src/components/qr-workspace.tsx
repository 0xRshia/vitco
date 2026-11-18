'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api, useApp, useResource } from '@/lib/client';
import { dateLabel, digits } from '@/lib/format';
import type { qrScanHistory, QrTarget } from '@/lib/qr-activity';
import type { QrMapping } from '@/lib/qr-mappings';
import type { CafeTable, TableState } from '@/lib/types';
import { PersianDateInput } from './persian-date';
import { Confirm, ErrorBox, Field, Form, Loading } from './ui';

const targets: Record<QrTarget, string> = {
  menu: 'منوی کافه',
  reservation: 'رزرو میز',
  table: 'سفارش از میز',
  cashier: 'درخواست صندوق‌دار',
};
const tableStates: Record<TableState, string> = {
  available: 'آزاد',
  occupied: 'اشغال',
  reserved: 'رزروشده',
  disabled: 'خارج از سرویس',
};
export function TableStatusControl({
  table,
  save,
}: {
  table: CafeTable & { state: TableState };
  save: (state: TableState) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <>
      <Field label={'وضعیت ' + table.name}>
        <select
          value={table.state}
          disabled={busy || table.enabled === false}
          onChange={async (event) => {
            const state = event.target.value as TableState;
            setBusy(true);
            setError('');
            try {
              await save(state);
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {Object.entries(tableStates).map(([state, label]) => (
            <option key={state} value={state}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      {error && <ErrorBox message={error} />}
    </>
  );
}

export function QrWorkspace({
  id,
  tables,
  onSaved,
}: {
  id: string;
  tables: (CafeTable & { state: TableState })[];
  onSaved: () => void;
}) {
  const path = 'operations/' + id + '/qr-mappings';
  const menuQr = '/api/operations/' + id + '/qr';
  const mappings = useResource<{ mappings: QrMapping[] }>(path);
  const { toast } = useApp();
  const [target, setTarget] = useState<QrTarget>('menu');
  const [remove, setRemove] = useState<QrMapping | null>(null);
  const [error, setError] = useState('');
  const [formRevision, setFormRevision] = useState(0);
  const [range, setRange] = useState('');
  const activity = useResource<ReturnType<typeof qrScanHistory>>(
    'operations/' + id + '/qr-activity' + range,
  );
  async function save(payload: Record<string, unknown>) {
    setError('');
    await api(path, 'POST', payload);
    mappings.reload();
    onSaved();
    toast('کد QR به‌روز شد.');
  }
  return (
    <div className="stack">
      <section className="panel stack">
        <h2>کد QR منوی شعبه</h2>
        <img className="service-qr" src={menuQr} alt="کد QR منو" width={192} height={192} />
        <div className="button-row">
          <a className="button secondary" href={menuQr} download="vitco-menu.svg">
            دریافت کد منو برای چاپ
          </a>
          <Link className="text-link" target="_blank" href={'/cafes/' + id}>
            باز کردن منو
          </Link>
        </div>
      </section>
      <div className="service-card-grid">
        <Form
          className="panel"
          key={formRevision}
          onSubmit={async (form) => {
            await save({ ...Object.fromEntries(form), target });
            setFormRevision((revision) => revision + 1);
          }}
        >
          <h2>ثبت QR چاپ‌شده</h2>
          <Field
            label="پیوند داخل کد"
            hint="نشانی‌ای را وارد کنید که با اسکن کد چاپ‌شده دیده می‌شود."
          >
            <input name="url" dir="ltr" placeholder="https://" required />
          </Field>
          <Field label="مقصد کد">
            <select value={target} onChange={(event) => setTarget(event.target.value as QrTarget)}>
              {Object.entries(targets).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          {(target === 'table' || target === 'cashier') && (
            <Field label="میز مقصد">
              <select name="table_id">
                <option value="">انتخاب میز</option>
                {tables
                  .filter((table) => table.state !== 'disabled')
                  .map((table) => (
                    <option key={table.id} value={table.id}>
                      {table.name}
                    </option>
                  ))}
              </select>
            </Field>
          )}
        </Form>
        <section className="panel stack">
          <h2>کدهای ثبت‌شده</h2>
          {(mappings.error || error) && (
            <ErrorBox message={mappings.error || error} retry={mappings.reload} />
          )}
          {mappings.loading && !mappings.data && <Loading />}
          {mappings.data?.mappings.length === 0 && <p>هیچ پیوندی ثبت نشده است.</p>}
          {mappings.data?.mappings.map((mapping) => (
            <div className="list-row service-inline" key={mapping.id}>
              <div className="service-body">
                <bdi>{mapping.display_url}</bdi>
                <p>
                  {targets[mapping.target]}
                  {mapping.table_id &&
                    ' · ' +
                      (tables.find((table) => table.id === mapping.table_id)?.name ||
                        'میز حذف شده')}
                </p>
              </div>
              <div className="service-inline">
                <button
                  type="button"
                  className="text-link"
                  onClick={() =>
                    void save({ id: mapping.id, enabled: !mapping.enabled }).catch((reason) =>
                      setError(reason.message),
                    )
                  }
                >
                  {mapping.enabled ? 'غیرفعال کردن' : 'فعال کردن'}
                </button>
                <button type="button" className="text-link" onClick={() => setRemove(mapping)}>
                  حذف
                </button>
              </div>
            </div>
          ))}
        </section>
      </div>
      <section className="panel stack">
        <h2>آمار اسکن‌ها</h2>
        {activity.error && <ErrorBox message={activity.error} retry={activity.reload} />}
        {activity.loading && !activity.data && <Loading />}
        {activity.data && (
          <>
            <Form
              onSubmit={async (form) => {
                setRange(
                  '?' +
                    new URLSearchParams({
                      from: String(form.get('from')),
                      to: String(form.get('to')),
                    }),
                );
              }}
            >
              <div className="form-grid">
                <Field label="شروع بازه">
                  <PersianDateInput name="from" defaultValue={activity.data.from} />
                </Field>
                <Field label="پایان بازه">
                  <PersianDateInput name="to" defaultValue={activity.data.to} />
                </Field>
              </div>
            </Form>
            <p>{digits(activity.data.total)} اسکن ثبت‌شده در این بازه</p>
            {activity.data.counts.length > 0 && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>روز</th>
                      <th>مقصد</th>
                      <th>میز</th>
                      <th>تعداد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.data.counts.map((row) => (
                      <tr key={row.day + row.target + row.table_id}>
                        <td>{dateLabel(row.day)}</td>
                        <td>{targets[row.target]}</td>
                        <td>{row.label || '–'}</td>
                        <td>{digits(row.count)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
      <Confirm
        open={Boolean(remove)}
        title="کد QR حذف شود؟"
        description="این پیوند دیگر به مقصد ثبت‌شده باز نمی‌شود."
        onClose={() => setRemove(null)}
        onConfirm={() => {
          if (!remove) return;
          setRemove(null);
          void save({ id: remove.id, remove: true }).catch((reason) => setError(reason.message));
        }}
      />
    </div>
  );
}
