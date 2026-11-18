import { all, run } from './database';
import { today } from './format';
import { ownerCafe } from './commerce';
import { accountingRange } from './accounting';
import type { User } from './types';

export type QrTarget = 'menu' | 'reservation' | 'table' | 'cashier';
export type QrScanCount = {
  day: string;
  target: QrTarget;
  label: string;
  table_id: string;
  count: number;
};

export function recordQrScan(cafeId: string, target: QrTarget, tableId = '', label = '') {
  run(
    `INSERT INTO qr_scan_counts(cafe_id,day,target,table_id,label,count) VALUES(?,?,?,?,?,1)
     ON CONFLICT(cafe_id,day,target,table_id) DO UPDATE SET count=count+1,label=excluded.label`,
    cafeId,
    today(),
    target,
    tableId,
    label,
  );
}

export function qrScanHistory(user: User, cafeId: string, params: URLSearchParams) {
  ownerCafe(user, cafeId);
  const range = accountingRange(params.get('from'), params.get('to'));
  const counts = all<QrScanCount>(
    'SELECT day,target,label,table_id,count FROM qr_scan_counts WHERE cafe_id=? AND day BETWEEN ? AND ? ORDER BY day DESC,target,label',
    cafeId,
    range.from,
    range.to,
  );
  return { ...range, total: counts.reduce((sum, row) => sum + row.count, 0), counts };
}
