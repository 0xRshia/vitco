import { all, one, run, hydrate } from './database';
import { platformAdmin } from './cafe-access';
import type { Product, User } from './types';
import * as v from './validation';
import { defaultCategoryKind, type CategoryKind } from './catalog';

export const featureKeys = [
  'vip_cafe',
  'vip_tables',
  'vip_menu',
  'tour',
  'recommendations',
] as const;
export type FeatureKey = (typeof featureKeys)[number];
export type CafeFeatures = { package: 'basic' | 'premium' } & Record<FeatureKey, boolean>;
export function cafeFeatures(cafeId: string): CafeFeatures {
  const row = one<{ package: CafeFeatures['package'] } & Record<FeatureKey, number>>(
    'SELECT e.* FROM cafe_entitlements e JOIN cafes c ON COALESCE(c.parent_id,c.id)=e.cafe_id WHERE c.id=?',
    cafeId,
  );
  return {
    package: row?.package || 'basic',
    vip_cafe: Boolean(row?.vip_cafe),
    vip_tables: Boolean(row?.vip_tables),
    vip_menu: Boolean(row?.vip_menu),
    tour: Boolean(row?.tour),
    recommendations: Boolean(row?.recommendations),
  };
}
export function setFeatures(user: User, cafeId: string, input: Record<string, unknown>) {
  v.ensure(platformAdmin(user), 'مدیریت امکانات فقط برای مدیر ویتکو است.', 403);
  v.ensure(
    one(
      'SELECT 1 FROM cafes WHERE id=? AND parent_id IS NULL AND owner_id IS NOT NULL AND is_demo=0',
      cafeId,
    ),
    'کافه قابل مدیریت پیدا نشد.',
    404,
  );
  const selected = input.package;
  v.ensure(selected === 'basic' || selected === 'premium', 'بسته کافه معتبر نیست.');
  const features = featureKeys.map((key) => input[key] === true);
  v.ensure(
    selected === 'premium' || !features.some(Boolean),
    'این امکان‌ها در بسته پایه در دسترس نیستند.',
    409,
  );
  v.ensure(
    (!input.vip_menu && !input.vip_tables) || input.vip_cafe === true,
    'برای منو و میز ویژه، نشان کافه ویژه را فعال کنید.',
    409,
  );
  run(
    `INSERT INTO cafe_entitlements(cafe_id,package,vip_cafe,vip_tables,vip_menu,tour,recommendations)
    VALUES (?,?,?,?,?,?,?) ON CONFLICT(cafe_id) DO UPDATE SET package=excluded.package,vip_cafe=excluded.vip_cafe,
    vip_tables=excluded.vip_tables,vip_menu=excluded.vip_menu,tour=excluded.tour,recommendations=excluded.recommendations`,
    cafeId,
    selected,
    ...features.map(Number),
  );
}
export function complementaryItems(cafeId: string, selectedIds: string[], vip: boolean) {
  if (!selectedIds.length || !cafeFeatures(cafeId).recommendations) return [];
  const products = all(
    `SELECT p.*,m.kind FROM products p JOIN cafes c ON c.id=p.cafe_id
    LEFT JOIN menu_categories m ON m.cafe_id=p.cafe_id AND m.name=p.category
    WHERE p.cafe_id=? AND c.active=1 AND p.available=1 AND (p.vip_only=0 OR ?) AND COALESCE(m.visible,1)=1
    ORDER BY COALESCE(m.position,0),p.name`,
    cafeId,
    Number(vip),
  ).map(hydrate<Product & { kind: CategoryKind | null }>);
  const selected = new Set(selectedIds);
  const categoryOf = (item: (typeof products)[number]) =>
    item.kind ?? defaultCategoryKind(item.category);
  const present = new Set(products.filter((item) => selected.has(item.id)).map(categoryOf));
  if (!present.size) return [];
  const complements: Record<CategoryKind, CategoryKind[]> = {
    food: ['drink', 'dessert'],
    drink: ['food', 'dessert'],
    dessert: ['drink', 'food'],
    other: ['drink', 'food'],
  };
  const targets = new Set(
    [...present].flatMap((kind) => complements[kind]).filter((kind) => !present.has(kind)),
  );
  return products
    .filter((item) => !selected.has(item.id) && targets.has(categoryOf(item)))
    .slice(0, 4);
}
