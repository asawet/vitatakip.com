/* 7) Önceki rapordan aralık devralma: aralığı olmayan değer (elle giriş veya aralıksız PDF satırı), kullanıcının
   aynı teste ait EN YAKIN ÖNCEKİ raporundaki laboratuvar aralığıyla değerlendirilir.
   Öncelik: bu rapordaki / kullanıcının yazdığı aralık > önceki rapordan devralınan > uygulamanın genel aralığı. */
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { registerUser, collectErrors, go, uploadLabPdf, FIXTURES } from './helpers.mjs';

const metric = (page, date, key) => page.evaluate(([d, k]) => {
  const r = state.labHistory.find(x => x.date === d);
  const m = getLabHistoryMetric(r, LAB_HISTORY_METRICS.find(mm => mm.key === k));
  return { status: m.status, source: m.referenceSource, ref: m.reference, from: m.inheritedFrom || null };
}, [date, key]);

test('aralıksız değer önceki raporun laboratuvar aralığını devralır', async ({ page }) => {
  const errors = collectErrors(page);
  await registerUser(page, { gender: 'E' });

  /* 1) Aralıklı rapor: 02.10.2026 (TSH 0.3 - 5.4, B12 197 - 771, D vitamini 30 - 100) */
  await uploadLabPdf(page, path.join(FIXTURES, 'ornek-enabiz-A.pdf'));
  await page.getByRole('button', { name: /Değerleri Forma Aktar/ }).click();

  /* 2) 15.11.2026: elle, aralık yazmadan TSH 4,6 + kullanıcı aralığıyla Ferritin 25 + hiç aralığı olmayan eritrosit folatı */
  await go(page, 'view-labs');
  await page.locator('#labManualEntry > summary').click();
  await page.locator('#inputLabDate').fill('2026-11-15');
  await page.locator('#inputLabTsh').fill('4.6');
  await page.locator('#inputLabFerritin').fill('25');
  await page.locator('#inputLabRbcFolate').fill('400');
  await page.evaluate(() => { document.getElementById('inputLabRef-ferritin').value = '20 - 300 ng/mL'; });
  await page.getByRole('button', { name: /Bu Tahlili Tarih ile Kaydet/ }).click();
  await expect.poll(() => page.evaluate(() => document.getElementById('toastMessage')?.textContent || '')).toMatch(/önceki tahlilinizdeki laboratuvar aralığıyla/);

  const tsh = await metric(page, '2026-11-15', 'tsh');
  expect(tsh).toEqual({ status: 'within', source: 'lab', ref: '0.3 - 5.4 mIU/L', from: '2026-10-02' });   // genel aralıkla (0,4–4,0) "dışı" olurdu
  const ferr = await metric(page, '2026-11-15', 'ferritin');
  expect(ferr.ref).toBe('20 - 300 ng/mL');      // kullanıcının yazdığı aralık önceliklidir
  expect(ferr.from).toBeNull();
  const fol = await metric(page, '2026-11-15', 'rbcFolate');
  expect(fol.source).toBe('app');               // hiçbir önceki raporda aralığı yok → genel aralık

  /* 3) Arayüz göstergeleri */
  await page.locator('#labHistoryListContainer article').filter({ hasText: '15' }).first().locator('button[aria-controls]').click();
  await expect(page.locator('#labHistoryListContainer [data-inherited="2026-10-02"]').first()).toContainText('02.10.2026 tarihli tahlilinizdeki laboratuvar aralığı');

  await go(page, 'view-clinical-results');
  const tshChip = page.locator('#view-clinical-results .vs-okchip').filter({ hasText: 'TSH' }).first();
  await expect(tshChip.locator('.vita-inherited-tag')).toHaveText('önceki aralık');
  await expect(page.locator('#view-clinical-results .vs-okchip, #view-clinical-results details.vs-val summary').filter({ hasText: 'Ferritin' }).first().locator('.vita-inherited-tag')).toHaveCount(0);

  await go(page, 'view-report');
  const tshRow = page.locator('#repSimple .rs-tbl tbody tr').filter({ hasText: 'TSH' }).first();
  await expect(tshRow.locator('td.rs-inherited')).toContainText('0.3 - 5.4');
  await expect(page.locator('#repSimple .rs-inherited-note')).toContainText('TSH (Tiroid Stimülan Hormon): 02.10.2026');

  /* 4) Aralıksız PDF satırları (Rapor C, 10.11.2026) önizlemede önceki aralığı gösterir */
  await uploadLabPdf(page, path.join(FIXTURES, 'ornek-enabiz-C.pdf'));
  const modal = page.locator('#eNabizModal');
  for (const k of ['d3', 'tsh', 'ferritin']) await expect(modal.locator(`.vita-inherited-note[data-key="${k}"]`)).toContainText('(02.10.2026)');
  await expect(modal.locator('.vita-fallback-note')).toHaveCount(0);
  await expect(modal.locator('.vita-fallback-banner')).toContainText('3 tanesi önceki tahlilinizdeki laboratuvar aralığıyla');
  await page.getByRole('button', { name: /Değerleri Forma Aktar/ }).click();
  const d3 = await metric(page, '2026-11-10', 'd3');
  expect(d3).toMatchObject({ source: 'lab', from: '2026-10-02', status: 'outside' });   // 24,8 < 30 (A raporu: 30 - 100)

  /* 5) Daha eski tarihli bir kayıt, kendisinden SONRAKİ raporun aralığını devralmaz */
  await go(page, 'view-labs');
  if (!(await page.locator('#labManualEntry').evaluate(d => d.open))) await page.locator('#labManualEntry > summary').click();
  await page.locator('#inputLabDate').fill('2026-06-01');
  await page.locator('#inputLabTsh').fill('4.6');
  await page.getByRole('button', { name: /Bu Tahlili Tarih ile Kaydet/ }).click();
  await expect.poll(() => page.evaluate(() => state.labHistory.some(r => r.date === '2026-06-01'))).toBe(true);
  const old = await metric(page, '2026-06-01', 'tsh');
  expect(old).toMatchObject({ source: 'app', from: null, status: 'outside' });   // genel aralık 0,4–4,0

  expect(errors, errors.join('\n')).toEqual([]);
});
