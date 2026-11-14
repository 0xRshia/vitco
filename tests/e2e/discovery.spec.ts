import { test, expect } from '@playwright/test';
import { MENU_CATEGORIES } from '../../src/lib/catalog';

test('menu categories follow the selected location and café event paths use real published events', async ({
  request,
  page,
}, testInfo) => {
  const unique = Date.now();
  const coffeeName = `قهوه دسته‌بندی ${unique}`;
  const burgerName = `برگر دسته‌بندی ${unique}`;
  const ongoingTitle = `رویداد در حال برگزاری آزمون ${unique}`;
  const upcomingTitle = `رویداد آینده آزمون ${unique}`;
  expect(
    (
      await request.post('/api/auth/register', {
        data: {
          name: 'مدیر آزمون دسته‌بندی',
          email: `discovery-${unique}@example.test`,
          password: 'Test-password-123',
        },
      })
    ).status(),
  ).toBe(201);

  const cafes: { id: string; name: string; city: string }[] = [];
  for (const [city, category, name] of [
    ['تهران', 'قهوه', coffeeName],
    ['شیراز', 'برگر', burgerName],
  ]) {
    const cafeName = `کافه ${city} دسته‌بندی ${unique}`;
    const created = await request.post('/api/dashboard/cafes', {
      data: {
        name: cafeName,
        description: 'داده واقعی آزمون در پایگاه داده موقت',
        city,
        address: 'خیابان آزمون دسته‌بندی',
        phone: '09123456789',
        opens: '08:00',
        closes: '23:00',
        capacity: 10,
        pickup: true,
        delivery: false,
        delivery_fee: 0,
        active: true,
        amenities: ['wifi'],
      },
    });
    expect(created.status()).toBe(200);
    const id = (await created.json()).id;
    cafes.push({ id, name: cafeName, city });
    expect(
      (
        await request.post('/api/dashboard/products', {
          data: {
            cafe_id: id,
            name,
            description: 'محصول آزمون دسته‌بندی',
            category,
            price: 100000,
            available: true,
            sizes: [],
            addons: [],
            max_addons: 0,
          },
        })
      ).status(),
    ).toBe(200);
  }

  const eventDate = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  for (const [title, time, end_time] of [
    [ongoingTitle, '12:00', '14:00'],
    [upcomingTitle, '16:00', '18:00'],
  ]) {
    expect(
      (
        await request.post('/api/dashboard/events', {
          data: {
            cafe_id: cafes[0].id,
            title,
            description: 'رویداد واقعی برای آزمون فیلتر زمانی',
            date: eventDate,
            time,
            end_time,
            capacity: 10,
          },
        })
      ).status(),
    ).toBe(200);
  }
  // Advance only this browser's event clock; the records above are real API writes.
  await page.addInitScript(
    (now) => {
      Date.now = () => now;
    },
    Date.parse(`${eventDate}T13:00:00+03:30`),
  );

  await page.goto('/menu?category=' + encodeURIComponent('قهوه'));
  const menuCategories = page.getByRole('group', { name: 'دسته‌بندی منو', exact: true });
  for (const category of MENU_CATEGORIES)
    await expect(menuCategories.getByRole('button', { name: category, exact: true })).toBeVisible();
  await expect(menuCategories.getByRole('button', { name: 'قهوه', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('heading', { name: coffeeName, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: burgerName, exact: true })).toHaveCount(0);

  await page.goto('/cafes?category=' + encodeURIComponent('برگر'));
  await page.getByRole('combobox', { name: 'موقعیت کافه', exact: true }).selectOption('شیراز');
  await expect(page).toHaveURL(/city=/);
  const parameters = new URL(page.url()).searchParams;
  expect(parameters.get('city')).toBe('شیراز');
  expect(parameters.get('category')).toBe('برگر');
  await expect(page.getByRole('heading', { name: cafes[1].name, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: cafes[0].name, exact: true })).toHaveCount(0);
  const cafeCategories = page.getByRole('group', { name: 'فیلتر کافه بر اساس دسته‌بندی منو' });
  for (const category of MENU_CATEGORIES)
    await expect(cafeCategories.getByRole('button', { name: category, exact: true })).toBeVisible();

  await page.goto('/cafes/' + cafes[0].id);
  await expect(page.getByRole('link', { name: 'رزرو و سفارش' })).toHaveAttribute(
    'href',
    '/reserve?cafe=' + cafes[0].id,
  );
  await page.getByRole('button', { name: 'مشاهده و شرکت در رویداد' }).click();
  const filters = page.getByRole('group', { name: 'زمان برگزاری رویدادها' });
  await filters.getByRole('button', { name: /^در حال برگزاری/ }).click();
  await expect(page.getByRole('heading', { name: ongoingTitle, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: upcomingTitle, exact: true })).toHaveCount(0);
  await filters.getByRole('button', { name: /^رویدادهای آینده/ }).click();
  await expect(page.getByRole('heading', { name: upcomingTitle, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: ongoingTitle, exact: true })).toHaveCount(0);
  await filters.getByRole('button', { name: /^تمام رویدادها/ }).click();
  await expect(page.locator('.event-card')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('cafe-events.png'), fullPage: true });
});
