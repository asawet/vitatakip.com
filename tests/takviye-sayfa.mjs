/* Tam ekran "Takviye Ekle" sayfası ve gün bazlı akıllı takip:
   sayfa/geri dönüş, barkodla otomatik doldurma + düzenlenebilir stok (−/+), Her gün / belirli günler, çoklu vakit + saat,
   aç/tok, akıllı öneri, saat çakışması uyarısı (+ kaydır), gün rozetleri, gün bazlı filtre, Gece grubu, gün/saat bazlı bildirim. */
import { boot, sleep } from './lib.mjs';
const { b, p, errs } = await boot({ preload: () => {
  window.__notifs = [];
  try { Object.defineProperty(Notification, 'permission', { get: () => 'granted' }); } catch (e) {}
  if (navigator.serviceWorker) navigator.serviceWorker.getRegistration = async () => ({ showNotification: async (t, o) => { window.__notifs.push({ t, body: o && o.body }); } });
} });
await p.setViewport({ width: 390, height: 844 });
p.setDefaultTimeout(20000); p.on('dialog', d => d.accept());
const results = []; const log = (n, ok, d) => { results.push(ok); console.log((ok ? 'OK   ' : 'FAIL ') + n + (d ? ' -> ' + d : '')); };
await p.evaluate(() => { try { closeProfileModal(); } catch (e) {} try { finishVitaSpotlightTour(true); } catch (e) {} navigateToView('view-home'); });
await sleep(500);
const TODAY = await p.evaluate(() => new Date().getDay());
const OTHER = (TODAY + 3) % 7;

/* 1) Tam ekran sayfa */
await p.evaluate(() => document.getElementById('btnOpenAddSupplementModal').click()); await sleep(400);
const pg = await p.evaluate(() => ({ tab: state.activeTab, visible: !document.getElementById('view-add-supplement').classList.contains('hidden'), home: document.getElementById('view-home').classList.contains('hidden'), bar: !document.getElementById('viewHeaderBar').classList.contains('hidden'), back: document.querySelector('#viewHeaderBar .vbh-back').innerText.trim(), title: document.getElementById('currentViewTitle').innerText, fixedOverlay: getComputedStyle(document.getElementById('addSupplementModal')).position === 'fixed' }));
log('Ana Sayfa "+ Takviye Ekle" tam ekran sayfaya gider: üstte "← Ana Sayfa" ve "Takviye Ekle" başlığı (açılır pencere değil)', pg.tab === 'view-add-supplement' && pg.visible && pg.home && pg.bar && pg.back === 'Ana Sayfa' && pg.title === 'Takviye Ekle' && !pg.fixedOverlay, JSON.stringify(pg));
const top = await p.evaluate(() => { const s = document.getElementById('addSupBarcodeInput').getBoundingClientRect(); const bt = document.getElementById('btnAddSupStartCamera').getBoundingClientRect(); const ai = document.getElementById('btnAddSupAiBoxScan').getBoundingClientRect(); return { searchFirst: s.top < bt.top, sideBySide: Math.abs(bt.top - ai.top) < 4, bt: document.getElementById('btnAddSupStartCamera').innerText.trim(), ai: document.getElementById('btnAddSupAiBoxScan').innerText.replace(/\s+/g, ' ').trim() }; });
log('En üstte arama, altında yan yana "Barkod Tara" ve "Yapay Zekâ ile Tanı"', top.searchFirst && top.sideBySide && top.bt === 'Barkod Tara' && /Yapay Zekâ ile Tanı/.test(top.ai), JSON.stringify(top));
await p.evaluate(() => document.querySelector('#viewHeaderBar .vbh-back').click()); await sleep(300);
const back = await p.evaluate(() => state.activeTab);
await p.evaluate(() => { openAppDrawer(); document.getElementById('drawer-add-supplement').click(); }); await sleep(400);
const viaMenu = await p.evaluate(() => state.activeTab);
log('"← Ana Sayfa" geri götürür; sol menüdeki "+ Takviye Ekle" de sayfayı açar', back === 'view-home' && viaMenu === 'view-add-supplement', `${back} / ${viaMenu}`);

