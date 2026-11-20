'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { api, useApp, useResource } from '@/lib/client';
import { dateLabel, daysAhead, digits, money, today } from '@/lib/format';
import { cafeCustomerHref } from '@/lib/cafe-links';
import type { accountingOverview, ExportProfile, FinancialSource } from '@/lib/accounting';
import type { loyaltyManagement, myLoyalty, Reward } from '@/lib/loyalty';
import { ErrorBox, Field, Form, Loading } from './ui';
import { PersianDateInput } from './persian-date';

const sourceLabels = {
  all: 'همه منابع',
  online: 'پرداخت آنلاین',
  offline: 'پرداخت در کافه',
  manual: 'ثبت دستی',
};
function SourcePicker({ value }: { value?: FinancialSource }) {
  return (
    <Field label="منبع تراکنش">
      <select name="source" defaultValue={value || 'all'}>
        {Object.entries(sourceLabels).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
    </Field>
  );
}
export function AccountingWorkspace({ id }: { id: string }) {
  const { toast } = useApp();
  const [filters, setFilters] = useState({ from: '', to: '', source: 'all', branches: '' });
  const endpoint = 'operations/' + id;
  const overview = useResource<ReturnType<typeof accountingOverview>>(
    endpoint + '/accounting?' + new URLSearchParams(filters),
  );
  const data = overview.data;
  async function save(path: string, input: Record<string, unknown>) {
    await api(endpoint + '/' + path, 'POST', input);
    overview.reload();
    toast('ذخیره شد.');
  }
  if (overview.loading && !data) return <Loading />;
  if (!data)
    return <ErrorBox message={overview.error || 'گزارش در دسترس نیست.'} retry={overview.reload} />;
  return (
    <section className="stack">
      <h2>حسابداری و گردش مالی</h2>
      <Form
        className="panel"
        onSubmit={async (f) =>
          setFilters({
            from: String(f.get('from')),
            to: String(f.get('to')),
            source: String(f.get('source')),
            branches: f.get('branches') ? '1' : '',
          })
        }
      >
        <div className="form-grid service-field-grid">
          <Field label="از تاریخ">
            <PersianDateInput name="from" defaultValue={data.from} />
          </Field>
          <Field label="تا تاریخ">
            <PersianDateInput name="to" defaultValue={data.to} />
          </Field>
          <SourcePicker value={filters.source as FinancialSource} />
          <label className="check-row">
            <input type="checkbox" name="branches" defaultChecked={filters.branches === '1'} /> جمع
            شعبه‌های مجاز
          </label>
        </div>
      </Form>
      {overview.error && <ErrorBox message={overview.error} />}
      <div className="service-card-grid">
        {Object.entries(data.totals).map(([key, total]) => (
          <article className="panel stack" key={key}>
            <h3>{sourceLabels[key as FinancialSource]}</h3>
            <strong>{money(total)}</strong>
          </article>
        ))}
      </div>
      {data.by_location.length > 1 && (
        <div className="panel stack">
          <h3>جمع به تفکیک شعبه</h3>
          {data.by_location.map((item) => (
            <div key={item.id} className="list-row">
              <span>{item.name}</span>
              <strong>{money(item.total)}</strong>
            </div>
          ))}
        </div>
      )}
      <div className="panel stack">
        <h3>تراکنش‌ها · {digits(data.entry_count)} مورد</h3>
        {data.entry_count > data.entries.length && (
          <p className="muted">برای دریافت همه تراکنش‌های این بازه، خروجی بگیرید.</p>
        )}
        {!data.entries.length ? (
          <p className="muted">تراکنشی در این بازه ثبت نشده است.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>تاریخ</th>
                  <th>شعبه</th>
                  <th>منبع</th>
                  <th>شرح</th>
                  <th>مبلغ</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{dateLabel(entry.date)}</td>
                    <td>{entry.cafe_name}</td>
                    <td>{sourceLabels[entry.source]}</td>
                    <td>{entry.description}</td>
                    <td>{money(entry.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="service-card-grid">
        <Form className="panel" onSubmit={async (f) => save('accounting', Object.fromEntries(f))}>
          <h3>ثبت دستی تراکنش</h3>
          <Field label="تاریخ">
            <PersianDateInput name="date" defaultValue={today()} />
          </Field>
          <Field label="مبلغ به تومان" hint="هزینه را با علامت منفی وارد کنید.">
            <input name="amount" type="number" />
          </Field>
          <Field label="شرح تراکنش">
            <input name="description" maxLength={300} />
          </Field>
        </Form>
        <Form
          className="panel"
          onSubmit={async (f) =>
            save('export', {
              ...filters,
              branches: filters.branches === '1',
              profile: f.get('profile'),
            })
          }
        >
          <h3>خروجی تراکنش‌های همین بازه</h3>
          <Field label="پروفایل خروجی">
            <select name="profile">
              <option value="">همین تنظیمات گزارش</option>
              {data.profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </Field>
        </Form>
      </div>
      {data.exports.length > 0 && (
        <div className="panel stack">
          <h3>خروجی‌های ذخیره‌شده</h3>
          {data.exports.map((file) => (
            <div key={file.id} className="list-row">
              <span>
                {file.title} · {dateLabel(file.date_from)} تا {dateLabel(file.date_to)}
              </span>
              <a className="text-link" href={'/api/' + endpoint + '/export/' + file.id} download>
                دریافت CSV
              </a>
            </div>
          ))}
        </div>
      )}
      <details className="panel">
        <summary>پروفایل‌های خروجی</summary>
        <div className="service-card-grid service-section">
          <ProfileForm save={save} />
          {data.profiles.map((profile) => (
            <ProfileForm
              key={profile.id + profile.name + profile.source + profile.include_manual}
              profile={profile}
              save={save}
            />
          ))}
        </div>
      </details>
    </section>
  );
}
function ProfileForm({
  profile,
  save,
}: {
  profile?: ExportProfile;
  save: (path: string, input: Record<string, unknown>) => Promise<void>;
}) {
  const { toast } = useApp();
  return (
    <Form
      onSubmit={async (f) =>
        save('export-profile', {
          ...Object.fromEntries(f),
          id: profile?.id,
          include_manual: f.get('include_manual') === 'on',
        })
      }
    >
      <h3>{profile ? 'ویرایش پروفایل' : 'ساخت پروفایل'}</h3>
      <Field label="نام پروفایل">
        <input name="name" defaultValue={profile?.name} />
      </Field>
      <SourcePicker value={profile?.source} />
      <label className="check-row">
        <input
          type="checkbox"
          name="include_manual"
          defaultChecked={Boolean(profile?.include_manual)}
        />{' '}
        شامل ثبت‌های دستی
      </label>
      {profile && (
        <button
          type="button"
          className="text-link"
          onClick={() =>
            void save('export-profile', { id: profile.id, remove: true }).catch((e) =>
              toast(e.message),
            )
          }
        >
          حذف پروفایل
        </button>
      )}
    </Form>
  );
}
export function LoyaltyWorkspace({ id }: { id: string }) {
  const resource = useResource<ReturnType<typeof loyaltyManagement>>(
    'operations/' + id + '/loyalty',
  );
  const { toast } = useApp();
  const data = resource.data;
  async function save(action: string, input: Record<string, unknown>) {
    await api('operations/' + id + '/loyalty', 'POST', { action, ...input });
    resource.reload();
    toast('تغییرات باشگاه ذخیره شد.');
  }
  if (resource.loading && !data) return <Loading />;
  if (!data)
    return <ErrorBox message={resource.error || 'باشگاه در دسترس نیست.'} retry={resource.reload} />;
  const program = data.program;
  return (
    <section className="stack">
      <h2>باشگاه مشتریان شعبه</h2>
      <Form
        className="panel"
        key={JSON.stringify(program)}
        onSubmit={async (f) =>
          save('program', { ...Object.fromEntries(f), active: f.get('active') === 'on' })
        }
      >
        <Field label="نام باشگاه">
          <input name="name" defaultValue={program?.name} />
        </Field>
        <Field label="مبلغ لازم برای دریافت یک امتیاز (تومان)">
          <input
            type="number"
            name="spend_per_point"
            defaultValue={program?.spend_per_point ?? 10000}
          />
        </Field>
        <label className="check-row">
          <input type="checkbox" name="active" defaultChecked={Boolean(program?.active)} /> باشگاه
          فعال است
        </label>
      </Form>
      {program && (
        <>
          <div className="service-card-grid">
            <Form className="panel" onSubmit={async (f) => save('tier', Object.fromEntries(f))}>
              <h3>سطح‌های باشگاه</h3>
              {data.tiers.map((tier) => (
                <p key={tier.id}>
                  {tier.name} · از {digits(tier.threshold)} امتیاز
                </p>
              ))}
              <Field label="نام سطح">
                <input name="name" />
              </Field>
              <Field label="حداقل امتیاز سطح">
                <input type="number" min="0" name="threshold" />
              </Field>
            </Form>
            <Form className="panel" onSubmit={async (f) => save('adjust', Object.fromEntries(f))}>
              <h3>تغییر امتیاز مشتری</h3>
              <Field label="ایمیل یا شماره همراه مشتری">
                <input name="contact" dir="ltr" />
              </Field>
              <Field label="تعداد امتیاز (افزایش یا کاهش)">
                <input type="number" name="delta" />
              </Field>
              <Field label="دلیل تغییر">
                <input name="reason" />
              </Field>
            </Form>
          </div>
          <details className="panel">
            <summary>قانون‌های امتیاز خرید</summary>
            <div className="service-card-grid service-section">
              <LoyaltyRuleForm save={save} />
              {data.rules.map((rule) => (
                <LoyaltyRuleForm key={JSON.stringify(rule)} rule={rule} save={save} />
              ))}
            </div>
          </details>
          <div className="service-card-grid">
            <RewardForm save={save} />
            {data.rewards.map((reward) => (
              <RewardForm key={JSON.stringify(reward)} save={save} reward={reward} />
            ))}
          </div>
          <div className="service-card-grid">
            <div className="panel stack">
              <div className="card-heading">
                <h3>اعضا</h3>
                <Link className="text-link" href={cafeCustomerHref(id)}>
                  فهرست مشتریان
                </Link>
              </div>
              {data.members.map((member) => (
                <div className="list-row" key={member.id}>
                  <Link className="text-link" href={cafeCustomerHref(id, member.id)}>
                    {member.name}
                  </Link>
                  <strong>{digits(member.points)} امتیاز</strong>
                </div>
              ))}
            </div>
            <div className="panel stack">
              <h3>گردش امتیاز</h3>
              <p>
                امتیاز اعطاشده {digits(data.totals.credits)} · امتیاز صرف‌شده برای پاداش{' '}
                {digits(data.totals.redemptions)}
              </p>
              {data.ledger.map((entry) => (
                <div className="list-row" key={entry.id}>
                  <span>
                    {entry.customer_name} · {entry.reason}
                  </span>
                  <strong dir="ltr">
                    {entry.delta > 0 && '+'}
                    {digits(entry.delta)}
                  </strong>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
function LoyaltyRuleForm({
  rule,
  save,
}: {
  rule?: ReturnType<typeof loyaltyManagement>['rules'][number];
  save: (action: string, input: Record<string, unknown>) => Promise<void>;
}) {
  const [kind, setKind] = useState(rule?.kind || 'fixed');
  const descriptions = {
    fixed: 'امتیاز ثابت برای خرید',
    spend: 'امتیاز اضافه به ازای مبلغ خرید',
    tier: 'درصد امتیاز اضافه برای اعضای واجد شرایط',
  };
  return (
    <Form
      className="panel"
      onSubmit={async (form) =>
        save('rule', {
          ...Object.fromEntries(form),
          id: rule?.id,
          kind,
          active: form.has('active'),
        })
      }
    >
      <h3>{rule ? 'ویرایش قانون' : 'قانون جدید'}</h3>
      <Field label="نام قانون">
        <input name="name" defaultValue={rule?.name} />
      </Field>
      <Field label="نوع قانون">
        <select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
          {(Object.entries(descriptions) as [typeof kind, string][]).map(([key, name]) => (
            <option value={key} key={key}>
              {name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={kind === 'tier' ? 'حداقل امتیاز عضو' : 'حداقل مبلغ خرید (تومان)'}>
        <input name="minimum" type="number" min={0} defaultValue={rule?.minimum ?? 0} />
      </Field>
      <Field
        label={
          kind === 'tier'
            ? 'درصد امتیاز بیشتر'
            : kind === 'spend'
              ? 'امتیاز اضافه به ازای هر هزار تومان'
              : 'تعداد امتیاز اضافه'
        }
      >
        <input name="value" type="number" min={1} defaultValue={rule?.value} />
      </Field>
      <label className="check-row">
        <input name="active" type="checkbox" defaultChecked={rule?.active !== 0} /> قانون فعال است
      </label>
    </Form>
  );
}
function RewardForm({
  reward,
  save,
}: {
  reward?: Reward;
  save: (action: string, input: Record<string, unknown>) => Promise<void>;
}) {
  return (
    <Form
      className="panel"
      onSubmit={async (f) =>
        save('reward', {
          ...Object.fromEntries(f),
          id: reward?.id,
          active: f.get('active') === 'on',
        })
      }
    >
      <h3>{reward ? 'ویرایش پاداش' : 'پاداش تازه'}</h3>
      <Field label="نام پاداش">
        <input name="name" defaultValue={reward?.name} />
      </Field>
      <Field label="امتیاز لازم">
        <input name="cost" type="number" min="1" defaultValue={reward?.cost} />
      </Field>
      <Field label="درصد تخفیف">
        <input name="percent" type="number" min="1" max="100" defaultValue={reward?.percent} />
      </Field>
      <label className="check-row">
        <input type="checkbox" name="active" defaultChecked={reward?.active !== 0} /> قابل دریافت
      </label>
    </Form>
  );
}
export function LoyaltyPrograms() {
  const { refresh, toast } = useApp();
  const resource = useResource<ReturnType<typeof myLoyalty>>('loyalty');
  const [busy, setBusy] = useState(''),
    [error, setError] = useState('');
  const request = useRef(new Map<string, string>());
  async function redeem(cafeId: string, rewardId: string) {
    if (busy) return;
    setBusy(rewardId);
    setError('');
    const key = request.current.get(rewardId) || crypto.randomUUID();
    request.current.set(rewardId, key);
    try {
      await api('loyalty/' + cafeId + '/' + rewardId, 'POST', { request_key: key });
      request.current.delete(rewardId);
      await refresh();
      resource.reload();
      toast('کد پاداش در حساب شما ذخیره شد.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  if (resource.loading && !resource.data) return <Loading />;
  if (!resource.data)
    return (
      <ErrorBox message={resource.error || 'باشگاه‌ها در دسترس نیستند.'} retry={resource.reload} />
    );
  const data = resource.data;
  return (
    <div className="stack service-section">
      {error && <ErrorBox message={error} />}
      {data.programs.length > 0 && (
        <section className="stack">
          <h2>باشگاه‌های کافه‌ها</h2>
          <div className="service-card-grid">
            {data.programs.map((program) => {
              const tier = program.tiers.filter((item) => item.threshold <= program.points).at(-1);
              return (
                <article className="panel stack" key={program.cafe_id}>
                  <div className="card-heading">
                    <h3>
                      <Link href={'/cafes/' + program.cafe_id}>{program.name}</Link>
                    </h3>
                    <span className="badge">{digits(program.points)} امتیاز</span>
                  </div>
                  <p>
                    {program.cafe_name} · هر {money(program.spend_per_point)} یک امتیاز
                  </p>
                  {program.rules.length > 0 && (
                    <details>
                      <summary>امتیازهای اضافه</summary>
                      <ul>
                        {program.rules.map((rule) => (
                          <li key={rule.id}>
                            {rule.name} · {digits(rule.value)}
                            {rule.kind === 'tier'
                              ? ' درصد امتیاز بیشتر'
                              : rule.kind === 'spend'
                                ? ' امتیاز به ازای هزار تومان'
                                : ' امتیاز'}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {tier && <p>سطح {tier.name}</p>}
                  {program.rewards.map((reward) => (
                    <div className="list-row" key={reward.id}>
                      <div>
                        <strong>{reward.name}</strong>
                        <p>
                          {digits(reward.percent)}٪ تخفیف با {digits(reward.cost)} امتیاز
                        </p>
                      </div>
                      <button
                        type="button"
                        className="button secondary"
                        disabled={Boolean(busy) || program.points < reward.cost}
                        onClick={() => void redeem(program.cafe_id, reward.id)}
                      >
                        دریافت پاداش
                      </button>
                    </div>
                  ))}
                </article>
              );
            })}
          </div>
        </section>
      )}
      {data.coupons.length > 0 && (
        <section className="panel stack">
          <h2>کدهای پاداش من</h2>
          {data.coupons.map((coupon) => (
            <div className="list-row" key={coupon.code}>
              <span>
                {coupon.cafe_name} · {coupon.uses ? 'مصرف شده' : dateLabel(coupon.expires)}
              </span>
              <bdi>{coupon.code}</bdi>
            </div>
          ))}
        </section>
      )}
      {data.ledger.length > 0 && (
        <section className="panel stack">
          <h2>گردش امتیازهای من</h2>
          {data.ledger.map((entry) => (
            <div className="list-row" key={entry.id}>
              <span>
                {entry.cafe_name} · {entry.reason} · {dateLabel(entry.created_at)}
              </span>
              <strong dir="ltr">
                {entry.delta > 0 && '+'}
                {digits(entry.delta)}
              </strong>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
