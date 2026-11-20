/* 1) Gezinme ve sayfa yükleme: ana sayfa, tahliller (geçmiş kayıtlar), analiz, rapor ve ayarlar konsol hatası olmadan açılır. */
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { registerUser, collectErrors, go, uploadLabPdf, FIXTURES } from './helpers.mjs';

test('tüm ana ekranlar konsol hatası olmadan yüklenir', async ({ page }) => {
  const errors = collectErrors(page);
  await registerUser(page);

  await go(page, 'view-home');
  await expect(page.locator('#view-home')).toContainText(/\S/);

  // Geçmiş kayıtların dolu hâlini de görmek için bir tahlil yüklenir
  await uploadLabPdf(page, path.join(FIXTURES, 'ornek-enabiz-B.pdf'));
  await page.evaluate(() => applyParsedPdfValues());
  await go(page, 'view-labs');
  await expect(page.locator('#labHistoryCountBadge')).toContainText('1');
  await expect(page.locator('#labHistoryListContainer article')).toHaveCount(1);

  await go(page, 'view-neyim');
  await expect(page.locator('#view-neyim .anamnesis-card').first()).toBeVisible();

  await go(page, 'view-clinical-results');
  await expect(page.locator('#view-clinical-results').getByText('Değerlerim')).toBeVisible();

  await go(page, 'view-report');
  await expect(page.locator('#repSimple .rs-tbl tbody tr').first()).toBeVisible();

  await go(page, 'view-settings');
  await expect(page.locator('[data-vt-theme="dark"]')).toBeVisible();

  // Alt gezinme çubuğu gerçek tıklamayla da çalışır
  await go(page, 'view-home');
  expect(errors, errors.join('\n')).toEqual([]);
});
