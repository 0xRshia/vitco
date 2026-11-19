import { test, expect } from '@playwright/test';
import fixture from '../fixtures/hmghadam-cafes.json';
import type { Bootstrap } from '../../src/lib/types';

test('an open café search replaces its saved catalogue after sync without a page reload', async ({
  page,
  request,
}) => {
  // Replay an older browser snapshot, then let the real directory endpoint reconcile it.
  const snapshot: Bootstrap = await (await request.get('/api/bootstrap')).json();
  const directory = snapshot.directory!;
  const previous = new Date(Date.parse(directory.synced_at!) - 16 * 60_000).toISOString();
  const importedId = 'invara-' + fixture[1].place_id;
  const saved = snapshot.cafes.filter((cafe) => cafe.id !== importedId);
  let bootstrapLoads = 0;
  await page.route('**/api/bootstrap', async (route) => {
    bootstrapLoads++;
    await route.fulfill({
      json: {
        ...snapshot,
        cafes: saved,
        directory: { ...directory, synced_at: previous, status: 'refreshing', refresh_after_ms: 0 },
      },
    });
  });

  const update = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === '/api/cafe-directory' && url.searchParams.get('since') === previous;
  });
  await page.goto('/cafes?q=1453');
  const fresh = await (await update).json();
  expect(fresh.directory).toMatchObject({ status: 'ready', synced_at: directory.synced_at });
  const results = page.locator('#cafe-map-results');
  await expect(results.getByRole('link', { name: fixture[1].name })).toHaveAttribute(
    'href',
    '/cafes/' + importedId,
  );
  await expect(results.locator('.explorer-unmapped')).toHaveCount(0);
  expect(bootstrapLoads).toBe(1);

  const unchanged = await request.get('/api/cafe-directory', {
    params: { since: fresh.directory.synced_at },
  });
  expect(unchanged.ok()).toBe(true);
  expect(await unchanged.json()).not.toHaveProperty('cafes');
});

test('source cafés appear on the uncluttered map with real coordinates, attribution and consolidated filters', async ({
  page,
  context,
}, testInfo) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: fixture[1].latitude, longitude: fixture[1].longitude });
  await page.goto('/cafes?q=1453');
  const map = page.getByRole('region', { name: 'نقشه کافه‌های اطراف' });
  if (testInfo.project.name === 'mobile') {
    await page.getByRole('button', { name: /^(جمع کردن|گسترش) فهرست کافه‌ها$/ }).press('Escape');
    await expect(page.locator('.cafe-explorer')).toHaveAttribute('data-drawer', 'collapsed');
  }
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
  const mapBounds = (await map.boundingBox())!;
  expect(location!.x).toBeGreaterThan(mapBounds.x);
  expect(location!.x + location!.width).toBeLessThanOrEqual(mapBounds.x + mapBounds.width);
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
  if (testInfo.project.name === 'mobile')
    await page.getByRole('button', { name: /^فیلترها/ }).click();
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

test('café search opens matching cards outside the map area and without a location', async ({
  page,
  context,
  isMobile,
}, testInfo) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 29.59, longitude: 52.58 });
  await page.goto('/cafes');
  const map = page.getByRole('region', { name: 'نقشه کافه‌های اطراف' });
  await expect(map.getByLabel('موقعیت شما')).toHaveCount(1);
  const search = page.getByRole('textbox', { name: 'جستجوی کافه‌ها' });
  const results = page.locator('#cafe-map-results');
  await search.fill(fixture[1].name);
  await expect(results.getByRole('link', { name: /1453 cafe/ })).toHaveAttribute(
    'href',
    '/cafes/invara-' + fixture[1].place_id,
  );
  if (isMobile)
    await expect(page.locator('.cafe-explorer')).toHaveAttribute('data-drawer', 'expanded');
  await search.fill('کافه‌ای با نام ناموجود');
  await expect(results.locator('.explorer-cafe-card')).toHaveCount(0);
  await expect(results.locator('.explorer-empty')).toBeVisible();
  await page.getByRole('button', { name: 'پاک کردن جستجو' }).click();
  await expect(search).toHaveValue('');
  await expect(results.locator('.explorer-empty')).toHaveCount(0);
  await search.fill('کافه اعلا');
  const aala = results.getByRole('link', { name: /کافه اعلا/ });
  await expect(aala).toHaveAttribute('href', '/cafes/vitrin-aala');
  await expect(aala).toContainText('کافه رستورانی برای خانواده ها');
  await expect(map.getByRole('button', { name: 'کافه اعلا', exact: true })).toHaveCount(0);
  if (isMobile) {
    const searchBar = (await page.locator('.explorer-search').boundingBox())!;
    expect(Math.abs(searchBar.height - 44)).toBeLessThanOrEqual(2);
    const drawer = page.getByRole('region', { name: 'کافه‌های این محدوده' });
    const card = (await aala.boundingBox())!;
    await expect
      .poll(async () =>
        Math.abs((await drawer.boundingBox())!.y - (searchBar.y + searchBar.height)),
      )
      .toBeLessThan(16);
    expect(Math.abs(card.width - searchBar.width)).toBeLessThan(4);
    expect(card.width / card.height).toBeCloseTo(4 / 3, 1);
    const noPhoto = (await aala.getByText('بدون تصویر').boundingBox())!;
    const caption = (await aala.locator('.explorer-cafe-caption').boundingBox())!;
    expect(noPhoto.y + noPhoto.height).toBeLessThanOrEqual(caption.y + 1);
    const contact = results.getByRole('link', { name: 'تماس با ما', exact: true });
    await expect(contact).toHaveAttribute('href', '/contact');
    await contact.scrollIntoViewIfNeeded();
    await expect(contact).toBeInViewport();
    await expect(search).toBeInViewport();
    const nav = page.getByRole('navigation', { name: 'پیمایش موبایل' });
    await expect(nav.getByRole('link')).toHaveText(['خانه', 'کافه‌ها', 'سفارش‌ها', 'حساب من']);
    await expect(nav).toBeInViewport();
    await aala.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('expanded-search.png') });
  }
  await aala.click();
  await expect(page).toHaveURL('/cafes/vitrin-aala');
  await expect(
    page.getByRole('heading', { level: 1, name: 'کافه اعلا', exact: true }),
  ).toBeVisible();
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