/* 2) Barkodla otomatik doldurma + düzenlenebilir stok */
await p.evaluate(() => handleAddSupBarcodeDecoded('0339840330085')); await sleep(900);
const filled = await p.evaluate(() => ({ name: manualSupName.value, brand: manualSupBrandActive.value, form: manualSupFormText.value, dose: manualSupDose.value, box: manualSupBoxCount.value, rem: manualSupRemainingCount.value }));
log('Barkod eşleşince ad, marka/etken, form, etiketteki miktar, kutudaki ve kalan adet dolar', filled.name.length > 3 && filled.brand && filled.form && filled.dose && Number(filled.box) > 0 && filled.rem === filled.box, JSON.stringify(filled));
await p.evaluate(() => { const btn = document.querySelector('[data-target="manualSupRemainingCount"][data-step="-1"]'); for (let i = 0; i < 5; i++) btn.click(); });
const rem2 = await p.evaluate(() => ({ rem: manualSupRemainingCount.value, badge: modalMisanthaDaysPreviewBadge.innerText }));
log('Kalan adet −/+ ile düzenlenir ve "gün yetecek" güncellenir', Number(rem2.rem) === Number(filled.rem) - 5 && new RegExp(`${Number(filled.rem) - 5}`).test(rem2.badge), JSON.stringify(rem2));

/* 3) Akıllı öneri */
const adv = await p.evaluate(() => {
  const set = v => { manualSupName.value = v; manualSupName.dispatchEvent(new Event('input')); return document.getElementById('vspAdvice').innerText.replace(/\s+/g, ' '); };
  return { omega: set('Omega-3 Balık Yağı'), d3: set('D3 + K2 Vitamini') };
});
log('Omega-3: "Emilim için akşam veya yağlı bir öğünle tok karnına alınması önerilir"', /Emilim için akşam veya yağlı bir öğünle tok karnına alınması önerilir/.test(adv.omega), adv.omega);
log('D3+K2: "Sabah veya öğlen saatlerinde ... alınması tavsiye edilir"', /Sabah veya öğlen saatlerinde/.test(adv.d3), adv.d3);

/* 4) Çoklu vakit + saat + belirli günler + aç/tok → kayıt */
await p.evaluate(() => { openAddSupplementModal(); });
await p.evaluate(today => {
  manualSupName.value = 'Test Omega-3'; manualSupName.dispatchEvent(new Event('input'));
  document.querySelector('#vspVakits [data-vakit="Akşam"]').click();
  const plus = document.querySelector('[data-target="manualSupDailyDose"][data-step="1"]'); // 2 vakit → otomatik 2; bir artır → 3
  plus.click();
  manualSupBoxCount.value = '90'; manualSupBoxCount.dispatchEvent(new Event('input'));
  manualSupRemainingCount.value = '90'; manualSupRemainingCount.dispatchEvent(new Event('input'));
  VitaSupPage.setClock('Sabah', '09:00'); VitaSupPage.setClock('Akşam', '21:00');
  manualSupHungerNote.value = 'Tok karnına'; manualSupHungerNote.dispatchEvent(new Event('change'));
  document.querySelector('[data-freq="days"]').click();
  document.querySelector(`#vspDays [data-day="${today}"]`).click();
  document.querySelector('#vspDays [data-day="5"]').click();
}, TODAY);
const pv = await p.evaluate(() => ({ preview: manualSupDosePreview.innerText, clocks: Array.from(document.querySelectorAll('#vspClocks .vsp-clock span')).map(x => x.innerText) }));
log('Vakit seçilince her biri için saat kutusu açılır; adet vakitlere bölünür (3 → 2+1); özet gün/saati gösterir', /Günde 3 \S+ · Sabah 09:00, Akşam 21:00 ·/.test(pv.preview) && /Tok karnına/.test(pv.preview) && /^Sabah 2 \S+\|Akşam 1 \S+$/.test(pv.clocks.join('|')), JSON.stringify(pv));
const before = await p.evaluate(() => state.supplements.length);
await p.evaluate(() => commitManualSupplement()); await sleep(500);
const recs = await p.evaluate(() => state.supplements.filter(s => s.name === 'Test Omega-3').map(s => ({ timing: s.timing, time: s.scheduleTime, days: s.scheduleDays, amount: s.gunlukDoz, rem: s.kalanAdet, box: s.toplamKutuAdedi, g: s.groupId, dose: s.doseText, scheduledDate: s.scheduledDate })));
const daysOk = recs.every(r => r.days.length === (TODAY === 5 ? 1 : 2) && r.days.includes(TODAY) && r.days.includes(5));
log('Her vakit için ayrı kayıt, aynı grup: Sabah 09:00 (2), Akşam 21:00 (1); stok 60/30 paylaştırılır; seçili günler kaydedilir', recs.length === 2 && recs[0].g && recs[0].g === recs[1].g && recs[0].timing === 'Sabah' && recs[0].time === '09:00' && recs[0].amount === 2 && recs[0].rem === 60 && recs[1].timing === 'Akşam' && recs[1].time === '21:00' && recs[1].amount === 1 && recs[1].rem === 30 && daysOk && /Tok karnına/.test(recs[0].dose) && !recs[0].scheduledDate, JSON.stringify(recs));
const home = await p.evaluate(() => {
  const cards = Array.from(document.querySelectorAll('#supplementChecklistContainer .vsc-card')).filter(c => /Test Omega-3/.test(c.innerText));
  cards[0].querySelector('.vsc-chev').click();
  return { tab: state.activeTab, n: cards.length, stock: cards[0].querySelector('.vsc-more').innerText.replace(/\s+/g, ' ') };
});
log('Kayıttan sonra Ana Sayfa\'ya döner; takviye iki vakitte listelenir ve stok tek kutu gibi gösterilir', home.tab === 'view-home' && home.n === 2 && /Stok: 30 gün yetecek\. Günlük doz: 3/.test(home.stock), JSON.stringify(home));

