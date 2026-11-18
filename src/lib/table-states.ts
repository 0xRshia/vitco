import { requireCafeAccess } from './cafe-access';
import { all, one, run, transaction } from './database';
import type { Cafe, CafeTable, User, TableState } from './types';
import { ensure } from './validation';

export function disabledTables(cafeId: string) {
  return new Set(
    all<{ table_id: string }>(
      "SELECT table_id FROM table_states WHERE cafe_id=? AND state='disabled'",
      cafeId,
    ).map((table) => table.table_id),
  );
}

export function tableStatusList(cafe: Cafe) {
  const states = new Map(
    all<{ table_id: string; state: TableState }>(
      'SELECT table_id,state FROM table_states WHERE cafe_id=?',
      cafe.id,
    ).map((row) => [row.table_id, row.state]),
  );
  return cafe.tables.map((table) => ({
    ...table,
    state:
      table.enabled === false
        ? ('disabled' as const)
        : (states.get(table.id) ?? ('available' as const)),
  }));
}

export function ensureTableCanDisable(cafeId: string, table: CafeTable) {
  ensure(
    !one(
      `SELECT 1 FROM reservations WHERE cafe_id=? AND table_id=? AND status IN ('pending','confirmed')
       AND unixepoch(date||'T'||time||':00+03:30')+3600>unixepoch('now')
       UNION ALL
       SELECT 1 FROM orders WHERE cafe_id=? AND kind='menu' AND mode='dine_in'
       AND (table_id=? OR (table_id='' AND table_name=?))
       AND status IN ('pending','approved','preparing','ready','delivering')`,
      cafeId,
      table.id,
      cafeId,
      table.id,
      table.name,
    ),
    'ابتدا سفارش‌ها و رزروهای فعال این میز را تعیین تکلیف کنید.',
    409,
  );
}

export function updateTableState(user: User, cafe: Cafe, tableId: string, value: unknown) {
  requireCafeAccess(user, cafe, 'cashier');
  ensure(
    value === 'available' || value === 'occupied' || value === 'reserved' || value === 'disabled',
    'وضعیت میز معتبر نیست.',
  );
  const table = cafe.tables.find((item) => item.id === tableId);
  ensure(table, 'میز پیدا نشد.', 404);
  ensure(table.enabled !== false, 'این میز در تنظیمات کافه غیرفعال است.', 409);
  transaction(() => {
    if (value === 'disabled') {
      ensureTableCanDisable(cafe.id, table);
      run(
        "UPDATE cashier_calls SET status='cancelled',updated_at=? WHERE cafe_id=? AND table_id=? AND status IN ('pending','accepted')",
        new Date().toISOString(),
        cafe.id,
        tableId,
      );
    }
    run(
      `INSERT INTO table_states(cafe_id,table_id,state) VALUES(?,?,?)
       ON CONFLICT(cafe_id,table_id) DO UPDATE SET state=excluded.state`,
      cafe.id,
      tableId,
      value,
    );
  });
}
