import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MENU_CATEGORIES, menuCategories, productCategory } from '../src/lib/catalog';

test('shared menu categories normalize imported and plural labels while preserving custom groups', () => {
  assert.equal(productCategory('نوشیدنی‌های گرم'), 'نوشیدنی گرم');
  assert.equal(productCategory('غذای ایرانی'), 'غذا');
  assert.equal(productCategory('ساندويچ‌ها'), 'ساندویچ');
  assert.equal(productCategory('فست فود'), 'فست فود');
  assert.equal(productCategory('constructor'), 'constructor');
  assert.deepEqual(menuCategories([{ category: 'نوشیدنی‌های گرم' }, { category: 'فست فود' }]), [
    ...MENU_CATEGORIES,
    'فست فود',
  ]);
});
