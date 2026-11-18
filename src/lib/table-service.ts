import { randomBytes, randomUUID } from 'node:crypto';
import { all, one, run, transaction } from './database';
import { hash } from './auth';
import { cafeById, ownerCafe } from './commerce';
import { requireCafeAccess } from './cafe-access';
import { cafeFeatures } from './cafe-features';
import { disabledTables, tableStatusList } from './table-states';
import { recordQrScan } from './qr-activity';
import { ensure } from './validation';
import type { User } from './types';

export const visitCookie = 'vitco_table_visit';
export const visitSeconds = 12 * 60 * 60;
type Code = { code: string; cafe_id: string; table_id: string; revoked_at: string; scans: number };
export type TableContext = {
  cafe_id: string;
  cafe_name: string;
  table_id: string;
  table_name: string;
  vip: boolean;
};
type Visit = {
  token_hash: string;
  code: string;
  guest_id: string | null;
  expires: number;
  bound: number;
};

function activeTable(code: string): TableContext | null {
  if (!/^[a-f0-9]{36}$/.test(code)) return null;
  const row = one<Code>("SELECT * FROM table_codes WHERE code=? AND revoked_at=''", code);
  if (!row) return null;
  const cafe = cafeById(row.cafe_id);
  const table = cafe.tables.find((t) => t.id === row.table_id);
  return cafe.active &&
    cafe.owner_id &&
    !cafe.is_demo &&
    table &&
    table.enabled !== false &&
    !disabledTables(cafe.id).has(table.id)
    ? {
        cafe_id: cafe.id,
        cafe_name: cafe.name,
        table_id: table.id,
        table_name: table.name,
        vip: Boolean(table.vip && cafeFeatures(cafe.id).vip_tables),
      }
    : null;
}

function savedVisit(token: string | undefined) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return undefined;
  return one<Visit>(
    'SELECT * FROM table_visits WHERE token_hash=? AND expires>?',
    hash(token),
    Date.now(),
  );
}

export function tableContext(token: string | undefined) {
  const visit = savedVisit(token);
  return visit?.bound ? activeTable(visit.code) : null;
}

export function detachTable(token: string | undefined) {
  const visit = savedVisit(token);
  if (visit?.bound) run('UPDATE table_visits SET bound=0 WHERE token_hash=?', visit.token_hash);
}

export function bindTable(
  code: string,
  previous: string | undefined,
  scanned?: 'table' | 'cashier',
) {
  return transaction(() => {
    const table = activeTable(code);
    ensure(table, 'کد این میز معتبر نیست یا میز در دسترس نیست.', 404);
    const existing = savedVisit(previous);
    if (existing?.bound && existing.code === code) {
      if (scanned) recordQrScan(table.cafe_id, scanned, table.table_id, table.table_name);
      return { token: previous!, table };
    }
    const token = previous && existing ? previous : randomBytes(32).toString('hex');
    run('DELETE FROM table_visits WHERE expires<=?', Date.now());
    run(
      `INSERT INTO table_visits(token_hash,code,expires) VALUES (?,?,?)
      ON CONFLICT(token_hash) DO UPDATE SET code=excluded.code,expires=excluded.expires,bound=1`,
      hash(token),
      code,
      Date.now() + visitSeconds * 1000,
    );
    run('UPDATE table_codes SET scans=scans+1 WHERE code=?', code);
    recordQrScan(table.cafe_id, scanned ?? 'table', table.table_id, table.table_name);
    return { token, table };
  });
}

export function tableGuest(token: string | undefined, create = false): User | null {
  const visit = savedVisit(token);
  if (!visit) return null;
  if (create && !visit.guest_id)
    return transaction(() => {
      const before = savedVisit(token);
      ensure(before?.bound && activeTable(before.code), 'ابتدا کد معتبر میز را اسکن کنید.', 403);
      if (before.guest_id) return tableGuest(token);
      const id = randomUUID();
      run(
        "INSERT INTO users(id,name,created_at,account_kind) VALUES (?,?,?,'guest')",
        id,
        'مهمان میز',
        new Date().toISOString(),
      );
      run('UPDATE table_visits SET guest_id=? WHERE token_hash=?', id, before.token_hash);
      return { id, name: 'مهمان میز', email: '', phone: '', points: 0, avatar: '' };
    });
  if (!visit.guest_id) return null;
  return (
    one<User>(
      "SELECT id,name,'' email,'' phone,points,avatar FROM users WHERE id=? AND suspended=0",
      visit.guest_id,
    ) ?? null
  );
}

