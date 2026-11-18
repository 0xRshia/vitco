import { randomBytes, timingSafeEqual } from 'node:crypto';
import { hash } from './auth';
import { all, one, run, transaction } from './database';
import type { User } from './types';
import * as v from './validation';

function config() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const name = process.env.TELEGRAM_BOT_USERNAME?.trim();
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  const origin = process.env.APP_ORIGIN?.trim();
  if (
    !token ||
    !/^[0-9]+:[a-zA-Z0-9_-]{20,}$/.test(token) ||
    !name ||
    !/^[a-zA-Z0-9_]{5,32}$/.test(name) ||
    !secret ||
    !/^[a-zA-Z0-9_-]{24,256}$/.test(secret) ||
    !origin ||
    !origin.startsWith('https:')
  )
    return null;
  try {
    return new URL(origin).origin === origin ? { token, name, secret, origin } : null;
  } catch {
    return null;
  }
}
export const telegramAvailable = () => Boolean(config());
export function telegramStatus(user: User) {
  const link = one<{ linked_at: string }>(
    'SELECT linked_at FROM telegram_links WHERE user_id=?',
    user.id,
  );
  return { available: telegramAvailable(), linked_at: link?.linked_at ?? null };
}
export function linkTelegram(user: User) {
  const bot = config();
  v.ensure(bot, 'اتصال تلگرام هنوز فعال نشده است.', 503);
  const key = randomBytes(32).toString('base64url');
  transaction(() => {
    run('DELETE FROM telegram_tokens WHERE expires<=? OR user_id=?', Date.now(), user.id);
    run(
      'INSERT INTO telegram_tokens(token_hash,user_id,expires) VALUES (?,?,?)',
      hash(key),
      user.id,
      Date.now() + 10 * 60000,
    );
  });
  return 'https://t.me/' + bot.name + '?start=' + key;
}
export function unlinkTelegram(user: User) {
  transaction(() => {
    run('DELETE FROM telegram_links WHERE user_id=?', user.id);
    run('DELETE FROM telegram_tokens WHERE user_id=?', user.id);
    run("UPDATE telegram_outbox SET state='skipped' WHERE user_id=? AND state='pending'", user.id);
  });
}
export function telegramWebhook(header: string | null, input: Record<string, unknown>) {
  const bot = config();
  v.ensure(
    bot &&
      header &&
      timingSafeEqual(Buffer.from(hash(bot.secret), 'hex'), Buffer.from(hash(header), 'hex')),
    'درخواست معتبر نیست.',
    403,
  );
  if (!input.message || typeof input.message !== 'object') return;
  const message = v.object(input.message);
  if (!message.chat || typeof message.chat !== 'object' || typeof message.text !== 'string') return;
  const chat = v.object(message.chat),
    key = message.text.match(/^\/start ([A-Za-z0-9_-]{43})$/)?.[1];
  if (chat.type !== 'private' || !Number.isSafeInteger(chat.id) || Number(chat.id) <= 0 || !key)
    return;
  transaction(() => {
    const matched = one<{ user_id: string }>(
      `SELECT t.user_id FROM telegram_tokens t JOIN users u ON u.id=t.user_id
      WHERE token_hash=? AND expires>? AND u.suspended=0`,
      hash(key),
      Date.now(),
    );
    if (!matched) return;
    const chatId = String(chat.id);
    if (one('SELECT 1 FROM telegram_links WHERE chat_id=? AND user_id<>?', chatId, matched.user_id))
      return;
    run('DELETE FROM telegram_tokens WHERE user_id=?', matched.user_id);
    run(
      `INSERT INTO telegram_links(user_id,chat_id,linked_at) VALUES (?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET chat_id=excluded.chat_id,linked_at=excluded.linked_at`,
      matched.user_id,
      chatId,
      new Date().toISOString(),
    );
  });
}
type Delivery = {
  notification_id: string;
  user_id: string;
  title: string;
  href: string;
  chat_id: string;
  attempts: number;
};
export async function flushTelegram() {
  const bot = config();
  if (!bot) return;
  const now = Date.now(),
    old = now - 86400000;
  run('DELETE FROM telegram_outbox WHERE created_at<?', old);
  const rows = all<Delivery>(
    `SELECT o.notification_id,o.user_id,n.title,n.href,l.chat_id,o.attempts
    FROM telegram_outbox o JOIN notifications n ON n.id=o.notification_id
    JOIN telegram_links l ON l.user_id=o.user_id JOIN notification_preferences p ON p.user_id=o.user_id
    JOIN users u ON u.id=o.user_id
    WHERE o.state='pending' AND o.next_attempt<=? AND p.telegram=1 AND u.suspended=0 ORDER BY o.created_at LIMIT 20`,
    now,
  );
  for (const row of rows) {
    // A lost transport result is ambiguous. Automatic retries are for explicit rate limits only.
    if (
      !run(
        "UPDATE telegram_outbox SET state='sending',attempts=attempts+1 WHERE notification_id=? AND state='pending'",
        row.notification_id,
      ).changes
    )
      continue;
    let state = 'failed',
      retryAt = 0;
    try {
      const link = new URL(row.href, bot.origin);
      const delivery = await fetch('https://api.telegram.org/bot' + bot.token + '/sendMessage', {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: row.chat_id,
          text: row.title + '\n' + (link.origin === bot.origin ? link.href : bot.origin),
          link_preview_options: { is_disabled: true },
        }),
      });
      const outcome = (await delivery.json()) as {
        ok?: boolean;
        parameters?: { retry_after?: number };
      };
      if (delivery.ok && outcome.ok) state = 'sent';
      if (delivery.status === 429 && row.attempts < 4) {
        state = 'pending';
        retryAt = Date.now() + Math.max(10, Number(outcome.parameters?.retry_after) || 60) * 1000;
      }
    } catch {
      /* Delivery status is uncertain, so do not issue a duplicate send. */
    }
    run(
      'UPDATE telegram_outbox SET state=?,next_attempt=? WHERE notification_id=?',
      state,
      retryAt,
      row.notification_id,
    );
  }
}
