import { latin } from './format';
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function ensure(condition: unknown, message: string, status = 400): asserts condition {
  if (!condition) throw new AppError(message, status);
}
export function object(value: unknown): Record<string, unknown> {
  ensure(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    'اطلاعات ارسالی معتبر نیست.',
  );
  return value as Record<string, unknown>;
}
export function text(value: unknown, label: string, min = 0, max = 500) {
  ensure(typeof value === 'string', `${label} را وارد کنید.`);
  const s = value.trim();
  ensure(
    s.length >= min && s.length <= max,
    `${label} باید بین ${min} و ${max} نویسه باشد.`.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]),
  );
  return s;
}
export function integer(value: unknown, label: string, min = 0, max = 1e9) {
  const n = typeof value === 'string' ? Number(latin(value)) : value;
  ensure(
    typeof n === 'number' && Number.isSafeInteger(n) && n >= min && n <= max,
    `${label} معتبر نیست.`,
  );
  return n;
}
export function flag(value: unknown) {
  return value === true || value === 1;
}
export function list(value: unknown, max = 50): unknown[] {
  ensure(Array.isArray(value) && value.length <= max, 'فهرست ارسالی معتبر نیست.');
  return value;
}
export function email(value: unknown) {
  const s = text(value, 'ایمیل', 3, 254).toLowerCase();
  ensure(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s), 'ایمیل معتبر وارد کنید.');
  return s;
}
export function phone(value: unknown) {
  const s = latin(text(value, 'شماره همراه', 11, 14)).replace(/^\+98/, '0');
  ensure(/^09\d{9}$/.test(s), 'شماره همراه معتبر وارد کنید.');
  return s;
}
export function date(value: unknown) {
  const s = text(value, 'تاریخ', 10, 10);
  ensure(
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
      !Number.isNaN(new Date(s).getTime()) &&
      new Date(s).toISOString().slice(0, 10) === s,
    'تاریخ معتبر نیست.',
  );
  return s;
}
export function time(value: unknown) {
  const s = latin(text(value, 'ساعت', 5, 5));
  ensure(/^([01]\d|2[0-3]):[0-5]\d$/.test(s), 'ساعت معتبر نیست.');
  return s;
}
export function coordinate(value: unknown, min: number, max: number) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  ensure(Number.isFinite(n) && n >= min && n <= max, 'مختصات معتبر نیست.');
  return n;
}
export function imagePath(value: unknown) {
  const s = text(value ?? '', 'تصویر', 0, 200);
  ensure(
    !s || /^\/api\/media\/[a-f0-9-]+\.(png|jpg|webp)$/.test(s),
    'تصویر را از دستگاه بارگذاری کنید.',
  );
  return s;
}
