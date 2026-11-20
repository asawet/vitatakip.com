/* PWA: yüklenebilirlik (manifest + service-worker.js), "Uygulamayı Cihaza Yükle" düğmesi, iPhone yardımı,
   çevrimdışı açılış, göreceli yollar, telefon ekranında taşma yok, APK/Android/Firebase/AI Studio izi yok,
   anahtar girilmeden hiçbir dış sunucuya istek yok, veriler yenilemeden sonra tarayıcıda kalır.
   Varsayılan yerel sunucu; canlı site için: node web-pwa.mjs https://asawet05.github.io/VitaTakip-PWA/ */
import puppeteer from 'puppeteer-core';
const base = (process.argv[2] || 'http://localhost:8080/').replace(/\/?$/, '/');
const origin = new URL(base).origin;
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
const results = []; const log = (n, ok, d) => { results.push(ok); console.log((ok ? 'OK   ' : 'FAIL ') + n + (d ? ' -> ' + d : '')); };
const errs = []; const external = new Set();

const p = await b.newPage();
p.on('pageerror', e => errs.push(e.message));
p.on('request', r => { const u = r.url(); if (/^https?:/.test(u) && !u.startsWith(origin)) external.add(new URL(u).host); });
p.on('dialog', d => (d.type() === 'prompt' ? d.accept('SİL') : d.accept()));
await p.evaluateOnNewDocument(() => { try { localStorage.setItem('vitatakip_legal_accepted', 'true'); } catch (_) {} });
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
await p.goto(base, { waitUntil: 'networkidle2' });

/* 1) Servis çalışanı ve manifest */
await p.evaluate(() => navigator.serviceWorker.ready.then(() => true));
await p.reload({ waitUntil: 'networkidle2' });
const sw = await p.evaluate(() => ({ controlled: Boolean(navigator.serviceWorker.controller), url: navigator.serviceWorker.controller?.scriptURL || '' }));
log('service-worker.js etkin ve sayfayı kontrol ediyor', sw.controlled && /\/service-worker\.js$/.test(sw.url), sw.url);
const cdp = await p.target().createCDPSession();
const inst = await cdp.send('Page.getInstallabilityErrors');
log('Chrome yüklenebilirlik denetimi hatasız', inst.installabilityErrors.length === 0, JSON.stringify(inst.installabilityErrors.map(e => e.errorId)));
const mf = await cdp.send('Page.getAppManifest');
const manifest = JSON.parse(mf.data || '{}');
log('Manifest hatasız ve eksiksiz (ad, simgeler 192/512/maskable, kısayollar)', (mf.errors || []).length === 0 && manifest.name && manifest.icons?.some(i => i.sizes === '512x512' && i.purpose === 'maskable') && manifest.shortcuts?.length >= 3, JSON.stringify((mf.errors || []).map(e => e.message)));

