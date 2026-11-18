import { randomUUID } from 'node:crypto';
import { cafeAccess, requireCafeAccess } from './cafe-access';
import { cafeById } from './commerce';
import { all, one, run, transaction } from './database';
import { today } from './format';
import type { User } from './types';
import * as v from './validation';

const sources = ['all', 'online', 'offline', 'manual'] as const;
export type FinancialSource = (typeof sources)[number];
export type FinancialEntry = {
  id: string;
  cafe_id: string;
  cafe_name: string;
  date: string;
  source: Exclude<FinancialSource, 'all'>;
  amount: number;
  description: string;
};
export type ExportProfile = {
  id: string;
  name: string;
  include_manual: number;
  source: FinancialSource;
};
export type FinancialExport = {
  id: string;
  title: string;
  date_from: string;
  date_to: string;
  created_at: string;
};
const sourceNames = { online: 'پرداخت آنلاین', offline: 'پرداخت در کافه', manual: 'ثبت دستی' };
function sourceFilter(value: unknown) {
  const source = value ?? 'all';
  v.ensure(
    sources.some((item) => item === source),
    'منبع تراکنش معتبر نیست.',
  );
  return source as FinancialSource;
}
export function accountingRange(from: unknown, to: unknown) {
  const end = v.date(to || today());
  const prior = new Date(end + 'T12:00:00Z');
  prior.setUTCDate(prior.getUTCDate() - 29);
  const start = v.date(from || prior.toISOString().slice(0, 10));
  const length = (Date.parse(end) - Date.parse(start)) / 86400000;
  v.ensure(length >= 0 && length < 366, 'بازه گزارش باید حداکثر یک سال باشد.');
  return { from: start, to: end };
}
function financialEntries(
  user: User,
  cafeId: string,
  range: ReturnType<typeof accountingRange>,
  source: FinancialSource,
  manual: boolean,
  branches: boolean,
) {
  const cafe = cafeById(cafeId);
  requireCafeAccess(user, cafe, 'accounting');
  const scope = [cafe.id];
  if (branches && !cafe.parent_id) {
    for (const child of all<{ id: string; owner_id: string }>(
      'SELECT id,owner_id FROM cafes WHERE parent_id=?',
      cafe.id,
    ))
      if (cafeAccess(user, child, 'accounting')) scope.push(child.id);
  }
  const placeholders = scope.map(() => '?').join(',');
  const online = source === 'all' || source === 'online';
  const offline = source === 'all' || source === 'offline';
  const entries: FinancialEntry[] = [];
  if (online || offline) {
    entries.push(
      ...all<FinancialEntry>(
        `SELECT o.id,o.cafe_id,c.name cafe_name,
      CASE WHEN o.payment_method='offline' THEN date(o.updated_at,'+03:30') ELSE
        date(COALESCE((SELECT p.updated_at / 1000 FROM payments p WHERE p.order_id=o.id AND p.status='paid' ORDER BY p.updated_at LIMIT 1),
        unixepoch(o.updated_at)),'unixepoch','+03:30') END date,
      CASE WHEN o.payment_method='offline' THEN 'offline' ELSE 'online' END source,
      o.total amount, CASE o.kind WHEN 'invoice' THEN 'فاکتور حضوری' WHEN 'event' THEN 'بلیت رویداد' ELSE 'سفارش منو' END description
      FROM orders o JOIN cafes c ON c.id=o.cafe_id WHERE o.cafe_id IN (${placeholders}) AND
      ((? AND o.payment_method='offline' AND o.status='completed') OR (? AND o.payment_method<>'offline' AND o.payment_status='paid'))
      AND date BETWEEN ? AND ? ORDER BY date DESC,o.id LIMIT 10001`,
        ...scope,
        Number(offline),
        Number(online),
        range.from,
        range.to,
      ),
    );
  }
  if (manual && (source === 'all' || source === 'manual'))
    entries.push(
      ...all<FinancialEntry>(
        `SELECT e.id,e.cafe_id,c.name cafe_name,e.date,'manual' source,e.amount,e.description
      FROM accounting_entries e JOIN cafes c ON c.id=e.cafe_id WHERE e.cafe_id IN (${placeholders}) AND e.date BETWEEN ? AND ?
      ORDER BY e.date DESC,e.id LIMIT 10001`,
        ...scope,
        range.from,
        range.to,
      ),
    );
  v.ensure(entries.length <= 10000, 'بازه کوتاه‌تری برای گزارش انتخاب کنید.', 409);
  return entries.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}
