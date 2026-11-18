'use client';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { api, useApp, useResource } from '@/lib/client';
import { dateLabel, digits, money } from '@/lib/format';
import type { CafeFeatures, FeatureKey } from '@/lib/cafe-features';
import type {
  Article,
  ContactMessage,
  ManagedCafe,
  PlatformReview,
  PlatformUser,
  Testimonial,
} from '@/lib/platform';
import type { Order, Reservation, Ticket } from '@/lib/types';
import { ImageUpload } from './account';
import { paymentStatusLabels, paymentIsPending } from './payment-status';
import { Badge, Confirm, Empty, ErrorBox, Field, Form, Loading, LoginGate, PageTitle } from './ui';

const sections = [
  ['dashboard', 'خلاصه'],
  ['users', 'حساب‌ها'],
  ['cafes', 'کافه‌ها و امکانات'],
  ['orders', 'سفارش‌ها'],
  ['payments', 'پرداخت'],
  ['articles', 'مجله'],
  ['testimonials', 'تجربه مشتریان'],
  ['reviews', 'دیدگاه‌ها'],
  ['messages', 'پیام‌ها'],
  ['tickets', 'پشتیبانی'],
] as const;
const featureLabels: Record<FeatureKey, string> = {
  vip_cafe: 'نشان کافه ویژه',
  vip_tables: 'میز ویژه',
  vip_menu: 'منوی ویژه',
  tour: 'تور مجازی',
  recommendations: 'پیشنهاد مکمل سفارش',
};

type PanelData = {
  users?: PlatformUser[] | number;
  account?: PlatformUser;
  orders?:
    | number
    | Pick<
        Order,
        'id' | 'cafe_name' | 'kind' | 'status' | 'total' | 'payment_status' | 'created_at'
      >[];
  reservations?: Pick<Reservation, 'id' | 'cafe_name' | 'date' | 'time' | 'status' | 'guests'>[];
  cafes?: ManagedCafe[] | number;
  articles?: Article[];
  categories?: string[];
  testimonials?: Testimonial[];
  reviews?: PlatformReview[];
  messages?: ContactMessage[];
  tickets?: (Ticket & { customer_name: string })[];
  unread?: number;
  sales?: Order[];
  order?: Order;
  gateway?: { enabled: boolean; configured: boolean; sandbox: boolean };
};

export function PlatformAdminView({ section = 'dashboard' }: { section?: string }) {
  const { data } = useApp();
  if (!data?.user) return <LoginGate>{null}</LoginGate>;
  if (!data.platformAdmin) return <ErrorBox message="دسترسی میز مدیریت ویتکو مجاز نیست." />;
  const selected = sections.find(([path]) => path === section)?.[0] || 'dashboard';
  return (
    <>
      <PageTitle title="مدیریت ویتکو" />
      <nav className="service-admin-nav" aria-label="بخش‌های میز مدیریت">
        {sections.map(([path, label]) => (
          <Link
            key={path}
            href={'/admin/' + path}
            aria-current={path === selected ? 'page' : undefined}
            className={'button ' + (path === selected ? 'primary' : 'secondary')}
          >
            {label}
          </Link>
        ))}
      </nav>
      <PlatformPanel key={selected} section={selected} viewerId={data.user.id} />
    </>
  );
}

