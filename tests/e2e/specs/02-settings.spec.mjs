/* 2) Ayarlar ve localStorage kalıcılığı: tema, saat giriş biçimi ve kamera onayı değiştirilir, sayfa yenilenir, korunur. */
import { test, expect } from '@playwright/test';
import { registerUser, collectErrors, go, revealInSettings } from './helpers.mjs';

test('ayar değişiklikleri sayfa yenilendikten sonra korunur', async ({ page }) => {
  const errors = collectErrors(page);
  await registerUser(page);
  await go(page, 'view-settings');

  // Değiştir (gerçek tıklamalar)
  await page.locator('[data-vt-theme="dark"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await revealInSettings(page, '[data-timemode="dial"]');
  await page.locator('[data-timemode="dial"]').first().click();
  await revealInSettings(page, '#settingsCameraAppConsentCheckbox');
  const consent = page.locator('#settingsCameraAppConsentCheckbox');
  const consentBefore = await consent.isChecked();
  await consent.click();

  const read = () => page.evaluate(() => ({
    theme: localStorage.getItem('vitatakip_theme'),
    time: localStorage.getItem('vitatakip_time_input_mode'),
    camera: localStorage.getItem('vitatakip_camera_app_approved'),
    openSections: JSON.parse(localStorage.getItem('vita_settings_open_sections') || '[]').sort()
  }));
  const stored = await read();
  expect({ ...stored, openSections: undefined }).toEqual({ theme: 'dark', time: 'dial', camera: consentBefore ? 'false' : 'true', openSections: undefined });
  expect(stored.openSections.length).toBeGreaterThanOrEqual(1);   // açılan ayar bölümleri de hatırlanır

  // Yenile → hem localStorage hem arayüz aynı kalır
  await page.reload();
  await page.waitForFunction(() => typeof navigateToView === 'function' && !!activeUserId);
  await page.evaluate(() => { try { closeProfileModal(); } catch (_) {} });
  await go(page, 'view-settings');
  const after = await read();
  expect(after).toEqual(stored);
  // Açık bıraktığı bölümler yenilemeden sonra da açık; değiştirilen kontroller görünür
  await expect(page.locator('[data-timemode="dial"]').first()).toBeVisible();
  await revealInSettings(page, '#settingsCameraAppConsentCheckbox');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('[data-vt-theme="dark"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-timemode="dial"]').first()).toHaveAttribute('aria-checked', 'true');
  await expect(consent).toBeChecked({ checked: !consentBefore });

  // Açık temaya dönüş de kalıcı
  await page.locator('[data-vt-theme="light"]').click();
  await page.reload();
  await page.waitForFunction(() => typeof navigateToView === 'function');
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => localStorage.getItem('vitatakip_theme'))).toBe('light');

  expect(errors, errors.join('\n')).toEqual([]);
});
