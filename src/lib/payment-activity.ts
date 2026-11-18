import { requireCafeAccess } from './cafe-access';
import { cafeById } from './commerce';
import { all } from './database';
import type { Order, User } from './types';
import { ensure } from './validation';

type AttemptStatus = 'creating' | 'pending' | 'unknown' | 'paid' | 'failed';
export type PaymentActivity = {
  id: string;
  order_id: string;
  kind: Order['kind'];
  payment_status: Order['payment_status'];
  status: AttemptStatus;
  amount_rial: number;
  ref_id: string;
  sandbox: number;
  created_at: number;
};
export function paymentActivity(user: User, cafeId: string, status = '') {
  requireCafeAccess(user, cafeById(cafeId), 'accounting');
  ensure(
    !status || ['creating', 'pending', 'unknown', 'paid', 'failed'].includes(status),
    'وضعیت تراکنش معتبر نیست.',
  );
  return all<PaymentActivity>(
    `SELECT p.id,p.order_id,p.status,p.amount_rial,p.ref_id,p.sandbox,p.created_at,o.kind,o.payment_status
     FROM payments p JOIN orders o ON o.id=p.order_id
     WHERE o.cafe_id=? AND (?='' OR p.status=?) ORDER BY p.created_at DESC,p.id DESC LIMIT 100`,
    cafeId,
    status,
    status,
  );
}
