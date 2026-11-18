import { notify, passwordMatches, sendCode, verifyCode } from './auth';
import { platformAdmin } from './cafe-access';
import { all, one, run, transaction } from './database';
import { latin } from './format';
import { flushTelegram, telegramStatus } from './telegram';
import { expireEventHolds } from './event-registration';
import type { User } from './types';
import * as v from './validation';

export function customerSettings(user: User) {
  const prefs = one<{ reminders: number; telegram: number }>(
    'SELECT reminders,telegram FROM notification_preferences WHERE user_id=?',
    user.id,
  );
  const auth = one<{ password: string | null }>('SELECT password FROM users WHERE id=?', user.id);
  return {
    reminders: prefs ? Boolean(prefs.reminders) : true,
    telegram: Boolean(prefs?.telegram),
    bot: telegramStatus(user),
    google_linked: Boolean(one('SELECT 1 FROM google_accounts WHERE user_id=?', user.id)),
    password_set: Boolean(auth?.password),
  };
}
export function savePreferences(user: User, input: Record<string, unknown>) {
  run(
    `INSERT INTO notification_preferences(user_id,reminders,telegram) VALUES (?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET reminders=excluded.reminders,telegram=excluded.telegram`,
    user.id,
    Number(input.reminders === true),
    Number(input.telegram === true),
  );
  if (input.telegram !== true)
    run("UPDATE telegram_outbox SET state='skipped' WHERE user_id=? AND state='pending'", user.id);
}
export async function updatePhone(user: User, input: Record<string, unknown>, verify: boolean) {
  const phone = v.phone(input.phone);
  v.ensure(
    !one('SELECT 1 FROM users WHERE phone=? AND id<>?', phone, user.id),
    'شماره همراه در حساب دیگری ثبت شده است.',
    409,
  );
  if (!verify) {
    await sendCode(phone, 'phone', user.id);
    return;
  }
  const code = latin(v.text(input.code, 'کد تأیید', 6, 6));
  verifyCode(phone, 'phone:' + user.id, code);
  transaction(() => {
    v.ensure(
      !one('SELECT 1 FROM users WHERE phone=? AND id<>?', phone, user.id),
      'شماره همراه در حساب دیگری ثبت شده است.',
      409,
    );
    run('UPDATE users SET phone=? WHERE id=?', phone, user.id);
  });
}
export function closeAccount(user: User, input: Record<string, unknown>) {
  transaction(() => {
    const row = one<{ password: string | null }>('SELECT password FROM users WHERE id=?', user.id);
    v.ensure(
      row && !platformAdmin(user) && user.id !== process.env.SUPPORT_USER_ID,
      'این حساب باید از طریق پشتیبانی مدیریت شود.',
      409,
    );
    if (row.password)
      v.ensure(
        passwordMatches(v.text(input.password, 'رمز عبور', 1, 128), row.password),
        'رمز عبور صحیح نیست.',
        401,
      );
    else v.ensure(input.confirm === 'بستن حساب', 'عبارت «بستن حساب» را وارد کنید.');
    v.ensure(
      !one('SELECT 1 FROM cafes WHERE owner_id=?', user.id),
      'برای بستن حساب مالک کافه با پشتیبانی هماهنگ کنید.',
      409,
    );
    v.ensure(
      !one(
        "SELECT 1 FROM orders WHERE user_id=? AND (status IN ('pending','approved','preparing','ready','delivering') OR payment_status IN ('pending','refund_required'))",
        user.id,
      ),
      'ابتدا سفارش‌ها و پرداخت‌های در جریان را پیگیری کنید.',
      409,
    );
    v.ensure(
      !one(
        "SELECT 1 FROM reservations WHERE user_id=? AND status IN ('pending','confirmed') AND unixepoch(date||'T'||time||':00+03:30')+3600>unixepoch('now')",
        user.id,
      ),
      'ابتدا رزروهای آینده را لغو کنید.',
      409,
    );
    v.ensure(
      !one(
        "SELECT 1 FROM meetings WHERE host_id=? AND status IN ('pending','scheduled') AND ends_at>?",
        user.id,
        new Date().toISOString(),
      ),
      'ابتدا دورهمی‌های فعال خود را لغو کنید.',
      409,
    );
    v.ensure(
      !one(
        `SELECT 1 FROM event_registrations r JOIN events e ON e.id=r.event_id WHERE
      r.user_id=? AND r.status='registered' AND unixepoch(e.date||'T'||COALESCE(NULLIF(e.end_time,''),e.time)||':00+03:30')>unixepoch('now')`,
        user.id,
      ),
      'ابتدا ثبت‌نام رویدادهای آینده را لغو کنید.',
      409,
    );
    for (const table of [
      'sessions',
      'addresses',
      'favorites',
      'cafe_staff',
      'telegram_links',
      'telegram_tokens',
      'telegram_outbox',
      'google_accounts',
      'notification_preferences',
      'notifications',
    ])
      run('DELETE FROM ' + table + ' WHERE user_id=?', user.id);
    run(
      'DELETE FROM auth_codes WHERE target IN (?,?) OR purpose=?',
      user.email,
      user.phone,
      'phone:' + user.id,
    );
    run("UPDATE meeting_members SET status='left' WHERE user_id=? AND status='active'", user.id);
    run(
      "UPDATE users SET name='حساب بسته شده',email=NULL,phone=NULL,password=NULL,avatar='',suspended=1,account_kind='closed' WHERE id=?",
      user.id,
    );
  });
}
type Due = {
  kind: string;
  id: string;
  user_id: string;
  starts_at: string;
  title: string;
  href: string;
};
export function issueReminders() {
  const reminders = all<Due>(`SELECT * FROM (
     SELECT 'reservation' kind,r.id,r.user_id,r.date||'T'||r.time||':00+03:30' starts_at,c.name title,'/reservations/'||r.id href
       FROM reservations r JOIN cafes c ON c.id=r.cafe_id WHERE r.status='confirmed'
     UNION ALL
     SELECT 'event',e.id,r.user_id,e.date||'T'||e.time||':00+03:30',e.title,'/events/'||e.id
       FROM event_registrations r JOIN events e ON e.id=r.event_id WHERE e.status='published' AND r.status='registered'
     UNION ALL
     SELECT 'meeting',m.id,j.user_id,m.starts_at,m.title,'/meetings/'||m.id
       FROM meeting_members j JOIN meetings m ON m.id=j.meeting_id WHERE m.status='scheduled' AND j.status='active'
   ) due WHERE unixepoch(starts_at)>unixepoch('now') AND unixepoch(starts_at)<=unixepoch('now')+86400
     AND NOT EXISTS(SELECT 1 FROM registration_reminders r WHERE r.kind=due.kind AND r.target_id=due.id AND r.user_id=due.user_id AND r.starts_at=due.starts_at)
     AND EXISTS(SELECT 1 FROM users u WHERE u.id=due.user_id AND u.suspended=0)
     AND NOT EXISTS(SELECT 1 FROM notification_preferences p WHERE p.user_id=due.user_id AND p.reminders=0)
     ORDER BY starts_at LIMIT 500`);
  transaction(() => {
    for (const item of reminders) {
      const added = run(
        'INSERT OR IGNORE INTO registration_reminders(kind,target_id,user_id,starts_at) VALUES (?,?,?,?)',
        item.kind,
        item.id,
        item.user_id,
        item.starts_at,
      );
      if (added.changes) notify(item.user_id, 'یادآوری قرار پیش رو', item.title, item.href);
    }
  });
}
export function startCustomerJobs() {
  const state = globalThis as typeof globalThis & {
    vitcoCustomerJobs?: ReturnType<typeof setInterval>;
  };
  if (state.vitcoCustomerJobs) return;
  let running = false;
  state.vitcoCustomerJobs = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      expireEventHolds();
      issueReminders();
      await flushTelegram();
    } catch {
      console.error('Vitco notification jobs failed');
    } finally {
      running = false;
    }
  }, 60000);
  state.vitcoCustomerJobs.unref();
}
