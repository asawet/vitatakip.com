/* Ayarlar > Yazı ve simge boyutu: kaydırıcılar, tüm px/rem yazıların ölçeklenmesi, simge zoom'u,
   kalıcılık (sayfa yenilenince ilk boyamada uygulanır), yazdırmada normal boyut, en büyük boyutta yatay taşma yok.
   Çalıştırma: VT_PORT=8090 node tests/boyut-ayari.mjs  (VT_SHOTS=<klasör> verilirse ekran görüntüsü kaydeder) */
import { boot, sleep } from './lib.mjs';
const { b, p, errs } = await boot();
await p.setViewport({ width: 390, height: 844 });
p.setDefaultTimeout(20000);
p.on('dialog', d => d.accept());
const results = []; const log = (n, ok, d) => { results.push(ok); console.log((ok ? 'OK   ' : 'FAIL ') + n + (d ? ' -> ' + d : '')); };
await p.evaluate(() => { try { closeProfileModal(); } catch (e) {} try { finishVitaSpotlightTour(true); } catch (e) {} navigateToView('view-settings'); window.scrollTo(0, 0); });
await sleep(500);

/* Ölçüm: ayarlar kartındaki 11px açıklama, Tailwind text-xs başlık ve kart simgesi */
const measure = () => p.evaluate(() => {
  const card = document.getElementById('settingsSectionTextSize');
  const px = el => el ? parseFloat(getComputedStyle(el).fontSize) : null;
  const icon = card.querySelector('.w-9 i.fa-solid');
  const abs = document.querySelector('i.fa-solid.absolute');
  return {
    small: px(card.querySelector('p.text-\\[11px\\]')),
    xs: px(card.querySelector('h3.text-xs')),
    iconZoom: icon ? Number(getComputedStyle(icon).zoom) : null,
    absZoom: abs ? Number(getComputedStyle(abs).zoom) : 1,
    textVal: (card.querySelector('[data-vt-size-value="text"]') || {}).textContent,
    iconVal: (card.querySelector('[data-vt-size-value="icon"]') || {}).textContent,
    resetDisabled: card.querySelector('[data-vt-size-reset]').disabled,
    keys: [localStorage.getItem('vitatakip_text_scale'), localStorage.getItem('vitatakip_icon_scale')]
  };
});

/* 1) Kart ve varsayılan değerler (ölçek 1'de boyutlar değişmez) */
const d0 = await measure();
log('Ayarlar\'da "Yazı ve simge boyutu" kartı, varsayılan Normal %100, sıfırla düğmesi pasif', d0.textVal === 'Normal · %100' && d0.iconVal === 'Normal · %100' && d0.resetDisabled, JSON.stringify(d0));
log('Varsayılanda yazı boyutları aynen korunur (11px → 11px, text-xs → 12px), simge zoom 1', d0.small === 11 && d0.xs === 12 && d0.iconZoom === 1, JSON.stringify(d0));

/* 2) Kaydırıcıyla en büyük yazı + en büyük simge */
const slide = (id, idx) => p.evaluate((id, idx) => { const r = document.getElementById(id); r.value = String(idx); r.dispatchEvent(new Event('input', { bubbles: true })); }, id, idx);
await slide('vtTextSizeRange', 4); await slide('vtIconSizeRange', 3); await sleep(150);
const d1 = await measure();
log('Yazı kaydırıcısı "En büyük": px ve rem yazılar %130 büyür (11→14,3px, 12→15,6px)', Math.abs(d1.small - 14.3) < 0.05 && Math.abs(d1.xs - 15.6) < 0.05 && d1.textVal === 'En büyük · %130', JSON.stringify(d1));
log('Simge kaydırıcısı "En büyük": simge zoom 1,3; kutu içine mutlak konumlu simgeler hariç', d1.iconZoom === 1.3 && d1.absZoom === 1 && d1.iconVal === 'En büyük · %130', JSON.stringify(d1));
log('Tercih bu cihazda saklanır, "Varsayılana dön" etkinleşir', d1.keys[0] === '1.3' && d1.keys[1] === '1.3' && !d1.resetDisabled, JSON.stringify(d1.keys));

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
log('En büyük yazı + simgede ana ekranlarda yatay kaydırma yok', overflow.length === 0, overflow.join(', '));

/* 5) Sayfa yenilenince ilk boyamada uygulanır (betikler yüklenmeden önce) */
await p.evaluateOnNewDocument(() => {
  document.addEventListener('readystatechange', () => {
    if (document.readyState === 'interactive' && !window.__earlyScale) window.__earlyScale = document.documentElement.style.getPropertyValue('--vt-text-scale');
  });
});
await p.reload({ waitUntil: 'networkidle2' }); await sleep(1500);
const early = await p.evaluate(() => window.__earlyScale || '');
log('Yenilemede tercih <head> betiğiyle ilk boyamadan önce uygulanır', early.trim() === '1.3', JSON.stringify(early));

/* 6) Varsayılana dön */
const r = await p.evaluate(async () => {
  navigateToView('view-settings');
  document.querySelector('[data-vt-size-reset]').click(); await new Promise(r => setTimeout(r, 150));
  const card = document.getElementById('settingsSectionTextSize');
  return { small: parseFloat(getComputedStyle(card.querySelector('p.text-\\[11px\\]')).fontSize), keys: [localStorage.getItem('vitatakip_text_scale'), localStorage.getItem('vitatakip_icon_scale')], range: document.getElementById('vtTextSizeRange').value, disabled: card.querySelector('[data-vt-size-reset]').disabled };
});
log('"Varsayılana dön" boyutları %100\'e alır ve kaydı siler', r.small === 11 && r.keys[0] === null && r.keys[1] === null && r.range === '1' && r.disabled, JSON.stringify(r));

const diag = await p.evaluate(() => VitaTakipDiagnostics.run());
const failed = diag.results.filter(x => !x.passed).map(x => x.name);
log(`Uygulama içi tanılama (${diag.passed}/${diag.results.length})`, failed.length === 0, failed.join(', '));
log('Sayfa hatası yok', errs.length === 0, errs.join(' | '));
console.log(`ÖZET ${results.filter(Boolean).length}/${results.length}`);
await b.close();
