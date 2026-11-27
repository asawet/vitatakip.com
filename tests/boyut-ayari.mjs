/* Ayarlar > Görünüm: tema + "Yazı ve simge boyutu" (Aa Aa Aa) tek kartta. Seçici yazıyı ve simgeyi birlikte büyütür
   (Normal %100 · Büyük %115 · Çok büyük %130); kalıcılık (ilk boyamada uygulanır), yazdırmada normal boyut,
   en büyük boyutta yatay taşma yok, üst çubuk rozeti simgeye binmez.
   Çalıştırma: VT_PORT=8090 node tests/boyut-ayari.mjs  (VT_SHOTS=<klasör> verilirse ekran görüntüsü kaydeder) */
import { boot, sleep } from './lib.mjs';
const { b, p, errs } = await boot();
await p.setViewport({ width: 390, height: 844 });
p.setDefaultTimeout(20000);
p.on('dialog', d => d.accept());
const results = []; const log = (n, ok, d) => { results.push(ok); console.log((ok ? 'OK   ' : 'FAIL ') + n + (d ? ' -> ' + d : '')); };
await p.evaluate(() => { try { closeProfileModal(); } catch (e) {} try { finishVitaSpotlightTour(true); } catch (e) {} navigateToView('view-settings'); window.scrollTo(0, 0); });
await sleep(500);

const measure = () => p.evaluate(() => {
  const card = document.getElementById('settingsSectionTheme');
  const px = el => el ? parseFloat(getComputedStyle(el).fontSize) : null;
  const icon = card.querySelector('.w-9 i.fa-solid');
  return {
    small: px(card.querySelector('p.text-\\[11px\\]')),
    xs: px(card.querySelector('h3.text-xs')),
    iconZoom: icon ? Number(getComputedStyle(icon).zoom) : null,
    pressed: [...card.querySelectorAll('[data-vt-size-step]')].map(x => x.getAttribute('aria-pressed')).join(','),
    key: localStorage.getItem('vitatakip_text_scale')
  };
});

/* 1) Tek kart: Tema satırı + Yazı ve simge boyutu satırı */
const card = await p.evaluate(() => {
  const c = document.getElementById('settingsSectionTheme');
  return { rows: [...c.querySelectorAll('.vt-pref-label')].map(x => x.textContent.trim()), theme: c.querySelectorAll('[data-vt-theme]').length, steps: [...c.querySelectorAll('[data-vt-size-step]')].map(x => x.getAttribute('data-vt-size-step')), sliders: c.querySelectorAll('input[type=range]').length, oldCard: !!document.querySelector('.vt-size-preview') };
});
log('Görünüm kartında "Tema" ve "Yazı ve simge boyutu" satırları; 3 kademe (Aa Aa Aa), kaydırıcı yok', card.rows.join('|') === 'Tema|Yazı ve simge boyutu' && card.theme === 3 && card.steps.join() === '1,1.15,1.3' && card.sliders === 0 && !card.oldCard, JSON.stringify(card));

const d0 = await measure();
log('Varsayılan "Normal" seçili; yazı boyutları aynen korunur (11px, text-xs 12px), simge zoom 1', d0.pressed === 'true,false,false' && d0.small === 11 && d0.xs === 12 && d0.iconZoom === 1 && d0.key === null, JSON.stringify(d0));

/* 2) "Çok büyük": yazı ve simge birlikte %130 */
await p.click('[data-vt-size-step="1.3"]'); await sleep(150);
const d1 = await measure();
log('"Çok büyük": yazılar %130 (11→14,3px, 12→15,6px) ve simgeler birlikte büyür', Math.abs(d1.small - 14.3) < 0.05 && Math.abs(d1.xs - 15.6) < 0.05 && d1.iconZoom === 1.3 && d1.pressed === 'false,false,true' && d1.key === '1.3', JSON.stringify(d1));
await p.click('[data-vt-size-step="1.15"]'); await sleep(150);
const d2 = await measure();
log('"Büyük": %115', Math.abs(d2.small - 12.65) < 0.05 && d2.iconZoom === 1.15 && d2.pressed === 'false,true,false', JSON.stringify(d2));
await p.click('[data-vt-size-step="1.3"]'); await sleep(150);

