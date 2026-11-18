import { expect, test, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';

async function register(client: APIRequestContext, name: string) {
  const email = 'vitco-' + randomUUID() + '@example.test';
  const response = await client.post('/api/auth/register', {
    data: {
      name,
      email,
      password: 'Test-password-123',
    },
  });
  expect(response.status()).toBe(201);
  return email;
}
async function addCafe(
  owner: APIRequestContext,
  name: string,
  tables: Record<string, unknown>[] = [],
) {
  const result = await owner.post('/api/dashboard/cafes', {
    data: {
      name,
      description: 'کافه برای تست مسیر خدمات حضوری',
      city: 'تهران',
      address: 'تهران، خیابان آزمون',
      phone: '09123456789',
      opens: '08:00',
      closes: '23:00',
      capacity: 8,
      pickup: true,
      active: true,
      amenities: [],
      tables,
    },
  });
  expect(result.status(), await result.text()).toBe(200);
  return (await result.json()).id as string;
}

test('a guest scans a table, calls the cashier, places an order and sees preparation status', async ({
  request: owner,
  page,
  browser,
}) => {
  await register(owner, 'مدیر میز آزمون');
  const cafeId = await addCafe(owner, 'کافه میز حضوری', [
    { id: 'terrace', name: 'میز تراس', seats: 4 },
  ]);
  const product = await owner.post('/api/dashboard/products', {
    data: {
      cafe_id: cafeId,
      name: 'لاته تراس',
      description: 'سفارش لاته در کافه',
      category: 'قهوه',
      price: 120000,
      available: true,
      sizes: [],
      addons: [],
      max_addons: 0,
    },
  });
  expect(product.status(), await product.text()).toBe(200);
  const qr = await owner.post('/api/operations/' + cafeId + '/qr', {
    data: { table_id: 'terrace' },
  });
  expect(qr.status(), await qr.text()).toBe(200);
  const workspace = await (await owner.get('/api/operations/' + cafeId)).json();
  const svg = await owner.get('/api/operations/' + cafeId + '/qr/terrace');
  expect(svg.headers()['content-type']).toContain('image/svg+xml');
  expect(await svg.text()).toContain('<svg');

  await page.goto('/t/' + workspace.tables[0].code);
  await expect(page).toHaveURL(new RegExp('/cafes/' + cafeId));
  const table = page.getByRole('region', { name: 'سرویس میز' });
  await expect(table.getByText('میز تراس')).toBeVisible();
  await table.getByRole('button', { name: 'درخواست صندوق‌دار' }).click();
  await expect(table.getByText('در انتظار پاسخ صندوق')).toBeVisible();
  const queue = await (await owner.get('/api/operations/' + cafeId + '/cashier')).json();
  const accepted = await owner.post('/api/operations/' + cafeId + '/cashier/' + queue.calls[0].id, {
    data: { status: 'accepted' },
  });
  expect(accepted.ok(), await accepted.text()).toBe(true);
  await expect(table.getByText('صندوق‌دار درخواست شما را پذیرفت')).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'انتخاب لاته تراس', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'افزودن به سبد خرید' }).click();
  await table.getByRole('link', { name: 'دیدن سبد میز' }).click();
  await expect(page.getByText('سرویس میز تراس', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'ادامه و پرداخت' }).click();
  await expect(page.getByRole('heading', { name: 'تسویه حساب', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'ثبت سفارش', exact: true }).click();
  await expect(page).toHaveURL(/\/orders\/[\w-]+/);
  await expect(page.getByRole('heading', { name: 'سفارش شما ثبت شد!' })).toBeVisible();
  const orderId = new URL(page.url()).pathname.split('/').pop();
  const queueOrders = await (await owner.get('/api/operations/' + cafeId + '/kitchen')).json();
  expect(queueOrders.orders[0]).toMatchObject({
    id: orderId,
    table_name: 'میز تراس',
    status: 'pending',
  });
  const prepared = await owner.patch('/api/orders/' + orderId, {
    data: { status: 'preparing', preparation_minutes: 12 },
  });
  expect(prepared.ok(), await prepared.text()).toBe(true);
  await expect(page.getByText(/زمان تقریبی آماده شدن/)).toBeVisible();
  await page.getByRole('link', { name: 'رسید قابل چاپ' }).click();
  await expect(page).toHaveURL('/orders/' + orderId + '/invoice');
  await expect(page.getByRole('heading', { name: 'رسید سفارش', exact: true })).toBeVisible();
  await expect(page.getByText('لاته تراس × ۱')).toBeVisible();
  const stranger = await browser.newContext();
  try {
    expect(
      (await stranger.request.get(new URL('/api/orders/' + orderId, page.url()).href)).status(),
    ).toBe(401);
  } finally {
    await stranger.close();
  }
  expect(await page.locator('body').evaluate((body) => body.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('legacy storefront links and printed QR codes reach their registered café', async ({
  request: owner,
  page,
}) => {
  await page.goto('/cafes/kafh-aaala/cart');
  await expect(page).toHaveURL('/cart?cafe=vitrin-aala');
  await expect(page.getByRole('link', { name: 'دیدن منوی این کافه' })).toHaveAttribute(
    'href',
    '/cafes/vitrin-aala',
  );
  await page.goto('/branches/31b4c345-62c3-44a4-a83d-5ec9cc3cd7eb/menu');
  await expect(page).toHaveURL('/cafes/vitrin-aala');
  await expect(page.getByRole('heading', { name: 'کافه اعلا', level: 1 })).toBeVisible();
  await page.goto('/cafes/kafh-aaala/checkout');
  await expect(page).toHaveURL('/cart?cafe=vitrin-aala&step=checkout');
  await expect(page.getByRole('heading', { name: 'تسویه حساب', level: 1 })).toBeVisible();
  await page.goto('/dashboard/admin/articles');
  await expect(page).toHaveURL('/admin/articles');

  await register(owner, 'مدیر کدهای چاپ‌شده');
  const cafeId = await addCafe(owner, 'کافه کدهای چاپ‌شده', [
    { id: 'old-table', name: 'میز کنار در', seats: 2 },
  ]);
  const path = '/api/operations/' + cafeId;
  const menuQr = await owner.get(path + '/qr');
  expect(menuQr.headers()['content-type']).toContain('image/svg+xml');
  expect(await menuQr.text()).toContain('<svg');
  expect((await page.request.get(path + '/qr')).status()).toBe(401);
  const printed = 'https://menu-provider.example.test/' + cafeId + '?table=1';
  const mapped = await owner.post(path + '/qr-mappings', {
    data: { url: printed, target: 'table', table_id: 'old-table' },
  });
  expect(mapped.ok(), await mapped.text()).toBe(true);
  await page.goto('/scanner');
  await page
    .getByRole('textbox', { name: 'یا آدرس QR را وارد کنید' })
    .fill(printed + '&utm_source=print');
  await page.getByRole('button', { name: 'بررسی آدرس', exact: true }).click();
  await expect(page).toHaveURL('/cafes/' + cafeId);
  await expect(
    page.getByRole('region', { name: 'سرویس میز' }).getByText('میز کنار در'),
  ).toBeVisible();
  expect(await (await owner.get(path + '/qr-activity')).json()).toMatchObject({ total: 1 });
  const disabled = await owner.post(path + '/tables/old-table', { data: { state: 'disabled' } });
  expect(disabled.ok(), await disabled.text()).toBe(true);
  expect(await (await owner.get(path + '/qr')).text()).toBe(await menuQr.text());
  await expect(page.getByRole('region', { name: 'سرویس میز' })).toHaveCount(0, { timeout: 10000 });
});

test('signing out other sessions keeps the current browser and other accounts signed in', async ({
  context,
  request: otherAccount,
  page,
  browser,
  baseURL,
}) => {
  const email = await register(context.request, 'صاحب نشست');
  await register(otherAccount, 'کاربر دیگر');
  const secondDevice = await browser.newContext({ baseURL });
  try {
    const login = await secondDevice.request.post('/api/auth/login', {
      data: { email, password: 'Test-password-123' },
    });
    expect(login.ok(), await login.text()).toBe(true);
    expect((await secondDevice.request.get('/api/addresses')).ok()).toBe(true);
    await page.goto('/settings');
    await page.getByRole('button', { name: 'خروج از دستگاه‌های دیگر' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'بله، ادامه بده' }).click();
    await expect
      .poll(async () => (await secondDevice.request.get('/api/addresses')).status())
      .toBe(401);
    expect((await context.request.get('/api/addresses')).ok()).toBe(true);
    expect((await otherAccount.get('/api/addresses')).ok()).toBe(true);
  } finally {
    await secondDevice.close();
  }
});

test('a café approves a meeting and only joined accounts can post or read chat', async ({
  request: owner,
  context,
  page,
}) => {
  await register(owner, 'مدیر دورهمی آزمون');
  await register(context.request, 'میزبان دورهمی آزمون');
  const cafeId = await addCafe(owner, 'کافه دورهمی');
  const date = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const response = await context.request.post('/api/meetings', {
    data: {
      cafe_id: cafeId,
      title: 'دورهمی برای خواندن کتاب',
      description: 'گفت‌وگوی گروهی درباره کتاب',
      date,
      time: '18:00',
      end_time: '20:00',
      capacity: 3,
      visibility: 'public',
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  const { id } = (await response.json()) as { id: string };
  await page.goto('/meetings/' + id);
  await expect(page.getByText('در انتظار تأیید کافه')).toBeVisible();
  const approved = await owner.post('/api/meetings/' + id + '/approve', { data: {} });
  expect(approved.ok(), await approved.text()).toBe(true);
  await expect(page.getByText('برنامه‌ریزی شده')).toBeVisible();
  const chat = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'گفتگوی دورهمی', exact: true }) });
  await chat.getByRole('textbox', { name: 'پیام تازه' }).fill('فصل اول را با هم مرور کنیم.');
  await chat.getByRole('button', { name: 'ذخیره و ادامه' }).click();
  await expect(chat.getByText('فصل اول را با هم مرور کنیم.', { exact: true })).toBeVisible();
  await expect(chat.getByRole('textbox', { name: 'پیام تازه' })).toHaveValue('');
  expect((await page.request.get('/api/meetings/' + id + '/messages')).ok()).toBe(true);
  const publicPage = await page.context().browser()!.newContext();
  try {
    expect(
      (
        await publicPage.request.get(new URL('/api/meetings/' + id + '/messages', page.url()).href)
      ).status(),
    ).toBe(401);
  } finally {
    await publicPage.close();
  }
});

test('the contact form and private ticket attachments work from the customer screens', async ({
  page,
  context,
  browser,
}) => {
  await page.goto('/contact');
  await page.getByLabel('نام', { exact: true }).fill('همراه آزمون');
  await page.getByLabel('ایمیل یا شماره همراه').fill('visitor@example.test');
  await page.getByLabel('موضوع', { exact: true }).fill('بازخورد کافه');
  await page.getByLabel('متن پیام').fill('برای همکاری یک پیشنهاد دارم.');
  await page.getByRole('button', { name: 'ذخیره و ادامه' }).click();
  await expect(page.getByRole('status').getByText(/پیام شما ثبت شد/)).toBeVisible();

  await register(context.request, 'همراه پشتیبانی آزمون');
  await page.goto('/support');
  await page.getByLabel('موضوع درخواست').fill('درخواست پیگیری خصوصی');
  await page.getByLabel('پیام شما').fill('این درخواست همراه با یک پیوست فرستاده می‌شود.');
  await page.getByLabel('پیوست‌ها (اختیاری)').setInputFiles({
    name: 'receipt.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('private receipt'),
  });
  await page.getByRole('button', { name: 'ذخیره و ادامه' }).click();
  await page.getByRole('link', { name: 'درخواست پیگیری خصوصی', exact: true }).click();
  const link = page.getByRole('link', { name: 'receipt.txt' });
  await expect(link).toBeVisible();
  const href = (await link.getAttribute('href'))!;
  const download = await context.request.get(href);
  expect(download.ok()).toBe(true);
  expect(await download.text()).toBe('private receipt');
  await page.getByLabel('پاسخ شما').fill('از پیگیری شما سپاسگزارم.');
  await page.getByRole('button', { name: 'ذخیره و ادامه' }).click();
  await expect(page.getByText('از پیگیری شما سپاسگزارم.', { exact: true })).toBeVisible();
  const stranger = await browser.newContext();
  try {
    expect((await stranger.request.get(new URL(href, page.url()).href)).status()).toBe(401);
  } finally {
    await stranger.close();
  }
});
