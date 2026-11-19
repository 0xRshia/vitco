import { test, expect, type APIRequestContext } from '@playwright/test';

async function setup(client: APIRequestContext, suffix: string, percent = 30) {
  expect(
    (
      await client.post('/api/auth/register', {
        data: {
          name: 'مدیر مسیر جدید',
          email: `browse-invoice-${suffix}@example.test`,
          password: 'Test-password-123',
        },
      })
    ).status(),
  ).toBe(201);
  const cafeData = {
    name: `کافه مسیر ${suffix}`,
    description: 'داده آزمون در پایگاه داده موقت',
    city: 'تهران',
    address: 'خیابان آزمون مسیر جدید',
    phone: '09123456789',
    opens: '08:00',
    closes: '23:00',
    capacity: 20,
    pickup: true,
    active: true,
    amenities: ['wifi'],
    latitude: 35.7,
    longitude: 51.4,
    invoice_discount_percent: percent,
  };
  const response = await client.post('/api/dashboard/cafes', { data: cafeData });
  expect(response.status()).toBe(200);
  const cafe = { ...cafeData, id: (await response.json()).id };
  expect(
    (
      await client.post('/api/dashboard/products', {
        data: {
          cafe_id: cafe.id,
          name: `لاته مسیر ${suffix}`,
          description: 'انتخاب اندازه و افزودنی در منوی فهرستی',
          category: 'قهوه',
          price: 100000,
          available: true,
          sizes: [
            { id: 'regular', name: 'معمولی', price: 0 },
            { id: 'large', name: 'بزرگ', price: 20000 },
          ],
          addons: [{ id: 'milk', name: 'شیر بادام', price: 10000 }],
          max_addons: 1,
        },
      })
    ).status(),
  ).toBe(200);
  return cafe;
}

test('responsive map selects café details, supports drawer and filters, and opens menu options', async ({
  page,
  context,
}, testInfo) => {
  const unique = Date.now() + '-' + testInfo.project.name;
  const cafe = await setup(context.request, unique);
  const secondResponse = await context.request.post('/api/dashboard/cafes', {
    data: {
      ...cafe,
      name: `کافه فضای باز ${unique}`,
      amenities: ['outdoor'],
      latitude: 35.72,
      longitude: 51.42,
    },
  });
  expect(secondResponse.status()).toBe(200);
  const secondId = (await secondResponse.json()).id;
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 35.7, longitude: 51.4 });
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'ارسال به آدرس' })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'مراحل پرداخت حضوری' })).toBeVisible();
  const worker = page.waitForResponse(
    (response) =>
      /\/vendor\/maplibre\/[\d.]+\/maplibre-gl-worker\.mjs$/.test(response.url()) &&
      response.status() === 200,
  );
  await page.goto('/cafes?q=' + encodeURIComponent(unique));
  await worker;
  const map = page.getByRole('region', { name: 'نقشه کافه‌های اطراف' });
  const explorer = page.locator('.cafe-explorer');
  const handle = explorer.getByRole('button', { name: /^(جمع کردن|گسترش) فهرست کافه‌ها$/ });
  await expect(map).toBeVisible();
  const box = await map.boundingBox();
  if (testInfo.project.name === 'mobile') {
    expect(box!.height).toBeGreaterThan(testInfo.project.use.viewport!.height - 5);
    await handle.press('Escape');
    await expect(explorer).toHaveAttribute('data-drawer', 'collapsed');
  } else {
    expect(box!.width).toBeLessThan(testInfo.project.use.viewport!.width / 2);
    expect(box!.height).toBeGreaterThan(400);
  }
  await map.getByRole('button', { name: cafe.name, exact: true }).click();
  const drawer = page.getByRole('region', { name: 'کافه‌های این محدوده' });
  const selected = drawer.locator('.explorer-cafe-card[data-selected="true"]');
  await expect(selected.getByRole('heading', { name: cafe.name, exact: true })).toBeVisible();
  const selectedLink = drawer.getByRole('link', { name: new RegExp(cafe.name) });
  await expect(selectedLink).toHaveAttribute('href', '/cafes/' + cafe.id);
  await expect(selectedLink).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('fullscreen-map.png') });
  await handle.focus();
  await handle.press('ArrowUp');
  await expect(page.locator('.cafe-explorer')).toHaveAttribute('data-drawer', 'expanded');
  await drawer.getByRole('button', { name: 'جمع کردن فهرست کافه‌ها' }).press('Escape');
  await expect(page.locator('.cafe-explorer')).toHaveAttribute('data-drawer', 'collapsed');
  await page.getByRole('button', { name: /^فیلترها/ }).click();
  const filters = page.getByRole('dialog', { name: 'فیلتر کافه‌ها' });
  await filters.getByRole('checkbox', { name: 'فضای باز', exact: true }).check();
  await filters.getByRole('button', { name: 'اعمال فیلترها' }).click();
  await expect(map.getByRole('button', { name: cafe.name, exact: true })).toHaveCount(0);
  await expect(
    map.getByRole('button', { name: `کافه فضای باز ${unique}`, exact: true }),
  ).toBeVisible();
  if (testInfo.project.name === 'mobile')
    await page.getByRole('button', { name: /^فیلترها/ }).click();
  await page.getByRole('button', { name: 'فهرست کافه‌ها', exact: true }).click();
  await expect(page).toHaveURL(/view=list/);
  await expect(
    page
      .locator('.cafe-directory-list')
      .getByRole('link', { name: new RegExp(`کافه فضای باز ${unique}`) }),
  ).toHaveAttribute('href', '/cafes/' + secondId);
  await page.screenshot({ path: testInfo.outputPath('compact-cafes.png'), fullPage: true });
  await page.goto('/cafes/' + cafe.id);
  const menu = page.getByRole('region', { name: 'منوی کافه', exact: true });
  await menu.getByRole('button', { name: `انتخاب لاته مسیر ${unique}`, exact: true }).click();
  const options = page.getByRole('dialog', { name: `لاته مسیر ${unique}`, exact: true });
  await options.getByRole('radio', { name: /^بزرگ/ }).check();
  await options.getByRole('checkbox', { name: /^شیر بادام/ }).check();
  await options.getByRole('button', { name: 'افزودن به سبد خرید', exact: true }).click();
  const cart = await page.evaluate(() => JSON.parse(localStorage.getItem('vitrin-cart') || '[]'));
  expect(cart[0]).toMatchObject({
    cafe_id: cafe.id,
    size_id: 'large',
    addon_ids: ['milk'],
    price: 130000,
  });
  await page.goto('/cart');
  await expect(page.getByRole('button', { name: 'ارسال به آدرس' })).toHaveCount(0);
  await expect(page.getByText('هزینه ارسال', { exact: true })).toHaveCount(0);
  const rejected = await context.request.post('/api/orders', {
    data: {
      mode: 'delivery',
      items: [{ product_id: cart[0].product_id, quantity: 1, size_id: 'regular', addon_ids: [] }],
      request_key: `removed-delivery-${unique}`,
    },
  });
  expect(rejected.status()).toBe(400);
  expect((await rejected.json()).error).toContain('دیگر ارائه نمی‌شود');
});

