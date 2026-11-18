import type { Product } from './types';

export const MENU_CATEGORIES = [
  'نوشیدنی گرم',
  'نوشیدنی سرد',
  'قهوه',
  'غذا',
  'پیتزا',
  'برگر',
  'ساندویچ',
] as const;

export const categoryKinds = {
  food: 'غذا',
  drink: 'نوشیدنی',
  dessert: 'دسر',
  other: 'سایر',
} as const;
export type CategoryKind = keyof typeof categoryKinds;
export function defaultCategoryKind(category: string): CategoryKind {
  const name = productCategory(category);
  if (['قهوه', 'نوشیدنی گرم', 'نوشیدنی سرد'].includes(name)) return 'drink';
  if (['غذا', 'پیتزا', 'برگر', 'ساندویچ', 'صبحانه', 'پاستا', 'سالاد', 'پیش غذا'].includes(name))
    return 'food';
  if (['کیک', 'دسر', 'کیک و دسر', 'بستنی', 'شیرینی'].includes(name)) return 'dessert';
  return 'other';
}

const aliases: Record<string, string> = {
  'نوشیدنی های گرم': 'نوشیدنی گرم',
  'نوشیدنیهای گرم': 'نوشیدنی گرم',
  'نوشیدنی های سرد': 'نوشیدنی سرد',
  'نوشیدنیهای سرد': 'نوشیدنی سرد',
  'قهوه ها': 'قهوه',
  غذاها: 'غذا',
  'غذا های ایرانی': 'غذا',
  'غذاهای ایرانی': 'غذا',
  'غذای ایرانی': 'غذا',
  پیتزاها: 'پیتزا',
  برگرها: 'برگر',
  'ساندویچ ها': 'ساندویچ',
  ساندویچها: 'ساندویچ',
};

export function productCategory(category: string): string {
  const normalized = category
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\u200c/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return Object.hasOwn(aliases, normalized) ? aliases[normalized] : normalized;
}

export function menuCategories(products: Pick<Product, 'category'>[]): string[] {
  return [
    ...new Set<string>([...MENU_CATEGORIES, ...products.map((p) => productCategory(p.category))]),
  ].filter(Boolean);
}
