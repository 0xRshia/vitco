import { all, one } from './database';
import type { Cafe, User } from './types';
import { ensure } from './validation';

export const staffRoles = ['manager', 'cashier', 'waiter', 'kitchen'] as const;
type StaffRole = (typeof staffRoles)[number];
export type CafePermission = 'orders' | 'reservations' | 'cashier' | 'meetings' | 'accounting';

const permissions: Record<CafePermission, StaffRole[]> = {
  orders: ['manager', 'kitchen', 'cashier', 'waiter'],
  reservations: ['manager'],
  cashier: ['manager', 'cashier', 'waiter'],
  meetings: ['manager'],
  accounting: ['manager'],
};

export function cafeAccess(
  user: User | null,
  cafe: Pick<Cafe, 'id' | 'owner_id'>,
  permission: CafePermission,
) {
  if (!user || !cafe.owner_id) return false;
  if (cafe.owner_id === user.id) return true;
  const staff = one<{ role: StaffRole }>(
    'SELECT role FROM cafe_staff WHERE cafe_id=? AND user_id=?',
    cafe.id,
    user.id,
  );
  return Boolean(staff && permissions[permission].includes(staff.role));
}

export function requireCafeAccess(user: User, cafe: Cafe, permission: CafePermission) {
  ensure(cafeAccess(user, cafe, permission), 'دسترسی به این بخش از کافه مجاز نیست.', 403);
}

export function serviceLocations(user: User) {
  return all<{ id: string; name: string; parent_id: string | null; role: StaffRole | 'owner' }>(
    `SELECT c.id,c.name,c.parent_id,CASE WHEN c.owner_id=? THEN 'owner' ELSE s.role END role
     FROM cafes c LEFT JOIN cafe_staff s ON s.cafe_id=c.id AND s.user_id=?
     WHERE c.is_demo=0 AND (c.owner_id=? OR s.user_id IS NOT NULL) ORDER BY c.name`,
    user.id,
    user.id,
    user.id,
  );
}

export function platformAdmin(user: User | null) {
  return Boolean(
    user && process.env.PLATFORM_ADMIN_USER_ID && user.id === process.env.PLATFORM_ADMIN_USER_ID,
  );
}

export function cafeHours(cafe: Cafe, date: string) {
  const weekday = new Date(date + 'T12:00:00Z').getUTCDay();
  const schedule = one<{ opens: string; closes: string }>(
    'SELECT opens,closes FROM cafe_hours WHERE cafe_id=? AND weekday=?',
    cafe.id,
    weekday,
  );
  return schedule ?? { opens: cafe.opens, closes: cafe.closes };
}
