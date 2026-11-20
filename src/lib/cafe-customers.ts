import { ownerCafe } from './commerce';
import { all, one, transaction } from './database';
import { latin } from './format';
import { adjustMemberPoints } from './loyalty';
import type { User } from './types';
import * as v from './validation';

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  suspended: number;
  points: number;
  tier: string | null;
};

// A customer can have a booking or a purchase before earning their first point.
const customerRows = `WITH scope(cafe_id) AS (VALUES (?)), customers(user_id) AS (
    SELECT user_id FROM orders JOIN scope USING(cafe_id)
    UNION SELECT user_id FROM reservations JOIN scope USING(cafe_id)
    UNION SELECT user_id FROM loyalty_balances JOIN scope USING(cafe_id)
  )
  SELECT u.id,u.name,u.phone,u.email,u.suspended,COALESCE(b.points,0) points,
    (SELECT t.name FROM loyalty_tiers t WHERE t.cafe_id=s.cafe_id AND t.threshold<=b.points
     ORDER BY t.threshold DESC LIMIT 1) tier
  FROM customers JOIN users u ON u.id=customers.user_id CROSS JOIN scope s
  LEFT JOIN loyalty_balances b ON b.user_id=u.id AND b.cafe_id=s.cafe_id
  WHERE u.account_kind='member'`;

export function cafeCustomers(user: User, cafeId: string, params: URLSearchParams) {
  ownerCafe(user, cafeId);
  const page = v.integer(params.get('page') ?? 1, 'صفحه', 1, 1000000);
  const search = v.text(params.get('q') ?? '', 'جستجوی مشتری', 0, 254);
  const pageSize = 20;
  const rows = all<Customer>(
    customerRows +
      ` AND (instr(lower(u.name),lower(?))>0 OR instr(u.phone,?)>0 OR instr(lower(u.email),lower(?))>0)
      ORDER BY u.name COLLATE NOCASE,u.id LIMIT ? OFFSET ?`,
    cafeId,
    search,
    latin(search),
    search,
    pageSize + 1,
    (page - 1) * pageSize,
  );
  return { customers: rows.slice(0, pageSize), page, has_more: rows.length > pageSize };
}

// Callers have established ownership of this café. Never look up a profile by user ID alone.
function customerAtCafe(cafeId: string, userId: string) {
  const customer = one<Customer>(customerRows + ' AND u.id=?', cafeId, userId);
  v.ensure(customer, 'این مشتری در این کافه پیدا نشد.', 404);
  return customer;
}

export function adjustCafeCustomer(
  user: User,
  cafeId: string,
  userId: string,
  input: Record<string, unknown>,
) {
  const requestKey = v.text(input.request_key, 'شناسه درخواست', 8, 100);
  return transaction(() => {
    const cafe = ownerCafe(user, cafeId);
    v.ensure(
      !cafe.is_demo && one('SELECT 1 FROM loyalty_programs WHERE cafe_id=?', cafeId),
      'ابتدا باشگاه را تنظیم کنید.',
      409,
    );
    const customer = customerAtCafe(cafeId, userId);
    v.ensure(!customer.suspended, 'حساب مشتری غیرفعال است.', 409);
    adjustMemberPoints(cafeId, userId, input, 'adjust:' + user.id + ':' + requestKey);
  });
}

export function cafeCustomerProfile(user: User, cafeId: string, userId: string) {
  ownerCafe(user, cafeId);
  const customer = customerAtCafe(cafeId, userId);
  const purchase = one<{ count: number; total: number }>(
    "SELECT COUNT(*) count,COALESCE(SUM(total),0) total FROM orders WHERE cafe_id=? AND user_id=? AND status='completed'",
    cafeId,
    userId,
  )!;
  return {
    customer,
    purchase,
    can_adjust:
      !customer.suspended && Boolean(one('SELECT 1 FROM loyalty_programs WHERE cafe_id=?', cafeId)),
    orders: all<{ id: string; status: string; total: number; created_at: string }>(
      'SELECT id,status,total,created_at FROM orders WHERE cafe_id=? AND user_id=? ORDER BY created_at DESC,id DESC LIMIT 50',
      cafeId,
      userId,
    ),
    reservations: all<{ id: string; status: string; date: string; time: string; guests: number }>(
      'SELECT id,status,date,time,guests FROM reservations WHERE cafe_id=? AND user_id=? ORDER BY date DESC,time DESC,id DESC LIMIT 50',
      cafeId,
      userId,
    ),
    ledger: all<{ id: string; delta: number; reason: string; created_at: string }>(
      'SELECT id,delta,reason,created_at FROM loyalty_ledger WHERE cafe_id=? AND user_id=? ORDER BY created_at DESC,id DESC LIMIT 50',
      cafeId,
      userId,
    ),
  };
}
