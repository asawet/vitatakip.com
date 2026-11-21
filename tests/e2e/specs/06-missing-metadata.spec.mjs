/* 6) Eksik meta veri: e-Nabız satırında birim ve/veya laboratuvar aralığı yoksa uygulama çökmez, değeri
   genel karşılaştırma aralığıyla değerlendirir ve bunu PDF önizlemesi, geçmiş, Klinik Analiz ve doktor
   raporunda açıkça belirtir. Rapor: tests/fixtures/ornek-enabiz-C.pdf */
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { registerUser, collectErrors, go, uploadLabPdf, FIXTURES } from './helpers.mjs';
import { FIXTURES as FX } from '../../fixtures/make-enabiz-fixtures.mjs';

const C = FX['ornek-enabiz-C.pdf'];

test('birim/aralık eksik değerler genel aralığa düşer ve bu arayüzde belirtilir', async ({ page }) => {
  const errors = collectErrors(page);
  await registerUser(page, { gender: 'E' });
  const appRef = await page.evaluate(() => ({ d3: getVitaAppLabReference('d3', 'E'), tsh: getVitaAppLabReference('tsh', 'E'), ferritin: getVitaAppLabReference('ferritin', 'E') }));
  expect(appRef.d3).toBe('30–50 ng/mL');

  /* Ayrıştırma: değerler doğru, eksik meta veri işaretli, çökme yok */
  const parsed = await uploadLabPdf(page, path.join(FIXTURES, 'ornek-enabiz-C.pdf'));
  expect(parsed.date).toBe('2026-11-10');
  expect(Object.fromEntries(Object.entries(parsed.vals).map(([k, v]) => [k, v.value]))).toEqual(C.expect);
  const meta = await page.evaluate(() => Object.fromEntries(Object.entries(temporarilyParsedLabResults).map(([k, v]) => [k, { unit: v.unitFromPdf, ref: v.referenceFromPdf }])));
  expect(meta).toEqual(C.metadata);
  // Range printed on the NEXT line together with decision-limit commentary: only the leading range is taken
  expect(parsed.vals.glucose.ref).toBe('74 - 106 mg/dL');

  /* PDF önizlemesi: genel aralık bildirimi + satır notları + varsayılan birim etiketi */
  const modal = page.locator('#eNabizModal');
  await expect(modal.locator('.vita-fallback-banner')).toContainText('3 değerin raporda laboratuvar aralığı yok');
  await expect(modal.locator('.vita-fallback-note[data-key="d3"]')).toContainText(`Genel aralık kullanılacak: ${appRef.d3}`);
  await expect(modal.locator('.vita-fallback-note[data-key="tsh"]')).toContainText(appRef.tsh);
  await expect(modal.locator('.vita-fallback-note[data-key="ferritin"]')).toContainText(appRef.ferritin);
  await expect(modal.locator('.vita-fallback-note[data-key="glucose"]')).toHaveCount(0);
  await expect(modal.locator('.vita-fallback-tag[data-fallback="unit"]')).toHaveCount(2);   // D vitamini ve TSH
  await expect(page.locator('#pdfReference-d3')).toHaveAttribute('placeholder', 'Raporda aralık yok');
  await page.getByRole('button', { name: /Değerleri Forma Aktar/ }).click();

  /* Kayıt: eksik aralık boş kalır (uydurulmaz), değerler genel aralıkla sınıflanır */
  const rec = await page.evaluate(() => { const r = state.labHistory[0]; return { refs: r.references, st: Object.fromEntries(LAB_HISTORY_METRICS.map(m => getLabHistoryMetric(r, m)).filter(Boolean).map(x => [x.key, `${x.status}/${x.referenceSource}`])) }; });
  expect(rec.refs.d3 || '').toBe('');
  expect(rec.refs.tsh || '').toBe('');
  expect(rec.st).toEqual({ d3: 'outside/app', b12: 'within/lab', ferritin: 'within/app', hb: 'within/lab', rbc: 'outside/lab', tsh: 'within/app', glucose: 'within/lab' });

  /* Geçmiş tahlillerim: genel aralık işareti yalnızca aralığı olmayan 3 kartta */
  await go(page, 'view-labs');
  await page.locator('#labHistoryListContainer article button[aria-controls]').first().click();
  await expect(page.locator('#labHistoryListContainer [data-fallback="range"]')).toHaveCount(3);

  /* Solgunluk belirtisi (Hemogram, Ferritin, B12 önerir) seçilir */
  await go(page, 'view-neyim');
  await page.evaluate(() => switchAnamnesisCategoryTab(ANAMNESIS_DICTIONARY.pallor_dark_circles.catId));
  await page.locator(`.anamnesis-card[onclick*="'pallor_dark_circles'"]`).click();

  /* Klinik Analiz: D vitamini 24,8 genel aralıkla "Düşük" ve "genel aralık" etiketli; tam bilgili değerlerde etiket yok */
  await go(page, 'view-clinical-results');

  /* Düzeltme: RBC yüksek → Hemogram isteniyor; aynı anda "Hemogram 90 günde normal ölçüldü" notu ÇIKMAZ */
  const testNames = await page.locator('#vsTests .vs-test-name').allTextContents();
  expect(testNames.some(t => /Hemogram/.test(t))).toBe(true);
  await expect(page.locator('#vsDetails .vs-normal-note').filter({ hasText: 'Hemogram' })).toHaveCount(0);
  await expect(page.locator('#vsDetails .vs-normal-note').filter({ hasText: 'Ferritin' })).toHaveCount(1);

  /* Düzeltme: B12 350 "Sınırda" iken metinler "düşük" demez; değer satırları sade, açılır değil */
  const b12 = page.locator('#view-clinical-results .vs-val').filter({ hasText: 'Vitamin B12' }).first();
  await expect(b12).toContainText('Sınırda');
  await expect(page.locator('#view-clinical-results details.vs-val')).toHaveCount(0);
  await expect(page.locator('#view-clinical-results .vkb-i')).toHaveCount(0);
  const why = await page.locator('#vsTests .vs-test-why').allTextContents();
  expect(why.some(t => /Vitamin B12 sınırda/.test(t))).toBe(true);
  expect(why.some(t => /Vitamin B12 düşük/.test(t))).toBe(false);

  /* Telefonda etiketli satırda tahlil adı sıkışmaz */
  const d3 = page.locator('#view-clinical-results .vs-val').filter({ hasText: 'Vitamin D' }).first();
  expect((await d3.locator('.vs-val-name').boundingBox()).width).toBeGreaterThan(110);
  await expect(d3).toContainText('Düşük');
  await expect(d3.locator('.vita-fallback-tag')).toHaveText('genel aralık');
  await expect(d3.locator('.vita-fallback-tag')).toHaveAttribute('title', /genel karşılaştırma aralığı kullanıldı/);
  /* Normal değerler küçük çekmecede, başta kapalı */
  await expect(page.locator('#vsValues details.vs-okdrawer')).not.toHaveAttribute('open', '');
  await expect(page.locator('#view-clinical-results .vs-okchip').filter({ hasText: 'TSH' }).locator('.vita-fallback-tag')).toHaveCount(1);
  await expect(page.locator('#view-clinical-results .vs-okchip').filter({ hasText: 'Glukoz' }).locator('.vita-fallback-tag')).toHaveCount(0);
  await expect(page.locator('#view-clinical-results .vs-okchip').filter({ hasText: 'Hemoglobin' }).locator('.vita-fallback-tag')).toHaveCount(0);

  /* Doktor raporu: yıldızlı referans hücresi + dipnot */
  await go(page, 'view-report');
  const row = name => page.locator('#repSimple .rs-tbl tbody tr').filter({ hasText: name }).first();
  await expect(row('Vitamin D').locator('td.rs-fallback')).toHaveCount(1);
  await expect(row('Vitamin D')).toContainText('30–50');
  await expect(row('Glukoz').locator('td.rs-fallback')).toHaveCount(0);
  await expect(page.locator('#repSimple .rs-fallback-note')).toContainText('laboratuvar aralığı yoktu; VitaTakip genel karşılaştırma aralığı kullanıldı');

  expect(errors, errors.join('\n')).toEqual([]);
});