test('invoice amount, owner discounts and coupons produce a real quote; disabled gateway creates no order', async ({
  page,
  context,
}, testInfo) => {
  const unique = Date.now() + '-' + testInfo.project.name;
  const cafe = await setup(context.request, unique);
  const coupon = await context.request.post('/api/dashboard/coupons', {
    data: { cafe_id: cafe.id, code: 'BILL40', percent: 40, expires: '2099-12-31', max_uses: 10 },
  });
  expect(coupon.status()).toBe(200);
  const before = (await (await context.request.get('/api/orders')).json()).orders.length;
  await page.goto('/bill?cafe=' + cafe.id);
  const amount = page.getByRole('textbox', { name: 'مبلغ فاکتور (تومان)', exact: true });
  await expect(page.getByRole('button', { name: 'ادامه', exact: true })).toBeDisabled();
  await amount.fill('۵۰۰٬۰۰۰');
  await page.getByRole('button', { name: 'ادامه', exact: true }).click();
  const total = page.getByRole('region', { name: 'مبلغ قابل پرداخت فاکتور' });
  await expect(total.getByText('۳۵۰٬۰۰۰ تومان', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^کد تخفیف/ }).click();
  const couponSheet = page.getByRole('dialog', { name: 'کد تخفیف فاکتور' });
  await couponSheet.getByRole('textbox', { name: 'کد تخفیف', exact: true }).fill('INVALID');
  await couponSheet.getByRole('button', { name: 'اعمال کد', exact: true }).click();
  await expect(couponSheet.getByRole('alert')).toContainText('نامعتبر');
  await couponSheet.getByRole('textbox', { name: 'کد تخفیف', exact: true }).fill('BILL40');
  await couponSheet.getByRole('button', { name: 'اعمال کد', exact: true }).click();
  await expect(couponSheet).not.toBeVisible();
  await expect(total.getByText('۳۰۰٬۰۰۰ تومان', { exact: true })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'زرین‌پال', exact: true })).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'درگاه پرداخت هنوز فعال نیست', exact: true }),
  ).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('invoice-discounts.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  const direct = await context.request.post('/api/invoices', {
    data: {
      cafe_id: cafe.id,
      amount: 500000,
      coupon: 'BILL40',
      expected_total: 300000,
      request_key: 'disabled-invoice-' + unique,
    },
  });
  expect(direct.status()).toBe(409);
  expect((await (await context.request.get('/api/orders')).json()).orders).toHaveLength(before);
  await page.getByRole('button', { name: 'ویرایش مبلغ فاکتور', exact: true }).click();
  await expect(amount).toHaveValue('۵۰۰٬۰۰۰');
  await amount.fill('0');
  await expect(page.getByRole('button', { name: 'ادامه', exact: true })).toBeDisabled();
});