/* 3) Yazdırma/PDF her zaman normal boyutta */
await p.emulateMediaType('print');
const pr = await measure();
await p.emulateMediaType('screen');
log('Yazdırmada yazı ve simge normal boyutta kalır', pr.small === 11 && pr.iconZoom === 1, JSON.stringify({ small: pr.small, zoom: pr.iconZoom }));

/* 4) En büyük boyutta ana ekranlarda yatay taşma yok (390px telefon) */
const shotDir = process.env.VT_SHOTS;
const overflow = [];
for (const v of ['view-home', 'view-labs', 'view-neyim', 'view-clinical-results', 'view-report', 'view-settings']) {
  await p.evaluate(v => { navigateToView(v); window.scrollTo(0, 0); }, v); await sleep(500);
  const w = await p.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, iw: window.innerWidth }));
  if (w.sw > w.iw + 1) overflow.push(`${v}: ${w.sw}>${w.iw}`);
  if (shotDir) await p.screenshot({ path: `${shotDir}/boyut-max-${v}.png` });
}
log('En büyük boyutta ana ekranlarda yatay kaydırma yok', overflow.length === 0, overflow.join(', '));

/* 5) Üst çubuk günlük özet rozeti grafik simgesinin üstüne binmez (normal ve en büyük boyutta) */
const badgeCheck = () => p.evaluate(() => {
  const badge = document.getElementById('headerDailySummaryBadge'); badge.textContent = '66%';
  const icon = document.querySelector('#btnHeaderDailySummary i'); const a = badge.getBoundingClientRect(), c = icon.getBoundingClientRect();
  const overlap = !(a.right <= c.left || a.left >= c.right || a.bottom <= c.top || a.top >= c.bottom);
  return { overlap, textFits: badge.scrollHeight <= badge.clientHeight + 1 };
});
const bMax = await badgeCheck();
await p.evaluate(() => VitaSize.set(1)); await sleep(150);
const bNorm = await badgeCheck();
await p.evaluate(() => VitaSize.set(1.3)); await sleep(150);
log('Üst çubuk "66%" rozeti simgeye binmez, yazı rozete sığar', !bMax.overlap && !bNorm.overlap && bMax.textFits && bNorm.textFits, JSON.stringify({ bNorm, bMax }));

/* 6) Sayfa yenilenince ilk boyamada uygulanır (betikler yüklenmeden önce) */
await p.evaluateOnNewDocument(() => {
  document.addEventListener('readystatechange', () => {
    if (document.readyState === 'interactive' && !window.__earlyScale) window.__earlyScale = [document.documentElement.style.getPropertyValue('--vt-text-scale'), document.documentElement.style.getPropertyValue('--vt-icon-scale')].join('|');
  });
});
await p.reload({ waitUntil: 'networkidle2' }); await sleep(1500);
const early = await p.evaluate(() => window.__earlyScale || '');
log('Yenilemede tercih <head> betiğiyle ilk boyamadan önce uygulanır (yazı + simge)', early === '1.3|1.3', JSON.stringify(early));

/* 7) Eski sürümden kalan değer en yakın kademeye yuvarlanır; Normal'e dönünce kayıt silinir */
const snap = await p.evaluate(() => { localStorage.setItem('vitatakip_text_scale', '1.2'); const r = VitaSize.get(); VitaSize.set(1); return { r, key: localStorage.getItem('vitatakip_text_scale') }; });
log('Eski kayıt (1.2) → 1.15; "Normal" seçilince kayıt silinir', snap.r === 1.15 && snap.key === null, JSON.stringify(snap));

const diag = await p.evaluate(() => VitaTakipDiagnostics.run());
const failed = diag.results.filter(x => !x.passed).map(x => x.name);
log(`Uygulama içi tanılama (${diag.passed}/${diag.results.length})`, failed.length === 0, failed.join(', '));
log('Sayfa hatası yok', errs.length === 0, errs.join(' | '));
console.log(`ÖZET ${results.filter(Boolean).length}/${results.length}`);
await b.close();