export function accountingOverview(user: User, cafeId: string, query: URLSearchParams) {
  const range = accountingRange(query.get('from'), query.get('to'));
  const entries = financialEntries(
    user,
    cafeId,
    range,
    sourceFilter(query.get('source') || undefined),
    true,
    query.get('branches') === '1',
  );
  const totals = { online: 0, offline: 0, manual: 0 };
  const byLocation = new Map<string, { id: string; name: string; total: number }>();
  for (const entry of entries) {
    totals[entry.source] += entry.amount;
    const row = byLocation.get(entry.cafe_id) || {
      id: entry.cafe_id,
      name: entry.cafe_name,
      total: 0,
    };
    row.total += entry.amount;
    byLocation.set(entry.cafe_id, row);
  }
  return {
    ...range,
    totals,
    by_location: [...byLocation.values()],
    entry_count: entries.length,
    entries: entries.slice(0, 200),
    profiles: all<ExportProfile>(
      'SELECT id,name,include_manual,source FROM accounting_profiles WHERE cafe_id=? ORDER BY name',
      cafeId,
    ),
    exports: all<FinancialExport>(
      'SELECT id,title,date_from,date_to,created_at FROM accounting_exports WHERE cafe_id=? ORDER BY created_at DESC LIMIT 50',
      cafeId,
    ),
  };
}
export function recordManualEntry(user: User, cafeId: string, input: Record<string, unknown>) {
  requireCafeAccess(user, cafeById(cafeId), 'accounting');
  const amount = v.integer(input.amount, 'مبلغ به تومان', -1000000000, 1000000000);
  v.ensure(amount !== 0, 'مبلغ نباید صفر باشد.');
  const day = v.date(input.date);
  v.ensure(day <= today(), 'تاریخ ثبت تراکنش در آینده است.');
  run(
    'INSERT INTO accounting_entries(id,cafe_id,actor_id,date,amount,description,created_at) VALUES (?,?,?,?,?,?,?)',
    randomUUID(),
    cafeId,
    user.id,
    day,
    amount,
    v.text(input.description, 'شرح تراکنش', 3, 300),
    new Date().toISOString(),
  );
}
export function saveExportProfile(user: User, cafeId: string, input: Record<string, unknown>) {
  requireCafeAccess(user, cafeById(cafeId), 'accounting');
  const id = v.text(input.id ?? '', 'پروفایل خروجی', 0, 100);
  if (input.remove === true) {
    v.ensure(id, 'پروفایل خروجی را انتخاب کنید.');
    run('DELETE FROM accounting_profiles WHERE cafe_id=? AND id=?', cafeId, id);
    return;
  }
  const title = v.text(input.name, 'نام پروفایل', 2, 80);
  const source = sourceFilter(input.source);
  const manual = Number(input.include_manual === true);
  transaction(() => {
    v.ensure(
      !one(
        'SELECT 1 FROM accounting_profiles WHERE cafe_id=? AND name=? AND id<>?',
        cafeId,
        title,
        id,
      ),
      'این نام قبلاً ثبت شده است.',
      409,
    );
    if (id) {
      const result = run(
        'UPDATE accounting_profiles SET name=?,include_manual=?,source=? WHERE id=? AND cafe_id=?',
        title,
        manual,
        source,
        id,
        cafeId,
      );
      v.ensure(result.changes, 'پروفایل خروجی پیدا نشد.', 404);
    } else
      run(
        'INSERT INTO accounting_profiles(id,cafe_id,name,include_manual,source) VALUES (?,?,?,?,?)',
        randomUUID(),
        cafeId,
        title,
        manual,
        source,
      );
  });
}
function csvCell(value: string | number) {
  if (typeof value === 'number') return String(value);
  const safe = /^[\s\u200b\u200c\u200d\ufeff]*[=+\-@\r\n\t]/.test(value) ? "'" + value : value;
  return '"' + safe.replace(/"/g, '""') + '"';
}
export function createFinancialExport(user: User, cafeId: string, input: Record<string, unknown>) {
  requireCafeAccess(user, cafeById(cafeId), 'accounting');
  const range = accountingRange(input.from, input.to),
    profileId = v.text(input.profile ?? '', 'پروفایل خروجی', 0, 100);
  const profile = profileId
    ? one<ExportProfile>(
        'SELECT * FROM accounting_profiles WHERE cafe_id=? AND id=?',
        cafeId,
        profileId,
      )
    : null;
  if (profileId) v.ensure(profile, 'پروفایل خروجی پیدا نشد.', 404);
  const entries = financialEntries(
    user,
    cafeId,
    range,
    profile?.source || sourceFilter(input.source),
    profile ? Boolean(profile.include_manual) : true,
    input.branches === true,
  );
  const headers = ['شناسه', 'تاریخ', 'شعبه', 'منبع', 'شرح', 'مبلغ به تومان'];
  const body = entries.map((entry) => [
    entry.id,
    entry.date,
    entry.cafe_name,
    sourceNames[entry.source],
    entry.description,
    entry.amount,
  ]);
  const csv = '\ufeff' + [headers, ...body].map((row) => row.map(csvCell).join(',')).join('\r\n');
  const id = randomUUID();
  run(
    'INSERT INTO accounting_exports(id,cafe_id,title,date_from,date_to,csv,created_at) VALUES (?,?,?,?,?,?,?)',
    id,
    cafeId,
    profile?.name || 'گزارش تراکنش‌ها',
    range.from,
    range.to,
    csv,
    new Date().toISOString(),
  );
  return id;
}
export function readFinancialExport(user: User, cafeId: string, id: string) {
  requireCafeAccess(user, cafeById(cafeId), 'accounting');
  const file = one<{ csv: string }>(
    'SELECT csv FROM accounting_exports WHERE id=? AND cafe_id=?',
    id,
    cafeId,
  );
  v.ensure(file, 'گزارش پیدا نشد.', 404);
  return file.csv;
}
