/* 5) JSON yedek ve geri yükleme: veri gir → "Yedek İndir" (gerçek indirme) → localStorage tamamen temizlenir →
   yeni hesap → yedek dosyası yüklenir → tüm kayıtlar birebir geri gelir ve yenilemeden sonra kalır. */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { registerUser, collectErrors, go, uploadLabPdf, lastToast, FIXTURES, revealInSettings, goToSymptomStep } from './helpers.mjs';

const snapshot = page => page.evaluate(() => ({
  age: state.user?.age, gender: state.user?.gender,
  supplements: state.supplements.map(s => s.name).sort(),
  water: state.hydration?.current,
  labs: (state.labHistory || []).map(r => ({ date: r.date, hb: r.hb, rbc: r.rbc, plt: r.plt, tsh: r.tsh, glucose: r.glucose, refPlt: r.references?.plt || '', tags: (r.contextTags || []).slice().sort() }))
    .sort((a, b) => a.date.localeCompare(b.date)),
  symptoms: Array.from(state.selectedSymptoms || []).sort(),
  notes: localStorage.getItem('vitatakip_notes_' + activeUserId) || ''
}));

test('JSON yedeği dışa aktarılır, depolama silinir ve tüm kayıtlar geri yüklenir', async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  page.on('dialog', d => d.accept());
  await registerUser(page, { age: 41, gender: 'E' });

  /* Veri gir: iki PDF tahlili (biri etiketli), elle takviye ve su, belirti, hekim notu */
  await uploadLabPdf(page, path.join(FIXTURES, 'ornek-enabiz-B.pdf'));
  await page.evaluate(() => toggleLabContextTag('Susuzdum'));
  await page.evaluate(() => applyParsedPdfValues());
  await uploadLabPdf(page, path.join(FIXTURES, 'ornek-enabiz-A.pdf'));
  await page.evaluate(() => applyParsedPdfValues());
  await page.evaluate(() => {
    state.supplements = [{ id: 'e2e1', name: 'D3 Vitamini 1000 IU', timing: 'Sabah', taken: false }, { id: 'e2e2', name: 'Magnezyum Bisglisinat', timing: 'Akşam', taken: true }];
    state.hydration = { ...(state.hydration || {}), current: 1250 };
    localStorage.setItem('vitatakip_notes_' + activeUserId, 'Hekime sor: B12 enjeksiyonu');
    saveState();
  });
  await go(page, 'view-neyim');
  await goToSymptomStep(page, 'restless_legs');
  await page.locator('.anamnesis-card[onclick*="\'restless_legs\'"]').click();
  await page.evaluate(() => saveState());
  const before = await snapshot(page);
  expect(before.labs).toHaveLength(2);
  expect(before.labs[0].tags).toEqual(['Susuzdum']);

  /* Dışa aktar: gerçek indirme */
  await go(page, 'view-settings');
  await revealInSettings(page, 'button[onclick*="exportDataBackup"]');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('button[onclick*="exportDataBackup"]').click()
  ]);
  expect(download.suggestedFilename()).toMatch(/^VitaTakip_Yedek_.*\.json$/);
  const file = testInfo.outputPath('yedek.json');
  await download.saveAs(file);
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  expect(json.app).toBe('VitaTakip');
  expect(json.labHistory).toHaveLength(2);

  /* localStorage + IndexedDB tamamen temizlenir, yeni hesap açılır */
  await page.evaluate(async () => {
    localStorage.clear();
    try { for (const db of (await indexedDB.databases())) if (db.name) indexedDB.deleteDatabase(db.name); } catch (_) {}
  });
  await page.goto('about:blank');
  await registerUser(page, { name: 'Yeni Cihaz', age: 30, gender: 'K' });
  const empty = await snapshot(page);
  expect(empty.labs).toHaveLength(0);
  expect(empty.supplements).toHaveLength(0);

  /* Geri yükle: gerçek dosya alanı */
  await go(page, 'view-settings');
  await page.locator('#drawerImportBackupInput').setInputFiles(file);
  await expect.poll(() => lastToast(page), { timeout: 15_000 }).toMatch(/Geri Yüklendi/);
  await page.evaluate(() => { try { closeProfileModal(); } catch (_) {} });

  const restored = await snapshot(page);
  expect(restored).toEqual(before);

  /* Yenileme sonrası da localStorage'dan aynı veriler okunur */
  await page.reload();
  await page.waitForFunction(() => typeof navigateToView === 'function' && !!activeUserId && (state.labHistory || []).length === 2);
  expect(await snapshot(page)).toEqual(before);

  /* Geri yüklenen tahliller arayüzde doğru durumla görünür */
  await go(page, 'view-labs');
  await expect(page.locator('#labHistoryListContainer article')).toHaveCount(2);
  await expect(page.locator('#labHistoryListContainer .vita-ctx-badge').filter({ hasText: 'Susuzdum' })).toHaveCount(1);

  expect(errors, errors.join('\n')).toEqual([]);
});