/* 5) Gün bazlı filtre: bugün programda olmayan takviye görünmez */
await p.evaluate(other => {
  openAddSupplementModal();
  manualSupName.value = 'Haftalık Test B12'; manualSupName.dispatchEvent(new Event('input'));
  document.querySelector('[data-freq="days"]').click();
  document.querySelector(`#vspDays [data-day="${other}"]`).click();
  commitManualSupplement();
}, OTHER); await sleep(400);
const filt = await p.evaluate(() => ({ stored: state.supplements.some(s => s.name === 'Haftalık Test B12'), shown: document.getElementById('supplementChecklistContainer').innerText.includes('Haftalık Test B12') }));
log('O gün programında olmayan takviye kaydedilir ama "Bugünkü takviyelerim"de hiç görünmez', filt.stored && !filt.shown, JSON.stringify(filt));
const days0 = await p.evaluate(() => { openAddSupplementModal(); document.querySelector('[data-freq="days"]').click(); const n = state.supplements.length; commitManualSupplement(); const r = { n0: n, n1: state.supplements.length }; return r; });
log('"Belirli günler" seçili ama gün işaretlenmemişse kaydedilmez', days0.n0 === days0.n1, JSON.stringify(days0));
await p.evaluate(() => navigateToView('view-home')); await sleep(200);

/* 6) Gün rozetleri + Gece grubu */
const badge = await p.evaluate(() => ({ hero: document.querySelector('#homeDayBadge span').innerText, sup: document.getElementById('supDayBadge').innerText, expect: new Date().toLocaleDateString('tr-TR', { weekday: 'long' }) }));
log('Karşılama kartında ve "Bugünkü takviyelerim" başlığında bugünün adı rozeti', badge.hero === badge.expect && badge.sup === badge.expect, JSON.stringify(badge));
await p.evaluate(() => { openAddSupplementModal(); manualSupName.value = 'Gece Melatonin'; manualSupName.dispatchEvent(new Event('input')); VitaSupPage.setVakits(['Gece']); commitManualSupplement(); }); await sleep(300);
const gece = await p.evaluate(() => Array.from(document.querySelectorAll('#supplementChecklistContainer .vsg-head')).map(h => h.querySelector('.vsg-label').innerText + ':' + (h.parentElement.innerText.includes('Gece Melatonin') ? 'var' : '')));
log('Gece vakti ayrı "Gece protokolü" grubunda listelenir', gece.some(x => /^Gece protokolü:var$/.test(x)) && !gece.some(x => /^Akşam protokolü:var$/.test(x)), JSON.stringify(gece));