/* 2) Göreceli yollar: hiçbir yerel dosya "/" ile başlamaz */
const paths = await p.evaluate(() => [...document.querySelectorAll('link[href],script[src],img[src]')]
  .map(e => e.getAttribute('href') || e.getAttribute('src')).filter(u => u && !/^(https?:|data:|blob:|#)/.test(u)));
const bad = paths.filter(u => !u.startsWith('./'));
log('Tüm yerel yollar ./ ile göreceli', bad.length === 0, bad.slice(0, 5).join(', '));
const counts = await p.evaluate(() => ({ css: document.querySelectorAll('link[rel=stylesheet]').length, js: document.querySelectorAll('script[src]').length }));
log('Tek CSS ve en fazla 4 JS paketi (11 CSS + 43 JS yerine)', counts.css === 1 && counts.js >= 1 && counts.js <= 4, JSON.stringify(counts));

/* 3) Yükleme düğmesi: kurulum olayı gelince görünür, basınca tarayıcının penceresi açılır */
const install = await p.evaluate(async () => {
  let prompted = false;
  const ev = new Event('beforeinstallprompt');
  ev.prompt = () => { prompted = true; };
  ev.userChoice = Promise.resolve({ outcome: 'dismissed' });
  window.dispatchEvent(ev);
  // Yükleme düğmesi yalnızca Ayarlar > Araçlar'da: üst barda ve giriş ekranında yok.
  const elsewhere = document.querySelectorAll('[data-pwa-install], .vita-pwa-btn--header, .vita-pwa-btn--auth').length;
  const settingsBtn = document.getElementById('pwaInstallSettingsBtn');
  const visible = Boolean(settingsBtn) && !settingsBtn.disabled && elsewhere === 0;
  await VitaPwaInstall.install();
  return { visible, prompted, elsewhere };
});
log('"Uygulamayı Cihaza Yükle" yalnızca Ayarlar\'da; kurulum penceresini açar', install.visible && install.prompted, JSON.stringify(install));
const help = await p.evaluate(() => { VitaPwaInstall.openHelp(); const m = document.getElementById('pwaInstallHelp'); const r = { open: !m.hidden, text: m.innerText }; VitaPwaInstall.closeHelp(); return r; });
log('Kurulum olayı yoksa "Ana Ekrana Ekle" yardımı açılır', help.open && /Ana ekrana ekle|Ana Ekrana Ekle/i.test(help.text));

/* 4) Hesap aç; görünümlerde yasak ifade ve yatay taşma */
await p.evaluate(() => document.getElementById('authTabRegisterBtn').click());
await p.type('#authInputFullName', 'Ayşe Örnek');
await p.type('#authInputPassword', 'pwasifre123');
await p.evaluate(() => { document.getElementById('authInputPasswordConfirm').value = 'pwasifre123'; document.getElementById('authSubmitBtn').click(); });
await new Promise(r => setTimeout(r, 3000));
await p.evaluate(() => { try { closeProfileModal(); } catch (e) {} try { finishVitaSpotlightTour(true); } catch (e) {} });
const settingsRow = await p.evaluate(() => Boolean(document.getElementById('pwaInstallSettingsRow')) && Boolean(document.getElementById('drawerGeminiApiKeyInput')));
log('Ayarlar: "Uygulamayı cihaza yükle" satırı ve Gemini anahtar alanı var', settingsRow);
const scan = await p.evaluate(async () => {
  const banned = /\bapk\b|android|firebase|ai ?studio|play store|app store|uygulamay[ıi] indir/i;
  const views = [...document.querySelectorAll('[id^="view-"]')].map(v => v.id).filter(id => /^view-[a-z-]+$/.test(id));
  const hits = [], wide = [];
  for (const v of views) {
    try { navigateToView(v); } catch (e) { continue; }
    await new Promise(r => setTimeout(r, 300));
    document.querySelectorAll('details').forEach(d => { d.open = true; });
    const text = document.body.innerText;
    const m = text.match(banned); if (m) hits.push(`${v}: "${text.slice(Math.max(0, m.index - 30), m.index + 40).replace(/\s+/g, ' ')}"`);
    const o = document.documentElement.scrollWidth - window.innerWidth; if (o > 1) wide.push(`${v}: ${o}px`);
  }
  return { views: views.length, hits: [...new Set(hits)], wide };
});
log(`Ekranda APK/Android/Firebase/AI Studio ifadesi yok (${scan.views} görünüm)`, scan.hits.length === 0, scan.hits.slice(0, 3).join(' | '));
log('390px telefon genişliğinde yatay taşma yok', scan.wide.length === 0, scan.wide.join(' | '));

/* 5) Kısayol adresi (#view-labs) ilgili bölümü açar; veriler yenilemeden sonra kalır */
await p.evaluate(() => { navigateToView('view-home'); state.hydration = state.hydration || {}; state.hydration.current = 1250; saveState(); });
await p.goto(base + '#view-labs', { waitUntil: 'networkidle2' }); await new Promise(r => setTimeout(r, 2000));
const after = await p.evaluate(() => ({ water: state.hydration?.current, uid: activeUserId, labsVisible: !document.getElementById('view-labs')?.classList.contains('hidden') }));
log('Veriler yenilemeden sonra tarayıcıda kalır', after.uid && after.water === 1250, JSON.stringify(after));
log('Ana ekran kısayolu (#view-labs) Tahlillerim bölümünü açar', after.labsVisible);

/* 6) Çevrimdışı açılış */
await p.setOfflineMode(true);
await p.reload({ waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 2500));
const off = await p.evaluate(() => ({ app: Boolean(document.getElementById('view-home')), splashGone: !document.getElementById('vitaSplash'), uid: typeof activeUserId !== 'undefined' ? activeUserId : null }));
log('İnternet yokken açılır ve oturum/veriler gelir', off.app && off.splashGone && Boolean(off.uid), JSON.stringify(off));
await p.setOfflineMode(false);

/* 7) Anahtar girilmeden dış istek yok */
log('Gemini anahtarı girilmeden hiçbir dış sunucuya istek gitmez', external.size === 0, [...external].join(', '));

await p.evaluate(async () => { if (!activeUserId) return; try { await deleteMyAccountData(); } catch (e) {} });
log('Sayfa hatası yok', errs.length === 0, errs.slice(0, 3).join(' | '));
console.log('ÖZET', results.filter(Boolean).length + '/' + results.length);
await b.close(); process.exit(0);
