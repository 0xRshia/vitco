import { test, expect } from '@playwright/test';
import fixture from '../fixtures/hmghadam-cafes.json';

test('source cafés appear on the uncluttered map with real coordinates, attribution and consolidated filters', async ({
  page,
  context,
}, testInfo) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: fixture[1].latitude, longitude: fixture[1].longitude });
  await page.goto('/cafes?q=1453');
  const map = page.getByRole('region', { name: 'نقشه کافه‌های اطراف' });
  const pin = map.getByRole('button', { name: fixture[1].name, exact: true });
  await expect(pin).toBeVisible();
  const data = await (await context.request.get('/api/bootstrap')).json();
  expect(data.directory).toMatchObject({ status: 'ready', cafe_count: 2 });
  const imported = data.cafes.find((c: { id: string }) => c.id === 'invara-' + fixture[1].place_id);
  expect(imported).toMatchObject({
    latitude: fixture[1].latitude,
    longitude: fixture[1].longitude,
    owner_id: null,
    active: false,
    source: fixture[1].source_url,
  });
  await expect(page.locator('.explorer-floating-header .shared-menu-categories')).toHaveCount(0);
  await expect(page.locator('.explorer-floating-header select')).toHaveCount(0);
  const location = await page.getByRole('button', { name: 'موقعیت من', exact: true }).boundingBox();
  expect(location!.x).toBeGreaterThan(testInfo.project.use.viewport!.width / 2);
  const credits = map.locator('.map-source-credit');
  await expect(credits.getByRole('link')).toHaveCount(3);
  expect(await credits.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
    'rgba(0, 0, 0, 0)',
  );
  expect((await credits.boundingBox())!.height).toBeLessThan(20);
  await pin.click();
  await page.screenshot({ path: testInfo.outputPath('source-map.png') });
  await page.getByRole('button', { name: /^فیلترها/ }).click();
  const filters = page.getByRole('dialog', { name: 'فیلتر کافه‌ها' });
  await expect(filters.getByRole('combobox', { name: 'شهر', exact: true })).toBeVisible();
  await filters.getByRole('combobox', { name: 'مرتب‌سازی براساس' }).selectOption('name');
  await filters.getByRole('combobox', { name: 'دسته‌بندی منو' }).selectOption('قهوه');
  await filters.getByRole('checkbox', { name: 'فضای باز', exact: true }).check();
  await filters.getByRole('button', { name: 'اعمال فیلترها' }).click();
  await expect(page).toHaveURL(/category=/);
  await page.reload();
  await page.getByRole('button', { name: /^فیلترها/ }).click();
  await expect(filters.getByRole('combobox', { name: 'مرتب‌سازی براساس' })).toHaveValue('name');
  await expect(filters.getByRole('combobox', { name: 'دسته‌بندی منو' })).toHaveValue('قهوه');
  await expect(filters.getByRole('checkbox', { name: 'فضای باز', exact: true })).toBeChecked();
  await filters.getByRole('button', { name: 'حذف همه', exact: true }).click();
  await filters.getByRole('button', { name: 'اعمال فیلترها' }).click();
  await page.getByRole('button', { name: 'فهرست کافه‌ها', exact: true }).click();
  await expect(page).toHaveURL(/view=list/);
  await page.getByRole('link', { name: /1453 cafe/ }).click();
  await expect(page.getByRole('link', { name: 'این‌ورا، از طریق داده‌های همقدم' })).toHaveAttribute(
    'href',
    fixture[1].source_url,
  );
  await expect(page.getByRole('link', { name: 'رزرو میز', exact: true })).toHaveCount(0);
  await expect(page.getByText('اطلاعات این کافه از')).toContainText(
    'رزرو و سفارش آنلاین این کافه در این سامانه فعال نیست',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
});

test('explicit test café runs the normal table booking, history and cancellation flow with visible demo notices', async ({
  page,
  context,
}, testInfo) => {
  const unique = Date.now() + '-' + testInfo.project.name;
  expect(
    (
      await context.request.post('/api/auth/register', {
        data: {
          name: 'مهمان رزرو آزمایشی',
          email: `directory-demo-${unique}@example.test`,
          password: 'Test-password-123',
        },
      })
    ).status(),
  ).toBe(201);
  await page.goto('/cafes');
  await page.getByRole('link', { name: 'آزمایش رزرو میز', exact: true }).click();
  await expect(page).toHaveURL(/reserve\?cafe=vitco-reservation-demo/);
  await expect(page.getByRole('note')).toContainText('مکان واقعی ندارد');
  await page
    .locator('.date-picker > button')
    .nth(testInfo.project.name === 'mobile' ? 3 : 2)
    .click();
  await page.locator('.time-picker > button').first().click();
  await page.getByRole('button', { name: /میز آزمایشی دو نفره/ }).click();
  await page.screenshot({ path: testInfo.outputPath('demo-reservation.png'), fullPage: true });
  const dock = page.getByLabel('خلاصه رزرو و سفارش', { exact: true });
  await dock.getByRole('button', { name: 'ثبت درخواست رزرو', exact: true }).click();
  const success = page.getByRole('dialog', { name: 'درخواست رزرو ثبت شد' });
  await expect(success).toContainText('رزرو واقعی انجام نشده');
  const reservations = (await (await context.request.get('/api/reservations')).json()).reservations;
  expect(reservations).toHaveLength(1);
  expect(reservations[0]).toMatchObject({
    cafe_id: 'vitco-reservation-demo',
    table_id: 'demo-two',
    status: 'pending',
  });
  expect(reservations[0].order_id).toBeNull();
  await success.getByRole('link', { name: 'مشاهده رزروهای من', exact: true }).click();
  await expect(page.locator('.reservation-card')).toContainText('آزمایشی · رزرو واقعی نیست');
  await page.getByRole('button', { name: /لغو/ }).click();
  await page
    .getByRole('dialog', { name: 'این قرار لغو شود؟' })
    .getByRole('button', { name: 'بله، ادامه بده', exact: true })
    .click();
  await page.getByRole('button', { name: 'قرارهای گذشته', exact: true }).click();
  await expect(page.locator('.reservation-card')).toContainText('لغو شده');
});
