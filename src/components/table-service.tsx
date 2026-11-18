'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BellRing, QrCode } from 'lucide-react';
import { api, useLiveResource } from '@/lib/client';
import type { CashierCall, TableContext } from '@/lib/table-service';
import { ErrorBox, Loading, PageTitle } from './ui';

export const cashierLabels = {
  pending: 'در انتظار پاسخ صندوق',
  accepted: 'صندوق‌دار درخواست شما را پذیرفت',
  completed: 'درخواست انجام شد',
  cancelled: 'درخواست لغو شد',
};
export function TableLanding({ code }: { code: string }) {
  const router = useRouter();
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    api<{ table: TableContext }>('table/' + code, 'POST', {})
      .then(({ table }) => {
        if (active) router.replace('/cafes/' + table.cafe_id + '?tab=menu');
      })
      .catch((err) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [code, router]);
  return (
    <>
      <PageTitle title="ورود به میز کافه" back="/scan" />
      {error ? <ErrorBox message={error} /> : <Loading />}
    </>
  );
}
export function TableServicePanel({ cafeId }: { cafeId: string }) {
  const state = useLiveResource<{ table: TableContext | null; call: CashierCall | null }>(
    'table',
    7000,
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const table = state.data?.table,
    call = state.data?.call;
  if (!table || table.cafe_id !== cafeId) return null;
  const requested = call?.status === 'pending' || call?.status === 'accepted';
  return (
    <section id="table-service" className="panel service-table-banner" aria-label="سرویس میز">
      <QrCode size={23} />
      <div>
        <strong>{table.table_name}</strong>
        {table.vip && <span className="badge">میز ویژه</span>}
        <p>محصولات منو برای همین میز ثبت می‌شوند.</p>
        {call && <p role="status">{cashierLabels[call.status]}</p>}
        {error && <ErrorBox message={error} />}
      </div>
      <button
        className="button secondary"
        disabled={busy || requested}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            await api('table/cashier', 'POST', {});
            state.reload();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <BellRing size={17} /> درخواست صندوق‌دار
      </button>
      <Link className="text-link" href={'/cart?cafe=' + encodeURIComponent(cafeId)}>
        دیدن سبد میز
      </Link>
    </section>
  );
}
