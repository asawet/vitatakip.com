/* "Uygulamayı Cihaza Yükle": tarayıcının kendi kurulum özelliği (PWA). APK veya mağaza yoktur.
   - Chrome/Edge/Android: beforeinstallprompt yakalanır, düğmeye basınca tarayıcının kurulum penceresi açılır.
   - iPhone/iPad (Safari) ve kurulum olayını vermeyen tarayıcılar: adım adım "Ana Ekrana Ekle" yardımı gösterilir.
   - Zaten yüklüyse (ana ekrandan açıldıysa) düğmeler gizlenir. */
(function () {
  'use strict';
  let deferredPrompt = null;

  const isStandalone = () =>
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    window.navigator.standalone === true;
  const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function state() {
    if (isStandalone()) return 'installed';
    if (deferredPrompt) return 'ready';
    if (isIos()) return 'ios';
    return 'manual';
  }

  function render() {
    const st = state();
    // Üst menü ve giriş ekranı: yalnızca yükleme gerçekten mümkünse (veya iOS'ta) görünür
    document.querySelectorAll('[data-pwa-install="auto"]').forEach(el => {
      el.hidden = !(st === 'ready' || st === 'ios');
    });
    const status = document.getElementById('pwaInstallStatus');
    const btn = document.getElementById('pwaInstallSettingsBtn');
    if (status) {
      status.textContent = {
        installed: 'Bu cihazda yüklü — ana ekrandan açılıyor.',
        ready: 'Tek dokunuşla ana ekrana / masaüstüne ekleyin; internetsiz de açılır.',
        ios: 'Safari: Paylaş → "Ana Ekrana Ekle" ile yükleyin.',
        manual: 'Tarayıcı menüsünden "Uygulamayı yükle" veya "Ana ekrana ekle"yi seçin.'
      }[st];
    }
    if (btn) {
      btn.disabled = st === 'installed';
      btn.querySelector('span').textContent = st === 'installed' ? 'Yüklü' : 'Cihaza Yükle';
    }
  }

  function openHelp() {
    const modal = document.getElementById('pwaInstallHelp');
    if (!modal) return;
    const ios = isIos();
    modal.querySelector('[data-help="ios"]').hidden = !ios;
    modal.querySelector('[data-help="other"]').hidden = ios;
    modal.hidden = false;
    modal.querySelector('button')?.focus();
  }
  function closeHelp() {
    const modal = document.getElementById('pwaInstallHelp');
    if (modal) modal.hidden = true;
  }

  async function install() {
    if (window.SoundEffects) try { SoundEffects.playClick(); } catch (_) {}
    if (isStandalone()) return;
    if (!deferredPrompt) { openHelp(); return; }
    const promptEvent = deferredPrompt;
    deferredPrompt = null;
    try {
      promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice && choice.outcome === 'accepted' && typeof showToast === 'function') {
        showToast('Yükleniyor', 'VitaTakip ana ekranınıza / masaüstünüze ekleniyor.', 'success');
      }
    } catch (_) { openHelp(); }
    render();
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); // tarayıcının kendi küçük bandı yerine uygulamadaki düğme kullanılır
    deferredPrompt = event;
    render();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    render();
    if (typeof showToast === 'function') showToast('Yüklendi', 'VitaTakip artık ana ekranınızda. Verileriniz bu cihazda kalır.', 'success');
  });
  if (window.matchMedia) {
    const mq = window.matchMedia('(display-mode: standalone)');
    if (mq.addEventListener) mq.addEventListener('change', render);
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeHelp(); });

  /* Ana ekran kısayolları (manifest "shortcuts"): ./#view-labs gibi adresler ilgili bölümü açar. */
  function openViewFromHash() {
    const id = decodeURIComponent((location.hash || '').slice(1));
    if (!/^view-[a-z-]+$/.test(id) || !document.getElementById(id)) return;
    if (typeof activeUserId === 'undefined' || !activeUserId || typeof navigateToView !== 'function') return;
    try { navigateToView(id); } catch (_) {}
  }
  window.addEventListener('hashchange', openViewFromHash);
  window.addEventListener('load', openViewFromHash);
  document.addEventListener('DOMContentLoaded', render);
  if (document.readyState !== 'loading') render();

  window.VitaPwaInstall = { install, openHelp, closeHelp, state, render };
})();
