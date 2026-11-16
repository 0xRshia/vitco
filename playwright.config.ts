import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 10000 },
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    {
      name: 'mobile',
      use: { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true },
    },
  ],
  webServer: {
    command: 'npm run start -- --port 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: false,
    env: {
      DATABASE_PATH: join(mkdtempSync(join(tmpdir(), 'vitrin-e2e-')), 'test.sqlite'),
      APP_ORIGIN: 'http://localhost:3100',
      ZARINPAL_MERCHANT_ID: '',
      ZARINPAL_ENV: '',
      ZARINPAL_CAFE_IDS: '',
      CAFE_DIRECTORY_FILE: join(process.cwd(), 'tests/fixtures/hmghadam-cafes.json'),
      CAFE_DIRECTORY_USERNAME: '',
      CAFE_DIRECTORY_PASSWORD: '',
      RESERVATION_DEMO_ENABLED: '1',
    },
  },
});
