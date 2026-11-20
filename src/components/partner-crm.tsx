'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { api, useApp, useResource } from '@/lib/client';
import { dateLabel, digits } from '@/lib/format';
import {
  leadStageLabels,
  type LeadStage,
  type PartnerLead,
  type PartnerLeadDetail,
  type PartnerLeadList,
} from '@/lib/partner-crm-types';
import { PersianDateInput } from './persian-date';
import { Empty, ErrorBox, Field, Form, Loading } from './ui';

function StageOptions() {
  return Object.entries(leadStageLabels).map(([value, label]) => (
    <option key={value} value={value}>
      {label}
    </option>
  ));
}

export function PartnerCrm() {
  const id = useSearchParams().get('lead');
  const [query, setQuery] = useState(''),
    [stage, setStage] = useState(''),
    [due, setDue] = useState(false),
    [page, setPage] = useState(1);
  const params = new URLSearchParams({ q: query, stage, due: due ? '1' : '0', page: String(page) });
  const list = useResource<PartnerLeadList>(id ? null : 'admin/crm?' + params);
  if (id) return <LeadPage key={id} id={id} />;
  return (
    <section className="panel">
      <div className="section-title">
        <h2>پیگیری همکاری کافه‌ها</h2>
        <div>
          <Link href="/admin/crm?lead=new" className="button primary">
            ثبت سرنخ
          </Link>
        </div>
      </div>
      <div className="service-card-grid">
        <Field label="جستجو در سرنخ‌ها">
          <input
            type="search"
            placeholder="نام کافه، مخاطب یا راه تماس"
            maxLength={120}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </Field>
        <Field label="مرحله همکاری">
          <select
            value={stage}
            onChange={(e) => {
              setStage(e.target.value);
              setPage(1);
            }}
          >
            <option value="">همه مراحل</option>
            <StageOptions />
          </select>
        </Field>
      </div>
      <label className="service-inline">
        <input
          type="checkbox"
          checked={due}
          onChange={(e) => {
            setDue(e.target.checked);
            setPage(1);
          }}
        />
        پیگیری‌های امروز و عقب‌افتاده
      </label>
      {list.error ? (
        <ErrorBox message={list.error} retry={list.reload} />
      ) : list.loading || !list.data ? (
        <Loading />
      ) : (
        <>
          {list.data.leads.length === 0 && <Empty title="سرنخی پیدا نشد" />}
          {list.data.leads.map((lead) => (
            <div key={lead.id} className="list-row">
              <div>
                <Link
                  className="text-link service-body"
                  href={'/admin/crm?lead=' + encodeURIComponent(lead.id)}
                >
                  {lead.cafe_name}
                </Link>
                <p className="service-body">
                  {lead.contact_name} · <bdi>{lead.contact}</bdi>
                </p>
              </div>
              <div>
                <strong>{leadStageLabels[lead.stage]}</strong>
                {lead.follow_up_on && <p>پیگیری {dateLabel(lead.follow_up_on)}</p>}
              </div>
            </div>
          ))}
          {list.data.pages > 1 && (
            <nav className="button-row" aria-label="صفحه‌های سرنخ‌ها">
              <button
                type="button"
                className="button secondary"
                disabled={list.data.page === 1}
                onClick={() => setPage(list.data!.page - 1)}
              >
                قبلی
              </button>
              <span>
                صفحه {digits(list.data.page)} از {digits(list.data.pages)}
              </span>
              <button
                type="button"
                className="button secondary"
                disabled={list.data.page === list.data.pages}
                onClick={() => setPage(list.data!.page + 1)}
              >
                بعدی
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}

function LeadPage({ id }: { id: string }) {
  const existing = id !== 'new';
  const router = useRouter();
  const detail = useResource<PartnerLeadDetail>(
    existing ? 'admin/crm/' + encodeURIComponent(id) : null,
  );
  return (
    <>
      <Link href="/admin/crm" className="text-link">
        بازگشت به فهرست سرنخ‌ها
      </Link>
      {detail.error ? (
        <ErrorBox message={detail.error} retry={detail.reload} />
      ) : existing && (detail.loading || !detail.data) ? (
        <Loading />
      ) : (
        <div className="service-card-grid service-section">
          <section className="panel">
            <h2>{existing ? 'پرونده همکاری' : 'ثبت سرنخ'}</h2>
            <LeadForm
              key={detail.data?.lead.revision ?? 'new'}
              lead={detail.data?.lead}
              reload={detail.reload}
              onSaved={(saved) =>
                existing
                  ? detail.reload()
                  : router.replace('/admin/crm?lead=' + encodeURIComponent(saved))
              }
            />
          </section>
          {detail.data && (
            <section className="panel">
              <h2>سابقه پیگیری</h2>
              <p>
                {detail.data.lead.message_id ? 'درخواست همکاری سایت' : 'ثبت توسط مدیر'} ·{' '}
                {dateLabel(detail.data.lead.created_at, true)}
              </p>
              {detail.data.application && <p className="service-body">{detail.data.application}</p>}
              {detail.data.notes.map((note) => (
                <div key={note.id} className="list-row">
                  <div>
                    <strong>{note.author}</strong> · {dateLabel(note.created_at, true)}
                    <p className="service-body">{note.body}</p>
                  </div>
                </div>
              ))}
              {!detail.data.notes.length && <p>هنوز یادداشتی ثبت نشده است.</p>}
            </section>
          )}
        </div>
      )}
    </>
  );
}

function LeadForm({
  lead,
  onSaved,
  reload,
}: {
  lead?: PartnerLead;
  onSaved: (id: string) => void;
  reload: () => void;
}) {
  const { toast } = useApp();
  const [stage, setStage] = useState<LeadStage>(lead?.stage ?? 'new');
  const [followUp, setFollowUp] = useState(lead?.follow_up_on ?? '');
  const [conflict, setConflict] = useState(false);
  const requestId = useRef('');
  return (
    <Form
      onSubmit={async (form) => {
        if (!lead && !requestId.current) requestId.current = crypto.randomUUID();
        const input = {
          ...Object.fromEntries(form),
          revision: lead?.revision,
          request_id: requestId.current,
        };
        try {
          const { id } = await api<{ id: string }>(
            lead ? 'admin/crm/' + encodeURIComponent(lead.id) : 'admin/crm',
            lead ? 'PATCH' : 'POST',
            input,
          );
          toast('پرونده همکاری ذخیره شد.');
          onSaved(id);
        } catch (error) {
          if ((error as { status?: number }).status === 409) setConflict(true);
          throw error;
        }
      }}
    >
      <Field label="نام کافه">
        <input name="cafe_name" required maxLength={120} defaultValue={lead?.cafe_name} />
      </Field>
      <Field label="نام مخاطب">
        <input name="contact_name" required maxLength={80} defaultValue={lead?.contact_name} />
      </Field>
      <Field label="ایمیل یا شماره همراه">
        <input name="contact" dir="ltr" required maxLength={254} defaultValue={lead?.contact} />
      </Field>
      <Field label="مرحله همکاری">
        <select name="stage" value={stage} onChange={(e) => setStage(e.target.value as LeadStage)}>
          <StageOptions />
        </select>
      </Field>
      {stage !== 'won' && stage !== 'lost' && (
        <div>
          <Field label="پیگیری بعدی">
            <PersianDateInput name="follow_up_on" value={followUp} onChange={setFollowUp} />
          </Field>
          {followUp && (
            <button className="text-link" type="button" onClick={() => setFollowUp('')}>
              حذف تاریخ پیگیری
            </button>
          )}
        </div>
      )}
      <Field label="یادداشت پیگیری">
        <textarea name="note" maxLength={2000} rows={3} />
      </Field>
      {conflict && (
        <button type="button" onClick={reload} className="button secondary">
          دریافت آخرین نسخه پرونده
        </button>
      )}
    </Form>
  );
}