export function tableCodesFor(user: User, cafeId: string) {
  const cafe = ownerCafe(user, cafeId);
  ensure(!cafe.is_demo, 'کافه آزمایشی میز حضوری ندارد.', 409);
  const codes = all<Code>("SELECT * FROM table_codes WHERE cafe_id=? AND revoked_at=''", cafeId);
  const counts = all<{ table_id: string; scans: number }>(
    'SELECT table_id,SUM(scans) scans FROM table_codes WHERE cafe_id=? GROUP BY table_id',
    cafeId,
  );
  return tableStatusList(cafe).map((table) => ({
    ...table,
    code: codes.find((code) => code.table_id === table.id)?.code ?? '',
    scans: counts.find((count) => count.table_id === table.id)?.scans ?? 0,
  }));
}

export function currentTableCode(cafeId: string, tableId: string) {
  return one<{ code: string }>(
    "SELECT code FROM table_codes WHERE cafe_id=? AND table_id=? AND revoked_at=''",
    cafeId,
    tableId,
  )?.code;
}

// Call only after the owner and target table have been validated within the write transaction.
export function issueTableCode(cafeId: string, tableId: string) {
  const code = randomBytes(18).toString('hex');
  run(
    'INSERT INTO table_codes(code,cafe_id,table_id,created_at) VALUES (?,?,?,?)',
    code,
    cafeId,
    tableId,
    new Date().toISOString(),
  );
  return code;
}

export function changeTableCode(user: User, cafeId: string, tableId: string, rotate: boolean) {
  const cafe = ownerCafe(user, cafeId);
  const table = cafe.tables.find((candidate) => candidate.id === tableId);
  ensure(
    !cafe.is_demo &&
      table &&
      (!rotate || (table.enabled !== false && !disabledTables(cafeId).has(tableId))),
    'میز فعال پیدا نشد.',
    404,
  );
  return transaction(() => {
    const now = new Date().toISOString();
    run(
      "UPDATE table_codes SET revoked_at=? WHERE cafe_id=? AND table_id=? AND revoked_at=''",
      now,
      cafeId,
      tableId,
    );
    run(
      "UPDATE cashier_calls SET status='cancelled',updated_at=? WHERE cafe_id=? AND table_id=? AND status IN ('pending','accepted')",
      now,
      cafeId,
      tableId,
    );
    if (rotate) issueTableCode(cafeId, tableId);
  });
}

export function requestCashier(token: string | undefined) {
  return transaction(() => {
    const visit = savedVisit(token);
    const table = visit?.bound && activeTable(visit.code);
    ensure(visit && table, 'برای درخواست صندوق‌دار کد میز را اسکن کنید.', 403);
    const active = one<{ id: string }>(
      "SELECT id FROM cashier_calls WHERE cafe_id=? AND table_id=? AND status IN ('pending','accepted')",
      table.cafe_id,
      table.table_id,
    );
    if (active) return active.id;
    const now = new Date().toISOString();
    const id = randomUUID();
    run(
      `INSERT INTO cashier_calls(id,cafe_id,table_id,table_name,code,status,created_at,updated_at)
      VALUES (?,?,?,?,?,'pending',?,?)`,
      id,
      table.cafe_id,
      table.table_id,
      table.table_name,
      visit.code,
      now,
      now,
    );
    return id;
  });
}

export type CashierCall = {
  id: string;
  table_name: string;
  status: 'pending' | 'accepted' | 'completed' | 'cancelled';
  created_at: string;
};
export function latestCashierCall(token: string | undefined) {
  const visit = savedVisit(token);
  return visit?.bound && activeTable(visit.code)
    ? (one<CashierCall>(
        'SELECT id,table_name,status,created_at FROM cashier_calls WHERE code=? ORDER BY created_at DESC LIMIT 1',
        visit.code,
      ) ?? null)
    : null;
}
export function cashierQueue(user: User, cafeId: string) {
  requireCafeAccess(user, cafeById(cafeId), 'cashier');
  return all<CashierCall>(
    'SELECT id,table_name,status,created_at FROM cashier_calls WHERE cafe_id=? ORDER BY created_at DESC LIMIT 100',
    cafeId,
  );
}
export function updateCashierCall(user: User, cafeId: string, id: string, status: unknown) {
  requireCafeAccess(user, cafeById(cafeId), 'cashier');
  transaction(() => {
    const call = one<CashierCall>(
      'SELECT * FROM cashier_calls WHERE cafe_id=? AND id=?',
      cafeId,
      id,
    );
    ensure(call, 'درخواست صندوق پیدا نشد.', 404);
    ensure(
      (call.status === 'pending' && ['accepted', 'cancelled'].includes(String(status))) ||
        (call.status === 'accepted' && ['completed', 'cancelled'].includes(String(status))),
      'تغییر وضعیت این درخواست مجاز نیست.',
      409,
    );
    run(
      'UPDATE cashier_calls SET status=?,updated_at=? WHERE id=?',
      String(status),
      new Date().toISOString(),
      id,
    );
  });
}
