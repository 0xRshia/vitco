import { randomBytes, randomUUID } from 'node:crypto';
import { all, one, run, transaction } from './database';
import { cafeById, ownerCafe } from './commerce';
import { daysAhead } from './format';
import { findMemberByContact } from './auth';
import type { User } from './types';
import * as v from './validation';

export type Program = { cafe_id: string; name: string; active: number; spend_per_point: number };
export type Tier = { id: string; name: string; threshold: number };
export type EarningRule = {
  id: string;
  name: string;
  kind: 'fixed' | 'spend' | 'tier';
  minimum: number;
  value: number;
  active: number;
};
export type Reward = { id: string; name: string; cost: number; percent: number; active: number };
export type LedgerEntry = {
  id: string;
  cafe_id: string;
  cafe_name?: string;
  customer_name?: string;
  delta: number;
  reason: string;
  created_at: string;
};
function program(cafeId: string) {
  return one<Program>('SELECT * FROM loyalty_programs WHERE cafe_id=?', cafeId);
}
function balance(userId: string, cafeId: string) {
  return (
    one<{ points: number }>(
      'SELECT points FROM loyalty_balances WHERE user_id=? AND cafe_id=?',
      userId,
      cafeId,
    )?.points ?? 0
  );
}
function tiers(cafeId: string) {
  return all<Tier>(
    'SELECT id,name,threshold FROM loyalty_tiers WHERE cafe_id=? ORDER BY threshold',
    cafeId,
  );
}
function rewards(cafeId: string, activeOnly = false) {
  return all<Reward>(
    'SELECT id,name,cost,percent,active FROM loyalty_rewards WHERE cafe_id=?' +
      (activeOnly ? ' AND active=1' : '') +
      ' ORDER BY cost,name',
    cafeId,
  );
}
function earningRules(cafeId: string) {
  return all<EarningRule>(
    'SELECT id,name,kind,minimum,value,active FROM loyalty_rules WHERE cafe_id=? ORDER BY name,id',
    cafeId,
  );
}
export function changeLoyaltyPoints(
  userId: string,
  cafeId: string,
  delta: number,
  reason: string,
  redemption?: { key: string; rewardId: string; couponId: string },
) {
  if (!delta) return;
  v.ensure(balance(userId, cafeId) + delta >= 0, 'امتیاز این کافه کافی نیست.', 409);
  // The caller holds the write transaction so the account, café balance and history commit together.
  run('UPDATE users SET points=points+? WHERE id=?', delta, userId);
  if (delta > 0)
    run(
      `INSERT INTO loyalty_balances(user_id,cafe_id,points) VALUES (?,?,?)
      ON CONFLICT(user_id,cafe_id) DO UPDATE SET points=points+excluded.points`,
      userId,
      cafeId,
      delta,
    );
  else
    run(
      'UPDATE loyalty_balances SET points=points+? WHERE user_id=? AND cafe_id=?',
      delta,
      userId,
      cafeId,
    );
  run(
    'INSERT INTO loyalty_ledger(id,cafe_id,user_id,delta,reason,created_at,request_key,reward_id,coupon_id) VALUES (?,?,?,?,?,?,?,?,?)',
    randomUUID(),
    cafeId,
    userId,
    delta,
    reason,
    new Date().toISOString(),
    redemption?.key ?? null,
    redemption?.rewardId ?? null,
    redemption?.couponId ?? null,
  );
}
export function earnOrderPoints(userId: string, cafeId: string, total: number) {
  const configured = program(cafeId);
  if (configured && !configured.active) return;
  if (one("SELECT 1 FROM users WHERE id=? AND account_kind='guest'", userId)) return;
  const cost = configured?.spend_per_point ?? 10000;
  const initialPoints = balance(userId, cafeId);
  let earned = Math.floor(total / cost);
  changeLoyaltyPoints(userId, cafeId, earned, 'امتیاز خرید');
  if (!configured || !total) return;
  const rules = earningRules(cafeId).filter((rule) => rule.active);
  for (const rule of rules.filter((rule) => rule.kind !== 'tier' && total >= rule.minimum)) {
    const extra = rule.kind === 'fixed' ? rule.value : Math.floor((total / 1000) * rule.value);
    earned += extra;
    changeLoyaltyPoints(userId, cafeId, extra, rule.name);
  }
  for (const rule of rules.filter((rule) => rule.kind === 'tier' && initialPoints >= rule.minimum))
    changeLoyaltyPoints(userId, cafeId, Math.floor((earned * rule.value) / 100), rule.name);
}
export function myLoyalty(user: User) {
  const programs = all<Program & { cafe_name: string; points: number }>(
    `SELECT p.*,c.name cafe_name,COALESCE(b.points,0) points
    FROM loyalty_programs p JOIN cafes c ON c.id=p.cafe_id LEFT JOIN loyalty_balances b ON b.cafe_id=p.cafe_id AND b.user_id=?
    WHERE p.active=1 AND c.active=1 AND c.is_demo=0 ORDER BY c.name`,
    user.id,
  );
  return {
    programs: programs.map((item) => ({
      ...item,
      tiers: tiers(item.cafe_id),
      rewards: rewards(item.cafe_id, true),
      rules: earningRules(item.cafe_id).filter((rule) => rule.active),
    })),
    ledger: all<LedgerEntry>(
      `SELECT l.id,l.cafe_id,c.name cafe_name,l.delta,l.reason,l.created_at
      FROM loyalty_ledger l JOIN cafes c ON c.id=l.cafe_id WHERE l.user_id=? ORDER BY l.created_at DESC LIMIT 100`,
      user.id,
    ),
    coupons: all<{
      code: string;
      cafe_id: string;
      cafe_name: string;
      expires: string;
      uses: number;
    }>(
      `SELECT p.code,p.cafe_id,c.name cafe_name,p.expires,p.uses
      FROM coupons p JOIN cafes c ON c.id=p.cafe_id WHERE p.recipient_id=? ORDER BY p.expires DESC LIMIT 50`,
      user.id,
    ),
  };
}
export function loyaltyManagement(user: User, cafeId: string) {
  ownerCafe(user, cafeId);
  return {
    program: program(cafeId) || null,
    tiers: tiers(cafeId),
    rewards: rewards(cafeId),
    rules: earningRules(cafeId),
    totals: one<{ credits: number; redemptions: number }>(
      'SELECT COALESCE(SUM(MAX(delta,0)),0) credits,COALESCE(SUM(CASE WHEN reward_id IS NOT NULL THEN -delta ELSE 0 END),0) redemptions FROM loyalty_ledger WHERE cafe_id=?',
      cafeId,
    )!,
    members: all<{ name: string; points: number }>(
      'SELECT u.name,b.points FROM loyalty_balances b JOIN users u ON u.id=b.user_id WHERE b.cafe_id=? ORDER BY b.points DESC LIMIT 100',
      cafeId,
    ),
    ledger: all<LedgerEntry>(
      `SELECT l.id,l.cafe_id,u.name customer_name,l.delta,l.reason,l.created_at FROM loyalty_ledger l
      JOIN users u ON u.id=l.user_id WHERE l.cafe_id=? ORDER BY l.created_at DESC LIMIT 100`,
      cafeId,
    ),
  };
}
export function saveLoyalty(user: User, cafeId: string, input: Record<string, unknown>) {
  const cafe = ownerCafe(user, cafeId);
  v.ensure(!cafe.is_demo, 'باشگاه برای کافه آزمایشی در دسترس نیست.', 409);
  transaction(() => {
    if (input.action === 'program') {
      run(
        `INSERT INTO loyalty_programs(cafe_id,name,active,spend_per_point) VALUES (?,?,?,?)
        ON CONFLICT(cafe_id) DO UPDATE SET name=excluded.name,active=excluded.active,spend_per_point=excluded.spend_per_point`,
        cafeId,
        v.text(input.name, 'نام باشگاه', 2, 100),
        Number(input.active === true),
        v.integer(input.spend_per_point, 'هزینه هر امتیاز', 1000, 10000000),
      );
      return;
    }
    v.ensure(program(cafeId), 'ابتدا باشگاه را تنظیم کنید.', 409);
    if (input.action === 'tier') {
      const threshold = v.integer(input.threshold, 'امتیاز شروع سطح', 0, 10000000);
      run(
        `INSERT INTO loyalty_tiers(id,cafe_id,name,threshold) VALUES (?,?,?,?)
        ON CONFLICT(cafe_id,threshold) DO UPDATE SET name=excluded.name`,
        randomUUID(),
        cafeId,
        v.text(input.name, 'نام سطح', 2, 100),
        threshold,
      );
    } else if (input.action === 'rule') {
      const id = v.text(input.id ?? '', 'قانون امتیاز', 0, 100),
        kind = input.kind;
      v.ensure(
        kind === 'fixed' || kind === 'spend' || kind === 'tier',
        'نوع قانون امتیاز معتبر نیست.',
      );
      const name = v.text(input.name, 'نام قانون', 2, 100);
      const minimum = v.integer(input.minimum, 'حداقل مبلغ یا امتیاز', 0, 100000000);
      const value = v.integer(
        input.value,
        'مقدار امتیاز یا درصد',
        1,
        kind === 'tier' ? 300 : kind === 'spend' ? 10 : 1000,
      );
      const active = Number(input.active !== false);
      if (id) {
        v.ensure(
          run(
            'UPDATE loyalty_rules SET name=?,kind=?,minimum=?,value=?,active=? WHERE id=? AND cafe_id=?',
            name,
            kind,
            minimum,
            value,
            active,
            id,
            cafeId,
          ).changes,
          'قانون امتیاز پیدا نشد.',
          404,
        );
      } else {
        v.ensure(
          earningRules(cafeId).length < 20,
          'حداکثر بیست قانون برای هر باشگاه مجاز است.',
          409,
        );
        run(
          'INSERT INTO loyalty_rules(id,cafe_id,name,kind,minimum,value,active) VALUES (?,?,?,?,?,?,?)',
          randomUUID(),
          cafeId,
          name,
          kind,
          minimum,
          value,
          active,
        );
      }
    } else if (input.action === 'reward') {
      const id = v.text(input.id ?? '', 'پاداش', 0, 100);
      const values = [
        v.text(input.name, 'نام پاداش', 2, 100),
        v.integer(input.cost, 'امتیاز لازم', 1, 10000000),
        v.integer(input.percent, 'درصد تخفیف', 1, 100),
        Number(input.active !== false),
      ];
      if (id) {
        const changed = run(
          'UPDATE loyalty_rewards SET name=?,cost=?,percent=?,active=? WHERE id=? AND cafe_id=?',
          ...values,
          id,
          cafeId,
        );
        v.ensure(changed.changes, 'پاداش پیدا نشد.', 404);
      } else
        run(
          'INSERT INTO loyalty_rewards(name,cost,percent,active,id,cafe_id) VALUES (?,?,?,?,?,?)',
          ...values,
          randomUUID(),
          cafeId,
        );
    } else if (input.action === 'adjust') {
      const target = findMemberByContact(input.contact ?? input.email);
      v.ensure(target, 'حساب فعال مشتری پیدا نشد.', 404);
      const delta = v.integer(input.delta, 'تغییر امتیاز', -100000, 100000);
      v.ensure(delta, 'تغییر امتیاز باید غیرصفر باشد.');
      changeLoyaltyPoints(target.id, cafeId, delta, v.text(input.reason, 'علت تغییر', 3, 200));
    } else throw new v.AppError('عملیات نامعتبر است.');
  });
}
export function redeemReward(user: User, cafeId: string, rewardId: string, key: string) {
  return transaction(() => {
    const redeemed = one<{ code: string; reward_id: string; cafe_id: string }>(
      `SELECT c.code,l.reward_id,l.cafe_id FROM loyalty_ledger l JOIN coupons c ON c.id=l.coupon_id
      WHERE l.user_id=? AND l.request_key=?`,
      user.id,
      key,
    );
    if (redeemed) {
      v.ensure(
        redeemed.reward_id === rewardId && redeemed.cafe_id === cafeId,
        'درخواست قبلاً برای پاداش دیگری استفاده شده است.',
        409,
      );
      return redeemed.code;
    }
    const cafe = cafeById(cafeId);
    v.ensure(
      cafe.active && cafe.owner_id && !cafe.is_demo && program(cafeId)?.active,
      'باشگاه کافه فعال نیست.',
      409,
    );
    const reward = one<Reward>(
      'SELECT * FROM loyalty_rewards WHERE id=? AND cafe_id=? AND active=1',
      rewardId,
      cafeId,
    );
    v.ensure(reward, 'پاداش پیدا نشد.', 404);
    const couponId = randomUUID(),
      code = 'VIT-' + randomBytes(8).toString('hex').toUpperCase();
    run(
      'INSERT INTO coupons(id,cafe_id,code,percent,expires,max_uses,recipient_id) VALUES (?,?,?,?,?,1,?)',
      couponId,
      cafeId,
      code,
      reward.percent,
      daysAhead(31)[30],
      user.id,
    );
    changeLoyaltyPoints(user.id, cafeId, -reward.cost, 'دریافت پاداش ' + reward.name, {
      key,
      rewardId,
      couponId,
    });
    return code;
  });
}
