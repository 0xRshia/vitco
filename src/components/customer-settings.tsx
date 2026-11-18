'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { api, useApp, useLiveResource } from '@/lib/client';
import type { customerSettings } from '@/lib/customer-settings';
import { dateLabel, digits } from '@/lib/format';
import { Confirm, ErrorBox, Field, Form, Loading } from './ui';

export const googleIssues: Record<string, string> = {
  cancelled: 'ورود با گوگل لغو شد.',
  session: 'نشست ورود منقضی شده است. دوباره تلاش کنید.',
  failed: 'ورود با گوگل انجام نشد. دوباره تلاش کنید.',
  email: 'ایمیل حساب گوگل تأیید نشده است.',
  existing: 'ابتدا وارد حساب ویتکو شوید و سپس از تنظیمات، گوگل را متصل کنید.',
  linked: 'این اتصال گوگل در حساب دیگری ثبت شده یا حساب در دسترس نیست.',
};
export function CustomerSettings() {
  const { data, refresh, toast } = useApp();
  const router = useRouter(),
    query = useSearchParams();
  const resource = useLiveResource<ReturnType<typeof customerSettings>>('preferences', 10000);
  const [phone, setPhone] = useState(''),
    [telegramUrl, setTelegramUrl] = useState(''),
    [close, setClose] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const preferences = resource.data;
  if (resource.loading) return <Loading />;
  if (!preferences)
    return (
      <ErrorBox message={resource.error || 'تنظیمات در دسترس نیست.'} retry={resource.reload} />
    );
  const linked = preferences.bot.linked_at;
  return (
    <div className="stack service-section">
      <div className="service-card-grid">
        <Form
          className="panel"
          key={String(preferences.reminders) + String(preferences.telegram)}
          onSubmit={async (f) => {
            await api('preferences', 'PATCH', {
              reminders: f.get('reminders') === 'on',
              telegram: f.get('telegram') === 'on',
            });
            resource.reload();
            toast('تنظیمات اعلان‌ها ذخیره شد.');
          }}
        >
          <h2>تنظیمات اعلان‌ها</h2>
          <label className="check-row">
            <input type="checkbox" name="reminders" defaultChecked={preferences.reminders} />{' '}
            یادآوری رزرو، رویداد و دورهمی
          </label>
          {preferences.bot.available && (
            <label className="check-row">
              <input type="checkbox" name="telegram" defaultChecked={preferences.telegram} /> ارسال
              اعلان در تلگرام
            </label>
          )}
        </Form>
        <section className="panel stack">
          <h2>اتصال تلگرام</h2>
          {!preferences.bot.available ? (
            <p className="muted">سرویس تلگرام هنوز فعال نشده است.</p>
          ) : linked ? (
            <>
              <p>متصل از {dateLabel(linked)}</p>
              <button
                className="button secondary"
                onClick={async () => {
                  try {
                    await api('telegram', 'DELETE', {});
                    setTelegramUrl('');
                    resource.reload();
                  } catch (e) {
                    toast((e as Error).message);
                  }
                }}
              >
                قطع اتصال تلگرام
              </button>
            </>
          ) : (
            <>
              <p>برای دریافت اعلان در تلگرام، حساب خود را به ربات ویتکو متصل کنید.</p>
              <button
                className="button secondary"
                onClick={async () => {
                  try {
                    setTelegramUrl((await api<{ url: string }>('telegram', 'POST', {})).url);
                  } catch (e) {
                    toast((e as Error).message);
                  }
                }}
              >
                ساخت پیوند اتصال
              </button>
              {telegramUrl && (
                <a className="button primary" href={telegramUrl} target="_blank" rel="noreferrer">
                  باز کردن ربات تلگرام
                </a>
              )}
            </>
          )}
        </section>
        <section className="panel stack">
          <h2>شماره همراه حساب</h2>
          {data?.user?.phone && <p dir="ltr">{digits(data.user.phone)}</p>}
          {!data?.smsAvailable ? (
            <p className="muted">
              تغییر شماره با تأیید پیامکی انجام می‌شود. سرویس پیامک در دسترس نیست.
            </p>
          ) : phone ? (
            <Form
              key="verify"
              onSubmit={async (f) => {
                await api('profile/phone/verify', 'POST', { phone, code: f.get('code') });
                setPhone('');
                await refresh();
                toast('شماره همراه به‌روز شد.');
              }}
            >
              <Field label="کد تأیید شماره جدید">
                <input name="code" autoComplete="one-time-code" inputMode="numeric" maxLength={6} />
              </Field>
              <button className="text-link" type="button" onClick={() => setPhone('')}>
                ویرایش شماره
              </button>
            </Form>
          ) : (
            <Form
              key="request"
              onSubmit={async (f) => {
                const number = String(f.get('phone'));
                await api('profile/phone', 'POST', { phone: number });
                setPhone(number);
                toast('کد تأیید برای شماره جدید ارسال شد.');
              }}
            >
              <Field label="شماره همراه جدید">
                <input name="phone" autoComplete="tel" inputMode="tel" dir="ltr" />
              </Field>
            </Form>
          )}
        </section>
        <section className="panel stack">
          <h2>حساب گوگل</h2>
          {query.get('google') && (
            <ErrorBox message={googleIssues[query.get('google') || ''] || googleIssues.failed} />
          )}
          {preferences.google_linked ? (
            <p>حساب گوگل متصل است.</p>
          ) : data?.googleAvailable ? (
            <a className="button secondary" href="/api/auth/google?next=%2Fsettings">
              اتصال حساب گوگل
            </a>
          ) : (
            <p className="muted">سرویس ورود با گوگل هنوز فعال نشده است.</p>
          )}
        </section>
      </div>
      <OtherSessions />
      <details className="panel">
        <summary>بستن حساب کاربری</summary>
        <p className="muted">
          دسترسی به حساب پایان می‌یابد. رسیدها و سوابق سفارش برای رسیدگی مالی با نام ناشناس نگهداری
          می‌شوند.
        </p>
        <Form
          onSubmit={async (f) => {
            setError('');
            setClose(Object.fromEntries(f));
          }}
        >
          {preferences.password_set ? (
            <Field label="رمز فعلی">
              <input name="password" type="password" autoComplete="current-password" />
            </Field>
          ) : (
            <Field label="عبارت «بستن حساب»">
              <input name="confirm" />
            </Field>
          )}
        </Form>
        {error && <ErrorBox message={error} />}
      </details>
      <Confirm
        open={Boolean(close)}
        title="حساب کاربری بسته شود؟"
        description="با بستن حساب، ورود با این حساب و مشاهده سوابق از آن ممکن نخواهد بود."
        onClose={() => {
          if (!busy) setClose(null);
        }}
        onConfirm={async () => {
          if (!close || busy) return;
          setBusy(true);
          try {
            await api('profile', 'DELETE', close);
            await refresh();
            toast('حساب کاربری بسته شد.');
            router.push('/');
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setClose(null);
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

function OtherSessions() {
  const { toast } = useApp();
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  return (
    <section className="panel stack">
      <h2>نشست‌های حساب</h2>
      {error && <ErrorBox message={error} />}
      <div>
        <button className="button secondary" disabled={saving} onClick={() => setConfirm(true)}>
          خروج از دستگاه‌های دیگر
        </button>
      </div>
      <Confirm
        open={confirm}
        title="از دستگاه‌های دیگر خارج می‌شوی؟"
        description="برای استفاده در دستگاه‌های دیگر، باید دوباره وارد حساب شوی."
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          setConfirm(false);
          setSaving(true);
          setError('');
          try {
            const result = await api<{ revoked: number }>('auth/logout-others', 'POST', {});
            toast(result.revoked ? 'نشست‌های دیگر بسته شدند.' : 'نشست دیگری فعال نیست.');
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setSaving(false);
          }
        }}
      />
    </section>
  );
}
