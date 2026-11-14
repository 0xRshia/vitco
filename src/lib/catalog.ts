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
