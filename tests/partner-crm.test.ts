import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { cafeServiceSchema } from '../src/lib/cafe-service-schema';
import { database, run } from '../src/lib/database';
import type { PartnerLeadDetail, PartnerLeadList } from '../src/lib/partner-crm-types';
import { adminApi, submitContact } from '../src/lib/platform';
import type { User } from '../src/lib/types';
import { AppError } from '../src/lib/validation';

const dir = mkdtempSync(join(tmpdir(), 'vitco-partners-'));
const file = join(dir, 'crm.sqlite');
process.env.DATABASE_PATH = file;
process.env.PLATFORM_ADMIN_USER_ID = 'crm-admin';
const actor: User = {
  id: 'crm-admin',
  name: 'مدیر',
  email: '',
  phone: '',
  avatar: '',
  points: 0,
};
const query = new URLSearchParams();
const crm = (method: string, id: string | null, fields = {}, params = query) =>
  adminApi(actor, id ? ['admin', 'crm', id] : ['admin', 'crm'], method, fields, params);
const detail = (id: string) => crm('GET', id) as PartnerLeadDetail;
const filtered = (filter: Record<string, string> = {}) =>
  crm('GET', null, {}, new URLSearchParams(filter)) as PartnerLeadList;
const application = {
  name: 'مدیر کافه',
  contact: 'partner@example.test',
  subject: 'کافه متقاضی',
  body: 'برای همکاری با ویتکو درخواست داریم.',
};
before(() => {
  const legacy = new DatabaseSync(file);
  legacy.exec(
    'CREATE TABLE contact_messages(id TEXT PRIMARY KEY,kind TEXT NOT NULL,name TEXT NOT NULL,contact TEXT NOT NULL,subject TEXT NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL,read INTEGER NOT NULL DEFAULT 0)',
  );
  legacy
    .prepare('INSERT INTO contact_messages VALUES(?,?,?,?,?,?,?,0)')
    .run(
      'old',
      'partnership',
      application.name,
      application.contact,
      application.subject,
      application.body,
      '2025-01-01T00:00:00Z',
    );
  legacy.close();
  run(
    'INSERT INTO users(id,name,created_at) VALUES(?,?,?)',
    actor.id,
    actor.name,
    new Date().toISOString(),
  );
});
after(() => {
  database().close();
  rmSync(dir, { recursive: true, force: true });
});

test('migrates prior partnership applications once, captures future submissions and excludes ordinary contact messages', () => {
  assert.equal(detail('old').application, application.body);
  const updated = detail('old').lead;
  crm('PATCH', 'old', { ...updated, stage: 'contacted' });
  database().exec(cafeServiceSchema);
  assert.equal(detail('old').lead.stage, 'contacted');
  assert.equal(filtered().total, 1);
  const fresh = submitContact('partnership', application);
  assert.equal(detail(fresh.id).lead.cafe_name, application.subject);
  const ordinary = submitContact('contact', application);
  assert.throws(
    () => detail(ordinary.id),
    (e: unknown) => e instanceof AppError && e.status === 404,
  );
});

test('creates a manual lead once on retry and preserves updates and note history under stale edits', () => {
  const fields = {
    request_id: randomUUID(),
    cafe_name: 'کافه نسترن',
    contact_name: 'هما رضایی',
    contact: '۰۹۱۲۱۲۳۴۵۶۷',
    stage: 'contacted',
    follow_up_on: '2020-01-01',
    note: 'تماس اولیه انجام شد',
  };
  const { id } = crm('POST', null, fields) as { id: string };
  assert.deepEqual(crm('POST', null, fields), { id });
  const { lead, notes } = detail(id);
  assert.equal(lead.contact, '09121234567');
  assert.equal(notes.length, 1);
  assert.equal(notes[0].author, actor.name);
  assert.deepEqual(
    filtered({ q: 'رضایی', stage: 'contacted', due: '1' }).leads.map((l) => l.id),
    [id],
  );
  assert.deepEqual(
    filtered({ q: '۰۹۱۲۱۲۳۴۵۶۷' }).leads.map((l) => l.id),
    [id],
  );
  crm('PATCH', id, {
    ...fields,
    revision: lead.revision,
    stage: 'won',
    note: 'قرارداد همکاری ثبت شد',
  });
  assert.throws(
    () => crm('PATCH', id, { ...fields, revision: lead.revision }),
    (e: unknown) => e instanceof AppError && e.status === 409,
  );
  assert.equal(detail(id).lead.follow_up_on, '');
  assert.deepEqual(
    detail(id).notes.map((n) => n.body),
    ['قرارداد همکاری ثبت شد', 'تماس اولیه انجام شد'],
  );
  assert.equal(filtered({ q: 'رضایی', due: '1' }).total, 0);
  assert.throws(() => crm('PATCH', id, { ...fields, revision: 2, stage: 'made-up' }), AppError);
  assert.equal(detail(id).lead.revision, 2);
});

test('platform admin permission protects lists, individual profiles, and mutations', () => {
  const outsider = { ...actor, id: 'ordinary-member' };
  for (const [method, path] of [
    ['GET', []],
    ['GET', ['old']],
    ['POST', []],
    ['PATCH', ['old']],
  ] as const) {
    assert.throws(
      () => adminApi(outsider, ['admin', 'crm', ...path], method, {}, query),
      (e: unknown) => e instanceof AppError && e.status === 403,
    );
  }
});
