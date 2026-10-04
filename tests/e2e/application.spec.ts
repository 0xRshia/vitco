import { test, expect } from '@playwright/test';

test('public views are Persian, RTL, responsive, navigable and free of browser errors', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const routes = [
    '/',
    '/cafes',
    '/cafes/vitrin-aala',
    '/menu',
    '/products/vitrin-1',
    '/cart',
    '/orders',
    '/reservations',
    '/reserve',
    '/profile',
    '/settings',
    '/addresses',
    '/payment',
    '/rewards',
    '/favorites',
    '/notifications',
    '/support',
    '/events',
    '/scan',
    '/about',
    '/contact',
    '/privacy',
    '/terms',
    '/dashboard',
    '/login',
    '/register',
    '/forgot-password',
  ];
  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator('h1:visible').first()).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'fa');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      route + ' horizontal overflow',
    ).toBe(true);
  }
  await page.goto('/cafes');
  await page.getByRole('textbox', { name: 'جستجوی کافه‌ها' }).fill('پیدا نمی‌شود');
  await expect(page.getByText('کافه‌ای با این مشخصات پیدا نشد')).toBeVisible();
  await page.goto('/settings');
  await page.getByRole('button', { name: 'تیره', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(errors).toEqual([]);
});

test('real account, cafe, product, order and reservation workflows persist in SQLite', async ({
  page,
  context,
}) => {
  const email = `workflow-${Date.now()}@example.test`;
  await page.goto('/register');
  await page.getByLabel('نام و نام خانوادگی').fill('همراه آزمون');
  await page.getByLabel('ایمیل', { exact: true }).fill(email);
  await page.getByLabel('رمز عبور', { exact: true }).fill('Test-password-123');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'ساخت حساب', exact: true }).click();
  await expect(page).toHaveURL('/profile');
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'ثبت کافه', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('نام کافه', { exact: true }).fill('کافه آزمون مستقل');
  await dialog.getByLabel('معرفی کافه').fill('داده آزمون در پایگاه داده مجزای تست');
  await dialog.getByLabel('شهر', { exact: true }).fill('تهران');
  await dialog.getByLabel('شماره همراه کافه').fill('09123456789');
  await dialog.getByLabel('نشانی کامل').fill('تهران، خیابان آزمون');
  await dialog.getByRole('button', { name: 'ذخیره و ادامه' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'کافه آزمون مستقل' })).toBeVisible();
  await page.getByRole('button', { name: 'مدیریت منو', exact: true }).click();
  await page.getByRole('button', { name: 'محصول جدید' }).click();
  await dialog.getByLabel('نام محصول').fill('قهوه آزمون');
  await dialog.getByLabel('توضیحات', { exact: true }).fill('توضیحات محصول آزمایشی');
  await dialog.getByLabel('دسته‌بندی').fill('نوشیدنی گرم');
  await dialog.getByLabel('قیمت پایه (تومان)').fill('100000');
  await dialog.getByRole('button', { name: 'ذخیره و ادامه' }).click();
  await expect(dialog).not.toBeVisible();
  const bootstrap = await (await context.request.get('/api/bootstrap')).json();
  const cafe = bootstrap.cafes.find(
    (c: { name: string; owner_id: string }) => c.owner_id === bootstrap.user.id,
  );
  const product = bootstrap.products.find((p: { cafe_id: string }) => p.cafe_id === cafe.id);
  await page.goto('/products/' + product.id);
  await page.getByRole('button', { name: 'افزودن به سبد خرید' }).click();
  await page.goto('/cart');
  await expect(page.getByText('خلاصه سفارش')).toBeVisible();
  await page.getByRole('button', { name: 'ثبت سفارش', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'سفارش شما ثبت شد!' })).toBeVisible();
  const orderId = page.url().split('/orders/')[1].split('?')[0];
  await page.reload();
  await expect(page.getByText('در انتظار تأیید', { exact: true }).first()).toBeVisible();
  let response = await context.request.patch('/api/orders/' + orderId, {
    data: { status: 'preparing' },
  });
  expect(response.status()).toBe(200);
  response = await context.request.patch('/api/orders/' + orderId, { data: { status: 'ready' } });
  expect(response.status()).toBe(200);
  response = await context.request.patch('/api/orders/' + orderId, {
    data: { status: 'completed' },
  });
  expect(response.status()).toBe(200);
  await page.goto('/rewards');
  await expect(page.getByText('۱۰', { exact: true })).toBeVisible();
  await page.goto('/reserve?cafe=' + cafe.id);
  await page.locator('.date-picker>button').nth(2).click();
  await page.locator('.time-picker>button').first().click();
  await page.getByRole('button', { name: 'ثبت درخواست رزرو' }).click();
  await expect(page.getByRole('dialog', { name: 'درخواست رزرو ثبت شد' })).toBeVisible();
  await page.getByRole('link', { name: 'مشاهده رزروهای من' }).click();
  await expect(page.getByRole('heading', { name: 'کافه آزمون مستقل' })).toBeVisible();
  await page.goto('/addresses');
  await page.getByRole('button', { name: 'آدرس جدید' }).click();
  await dialog.getByLabel('عنوان آدرس').fill('خانه');
  await dialog.getByLabel('شهر', { exact: true }).fill('تهران');
  await dialog.getByLabel('نشانی کامل').fill('تهران، نشانی تحویل آزمایشی');
  await dialog.getByLabel('شماره همراه گیرنده').fill('09123456789');
  await dialog.getByRole('button', { name: 'ذخیره و ادامه' }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'خانه', exact: true })).toBeVisible();
  await page.goto('/cafes/' + cafe.id);
  await page.getByRole('button', { name: 'افزودن به علاقه‌مندی‌ها' }).click();
  await page.goto('/favorites');
  await expect(page.getByRole('heading', { name: 'کافه آزمون مستقل' })).toBeVisible();
});

test('API rejects cross-origin writes, unauthenticated writes and unavailable SMS', async ({
  request,
}) => {
  expect((await request.post('/api/orders', { data: {} })).status()).toBe(401);
  expect(
    (
      await request.post('/api/auth/register', {
        headers: { origin: 'https://untrusted.example' },
        data: { name: 'مهاجم', email: 'untrusted@example.test', password: 'password123' },
      })
    ).status(),
  ).toBe(403);
  expect((await request.post('/api/auth/phone', { data: { phone: '09123456789' } })).status()).toBe(
    503,
  );
});
