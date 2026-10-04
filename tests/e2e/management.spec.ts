import { test, expect } from '@playwright/test';

test('separate customer and owner accounts enforce prices, capacity, privacy and support access', async ({
  request: owner,
  context,
  page,
}) => {
  const customer = context.request;
  const unique = Date.now();
  for (const [client, role] of [
    [owner, 'owner'],
    [customer, 'customer'],
  ] as const) {
    expect(
      (
        await client.post('/api/auth/register', {
          data: {
            name: role === 'owner' ? 'مدیر آزمون' : 'مشتری آزمون',
            email: `${role}-${unique}@example.test`,
            password: 'Test-password-123',
          },
        })
      ).status(),
    ).toBe(201);
  }
  const cafeResponse = await owner.post('/api/dashboard/cafes', {
    data: {
      name: 'کافه سفارش و رویداد',
      description: 'داده آزمون مدیریت در پایگاه مجزای تست',
      city: 'تهران',
      address: 'تهران، خیابان آزمون',
      phone: '09123456789',
      opens: '08:00',
      closes: '23:00',
      capacity: 2,
      delivery: true,
      pickup: true,
      delivery_fee: 20000,
      active: true,
      amenities: [],
    },
  });
  expect(cafeResponse.status()).toBe(200);
  const cafeId = (await cafeResponse.json()).id;
  const productData = {
    cafe_id: cafeId,
    name: 'لاته با انتخاب اندازه',
    description: 'محصول آزمون سفارشی‌سازی',
    category: 'قهوه',
    price: 100000,
    available: true,
    sizes: [
      { id: 'regular', name: 'معمولی', price: 0 },
      { id: 'large', name: 'بزرگ', price: 20000 },
    ],
    addons: [{ id: 'milk', name: 'شیر بادام', price: 10000 }],
    max_addons: 1,
  };
  const productResponse = await owner.post('/api/dashboard/products', { data: productData });
  expect(productResponse.status()).toBe(200);
  const productId = (await productResponse.json()).id;
  expect(
    (
      await customer.put('/api/dashboard/products', {
        data: { ...productData, id: productId, price: 1 },
      })
    ).status(),
  ).toBe(403);
  await page.goto('/products/' + productId);
  await expect(page.getByRole('radio', { name: 'معمولی' })).toBeChecked();
  await page.getByRole('radio', { name: 'بزرگ' }).check();
  await page.getByRole('checkbox', { name: 'شیر بادام' }).check();
  await page.getByRole('button', { name: 'افزودن به سبد خرید' }).click();
  const cart = await page.evaluate(() => JSON.parse(localStorage.getItem('vitrin-cart') || '[]'));
  expect(cart[0]).toMatchObject({ size_id: 'large', addon_ids: ['milk'], price: 130000 });
  const futureDate = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  expect(
    (
      await owner.post('/api/dashboard/coupons', {
        data: { cafe_id: cafeId, code: 'COFFEE20', percent: 20, expires: futureDate, max_uses: 1 },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await customer.post('/api/addresses', {
        data: {
          title: 'خانه مشتری',
          city: 'تهران',
          street: 'تهران، نشانی مشتری',
          receiver: 'مشتری آزمون',
          phone: '09123456789',
          is_default: true,
        },
      })
    ).status(),
  ).toBe(200);
  const addressId = (await (await customer.get('/api/addresses')).json()).addresses[0].id;
  const orderData = {
    items: [
      { product_id: productId, quantity: 2, size_id: 'large', addon_ids: ['milk'], price: 1 },
    ],
    mode: 'delivery',
    address_id: addressId,
    coupon: 'COFFEE20',
    points: 0,
    request_key: `delivery-${unique}`,
  };
  const quote = await customer.post('/api/quote', { data: orderData });
  expect(await quote.json()).toMatchObject({
    subtotal: 260000,
    discount: 52000,
    delivery_fee: 20000,
    total: 228000,
  });
  const placed = await customer.post('/api/orders', { data: orderData });
  expect(placed.status()).toBe(201);
  const orderId = (await placed.json()).id;
  expect((await (await customer.post('/api/orders', { data: orderData })).json()).id).toBe(orderId);
  expect((await customer.post('/api/quote', { data: orderData })).status()).toBe(400);
  expect((await owner.get('/api/orders/' + orderId)).status()).toBe(404);
  expect(
    (await customer.patch('/api/orders/' + orderId, { data: { status: 'completed' } })).status(),
  ).toBe(400);
  for (const status of ['preparing', 'delivering', 'completed']) {
    expect((await owner.patch('/api/orders/' + orderId, { data: { status } })).status()).toBe(200);
  }
  const bootstrap = await (await customer.get('/api/bootstrap')).json();
  expect(bootstrap.rewards.find((r: { cafe_id: string }) => r.cafe_id === cafeId).points).toBe(22);
  expect(
    (
      await customer.post('/api/tickets', {
        data: {
          order_id: orderId,
          subject: 'پیگیری سفارش',
          body: 'لطفاً جزئیات سفارش را بررسی کنید.',
        },
      })
    ).status(),
  ).toBe(201);
  const ticketId = (await (await customer.get('/api/tickets')).json()).tickets[0].id;
  expect(
    (
      await customer.post('/api/tickets/' + ticketId + '/replies', {
        data: { body: 'پاسخ بدون دسترسی' },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await owner.post('/api/tickets/' + ticketId + '/replies', {
        data: { body: 'سفارش شما بررسی و تحویل آن تأیید شد.' },
      })
    ).status(),
  ).toBe(200);
  await page.goto('/support');
  await page.getByRole('button', { name: 'درخواست‌های من' }).click();
  await expect(page.getByText('سفارش شما بررسی و تحویل آن تأیید شد.')).toBeVisible();
  expect(
    (
      await customer.post('/api/reviews/' + cafeId, {
        data: { rating: 5, body: 'سفارش به‌موقع و با کیفیت رسید.' },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await customer.post('/api/reviews/' + cafeId, {
        data: { rating: 1, body: 'نظر تکراری قابل ثبت نیست.' },
      })
    ).status(),
  ).toBe(400);
  const eventData = {
    cafe_id: cafeId,
    title: 'کارگاه قهوه',
    description: 'رویداد آزمون ظرفیت و ثبت‌نام',
    date: futureDate,
    time: '18:00',
    capacity: 2,
  };
  expect((await owner.post('/api/dashboard/events', { data: eventData })).status()).toBe(200);
  const eventId = (await (await owner.get('/api/dashboard')).json()).events[0].id;
  expect((await customer.post('/api/events/' + eventId, { data: {} })).status()).toBe(200);
  expect((await owner.post('/api/events/' + eventId, { data: {} })).status()).toBe(200);
  expect(
    (
      await owner.put('/api/dashboard/events', { data: { ...eventData, id: eventId, capacity: 1 } })
    ).status(),
  ).toBe(409);
  expect((await customer.post('/api/events/' + eventId + '/leave', { data: {} })).status()).toBe(
    200,
  );
  expect(
    (
      await owner.put('/api/dashboard/events', { data: { ...eventData, id: eventId, capacity: 1 } })
    ).status(),
  ).toBe(200);
  expect((await customer.post('/api/events/' + eventId, { data: {} })).status()).toBe(409);
});
