/* 3) Tahlil yükleme ve ayrıştırma doğruluğu: sentetik e-Nabız PDF'i yüklenir; değerler, referans aralıkları ve
   düşük / normal / yüksek durumları arayüzde (geçmiş, Klinik Analiz, doktor raporu) doğru gösterilir. */
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { registerUser, collectErrors, go, uploadLabPdf, FIXTURES } from './helpers.mjs';
import { FIXTURES as FX } from '../../fixtures/make-enabiz-fixtures.mjs';

test('e-Nabız PDF değerleri ve referans durumları doğru gösterilir', async ({ page }) => {
  const errors = collectErrors(page);
  await registerUser(page, { gender: 'E' });

  const parsed = await uploadLabPdf(page, path.join(FIXTURES, 'ornek-enabiz-A.pdf'));
  expect(parsed.date).toBe('2026-10-02');
  const got = Object.fromEntries(Object.entries(parsed.vals).map(([k, v]) => [k, v.value]));
  expect(got).toEqual(FX['ornek-enabiz-A.pdf'].expect);
  for (const [k, v] of Object.entries(parsed.vals)) expect(v.ref, `${k} referansı`).not.toBe('');

  // Önizleme penceresi değer sayısını gösterir, sonra kaydedilir
  await expect(page.locator('#eNabizModal')).toContainText(/21 Değer/);
  await page.getByRole('button', { name: /Değerleri Forma Aktar/ }).click();

  /* Geçmiş tahlillerim: her kart PDF aralığıyla durumunu gösterir */
  await go(page, 'view-labs');
  await page.locator('#labHistoryListContainer article button[aria-controls]').first().click();
  const card = name => page.locator('#labHistoryListContainer .rounded-xl.border.p-3').filter({ hasText: name }).first();
  const expectCard = async (name, status, ref) => {
    await expect(card(name)).toContainText(status);
    if (ref) await expect(card(name)).toContainText(ref);
  };
  await expectCard('Hemoglobin', 'Referans dışı', '13.2 - 16.6');       // 12,1 < 13,2 → düşük
  await expectCard('MCV', 'Referans dışı', '80.0 - 93.6');              // 104,2 → yüksek
  await expectCard('Trombosit (PLT)', 'Normal', '151 - 400');           // 10*9/L birimli aralık okunur
  await expectCard('Eritrosit (RBC)', 'Referans dışı', '4.18 - 5.48'); // 10 *12/L birimli aralık okunur
  await expectCard('Lökosit (WBC)', 'Normal', '3.91 - 8.77');
  await expectCard('Kreatinin', 'Normal', '0.7 - 1.2');                 // spot idrar satırı karışmaz
  await expectCard('TSH', 'Referans dışı', '0.3 - 5.4');

  /* Klinik Analiz: yön (düşük / yüksek) ve ilişkiler */
  await go(page, 'view-clinical-results');
  const val = name => page.locator('#view-clinical-results .vs-val').filter({ hasText: name }).first();
  await expect(val('Hemoglobin')).toContainText('Düşük');
  await expect(val('MCV')).toContainText('Yüksek');
  await expect(val('Vitamin B12')).toContainText('Düşük');
  await expect(val('Ferritin')).toContainText('Düşük');
  await expect(val('TSH')).toContainText('Yüksek');
  await expect(val('Homosistein')).toContainText('Yüksek');
  await expect(page.locator('#vsRelations')).toContainText('MCV 100 fL üzerinde');
  await expect(page.locator('#vsRelations')).toContainText('B12 düşük/sınırda + homosistein yüksek');
  await expect(page.locator('#view-clinical-results .vs-safety')).not.toContainText(/böbrek/i);

  /* Doktor raporu: değer + laboratuvar aralığı + durum */
  await go(page, 'view-report');
  const row = name => page.locator('#repSimple .rs-tbl tbody tr').filter({ hasText: name }).first();
  await expect(row('Hemoglobin')).toContainText('12,1');
  await expect(row('Hemoglobin')).toContainText('13.2 - 16.6');
  await expect(row('TSH')).toContainText('0.3 - 5.4');
  await expect(row('Kreatinin')).toContainText('0,92');

  expect(errors, errors.join('\n')).toEqual([]);
});
