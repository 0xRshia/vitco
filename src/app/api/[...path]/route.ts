import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { all, one, run, hydrate, transaction } from '@/lib/database';
import {
  currentUser,
  logoutOtherSessions,
  requireUser,
  createSession,
  passwordHash,
  passwordMatches,
  checkOrigin,
  limit,
  hash,
  sendCode,
  verifyCode,
  smsAvailable,
  mailAvailable,
  notify,
} from '@/lib/auth';
import * as v from '@/lib/validation';
import { latin, today } from '@/lib/format';
import {
  cafeById,
  cafeSql,
  ownerCafe,
  productById,
  quote,
  createOrder,
  transitionOrder,
  availableSlots,
  availableTables,
  createReservation,
  transitionReservation,
} from '@/lib/commerce';
import { ownerAnalytics } from '@/lib/owner-analytics';
import { topOrderedProducts } from '@/lib/home-ranking';
import { adjustCategoryPrices } from '@/lib/pricing';
import { productCategory } from '@/lib/catalog';
import { publicPaymentAvailability } from '@/lib/payment-intake';
import { startPayment, checkPayment, paymentCallback } from '@/lib/payments';
import { quoteInvoice, createInvoice } from '@/lib/invoices';
import { syncCafeDirectory } from '@/lib/cafe-directory';
import {
  bindTable,
  latestCashierCall,
  requestCashier,
  tableContext,
  tableGuest,
  visitCookie,
  visitSeconds,
} from '@/lib/table-service';
import { operationsApi } from '@/lib/operations-api';
import { resolveQr } from '@/lib/qr-mappings';
import { ensureTableCanDisable } from '@/lib/table-states';
import { menuCategoriesFor, publicBranches, workingHours } from '@/lib/cafe-operations';
import { platformAdmin, cafeHours } from '@/lib/cafe-access';
import {
  changeMeeting,
  meetingChat,
  meetingDetail,
  meetings,
  saveMeeting,
  writeMeetingChat,
} from '@/lib/meetings';
import { myLoyalty, redeemReward } from '@/lib/loyalty';
import {
  attendEvent,
  browseEvents,
  deleteDraftEvent,
  eventGuests,
  leaveEvent,
  listEvents,
  publicEvent,
  registerEvent,
  saveEvent,
  setEventState,
} from '@/lib/event-registration';
import { operatorTickets, readTicketForm, ticketsApi } from '@/lib/tickets';
import { googleAvailable, googleSignIn } from '@/lib/google-auth';
import {
  closeAccount,
  customerSettings,
  savePreferences,
  updatePhone,
} from '@/lib/customer-settings';
import { linkTelegram, telegramStatus, telegramWebhook, unlinkTelegram } from '@/lib/telegram';
import { cafeFeatures, complementaryItems } from '@/lib/cafe-features';
import {
  adminApi,
  paidHomeCafes,
  publicArticles,
  publicTestimonials,
  submitContact,
} from '@/lib/platform';
import type { Cafe, CafeTable, Product, Order, Reservation, User } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (value: unknown, status = 200) =>
  NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
function publicCafes() {
  return all(cafeSql + ' ORDER BY c.source ASC,c.name').map(hydrate<Cafe>);
}
function storeTableVisit(response: NextResponse, token: string, origin: string) {
  response.cookies.set(visitCookie, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: visitSeconds,
    secure: origin.startsWith('https:'),
  });
  return response;
}
const visibleProducts =
  'NOT EXISTS(SELECT 1 FROM menu_categories m WHERE m.cafe_id=p.cafe_id AND m.name=p.category AND visible=0)';
const orderSql =
  'SELECT o.*,c.name cafe_name,u.name customer_name FROM orders o JOIN cafes c ON c.id=o.cafe_id JOIN users u ON u.id=o.user_id';
const reservationSql =
  'SELECT r.*,c.name cafe_name,u.name customer_name,(SELECT id FROM orders WHERE reservation_id=r.id) order_id,(SELECT payment_method FROM orders WHERE reservation_id=r.id) payment_method,(SELECT payment_status FROM orders WHERE reservation_id=r.id) payment_status FROM reservations r JOIN cafes c ON c.id=r.cafe_id JOIN users u ON u.id=r.user_id';
