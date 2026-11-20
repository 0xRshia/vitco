import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import source from './source-catalog.json';
import { configureReservationDemo } from './reservation-demo';
import { cafeServiceSchema } from './cafe-service-schema';

const globalDatabase = globalThis as unknown as { vitrinDatabase?: DatabaseSync };
export function database() {
  if (globalDatabase.vitrinDatabase) return globalDatabase.vitrinDatabase;
  const file = resolve(
    /* turbopackIgnore: true */ process.env.DATABASE_PATH || 'data/vitrin.sqlite',
  );
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE, phone TEXT UNIQUE, password TEXT, points INTEGER NOT NULL DEFAULT 0 CHECK(points >= 0), avatar TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS cafes (id TEXT PRIMARY KEY, owner_id TEXT REFERENCES users(id), name TEXT NOT NULL, description TEXT NOT NULL, city TEXT NOT NULL, address TEXT NOT NULL, phone TEXT NOT NULL, image TEXT NOT NULL DEFAULT '', amenities TEXT NOT NULL DEFAULT '[]', latitude REAL, longitude REAL, opens TEXT NOT NULL DEFAULT '08:00', closes TEXT NOT NULL DEFAULT '22:00', capacity INTEGER NOT NULL DEFAULT 20, delivery INTEGER NOT NULL DEFAULT 0, pickup INTEGER NOT NULL DEFAULT 1, delivery_fee INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, source TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, cafe_id TEXT NOT NULL REFERENCES cafes(id), name TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL, price INTEGER NOT NULL CHECK(price >= 0), image TEXT NOT NULL DEFAULT '', available INTEGER NOT NULL DEFAULT 1, sizes TEXT NOT NULL DEFAULT '[]', addons TEXT NOT NULL DEFAULT '[]', max_addons INTEGER NOT NULL DEFAULT 2, source TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS addresses (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL, city TEXT NOT NULL, street TEXT NOT NULL, postal_code TEXT NOT NULL DEFAULT '', receiver TEXT NOT NULL, phone TEXT NOT NULL, latitude REAL, longitude REAL, is_default INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS favorites (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, cafe_id TEXT NOT NULL REFERENCES cafes(id), PRIMARY KEY(user_id,cafe_id));
    CREATE TABLE IF NOT EXISTS loyalty_balances (user_id TEXT NOT NULL REFERENCES users(id), cafe_id TEXT NOT NULL REFERENCES cafes(id), points INTEGER NOT NULL DEFAULT 0 CHECK(points>=0), PRIMARY KEY(user_id,cafe_id));
    CREATE TABLE IF NOT EXISTS coupons (id TEXT PRIMARY KEY, cafe_id TEXT NOT NULL REFERENCES cafes(id), code TEXT NOT NULL, percent INTEGER NOT NULL CHECK(percent BETWEEN 1 AND 100), expires TEXT NOT NULL, max_uses INTEGER NOT NULL, uses INTEGER NOT NULL DEFAULT 0, UNIQUE(cafe_id,code));
    CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), cafe_id TEXT NOT NULL REFERENCES cafes(id), mode TEXT NOT NULL, status TEXT NOT NULL, items TEXT NOT NULL, subtotal INTEGER NOT NULL, discount INTEGER NOT NULL, delivery_fee INTEGER NOT NULL, points_used INTEGER NOT NULL, total INTEGER NOT NULL, address TEXT, pickup_at TEXT NOT NULL, note TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, request_key TEXT NOT NULL, UNIQUE(user_id,request_key));
    CREATE TABLE IF NOT EXISTS reservations (id TEXT PRIMARY KEY, cafe_id TEXT NOT NULL REFERENCES cafes(id), user_id TEXT NOT NULL REFERENCES users(id), date TEXT NOT NULL, time TEXT NOT NULL, guests INTEGER NOT NULL, note TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, request_key TEXT NOT NULL, UNIQUE(user_id,request_key));
    CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, cafe_id TEXT NOT NULL REFERENCES cafes(id), title TEXT NOT NULL, description TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL, capacity INTEGER NOT NULL, image TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS event_registrations (event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id), PRIMARY KEY(event_id,user_id));
    CREATE TABLE IF NOT EXISTS reviews (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), cafe_id TEXT NOT NULL REFERENCES cafes(id), rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5), body TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(user_id,cafe_id));
    CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL, body TEXT NOT NULL, href TEXT NOT NULL, read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS tickets (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), order_id TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS ticket_replies (id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL REFERENCES tickets(id), user_id TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS auth_codes (target TEXT NOT NULL, purpose TEXT NOT NULL, hash TEXT NOT NULL, expires INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(target,purpose));
    CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS orders_user ON orders(user_id,created_at);
    CREATE INDEX IF NOT EXISTS orders_created ON orders(created_at);
    CREATE INDEX IF NOT EXISTS orders_cafe ON orders(cafe_id,status);
    CREATE INDEX IF NOT EXISTS bookings_slot ON reservations(cafe_id,date,time,status);
    CREATE INDEX IF NOT EXISTS products_cafe ON products(cafe_id);
  `);
  // Additive migrations preserve existing operator data and booking history.
  for (const [table, column, definition] of [
    ['cafes', 'images', "TEXT NOT NULL DEFAULT '[]'"],
    ['cafes', 'tables', "TEXT NOT NULL DEFAULT '[]'"],
    ['cafes', 'directory_source', "TEXT NOT NULL DEFAULT ''"],
    ['cafes', 'external_menu_url', "TEXT NOT NULL DEFAULT ''"],
    ['cafes', 'is_demo', 'INTEGER NOT NULL DEFAULT 0'],
    ['cafes', 'parent_id', 'TEXT REFERENCES cafes(id)'],
    ['cafes', 'tour_url', "TEXT NOT NULL DEFAULT ''"],
    ['cafes', 'logo', "TEXT NOT NULL DEFAULT ''"],
    ['products', 'vip_only', 'INTEGER NOT NULL DEFAULT 0'],
    ['products', 'images', "TEXT NOT NULL DEFAULT '[]'"],
    [
      'cafes',
      'invoice_discount_percent',
      'INTEGER NOT NULL DEFAULT 0 CHECK(invoice_discount_percent BETWEEN 0 AND 99)',
    ],
    ['events', 'end_time', "TEXT NOT NULL DEFAULT ''"],
    ['reservations', 'table_id', "TEXT NOT NULL DEFAULT ''"],
    ['reservations', 'table_name', "TEXT NOT NULL DEFAULT ''"],
    ['orders', 'reservation_id', "TEXT NOT NULL DEFAULT ''"],
    ['orders', 'payment_method', "TEXT NOT NULL DEFAULT 'offline'"],
    ['orders', 'payment_status', "TEXT NOT NULL DEFAULT 'unpaid'"],
    ['orders', 'payment_ref', "TEXT NOT NULL DEFAULT ''"],
    ['orders', 'kind', "TEXT NOT NULL DEFAULT 'menu'"],
    ['orders', 'table_name', "TEXT NOT NULL DEFAULT ''"],
    ['orders', 'table_id', "TEXT NOT NULL DEFAULT ''"],
    ['orders', 'preparation_minutes', 'INTEGER'],
    ['orders', 'preparation_started_at', "TEXT NOT NULL DEFAULT ''"],
    ['events', 'status', "TEXT NOT NULL DEFAULT 'published'"],
    ['events', 'price', 'INTEGER NOT NULL DEFAULT 0'],
    ['event_registrations', 'status', "TEXT NOT NULL DEFAULT 'registered'"],
    ['event_registrations', 'order_id', 'TEXT REFERENCES orders(id)'],
    ['event_registrations', 'hold_until', 'INTEGER NOT NULL DEFAULT 0'],
    ['coupons', 'recipient_id', 'TEXT REFERENCES users(id)'],
    ['tickets', 'priority', "TEXT NOT NULL DEFAULT 'normal'"],
    ['reviews', 'visible', 'INTEGER NOT NULL DEFAULT 1'],
    ['users', 'suspended', 'INTEGER NOT NULL DEFAULT 0'],
    ['users', 'account_kind', "TEXT NOT NULL DEFAULT 'member'"],
  ]) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!columns.some((c) => c.name === column))
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS cafe_directory_sync (source TEXT PRIMARY KEY, synced_at TEXT NOT NULL, cafe_count INTEGER NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS orders_reservation ON orders(reservation_id) WHERE reservation_id <> '';
    CREATE INDEX IF NOT EXISTS orders_cafe_created ON orders(cafe_id,created_at);
    CREATE TABLE IF NOT EXISTS price_adjustments (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), cafe_id TEXT NOT NULL REFERENCES cafes(id), category TEXT NOT NULL, reason TEXT NOT NULL, mode TEXT NOT NULL, amount REAL NOT NULL, changes TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id),
      authority TEXT NOT NULL DEFAULT '', merchant_id TEXT NOT NULL,
      sandbox INTEGER NOT NULL, amount_rial INTEGER NOT NULL CHECK(amount_rial>0),
      callback_origin TEXT NOT NULL, state_hash TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('creating','pending','unknown','paid','failed')),
      ref_id TEXT NOT NULL DEFAULT '', provider_code INTEGER,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      verify_lock_until INTEGER NOT NULL DEFAULT 0
    );
    CREATE UNIQUE INDEX IF NOT EXISTS payments_authority ON payments(authority) WHERE authority <> '';
    CREATE UNIQUE INDEX IF NOT EXISTS payments_active_order ON payments(order_id) WHERE status IN ('creating','pending','unknown');
    CREATE INDEX IF NOT EXISTS payments_order ON payments(order_id,created_at);
    CREATE TABLE IF NOT EXISTS invoice_details (
      order_id TEXT PRIMARY KEY REFERENCES orders(id),
      automatic_percent INTEGER NOT NULL,
      coupon_id TEXT REFERENCES coupons(id),
      coupon_code TEXT NOT NULL,
      applied_percent INTEGER NOT NULL,
      request_signature TEXT NOT NULL
    );
  `);
  db.exec(cafeServiceSchema);
  for (const [table, column, definition] of [
    ['table_visits', 'bound', 'INTEGER NOT NULL DEFAULT 1'],
    ['articles', 'body_blocks', "TEXT NOT NULL DEFAULT '[]'"],
    ['articles', 'publish_at', "TEXT NOT NULL DEFAULT ''"],
  ]) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!columns.some((item) => item.name === column))
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
  const cafe = source.cafe;
  db.prepare(
    `INSERT OR IGNORE INTO cafes (id,owner_id,name,description,city,address,phone,amenities,capacity,pickup,active,source) VALUES (?,NULL,?,?,?,?,?,?,0,0,0,?)`,
  ).run(
    'vitrin-aala',
    cafe.name,
    cafe.description,
    cafe.primary_city,
    cafe.branches[0].address_line1,
    cafe.branches[0].phone,
    JSON.stringify(['wifi', 'music', 'smoking', 'family']),
    source.source,
  );
  for (const category of source.categories)
    for (const p of category.items) {
      db.prepare(
        `INSERT OR IGNORE INTO products (id,cafe_id,name,description,category,price,available,addons,max_addons,source) VALUES (?,?,?,?,?,?,1,?,?,?)`,
      ).run(
        'vitrin-' + p.id,
        'vitrin-aala',
        p.name,
        p.description,
        category.name,
        p.price_amount,
        JSON.stringify(
          p.addons.map((a) => ({ id: 'source-' + a.id, name: a.name, price: a.price_amount })),
        ),
        p.addons.length,
        source.source,
      );
    }
  globalDatabase.vitrinDatabase = db;
  configureReservationDemo(db);
  return db;
}
export function all<T>(sql: string, ...params: SQLInputValue[]): T[] {
  return database()
    .prepare(sql)
    .all(...params) as T[];
}
export function one<T>(sql: string, ...params: SQLInputValue[]): T | undefined {
  return database()
    .prepare(sql)
    .get(...params) as T | undefined;
}
export function run(sql: string, ...params: SQLInputValue[]) {
  return database()
    .prepare(sql)
    .run(...params);
}
export function transaction<T>(work: () => T): T {
  const db = database();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
const jsonColumns = new Set([
  'amenities',
  'sizes',
  'addons',
  'items',
  'images',
  'tables',
  'body_blocks',
]);
const booleanColumns = new Set([
  'active',
  'available',
  'pickup',
  'delivery',
  'is_default',
  'read',
  'joined',
  'is_demo',
  'vip_only',
]);
export function hydrate<T>(row: unknown): T {
  const record = row as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      (jsonColumns.has(key) || (key === 'address' && 'items' in record)) &&
      typeof value === 'string'
        ? JSON.parse(value)
        : booleanColumns.has(key)
          ? Boolean(value)
          : value,
    ]),
  ) as T;
}
