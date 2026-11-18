'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { api, useApp, useLiveResource, useResource } from '@/lib/client';
import { dateLabel, digits, statusLabels, today } from '@/lib/format';
import type {
  MenuCategory,
  ServiceLocation,
  StaffMember,
  WorkingHour,
} from '@/lib/cafe-operations';
import type { CashierCall } from '@/lib/table-service';
import type { CafeFeatures } from '@/lib/cafe-features';
import { categoryKinds } from '@/lib/catalog';
import type { MeetingSummary } from '@/lib/meetings';
import type { Cafe, CafeTable, CartLine, Reservation } from '@/lib/types';
import {
  Badge,
  Confirm,
  Empty,
  ErrorBox,
  Field,
  Form,
  Loading,
  LoginGate,
  Modal,
  PageTitle,
} from './ui';
import { PersianDateInput, PersianTimeInput } from './persian-date';
import { cashierLabels } from './table-service';
import { MeetingList } from './meetings';
import { ImageUpload } from './account';
import { AccountingWorkspace, LoyaltyWorkspace } from './finance-workspace';

type TableCode = CafeTable & { code: string; scans: number };
type Operations = {
  cafe: Pick<Cafe, 'id' | 'name' | 'opens' | 'closes' | 'tour_url'>;
  access: {
    owner: boolean;
    kitchen: boolean;
    cashier: boolean;
    reservations: boolean;
    meetings: boolean;
    accounting: boolean;
  };
  hours?: WorkingHour[];
  tables?: TableCode[];
  staff?: StaffMember[];
  categories?: MenuCategory[];
  features?: CafeFeatures;
};
type KitchenOrder = {
  id: string;
  table_name: string;
  mode: string;
  status: string;
  items: CartLine[];
  note: string;
  created_at: string;
  preparation_minutes: number | null;
  preparation_started_at: string;
};
const roleLabels: Record<string, string> = {
  owner: 'مالک',
  manager: 'مدیر شعبه',
  cashier: 'صندوق‌دار',
  waiter: 'پذیرایی',
  kitchen: 'آشپزخانه',
};
const dayNames = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
export function OperationsView({ id }: { id?: string }) {
  return <LoginGate>{id ? <LocationWorkspace id={id} /> : <LocationList />}</LoginGate>;
}
function LocationList() {
  const resource = useResource<{ locations: ServiceLocation[] }>('operations');
  return (
    <div className="stack">
      <PageTitle title="فضای کار کافه" />
      {resource.loading ? (
        <Loading />
      ) : resource.error ? (
        <ErrorBox message={resource.error} retry={resource.reload} />
      ) : resource.data?.locations.length ? (
        <div className="service-card-grid">
          {resource.data.locations.map((item) => (
            <Link className="panel stack" href={'/operations/' + item.id} key={item.id}>
              <h2>{item.name}</h2>
              <span className="badge">{roleLabels[item.role]}</span>
            </Link>
          ))}
        </div>
      ) : (
        <Empty
          title="هنوز به فضای کاری دسترسی ندارید"
          description="برای ثبت کافه یا مدیریت کسب‌وکار وارد پنل کافه شوید."
          href="/dashboard"
          label="پنل کافه"
        />
      )}
    </div>
  );
}
function LocationWorkspace({ id }: { id: string }) {
  const query = useSearchParams();
  const [selected, setSelected] = useState(query.get('tab') || '');
  const resource = useLiveResource<Operations>('operations/' + id, 30000);
  const { toast, refresh } = useApp();
  const data = resource.data;
  if (resource.loading) return <Loading />;
  if (!data)
    return <ErrorBox message={resource.error || 'کافه پیدا نشد.'} retry={resource.reload} />;
  const areas = [
    { id: 'kitchen', label: 'آشپزخانه', allowed: data.access.kitchen },
    { id: 'cashier', label: 'درخواست‌های صندوق', allowed: data.access.cashier },
    { id: 'calendar', label: 'تقویم رزرو', allowed: data.access.reservations },
    { id: 'meetings', label: 'دورهمی‌ها', allowed: data.access.meetings },
    { id: 'tables', label: 'کد میزها', allowed: data.access.owner },
    { id: 'staff', label: 'کارکنان', allowed: data.access.owner },
    { id: 'hours', label: 'ساعت کاری', allowed: data.access.owner },
    { id: 'catalog', label: 'منو و گالری', allowed: data.access.owner },
    { id: 'accounting', label: 'حسابداری', allowed: data.access.accounting },
    { id: 'loyalty', label: 'باشگاه مشتریان', allowed: data.access.owner },
  ].filter((tab) => tab.allowed);
  const tab = areas.find((area) => area.id === selected)?.id || areas[0]?.id;
  async function save(action: string, payload: Record<string, unknown>) {
    await api('operations/' + id + '/' + action, 'POST', payload);
    resource.reload();
    if (['categories', 'tour'].includes(action)) await refresh();
    toast('تغییرات ذخیره شد.');
  }
  function report(error: unknown) {
    toast((error as Error).message);
  }
  return (
    <div className="stack">
      <PageTitle
        title={data.cafe.name}
        back="/operations"
        description="فضای کار کافه"
        action={
          data.access.owner && (
            <Link href="/dashboard" className="button secondary">
              مدیریت کافه
            </Link>
          )
        }
      />
      <div className="tabs service-tabs">
        {areas.map((area) => (
          <button
            key={area.id}
            aria-pressed={tab === area.id}
            className={tab === area.id ? 'active' : ''}
            onClick={() => setSelected(area.id)}
          >
            {area.label}
          </button>
        ))}
      </div>
      {tab === 'kitchen' && <KitchenQueue id={id} />}
      {tab === 'cashier' && <CashierQueue id={id} />}
      {tab === 'calendar' && <ReservationCalendar id={id} />}
      {tab === 'meetings' && <CaféMeetingQueue id={id} />}
      {tab === 'accounting' && <AccountingWorkspace id={id} />}
      {tab === 'loyalty' && <LoyaltyWorkspace id={id} />}
      {tab === 'tables' && (
        <section className="stack">
          <h2>کد قابل چاپ میز</h2>
          {data.tables?.length ? (
            <div className="service-card-grid">
              {data.tables.map((table) => (
                <article key={table.id} className="panel stack">
                  <div className="card-heading">
                    <h3>{table.name}</h3>
                    <span>{digits(table.scans)} اسکن</span>
                  </div>
                  {table.vip && <span className="badge">میز ویژه</span>}
                  {table.enabled === false && <p className="muted">میز غیرفعال است.</p>}
                  {table.code && (
                    <>
                      <img
                        className="service-qr"
                        src={
                          '/api/operations/' +
                          id +
                          '/qr/' +
                          encodeURIComponent(table.id) +
                          '?code=' +
                          table.code
                        }
                        alt={'کد رزرو و سفارش ' + table.name}
                        width={192}
                        height={192}
                      />
                      <div className="button-row">
                        <a
                          className="button secondary"
                          href={'/api/operations/' + id + '/qr/' + encodeURIComponent(table.id)}
                          download="vitco-table.svg"
                        >
                          دریافت کد برای چاپ
                        </a>
                        <Link className="text-link" target="_blank" href={'/t/' + table.code}>
                          باز کردن پیوند میز
                        </Link>
                      </div>
                    </>
                  )}
                  {(table.enabled !== false || table.code) && (
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() =>
                        void save('qr', { table_id: table.id, revoke: Boolean(table.code) }).catch(
                          report,
                        )
                      }
                    >
                      {table.code ? 'غیرفعال کردن کد' : 'ساخت کد میز'}
                    </button>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <p className="notice">ابتدا میزها را در بخش ویرایش کافه ثبت کنید.</p>
          )}
        </section>
      )}
      {tab === 'staff' && (
        <div className="service-card-grid">
          <section className="panel stack">
            <h2>کارکنان این شعبه</h2>
            {!data.staff?.length && <p className="muted">هنوز کارمندی ثبت نشده است.</p>}
            {data.staff?.map((staff) => (
              <div className="list-row" key={staff.user_id}>
                <span>
                  {staff.name} · {roleLabels[staff.role]}
                </span>
                <button
                  className="text-link"
                  onClick={() =>
                    void save('staff', { remove: true, user_id: staff.user_id }).catch(report)
                  }
                >
                  برداشتن دسترسی
                </button>
              </div>
            ))}
          </section>
          <Form className="panel" onSubmit={async (f) => save('staff', Object.fromEntries(f))}>
            <h2>افزودن کارمند یا تغییر نقش</h2>
            <Field label="ایمیل یا شماره همراه کارمند">
              <input name="contact" dir="ltr" />
            </Field>
            <Field label="نقش در این شعبه">
              <select name="role">
                {Object.entries(roleLabels)
                  .filter(([role]) => role !== 'owner')
                  .map(([role, label]) => (
                    <option key={role} value={role}>
                      {label}
                    </option>
                  ))}
              </select>
            </Field>
          </Form>
        </div>
      )}
      {tab === 'hours' && (
        <WorkingHoursForm key={JSON.stringify(data.hours)} data={data} save={save} />
      )}
      {tab === 'catalog' && (
        <div className="stack">
          {data.features?.tour && (
            <Form className="panel" onSubmit={async (f) => save('tour', { url: f.get('url') })}>
              <h2>تور مجازی کافه</h2>
              <Field label="پیوند تور (اختیاری)">
                <input name="url" dir="ltr" type="url" defaultValue={data.cafe.tour_url || ''} />
              </Field>
            </Form>
          )}
          <div className="service-card-grid">
            <CategoryEditor save={save} />
            {data.categories?.map((group) => (
              <CategoryEditor
                key={
                  group.id + group.name + group.position + group.visible + group.image + group.kind
                }
                group={group}
                save={save}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
type Save = (action: string, payload: Record<string, unknown>) => Promise<void>;
function WorkingHoursForm({ data, save }: { data: Operations; save: Save }) {
  const [closed, setClosed] = useState<number[]>(
    data.hours?.filter((hour) => !hour.opens).map((hour) => hour.weekday) || [],
  );
  return (
    <Form
      className="panel service-hours-form"
      onSubmit={async (f) =>
        save('hours', {
          hours: dayNames.map((_, weekday) => ({
            weekday,
            closed: closed.includes(weekday),
            opens: f.get('opens-' + weekday),
            closes: f.get('closes-' + weekday),
          })),
        })
      }
    >
      <h2>ساعت کاری هفته</h2>
      {[6, 0, 1, 2, 3, 4, 5].map((weekday) => {
        const row = data.hours?.find((hour) => hour.weekday === weekday);
        return (
          <div className="service-hour-row" key={weekday}>
            <label className="check-row">
              <input
                type="checkbox"
                checked={closed.includes(weekday)}
                onChange={(event) =>
                  setClosed((current) =>
                    event.target.checked
                      ? [...current, weekday]
                      : current.filter((day) => day !== weekday),
                  )
                }
              />
              {dayNames[weekday]} تعطیل
            </label>
            {!closed.includes(weekday) && (
              <>
                <Field label="شروع">
                  <PersianTimeInput
                    name={'opens-' + weekday}
                    defaultValue={row?.opens || data.cafe.opens}
                  />
                </Field>
                <Field label="پایان">
                  <PersianTimeInput
                    name={'closes-' + weekday}
                    defaultValue={row?.closes || data.cafe.closes}
                  />
                </Field>
              </>
            )}
          </div>
        );
      })}
    </Form>
  );
}
function CategoryEditor({ group, save }: { group?: MenuCategory; save: Save }) {
  const [image, setImage] = useState(group?.image || '');
  const [removing, setRemoving] = useState(false),
    [error, setError] = useState('');
  return (
    <Form
      className="panel"
      onSubmit={async (f) =>
        save('categories', {
          ...Object.fromEntries(f),
          id: group?.id,
          image,
          visible: f.get('visible') === 'on',
        })
      }
    >
      <h2>{group ? 'ویرایش ' + group.name : 'دسته‌بندی تازه'}</h2>
      <Field label="نام دسته‌بندی">
        <input name="name" defaultValue={group?.name} />
      </Field>
      <Field label="ترتیب نمایش">
        <input name="position" type="number" min="0" defaultValue={group?.position || 0} />
      </Field>
      <Field label="نوع دسته‌بندی">
        <select name="kind" defaultValue={group?.kind || 'other'}>
          {Object.entries(categoryKinds).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <ImageUpload value={image} onChange={setImage} label="دسته منو" />
      <label className="check-row">
        <input name="visible" type="checkbox" defaultChecked={group?.visible ?? true} /> نمایش در
        منوی عمومی
      </label>
      {group && (
        <>
          <button className="text-link" type="button" onClick={() => setRemoving(true)}>
            حذف دسته‌بندی
          </button>
          {error && <ErrorBox message={error} />}
          <Confirm
            open={removing}
            title="حذف دسته‌بندی"
            description={group.name}
            onClose={() => setRemoving(false)}
            onConfirm={() => {
              setRemoving(false);
              setError('');
              void save('categories', { id: group.id, remove: true }).catch((error) =>
                setError(error.message),
              );
            }}
          />
        </>
      )}
    </Form>
  );
}
function KitchenQueue({ id }: { id: string }) {
  const resource = useLiveResource<{ orders: KitchenOrder[] }>('operations/' + id + '/kitchen');
  const [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [minutes, setMinutes] = useState<Record<string, string>>({});
  const transitions: Record<string, string[]> = {
    pending: ['approved', 'rejected', 'preparing'],
    approved: ['preparing', 'rejected'],
    preparing: ['ready', 'cancelled'],
    ready: ['completed'],
    delivering: ['completed'],
  };
  const labels: Record<string, string> = {
    approved: 'پذیرش سفارش',
    rejected: 'رد سفارش',
    preparing: 'شروع آماده‌سازی',
    ready: 'آماده تحویل',
    delivering: 'ارسال شد',
    completed: 'تحویل شد',
    cancelled: 'لغو سفارش',
  };
  async function change(order: KitchenOrder, status: string) {
    setBusy(order.id);
    setError('');
    try {
      await api('orders/' + order.id, 'PATCH', {
        status,
        ...(status === 'preparing' && minutes[order.id]
          ? { preparation_minutes: minutes[order.id] }
          : {}),
      });
      resource.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  return (
    <section className="stack">
      <h2>صف سفارش‌های آشپزخانه</h2>
      {(error || resource.error) && (
        <ErrorBox message={error || resource.error} retry={resource.reload} />
      )}
      {resource.loading ? (
        <Loading />
      ) : !resource.data?.orders.length ? (
        <p className="notice">سفارش فعالی در صف نیست.</p>
      ) : (
        <div className="service-card-grid">
          {resource.data.orders.map((order) => (
            <article className="panel stack" key={order.id}>
              <div className="card-heading">
                <strong>{order.table_name || 'سفارش کافه'}</strong>
                <Badge status={order.status} />
              </div>
              <p className="muted">
                {dateLabel(order.created_at, true)} · <bdi>{order.id.slice(0, 8)}</bdi>
              </p>
              {order.items.map((item) => (
                <div key={item.key} className="list-row">
                  <strong>
                    {digits(item.quantity)} × {item.name}
                  </strong>
                  <span>{[...item.option_names, item.note].filter(Boolean).join('، ')}</span>
                </div>
              ))}
              {order.note && <p>{order.note}</p>}
              {transitions[order.status]?.includes('preparing') && (
                <Field label="زمان آماده‌سازی به دقیقه (اختیاری)">
                  <input
                    type="number"
                    min="1"
                    max="240"
                    value={minutes[order.id] || ''}
                    onChange={(event) => setMinutes({ ...minutes, [order.id]: event.target.value })}
                  />
                </Field>
              )}
              {order.preparation_minutes && order.status === 'preparing' && (
                <p>{digits(order.preparation_minutes)} دقیقه زمان آماده‌سازی</p>
              )}
              <div className="button-row">
                {transitions[order.status]?.map((step) => {
                  const status =
                    step === 'ready' && order.mode === 'delivery' ? 'delivering' : step;
                  return (
                    <button
                      className="button secondary"
                      disabled={busy === order.id}
                      key={status}
                      onClick={() => void change(order, status)}
                    >
                      {labels[status]}
                    </button>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
function CashierQueue({ id }: { id: string }) {
  const path = 'operations/' + id + '/cashier',
    resource = useLiveResource<{ calls: CashierCall[] }>(path);
  const { toast } = useApp();
  async function change(call: CashierCall, status: string) {
    try {
      await api(path + '/' + call.id, 'POST', { status });
      resource.reload();
    } catch (e) {
      toast((e as Error).message);
    }
  }
  return (
    <section className="stack">
      <h2>درخواست‌های صندوق</h2>
      {resource.loading ? (
        <Loading />
      ) : resource.error ? (
        <ErrorBox message={resource.error} retry={resource.reload} />
      ) : !resource.data?.calls.length ? (
        <p className="notice">هنوز درخواستی از میزها ثبت نشده است.</p>
      ) : (
        <div className="service-card-grid">
          {resource.data.calls.map((call) => (
            <article className="panel stack" key={call.id}>
              <div className="card-heading">
                <h3>{call.table_name}</h3>
                <span className="badge">{cashierLabels[call.status]}</span>
              </div>
              <p>{dateLabel(call.created_at, true)}</p>
              <div className="button-row">
                {call.status === 'pending' && (
                  <button className="button primary" onClick={() => void change(call, 'accepted')}>
                    پذیرفتن درخواست
                  </button>
                )}
                {call.status === 'accepted' && (
                  <button className="button primary" onClick={() => void change(call, 'completed')}>
                    اتمام درخواست
                  </button>
                )}
                {['pending', 'accepted'].includes(call.status) && (
                  <button
                    className="button secondary"
                    onClick={() => void change(call, 'cancelled')}
                  >
                    لغو درخواست
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
function ReservationCalendar({ id }: { id: string }) {
  const [date, setDate] = useState(today);
  const [editing, setEditing] = useState<Reservation | null>(null);
  const resource = useLiveResource<{ reservations: Reservation[] }>(
    'operations/' + id + '/calendar?date=' + date,
  );
  const { toast } = useApp();
  const actions: Record<string, string[]> = {
    pending: ['confirmed', 'rejected'],
    confirmed: ['completed', 'no_show', 'cancelled'],
  };
  const labels: Record<string, string> = {
    confirmed: 'تأیید رزرو',
    rejected: 'رد رزرو',
    completed: 'تکمیل رزرو',
    no_show: 'ثبت عدم حضور',
    cancelled: 'لغو رزرو',
  };
  return (
    <section className="stack">
      <h2>تقویم رزرو</h2>
      <div className="panel">
        <PersianDateInput
          value={date}
          onChange={(value) => {
            if (value) setDate(value);
          }}
        />
      </div>
      {resource.loading ? (
        <Loading />
      ) : resource.error ? (
        <ErrorBox message={resource.error} retry={resource.reload} />
      ) : !resource.data?.reservations.length ? (
        <p className="notice">رزروی برای این روز ثبت نشده است.</p>
      ) : (
        <div className="service-card-grid">
          {resource.data.reservations.map((row) => (
            <article key={row.id} className="panel stack">
              <div className="card-heading">
                <h3>{row.customer_name}</h3>
                <span className="badge">{statusLabels[row.status]}</span>
              </div>
              <p>
                {digits(row.time)} · {digits(row.guests)} نفر
                {row.table_name ? ' · ' + row.table_name : ''}
              </p>
              {row.note && <p className="service-body">{row.note}</p>}
              <div className="button-row">
                {actions[row.status]?.map((status) => (
                  <button
                    key={status}
                    className="button secondary"
                    onClick={async () => {
                      try {
                        await api('reservations/' + row.id, 'PATCH', { status });
                        resource.reload();
                      } catch (e) {
                        toast((e as Error).message);
                      }
                    }}
                  >
                    {labels[status]}
                  </button>
                ))}
                {actions[row.status] &&
                  Date.parse(row.date + 'T' + row.time + ':00+03:30') > Date.now() && (
                    <button className="button secondary" onClick={() => setEditing(row)}>
                      ویرایش رزرو
                    </button>
                  )}
              </div>
            </article>
          ))}
        </div>
      )}
      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="ویرایش رزرو">
        {editing && (
          <RescheduleForm
            key={editing.id}
            cafeId={id}
            booking={editing}
            onDone={(nextDate) => {
              setEditing(null);
              setDate(nextDate);
              resource.reload();
              toast('جزئیات رزرو ذخیره شد.');
            }}
          />
        )}
      </Modal>
    </section>
  );
}
function RescheduleForm({
  cafeId,
  booking,
  onDone,
}: {
  cafeId: string;
  booking: Reservation;
  onDone: (date: string) => void;
}) {
  const [date, setDate] = useState(booking.date),
    [time, setTime] = useState(booking.time);
  const [guests, setGuests] = useState(String(booking.guests)),
    [table, setTable] = useState(booking.table_id);
  const path = 'operations/' + cafeId + '/calendar/' + booking.id;
  const availability = useResource<{
    slots: { time: string }[];
    tables: CafeTable[];
    requires_table: boolean;
  }>(date && guests ? path + '?' + new URLSearchParams({ date, time, guests }) : null);
  const current = availability.data;
  return (
    <Form
      onSubmit={async (form) => {
        await api(path, 'POST', { date, time, guests, table_id: table, note: form.get('note') });
        onDone(date);
      }}
    >
      <Field label="روز رزرو">
        <PersianDateInput
          min={today()}
          value={date}
          onChange={(value) => {
            setDate(value);
            setTime('');
            setTable('');
          }}
        />
      </Field>
      <Field label="تعداد نفرات">
        <input
          type="number"
          min={1}
          max={20}
          value={guests}
          onChange={(event) => {
            setGuests(event.target.value);
            setTable('');
          }}
        />
      </Field>
      {availability.error && <ErrorBox message={availability.error} retry={availability.reload} />}
      <Field label="ساعت">
        <select
          value={time}
          disabled={availability.loading}
          onChange={(event) => {
            setTime(event.target.value);
            setTable('');
          }}
        >
          <option value="">انتخاب ساعت</option>
          {current?.slots.map((slot) => (
            <option key={slot.time} value={slot.time}>
              {digits(slot.time)}
            </option>
          ))}
        </select>
      </Field>
      {time && current?.requires_table && (
        <Field label="میز">
          <select
            value={table}
            disabled={availability.loading}
            onChange={(event) => setTable(event.target.value)}
          >
            <option value="">انتخاب میز</option>
            {current.tables.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {digits(item.seats)} نفر
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="یادداشت">
        <textarea name="note" rows={3} defaultValue={booking.note} maxLength={500} />
      </Field>
    </Form>
  );
}
function CaféMeetingQueue({ id }: { id: string }) {
  const resource = useLiveResource<{ meetings: MeetingSummary[] }>(
    'operations/' + id + '/meetings',
  );
  return (
    <section className="stack">
      <h2>دورهمی‌های شعبه</h2>
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
