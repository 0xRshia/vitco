'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  Coffee,
  Mail,
  Smartphone,
  Eye,
  EyeOff,
  Check,
  UserRound,
  MapPin,
  CalendarCheck,
  Heart,
  ReceiptText,
  CreditCard,
  Gift,
  Settings,
  Headphones,
  LogOut,
  Plus,
  Pencil,
  Trash2,
  LocateFixed,
  Moon,
  Sun,
  Bell,
  ShieldCheck,
  Upload,
  Store,
  LockKeyhole,
  ArrowUpLeft,
} from 'lucide-react';
import { api, useApp, useResource } from '@/lib/client';
import { digits, dateLabel, latin } from '@/lib/format';
import type { Address, Ticket } from '@/lib/types';
import {
  PageTitle,
  Empty,
  Loading,
  ErrorBox,
  Field,
  Submit,
  Modal,
  Confirm,
  LoginGate,
  Form,
} from './ui';

export function AuthView({ page }: { page: string }) {
  const router = useRouter(),
    query = useSearchParams();
  const { data, refresh } = useApp();
  const [method, setMethod] = useState('email'),
    [email, setEmail] = useState(query.get('email') || ''),
    [phone, setPhone] = useState(query.get('phone') || ''),
    [password, setPassword] = useState(''),
    [name, setName] = useState(''),
    [code, setCode] = useState(''),
    [visible, setVisible] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [accepted, setAccepted] = useState(false);
  const register = page === 'register',
    verify = page === 'verify',
    forgot = page === 'forgot-password',
    reset = page === 'reset-password';
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (register) {
        if (!accepted) throw new Error('برای ساخت حساب، شرایط استفاده را بپذیرید.');
        await api('auth/register', 'POST', { email, password, name });
        await refresh();
        router.push('/profile');
      } else if (verify) {
        await api('auth/verify', 'POST', { phone, code });
        await refresh();
        router.push('/profile');
      } else if (forgot) {
        await api('auth/forgot', 'POST', { email });
        router.push('/reset-password?email=' + encodeURIComponent(email));
      } else if (reset) {
        await api('auth/reset', 'POST', { email, code, password });
        router.push('/login?reset=1');
      } else if (method === 'phone') {
        await api('auth/phone', 'POST', { phone });
        router.push('/verify?phone=' + encodeURIComponent(phone));
      } else {
        await api('auth/login', 'POST', { email, password });
        await refresh();
        router.push('/');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const title = register
    ? 'یک قرار تازه با ویترین'
    : verify
      ? 'کد تأیید را وارد کن'
      : forgot
        ? 'رمزت را فراموش کردی؟'
        : reset
          ? 'یک رمز تازه انتخاب کن'
          : 'خوش برگشتی!';
  return (
    <div className="auth-form">
      <span className="auth-icon">
        {verify ? (
          <Smartphone size={28} />
        ) : forgot || reset ? (
          <LockKeyhole size={28} />
        ) : (
          <Coffee size={28} />
        )}
      </span>
      <h1>{title}</h1>
      <p>
        {register
          ? 'حس خوب کافه‌گردی، از همین‌جا شروع می‌شود.'
          : verify
            ? `کد پیامک‌شده به ${digits(phone)} را وارد کنید.`
            : forgot
              ? 'ایمیلت را وارد کن تا کد بازیابی برایت ارسال شود.'
              : reset
                ? 'اگر این ایمیل در سامانه ثبت شده باشد، کد بازیابی برای آن ارسال می‌شود.'
                : 'وارد شو و قرارهای خوبت را ادامه بده.'}
      </p>
      {!register && !verify && !forgot && !reset && (
        <div className="segmented">
          <button className={method === 'email' ? 'active' : ''} onClick={() => setMethod('email')}>
            <Mail size={18} />
            با ایمیل
          </button>
          <button className={method === 'phone' ? 'active' : ''} onClick={() => setMethod('phone')}>
            <Smartphone size={18} />
            با شماره همراه
          </button>
        </div>
      )}
      {query.get('reset') && (
        <div className="success-note">
          <Check size={18} />
          رمز عبور تغییر کرد. وارد شوید.
        </div>
      )}
      <form onSubmit={submit} noValidate className="form">
        <fieldset disabled={busy}>
          {register && (
            <Field label="نام و نام خانوادگی">
              <input
                name="name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="دوست داریم با اسمت صدات کنیم"
              />
            </Field>
          )}
          {!verify && (method === 'email' || register || forgot || reset) && (
            <Field label="ایمیل">
              <input
                type="email"
                autoComplete="email"
                dir="auto"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ایمیل شما"
              />
            </Field>
          )}
          {!register && !forgot && !reset && method === 'phone' && (
            <Field label="شماره همراه">
              <div className="phone-input">
                <input
                  inputMode="tel"
                  autoComplete="tel"
                  dir="ltr"
                  value={phone}
                  onChange={(e) => setPhone(latin(e.target.value))}
                  placeholder="۰۹۱۲۳۴۵۶۷۸۹"
                />
                <span>ایران</span>
              </div>
            </Field>
          )}
          {(verify || reset) && (
            <Field label="کد تأیید شش‌رقمی">
              <input
                className="otp-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(latin(e.target.value))}
                placeholder="ـ ـ ـ ـ ـ ـ"
              />
            </Field>
          )}
          {!verify && !forgot && (method === 'email' || register || reset) && (
            <Field
              label={reset ? 'رمز عبور جدید' : 'رمز عبور'}
              hint={register || reset ? 'حداقل هشت نویسه' : ''}
            >
              <div className="password-input">
                <input
                  type={visible ? 'text' : 'password'}
                  autoComplete={register || reset ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="رمز عبور شما"
                />
                <button
                  type="button"
                  aria-label={visible ? 'پنهان کردن رمز' : 'نمایش رمز'}
                  onClick={() => setVisible(!visible)}
                >
                  {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </Field>
          )}
          {!register && !verify && !forgot && !reset && method === 'email' && (
            <Link className="text-link auth-forgot" href="/forgot-password">
              رمز عبورم را فراموش کرده‌ام
            </Link>
          )}
          {register && (
            <label className="check-row terms-check">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
              />
              <span>
                <Link href="/terms">شرایط استفاده</Link> و <Link href="/privacy">حریم خصوصی</Link>{' '}
                را می‌پذیرم.
              </span>
            </label>
          )}
          {method === 'phone' && !data?.smsAvailable && (
            <div className="notice">ورود پیامکی هنوز فعال نیست. می‌توانید با ایمیل وارد شوید.</div>
          )}
          {forgot && !data?.mailAvailable && (
            <div className="notice">سرویس ارسال ایمیل بازیابی هنوز فعال نشده است.</div>
          )}
          {error && <ErrorBox message={error} />}
          <button
            className="button primary full"
            disabled={
              busy ||
              (method === 'phone' && !data?.smsAvailable) ||
              (forgot && !data?.mailAvailable)
            }
            type="submit"
          >
            {busy
              ? 'در حال انجام…'
              : register
                ? 'ساخت حساب'
                : verify
                  ? 'تأیید و ورود'
                  : forgot
                    ? 'دریافت کد بازیابی'
                    : reset
                      ? 'ذخیره رمز جدید'
                      : method === 'phone'
                        ? 'دریافت کد ورود'
                        : 'ورود به ویترین'}
            <ArrowLeft size={18} />
          </button>
        </fieldset>
      </form>
      {verify ? (
        <div className="auth-bottom">
          <Link href="/login">اصلاح شماره همراه</Link>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api('auth/phone', 'POST', { phone });
                setError('');
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            ارسال دوباره کد
          </button>
        </div>
      ) : (
        <p className="auth-bottom">
          {register ? 'قبلاً عضو ویترین شدی؟' : 'هنوز حساب نداری؟'}
          <Link href={register ? '/login' : '/register'}>
            {register ? 'وارد شو' : 'ثبت‌نام در ویترین'}
          </Link>
        </p>
      )}
    </div>
  );
}
export async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.set('file', file);
  const response = await fetch('/api/upload', { method: 'POST', body: form });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data.url;
}
export function ImageUpload({
  value,
  onChange,
  label = 'تصویر',
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <div className="image-upload">
      {value && <img src={value} alt={label} />}
      <label className="button secondary">
        <Upload size={17} />
        {busy ? 'در حال بارگذاری…' : 'انتخاب ' + label}
        <input
          className="visually-hidden"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBusy(true);
            setError('');
            try {
              onChange(await uploadImage(file));
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      {value && (
        <button type="button" className="text-link" onClick={() => onChange('')}>
          حذف تصویر
        </button>
      )}
      <small>حداکثر پنج مگابایت</small>
      {error && <ErrorBox message={error} />}
    </div>
  );
}
export function ProfileView() {
  const { data, refresh, toast, setCart } = useApp(),
    router = useRouter();
  const [edit, setEdit] = useState(false),
    [logout, setLogout] = useState(false),
    [avatar, setAvatar] = useState(data?.user?.avatar || '');
  return (
    <>
      <PageTitle title="حساب من" description="قرارها، سلیقه‌ها و اطلاعات شما در یک‌جا." />
      <LoginGate>
        {data?.user && (
          <>
            <div className="profile-banner">
              <div className="avatar large">
                {data.user.avatar ? (
                  <img src={data.user.avatar} alt="تصویر حساب" />
                ) : (
                  <UserRound size={44} />
                )}
              </div>
              <div>
                <span className="eyebrow">همراه ویترین</span>
                <h2>{data.user.name}</h2>
                <p dir="auto">{data.user.email || digits(data.user.phone)}</p>
              </div>
              <button className="button secondary" onClick={() => setEdit(true)}>
                <Pencil size={16} />
                ویرایش پروفایل
              </button>
            </div>
            <div className="profile-links">
              {[
                {
                  href: '/orders',
                  icon: ReceiptText,
                  label: 'سفارش‌های من',
                  desc: 'پیگیری سفارش‌ها و تاریخچه',
                },
                {
                  href: '/reservations',
                  icon: CalendarCheck,
                  label: 'رزروهای من',
                  desc: 'قرارهای آینده و گذشته',
                },
                {
                  href: '/addresses',
                  icon: MapPin,
                  label: 'آدرس‌های من',
                  desc: 'مدیریت نشانی‌های تحویل',
                },
                {
                  href: '/favorites',
                  icon: Heart,
                  label: 'علاقه‌مندی‌ها',
                  desc: 'کافه‌هایی که دوست داری',
                },
                {
                  href: '/payment',
                  icon: CreditCard,
                  label: 'روش پرداخت',
                  desc: 'پرداخت در کافه یا هنگام تحویل',
                },
                {
                  href: '/rewards',
                  icon: Gift,
                  label: 'امتیازهای من',
                  desc: digits(data.user.points) + ' امتیاز همراهی',
                },
                {
                  href: '/dashboard',
                  icon: Store,
                  label: 'مدیریت کافه',
                  desc: 'کافه و منوی خودت را بساز',
                },
                {
                  href: '/settings',
                  icon: Settings,
                  label: 'تنظیمات',
                  desc: 'ظاهر برنامه و امنیت حساب',
                },
                {
                  href: '/support',
                  icon: Headphones,
                  label: 'پشتیبانی',
                  desc: 'همیشه راهی برای گفت‌وگو هست',
                },
              ].map((x) => (
                <Link key={x.href} href={x.href}>
                  <span className="action-icon peach">
                    <x.icon size={22} />
                  </span>
                  <div>
                    <h3>{x.label}</h3>
                    <p>{x.desc}</p>
                  </div>
                  <ChevronLeft size={18} />
                </Link>
              ))}
            </div>
            <button className="button danger-outline" onClick={() => setLogout(true)}>
              <LogOut size={18} />
              خروج از حساب
            </button>
            <Modal title="ویرایش پروفایل" open={edit} onClose={() => setEdit(false)}>
              <Form
                onSubmit={async (form) => {
                  await api('profile', 'PATCH', { name: form.get('name'), avatar });
                  await refresh();
                  setEdit(false);
                  toast('پروفایل به‌روز شد.');
                }}
              >
                <ImageUpload value={avatar} onChange={setAvatar} label="پروفایل" />
                <Field label="نام و نام خانوادگی">
                  <input name="name" defaultValue={data.user.name} />
                </Field>
                <Field label="ایمیل">
                  <input value={data.user.email} readOnly dir="auto" />
                </Field>
              </Form>
            </Modal>
            <Confirm
              open={logout}
              title="از حساب خارج می‌شوی؟"
              description="برای دیدن سفارش‌ها و رزروها می‌توانی دوباره وارد شوی."
              onClose={() => setLogout(false)}
              onConfirm={async () => {
                try {
                  await api('auth/logout', 'POST', {});
                  setCart([]);
                  await refresh();
                  router.push('/');
                } catch (e) {
                  toast((e as Error).message);
                }
              }}
            />
          </>
        )}
      </LoginGate>
    </>
  );
}
export function SettingsView() {
  const { theme, setTheme, data, toast } = useApp();
  const [success, setSuccess] = useState(false);
  return (
    <>
      <PageTitle title="تنظیمات" description="ویترین را به سلیقه خودت بچین." />
      <div className="two-columns">
        <section className="panel form">
          <h2>ظاهر برنامه</h2>
          <p className="muted">حالت دلخواهت را انتخاب کن.</p>
          <div className="theme-options">
            <button
              className={theme === 'light' ? 'selected' : ''}
              onClick={() => setTheme('light')}
            >
              <Sun size={28} />
              روشن{theme === 'light' && <Check size={17} />}
            </button>
            <button className={theme === 'dark' ? 'selected' : ''} onClick={() => setTheme('dark')}>
              <Moon size={28} />
              تیره{theme === 'dark' && <Check size={17} />}
            </button>
          </div>
          <div className="list-row">
            <span>زبان برنامه</span>
            <strong>فارسی</strong>
          </div>
          <div className="list-row">
            <span>واحد قیمت</span>
            <strong>تومان</strong>
          </div>
          <div className="list-row">
            <span>تقویم</span>
            <strong>هجری شمسی</strong>
          </div>
        </section>
        <section className="panel form">
          <h2>امنیت حساب</h2>
          {data?.user?.email ? (
            <Form
              onSubmit={async (form) => {
                if (form.get('password') !== form.get('confirm'))
                  throw new Error('تکرار رمز با رمز جدید یکسان نیست.');
                await api('password', 'PATCH', {
                  current: form.get('current'),
                  password: form.get('password'),
                });
                setSuccess(true);
                toast('رمز عبور با موفقیت تغییر کرد.');
              }}
            >
              <Field label="رمز عبور فعلی">
                <input type="password" name="current" autoComplete="current-password" />
              </Field>
              <Field label="رمز عبور جدید">
                <input type="password" name="password" autoComplete="new-password" />
              </Field>
              <Field label="تکرار رمز جدید">
                <input type="password" name="confirm" autoComplete="new-password" />
              </Field>
              {success && <div className="success-note">رمز عبور تغییر کرد.</div>}
            </Form>
          ) : (
            <p className="muted">برای مدیریت امنیت، با حساب ایمیل وارد شوید.</p>
          )}
        </section>
      </div>
    </>
  );
}
export function AddressView() {
  const { data: app, toast } = useApp();
  const resource = useResource<{ addresses: Address[] }>(app?.user ? 'addresses' : null);
  const [editing, setEditing] = useState<Address | null | undefined>(undefined),
    [removing, setRemoving] = useState<Address | null>(null),
    [coordinates, setCoordinates] = useState<{ latitude: number | null; longitude: number | null }>(
      { latitude: null, longitude: null },
    ),
    [locating, setLocating] = useState(false);
  async function locate() {
    if (!navigator.geolocation) {
      toast('موقعیت مکانی در این مرورگر در دسترس نیست.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoordinates({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocating(false);
        toast('موقعیت دریافت شد. نشانی را نیز تکمیل کنید.');
      },
      () => {
        toast('موقعیت دریافت نشد. نشانی را دستی وارد کنید.');
        setLocating(false);
      },
      { timeout: 10000 },
    );
  }
  return (
    <>
      <PageTitle
        title="آدرس‌های من"
        description="نشانی‌های آشنا، برای سفارش‌های خوش‌طعم."
        action={
          app?.user && (
            <button
              className="button primary"
              onClick={() => {
                setEditing(null);
                setCoordinates({ latitude: null, longitude: null });
              }}
            >
              <Plus size={18} />
              آدرس جدید
            </button>
          )
        }
      />
      <LoginGate>
        {resource.loading ? (
          <Loading />
        ) : resource.error ? (
          <ErrorBox message={resource.error} />
        ) : resource.data?.addresses.length ? (
          <div className="address-grid">
            {resource.data.addresses.map((a) => (
              <article key={a.id} className="address-card panel">
                <div className="card-heading">
                  <span className="action-icon peach">
                    <MapPin size={22} />
                  </span>
                  {a.is_default && <span className="badge status-confirmed">آدرس پیش‌فرض</span>}
                </div>
                <h3>{a.title}</h3>
                <p>
                  {a.city}، {a.street}
                </p>
                <small>
                  {a.receiver} · {digits(a.phone)}
                </small>
                <div className="card-bottom">
                  <button
                    className="text-link"
                    onClick={() => {
                      setEditing(a);
                      setCoordinates({ latitude: a.latitude, longitude: a.longitude });
                    }}
                  >
                    <Pencil size={16} />
                    ویرایش
                  </button>
                  <button className="text-link danger-text" onClick={() => setRemoving(a)}>
                    <Trash2 size={16} />
                    حذف
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            title="اولین نشانی‌ات را اضافه کن"
            description="خانه، محل کار یا هر جایی که دوست داری سفارشت را تحویل بگیری."
          />
        )}
      </LoginGate>
      <Modal
        open={editing !== undefined}
        title={editing ? 'ویرایش آدرس' : 'یک نشانی تازه'}
        onClose={() => setEditing(undefined)}
      >
        {editing !== undefined && (
          <Form
            key={editing?.id || 'new'}
            onSubmit={async (form) => {
              await api('addresses' + (editing ? '/' + editing.id : ''), editing ? 'PUT' : 'POST', {
                ...Object.fromEntries(form),
                ...coordinates,
                is_default: form.get('is_default') === 'on',
              });
              setEditing(undefined);
              resource.reload();
              toast('آدرس ذخیره شد.');
            }}
          >
            <button
              type="button"
              className="button secondary full"
              onClick={locate}
              disabled={locating}
            >
              <LocateFixed size={19} />
              {locating ? 'در حال دریافت موقعیت…' : 'استفاده از موقعیت فعلی'}
            </button>
            {coordinates.latitude !== null && (
              <div className="success-note">
                <Check size={17} />
                موقعیت روی نقشه دریافت شد.
                <a
                  target="_blank"
                  rel="noreferrer"
                  href={`https://www.openstreetmap.org/?mlat=${coordinates.latitude}&mlon=${coordinates.longitude}#map=17/${coordinates.latitude}/${coordinates.longitude}`}
                >
                  مشاهده نقشه
                </a>
              </div>
            )}
            <Field label="عنوان آدرس">
              <input
                name="title"
                defaultValue={editing?.title}
                placeholder="مثلاً خانه یا محل کار"
              />
            </Field>
            <Field label="شهر">
              <input name="city" defaultValue={editing?.city} />
            </Field>
            <Field label="نشانی کامل">
              <textarea
                name="street"
                defaultValue={editing?.street}
                placeholder="خیابان، کوچه، پلاک و واحد"
              />
            </Field>
            <div className="form-grid">
              <Field label="نام گیرنده">
                <input name="receiver" defaultValue={editing?.receiver || app?.user?.name} />
              </Field>
              <Field label="شماره همراه گیرنده">
                <input name="phone" inputMode="tel" defaultValue={editing?.phone} dir="auto" />
              </Field>
            </div>
            <Field label="کد پستی (اختیاری)">
              <input
                name="postal_code"
                inputMode="numeric"
                maxLength={10}
                defaultValue={editing?.postal_code}
              />
            </Field>
            <label className="check-row">
              <input
                type="checkbox"
                name="is_default"
                defaultChecked={editing?.is_default || !resource.data?.addresses.length}
              />
              این نشانی، آدرس پیش‌فرض من باشد
            </label>
          </Form>
        )}
      </Modal>
      <Confirm
        open={Boolean(removing)}
        title="این آدرس حذف شود؟"
        description="سفارش‌های قبلی شما تغییری نمی‌کنند."
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          try {
            await api('addresses/' + removing?.id, 'DELETE');
            setRemoving(null);
            resource.reload();
            toast('آدرس حذف شد.');
          } catch (e) {
            toast((e as Error).message);
          }
        }}
      />
    </>
  );
}
export function PaymentView() {
  return (
    <>
      <PageTitle title="روش پرداخت" description="شفاف، ساده و در زمان تحویل." />
      <div className="panel narrow form">
        <span className="action-icon sage">
          <CreditCard size={28} />
        </span>
        <h2>پرداخت در کافه یا هنگام تحویل</h2>
        <p>
          مبلغ نهایی سفارش در زمان ثبت نمایش داده می‌شود. هزینه را مستقیماً به کافه پرداخت می‌کنید.
        </p>
        <div className="option-row selected">
          <span>
            <Check size={20} />
            پرداخت هنگام دریافت سفارش
          </span>
          <span className="badge status-confirmed">فعال</span>
        </div>
        <div className="notice">
          <ShieldCheck size={22} />
          <span>اطلاعات کارت بانکی در ویترین دریافت یا ذخیره نمی‌شود.</span>
        </div>
        <Link className="button primary" href="/cart">
          بازگشت به سبد خرید
          <ArrowLeft size={17} />
        </Link>
      </div>
    </>
  );
}
export function RewardsView() {
  const { data } = useApp();
  return (
    <>
      <PageTitle
        title="امتیازهای همراهی"
        description="هر سفارش تکمیل‌شده، یک قدم به طعم بعدی نزدیک‌تر."
      />
      <LoginGate>
        <section className="rewards-card">
          <span className="eyebrow">باشگاه همراهان ویترین</span>
          <div>
            <strong>{digits(data?.user?.points || 0)}</strong>
            <Gift size={40} />
          </div>
          <p>امتیاز قابل استفاده</p>
        </section>
        <div className="panel prose">
          <h2>امتیازها چطور کار می‌کنند؟</h2>
          <p>
            به ازای هر ده هزار تومان از مبلغ نهایی سفارش تکمیل‌شده، یک امتیاز به حساب شما اضافه
            می‌شود.
          </p>
          <p>
            هر امتیاز، هزار تومان از قیمت محصولات سفارش بعدی در همان کافه کم می‌کند. امتیاز برای
            هزینه ارسال قابل استفاده نیست و هنگام ثبت سفارش از حساب کسر می‌شود.
          </p>
          <p>اگر سفارش لغو شود، امتیازهای مصرف‌شده به حسابتان برمی‌گردد.</p>
          {data?.rewards.map((reward) => (
            <div className="list-row" key={reward.cafe_id}>
              <Link href={'/cafes/' + reward.cafe_id}>{reward.cafe_name}</Link>
              <strong>{digits(reward.points)} امتیاز</strong>
            </div>
          ))}
          <Link className="button primary" href="/menu">
            دیدن منوی کافه‌ها
            <ArrowLeft size={17} />
          </Link>
        </div>
      </LoginGate>
    </>
  );
}
export function NotificationsView() {
  const { data, refresh, toast } = useApp();
  return (
    <>
      <PageTitle
        title="خبرهای ویترین"
        description="آخرین وضعیت سفارش‌ها، رزروها و قرارهای شما."
        action={
          Boolean(data?.notifications.some((n) => !n.read)) && (
            <button
              className="button secondary"
              onClick={async () => {
                try {
                  await api('notifications', 'PATCH', {});
                  await refresh();
                } catch (e) {
                  toast((e as Error).message);
                }
              }}
            >
              <Check size={17} />
              همه را خواندم
            </button>
          )
        }
      />
      <LoginGate>
        {data?.notifications.length ? (
          <div className="panel notification-list">
            {data.notifications.map((n) => (
              <Link
                key={n.id}
                href={n.href}
                className={'notification-row ' + (!n.read ? 'unread' : '')}
              >
                <span className="action-icon peach">
                  <Bell size={21} />
                </span>
                <div>
                  <h3>{n.title}</h3>
                  <p>{n.body}</p>
                  <small>{dateLabel(n.created_at, true)}</small>
                </div>
                <ChevronLeft size={17} />
              </Link>
            ))}
          </div>
        ) : (
          <Empty
            title="هنوز خبر تازه‌ای نیست"
            description="وقتی وضعیت سفارش یا رزروت تغییر کند، اینجا باخبر می‌شوی."
          />
        )}
      </LoginGate>
    </>
  );
}
export function SupportView() {
  const { data: app, toast } = useApp(),
    query = useSearchParams();
  const resource = useResource<{ tickets: Ticket[] }>(app?.user ? 'tickets' : null);
  const [tab, setTab] = useState('new');
  return (
    <>
      <PageTitle
        title="کنار شما هستیم"
        description="سؤالت را بپرس یا درخواستت را با ما در میان بگذار."
      />
      <LoginGate>
        <div className="tabs">
          <button className={tab === 'new' ? 'active' : ''} onClick={() => setTab('new')}>
            درخواست جدید
          </button>
          <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
            درخواست‌های من
          </button>
        </div>
        {tab === 'new' ? (
          <div className="two-columns">
            <section className="panel">
              <Form
                onSubmit={async (form) => {
                  await api('tickets', 'POST', {
                    subject: form.get('subject'),
                    body: form.get('body'),
                    order_id: query.get('order') || '',
                  });
                  resource.reload();
                  setTab('history');
                  toast('درخواست شما ثبت شد.');
                }}
              >
                <Field label="موضوع درخواست">
                  <input name="subject" placeholder="موضوع را کوتاه بنویسید" />
                </Field>
                <Field label="پیام شما">
                  <textarea
                    name="body"
                    rows={6}
                    placeholder="جزئیات بیشتر کمک می‌کند بهتر راهنمایی‌تان کنیم…"
                    maxLength={3000}
                  />
                </Field>
                {query.get('order') && (
                  <div className="notice">این درخواست به سفارش انتخاب‌شده پیوند می‌خورد.</div>
                )}
              </Form>
            </section>
            <div className="support-note">
              <Headphones size={40} />
              <h2>راهی برای گفت‌وگو</h2>
              <p>
                درخواست‌ها در حساب شما ذخیره می‌شوند. پیام‌های مربوط به سفارش در پنل همان کافه نیز
                نمایش داده می‌شوند.
              </p>
              <Link href="/orders" className="text-link">
                پیگیری سفارش
                <ArrowLeft size={17} />
              </Link>
              <Link href="/terms" className="text-link">
                شرایط سفارش و رزرو
                <ArrowLeft size={17} />
              </Link>
            </div>
          </div>
        ) : resource.loading ? (
          <Loading />
        ) : resource.error ? (
          <ErrorBox message={resource.error} />
        ) : resource.data?.tickets.length ? (
          <div className="stack">
            {resource.data.tickets.map((t) => (
              <article key={t.id} className="panel">
                <div className="card-heading">
                  <h3>{t.subject}</h3>
                  <span className="badge">
                    {t.status === 'answered' ? 'پاسخ داده شده' : 'ثبت شده'}
                  </span>
                </div>
                <p>{t.body}</p>
                <small className="muted">{dateLabel(t.created_at, true)}</small>
                {t.replies.map((reply) => (
                  <div className="ticket-reply" key={reply.id}>
                    <strong>{reply.name}</strong>
                    <p>{reply.body}</p>
                    <small>{dateLabel(reply.created_at, true)}</small>
                  </div>
                ))}
              </article>
            ))}
          </div>
        ) : (
          <Empty
            title="درخواستی ثبت نکرده‌ای"
            description="هر زمان به راهنمایی نیاز داشتی، از بخش درخواست جدید پیام بفرست."
          />
        )}
      </LoginGate>
    </>
  );
}
