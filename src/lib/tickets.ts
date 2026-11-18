import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { all, one, run, transaction } from './database';
import { platformAdmin } from './cafe-access';
import { notify } from './auth';
import type { Ticket, TicketAttachment, User } from './types';
import * as v from './validation';

type TicketRow = Ticket & { owner_id: string | null; customer_name: string };
const select = `SELECT t.*,c.owner_id,u.name customer_name FROM tickets t JOIN users u ON u.id=t.user_id
  LEFT JOIN orders o ON o.id=t.order_id LEFT JOIN cafes c ON c.id=o.cafe_id`;
const canManage = (user: User, row: TicketRow) =>
  row.owner_id === user.id || user.id === process.env.SUPPORT_USER_ID || platformAdmin(user);
const supportAccount = () => process.env.SUPPORT_USER_ID || process.env.PLATFORM_ADMIN_USER_ID;

function visible(user: User, id: string) {
  const row = one<TicketRow>(select + ' WHERE t.id=?', id);
  v.ensure(row, 'درخواست پیدا نشد.', 404);
  v.ensure(row.user_id === user.id || canManage(user, row), 'دسترسی مجاز نیست.', 403);
  return row;
}
export function ticketDetails(ticket: Ticket, user: User) {
  const attachments = all<TicketAttachment & { reply_id: string | null }>(
    'SELECT id,name,size,reply_id FROM ticket_attachments WHERE ticket_id=?',
    ticket.id,
  );
  const replies = all<Ticket['replies'][number] & { user_id: string }>(
    `SELECT r.id,r.user_id,r.body,r.created_at,u.name FROM ticket_replies r JOIN users u ON u.id=r.user_id
    WHERE r.ticket_id=? ORDER BY r.created_at,r.id`,
    ticket.id,
  );
  const read = one<{ read_at: string }>(
    'SELECT read_at FROM ticket_reads WHERE ticket_id=? AND user_id=?',
    ticket.id,
    user.id,
  );
  // Expose only the fields used by the conversation UI.
  const { id, user_id, order_id, subject, body, status, created_at, priority } = ticket;
  return {
    id,
    user_id,
    order_id,
    subject,
    body,
    status,
    created_at,
    priority,
    unread:
      (ticket.user_id !== user.id && !read) ||
      replies.some((row) => row.user_id !== user.id && (!read || row.created_at > read.read_at)),
    attachments: attachments.filter((attachment) => !attachment.reply_id),
    replies: replies.map(({ user_id: _, ...row }) => ({
      ...row,
      attachments: attachments.filter((attachment) => attachment.reply_id === row.id),
    })),
  };
}
export function operatorTickets(user: User) {
  const admin = user.id === process.env.SUPPORT_USER_ID || platformAdmin(user);
  return all<TicketRow>(
    select + ' WHERE c.owner_id=? OR ? ORDER BY t.created_at DESC LIMIT 200',
    user.id,
    Number(admin),
  ).map((ticket) => ({ ...ticketDetails(ticket, user), customer_name: ticket.customer_name }));
}
const maxFile = 5 * 1024 * 1024;
export async function readTicketForm(request: NextRequest) {
  const maximum = maxFile * 5 + 64 * 1024;
  v.ensure(
    Number(request.headers.get('content-length') || 0) <= maximum,
    'حجم پیوست‌ها بیش از حد مجاز است.',
    413,
  );
  const reader = request.body?.getReader();
  v.ensure(reader, 'درخواست خالی است.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      v.ensure(size <= maximum, 'حجم پیوست‌ها بیش از حد مجاز است.', 413);
      chunks.push(chunk.value);
    }
  } finally {
    await reader.cancel();
  }
  const body = Buffer.concat(chunks);
  let form: FormData;
  try {
    form = await new Response(body, {
      headers: { 'Content-Type': request.headers.get('content-type') || '' },
    }).formData();
  } catch {
    throw new v.AppError('پیوست‌ها قابل دریافت نبودند.');
  }
  const files = v.list(
    form.getAll('attachments').filter((item) => item instanceof File && item.size > 0),
    5,
  );
  const attachments = await Promise.all(
    files.map(async (value) => {
      v.ensure(value instanceof File && value.size <= maxFile, 'هر پیوست حداکثر پنج مگابایت است.');
      const name = v.text(value.name.replace(/[\u0000-\u001f\u007f/\\]/g, '_'), 'نام فایل', 1, 180);
      v.ensure(
        /\.(?:jpe?g|png|webp|pdf|txt|docx?)$/i.test(name),
        'فرمت پیوست باید تصویر، PDF، متن یا Word باشد.',
      );
      return { name, content: new Uint8Array(await value.arrayBuffer()), size: value.size };
    }),
  );
  return { input: Object.fromEntries(form), attachments };
}
type FileData = Awaited<ReturnType<typeof readTicketForm>>['attachments'];
function saveFiles(files: FileData, id: string, replyId: string | null) {
  for (const file of files)
    run(
      'INSERT INTO ticket_attachments(id,ticket_id,reply_id,name,content,size) VALUES (?,?,?,?,?,?)',
      randomUUID(),
      id,
      replyId,
      file.name,
      file.content,
      file.size,
    );
}
export function ticketsApi(
  user: User,
  path: string[],
  method: string,
  input: Record<string, unknown>,
  files: FileData = [],
) {
  const [, id, action, attachmentId] = path;
  if (method === 'GET') {
    if (!id)
      return {
        tickets: all<Ticket>(
          select + ' WHERE t.user_id=? ORDER BY t.created_at DESC LIMIT 200',
          user.id,
        ).map((row) => ticketDetails(row, user)),
      };
    const row = visible(user, id);
    if (action === 'attachments' && attachmentId) {
      const file = one<{ name: string; content: Uint8Array }>(
        'SELECT name,content FROM ticket_attachments WHERE ticket_id=? AND id=?',
        id,
        attachmentId,
      );
      v.ensure(file, 'پیوست پیدا نشد.', 404);
      return new Response(Uint8Array.from(file.content), {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
          'Content-Disposition':
            "attachment; filename*=UTF-8''" +
            encodeURIComponent(file.name).replace(
              /['()*]/g,
              (ch) => '%' + ch.charCodeAt(0).toString(16),
            ),
        },
      });
    }
    v.ensure(!action, 'مسیر پیدا نشد.', 404);
    return { ticket: ticketDetails(row, user) };
  }
  const now = new Date().toISOString();
  if (method === 'POST' && !id) {
    const orderId = v.text(input.order_id ?? '', 'سفارش', 0, 100);
    const order = orderId
      ? one<{ owner_id: string }>(
          'SELECT c.owner_id FROM orders o JOIN cafes c ON c.id=o.cafe_id WHERE o.id=? AND o.user_id=?',
          orderId,
          user.id,
        )
      : null;
    if (orderId) v.ensure(order, 'سفارش پیدا نشد.', 404);
    const priority = v.text(input.priority ?? 'normal', 'اولویت', 1, 20);
    v.ensure(['low', 'normal', 'high', 'urgent'].includes(priority), 'اولویت درخواست معتبر نیست.');
    const key = randomUUID();
    const subject = v.text(input.subject, 'موضوع', 3, 150);
    transaction(() => {
      run(
        'INSERT INTO tickets(id,user_id,order_id,subject,body,created_at,priority) VALUES (?,?,?,?,?,?,?)',
        key,
        user.id,
        orderId,
        subject,
        v.text(input.body, 'پیام', 10, 3000),
        now,
        priority,
      );
      saveFiles(files, key, null);
      const recipient = order?.owner_id || supportAccount();
      if (recipient && recipient !== user.id && one('SELECT 1 FROM users WHERE id=?', recipient))
        notify(recipient, 'درخواست تازه پشتیبانی', subject, '/support/' + key);
    });
    return { id: key, ok: true };
  }
  const row = visible(user, id);
  if (method === 'POST' && (action === 'messages' || action === 'replies')) {
    if (action === 'replies') v.ensure(canManage(user, row), 'دسترسی مجاز نیست.', 403);
    v.ensure(row.status !== 'closed', 'ابتدا درخواست را دوباره باز کنید.', 409);
    transaction(() => {
      const replyId = randomUUID();
      run(
        'INSERT INTO ticket_replies(id,ticket_id,user_id,body,created_at) VALUES (?,?,?,?,?)',
        replyId,
        id,
        user.id,
        v.text(input.body, 'پاسخ', 3, 3000),
        now,
      );
      saveFiles(files, id, replyId);
      const customer = row.user_id === user.id;
      run('UPDATE tickets SET status=? WHERE id=?', customer ? 'open' : 'answered', id);
      const recipient = customer ? row.owner_id || supportAccount() : row.user_id;
      if (recipient && recipient !== user.id && one('SELECT 1 FROM users WHERE id=?', recipient))
        notify(recipient, 'پاسخ تازه پشتیبانی', row.subject, '/support/' + id);
    });
  } else if (method === 'PATCH' && action === 'status') {
    v.ensure(input.status === 'open' || input.status === 'closed', 'وضعیت درخواست معتبر نیست.');
    run('UPDATE tickets SET status=? WHERE id=?', input.status, id);
  } else if (method === 'PATCH' && action === 'read') {
    run(
      'INSERT INTO ticket_reads(ticket_id,user_id,read_at) VALUES (?,?,?) ON CONFLICT(ticket_id,user_id) DO UPDATE SET read_at=excluded.read_at',
      id,
      user.id,
      now,
    );
  } else throw new v.AppError('مسیر پیدا نشد.', 404);
  return { ok: true };
}
