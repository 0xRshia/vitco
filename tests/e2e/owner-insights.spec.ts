import { test, expect } from '@playwright/test';
import { today, dateLabel } from '../../src/lib/format';

test('owner reports use real customer orders and pricing previews preserve historical totals', async ({
  page,
  context,
  request: customer,
}, testInfo) => {
  const owner = context.request;
  const unique = Date.now() + '-' + Math.random().toString(16).slice(2);
  for (const [client, role] of [
    [owner, 'owner'],
    [customer, 'customer'],
  ] as const) {
    expect(
      (
        await client.post('/api/auth/register', {
          data: {
            name: role === 'owner' ? 'مدیر گزارش آزمون' : 'مشتری گزارش آزمون',
            email: `${role}-insights-${unique}@example.test`,
            password: 'Test-password-123',
          },
        })
      ).status(),
    ).toBe(201);
  }
  const cafeResponse = await owner.post('/api/dashboard/cafes', {
    data: {
      name: 'کافه گزارش ' + unique,
      description: 'کافه مخصوص آزمون گزارش‌ها در پایگاه داده جداگانه',
      city: 'تهران',
      address: 'تهران، نشانی آزمون گزارش',
      phone: '09123456789',
      opens: '08:00',
      closes: '23:00',
      capacity: 10,
      delivery: false,
      pickup: true,
      delivery_fee: 0,
      active: true,
      amenities: [],
      tables: [{ id: 'window', name: 'کنار پنجره', seats: 4 }],
    },
  });
  expect(cafeResponse.status()).toBe(200);
  const cafeId = (await cafeResponse.json()).id;
  const productResponse = await owner.post('/api/dashboard/products', {
    data: {
      cafe_id: cafeId,
      name: 'لاته گزارش',
      description: 'محصول آزمون گزارش',
      category: 'قهوه',
      price: 100000,
      available: true,
      sizes: [],
      addons: [],
      max_addons: 0,
    },
  });
  expect(productResponse.status()).toBe(200);
  const productId = (await productResponse.json()).id;
  const orderIds: string[] = [];
  for (const [index, quantity] of [2, 1, 1].entries()) {
    const placed = await customer.post('/api/orders', {
      data: {
        items: [{ product_id: productId, quantity, size_id: '', addon_ids: [] }],
        mode: 'pickup',
        coupon: '',
        points: 0,
        request_key: `${unique}-${index}`,
      },
    });
    expect(placed.status()).toBe(201);
    const orderId = (await placed.json()).id;
    orderIds.push(orderId);
    if (index === 2)
      expect(
        (
          await customer.patch('/api/orders/' + orderId, { data: { status: 'cancelled' } })
        ).status(),
      ).toBe(200);
    else
      for (const status of ['preparing', 'ready', 'completed'])
        expect((await owner.patch('/api/orders/' + orderId, { data: { status } })).status()).toBe(
          200,
        );
  }
  const reportPath =
    '/api/dashboard/analytics?' + new URLSearchParams({ from: today(), to: today(), cafe: cafeId });
  const report = await owner.get(reportPath);
  expect(report.status()).toBe(200);
  expect(await report.json()).toMatchObject({
    order_count: 3,
    completed_order_count: 2,
    sales: 300000,
    new_customer_count: 1,
    top_items: [{ product_id: productId, quantity: 3, order_count: 2 }],
    item_customers: [
      { product_id: productId, customer_name: 'مشتری گزارش آزمون', quantity: 3, order_count: 2 },
    ],
  });
  expect((await customer.get(reportPath)).status()).toBe(403);
  expect(
    (
      await customer.post('/api/dashboard/prices', {
        data: { cafe_id: cafeId, category: 'قهوه', mode: 'percent', amount: 10, preview: true },
      })
    ).status(),
  ).toBe(403);
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'مدیریت مشتریان', exact: true }).click();
  await page.getByLabel('کافه گزارش').selectOption(cafeId);
  const reportFrom = page.getByRole('group', { name: 'از تاریخ', exact: true });
  await reportFrom.getByRole('button').first().click();
  await reportFrom.getByRole('button', { name: 'ماه جاری', exact: true }).click();
  await reportFrom.getByRole('button', { name: dateLabel(today()), exact: true }).click();
  await expect(
    page.locator('.owner-customer').getByRole('heading', { name: 'مشتری گزارش آزمون' }),
  ).toBeVisible();
  await expect(page.locator('.owner-customer')).toContainText('لاته گزارش');
  await expect(
    page
      .locator('.owner-metrics .stat-card')
      .filter({ hasText: 'مشتریان تازه از طریق ویتکو' })
      .locator('strong'),
  ).toHaveText('۱');
  await page.getByRole('button', { name: 'مدیریت و فروش', exact: true }).click();
  await expect(page.getByRole('img', { name: 'روند فروش روزانه ویتکو' })).toBeVisible();
  await expect(
    page
      .locator('.owner-metrics .stat-card')
      .filter({ hasText: 'تعداد سفارش‌ها در بازه' })
      .locator('strong'),
  ).toHaveText('۳');
  await page.getByLabel('جستجوی آیتم در سفارش‌های تکمیل‌شده').fill('لاته');
  await expect(
    page
      .locator('table')
      .filter({ has: page.getByRole('columnheader', { name: 'دفعات سفارش', exact: true }) })
      .getByRole('row')
      .last(),
  ).toContainText('مشتری گزارش آزمون');
  await page.screenshot({ path: testInfo.outputPath('owner-sales-report.png'), fullPage: true });
  await page.getByLabel('جستجوی آیتم در سفارش‌های تکمیل‌شده').fill('یافت نمی‌شود');
  await expect(
    page.getByText('آیتمی با این نام در سفارش‌های تکمیل‌شده این بازه پیدا نشد.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'مدیریت منو', exact: true }).click();
  const pricing = page.locator('.owner-bulk-pricing');
  await pricing.locator('summary').click();
  await pricing.getByLabel('کافه تغییر قیمت').selectOption(cafeId);
  await pricing.getByLabel('دسته‌بندی تغییر قیمت').selectOption('قهوه');
  await pricing.getByLabel('درصد تغییر', { exact: true }).fill('10');
  await pricing.getByRole('button', { name: 'پیش‌نمایش قیمت‌های جدید' }).click();
  await expect(pricing.getByRole('cell', { name: 'لاته گزارش' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('owner-price-preview.png'), fullPage: true });
  const beforeApply = await (await owner.get('/api/dashboard')).json();
  expect(beforeApply.products.find((p: { id: string }) => p.id === productId).price).toBe(100000);
  await pricing.getByRole('button', { name: /اعمال قیمت‌های نمایش‌داده‌شده/ }).click();
  await expect
    .poll(
      async () =>
        (await (await owner.get('/api/dashboard')).json()).products.find(
          (p: { id: string }) => p.id === productId,
        ).price,
    )
    .toBe(110000);
  await page.getByLabel('کافه محصولات').selectOption(cafeId);
  const productRow = page
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: 'لاته گزارش', exact: true }) });
  await productRow.getByRole('button', { name: 'ویرایش', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('قیمت پایه (تومان)').fill('125000');
  await dialog.getByRole('button', { name: 'ذخیره و ادامه' }).click();
  await expect(dialog).not.toBeVisible();
  expect(
    (await (await owner.get('/api/dashboard')).json()).products.find(
      (p: { id: string }) => p.id === productId,
    ).price,
  ).toBe(125000);
  expect((await (await customer.get('/api/orders/' + orderIds[0])).json()).order.total).toBe(
    200000,
  );
  expect((await (await owner.get(reportPath)).json()).sales).toBe(300000);
  await page.getByRole('button', { name: 'کافه‌های من', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'تغییر آیتم و دسته‌بندی', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'ویرایش', exact: true }).click();
  await expect(dialog.getByLabel('نام میز ۱')).toHaveValue('کنار پنجره');
  await dialog.getByLabel('ظرفیت میز ۱').fill('3');
  await dialog.getByRole('button', { name: 'افزودن عکس', exact: true }).click();
  await dialog.getByLabel('انتخاب کافه، عکس ۱').setInputFiles({
    name: 'gallery-test.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aR1sAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await expect(dialog.getByAltText('کافه، عکس ۱')).toHaveAttribute('src', /^\/api\/media\//);
  await dialog.getByRole('button', { name: 'ذخیره و ادامه' }).click();
  await expect(dialog).not.toBeVisible();
  expect((await (await owner.get('/api/dashboard')).json()).cafes[0].tables[0]).toMatchObject({
    id: 'window',
    seats: 3,
  });
  expect((await (await owner.get('/api/dashboard')).json()).cafes[0].images).toHaveLength(1);
  await page.getByRole('button', { name: 'ایجاد رویداد جدید', exact: true }).click();
  await dialog.getByLabel('عنوان رویداد').fill('رویداد گزارش');
  await dialog.getByLabel('توضیحات رویداد').fill('رویداد آزمون با ساعت پایان مشخص');
  const futureDate = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  await dialog
    .getByRole('group', { name: 'تاریخ', exact: true })
    .getByRole('button', { name: 'انتخاب تاریخ' })
    .click();
  await dialog.getByRole('button', { name: dateLabel(futureDate), exact: true }).click();
  await dialog
    .getByRole('group', { name: 'ساعت', exact: true })
    .getByRole('combobox')
    .selectOption('18:00');
  await dialog.getByLabel('ساعت پایان رویداد').selectOption('20:00');
  await dialog.getByLabel('ظرفیت مهمان‌ها').fill('5');
  await dialog.getByRole('button', { name: 'ذخیره و ادامه' }).click();
  await expect(dialog).not.toBeVisible();
  expect((await (await owner.get('/api/dashboard')).json()).events[0]).toMatchObject({
    title: 'رویداد گزارش',
    end_time: '20:00',
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
});
