/* 4) Hata yönetimi ve uç durumlar: geçersiz dosya biçimleri ve boş/hatalı girişler uygulamayı çökertmez,
   kullanıcıya uygun Türkçe uyarı gösterilir ve hiçbir kayıt bozulmaz. */
import { test, expect } from '@playwright/test';
import { registerUser, collectErrors, go, lastToast } from './helpers.mjs';

async function waitToast(page, re) {
  await expect.poll(() => lastToast(page), { timeout: 15_000 }).toMatch(re);
}

test('geçersiz dosyalar ve boş/hatalı girişler zarifçe karşılanır', async ({ page, browser }) => {
  const errors = collectErrors(page);
  await registerUser(page);

  /* PDF alanına PDF olmayan dosya */
  await page.evaluate(() => { navigateToView('view-labs'); openENabizModal(); });
  await page.locator('#eNabizPdfInput').setInputFiles({ name: 'tahlil.pdf', mimeType: 'application/pdf', buffer: Buffer.from('Bu bir PDF degil, duz metin.') });
  await waitToast(page, /Hata \| PDF (katmanı okunamadı|yüklenemedi)/);
  await expect(page.locator('#pdfUploadDropzoneArea')).toBeVisible();   // yeniden denenebilir hâle döner

  /* Boş (0 bayt) dosya */
  await page.locator('#eNabizPdfInput').setInputFiles({ name: 'bos.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(0) });
  await waitToast(page, /Hata \|/);

  /* Geçerli ama içinde tahlil olmayan PDF */
  const ctx = await browser.newContext(); const tmp = await ctx.newPage();
  await tmp.setContent('<h1>Randevu Bilgisi</h1><p>Bu belgede tahlil sonucu yoktur.</p>');
  const emptyPdf = await tmp.pdf({ format: 'A4' }); await ctx.close();
  await page.evaluate(() => { resetPdfDropzone(); });
  await page.locator('#eNabizPdfInput').setInputFiles({ name: 'randevu.pdf', mimeType: 'application/pdf', buffer: emptyPdf });
  await waitToast(page, /Eşleşmedi \| PDF tarandı fakat tahlil değeri bulunamadı/);
  expect(await page.evaluate(() => state.labHistory.length)).toBe(0);
  await page.evaluate(() => closeENabizModal());

  /* Elle giriş: hiç değer yokken kaydet */
  await go(page, 'view-labs');
  await page.locator('#labAddChoices').getByRole('button', { name: /Değerleri elle gir/ }).click();
  await page.getByRole('button', { name: /Bu Tahlili Tarih ile Kaydet/ }).click();
  await waitToast(page, /Boş Sonuç/);

  /* Fizyolojik olarak imkânsız değer (yazım/birim hatası) */
  await page.locator('#inputLabFerritin').fill('-5');
  await page.getByRole('button', { name: /Bu Tahlili Tarih ile Kaydet/ }).click();
  await waitToast(page, /Değeri kontrol edin/);
  await page.locator('#inputLabFerritin').fill('');
  await page.locator('#inputLabPlt').fill('99999');
  await page.getByRole('button', { name: /Bu Tahlili Tarih ile Kaydet/ }).click();
  await waitToast(page, /Değeri kontrol edin \| .*Trombosit/);
  await page.locator('#inputLabPlt').fill('');

  /* Gelecek tarihli tahlil */
  await page.locator('#inputLabDate').fill('2099-01-01');
  await page.locator('#inputLabB12').fill('300');
  await page.getByRole('button', { name: /Bu Tahlili Tarih ile Kaydet/ }).click();
  await waitToast(page, /Tarihi kontrol edin/);
  expect(await page.evaluate(() => state.labHistory.filter(r => r.date === '2099-01-01').length)).toBe(0);
  await page.locator('#inputLabB12').fill('');

  /* Yedek alanına bozuk JSON ve başka uygulamanın JSON'u */
  await go(page, 'view-settings');
  await page.locator('#drawerImportBackupInput').setInputFiles({ name: 'bozuk.json', mimeType: 'application/json', buffer: Buffer.from('{ bu json degil') });
  await waitToast(page, /Okuma Hatası \| Yedek dosyası okunamadı/);
  await page.locator('#drawerImportBackupInput').setInputFiles({ name: 'baska.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'BaskaUygulama', user: { name: 'x' } })) });
  await waitToast(page, /Geçersiz Dosya/);

  /* Uygulama hâlâ çalışıyor */
  await go(page, 'view-home');
  expect(await page.evaluate(() => !!state.user && Array.isArray(state.labHistory))).toBe(true);
  expect(errors, errors.join('\n')).toEqual([]);
});
