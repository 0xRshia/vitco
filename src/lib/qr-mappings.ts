import { randomUUID } from 'node:crypto';
import { hash } from './auth';
import { all, one, run, transaction } from './database';
import { cafeById, ownerCafe } from './commerce';
import { cafeLinkId, storefrontRedirect } from './cafe-links';
import { bindTable, currentTableCode, detachTable, issueTableCode } from './table-service';
import { disabledTables } from './table-states';
import { recordQrScan, type QrTarget } from './qr-activity';
import type { User } from './types';
import * as v from './validation';

export type QrMapping = {
  id: string;
  display_url: string;
  target: QrTarget;
  table_id: string;
  enabled: number;
};
const referenceHosts = new Set(['vitrincafe.ir', 'www.vitrincafe.ir']);
const qrPart = /^[a-zA-Z0-9_-]{1,100}$/;

function normalizedQr(value: unknown, origin: string) {
  const raw = v.text(value, 'پیوند QR', 1, 2000);
  let url: URL | undefined;
  try {
    url = new URL(
      /^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('/') ? raw : 'https://' + raw,
      origin,
    );
  } catch {}
  v.ensure(
    url && ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password,
    'نشانی QR باید یک پیوند HTTP یا HTTPS معتبر باشد.',
  );
  url.hash = '';
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_.+|fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return url;
}

export function qrMappings(user: User, cafeId: string) {
  ownerCafe(user, cafeId);
  return all<QrMapping>(
    'SELECT id,display_url,target,table_id,enabled FROM qr_aliases WHERE cafe_id=? ORDER BY display_url',
    cafeId,
  );
}

export function saveQrMapping(
  user: User,
  cafeId: string,
  origin: string,
  input: Record<string, unknown>,
) {
  const cafe = ownerCafe(user, cafeId);
  v.ensure(!cafe.is_demo, 'کد QR برای کافه آزمایشی در دسترس نیست.', 409);
  const existingId = v.text(input.id ?? '', 'کد QR', 0, 100);
  if (existingId) {
    const result =
      input.remove === true
        ? run('DELETE FROM qr_aliases WHERE id=? AND cafe_id=?', existingId, cafeId)
        : run(
            'UPDATE qr_aliases SET enabled=? WHERE id=? AND cafe_id=?',
            Number(input.enabled === true),
            existingId,
            cafeId,
          );
    v.ensure(result.changes, 'کد QR پیدا نشد.', 404);
    return;
  }
  const url = normalizedQr(input.url, origin);
  const segments = url.pathname.split('/').filter(Boolean);
  v.ensure(
    url.origin !== origin &&
      !(referenceHosts.has(url.hostname) && storefrontRedirect(segments, true)),
    'این پیوند از قبل در سامانه شناخته می‌شود.',
    409,
  );
  const target = input.target;
  v.ensure(
    target === 'menu' || target === 'reservation' || target === 'table' || target === 'cashier',
    'مقصد کد QR معتبر نیست.',
  );
  const tableId =
    target === 'table' || target === 'cashier' ? v.text(input.table_id, 'میز', 1, 100) : '';
  transaction(() => {
    const key = hash(url.href);
    v.ensure(
      !one('SELECT 1 FROM qr_aliases WHERE url_hash=?', key),
      'این پیوند قبلاً ثبت شده است.',
      409,
    );
    if (tableId) {
      v.ensure(
        cafe.tables.some((table) => table.id === tableId && table.enabled !== false) &&
          !disabledTables(cafeId).has(tableId),
        'میز فعال پیدا نشد.',
        404,
      );
      if (!currentTableCode(cafeId, tableId)) issueTableCode(cafeId, tableId);
    }
    run(
      'INSERT INTO qr_aliases(id,cafe_id,url_hash,display_url,target,table_id) VALUES(?,?,?,?,?,?)',
      randomUUID(),
      cafeId,
      key,
      url.host + url.pathname,
      target,
      tableId,
    );
  });
}

export function resolveQr(value: unknown, origin: string, previous: string | undefined) {
  const url = normalizedQr(value, origin);
  const parts = url.pathname.split('/').filter(Boolean);
  const local = url.origin === origin;
  const alias =
    (!local &&
      one<QrMapping & { cafe_id: string }>(
        'SELECT id,display_url,target,table_id,enabled,cafe_id FROM qr_aliases WHERE url_hash=? AND enabled=1',
        hash(url.href),
      )) ||
    null;
  if (alias) {
    const cafe = cafeById(alias.cafe_id);
    v.ensure(cafe.active && cafe.owner_id && !cafe.is_demo, 'این کافه در دسترس نیست.', 404);
    if (alias.target === 'table' || alias.target === 'cashier') {
      const code = currentTableCode(cafe.id, alias.table_id);
      v.ensure(code, 'کد میز در دسترس نیست.', 404);
      const { token } = bindTable(code, previous, alias.target);
      return {
        href: '/cafes/' + cafe.id + (alias.target === 'cashier' ? '#table-service' : ''),
        token,
      };
    }
    detachTable(previous);
    recordQrScan(cafe.id, alias.target);
    return {
      href: alias.target === 'reservation' ? '/reserve?cafe=' + cafe.id : '/cafes/' + cafe.id,
    };
  }

  if (local && parts.length === 2 && parts[0] === 't') {
    const { table, token } = bindTable(parts[1], previous, 'table');
    return { href: '/cafes/' + table.cafe_id, token };
  }
  if (local && parts.length === 2 && parts[0] === 'products' && qrPart.test(parts[1]))
    return { href: '/products/' + parts[1] };

  const reference = referenceHosts.has(url.hostname);
  const href = local || reference ? storefrontRedirect(parts, reference) : null;
  if (href) {
    detachTable(previous);
    return { href };
  }
  if (local && parts.length === 2 && parts[0] === 'cafes') {
    const id = cafeLinkId(parts[1]);
    v.ensure(id, 'صفحه کافه پیدا نشد.', 404);
    const cafe = cafeById(id);
    detachTable(previous);
    if (cafe.active && cafe.owner_id && !cafe.is_demo) recordQrScan(cafe.id, 'menu');
    return { href: '/cafes/' + cafe.id };
  }
  throw new v.AppError('این کد QR در ویتکو ثبت نشده است.', 404);
}