function PlatformPanel({
  section,
  viewerId,
}: {
  section: (typeof sections)[number][0];
  viewerId: string;
}) {
  const [query, setQuery] = useState(''),
    [selected, setSelected] = useState(''),
    [error, setError] = useState('');
  const [deletion, setDeletion] = useState<{ path: string; label: string } | null>(null);
  const { toast, refresh } = useApp();
  const path = section === 'dashboard' ? 'admin' : 'admin/' + section;
  const resource = useResource<PanelData>(
    path + (selected ? '/' + selected : query ? '?q=' + encodeURIComponent(query) : ''),
  );
  const data = resource.data;
  const save = async (path: string, method: string, input?: unknown) => {
    await api(path, method, input);
    toast('تغییر ثبت شد.');
    resource.reload();
  };
  const toggle = (path: string, input: unknown) => {
    setError('');
    void save(path, 'PATCH', input).catch((error) => setError(error.message));
  };
  if (resource.error) return <ErrorBox message={resource.error} retry={resource.reload} />;
  let panel: ReactNode;
  if (section === 'dashboard') {
    panel = (
      <div className="service-card-grid">
        {(
          [
            ['حساب‌های کاربری', data?.users, '/admin/users'],
            ['کافه‌های عضو', data?.cafes, '/admin/cafes'],
            ['سفارش‌ها', data?.orders, '/admin/orders'],
            ['پیام‌های خوانده‌نشده', data?.unread, '/admin/messages'],
          ] as const
        ).map(([label, count, href]) => (
          <div className="panel" key={label}>
            <p>
              {href ? (
                <Link className="text-link" href={href}>
                  {label}
                </Link>
              ) : (
                label
              )}
            </p>
            <h2>{digits(typeof count === 'number' ? count : 0)}</h2>
          </div>
        ))}
      </div>
    );
  } else if (section === 'users') {
    const account = data?.account;
    panel = selected ? (
      account?.id === selected && (
        <div className="panel">
          <button className="button secondary" onClick={() => setSelected('')}>
            بازگشت به حساب‌ها
          </button>
          <h2>{account.name}</h2>
          <p dir="auto">{account.email || account.phone}</p>
          <Form
            key={account.id}
            onSubmit={async (form) =>
              save(path + '/' + account.id, 'PATCH', { name: form.get('name') })
            }
          >
            <Field label="نام حساب">
              <input name="name" defaultValue={account.name} />
            </Field>
          </Form>
          {account.id !== viewerId && (
            <button
              className="button secondary"
              onClick={() => toggle(path + '/' + account.id, { suspended: !account.suspended })}
            >
              {account.suspended ? 'فعال‌سازی حساب' : 'تعلیق حساب'}
            </button>
          )}
          <h3 className="service-section">سفارش‌های اخیر</h3>
          {Array.isArray(data?.orders) &&
            data.orders.map((order) => (
              <div className="list-row" key={order.id}>
                <span>
                  {order.cafe_name} · {dateLabel(order.created_at)}
                </span>
                <strong>{money(order.total)}</strong>
                <Badge status={order.status} />
              </div>
            ))}
          <h3 className="service-section">رزروهای اخیر</h3>
          {data?.reservations?.map((booking) => (
            <div className="list-row" key={booking.id}>
              <span>
                {booking.cafe_name} · {dateLabel(booking.date)} · {digits(booking.time)}
              </span>
              <Badge status={booking.status} />
            </div>
          ))}
        </div>
      )
    ) : (
      <>
        <div className="panel">
          <Form onSubmit={async (form) => setQuery(String(form.get('q') || ''))}>
            <Field label="جستجو با نام، ایمیل یا شماره همراه">
              <input type="search" name="q" defaultValue={query} />
            </Field>
          </Form>
        </div>
        <div className="panel service-section">
          {Array.isArray(data?.users) &&
            data.users.map((account) => (
              <div className="list-row" key={account.id}>
                <span>
                  <strong>{account.name}</strong>
                  <br />
                  <bdi>{account.email || account.phone}</bdi>
                </span>
                <button className="button secondary" onClick={() => setSelected(account.id)}>
                  مشاهده حساب
                </button>
              </div>
            ))}
          {Array.isArray(data?.users) && !data.users.length && <p>حسابی پیدا نشد.</p>}
        </div>
      </>
    );
  } else if (section === 'cafes') {
    panel = (
      <div className="service-card-grid">
        {Array.isArray(data?.cafes) &&
          data.cafes.map((cafe) => (
            <section className="panel" key={cafe.id}>
              <h2>{cafe.name}</h2>
              <p className="muted">
                {cafe.city} · {cafe.owner_name}
              </p>
              <CafeEntitlements
                key={JSON.stringify(cafe.features)}
                features={cafe.features}
                save={(features) => save(path + '/' + cafe.id, 'PATCH', features)}
              />
            </section>
          ))}
        {Array.isArray(data?.cafes) && !data.cafes.length && (
          <Empty title="کافه‌ای برای مدیریت وجود ندارد." />
        )}
      </div>
    );
  } else if (section === 'payments') {
    const gateway = data?.gateway;
    panel = gateway && (
      <section className="panel">
        <h2>پذیرش پرداخت آنلاین</h2>
        <p>
          {gateway.configured
            ? gateway.sandbox
              ? 'زرین‌پال در حالت آزمایشی پیکربندی شده است.'
              : 'زرین‌پال برای پرداخت واقعی پیکربندی شده است.'
            : 'برای فعال شدن درگاه، تنظیمات پذیرنده و دسترسی کافه‌ها باید روی سرور وارد شود.'}
        </p>
        <p className="muted">پرداخت‌های در حال بررسی همچنان از طریق درگاه پیگیری می‌شوند.</p>
        <Form
          onSubmit={async (form) => {
            await save(path, 'PATCH', { enabled: form.has('enabled') });
            await refresh();
          }}
        >
          <label className="check-row">
            <input name="enabled" type="checkbox" defaultChecked={gateway.enabled} /> پذیرش پرداخت
            آنلاین جدید
          </label>
        </Form>
      </section>
    );
  } else if (section === 'orders') {
    const order = data?.order;
    panel = selected ? (
      order?.id === selected && (
        <AdminOrder
          order={order}
          back={() => setSelected('')}
          save={(input) => save(path + '/' + order.id, 'PATCH', input)}
        />
      )
    ) : (
      <>
        <div className="panel">
          <Form onSubmit={async (form) => setQuery(String(form.get('q') || ''))}>
            <Field label="جستجو با شناسه، نام مشتری یا نام کافه">
              <input type="search" name="q" defaultValue={query} />
            </Field>
          </Form>
        </div>
        <div className="panel service-section">
          {data?.sales?.map((sale) => (
            <div className="list-row" key={sale.id}>
              <span>
                <strong>{sale.cafe_name}</strong>
                <br />
                {sale.customer_name} · {money(sale.total)}
              </span>
              <Badge status={sale.status} />
              <button className="button secondary" onClick={() => setSelected(sale.id)}>
                مشاهده سفارش
              </button>
            </div>
          ))}
          {!data?.sales?.length && <p>سفارشی پیدا نشد.</p>}
        </div>
      </>
    );
  } else if (section === 'articles') {
    panel = (
      <ContentEditor
        articles={data?.articles || []}
        categories={data?.categories || []}
        save={save}
        remove={(path, label) => setDeletion({ path, label })}
      />
    );
  } else if (section === 'testimonials') {
    panel = (
      <TestimonialsEditor
        items={data?.testimonials || []}
        save={save}
        remove={(path, label) => setDeletion({ path, label })}
      />
    );
  } else if (section === 'reviews') {
    panel = (
      <div className="service-card-grid">
        {data?.reviews?.map((review) => (
          <article key={review.id} className="panel">
            <h3>{review.cafe_name}</h3>
            <p>
              {review.name} · {digits(review.rating)} از ۵
            </p>
            <p className="service-body">{review.body}</p>
            <button
              className="button secondary"
              onClick={() => toggle(path + '/' + review.id, { visible: !review.visible })}
            >
              {review.visible ? 'پنهان کردن دیدگاه' : 'نمایش دیدگاه'}
            </button>
          </article>
        ))}
        {!data?.reviews?.length && <Empty title="دیدگاهی ثبت نشده است." />}
      </div>
    );
  } else if (section === 'messages') {
    panel = (
      <div className="service-card-grid">
        {data?.messages?.map((message) => (
          <section key={message.id} className="panel">
            <p className="muted">
              {message.kind === 'partnership' ? 'درخواست همکاری' : 'تماس'} ·{' '}
              {dateLabel(message.created_at)}
            </p>
            <h3>{message.subject}</h3>
            <p>
              {message.name} · <bdi>{message.contact}</bdi>
            </p>
            <p className="service-body">{message.body}</p>
            <button
              className="button secondary"
              onClick={() => toggle(path + '/' + message.id, { read: !message.read })}
            >
              {message.read
                ? 'علامت‌گذاری به‌عنوان خوانده‌نشده'
                : 'علامت‌گذاری به‌عنوان خوانده‌شده'}
            </button>
          </section>
        ))}
        {!data?.messages?.length && <Empty title="پیامی ثبت نشده است." />}
      </div>
    );
  } else {
    panel = (
      <div className="panel">
        {data?.tickets?.map((ticket) => (
          <div key={ticket.id} className="list-row">
            <span>
              <strong>{ticket.subject}</strong>
              <br />
              {ticket.customer_name} · {dateLabel(ticket.created_at)}
            </span>
            <Badge status={ticket.status} />
            <Link className="button secondary" href={'/support/' + ticket.id}>
              گفت‌وگو
            </Link>
          </div>
        ))}
        {!data?.tickets?.length && <Empty title="درخواست پشتیبانی ثبت نشده است." />}
      </div>
    );
  }
  return (
    <>
      {error && <ErrorBox message={error} />}
      {resource.loading || !data ? <Loading /> : panel}
      <Confirm
        open={Boolean(deletion)}
        title="حذف مورد"
        description={deletion?.label || ''}
        onClose={() => setDeletion(null)}
        onConfirm={() => {
          if (!deletion) return;
          setDeletion(null);
          setError('');
          void save(deletion.path, 'DELETE').catch((error) => setError(error.message));
        }}
      />
    </>
  );
}

