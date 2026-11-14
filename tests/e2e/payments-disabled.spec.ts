import { test, expect } from '@playwright/test';

test('unconfigured online payments stay unavailable and forged returns never mark offline orders paid', async ({
  page,
  context,
}) => {
  const api = context.request;
  const bootstrap = await (await api.get('/api/bootstrap')).json();
  expect(bootstrap.onlinePayment.available).toBe(false);
  const unique = Date.now() + '-' + Math.random().toString(16).slice(2);
  expect(
    (
      await api.post('/api/auth/register', {
        data: {
          name: 'آزمون پرداخت غیرفعال',
          email: `payment-disabled-${unique}@example.test`,
          password: 'Test-password-123',
        },
      })
    ).status(),
  ).toBe(201);
  const cafeResponse = await api.post('/api/dashboard/cafes', {
    data: {
      name: 'کافه پرداخت محلی',
      description: 'آزمون پرداخت بدون درگاه پیکربندی‌شده',
      city: 'تهران',
      address: 'تهران، نشانی آزمون پرداخت',
      phone: '09123456789',
      opens: '08:00',
      closes: '23:00',
      capacity: 8,
      delivery: false,
      pickup: true,
      delivery_fee: 0,
      active: true,
      amenities: [],
    },
  });
  expect(cafeResponse.status()).toBe(200);
  const cafeId = (await cafeResponse.json()).id;
  const productResponse = await api.post('/api/dashboard/products', {
    data: {
      cafe_id: cafeId,
      name: 'قهوه پرداخت محلی',
      description: 'آزمون قیمت پرداخت',
      category: 'قهوه',
      price: 90000,
      available: true,
      sizes: [],
      addons: [],
      max_addons: 0,
    },
  });
  expect(productResponse.status()).toBe(200);
  const productId = (await productResponse.json()).id;
  const orderInput = {
    items: [{ product_id: productId, quantity: 1, size_id: '', addon_ids: [] }],
    mode: 'pickup',
    coupon: '',
    points: 0,
  };
  expect(
    (
      await api.post('/api/orders', {
        data: {
          ...orderInput,
          payment_method: 'zarinpal',
          request_key: 'disabled-online-' + unique,
        },
      })
    ).status(),
  ).toBe(409);
  await page.goto('/payment');
  await expect(
    page.getByText(
      'پرداخت آنلاین در حال حاضر فعال نیست. می‌توانید هنگام دریافت سفارش مستقیماً به کافه پرداخت کنید.',
    ),
  ).toBeVisible();
  await page.goto('/products/' + productId);
  await page.getByRole('button', { name: 'افزودن به سبد خرید', exact: true }).click();
  await page.goto('/reserve?cafe=' + cafeId);
  await expect(page.getByRole('radio', { name: /پرداخت آنلاین با زرین‌پال/ })).toHaveCount(0);
  await page.goto('/cart');
  await expect(page.getByRole('radio', { name: /پرداخت آنلاین با زرین‌پال/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'ثبت سفارش', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'سفارش شما ثبت شد!' })).toBeVisible();
  const orderId = page.url().split('/orders/')[1].split('?')[0];
  const stored = await (await api.get('/api/orders/' + orderId)).json();
  expect(stored.order).toMatchObject({
    payment_method: 'offline',
    payment_status: 'unpaid',
    total: 90000,
  });
  await page.goto('/orders/' + orderId + '?payment=success');
  await expect(page.getByText('روش پرداخت: هنگام دریافت', { exact: true })).toBeVisible();
  await expect(page.getByText('پرداخت تأیید شده', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'پرداخت آنلاین', exact: true })).toHaveCount(0);
  const initiation = await api.post('/api/payments', { data: { order_id: orderId } });
  expect([409, 503]).toContain(initiation.status());
  const forgedReturn = await api.get(
    '/api/payments/callback?' +
      new URLSearchParams({
        payment: 'nonexistent-attempt',
        state: 'forged-state',
        Authority: 'A00000000000000000000000000000000000',
        Status: 'OK',
      }),
    { maxRedirects: 0 },
  );
  expect(forgedReturn.headers().location || '').not.toContain('payment=success');
  expect(forgedReturn.status()).not.toBe(200);
  expect((await (await api.get('/api/orders/' + orderId)).json()).order).toMatchObject({
    payment_method: 'offline',
    payment_status: 'unpaid',
    total: 90000,
  });
});
