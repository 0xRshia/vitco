'use client';
import Link from 'next/link';
import { useState } from 'react';
import { api, useApp, useLiveResource } from '@/lib/client';
import { dateLabel, digits, money } from '@/lib/format';
import type { CafeEvent } from '@/lib/types';
import type { eventGuests } from '@/lib/event-registration';
import { Confirm, Empty, ErrorBox, Loading, LoginGate, PageTitle } from './ui';

export const registrationLabels: Record<string, string> = {
  registered: 'ثبت‌نام شده',
  pending_payment: 'در انتظار پرداخت',
  attended: 'حضور ثبت شد',
  cancelled: 'لغو شده',
  expired: 'مهلت پرداخت گذشته است',
};
export function EventRegistrations() {
  const { data, refresh, toast } = useApp();
  const resource = useLiveResource<{ events: CafeEvent[] }>(
    data?.user ? 'registrations' : null,
    10000,
  );
  const [cancel, setCancel] = useState<CafeEvent | null>(null),
    [busy, setBusy] = useState(false);
  return (
    <div className="stack">
      <PageTitle title="ثبت‌نام‌های رویداد" back="/profile" />
      <LoginGate>
        {resource.loading ? (
          <Loading />
        ) : resource.error ? (
          <ErrorBox message={resource.error} retry={resource.reload} />
        ) : !resource.data?.events.length ? (
          <Empty
            title="هنوز ثبت‌نامی ثبت نشده است"
            description="از رویدادهای کافه‌ها دیدن کنید."
            href="/events"
            label="رویدادها"
          />
        ) : (
          <div className="service-card-grid">
            {resource.data.events.map((event) => (
              <article key={event.id} className="panel stack">
                <div className="card-heading">
                  <h2>{event.title}</h2>
                  <span className="badge">
                    {registrationLabels[event.registration_status || '']}
                  </span>
                </div>
                <p>
                  {event.cafe_name} · {dateLabel(event.date)} · {digits(event.time)}
                </p>
                {Boolean(event.price) && <strong>{money(event.price!)}</strong>}
                <div className="button-row">
                  {event.status !== 'cancelled' && (
                    <Link className="text-link" href={'/events/' + event.id}>
                      دیدن رویداد
                    </Link>
                  )}
                  {event.registration_order_id && (
                    <Link className="text-link" href={'/orders/' + event.registration_order_id}>
                      وضعیت پرداخت و رسید
                    </Link>
                  )}
                  {['registered', 'pending_payment', 'expired'].includes(
                    event.registration_status || '',
                  ) &&
                    Date.parse(event.date + 'T' + (event.end_time || event.time) + ':00+03:30') >
                      Date.now() && (
                      <button
                        className="button danger-outline"
                        disabled={busy}
                        onClick={() => setCancel(event)}
                      >
                        لغو ثبت‌نام
                      </button>
                    )}
                </div>
              </article>
            ))}
          </div>
        )}
      </LoginGate>
      <Confirm
        open={Boolean(cancel)}
        title="ثبت‌نام لغو شود؟"
        description={
          cancel?.price
            ? 'در صورت تأیید پرداخت، بازگشت وجه را از کافه پیگیری کنید.'
            : 'ظرفیت این رویداد آزاد می‌شود.'
        }
        onClose={() => setCancel(null)}
        onConfirm={async () => {
          if (!cancel || busy) return;
          setBusy(true);
          try {
            await api('events/' + cancel.id + '/leave', 'POST', {});
            setCancel(null);
            resource.reload();
            await refresh();
            toast('ثبت‌نام لغو شد.');
          } catch (e) {
            toast((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
export function EventRoster({ event }: { event: CafeEvent }) {
  const { toast } = useApp();
  const path = 'dashboard/events/' + event.id;
  const roster = useLiveResource<{ guests: ReturnType<typeof eventGuests> }>(path, 10000);
  return (
    <section className="stack">
      {roster.loading ? (
        <Loading />
      ) : roster.error ? (
        <ErrorBox message={roster.error} retry={roster.reload} />
      ) : !roster.data?.guests.length ? (
        <p className="muted">هنوز مهمانی ثبت‌نام نکرده است.</p>
      ) : (
        roster.data.guests.map((guest) => (
          <div className="list-row" key={guest.id}>
            <span>
              {guest.name} · {registrationLabels[guest.status]}
            </span>
            {guest.status === 'registered' &&
              Date.parse(event.date + 'T' + event.time + ':00+03:30') <= Date.now() && (
                <button
                  className="text-link"
                  onClick={async () => {
                    try {
                      await api(path, 'PATCH', { guest: guest.id });
                      roster.reload();
                    } catch (e) {
                      toast((e as Error).message);
                    }
                  }}
                >
                  ثبت حضور
                </button>
              )}
          </div>
        ))
      )}
    </section>
  );
}
