import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { all, one, run, hydrate, transaction } from '@/lib/database';
import {
  currentUser,
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
  ownerCafe,
  productById,
  quote,
  createOrder,
  transitionOrder,
  availableSlots,
  createReservation,
  transitionReservation,
} from '@/lib/commerce';
import type { Cafe, Product, Order, Reservation, User, Ticket } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (value: unknown, status = 200) =>
  NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
const cafeSql =
  'SELECT c.*,(SELECT AVG(rating) FROM reviews WHERE cafe_id=c.id) rating,(SELECT COUNT(*) FROM reviews WHERE cafe_id=c.id) review_count FROM cafes c';
const orderSql =
  'SELECT o.*,c.name cafe_name,u.name customer_name FROM orders o JOIN cafes c ON c.id=o.cafe_id JOIN users u ON u.id=o.user_id';
const reservationSql =
  'SELECT r.*,c.name cafe_name,u.name customer_name FROM reservations r JOIN cafes c ON c.id=r.cafe_id JOIN users u ON u.id=r.user_id';
function ticketWithReplies(ticket: Ticket) {
  return {
    ...ticket,
    replies: all(
      'SELECT r.id,r.body,r.created_at,u.name FROM ticket_replies r JOIN users u ON u.id=r.user_id WHERE r.ticket_id=? ORDER BY r.created_at',
      ticket.id,
    ),
  };
}
function events(user: User | null) {
  return all(
    'SELECT e.*,c.name cafe_name,(SELECT COUNT(*) FROM event_registrations WHERE event_id=e.id) registered,EXISTS(SELECT 1 FROM event_registrations WHERE event_id=e.id AND user_id=?) joined FROM events e JOIN cafes c ON c.id=e.cafe_id ORDER BY date,time',
    user?.id || '',
  ).map(hydrate);
}
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
async function handle(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  try {
    const { path } = await context.params;
    const [resource, id, action] = path;
    const method = request.method;
    if (method !== 'GET') checkOrigin(request);
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
    if (resource === 'bootstrap' && method === 'GET')
      return json({
        user,
        rewards: user
          ? all(
              'SELECT l.cafe_id,l.points,c.name cafe_name FROM loyalty_balances l JOIN cafes c ON c.id=l.cafe_id WHERE l.user_id=?',
              user.id,
            )
          : [],
        cafes: all(cafeSql + ' ORDER BY c.source ASC,c.name').map(hydrate),
        products: all(
          'SELECT p.*,c.name cafe_name FROM products p JOIN cafes c ON c.id=p.cafe_id ORDER BY p.category,p.name',
        ).map(hydrate),
        events: events(user),
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
          'SELECT id,password FROM users WHERE email=?',
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
        let account = one<{ id: string }>('SELECT id FROM users WHERE phone=?', phone);
        if (!account) {
          account = { id: randomUUID() };
          run(
            'INSERT INTO users (id,name,phone,created_at) VALUES (?,?,?,?)',
            account.id,
            'همراه ویترین',
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
      return json({
        cafe,
        products: all('SELECT * FROM products WHERE cafe_id=? ORDER BY category,name', id).map(
          hydrate,
        ),
        reviews: all(
          'SELECT r.id,r.rating,r.body,r.created_at,u.name FROM reviews r JOIN users u ON u.id=r.user_id WHERE r.cafe_id=? ORDER BY r.created_at DESC',
          id,
        ),
      });
    }
    if (resource === 'products' && method === 'GET') return json({ product: productById(id) });
    if (resource === 'slots' && method === 'GET') {
      const selectedDate = v.date(request.nextUrl.searchParams.get('date'));
      return json({ slots: availableSlots(cafeById(id), selectedDate) });
    }
    const account = requireUser(request);
    if (method !== 'GET') limit('write:' + account.id, 100, 60);
    if (resource === 'profile' && method === 'PATCH') {
      const name = v.text(input.name, 'نام', 2, 80),
        avatar = v.imagePath(input.avatar);
      run('UPDATE users SET name=?,avatar=? WHERE id=?', name, avatar, account.id);
      return json({ ok: true });
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
        subtotal: q.subtotal,
        discount: q.discount,
        delivery_fee: q.delivery_fee,
        points_used: q.points_used,
        total: q.total,
      });
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
        transitionOrder(account, id, v.text(input.status, 'وضعیت', 1, 30));
        return json({ ok: true });
      }
    }
    if (resource === 'reservations') {
      if (method === 'POST') return json({ id: createReservation(account, input) }, 201);
      if (method === 'GET')
        return json({
          reservations: all(
            reservationSql + ' WHERE r.user_id=? ORDER BY r.date DESC,r.time DESC',
            account.id,
          ).map(hydrate),
        });
      if (method === 'PATCH') {
        transitionReservation(account, id, v.text(input.status, 'وضعیت', 1, 30));
        return json({ ok: true });
      }
    }
    if (resource === 'reviews' && method === 'POST') {
      cafeById(id);
      const rating = v.integer(input.rating, 'امتیاز', 1, 5),
        body = v.text(input.body, 'نظر', 5, 1500);
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
      run('UPDATE notifications SET read=1 WHERE user_id=?', account.id);
      return json({ ok: true });
    }
    if (resource === 'tickets') {
      if (method === 'POST' && action === 'replies') {
        const ticket = one<{ user_id: string; owner_id: string | null }>(
          'SELECT t.user_id,c.owner_id FROM tickets t LEFT JOIN orders o ON o.id=t.order_id LEFT JOIN cafes c ON c.id=o.cafe_id WHERE t.id=?',
          id,
        );
        v.ensure(ticket, 'درخواست پیدا نشد.', 404);
        v.ensure(
          ticket.owner_id === account.id || account.id === process.env.SUPPORT_USER_ID,
          'دسترسی مجاز نیست.',
          403,
        );
        transaction(() => {
          run(
            'INSERT INTO ticket_replies (id,ticket_id,user_id,body,created_at) VALUES (?,?,?,?,?)',
            randomUUID(),
            id,
            account.id,
            v.text(input.body, 'پاسخ', 3, 3000),
            new Date().toISOString(),
          );
          run('UPDATE tickets SET status=? WHERE id=?', 'answered', id);
          notify(
            ticket.user_id,
            'پاسخ درخواست پشتیبانی',
            'پاسخ درخواست خود را در بخش پشتیبانی ببینید.',
            '/support',
          );
        });
        return json({ ok: true });
      }
      if (method === 'GET')
        return json({
          tickets: all<Ticket>(
            'SELECT * FROM tickets WHERE user_id=? ORDER BY created_at DESC',
            account.id,
          ).map(ticketWithReplies),
        });
      if (method === 'POST') {
        const orderId = v.text(input.order_id ?? '', 'سفارش', 0, 100);
        if (orderId)
          v.ensure(
            one('SELECT id FROM orders WHERE id=? AND user_id=?', orderId, account.id),
            'سفارش پیدا نشد.',
            404,
          );
        run(
          'INSERT INTO tickets (id,user_id,order_id,subject,body,created_at) VALUES (?,?,?,?,?,?)',
          randomUUID(),
          account.id,
          orderId,
          v.text(input.subject, 'موضوع', 3, 150),
          v.text(input.body, 'پیام', 10, 3000),
          new Date().toISOString(),
        );
        return json({ ok: true }, 201);
      }
    }
    if (resource === 'events' && method === 'POST') {
      transaction(() => {
        const event = one<{ capacity: number; date: string; time: string }>(
          'SELECT * FROM events WHERE id=?',
          id,
        );
        v.ensure(event, 'رویداد پیدا نشد.', 404);
        if (action === 'leave')
          run('DELETE FROM event_registrations WHERE event_id=? AND user_id=?', id, account.id);
        else {
          v.ensure(
            new Date(event.date + 'T' + event.time + ':00+03:30').getTime() > Date.now(),
            'زمان رویداد گذشته است.',
          );
          const count = one<{ n: number }>(
            'SELECT COUNT(*) n FROM event_registrations WHERE event_id=?',
            id,
          )!.n;
          v.ensure(count < event.capacity, 'ظرفیت رویداد تکمیل است.', 409);
          v.ensure(
            !one(
              'SELECT 1 FROM event_registrations WHERE event_id=? AND user_id=?',
              id,
              account.id,
            ),
            'قبلاً در این رویداد ثبت‌نام کرده‌اید.',
          );
          run('INSERT INTO event_registrations (event_id,user_id) VALUES (?,?)', id, account.id);
        }
      });
      return json({ ok: true });
    }
    if (resource === 'dashboard') {
      if (method === 'GET') {
        const cafes = all(cafeSql + ' WHERE c.owner_id=?', account.id).map(hydrate<Cafe>);
        return json({
          cafes,
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
            'SELECT p.* FROM coupons p JOIN cafes c ON c.id=p.cafe_id WHERE c.owner_id=?',
            account.id,
          ),
          events: events(account).filter((e) =>
            cafes.some((c) => c.id === (e as { cafe_id: string }).cafe_id),
          ),
          tickets: all<Ticket>(
            'SELECT t.*,u.name customer_name FROM tickets t LEFT JOIN orders o ON o.id=t.order_id LEFT JOIN cafes c ON c.id=o.cafe_id JOIN users u ON u.id=t.user_id WHERE c.owner_id=? OR ? ORDER BY t.created_at DESC',
            account.id,
            account.id === process.env.SUPPORT_USER_ID ? 1 : 0,
          ).map(ticketWithReplies),
        });
      }
      if (id === 'cafes' && (method === 'POST' || method === 'PUT')) {
        if (method === 'PUT') ownerCafe(account, v.text(input.id, 'کافه', 1, 100));
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
          v.flag(input.delivery) ? 1 : 0,
          v.flag(input.pickup) ? 1 : 0,
          v.integer(input.delivery_fee ?? 0, 'هزینه ارسال', 0, 10000000),
          v.flag(input.active) ? 1 : 0,
        ];
        const cafeId = method === 'PUT' ? String(input.id) : randomUUID();
        if (method === 'PUT')
          run(
            'UPDATE cafes SET name=?,description=?,city=?,address=?,phone=?,image=?,amenities=?,latitude=?,longitude=?,opens=?,closes=?,capacity=?,delivery=?,pickup=?,delivery_fee=?,active=? WHERE id=? AND owner_id=?',
            ...values,
            cafeId,
            account.id,
          );
        else
          run(
            'INSERT INTO cafes (name,description,city,address,phone,image,amenities,latitude,longitude,opens,closes,capacity,delivery,pickup,delivery_fee,active,id,owner_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            ...values,
            cafeId,
            account.id,
          );
        return json({ id: cafeId });
      }
      if (id === 'products' && (method === 'POST' || method === 'PUT')) {
        const cafeId = v.text(input.cafe_id, 'کافه', 1, 100);
        ownerCafe(account, cafeId);
        if (method === 'PUT') {
          const p = productById(v.text(input.id, 'محصول', 1, 100));
          v.ensure(p.cafe_id === cafeId, 'محصول متعلق به این کافه نیست.', 403);
        }
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
          v.text(input.category, 'دسته‌بندی', 2, 60),
          v.integer(input.price, 'قیمت', 0, 100000000),
          v.imagePath(input.image),
          v.flag(input.available) ? 1 : 0,
          JSON.stringify(sizes),
          JSON.stringify(addons),
          v.integer(input.max_addons ?? 2, 'حداکثر افزودنی', 0, 10),
        ];
        const productId = method === 'PUT' ? String(input.id) : randomUUID();
        if (method === 'PUT')
          run(
            'UPDATE products SET name=?,description=?,category=?,price=?,image=?,available=?,sizes=?,addons=?,max_addons=? WHERE id=?',
            ...values,
            productId,
          );
        else
          run(
            'INSERT INTO products (name,description,category,price,image,available,sizes,addons,max_addons,id,cafe_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
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
      if (id === 'events' && (method === 'POST' || method === 'PUT')) {
        const cafeId = v.text(input.cafe_id, 'کافه', 1, 100);
        ownerCafe(account, cafeId);
        const values = [
          v.text(input.title, 'عنوان', 3, 120),
          v.text(input.description, 'توضیحات', 5, 3000),
          v.date(input.date),
          v.time(input.time),
          v.integer(input.capacity, 'ظرفیت', 1, 500),
          v.imagePath(input.image),
        ];
        v.ensure(
          new Date(values[2] + 'T' + values[3] + ':00+03:30').getTime() > Date.now(),
          'زمان رویداد باید در آینده باشد.',
        );
        if (method === 'PUT') {
          v.ensure(
            one('SELECT id FROM events WHERE id=? AND cafe_id=?', String(input.id), cafeId),
            'رویداد پیدا نشد.',
            404,
          );
          const registered = one<{ count: number }>(
            'SELECT COUNT(*) count FROM event_registrations WHERE event_id=?',
            String(input.id),
          )!.count;
          v.ensure(
            Number(values[4]) >= registered,
            'ظرفیت نمی‌تواند کمتر از تعداد ثبت‌نام‌های فعلی باشد.',
            409,
          );
          run(
            'UPDATE events SET title=?,description=?,date=?,time=?,capacity=?,image=? WHERE id=?',
            ...values,
            String(input.id),
          );
        } else
          run(
            'INSERT INTO events (title,description,date,time,capacity,image,id,cafe_id) VALUES (?,?,?,?,?,?,?,?)',
            ...values,
            randomUUID(),
            cafeId,
          );
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