function AdminOrder({
  order,
  back,
  save,
}: {
  order: Order;
  back: () => void;
  save: (input: unknown) => Promise<void>;
}) {
  const transitions: Record<string, [string, string][]> = {
    pending: [
      ['approved', 'تأیید'],
      ['preparing', 'شروع آماده‌سازی'],
      ['rejected', 'رد'],
      ['cancelled', 'لغو'],
    ],
    approved: [
      ['preparing', 'شروع آماده‌سازی'],
      ['rejected', 'رد'],
      ['cancelled', 'لغو'],
    ],
    preparing: [
      [
        order.mode === 'delivery' ? 'delivering' : 'ready',
        order.mode === 'delivery' ? 'ارسال' : 'آماده تحویل',
      ],
      ['cancelled', 'لغو'],
    ],
    ready: [['completed', 'تکمیل']],
    delivering: [['completed', 'تکمیل']],
  };
  const options =
    paymentIsPending(order) || order.kind === 'event'
      ? []
      : (transitions[order.status] || []).filter(
          ([status]) =>
            status === 'cancelled' ||
            (order.kind === 'menu' &&
              (order.payment_method === 'offline' || order.payment_status === 'paid')),
        );
  const [status, setStatus] = useState('');
  return (
    <section className="panel stack">
      <div>
        <button className="button secondary" onClick={back}>
          بازگشت به سفارش‌ها
        </button>
      </div>
      <div className="card-heading">
        <h2>
          {order.cafe_name} · {order.customer_name}
        </h2>
        <Badge status={order.status} />
      </div>
      <p>
        {dateLabel(order.created_at, true)} · <bdi>{order.id}</bdi>
      </p>
      {order.table_name && <p>{order.table_name}</p>}
      {order.items.map((item) => (
        <div className="list-row" key={item.key}>
          <span>
            {digits(item.quantity)} × {item.name}
          </span>
          <strong>{money(item.price * item.quantity)}</strong>
        </div>
      ))}
      {order.note && <p className="service-body">{order.note}</p>}
      <p>
        {money(order.total)} ·{' '}
        {order.payment_method === 'offline'
          ? 'پرداخت در کافه'
          : paymentStatusLabels[order.payment_status]}
      </p>
      {order.payment_ref && (
        <p>
          شماره پیگیری <bdi>{order.payment_ref}</bdi>
        </p>
      )}
      {!!options.length && (
        <Form
          onSubmit={async (form) => {
            await save({ status, preparation_minutes: form.get('minutes') || undefined });
            setStatus('');
          }}
        >
          <Field label="تغییر وضعیت">
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">وضعیت جدید</option>
              {options.map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          {status === 'preparing' && (
            <Field label="زمان آماده‌سازی به دقیقه">
              <input name="minutes" type="number" min={1} max={240} />
            </Field>
          )}
        </Form>
      )}
    </section>
  );
}

function CafeEntitlements({
  features,
  save,
}: {
  features: CafeFeatures;
  save: (value: unknown) => Promise<void>;
}) {
  const [plan, setPlan] = useState(features.package);
  return (
    <Form
      onSubmit={async (form) =>
        save({
          package: plan,
          ...Object.fromEntries(
            Object.keys(featureLabels).map((key) => [key, plan === 'premium' && form.has(key)]),
          ),
        })
      }
    >
      <Field label="بسته امکانات">
        <select
          value={plan}
          onChange={(event) => setPlan(event.target.value as CafeFeatures['package'])}
        >
          <option value="basic">پایه</option>
          <option value="premium">پیشرفته</option>
        </select>
      </Field>
      {plan === 'premium' &&
        (Object.entries(featureLabels) as [FeatureKey, string][]).map(([key, label]) => (
          <label key={key} className="service-inline">
            <input name={key} type="checkbox" defaultChecked={features[key]} /> {label}
          </label>
        ))}
    </Form>
  );
}

type Save = (path: string, method: string, input: unknown) => Promise<void>;
type Remove = (path: string, label: string) => void;

function ContentEditor({
  articles,
  categories,
  save,
  remove,
}: {
  articles: Article[];
  categories: string[];
  save: Save;
  remove: Remove;
}) {
  const [editing, setEditing] = useState<string | null>(null),
    [category, setCategory] = useState('');
  const article = articles.find((item) => item.slug === editing);
  const encoded = category ? '/' + encodeURIComponent(category) : '';
  return (
    <div className="service-card-grid">
      <section className="panel">
        <h2>دسته‌بندی نوشته‌ها</h2>
        <Form
          key={category}
          onSubmit={async (form) => {
            await save('admin/categories' + encoded, category ? 'PUT' : 'POST', {
              name: form.get('name'),
            });
            setCategory('');
          }}
        >
          <Field label={category ? 'نام تازه' : 'نام دسته‌بندی جدید'}>
            <input name="name" defaultValue={category} />
          </Field>
        </Form>
        {categories.map((name) => (
          <div className="list-row" key={name}>
            <span>{name}</span>
            <div className="service-inline">
              <button className="button secondary" onClick={() => setCategory(name)}>
                ویرایش
              </button>
              <button
                className="text-link"
                onClick={() =>
                  remove(
                    'admin/categories/' + encodeURIComponent(name),
                    'دسته‌بندی «' + name + '» حذف شود؟',
                  )
                }
              >
                حذف
              </button>
            </div>
          </div>
        ))}
        <h2 className="service-section">نوشته‌ها</h2>
        <button className="button secondary" onClick={() => setEditing('')}>
          نوشته جدید
        </button>
        {articles.map((item) => (
          <div key={item.slug} className="list-row">
            <span>
              {item.title}
              <br />
              <small>{item.published ? 'منتشرشده' : 'پیش‌نویس'}</small>
            </span>
            <div className="service-inline">
              <button className="button secondary" onClick={() => setEditing(item.slug)}>
                ویرایش
              </button>
              <button
                className="text-link"
                onClick={() =>
                  remove(
                    'admin/articles/' + encodeURIComponent(item.slug),
                    'نوشته «' + item.title + '» حذف شود؟',
                  )
                }
              >
                حذف
              </button>
            </div>
          </div>
        ))}
      </section>
      {editing !== null && (
        <section className="panel">
          <h2>{article ? 'ویرایش نوشته' : 'نوشته جدید'}</h2>
          {categories.length ? (
            <ArticleForm
              key={editing}
              article={article}
              categories={categories}
              save={async (form) => {
                await save(
                  'admin/articles' + (article ? '/' + encodeURIComponent(article.slug) : ''),
                  article ? 'PUT' : 'POST',
                  form,
                );
                setEditing(null);
              }}
            />
          ) : (
            <p>برای ثبت نوشته دست‌کم یک دسته‌بندی بسازید.</p>
          )}
        </section>
      )}
    </div>
  );
}

function ArticleForm({
  article,
  categories,
  save,
}: {
  article?: Article;
  categories: string[];
  save: (value: unknown) => Promise<void>;
}) {
  const [image, setImage] = useState(article?.image || '');
  return (
    <Form
      onSubmit={async (form) =>
        save({ ...Object.fromEntries(form), image, published: form.has('published') })
      }
    >
      <Field label="عنوان">
        <input name="title" defaultValue={article?.title} />
      </Field>
      {!article && (
        <Field label="نشانی نوشته" hint="از خط تیره به جای فاصله استفاده کنید.">
          <input name="slug" dir="ltr" />
        </Field>
      )}
      <Field label="دسته‌بندی">
        <select name="category" defaultValue={article?.category}>
          {categories.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      </Field>
      <Field label="خلاصه">
        <textarea name="summary" rows={2} defaultValue={article?.summary} />
      </Field>
      <Field label="متن نوشته">
        <textarea name="body" rows={12} defaultValue={article?.body} />
      </Field>
      <ImageUpload value={image} onChange={setImage} label="تصویر نوشته" />
      <label className="service-inline">
        <input type="checkbox" name="published" defaultChecked={Boolean(article?.published)} />{' '}
        منتشر شود
      </label>
    </Form>
  );
}

function TestimonialsEditor({
  items,
  save,
  remove,
}: {
  items: Testimonial[];
  save: Save;
  remove: Remove;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const item = items.find((item) => item.id === editing);
  return (
    <div className="service-card-grid">
      <section className="panel">
        <button className="button secondary" onClick={() => setEditing('')}>
          تجربه جدید
        </button>
        {items.map((item) => (
          <div key={item.id} className="list-row">
            <span>
              {item.name}
              <br />
              <small>{item.visible ? 'منتشرشده' : 'پنهان'}</small>
            </span>
            <div className="service-inline">
              <button className="button secondary" onClick={() => setEditing(item.id)}>
                ویرایش
              </button>
              <button
                className="text-link"
                onClick={() =>
                  remove('admin/testimonials/' + item.id, 'تجربه «' + item.name + '» حذف شود؟')
                }
              >
                حذف
              </button>
            </div>
          </div>
        ))}
      </section>
      {editing !== null && (
        <section className="panel">
          <h2>{item ? 'ویرایش تجربه مشتری' : 'تجربه جدید'}</h2>
          <TestimonialForm
            key={editing}
            item={item}
            save={async (form) => {
              await save(
                'admin/testimonials' + (item ? '/' + item.id : ''),
                item ? 'PUT' : 'POST',
                form,
              );
              setEditing(null);
            }}
          />
        </section>
      )}
    </div>
  );
}

function TestimonialForm({
  item,
  save,
}: {
  item?: Testimonial;
  save: (value: unknown) => Promise<void>;
}) {
  const [image, setImage] = useState(item?.image || '');
  return (
    <Form
      onSubmit={async (form) =>
        save({ ...Object.fromEntries(form), image, visible: form.has('visible') })
      }
    >
      <Field label="نام مشتری">
        <input name="name" defaultValue={item?.name} />
      </Field>
      <Field label="عنوان">
        <input name="byline" defaultValue={item?.byline} />
      </Field>
      <Field label="نقل قول">
        <textarea name="body" rows={5} defaultValue={item?.body} />
      </Field>
      <ImageUpload value={image} onChange={setImage} />
      <label className="service-inline">
        <input name="visible" type="checkbox" defaultChecked={Boolean(item?.visible)} /> در صفحه
        درباره ما نمایش داده شود
      </label>
    </Form>
  );
}
