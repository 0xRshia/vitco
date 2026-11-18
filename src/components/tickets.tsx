'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { api, useApp, useLiveResource } from '@/lib/client';
import type { Ticket, TicketAttachment } from '@/lib/types';
import { dateLabel } from '@/lib/format';
import { ErrorBox, Field, Form, Loading, LoginGate, PageTitle } from './ui';

export const ticketStatus: Record<string, string> = {
  open: 'باز',
  answered: 'پاسخ داده شده',
  closed: 'بسته شده',
};
const priorityLabels: Record<string, string> = {
  low: 'کم',
  normal: 'عادی',
  high: 'زیاد',
  urgent: 'فوری',
};
export function TicketPriority() {
  return (
    <Field label="اولویت">
      <select name="priority" defaultValue="normal">
        {Object.entries(priorityLabels).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
    </Field>
  );
}
export function TicketFiles() {
  return (
    <Field label="پیوست‌ها (اختیاری)" hint="حداکثر پنج فایل، هر فایل تا پنج مگابایت.">
      <input
        type="file"
        name="attachments"
        multiple
        accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.doc,.docx"
      />
    </Field>
  );
}
function Attachments({ id, files }: { id: string; files: TicketAttachment[] }) {
  return (
    <div className="service-inline">
      {files.map((file) => (
        <a
          key={file.id}
          className="text-link"
          href={'/api/tickets/' + id + '/attachments/' + file.id}
          download
        >
          {file.name}
        </a>
      ))}
    </div>
  );
}
export function TicketThread({ id, back = '/support' }: { id: string; back?: string }) {
  const { data, toast } = useApp();
  const viewer = data?.user?.id;
  const path = 'tickets/' + id;
  const resource = useLiveResource<{ ticket: Ticket }>(viewer ? path : null, 8000);
  const ticket = resource.data?.ticket;
  const read = useRef('');
  useEffect(() => {
    const newest = ticket?.replies.at(-1)?.id || id;
    if (!viewer || !ticket?.unread || read.current === newest) return;
    read.current = newest;
    void api(path + '/read', 'PATCH', {}).catch(() => {
      read.current = '';
    });
  }, [viewer, ticket, id, path]);
  return (
    <LoginGate>
      {resource.loading ? (
        <Loading />
      ) : !ticket ? (
        <ErrorBox message={resource.error || 'درخواست پیدا نشد.'} retry={resource.reload} />
      ) : (
        <div className="stack">
          <PageTitle
            title={ticket.subject}
            back={back}
            action={
              <button
                className="button secondary"
                onClick={async () => {
                  try {
                    await api(path + '/status', 'PATCH', {
                      status: ticket.status === 'closed' ? 'open' : 'closed',
                    });
                    resource.reload();
                  } catch (e) {
                    toast((e as Error).message);
                  }
                }}
              >
                {ticket.status === 'closed' ? 'باز کردن دوباره' : 'بستن درخواست'}
              </button>
            }
          />
          <section className="panel stack">
            <div className="card-heading">
              <span className="badge">{ticketStatus[ticket.status]}</span>
              <span>اولویت {priorityLabels[ticket.priority || 'normal']}</span>
            </div>
            <p className="service-body">{ticket.body}</p>
            <small className="muted">{dateLabel(ticket.created_at, true)}</small>
            {ticket.order_id && ticket.user_id === viewer && (
              <Link className="text-link" href={'/orders/' + ticket.order_id}>
                سفارش مرتبط
              </Link>
            )}
            <Attachments id={id} files={ticket.attachments || []} />
            {ticket.replies.map((reply) => (
              <article className="ticket-reply stack" key={reply.id}>
                <strong>{reply.name}</strong>
                <p className="service-body">{reply.body}</p>
                <Attachments id={id} files={reply.attachments || []} />
                <small>{dateLabel(reply.created_at, true)}</small>
              </article>
            ))}
          </section>
          {ticket.status !== 'closed' && (
            <Form
              className="panel"
              onSubmit={async (f) => {
                await api(path + '/messages', 'POST', f);
                const field = document.querySelector<HTMLTextAreaElement>('#ticket-reply');
                field?.form?.reset();
                resource.reload();
                toast('پاسخ ارسال شد.');
              }}
            >
              <Field label="پاسخ شما">
                <textarea name="body" id="ticket-reply" maxLength={3000} />
              </Field>
              <TicketFiles />
            </Form>
          )}
        </div>
      )}
    </LoginGate>
  );
}
