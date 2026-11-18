import { one, run } from './database';
import { isCafeOnlinePayable, zarinpalPublicConfig } from './zarinpal';
import { ensure } from './validation';

function intakeEnabled() {
  return one<{ enabled: number }>('SELECT enabled FROM payment_intake WHERE id=1')?.enabled !== 0;
}
export function cafeAcceptsPayments(cafeId: string) {
  return isCafeOnlinePayable(cafeId) && intakeEnabled();
}
export function publicPaymentAvailability() {
  const config = zarinpalPublicConfig();
  return { ...config, available: config.available && intakeEnabled() };
}
export function paymentIntakeSettings() {
  const config = zarinpalPublicConfig();
  return { enabled: intakeEnabled(), configured: config.available, sandbox: config.sandbox };
}
export function updatePaymentIntake(enabled: unknown) {
  ensure(typeof enabled === 'boolean', 'وضعیت پذیرش پرداخت را انتخاب کنید.');
  run(
    'INSERT INTO payment_intake(id,enabled) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled',
    Number(enabled),
  );
}