function options(value: unknown) {
  return v.list(value ?? [], 10).map((item) => {
    const o = v.object(item);
    return {
      id: v.text(o.id || randomUUID(), 'شناسه', 1, 100),
      name: v.text(o.name, 'نام گزینه', 1, 80),
      price: v.integer(o.price, 'قیمت', 0, 100000000),
    };
  });
}
function cafeTables(value: unknown): CafeTable[] {
  const tables = v.list(value, 50).map((value) => {
    const table = v.object(value);
    return {
      id: v.text(table.id, 'شناسه میز', 1, 100),
      name: v.text(table.name, 'نام میز', 1, 80),
      seats: v.integer(table.seats, 'ظرفیت میز', 1, 20),
      vip: v.flag(table.vip),
      enabled: table.enabled !== false,
    };
  });
  v.ensure(
    new Set(tables.map((t) => t.id)).size === tables.length &&
      new Set(tables.map((t) => t.name)).size === tables.length,
    'نام و شناسه میزها نباید تکراری باشند.',
  );
  return tables;
}
function galleryImages(value: unknown) {
  const images = v.list(value, 10).map(v.imagePath);
  v.ensure(
    images.every(Boolean) && new Set(images).size === images.length,
    'تصاویر گالری باید معتبر و غیرتکراری باشند.',
  );
  return JSON.stringify(images);
}
async function handle(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  try {
    const { path } = await context.params;
    const [resource, id, action] = path;
    const method = request.method;
    if (method !== 'GET' && !(resource === 'telegram' && id === 'webhook')) checkOrigin(request);
    if (resource === 'media' && method === 'GET') {
      v.ensure(/^[a-f0-9-]+\.(png|jpg|webp)$/.test(id || ''), 'تصویر پیدا نشد.', 404);
      try {
        const bytes = await readFile(join(resolve('data/uploads'), id));
        return new NextResponse(bytes, {
          headers: {
            'Content-Type': id.endsWith('.png')
              ? 'image/png'
              : id.endsWith('.jpg')
                ? 'image/jpeg'
                : 'image/webp',
            'Cache-Control': 'public, max-age=31536000, immutable',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      } catch {
        throw new v.AppError('تصویر پیدا نشد.', 404);
      }
    }
    if (resource === 'upload' && method === 'POST') {
      const user = requireUser(request);
      limit('upload:' + user.id, 20, 3600);
      v.ensure(
        Number(request.headers.get('content-length') || 0) <= 5500000,
        'حداکثر حجم تصویر پنج مگابایت است.',
      );
      const form = await request.formData(),
        file = form.get('file');
      v.ensure(
        file instanceof File && file.size > 0 && file.size <= 5000000,
        'یک تصویر با حجم کمتر از پنج مگابایت انتخاب کنید.',
      );
      const bytes = Buffer.from(await file.arrayBuffer());
      const ext = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        ? 'png'
        : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          ? 'jpg'
          : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
            ? 'webp'
            : null;
      v.ensure(ext, 'فقط تصویر با قالب جی‌پی‌جی، پی‌ان‌جی یا وب‌پی پذیرفته می‌شود.');
      const name = randomUUID() + '.' + ext;
      await mkdir(resolve('data/uploads'), { recursive: true });
      await writeFile(join(resolve('data/uploads'), name), bytes);
      return json({ url: '/api/media/' + name });
    }
    if (
      resource === 'tickets' &&
      method === 'POST' &&
      request.headers.get('content-type')?.startsWith('multipart/form-data')
    ) {
      const account = requireUser(request);
      limit('ticket-attachments:' + account.id, 10, 60);
      const { input, attachments } = await readTicketForm(request);
      const response = ticketsApi(account, path, method, input, attachments);
      return response instanceof Response ? response : json(response, !id ? 201 : 200);
    }
    let input: Record<string, unknown> = {};
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      v.ensure(
        Number(request.headers.get('content-length') || 0) < 262144,
        'حجم درخواست بیش از حد مجاز است.',
        413,
      );
      const raw = await request.text();
      v.ensure(Buffer.byteLength(raw) < 262144, 'حجم درخواست بیش از حد مجاز است.', 413);
      try {
        input = v.object(JSON.parse(raw || '{}'));
      } catch (error) {
        if (error instanceof v.AppError) throw error;
        throw new v.AppError('اطلاعات ارسالی معتبر نیست.');
      }
    }
    const user = currentUser(request);
    if (resource === 'blog' && method === 'GET') {
      const params = request.nextUrl.searchParams;
      return json(publicArticles(id, params.get('category'), undefined, params));
    }
    if (resource === 'testimonials' && method === 'GET')
      return json({ testimonials: publicTestimonials() });
    if (resource === 'home' && path.length === 1 && method === 'GET')
      return json({ products: topOrderedProducts(), cafes: paidHomeCafes() });
    if (resource === 'contact-messages' && method === 'POST') {
      limit('contact:' + (user?.id || request.headers.get('x-real-ip') || 'public'), 12, 3600);
      return json(submitContact(id, input), 201);
    }
    if (
      resource === 'auth' &&
      id === 'google' &&
      method === 'GET' &&
      (!action || action === 'callback')
    ) {
      limit('google:' + (request.headers.get('x-real-ip') || 'public'), 150, 60);
      return await googleSignIn(request, user, action === 'callback');
    }
    if (resource === 'telegram' && id === 'webhook' && method === 'POST') {
      telegramWebhook(request.headers.get('x-telegram-bot-api-secret-token'), input);
      return json({ ok: true });
    }
    const tableToken = request.cookies.get(visitCookie)?.value;
    if (resource === 'scanner' && id === 'resolve' && method === 'POST' && !action) {
      const origin = process.env.APP_ORIGIN || request.nextUrl.origin;
      limit('table-scan:' + (request.headers.get('x-real-ip') || 'local'), 180, 60);
      const result = resolveQr(input.url, origin, tableToken);
      const response = json({ href: result.href });
      return result.token ? storeTableVisit(response, result.token, origin) : response;
    }
    if (resource === 'table') {
      if (method === 'GET' && !id) {
        const table = tableContext(tableToken);
        return json({ table, call: table ? latestCashierCall(tableToken) : null });
      }
      if (method === 'POST' && id === 'cashier') {
        limit('cashier:' + hash(tableToken || ''), 12, 60);
        return json({ id: requestCashier(tableToken) }, 201);
      }
      if (method === 'POST' && id) {
        limit('table-scan:' + (request.headers.get('x-real-ip') || 'local'), 180, 60);
        const { table, token } = bindTable(id, tableToken);
        return storeTableVisit(
          json({ table }),
          token,
          process.env.APP_ORIGIN || request.nextUrl.origin,
        );
      }
    }
    if (resource === 'meetings' && method === 'GET') {
      if (id && action !== 'messages') return json({ meeting: meetingDetail(id, user) });
      if (id && action === 'messages')
        return json({
          messages: meetingChat(
            requireUser(request),
            id,
            request.nextUrl.searchParams.get('before'),
          ),
        });
      return json({
        meetings: meetings(
          user,
          request.nextUrl.searchParams.get('cafe'),
          request.nextUrl.searchParams.get('mine') === '1',
        ),
      });
    }
    if (resource === 'events' && method === 'GET' && !action) {
      return json(
        id ? { event: publicEvent(user, id) } : browseEvents(user, request.nextUrl.searchParams),
      );
    }
    if (resource === 'table-checkout' && method === 'POST') {
      const table = tableContext(tableToken);
      v.ensure(table, 'ابتدا کد معتبر میز را اسکن کنید.', 403);
      limit('table-order:' + hash(tableToken || ''), 60, 60);
      const payload = { ...input, mode: 'dine_in' };
      if (id === 'quote') {
        const q = quote(user, payload, table);
        v.ensure(q.cafe.id === table.cafe_id, 'سفارش باید برای همین میز باشد.', 403);
        return json({
          subtotal: q.subtotal,
          discount: q.discount,
          points_used: q.points_used,
          delivery_fee: q.delivery_fee,
          total: q.total,
        });
      }
      if (!id) {
        const buyer = user || tableGuest(tableToken, true);
        v.ensure(buyer, 'نشست میز معتبر نیست.', 403);
        return json({ id: createOrder(buyer, payload, table) }, 201);
      }
    }
    if (resource === 'health' && method === 'GET') {
      one('SELECT 1 healthy');
      const release = await readFile(resolve('BUILD_COMMIT'), 'utf8').catch(() => '');
      return json({
        status: 'ok',
        commit: /^[a-f0-9]{40}$/.test(release.trim()) ? release.trim() : null,
      });
    }
    if (resource === 'payments' && id === 'callback' && method === 'GET') {
      const query = request.nextUrl.searchParams;
      const paymentId = v.text(query.get('payment'), 'شناسه پرداخت', 36, 36);
      limit('payment-callback:' + paymentId, 20, 60);
      const result = await paymentCallback({
        payment: paymentId,
        state: query.get('state') || '',
        Authority: query.get('Authority') || '',
        Status: query.get('Status') || '',
      });
      const response = NextResponse.redirect(
        new URL('/orders/' + result.orderId + '?payment=' + result.result, result.origin),
        303,
      );
      response.headers.set('Cache-Control', 'no-store');
      response.headers.set('Referrer-Policy', 'no-referrer');
      return response;
    }
    if (resource === 'invoices' && id === 'quote' && method === 'POST') {
      limit('invoice-quote:' + (user?.id || request.headers.get('x-real-ip') || 'public'), 60, 60);
      return json(quoteInvoice(input));
    }
    if (resource === 'cafe-directory' && !id && method === 'GET') {
      const directory = await syncCafeDirectory(fetch, true);
      if (
        directory.status === 'ready' &&
        directory.synced_at !== request.nextUrl.searchParams.get('since')
      )
        return json({ directory, cafes: publicCafes() });
      return json({ directory });
    }
    if (resource === 'cafes' && method === 'GET') await syncCafeDirectory();
    if (resource === 'bootstrap' && method === 'GET')
      return json({
        directory: await syncCafeDirectory(),
        platformAdmin: platformAdmin(user),
        googleAvailable: googleAvailable(),
        onlinePayment: publicPaymentAvailability(),
        user,
        rewards: user
          ? all(
              'SELECT l.cafe_id,l.points,c.name cafe_name FROM loyalty_balances l JOIN cafes c ON c.id=l.cafe_id WHERE l.user_id=?',
              user.id,
            )
          : [],
        cafes: publicCafes(),
        products: all(
          'SELECT p.*,c.name cafe_name FROM products p JOIN cafes c ON c.id=p.cafe_id WHERE p.vip_only=0 AND ' +
            visibleProducts +
            ' ORDER BY p.category,p.name',
        ).map(hydrate),
        events: listEvents(user),
        favorites: user
          ? all<{ cafe_id: string }>('SELECT cafe_id FROM favorites WHERE user_id=?', user.id).map(
              (f) => f.cafe_id,
            )
          : [],
        notifications: user
          ? all(
              'SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50',
              user.id,
            ).map(hydrate)
          : [],
        smsAvailable: smsAvailable(),
        mailAvailable: mailAvailable(),
      });
    if (resource === 'auth' && method === 'POST') {
      if (id === 'logout') {
        const token = request.cookies.get('vitrin_session')?.value;
        if (token) run('DELETE FROM sessions WHERE token=?', hash(token));
        const response = json({ ok: true });
        response.cookies.delete('vitrin_session');
        return response;
      }
      limit('auth-global', 150, 60);
      if (id === 'register') {
        const email = v.email(input.email),
          password = v.text(input.password, 'رمز عبور', 8, 128),
          name = v.text(input.name, 'نام', 2, 80);
        limit('register:' + email, 5, 3600);
        v.ensure(
          !one('SELECT id FROM users WHERE email=?', email),
          'حسابی با این ایمیل وجود دارد. وارد شوید.',
          409,
        );
        const userId = randomUUID();
        run(
          'INSERT INTO users (id,name,email,password,created_at) VALUES (?,?,?,?,?)',
          userId,
          name,
          email,
          passwordHash(password),
          new Date().toISOString(),
        );
        const response = json({ ok: true }, 201);
        createSession(userId, response);
        return response;
      }
      if (id === 'login') {
        const email = v.email(input.email),
          password = v.text(input.password, 'رمز عبور', 1, 128);
        limit('login:' + email, 10, 900);
        const account = one<{ id: string; password: string }>(
          'SELECT id,password FROM users WHERE email=? AND suspended=0',
          email,
        );
        v.ensure(
          account?.password && passwordMatches(password, account.password),
          'ایمیل یا رمز عبور صحیح نیست.',
          401,
        );
        const response = json({ ok: true });
        createSession(account.id, response);
        return response;
      }
      if (id === 'phone') {
        await sendCode(v.phone(input.phone), 'phone');
        return json({ ok: true });
      }
      if (id === 'verify') {
        const phone = v.phone(input.phone),
          code = latin(v.text(input.code, 'کد تأیید', 6, 6));
        limit('verify:' + phone, 10, 900);
        verifyCode(phone, 'phone', code);
        let account = one<{ id: string; suspended?: number }>(
          'SELECT id,suspended FROM users WHERE phone=?',
          phone,
        );
        v.ensure(!account?.suspended, 'دسترسی به این حساب غیرفعال است.', 403);
        if (!account) {
          account = { id: randomUUID() };
          run(
            'INSERT INTO users (id,name,phone,created_at) VALUES (?,?,?,?)',
            account.id,
            'همراه ویتکو',
            phone,
            new Date().toISOString(),
          );
        }
        const response = json({ ok: true });
        createSession(account.id, response);
        return response;
      }
      if (id === 'forgot') {
        const email = v.email(input.email);
        v.ensure(mailAvailable(), 'بازیابی رمز از طریق ایمیل هنوز فعال نشده است.', 503);
        limit('forgot:' + email, 3, 600);
        if (one('SELECT id FROM users WHERE email=?', email)) await sendCode(email, 'reset');
        return json({ ok: true });
      }
      if (id === 'reset') {
        const email = v.email(input.email),
          code = latin(v.text(input.code, 'کد تأیید', 6, 6)),
          password = v.text(input.password, 'رمز عبور', 8, 128);
        verifyCode(email, 'reset', code);
        transaction(() => {
          run('UPDATE users SET password=? WHERE email=?', passwordHash(password), email);
          run('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email=?)', email);
        });
        return json({ ok: true });
      }
    }
    if (resource === 'cafes' && method === 'GET') {
      const cafe = cafeById(id);
      const features = cafeFeatures(cafe.id);
      const table = tableContext(tableToken);
      const vip = features.vip_menu && table?.cafe_id === id && table.vip;
      return json({
        cafe: { ...cafe, tour_url: features.tour ? cafe.tour_url : '' },
        features,
        branches: publicBranches(cafe),
        hours: workingHours(cafe.id),
        menu_groups: menuCategoriesFor(cafe.id),
        products: all(
          'SELECT p.* FROM products p WHERE p.cafe_id=? AND (p.vip_only=0 OR ?) AND ' +
            visibleProducts +
            ' ORDER BY p.category,p.name',
          id,
          Number(vip),
        ).map(hydrate),
        reviews: all(
          "SELECT r.id,r.rating,r.body,r.created_at,u.name,EXISTS(SELECT 1 FROM orders o WHERE o.user_id=r.user_id AND o.cafe_id=r.cafe_id AND o.status='completed' AND o.kind='menu') verified FROM reviews r JOIN users u ON u.id=r.user_id WHERE r.cafe_id=? AND r.visible=1 ORDER BY r.created_at DESC",
          id,
        ),
        own_review: user
          ? (one(
              'SELECT id,rating,body,created_at,visible FROM reviews WHERE cafe_id=? AND user_id=?',
              id,
              user.id,
            ) ?? null)
          : null,
      });
    }
    if (resource === 'products' && method === 'GET') {
      const table = tableContext(tableToken);
      return json({
        product: productById(
          id,
          table?.vip && cafeFeatures(table.cafe_id).vip_menu ? table.cafe_id : '',
        ),
      });
    }
    if (resource === 'recommendations' && method === 'GET') {
      const cafeId = v.text(request.nextUrl.searchParams.get('cafe'), 'کافه', 1, 100);
      const selected = (request.nextUrl.searchParams.get('items') || '')
        .slice(0, 4000)
        .split(',')
        .filter(Boolean)
        .slice(0, 40);
      const context = tableContext(tableToken);
      return json({
        products: complementaryItems(
          cafeId,
          selected,
          Boolean(context?.vip && context.cafe_id === cafeId && cafeFeatures(cafeId).vip_menu),
        ),
      });
    }
    if (resource === 'slots' && method === 'GET') {
      const selectedDate = v.date(request.nextUrl.searchParams.get('date'));
      const cafe = cafeById(id),
        selectedTime = request.nextUrl.searchParams.get('time');
      const guests = v.integer(
        request.nextUrl.searchParams.get('guests') ?? 1,
        'تعداد نفرات',
        1,
        20,
      );
      return json({
        slots: availableSlots(cafe, selectedDate),
        tables: selectedTime
          ? availableTables(cafe, selectedDate, v.time(selectedTime), guests)
          : [],
      });
    }
    const guestAllowed =
      (resource === 'orders' && Boolean(id) && ['GET', 'PATCH'].includes(method)) ||
      (resource === 'payments' && method === 'POST');
    const account = user || (guestAllowed ? tableGuest(tableToken) : null);
    v.ensure(account, 'برای ادامه وارد حساب خود شوید.', 401);
    if (method !== 'GET') limit('write:' + account.id, 100, 60);
    if (resource === 'auth' && id === 'logout-others' && method === 'POST' && !action)
      return json({ revoked: logoutOtherSessions(account, request) });
    if (resource === 'admin')
      return json(adminApi(account, path, method, input, request.nextUrl.searchParams));
    if (resource === 'operations') {
      const response = await operationsApi(request, account, path, input);
      return response instanceof Response ? response : json(response);
    }
    if (resource === 'loyalty') {
      if (method === 'GET' && !id) return json(myLoyalty(account));
      if (method === 'POST' && id && action)
        return json(
          {
            code: redeemReward(
              account,
              id,
              action,
              v.text(input.request_key, 'شناسه درخواست', 10, 100),
            ),
          },
          201,
        );
    }
    if (resource === 'meetings') {
      if (method === 'POST' && !id) return json({ id: saveMeeting(account, input) }, 201);
      if (method === 'PUT' && id && !action) return json({ id: saveMeeting(account, input, id) });
      if (method === 'POST' && id && action) {
        if (action === 'messages') writeMeetingChat(account, id, input);
        else changeMeeting(account, id, action, input);
        return json({ ok: true });
      }
    }
    if (resource === 'profile' && method === 'PATCH') {
      const name = v.text(input.name, 'نام', 2, 80),
        avatar = v.imagePath(input.avatar);
      run('UPDATE users SET name=?,avatar=? WHERE id=?', name, avatar, account.id);
      return json({ ok: true });
    }
    if (resource === 'preferences') {
      if (method === 'GET') return json(customerSettings(account));
      if (method === 'PATCH') {
        savePreferences(account, input);
        return json({ ok: true });
      }
    }
    if (resource === 'telegram' && !id) {
      if (method === 'GET') return json(telegramStatus(account));
      if (method === 'POST') return json({ url: linkTelegram(account) });
      if (method === 'DELETE') {
        unlinkTelegram(account);
        return json({ ok: true });
      }
    }
    if (resource === 'profile' && id === 'phone' && method === 'POST') {
      await updatePhone(account, input, action === 'verify');
      return json({ ok: true });
    }
    if (resource === 'profile' && !id && method === 'DELETE') {
      closeAccount(account, input);
      const response = json({ ok: true });
      response.cookies.delete('vitrin_session');
      return response;
    }
    if (resource === 'password' && method === 'PATCH') {
      const old = v.text(input.current, 'رمز فعلی', 1, 128),
        next = v.text(input.password, 'رمز جدید', 8, 128);
      const row = one<{ password: string }>('SELECT password FROM users WHERE id=?', account.id);
      v.ensure(row?.password && passwordMatches(old, row.password), 'رمز فعلی صحیح نیست.');
      transaction(() => {
        run('UPDATE users SET password=? WHERE id=?', passwordHash(next), account.id);
        run('DELETE FROM sessions WHERE user_id=?', account.id);
      });
      const response = json({ ok: true });
      createSession(account.id, response);
      return response;
    }
    if (resource === 'addresses') {
      if (method === 'GET')
        return json({
          addresses: all(
            'SELECT * FROM addresses WHERE user_id=? ORDER BY is_default DESC,rowid DESC',
            account.id,
          ).map(hydrate),
        });
      if (id)
        v.ensure(
          one('SELECT id FROM addresses WHERE id=? AND user_id=?', id, account.id),
          'آدرس پیدا نشد.',
          404,
        );
      if (method === 'DELETE') {
        run('DELETE FROM addresses WHERE id=? AND user_id=?', id, account.id);
        return json({ ok: true });
      }
      if (method === 'POST' || method === 'PUT') {
        const values = [
          v.text(input.title, 'عنوان آدرس', 1, 50),
          v.text(input.city, 'شهر', 2, 60),
          v.text(input.street, 'نشانی', 5, 500),
          v.text(input.postal_code ?? '', 'کد پستی', 0, 10),
          v.text(input.receiver, 'نام گیرنده', 2, 80),
          v.phone(input.phone),
          v.coordinate(input.latitude, -90, 90),
          v.coordinate(input.longitude, -180, 180),
          v.flag(input.is_default) ? 1 : 0,
        ];
        v.ensure(
          !values[3] || /^\d{10}$/.test(latin(String(values[3]))),
          'کد پستی باید ده رقم باشد.',
        );
        transaction(() => {
          if (values[8]) run('UPDATE addresses SET is_default=0 WHERE user_id=?', account.id);
          if (method === 'PUT')
            run(
              'UPDATE addresses SET title=?,city=?,street=?,postal_code=?,receiver=?,phone=?,latitude=?,longitude=?,is_default=? WHERE id=? AND user_id=?',
              ...values,
              id,
              account.id,
            );
          else
            run(
              'INSERT INTO addresses (title,city,street,postal_code,receiver,phone,latitude,longitude,is_default,id,user_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
              ...values,
              randomUUID(),
              account.id,
            );
        });
        return json({ ok: true });
      }
    }
    if (resource === 'favorites' && method === 'POST') {
      cafeById(id);
      if (one('SELECT 1 FROM favorites WHERE user_id=? AND cafe_id=?', account.id, id))
        run('DELETE FROM favorites WHERE user_id=? AND cafe_id=?', account.id, id);
      else run('INSERT INTO favorites (user_id,cafe_id) VALUES (?,?)', account.id, id);
      return json({ ok: true });
    }
    if (resource === 'quote' && method === 'POST') {
      const q = quote(account, input);
      return json({
        items: q.items,
        subtotal: q.subtotal,
        discount: q.discount,
        delivery_fee: q.delivery_fee,
        points_used: q.points_used,
        total: q.total,
      });
    }
    if (resource === 'invoices' && !id && method === 'POST') {
      limit('invoice-create:' + account.id, 15, 60);
      return json({ id: createInvoice(account, input) }, 201);
    }
    if (resource === 'payments' && method === 'POST') {
      limit('payment:' + account.id, 15, 60);
      if (!id) return json(await startPayment(account, v.text(input.order_id, 'سفارش', 1, 100)));
      if (action === 'verify')
        return json(await checkPayment(account, v.text(id, 'سفارش', 1, 100)));
    }
    if (resource === 'orders') {
      if (method === 'POST') return json({ id: createOrder(account, input) }, 201);
      if (method === 'GET') {
        const rows = all(
          orderSql +
            ' WHERE o.user_id=?' +
            (id ? ' AND o.id=?' : '') +
            ' ORDER BY o.created_at DESC',
          ...(id ? [account.id, id] : [account.id]),
        ).map(hydrate<Order>);
        if (id) v.ensure(rows.length, 'سفارش پیدا نشد.', 404);
        return json(id ? { order: rows[0] } : { orders: rows });
      }
      if (method === 'PATCH') {
        transitionOrder(
          account,
          id,
          v.text(input.status, 'وضعیت', 1, 30),
          input.preparation_minutes,
        );
        return json({ ok: true });
      }
    }
    if (resource === 'reservations') {
      if (method === 'POST') {
        const id = createReservation(account, input);
        return json(
          {
            id,
            order_id: one<{ id: string }>('SELECT id FROM orders WHERE reservation_id=?', id)?.id,
          },
          201,
        );
      }
      if (method === 'GET') {
        if (id) {
          const booking = one(reservationSql + ' WHERE r.user_id=? AND r.id=?', account.id, id);
          v.ensure(booking, 'رزرو پیدا نشد.', 404);
          return json({ reservation: hydrate(booking) });
        }
        return json({
          reservations: all(
            reservationSql + ' WHERE r.user_id=? ORDER BY r.date DESC,r.time DESC',
            account.id,
          ).map(hydrate),
        });
      }
      if (method === 'PATCH') {
        transitionReservation(account, id, v.text(input.status, 'وضعیت', 1, 30));
        return json({ ok: true });
      }
    }
    if (resource === 'reviews' && ['POST', 'PATCH', 'DELETE'].includes(method)) {
      cafeById(id);
      if (method === 'DELETE') {
        v.ensure(
          run('DELETE FROM reviews WHERE user_id=? AND cafe_id=?', account.id, id).changes,
          'نظر پیدا نشد.',
          404,
        );
        return json({ ok: true });
      }
      const rating = v.integer(input.rating, 'امتیاز', 1, 5),
        body = v.text(input.body, 'نظر', 5, 1500);
      if (method === 'PATCH') {
        v.ensure(
          run(
            'UPDATE reviews SET rating=?,body=? WHERE user_id=? AND cafe_id=?',
            rating,
            body,
            account.id,
            id,
          ).changes,
          'نظر پیدا نشد.',
          404,
        );
        return json({ ok: true });
      }
      v.ensure(
        !one('SELECT id FROM reviews WHERE user_id=? AND cafe_id=?', account.id, id),
        'شما قبلاً برای این کافه نظر ثبت کرده‌اید.',
      );
      run(
        'INSERT INTO reviews (id,user_id,cafe_id,rating,body,created_at) VALUES (?,?,?,?,?,?)',
        randomUUID(),
        account.id,
        id,
        rating,
        body,
        new Date().toISOString(),
      );
      return json({ ok: true });
    }
    if (resource === 'notifications' && method === 'PATCH') {
      if (id) run('UPDATE notifications SET read=1 WHERE user_id=? AND id=?', account.id, id);
      else run('UPDATE notifications SET read=1 WHERE user_id=?', account.id);
      return json({ ok: true });
    }
    if (resource === 'tickets') {
      const response = ticketsApi(account, path, method, input);
      return response instanceof Response
        ? response
        : json(response, method === 'POST' && !id ? 201 : 200);
    }
    if (resource === 'registrations' && method === 'GET')
      return json({ events: listEvents(account, 'history') });
    if (resource === 'events' && id && method === 'POST') {
      if (action === 'leave') {
        leaveEvent(account, id);
        return json({ ok: true });
      }
      v.ensure(!action, 'مسیر رویداد پیدا نشد.', 404);
      const orderId = registerEvent(account, id);
      return json({ ok: true, order_id: orderId });
    }
    if (resource === 'dashboard') {
      if (id === 'analytics' && method === 'GET')
        return json(
          ownerAnalytics(account, {
            from: request.nextUrl.searchParams.get('from'),
            to: request.nextUrl.searchParams.get('to'),
            cafe: request.nextUrl.searchParams.get('cafe') || undefined,
          }),
        );
      if (id === 'prices' && method === 'POST') return json(adjustCategoryPrices(account, input));
      if (id === 'events' && action && method === 'GET')
        return json({ guests: eventGuests(account, action) });
      if (id === 'events' && action && method === 'DELETE') {
        deleteDraftEvent(account, action);
        return json({ ok: true });
      }
      if (id === 'events' && action && method === 'PATCH') {
        if (input.guest !== undefined) attendEvent(account, action, input.guest);
        else setEventState(account, action, input.status);
        return json({ ok: true });
      }
      if (method === 'GET') {
        const cafes = all(cafeSql + ' WHERE c.owner_id=?', account.id).map(hydrate<Cafe>);
        return json({
          cafes,
          cafe_features: Object.fromEntries(cafes.map((cafe) => [cafe.id, cafeFeatures(cafe.id)])),
          products: all(
            'SELECT p.* FROM products p JOIN cafes c ON c.id=p.cafe_id WHERE c.owner_id=?',
            account.id,
          ).map(hydrate<Product>),
          orders: all(orderSql + ' WHERE c.owner_id=? ORDER BY o.created_at DESC', account.id).map(
            hydrate<Order>,
          ),
          reservations: all(
            reservationSql + ' WHERE c.owner_id=? ORDER BY r.date DESC',
            account.id,
          ).map(hydrate<Reservation>),
          coupons: all(
            'SELECT p.* FROM coupons p JOIN cafes c ON c.id=p.cafe_id WHERE c.owner_id=? AND p.recipient_id IS NULL',
            account.id,
          ),
          events: listEvents(account, 'owner'),
          tickets: operatorTickets(account),
        });
      }
      if (id === 'cafes' && (method === 'POST' || method === 'PUT')) {
        const existing =
          method === 'PUT' ? ownerCafe(account, v.text(input.id, 'کافه', 1, 100)) : null;
        const parentId =
          existing?.parent_id ||
          (existing ? '' : v.text(input.parent_id ?? '', 'کافه اصلی', 0, 100));
        if (parentId) {
          const parent = ownerCafe(account, parentId);
          v.ensure(!parent.parent_id && !parent.is_demo, 'برای شعبه یک کافه اصلی انتخاب کنید.');
        }
        const tables = cafeTables(input.tables ?? existing?.tables ?? []);
        if (tables.some((table) => table.vip) && !cafeFeatures(existing?.id || '').vip_tables)
          v.ensure(
            tables.every(
              (table) =>
                !table.vip || existing?.tables.some((old) => old.id === table.id && old.vip),
            ),
            'امکان میز ویژه برای این شعبه فعال نیست.',
            409,
          );
        const images = galleryImages(input.images ?? existing?.images ?? []);
        const opens = v.time(input.opens),
          closes = v.time(input.closes);
        v.ensure(opens < closes, 'ساعت پایان باید بعد از شروع باشد.');
        const amenities = v.list(input.amenities ?? [], 7).map((a) => v.text(a, 'امکانات', 1, 30));
        v.ensure(
          amenities.every((a) =>
            ['wifi', 'music', 'smoking', 'outdoor', 'parking', 'work', 'family'].includes(a),
          ),
          'امکانات معتبر نیست.',
        );
        const values = [
          v.text(input.name, 'نام کافه', 2, 100),
          v.text(input.description, 'توضیحات', 5, 2000),
          v.text(input.city, 'شهر', 2, 60),
          v.text(input.address, 'آدرس', 5, 500),
          v.phone(input.phone),
          v.imagePath(input.image),
          JSON.stringify(amenities),
          v.coordinate(input.latitude, -90, 90),
          v.coordinate(input.longitude, -180, 180),
          opens,
          closes,
          v.integer(input.capacity, 'ظرفیت', 1, 500),
          0,
          v.flag(input.pickup) ? 1 : 0,
          0,
          v.flag(input.active) ? 1 : 0,
          images,
          JSON.stringify(tables),
          v.integer(
            input.invoice_discount_percent ?? existing?.invoice_discount_percent ?? 0,
            'درصد تخفیف حضوری',
            0,
            99,
          ),
          v.imagePath(input.logo ?? existing?.logo),
        ];
        const cafeId = method === 'PUT' ? String(input.id) : randomUUID();
        transaction(() => {
          if (method === 'PUT') {
            const bookings = all<Reservation>(
              "SELECT * FROM reservations WHERE cafe_id=? AND status IN ('pending','confirmed') AND date>=?",
              cafeId,
              today(),
            ).filter((r) => Date.parse(r.date + 'T' + r.time + ':00+03:30') + 3600000 > Date.now());
            for (const booking of bookings) {
              if (booking.table_id)
                v.ensure(
                  tables.some(
                    (t) =>
                      t.id === booking.table_id && t.seats >= booking.guests && t.enabled !== false,
                  ),
                  'میز دارای رزرو فعال را نمی‌توان حذف کرد یا ظرفیت آن را کاهش داد.',
                  409,
                );
              const minutes = (time: string) =>
                Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
              const hours = cafeHours({ ...existing!, opens, closes }, booking.date);
              v.ensure(
                minutes(booking.time) >= minutes(hours.opens) &&
                  minutes(booking.time) + 60 <= minutes(hours.closes),
                'ساعت کاری جدید نباید رزروهای فعال را خارج از ساعت پذیرش قرار دهد.',
                409,
              );
              const occupancy = bookings
                .filter(
                  (r) =>
                    r.date === booking.date &&
                    Math.abs(minutes(r.time) - minutes(booking.time)) < 60,
                )
                .reduce((sum, r) => sum + r.guests, 0);
              v.ensure(
                Number(values[11]) >= occupancy,
                'ظرفیت کافه نمی‌تواند کمتر از مهمانان رزروهای فعال باشد.',
                409,
              );
            }
            run(
              'UPDATE cafes SET name=?,description=?,city=?,address=?,phone=?,image=?,amenities=?,latitude=?,longitude=?,opens=?,closes=?,capacity=?,delivery=?,pickup=?,delivery_fee=?,active=?,images=?,tables=?,invoice_discount_percent=?,logo=? WHERE id=? AND owner_id=?',
              ...values,
              cafeId,
              account.id,
            );
            for (const previous of existing!.tables) {
              const enabled = tables.some(
                (table) => table.id === previous.id && table.enabled !== false,
              );
              if (values[15] && enabled) continue;
              if (!enabled && previous.enabled !== false) ensureTableCanDisable(cafeId, previous);
              const now = new Date().toISOString();
              run(
                "UPDATE table_codes SET revoked_at=? WHERE cafe_id=? AND table_id=? AND revoked_at=''",
                now,
                cafeId,
                previous.id,
              );
              run(
                "UPDATE cashier_calls SET status='cancelled',updated_at=? WHERE cafe_id=? AND table_id=? AND status IN ('pending','accepted')",
                now,
                cafeId,
                previous.id,
              );
            }
          } else
            run(
              'INSERT INTO cafes (name,description,city,address,phone,image,amenities,latitude,longitude,opens,closes,capacity,delivery,pickup,delivery_fee,active,images,tables,invoice_discount_percent,logo,id,owner_id,parent_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
              ...values,
              cafeId,
              account.id,
              parentId || null,
            );
        });
        return json({ id: cafeId });
      }
      if (id === 'products' && action && method === 'DELETE') {
        const item = one<{ cafe_id: string }>('SELECT cafe_id FROM products WHERE id=?', action);
        v.ensure(item, 'محصول پیدا نشد.', 404);
        ownerCafe(account, item.cafe_id);
        run('DELETE FROM products WHERE id=? AND cafe_id=?', action, item.cafe_id);
        return json({ ok: true });
      }
      if (id === 'products' && (method === 'POST' || method === 'PUT')) {
        const cafeId = v.text(input.cafe_id, 'کافه', 1, 100);
        ownerCafe(account, cafeId);
        let beforeVip = false,
          existingImages: string[] = [];
        if (method === 'PUT') {
          const p = one<{ cafe_id: string; vip_only: number; images: string }>(
            'SELECT cafe_id,vip_only,images FROM products WHERE id=?',
            v.text(input.id, 'محصول', 1, 100),
          );
          v.ensure(p?.cafe_id === cafeId, 'محصول متعلق به این کافه نیست.', 403);
          beforeVip = Boolean(p.vip_only);
          existingImages = JSON.parse(p.images);
        }
        const vipOnly = input.vip_only === undefined ? beforeVip : v.flag(input.vip_only);
        v.ensure(
          !vipOnly || beforeVip || cafeFeatures(cafeId).vip_menu,
          'منوی ویژه برای این شعبه فعال نیست.',
          409,
        );
        const sizes = options(input.sizes),
          addons = options(input.addons);
        v.ensure(
          new Set(sizes.map((s) => s.id)).size === sizes.length &&
            new Set(addons.map((a) => a.id)).size === addons.length,
          'شناسه گزینه‌ها تکراری است.',
        );
        const values = [
          v.text(input.name, 'نام محصول', 2, 100),
          v.text(input.description ?? '', 'توضیحات', 0, 2000),
          productCategory(v.text(input.category, 'دسته‌بندی', 2, 60)),
          v.integer(input.price, 'قیمت', 0, 100000000),
          v.imagePath(input.image),
          v.flag(input.available) ? 1 : 0,
          JSON.stringify(sizes),
          JSON.stringify(addons),
          v.integer(input.max_addons ?? 2, 'حداکثر افزودنی', 0, 10),
          Number(vipOnly),
          galleryImages(input.images ?? existingImages),
        ];
        const productId = method === 'PUT' ? String(input.id) : randomUUID();
        if (method === 'PUT')
          run(
            'UPDATE products SET name=?,description=?,category=?,price=?,image=?,available=?,sizes=?,addons=?,max_addons=?,vip_only=?,images=? WHERE id=?',
            ...values,
            productId,
          );
        else
          run(
            'INSERT INTO products (name,description,category,price,image,available,sizes,addons,max_addons,vip_only,images,id,cafe_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
            ...values,
            productId,
            cafeId,
          );
        return json({ id: productId });
      }
      if (id === 'coupons' && method === 'POST') {
        const cafeId = v.text(input.cafe_id, 'کافه', 1, 100);
        ownerCafe(account, cafeId);
        const code = v.text(input.code, 'کد تخفیف', 3, 40).toUpperCase();
        v.ensure(
          !one('SELECT id FROM coupons WHERE cafe_id=? AND code=?', cafeId, code),
          'کد تخفیف تکراری است.',
        );
        const expires = v.date(input.expires);
        v.ensure(expires >= today(), 'تاریخ پایان نباید در گذشته باشد.');
        run(
          'INSERT INTO coupons (id,cafe_id,code,percent,expires,max_uses) VALUES (?,?,?,?,?,?)',
          randomUUID(),
          cafeId,
          code,
          v.integer(input.percent, 'درصد', 1, 100),
          expires,
          v.integer(input.max_uses, 'تعداد استفاده', 1, 100000),
        );
        return json({ ok: true });
      }
      if (id === 'events' && ['POST', 'PUT'].includes(method)) {
        saveEvent(account, input, method === 'PUT' ? v.text(input.id, 'رویداد', 1, 100) : '');
        return json({ ok: true });
      }
    }
    throw new v.AppError('این بخش پیدا نشد.', 404);
  } catch (error) {
    if (error instanceof v.AppError) return json({ error: error.message }, error.status);
    console.error('API request failed', error instanceof Error ? error.message : 'Unknown error');
    return json({ error: 'خطایی رخ داد. لطفاً دوباره تلاش کنید.' }, 500);
  }
}
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
