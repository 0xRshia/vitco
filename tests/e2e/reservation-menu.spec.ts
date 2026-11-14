import { test, expect } from '@playwright/test';

test('specific tables and menu selections produce one linked server-priced reservation order', async ({
  request: owner,
  context,
  page,
}, testInfo) => {
  const customer = context.request;
  const unique = `${testInfo.project.name}-${Date.now()}`;
  for (const [client, role] of [
    [owner, 'owner'],
    [customer, 'customer'],
  ] as const) {
    const response = await client.post('/api/auth/register', {
      data: {
        name: role === 'owner' ? 'مدیر رزرو' : 'مهمان رزرو',
        email: `reservation-${role}-${unique}@example.test`,
        password: 'Test-password-123',
      },
    });
    expect(response.status()).toBe(201);
  }
  const created = await owner.post('/api/dashboard/cafes', {
    data: {
      name: 'کافه میز و منو',
      description: 'داده مجزای آزمون رزرو و سفارش',
      city: 'تهران',
      address: 'تهران، خیابان آزمون رزرو',
      phone: '09123456789',
      opens: '08:00',
      closes: '23:00',
      capacity: 6,
      pickup: false,
      delivery: false,
      active: true,
      amenities: ['outdoor'],
      tables: [
        { id: 'window', name: 'میز کنار پنجره', seats: 2 },
        { id: 'family', name: 'میز خانوادگی', seats: 4 },
      ],
    },
  });
  expect(created.status()).toBe(200);
  const cafeId = (await created.json()).id;
  const productResponse = await owner.post('/api/dashboard/products', {
    data: {
      cafe_id: cafeId,
      name: 'لاته میز',
      description: 'قهوه سفارش برای رزرو',
      category: 'قهوه',
      price: 100000,
      available: true,
      sizes: [{ id: 'large', name: 'بزرگ', price: 20000 }],
      addons: [],
      max_addons: 0,
    },
  });
  expect(productResponse.status()).toBe(200);
  const productId = (await productResponse.json()).id;
  await page.goto('/reserve?cafe=' + cafeId);
  await page.locator('.date-picker>button').nth(2).click();
  await page.locator('.time-picker>button').first().click();
  await page.getByRole('button', { name: 'میز کنار پنجره' }).click();
  await page.getByRole('button', { name: 'منو و سفارش', exact: true }).click();
  await page.getByRole('button', { name: 'انتخاب لاته میز', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'بزرگ' })).toBeChecked();
  await page.getByRole('button', { name: 'افزودن به سفارش رزرو', exact: true }).click();
  await expect(page.getByRole('button', { name: 'انتخاب لاته میز', exact: true })).toBeFocused();
  const dock = page.getByLabel('خلاصه رزرو و سفارش', { exact: true });
  await expect(dock).toContainText('لاته میز');
  await expect(dock).toContainText('۱۲۰٬۰۰۰ تومان');
  await expect(dock).toContainText('پرداخت در کافه');
  await expect(dock.getByRole('button', { name: 'ثبت رزرو و سفارش', exact: true })).toBeEnabled();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('reservation-menu.png'), fullPage: true });
  let loseResponse = true;
  await page.route('**/api/reservations', async (route) => {
    if (route.request().method() === 'POST' && loseResponse) {
      loseResponse = false;
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      await route.abort('failed');
    } else await route.continue();
  });
  await dock.getByRole('button', { name: 'ثبت رزرو و سفارش', exact: true }).click();
  await page.getByRole('button', { name: 'بررسی دوباره درخواست قبلی', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'درخواست رزرو ثبت شد' })).toBeVisible();
  const reservations = (await (await customer.get('/api/reservations')).json()).reservations;
  expect(reservations).toHaveLength(1);
  expect(reservations[0]).toMatchObject({
    cafe_id: cafeId,
    table_id: 'window',
    table_name: 'میز کنار پنجره',
  });
  expect(reservations[0].order_id).toBeTruthy();
  const order = (await (await customer.get('/api/orders/' + reservations[0].order_id)).json())
    .order;
  expect(order).toMatchObject({
    mode: 'dine_in',
    total: 120000,
    reservation_id: reservations[0].id,
  });
  expect(order.items[0]).toMatchObject({
    product_id: productId,
    size_id: 'large',
    quantity: 1,
    price: 120000,
  });
  const duplicateTable = await customer.post('/api/reservations', {
    data: {
      cafe_id: cafeId,
      date: reservations[0].date,
      time: reservations[0].time,
      guests: 1,
      table_id: 'window',
      request_key: 'second-table-' + unique,
    },
  });
  expect(duplicateTable.status()).toBe(409);
  await page.getByRole('link', { name: 'مشاهده رزروهای من', exact: true }).click();
  await expect(page).toHaveURL('/reservations');
  await expect(
    page.locator('.reservation-card').getByText('میز کنار پنجره', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'مشاهده سفارش این رزرو' })).toBeVisible();
});
