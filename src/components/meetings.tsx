'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { CalendarDays, MapPin, Users } from 'lucide-react';
import type { MeetingSummary, MeetingMessage } from '@/lib/meetings';
import { api, useApp, useLiveResource, useResource } from '@/lib/client';
import { dateLabel, digits, today } from '@/lib/format';
import { ErrorBox, Field, Form, Loading, LoginGate, PageTitle } from './ui';
import { PersianDateInput, PersianTimeInput } from './persian-date';

export const meetingPhase = {
  pending: 'در انتظار تأیید کافه',
  scheduled: 'برنامه‌ریزی شده',
  live: 'در حال برگزاری',
  ended: 'برگزار شده',
  rejected: 'رد شده',
  cancelled: 'لغو شده',
};

export function MeetingList({ meetings }: { meetings: MeetingSummary[] }) {
  if (!meetings.length) return <p className="notice">هنوز دورهمی‌ای در این بخش ثبت نشده است.</p>;
  return (
    <div className="service-card-grid">
      {meetings.map((meeting) => (
        <article className="panel stack" key={meeting.id}>
          <div className="card-heading">
            <h3>
              <Link href={'/meetings/' + meeting.id}>{meeting.title}</Link>
            </h3>
            <span className="badge">{meetingPhase[meeting.phase]}</span>
          </div>
          <p className="icon-text">
            <CalendarDays size={17} />
            {dateLabel(meeting.starts_at, true)}
          </p>
          {meeting.cafe_name && (
            <p className="icon-text">
              <MapPin size={17} />
              {meeting.cafe_name}
            </p>
          )}
          <p className="icon-text">
            <Users size={17} />
            {digits(meeting.members)} از {digits(meeting.capacity)} نفر
          </p>
          <Link className="text-link" href={'/meetings/' + meeting.id}>
            جزئیات دورهمی
          </Link>
        </article>
      ))}
    </div>
  );
}
export function CafeMeetings({ cafeId }: { cafeId: string }) {
  const resource = useResource<{ meetings: MeetingSummary[] }>(
    'meetings?cafe=' + encodeURIComponent(cafeId),
  );
  return (
    <section className="stack service-section">
      <div className="card-heading">
        <h2>دورهمی‌های کافه</h2>
        <Link className="text-link" href={'/meetings/new?cafe=' + encodeURIComponent(cafeId)}>
          پیشنهاد دورهمی
        </Link>
      </div>
      {resource.loading ? (
        <Loading />
      ) : resource.error ? (
        <ErrorBox message={resource.error} retry={resource.reload} />
      ) : (
        <MeetingList meetings={resource.data?.meetings || []} />
      )}
    </section>
  );
}
function tehranValue(value: string, time = false) {
  return new Intl.DateTimeFormat(time ? 'en-GB' : 'en-CA', {
    timeZone: 'Asia/Tehran',
    ...(time ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } : {}),
  }).format(new Date(value));
}
function MeetingEditor({ meeting, onSaved }: { meeting?: MeetingSummary; onSaved?: () => void }) {
  const { data, toast } = useApp();
  const router = useRouter(),
    query = useSearchParams();
  const cafes = data?.cafes.filter((cafe) => cafe.active && cafe.owner_id && !cafe.is_demo) ?? [];
  return (
    <Form
      className="panel"
      onSubmit={async (form) => {
        const result = await api<{ id: string }>(
          'meetings' + (meeting ? '/' + meeting.id : ''),
          meeting ? 'PUT' : 'POST',
          Object.fromEntries(form),
        );
        toast('دورهمی ذخیره شد.');
        if (onSaved) onSaved();
        else router.push('/meetings/' + result.id);
      }}
    >
      <Field label="عنوان دورهمی">
        <input name="title" defaultValue={meeting?.title} maxLength={120} />
      </Field>
      <Field label="توضیحات">
        <textarea name="description" defaultValue={meeting?.description} maxLength={2500} />
      </Field>
      {!meeting && (
        <Field label="کافه برگزاری">
          <select name="cafe_id" defaultValue={query.get('cafe') || ''}>
            <option value="">بدون کافه</option>
            {cafes.map((c) => (
              <option value={c.id} key={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className="form-grid service-field-grid">
        <Field label="روز برگزاری">
          <PersianDateInput
            name="date"
            defaultValue={meeting ? tehranValue(meeting.starts_at) : today()}
            min={today()}
          />
        </Field>
        <Field label="ساعت شروع">
          <PersianTimeInput
            name="time"
            defaultValue={meeting ? tehranValue(meeting.starts_at, true) : '18:00'}
          />
        </Field>
        <Field label="ساعت پایان">
          <PersianTimeInput
            name="end_time"
            defaultValue={meeting ? tehranValue(meeting.ends_at, true) : '20:00'}
          />
        </Field>
        <Field label="ظرفیت با احتساب میزبان">
          <input
            name="capacity"
            type="number"
            min="2"
            max="500"
            defaultValue={meeting?.capacity ?? 4}
          />
        </Field>
        <Field label="نوع نمایش">
          <select name="visibility" defaultValue={meeting?.visibility ?? 'public'}>
            <option value="public">عمومی</option>
            <option value="unlisted">فقط با پیوند</option>
            <option value="private">فقط با دعوت</option>
          </select>
        </Field>
      </div>
    </Form>
  );
}
function Chat({ meeting }: { meeting: MeetingSummary }) {
  const path = 'meetings/' + meeting.id + '/messages';
  const latest = useLiveResource<{ messages: MeetingMessage[] }>(path, 4000);
  const field = useRef<HTMLTextAreaElement>(null);
  const [older, setOlder] = useState<MeetingMessage[]>([]),
    [error, setError] = useState(''),
    [more, setMore] = useState(true),
    [busy, setBusy] = useState(false);
  const messages = [
    ...new Map([...older, ...(latest.data?.messages || [])].map((m) => [m.id, m])).values(),
  ].sort((a, b) => a.id - b.id);
  async function mutate(input: Record<string, unknown>) {
    await api(path, 'POST', input);
    if (input.hide) setOlder((previous) => previous.filter((message) => message.id !== input.hide));
    latest.reload();
  }
  if (latest.error) return <ErrorBox message={latest.error} retry={latest.reload} />;
  return (
    <section className="panel stack">
      <h2>گفتگوی دورهمی</h2>
      {error && <ErrorBox message={error} />}
      {older.length > 0 || (latest.data?.messages.length ?? 0) >= 50
        ? more && (
            <button
              type="button"
              className="text-link"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const response = await api<{ messages: MeetingMessage[] }>(
                    path + '?before=' + messages[0].id,
                  );
                  setOlder((previous) => [...response.messages, ...previous]);
                  setMore(response.messages.length === 50);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              دیدن پیام‌های قبلی
            </button>
          )
        : null}
      <div className="service-chat-list" aria-label="پیام‌های دورهمی">
        {!messages.length && <p className="muted">هنوز پیامی ثبت نشده است.</p>}
        {messages.map((m) => (
          <article key={m.id} className="list-row">
            <div>
              <strong>{m.name}</strong>
              <p className="service-body">{m.body}</p>
              <small className="muted">{dateLabel(m.created_at, true)}</small>
            </div>
            {(meeting.host || meeting.manager) && (
              <button
                type="button"
                className="text-link"
                onClick={async () => {
                  try {
                    await mutate({ hide: m.id });
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                پنهان کردن
              </button>
            )}
          </article>
        ))}
      </div>
      {['scheduled', 'live'].includes(meeting.phase) && (
        <Form
          onSubmit={async (form) => {
            await mutate({ body: form.get('body') });
            if (field.current) field.current.value = '';
          }}
        >
          <Field label="پیام تازه">
            <textarea ref={field} name="body" maxLength={2000} />
          </Field>
        </Form>
      )}
    </section>
  );
}
export function MeetingsView({ id }: { id?: string }) {
  const { data, toast } = useApp();
  const [mine, setMine] = useState(false),
    [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const history = useResource<{ meetings: MeetingSummary[] }>(
    id ? null : 'meetings' + (mine ? '?mine=1' : ''),
  );
  const detail = useLiveResource<{ meeting: MeetingSummary }>(
    id && id !== 'new' ? 'meetings/' + id : null,
  );
  if (id === 'new')
    return (
      <>
        <PageTitle title="ایجاد دورهمی" back="/meetings" />
        <LoginGate>
          <MeetingEditor />
        </LoginGate>
      </>
    );
  if (!id)
    return (
      <div className="stack">
        <PageTitle
          title="دورهمی‌ها"
          action={
            <Link className="button primary" href="/meetings/new">
              ایجاد دورهمی
            </Link>
          }
        />
        {data?.user && (
          <div className="tabs">
            <button
              aria-pressed={!mine}
              className={!mine ? 'active' : ''}
              onClick={() => setMine(false)}
            >
              عمومی
            </button>
            <button
              aria-pressed={mine}
              className={mine ? 'active' : ''}
              onClick={() => setMine(true)}
            >
              دورهمی‌های من
            </button>
          </div>
        )}
        {history.loading ? (
          <Loading />
        ) : history.error ? (
          <ErrorBox message={history.error} retry={history.reload} />
        ) : (
          <MeetingList meetings={history.data?.meetings || []} />
        )}
      </div>
    );
  if (detail.loading) return <Loading />;
  const meeting = detail.data?.meeting;
  if (!meeting)
    return <ErrorBox message={detail.error || 'دورهمی پیدا نشد.'} retry={detail.reload} />;
  const active = ['scheduled', 'live'].includes(meeting.phase);
  async function action(action: string, input: Record<string, unknown> = {}) {
    await api('meetings/' + id + '/' + action, 'POST', input);
    detail.reload();
    toast('وضعیت دورهمی به‌روز شد.');
  }
  async function simple(next: string) {
    setBusy(true);
    setError('');
    try {
      await action(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack">
      <PageTitle title={meeting.title} back="/meetings" />
      <section className="panel stack">
        <div className="card-heading">
          <strong>میزبان: {meeting.host_name}</strong>
          <span className="badge">{meetingPhase[meeting.phase]}</span>
        </div>
        <p className="service-body">{meeting.description}</p>
        <p className="icon-text">
          <CalendarDays size={18} />
          {dateLabel(meeting.starts_at, true)} تا{' '}
          {tehranValue(meeting.ends_at, true).replace(/\d/g, (d) => digits(d))}
        </p>
        {meeting.cafe_id && (
          <Link className="text-link" href={'/cafes/' + meeting.cafe_id}>
            {meeting.cafe_name}
          </Link>
        )}
        <p>
          {digits(meeting.members)} از {digits(meeting.capacity)} نفر
        </p>
        {meeting.reason && <p className="notice">{meeting.reason}</p>}
        {error && <ErrorBox message={error} />}
        <div className="button-row">
          {active &&
            !meeting.joined &&
            meeting.visibility !== 'private' &&
            (data?.user ? (
              <button
                disabled={busy || meeting.members >= meeting.capacity}
                className="button primary"
                onClick={() => void simple('join')}
              >
                پیوستن به دورهمی
              </button>
            ) : (
              <Link
                className="button primary"
                href={'/login?next=' + encodeURIComponent('/meetings/' + id)}
              >
                ورود و پیوستن
              </Link>
            ))}
          {active && meeting.joined && !meeting.host && (
            <button
              disabled={busy}
              className="button secondary"
              onClick={() => void simple('leave')}
            >
              خروج از دورهمی
            </button>
          )}
          {(meeting.host || meeting.manager) &&
            ['pending', 'scheduled'].includes(meeting.phase) && (
              <>
                <button className="button secondary" onClick={() => setEdit((v) => !v)}>
                  {edit ? 'بستن ویرایش' : 'ویرایش دورهمی'}
                </button>
                <button
                  disabled={busy}
                  className="button danger-outline"
                  onClick={() => void simple('cancel')}
                >
                  لغو دورهمی
                </button>
              </>
            )}
          {meeting.manager && meeting.phase === 'pending' && (
            <>
              <button
                disabled={busy}
                className="button primary"
                onClick={() => void simple('approve')}
              >
                تأیید دورهمی
              </button>
              <button
                disabled={busy}
                className="button secondary"
                onClick={() => void simple('reject')}
              >
                رد دورهمی
              </button>
            </>
          )}
        </div>
      </section>
      {edit && (
        <MeetingEditor
          meeting={meeting}
          onSaved={() => {
            setEdit(false);
            detail.reload();
          }}
        />
      )}
      {active && (meeting.host || meeting.manager) && (
        <details className="panel">
          <summary>مدیریت اعضا</summary>
          <Form
            onSubmit={async (form) =>
              action(String(form.get('action')), { contact: form.get('contact') })
            }
          >
            <Field label="ایمیل یا شماره همراه عضو">
              <input name="contact" dir="ltr" />
            </Field>
            <Field label="عملیات عضویت">
              <select name="action">
                <option value="invite">دعوت عضو</option>
                <option value="remove-member">حذف عضو</option>
              </select>
            </Field>
          </Form>
        </details>
      )}
      {data?.user &&
        (meeting.host || meeting.manager || (meeting.joined && meeting.status === 'scheduled')) && (
          <Chat meeting={meeting} />
        )}
    </div>
  );
}
