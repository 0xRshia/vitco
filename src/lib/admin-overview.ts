import { all, one } from './database';

export type AdminPeriod = 'today' | 'week' | 'month' | 'year';
const day = 86400000;
const hour = 3600000;
const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' });
const persianDate = new Intl.DateTimeFormat('en-u-ca-persian', {
  month: 'numeric',
  day: 'numeric',
  timeZone: 'Asia/Tehran',
});
const iso = (timestamp: number) => new Date(timestamp).toISOString();

function periodStart(period: AdminPeriod, at: number) {
  const midnight = Date.parse(localDate.format(at) + 'T00:00:00+03:30');
  if (period === 'today') return midnight;
  if (period === 'week') {
    const weekday = new Date(midnight + day / 2).getUTCDay();
    return midnight - ((weekday + 1) % 7) * day;
  }
  const parts = persianDate.formatToParts(at);
  const dayOfMonth = Number(parts.find((part) => part.type === 'day')!.value);
  const monthStart = midnight - (dayOfMonth - 1) * day;
  if (period === 'month') return monthStart;
  const priorMonths = Number(parts.find((part) => part.type === 'month')!.value) - 1;
  const priorDays = Math.min(6, priorMonths) * 31 + Math.max(0, priorMonths - 6) * 30;
  return monthStart - priorDays * day;
}

type Totals = { revenue: number; orders: number };
type PerformanceRow = Totals & { bucket: string };
type Activity = {
  kind: 'orders' | 'reviews' | 'users' | 'tickets';
  id: string;
  name: string;
  at: string;
};

export function adminOverview(input: string | null, at = Date.now()) {
  const period: AdminPeriod =
    input === 'today' || input === 'month' || input === 'year' ? input : 'week';
  const start = periodStart(period, at);
  const from = iso(start);
  const end = iso(at + 1);
  const scope =
    'FROM orders o JOIN cafes c ON c.id=o.cafe_id WHERE c.is_demo=0 AND o.created_at>=? AND o.created_at<?';
  const revenue = "COALESCE(SUM(CASE WHEN o.status='completed' THEN o.total ELSE 0 END),0)";
  const previous = one<Totals>(
    `SELECT COUNT(*) orders, ${revenue} revenue ${scope}`,
    iso(periodStart(period, start - 1)),
    from,
  )!;
  const rows = all<PerformanceRow>(
    `SELECT strftime(?,o.created_at,'+210 minutes') bucket, COUNT(*) orders, ${revenue} revenue
     ${scope} GROUP BY bucket ORDER BY bucket`,
    period === 'today' ? '%Y-%m-%dT%H' : '%Y-%m-%d',
    from,
    end,
  );
  const buckets = new Map(rows.map((row) => [row.bucket, row]));
  const performance: PerformanceRow[] = [];
  const current: Totals = { orders: 0, revenue: 0 };
  for (let cursor = start; cursor <= at; cursor += period === 'today' ? hour : day) {
    const date = localDate.format(cursor);
    const key =
      period === 'today' ? date + 'T' + String((cursor - start) / hour).padStart(2, '0') : date;
    const row = buckets.get(key);
    const bucket = period === 'year' ? iso(periodStart('month', cursor)) : iso(cursor);
    let point = performance.at(-1);
    if (point?.bucket !== bucket) {
      point = { bucket, orders: 0, revenue: 0 };
      performance.push(point);
    }
    if (row) {
      point.orders += row.orders;
      point.revenue += row.revenue;
      current.orders += row.orders;
      current.revenue += row.revenue;
    }
  }
  return {
    period,
    from,
    through: iso(at),
    current,
    previous,
    performance,
    statuses: all<{ status: string; count: number }>(
      `SELECT o.status, COUNT(*) count ${scope} GROUP BY o.status ORDER BY count DESC,o.status`,
      from,
      end,
    ),
    cafes: all<{ id: string; name: string } & Totals>(
      `SELECT c.id,c.name,COUNT(*) orders,${revenue} revenue ${scope}
       GROUP BY c.id ORDER BY revenue DESC,orders DESC,c.id LIMIT 5`,
      from,
      end,
    ),
    products: all<{ name: string; quantity: number; revenue: number }>(
      `SELECT item.value ->> '$.name' name, SUM(item.value ->> '$.quantity') quantity,
              SUM((item.value ->> '$.price')*(item.value ->> '$.quantity')) revenue
       FROM orders o JOIN cafes c ON c.id=o.cafe_id JOIN json_each(o.items) item
       WHERE c.is_demo=0 AND o.kind='menu' AND o.status='completed' AND o.created_at>=? AND o.created_at<?
       GROUP BY 1 ORDER BY revenue DESC,quantity DESC,1 LIMIT 5`,
      from,
      end,
    ),
    recent: all<Activity>(`SELECT 'orders' kind,o.id,c.name name,o.created_at at
        FROM orders o JOIN cafes c ON c.id=o.cafe_id WHERE c.is_demo=0
      UNION ALL SELECT 'reviews',r.id,c.name,r.created_at FROM reviews r JOIN cafes c ON c.id=r.cafe_id WHERE c.is_demo=0
      UNION ALL SELECT 'users',id,name,created_at FROM users WHERE account_kind='member'
      UNION ALL SELECT 'tickets',id,subject,created_at FROM tickets
      ORDER BY at DESC,kind,id LIMIT 8`),
  };
}
export type AdminOverview = ReturnType<typeof adminOverview>;
