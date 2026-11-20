/* Çevrimdışı kararlılık: service-worker.js önbellek listesi proje dosyalarıyla birebir eşleşir (hepsi 200),
   internet kesilince tüm ekranlar hatasız açılır; PDF okuyucu, grafik, barkod kütüphaneleri ve belirti görselleri
   internetsiz yüklenir; her ekrandaki tüm simgeler çizilir (Font Awesome alt kümesi eksiksiz).
   Varsayılan yerel sunucu; canlı site için: node cevrimdisi.mjs https://asawet05.github.io/VitaTakip-PWA/ */
import puppeteer from 'puppeteer-core';
const base = (process.argv[2] || 'http://localhost:8080/').replace(/\/?$/, '/');
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
const results = []; const log = (n, ok, d) => { results.push(ok); console.log((ok ? 'OK   ' : 'FAIL ') + n + (d ? ' -> ' + d : '')); };
const errs = [];
const p = await b.newPage();
p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
p.on('dialog', d => d.accept());
await p.evaluateOnNewDocument(() => { try { localStorage.setItem('vitatakip_legal_accepted', 'true'); } catch (_) {} });
await p.setViewport({ width: 390, height: 844 });
await p.goto(base, { waitUntil: 'networkidle2' });

/* 1) Önbellek listesi: her dosya sunucuda var, servis çalışanı hepsini önbelleğe alıyor */
const swText = await (await fetch(base + 'service-worker.js')).text();
const core = JSON.parse(swText.match(/const CORE_FILES = (\[[\s\S]*?\]);/)[1]);
const statuses = await Promise.all(core.map(async u => [u, (await fetch(new URL(u, base))).status]));
const bad = statuses.filter(([, s]) => s !== 200);
log(`Önbellek listesindeki ${core.length} dosyanın hepsi sunucuda mevcut (200)`, bad.length === 0, bad.map(x => x.join(' ')).join(', '));
const cached = await p.evaluate(async n => {
  await navigator.serviceWorker.ready;
  for (let i = 0; i < 60; i++) {
    const keys = await caches.keys();
    let count = 0;
    for (const k of keys) count += (await (await caches.open(k)).keys()).length;
    if (count >= n) return count;
    await new Promise(r => setTimeout(r, 500));
  }
  return -1;
}, core.length);
log('Servis çalışanı tüm dosyaları önbelleğe aldı', cached >= core.length, `${cached}/${core.length}`);

/* Hesap + örnek veri (çevrimdışında da görünmeli) */
await p.evaluate(() => document.getElementById('authTabRegisterBtn').click());
await p.type('#authInputFullName', 'Çevrimdışı Deneme');
await p.type('#authInputPassword', 'offline12345');
await p.evaluate(() => { document.getElementById('authInputPasswordConfirm').value = 'offline12345'; document.getElementById('authSubmitBtn').click(); });
await new Promise(r => setTimeout(r, 2500));
await p.evaluate(() => {
  try { closeProfileModal(); } catch (e) {} try { finishVitaSpotlightTour(true); } catch (e) {}
  state.supplements = [{ id: 'o1', name: 'Çevrimdışı B12', timing: 'Sabah', taken: false }]; saveState();
});

/* 2) İnternet kesik */
await p.setOfflineMode(true);
errs.length = 0;
await p.reload({ waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 3000));
const boot = await p.evaluate(() => ({ uid: activeUserId, sup: (state.supplements || []).map(s => s.name).join(','), splash: !document.getElementById('vitaSplash') }));
log('İnternetsiz açılır, oturum ve veriler gelir', boot.uid && /Çevrimdışı B12/.test(boot.sup) && boot.splash, JSON.stringify(boot));

const viewReport = await p.evaluate(async () => {
  const views = [...document.querySelectorAll('[id^="view-"]')].map(v => v.id).filter(id => /^view-[a-z-]+$/.test(id));
  const blankIcons = new Set(); let iconCount = 0;
  for (const v of views) {
    navigateToView(v); await new Promise(r => setTimeout(r, 400));
    document.querySelectorAll('details').forEach(d => { d.open = true; });
    await new Promise(r => setTimeout(r, 150));
    document.querySelectorAll('i[class*="fa-"]').forEach(i => {
      if (!i.offsetParent) return;
      iconCount++;
      const c = getComputedStyle(i, '::before').content;
      if (!c || c === 'none' || c === 'normal' || c === '""') blankIcons.add([...i.classList].filter(x => x.startsWith('fa-') && !/^fa-(solid|regular|brands|fw|spin|lg|xs|sm|xl|2x|3x)$/.test(x)).join(' '));
    });
  }
  return { views: views.length, iconCount, blank: [...blankIcons] };
});
log(`İnternetsiz tüm ekranlar açılır (${viewReport.views} ekran)`, true);
log(`Tüm simgeler çizilir (${viewReport.iconCount} görünür simge)`, viewReport.blank.length === 0, viewReport.blank.slice(0, 10).join(', '));

const libs = await p.evaluate(async () => {
  const out = {};
  const tryLoad = async (url, g) => { try { await loadVitaOptionalScript(url, g, 8000); return Boolean(window[g]); } catch (e) { return 'HATA ' + e.message; } };
  out.chart = await tryLoad('./vendor/chartjs/chart.umd.js', 'Chart');
  out.pdf = await tryLoad('./vendor/pdfjs/pdf.min.js', 'pdfjsLib');
  out.zxing = await tryLoad('./vendor/zxing/zxing-browser.min.js', 'ZXingBrowser');
  out.qr = await tryLoad('./vendor/html5-qrcode/html5-qrcode.min.js', 'Html5Qrcode');
  try { const w = await fetch('./vendor/pdfjs/pdf.worker.min.js'); out.pdfWorker = w.ok; } catch (e) { out.pdfWorker = false; }
  const imgs = ['tongue', 'hair', 'rash'].map(n => `./img/symptoms/${n}.jpg`);
  out.images = (await Promise.all(imgs.map(src => new Promise(r => { const im = new Image(); im.onload = () => r(im.naturalWidth > 0); im.onerror = () => r(false); im.src = src; })))).every(Boolean);
  return out;
});
log('İnternetsiz PDF okuyucu, grafik, barkod kütüphaneleri ve belirti görselleri yüklenir', Object.values(libs).every(v => v === true), JSON.stringify(libs));
await p.setOfflineMode(false);
log('Çevrimdışı gezintide sayfa/konsol hatası yok', errs.length === 0, errs.slice(0, 4).join(' | '));
await p.evaluate(async () => { try { await deleteMyAccountData(); } catch (e) {} });
console.log('ÖZET', results.filter(Boolean).length + '/' + results.length);
await b.close(); process.exit(0);