/* 7) Saat çakışması uyarısı ve "kaydır" */
await p.evaluate(() => { state.supplements.push({ id: 'ca1', name: 'Kalsiyum 600 mg', timing: 'Sabah', scheduleTime: '08:30', toplamKutuAdedi: 30, kalanAdet: 30, gunlukDoz: 1, taken: false, scheduleDays: [0,1,2,3,4,5,6], addedDate: Date.now() }); saveState(); });
await p.evaluate(() => { openAddSupplementModal(); manualSupName.value = 'Ferro Demir'; manualSupName.dispatchEvent(new Event('input')); });
const cf1 = await p.evaluate(() => { const c = document.getElementById('vspConflict'); return { shown: !c.classList.contains('hidden'), text: c.innerText.replace(/\s+/g, ' ') }; });
log('Demir sabah 08:00 ↔ Kalsiyum 08:30: "aralarına en az 2 saat bırakın" uyarısı', cf1.shown && /Kalsiyum 600 mg/.test(cf1.text) && /en az 2 saat/.test(cf1.text), cf1.text.slice(0, 160));
await p.evaluate(() => document.querySelector('#vspConflict [data-shift-vakit]').click()); await sleep(150);
const cf2 = await p.evaluate(() => ({ clock: VitaSupPage.getPlan().vakits[0].clock, hidden: document.getElementById('vspConflict').classList.contains('hidden') }));
log('"…e kaydır" saati 2 saat sonrasına alır ve uyarı kalkar', cf2.clock === '10:30' && cf2.hidden, JSON.stringify(cf2));
const noGreen = await p.evaluate(() => !/Çakışma Saptanmadı/.test(document.getElementById('view-add-supplement').innerText));
log('Çelişen "Çakışma saptanmadı" kutusu gösterilmez', noGreen);
await p.evaluate(() => closeAddSupplementModal());

/* 8) Bildirim: yalnızca takviyenin günü ve saatinde */
const nt = await p.evaluate(async (args) => {
  const [today, other] = args;
  localStorage.setItem('vitatakip_notifications_enabled', 'true');
  const now = new Date(); const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  state.supplements.push({ id: 'n1', name: 'Bugün Var', timing: 'Sabah', scheduleTime: hm, toplamKutuAdedi: 30, kalanAdet: 30, gunlukDoz: 1, taken: false, scheduleDays: [today], addedDate: Date.now() });
  state.supplements.push({ id: 'n2', name: 'Bugün Yok', timing: 'Sabah', scheduleTime: hm, toplamKutuAdedi: 30, kalanAdet: 30, gunlukDoz: 1, taken: false, scheduleDays: [other], addedDate: Date.now() });
  Object.keys(localStorage).filter(k => k.startsWith('vitatakip_notif_fired_')).forEach(k => localStorage.removeItem(k));
  window.__notifs.length = 0; checkAndFireScheduledNotifications(); await new Promise(r => setTimeout(r, 300));
  return window.__notifs.map(n => n.body).join(' | ');
}, [TODAY, OTHER]);
log('Hatırlatma yalnızca takviyenin aktif olduğu gün ve saatte gider', /Bugün Var/.test(nt) && !/Bugün Yok/.test(nt), nt.slice(0, 160));

const diag = await p.evaluate(() => VitaTakipDiagnostics.run());
const failed = diag.results.filter(r => !r.passed).map(r => r.name);
log(`Uygulama içi tanılama (${diag.passed}/${diag.results.length})`, failed.length === 0, failed.join(', '));
log('Sayfa hatası yok', errs.length === 0, errs.join(' | '));
console.log(`ÖZET ${results.filter(Boolean).length}/${results.length}`);
await b.close();
