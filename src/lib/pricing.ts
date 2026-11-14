import { randomUUID } from 'node:crypto';
import { all, run, transaction } from './database';
import { ownerCafe } from './commerce';
import { productCategory } from './catalog';
import { latin } from './format';
import { ensure, integer, list, object, text } from './validation';
import type { User } from './types';

export type PriceChange = { id: string; name: string; old_price: number; new_price: number };
function matchesCategory(category: string, requested: string) {
  const normalized = productCategory(category);
  if (requested === 'نوشیدنی')
    return ['نوشیدنی', 'نوشیدنی گرم', 'نوشیدنی سرد', 'قهوه'].includes(normalized);
  if (requested === 'فست فود') return ['فست فود', 'پیتزا', 'برگر', 'ساندویچ'].includes(normalized);
  return normalized === requested;
}
export function adjustCategoryPrices(user: User, input: Record<string, unknown>) {
  const cafeId = text(input.cafe_id, 'کافه', 1, 100);
  ownerCafe(user, cafeId);
  const category = productCategory(text(input.category, 'دسته‌بندی', 2, 60));
  const mode = text(input.mode, 'نوع تغییر', 1, 10),
    reason = text(input.reason ?? 'manual', 'دلیل تغییر', 1, 20);
  ensure(['percent', 'fixed'].includes(mode), 'نوع تغییر قیمت معتبر نیست.');
  ensure(['tax', 'inflation', 'manual'].includes(reason), 'دلیل تغییر قیمت معتبر نیست.');
  const amount = typeof input.amount === 'string' ? Number(latin(input.amount)) : input.amount;
  ensure(typeof amount === 'number' && Number.isFinite(amount), 'مقدار تغییر معتبر نیست.');
  if (mode === 'percent')
    ensure(
      amount >= -100 && amount <= 1000 && Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-7,
      'درصد تغییر باید بین منفی صد تا هزار و با حداکثر دو رقم اعشار باشد.',
    );
  else integer(amount, 'مبلغ تغییر', -100000000, 100000000);
  ensure(typeof input.preview === 'boolean', 'نوع پیش‌نمایش معتبر نیست.');
  return transaction(() => {
    const products = all<{ id: string; name: string; category: string; price: number }>(
      'SELECT id,name,category,price FROM products WHERE cafe_id=? ORDER BY id',
      cafeId,
    ).filter((p) => matchesCategory(p.category, category));
    ensure(products.length, 'محصولی در این دسته‌بندی وجود ندارد.');
    const changes: PriceChange[] = products.map((p) => {
      const price =
        mode === 'percent' ? Math.round((p.price * (100 + amount)) / 100) : p.price + amount;
      integer(price, 'قیمت نهایی', 0, 100000000);
      return { id: p.id, name: p.name, old_price: p.price, new_price: price };
    });
    if (!input.preview) {
      const expected = list(input.expected, 5000)
        .map((value) => {
          const item = object(value);
          return {
            id: text(item.id, 'محصول', 1, 100),
            price: integer(item.price, 'قیمت قبلی', 0, 100000000),
          };
        })
        .sort((a, b) => a.id.localeCompare(b.id));
      const actual = products
        .map((p) => ({ id: p.id, price: p.price }))
        .sort((a, b) => a.id.localeCompare(b.id));
      ensure(
        JSON.stringify(expected) === JSON.stringify(actual),
        'منو پس از پیش‌نمایش تغییر کرده است. دوباره پیش‌نمایش را دریافت کنید.',
        409,
      );
      for (const change of changes)
        run(
          'UPDATE products SET price=? WHERE id=? AND cafe_id=?',
          change.new_price,
          change.id,
          cafeId,
        );
      run(
        'INSERT INTO price_adjustments (id,owner_id,cafe_id,category,reason,mode,amount,changes,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
        randomUUID(),
        user.id,
        cafeId,
        category,
        reason,
        mode,
        amount,
        JSON.stringify(changes),
        new Date().toISOString(),
      );
    }
    return { changes, count: changes.length, preview: input.preview };
  });
}
