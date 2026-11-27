/* Ortak yardımcılar: hesap açma, hata toplama, bildirim (toast) okuma. */
import { expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures');

/* Konsol hatası + yakalanmamış sayfa hatası toplayıcı. Testin sonunda boş olmalı. */
export function collectErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
  return errors;
}

/* Yasal onayı geçip yeni bir yerel hesap açar ve profili doldurur. */
export async function registerUser(page, { name = 'E2E Kullanici', gender = 'E', age = 36 } = {}) {
  await page.addInitScript(() => { try { localStorage.setItem('vitatakip_legal_accepted', 'true'); } catch (_) {} });
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof navigateToView === 'function' && document.getElementById('authTabRegisterBtn'));
  // Yeni cihazda giriş ekranı bulut paneliyle açılır; E2E testleri yerel hesap paneline geçer (js/bulut-giris.js)
  await page.evaluate(() => { if (window.VitaAuthUI) window.VitaAuthUI.showLocal(); });
  await page.locator('#authTabRegisterBtn').click();
  await page.locator('#authInputFullName').fill(name);
  await page.locator('#authInputPassword').fill('e2eSifre123');
  await page.locator('#authInputPasswordConfirm').fill('e2eSifre123');
  await page.locator('#authSubmitBtn').click();
  await page.waitForFunction(() => typeof activeUserId !== 'undefined' && !!activeUserId);
  await page.evaluate(({ gender, age }) => {
    try { closeProfileModal(); } catch (_) {}
    try { finishVitaSpotlightTour(true); } catch (_) {}
    document.getElementById('vitaSpotlightLayer')?.classList.add('hidden');
    openProfileModal(false);
    document.getElementById('modalInputAge').value = age;
    document.getElementById('modalInputGender').value = gender;
    document.getElementById('modalInputHeight').value = 178;
    document.getElementById('modalInputWeight').value = 76;
    document.getElementById('modalChronicNone').checked = true;
    saveUserProfileFromModal();
  }, { gender, age });
}

export async function go(page, view) {
  await page.evaluate(v => navigateToView(v), view);
  await expect(page.locator(`#${view}`)).toBeVisible();
}

/* Ayarlar'da öğeyi içeren katlanabilir bölüm kapalıysa, başlığındaki düğmeye tıklayarak açar (kullanıcı gibi) */
export async function revealInSettings(page, selector) {
  const sectionId = await page.evaluate(sel => {
    let s = document.querySelector(sel);
    while (s && !(s.id && s.id.startsWith('settingsSection') && !s.id.endsWith('Body'))) s = s.parentElement;
    return s ? s.id : '';
  }, selector);
  if (!sectionId) return;
  const toggle = page.locator(`#${sectionId} .vst-toggle`).first();
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  // Nested collapsed <details> (e.g. "Kamera onay ayrıntıları"): open via their summary, outermost first
  const closedCount = await page.evaluate(sel => {
    let n = 0; let s = document.querySelector(sel)?.parentElement;
    while (s) { if (s.tagName === 'DETAILS' && !s.open) { s.setAttribute('data-e2e-reveal', String(n++)); } s = s.parentElement; }
    return n;
  }, selector);
  for (let i = closedCount - 1; i >= 0; i--) await page.locator(`details[data-e2e-reveal="${i}"] > summary`).click();
  await expect(page.locator(selector).first()).toBeVisible();
}

/* "Neyim Var?" sihirbazında belirtinin bulunduğu adıma geçer */
export async function goToSymptomStep(page, symptomKey) {
  await page.evaluate(k => { const cat = ANAMNESIS_DICTIONARY[k].catId; switchAnamnesisCategoryTab(cat); }, symptomKey);
  await expect(page.locator(`.anamnesis-card[onclick*="'${symptomKey}'"]`)).toBeVisible();
}

/* Son gösterilen bildirimin başlık + metni */
export async function lastToast(page) {
  return page.evaluate(() => `${document.getElementById('toastTitle')?.textContent || ''} | ${document.getElementById('toastMessage')?.textContent || ''}`);
}

/* e-Nabız PDF'ini gerçek dosya alanından yükler; önizlemede ayrıştırılan değerleri döndürür */
export async function uploadLabPdf(page, filePath) {
  await page.evaluate(() => { navigateToView('view-labs'); openENabizModal(); temporarilyParsedLabResults = {}; });
  await page.locator('#eNabizPdfInput').setInputFiles(filePath);
  await page.waitForFunction(() => Object.keys(temporarilyParsedLabResults || {}).length > 0, null, { timeout: 60_000 });
  return page.evaluate(() => ({
    date: temporarilyParsedPdfDate,
    vals: Object.fromEntries(Object.entries(temporarilyParsedLabResults).map(([k, v]) => [k, { value: Number(v.value), ref: v.reference || '' }]))
  }));
}
