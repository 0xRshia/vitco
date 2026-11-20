import { all, one, run, transaction } from './database';
import { latin, today } from './format';
import {
  leadStageLabels,
  type LeadStage,
  type PartnerLead,
  type PartnerLeadList,
  type PartnerLeadDetail,
} from './partner-crm-types';
import type { User } from './types';
import * as v from './validation';

function stageValue(value: unknown): LeadStage {
  v.ensure(
    typeof value === 'string' && Object.hasOwn(leadStageLabels, value),
    'مرحله همکاری معتبر نیست.',
  );
  return value as LeadStage;
}

function leadList(params: URLSearchParams): PartnerLeadList {
  const query = v.text(params.get('q') ?? '', 'عبارت جستجو', 0, 120);
  const stage = params.get('stage');
  const where: string[] = [],
    values: string[] = [];
  if (query) {
    where.push(
      "(instr(lower(cafe_name || ' ' || contact_name), lower(?)) > 0 OR instr(lower(contact), lower(?)) > 0)",
    );
    values.push(query, latin(query));
  }
  if (stage) {
    where.push('stage=?');
    values.push(stageValue(stage));
  }
  if (params.get('due') === '1') {
    where.push("stage NOT IN ('won','lost') AND follow_up_on <> '' AND follow_up_on <= ?");
    values.push(today());
  }
  const filter = where.length ? ' WHERE ' + where.join(' AND ') : '';
  const total = one<{ count: number }>(
    'SELECT COUNT(*) count FROM partner_leads' + filter,
    ...values,
  )!.count;
  const pageSize = 25;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pages, v.integer(params.get('page') || 1, 'صفحه', 1));
  const leads = all<PartnerLead>(
    'SELECT * FROM partner_leads' +
      filter +
      " ORDER BY (stage IN ('won','lost')), (follow_up_on=''), follow_up_on, updated_at DESC,id LIMIT ? OFFSET ?",
    ...values,
    pageSize,
    (page - 1) * pageSize,
  );
  return { leads, page, pages, total };
}

function leadDetail(id: string): PartnerLeadDetail {
  const lead = one<PartnerLead>('SELECT * FROM partner_leads WHERE id=?', id);
  v.ensure(lead, 'سرنخ همکاری پیدا نشد.', 404);
  const application = lead.message_id
    ? (one<{ body: string }>('SELECT body FROM contact_messages WHERE id=?', lead.message_id)
        ?.body ?? null)
    : null;
  const notes = all<PartnerLeadDetail['notes'][number]>(
    'SELECT n.id,n.body,n.created_at,u.name author FROM partner_lead_notes n JOIN users u ON u.id=n.author_id WHERE n.lead_id=? ORDER BY n.id DESC',
    id,
  );
  return { lead, application, notes };
}

function saveLead(actor: User, input: Record<string, unknown>, existingId?: string) {
  const cafeName = v.text(input.cafe_name, 'نام کافه', 2, 120);
  const contactName = v.text(input.contact_name, 'نام مخاطب', 2, 80);
  const value = v.text(input.contact, 'ایمیل یا شماره همراه', 3, 254);
  const contact = value.includes('@') ? v.email(value) : v.phone(value);
  const stage = stageValue(input.stage ?? 'new');
  const followUp =
    stage === 'won' || stage === 'lost' || !input.follow_up_on ? '' : v.date(input.follow_up_on);
  const note = v.text(input.note ?? '', 'یادداشت', 0, 2000);
  const now = new Date().toISOString();
  return transaction(() => {
    let id: string;
    if (existingId) {
      id = existingId;
      const revision = v.integer(input.revision, 'نسخه پرونده', 1);
      const current = one<{ revision: number }>(
        'SELECT revision FROM partner_leads WHERE id=?',
        id,
      );
      v.ensure(current, 'سرنخ همکاری پیدا نشد.', 404);
      v.ensure(
        current.revision === revision,
        'این پرونده تغییر کرده است. آخرین نسخه را دریافت کنید.',
        409,
      );
      run(
        'UPDATE partner_leads SET cafe_name=?,contact_name=?,contact=?,stage=?,follow_up_on=?,updated_at=?,revision=revision+1 WHERE id=?',
        cafeName,
        contactName,
        contact,
        stage,
        followUp,
        now,
        id,
      );
    } else {
      const requestId = v.text(input.request_id, 'شناسه درخواست', 36, 36);
      v.ensure(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId),
        'شناسه درخواست معتبر نیست.',
      );
      id = 'manual-' + requestId;
      if (one('SELECT id FROM partner_leads WHERE id=?', id)) return { id };
      run(
        'INSERT INTO partner_leads(id,cafe_name,contact_name,contact,stage,follow_up_on,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
        id,
        cafeName,
        contactName,
        contact,
        stage,
        followUp,
        now,
        now,
      );
    }
    if (note)
      run(
        'INSERT INTO partner_lead_notes(lead_id,author_id,body,created_at) VALUES(?,?,?,?)',
        id,
        actor.id,
        note,
        now,
      );
    return { id };
  });
}

// Called by the authenticated platform-admin dispatcher after its permission check.
export function partnerCrmApi(
  actor: User,
  path: string[],
  method: string,
  input: Record<string, unknown>,
  params: URLSearchParams,
) {
  if (path.length === 0 && method === 'GET') return leadList(params);
  if (path.length === 0 && method === 'POST') return saveLead(actor, input);
  if (path.length === 1 && method === 'GET') return leadDetail(path[0]);
  if (path.length === 1 && method === 'PATCH') return saveLead(actor, input, path[0]);
  throw new v.AppError('مسیر مدیریت همکاری‌ها پیدا نشد.', 404);
}
