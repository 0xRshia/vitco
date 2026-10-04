import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
  randomInt,
} from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';
import { one, run } from './database';
import type { User } from './types';
import { AppError, ensure } from './validation';

export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export function passwordHash(password: string) {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + scryptSync(password, salt, 64).toString('hex');
}
export function passwordMatches(password: string, stored: string) {
  const [salt, key] = stored.split(':');
  if (!salt || !key) return false;
  const computed = scryptSync(password, salt, 64);
  const previous = Buffer.from(key, 'hex');
  return computed.length === previous.length && timingSafeEqual(computed, previous);
}
export function currentUser(request: NextRequest): User | null {
  const token = request.cookies.get('vitrin_session')?.value;
  if (!token) return null;
  return (
    one<User>(
      "SELECT u.id,u.name,COALESCE(u.email,'') email,COALESCE(u.phone,'') phone,u.points,u.avatar FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?",
      hash(token),
      Date.now(),
    ) || null
  );
}
export function requireUser(request: NextRequest) {
  const user = currentUser(request);
  ensure(user, 'برای ادامه وارد حساب خود شوید.', 401);
  return user;
}
export function createSession(userId: string, response: NextResponse) {
  const token = randomBytes(32).toString('hex');
  run('DELETE FROM sessions WHERE expires<?', Date.now());
  run(
    'INSERT INTO sessions (token,user_id,expires) VALUES (?,?,?)',
    hash(token),
    userId,
    Date.now() + 30 * 86400000,
  );
  response.cookies.set('vitrin_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure:
      process.env.NODE_ENV === 'production' &&
      process.env.APP_ORIGIN?.startsWith('https:') === true,
    path: '/',
    maxAge: 30 * 86400,
  });
}
export function limit(key: string, maximum = 15, seconds = 900) {
  const now = Date.now();
  run('DELETE FROM rate_limits WHERE expires<?', now);
  const row = one<{ count: number }>('SELECT count FROM rate_limits WHERE key=?', key);
  ensure(!row || row.count < maximum, 'تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.', 429);
  run(
    'INSERT INTO rate_limits (key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1',
    key,
    now + seconds * 1000,
  );
}
export function checkOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  const expected = process.env.APP_ORIGIN || request.nextUrl.origin;
  ensure(!origin || origin === expected, 'درخواست از این نشانی مجاز نیست.', 403);
  ensure(request.headers.get('sec-fetch-site') !== 'cross-site', 'درخواست مجاز نیست.', 403);
}
export function notify(userId: string, title: string, body: string, href: string) {
  run(
    'INSERT INTO notifications (id,user_id,title,body,href,created_at) VALUES (?,?,?,?,?,?)',
    randomUUID(),
    userId,
    title,
    body,
    href,
    new Date().toISOString(),
  );
}
export const smsAvailable = () =>
  Boolean(process.env.KAVENEGAR_API_KEY && process.env.KAVENEGAR_TEMPLATE);
export const mailAvailable = () => Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
export async function sendCode(target: string, purpose: 'phone' | 'reset') {
  ensure(
    purpose === 'phone' ? smsAvailable() : mailAvailable(),
    purpose === 'phone'
      ? 'ورود پیامکی هنوز فعال نشده است. از ورود با ایمیل استفاده کنید.'
      : 'بازیابی رمز از طریق ایمیل هنوز فعال نشده است.',
    503,
  );
  limit('code:' + target, 3, 600);
  const code = String(randomInt(100000, 1000000));
  try {
    if (purpose === 'phone') {
      const res = await fetch(
        `https://api.kavenegar.com/v1/${process.env.KAVENEGAR_API_KEY}/verify/lookup.json`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            receptor: target,
            token: code,
            template: process.env.KAVENEGAR_TEMPLATE!,
          }),
          signal: AbortSignal.timeout(15000),
        },
      );
      const data = await res.json();
      ensure(
        res.ok && data.return?.status === 200,
        'ارسال پیامک انجام نشد. دوباره تلاش کنید.',
        502,
      );
    } else {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.MAIL_FROM,
          to: [target],
          subject: 'بازیابی رمز عبور ویترین کافه',
          text: `کد بازیابی رمز عبور شما: ${code}\nاین کد تا ده دقیقه معتبر است. اگر این درخواست را ثبت نکرده‌اید، این پیام را نادیده بگیرید.`,
        }),
        signal: AbortSignal.timeout(15000),
      });
      ensure(res.ok, 'ارسال ایمیل انجام نشد. دوباره تلاش کنید.', 502);
    }
    run(
      'INSERT INTO auth_codes (target,purpose,hash,expires,attempts) VALUES (?,?,?,?,0) ON CONFLICT(target,purpose) DO UPDATE SET hash=excluded.hash,expires=excluded.expires,attempts=0',
      target,
      purpose,
      hash(target + code),
      Date.now() + 600000,
    );
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('ارتباط با سرویس ارسال برقرار نشد.', 502);
  }
}
export function verifyCode(target: string, purpose: string, code: string) {
  const row = one<{ hash: string; expires: number; attempts: number }>(
    'SELECT * FROM auth_codes WHERE target=? AND purpose=?',
    target,
    purpose,
  );
  ensure(
    row && row.expires > Date.now() && row.attempts < 5,
    'کد منقضی شده است. کد جدید درخواست کنید.',
  );
  run('UPDATE auth_codes SET attempts=attempts+1 WHERE target=? AND purpose=?', target, purpose);
  ensure(
    timingSafeEqual(Buffer.from(row.hash), Buffer.from(hash(target + code))),
    'کد واردشده صحیح نیست.',
  );
  run('DELETE FROM auth_codes WHERE target=? AND purpose=?', target, purpose);
}
