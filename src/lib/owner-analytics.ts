import { all, hydrate } from './database';
import { ownerCafe } from './commerce';
import { date, ensure } from './validation';
import type { Order, OwnerAnalytics, User } from './types';

const day = 86400000;
const dateInTehran = (timestamp: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(new Date(timestamp));

export function ownerAnalytics(
  user: User,
  input: { from: unknown; to: unknown; cafe?: string },
): OwnerAnalytics {
  const from = date(input.from),
    to = date(input.to);
  ensure(from <= to, 'تاریخ شروع باید پیش از تاریخ پایان باشد.');
  const start = Date.parse(from + 'T00:00:00+03:30');
  const end = Date.parse(to + 'T00:00:00+03:30') + day;
  const previousStart = start - (end - start);
  // Keep detailed daily reports bounded while allowing any interval within ten years.
  ensure(end - start <= 3660 * day, 'بازه گزارش نمی‌تواند بیش از ده سال باشد.');
  if (input.cafe) ownerCafe(user, input.cafe);
  const orders = all(
    'SELECT o.*,c.name cafe_name,u.name customer_name FROM orders o JOIN cafes c ON c.id=o.cafe_id JOIN users u ON u.id=o.user_id WHERE c.owner_id=?' +
      (input.cafe ? ' AND c.id=?' : '') +
      ' ORDER BY o.created_at DESC,o.rowid DESC',
    ...[user.id, ...(input.cafe ? [input.cafe] : [])],
  ).map(hydrate<Order>);
  const inRange = (order: Order) => {
    const time = Date.parse(order.created_at);
    return time >= start && time < end;
  };
  const current = orders.filter(inRange),
    completed = current.filter((o) => o.status === 'completed');
  const sales = completed.reduce((sum, o) => sum + o.total, 0);
  const previousSales = orders
    .filter(
      (o) =>
        o.status === 'completed' &&
        Date.parse(o.created_at) >= previousStart &&
        Date.parse(o.created_at) < start,
    )
    .reduce((sum, o) => sum + o.total, 0);
  const customers = new Map<string, OwnerAnalytics['customers'][number]>();
  const activeCustomers = new Set(
    current.filter((o) => o.status !== 'cancelled').map((o) => o.cafe_id + ':' + o.user_id),
  );
  for (const order of orders) {
    if (order.status === 'cancelled') continue;
    const key = order.cafe_id + ':' + order.user_id;
    const existing = customers.get(key);
    if (existing) existing.first_order_at = order.created_at;
    else
      customers.set(key, {
        user_id: order.user_id,
        customer_name: order.customer_name || '',
        cafe_id: order.cafe_id,
        cafe_name: order.cafe_name,
        first_order_at: order.created_at,
        latest_order: order,
      });
  }
  const items = new Map<string, OwnerAnalytics['top_items'][number]>();
  const itemCustomers = new Map<string, OwnerAnalytics['item_customers'][number]>();
  const daily = new Map<string, OwnerAnalytics['daily_sales'][number]>();
  for (let time = start; time < end; time += day) {
    const date = dateInTehran(time);
    daily.set(date, { date, sales: 0, order_count: 0 });
  }
  for (const order of completed) {
    const bucket = daily.get(dateInTehran(Date.parse(order.created_at)))!;
    bucket.sales += order.total;
    bucket.order_count += 1;
    // One product with multiple option lines is still one order occurrence.
    const seen = new Set<string>();
    for (const item of order.items) {
      const summary = items.get(item.product_id) || {
        product_id: item.product_id,
        name: item.name,
        quantity: 0,
        order_count: 0,
        revenue: 0,
      };
      summary.quantity += item.quantity;
      summary.revenue += item.price * item.quantity;
      if (!seen.has(item.product_id)) summary.order_count += 1;
      items.set(item.product_id, summary);
      const key = order.cafe_id + ':' + order.user_id + ':' + item.product_id;
      const customer = itemCustomers.get(key) || {
        product_id: item.product_id,
        name: item.name,
        user_id: order.user_id,
        customer_name: order.customer_name || '',
        cafe_id: order.cafe_id,
        cafe_name: order.cafe_name,
        quantity: 0,
        order_count: 0,
        last_order_at: order.created_at,
      };
      customer.quantity += item.quantity;
      if (!seen.has(item.product_id)) customer.order_count += 1;
      itemCustomers.set(key, customer);
      seen.add(item.product_id);
    }
  }
  return {
    from,
    to,
    previous_from: dateInTehran(previousStart),
    previous_to: dateInTehran(start - day),
    order_count: current.length,
    completed_order_count: completed.length,
    sales,
    previous_sales: previousSales,
    sales_change_percent: previousSales
      ? Math.round(((sales - previousSales) / previousSales) * 10000) / 100
      : null,
    new_customer_count: [...customers.values()].filter(
      (c) => Date.parse(c.first_order_at) >= start && Date.parse(c.first_order_at) < end,
    ).length,
    customers: [...customers.entries()]
      .filter(([key]) => activeCustomers.has(key))
      .map(([, customer]) => customer),
    daily_sales: [...daily.values()],
    top_items: [...items.values()].sort(
      (a, b) =>
        b.quantity - a.quantity || b.revenue - a.revenue || a.name.localeCompare(b.name, 'fa'),
    ),
    item_customers: [...itemCustomers.values()].sort(
      (a, b) => b.quantity - a.quantity || a.customer_name.localeCompare(b.customer_name, 'fa'),
    ),
  };
}
