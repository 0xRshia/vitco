import type { DatabaseSync } from 'node:sqlite';

export const RESERVATION_DEMO_ID = 'vitco-reservation-demo';
export const reservationDemoNotice =
  'این کافه آزمایشی است و مکان واقعی ندارد. درخواست شما فقط برای آزمایش ذخیره می‌شود و رزرو واقعی یا پرداختی انجام نمی‌شود.';

/** Explicitly enabled by the operator; this account has no login credentials. */
export function configureReservationDemo(db: DatabaseSync) {
  if (process.env.RESERVATION_DEMO_ENABLED !== '1') {
    db.prepare('UPDATE cafes SET active=0 WHERE id=? AND is_demo=1').run(RESERVATION_DEMO_ID);
    return;
  }
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('INSERT OR IGNORE INTO users (id,name,created_at) VALUES (?,?,?)').run(
      'vitco-demo-operator',
      'سامانه آزمایش رزرو ویتکو',
      new Date().toISOString(),
    );
    db.prepare(
      `INSERT INTO cafes
      (id,owner_id,name,description,city,address,phone,opens,closes,capacity,pickup,active,is_demo,tables)
      VALUES (?,?,?,?,?,?,?,'08:00','23:00',6,0,1,1,?)
      ON CONFLICT(id) DO UPDATE SET active=1 WHERE cafes.is_demo=1`,
    ).run(
      RESERVATION_DEMO_ID,
      'vitco-demo-operator',
      'کافه آزمایشی ویتکو · رزرو تست',
      reservationDemoNotice,
      'آزمایشی',
      'مکان واقعی ندارد',
      '',
      JSON.stringify([
        { id: 'demo-two', name: 'میز آزمایشی دو نفره', seats: 2 },
        { id: 'demo-four', name: 'میز آزمایشی چهار نفره', seats: 4 },
      ]),
    );
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
