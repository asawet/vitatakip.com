/* VitaTakip Playwright yapılandırması.
   Çalıştırma (tests/e2e içinde): npm install  →  npx playwright test
   Tarayıcı indirilmez: makinedeki Google Chrome (channel: "chrome") başsız kullanılır.
   Site, depo kökünden 8081 portunda otomatik sunulur. */
import { defineConfig } from '@playwright/test';

/* Canlı siteyi test etmek için: E2E_BASE_URL=https://vitatakip.com.tr npx playwright test
   (verilirse yerel sunucu başlatılmaz) */
const LIVE = process.env.E2E_BASE_URL ? process.env.E2E_BASE_URL.replace(/\/$/, '') : '';

export default defineConfig({
  testDir: './specs',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: LIVE || 'http://localhost:8081',
    channel: 'chrome',
    headless: true,
    viewport: { width: 400, height: 850 },
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    acceptDownloads: true,
    trace: 'retain-on-failure'
  },
  webServer: LIVE ? undefined : {
    command: 'node static-server.mjs ../.. 8081',
    url: 'http://localhost:8081/index.html',
    reuseExistingServer: false,
    timeout: 30_000
  }
});
