import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import source from './source-catalog.json';

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
    CREATE INDEX IF NOT EXISTS orders_cafe ON orders(cafe_id,status);
    CREATE INDEX IF NOT EXISTS bookings_slot ON reservations(cafe_id,date,time,status);
    CREATE INDEX IF NOT EXISTS products_cafe ON products(cafe_id);
  `);
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
const jsonColumns = new Set(['amenities', 'sizes', 'addons', 'items']);
const booleanColumns = new Set([
  'active',
  'available',
  'pickup',
  'delivery',
  'is_default',
  'read',
  'joined',
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
