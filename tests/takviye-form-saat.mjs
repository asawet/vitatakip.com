/* Takviye Ekle: hazır şablon çekmecesi (üstte, çiplerle, çift yönlü doldurma), ürüne özel form çipleri,
   forma göre birim/stok (damla 400, puf 150, mL 250), dijital SS:DD saat + Ayarlar'daki "Saat seçim düzeni",
   aç/tok bilgisinin kartta, bildirimde ve çakışma denetiminde kullanılması. */
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
await sleep(400);
const forms = () => Array.from(document.querySelectorAll('#vspForms .vsp-fchip')).map(c => c.innerText.trim() + (c.classList.contains('is-on') ? '*' : '')).join(',');

/* 1) Şablon çekmecesi konumu */
await p.evaluate(() => openAddSupplementModal()); await sleep(200);
const pos = await p.evaluate(() => { const d = document.getElementById('addSupMoreDetails'); const find = document.getElementById('addSupBoxBarcodeSection'); const card = document.getElementById('modalCustomNameContainer');
  return { afterFind: !!(find.compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING), beforeCard: !!(d.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING), open: d.open, summary: d.querySelector('summary').innerText.replace(/\s+/g, ' ').trim(), chips: document.querySelectorAll('#vspTplChips .vsp-tchip').length, nativeList: !!document.getElementById('vspFormList') }; });
log('"Hazır şablonlar" çekmecesi arama/barkod düğmelerinin hemen altında, Ürün bilgisi kartının üstünde (kapalı)', pos.afterFind && pos.beforeCard && !pos.open && /^Hazır şablonlar/.test(pos.summary) && pos.chips >= 8, JSON.stringify(pos));
log('Form için uzun açılır liste (datalist) kaldırıldı', !pos.nativeList);

/* 2) D3 + K2 şablonu: tüm alanlar dolar, damla birimi ve 400 damla stok */
await p.evaluate(() => { document.getElementById('addSupMoreDetails').open = true; document.querySelector('#vspTplChips [data-tpl="D3_K2"]').click(); }); await sleep(200);
const d3 = await p.evaluate(f => ({ name: manualSupName.value, brand: manualSupBrandActive.value, forms: eval(f)(), unit: manualSupDoseUnit.value, box: manualSupBoxCount.value, rem: manualSupRemainingCount.value, daily: vspDailyLbl.innerText, boxLbl: vspBoxLbl.textContent, hunger: manualSupHungerNote.value, advice: vspAdvice.innerText, plan: VitaSupPage.getPlan().vakits.map(v => v.vakit).join(), drawer: document.getElementById('addSupMoreDetails').open, chosen: vspTplChosen.innerText }), '(' + forms.toString() + ')');
log('D3 + K2 seçilince ad, etken madde, öneri, vakit ve aç/tok otomatik dolar', d3.name === 'D3 + K2 Vitamini' && /Kolekalsiferol/.test(d3.brand) && /Sabah veya öğlen/.test(d3.advice) && d3.plan === 'Sabah' && d3.hunger === 'Tok karnına' && !d3.drawer && /D3 \+ K2/.test(d3.chosen), JSON.stringify(d3));
log('D3 + K2: yalnızca Damla, Kapsül, Sprey çipleri (Damla seçili)', d3.forms === 'Damla*,Kapsül,Sprey', d3.forms);
log('Damla: birim "damla", stok 400 damla, etiketler "Günde kaç damla?" / "Şişedeki damla"', d3.unit === 'damla' && d3.box === '400' && d3.rem === '400' && d3.daily === 'Günde kaç damla?' && d3.boxLbl === 'Şişedeki damla', JSON.stringify(d3));
await p.evaluate(() => { manualSupDailyDose.value = '4'; manualSupDailyDose.dispatchEvent(new Event('input')); });
const d3days = await p.evaluate(() => ({ badge: modalMisanthaDaysPreviewBadge.innerText, preview: manualSupDosePreview.innerText }));
log('Kalan gün günlük damlaya göre: 400 damla / günde 4 damla = 100 gün', /^100 gün yetecek \(400 damla\)$/.test(d3days.badge) && /^Günde 4 damla/.test(d3days.preview), JSON.stringify(d3days));
await p.evaluate(() => document.querySelector('#vspForms [data-form="Sprey"]').click()); await sleep(100);
const spr = await p.evaluate(() => ({ unit: manualSupDoseUnit.value, box: manualSupBoxCount.value, lbl: vspBoxLbl.textContent, form: manualSupFormText.value, dose: modalDosePreview.innerText }));
log('Sprey çipi: birim "puf", stok 150 sıkım, etiket "Toplam sıkım (puf)"', spr.unit === 'puf' && spr.box === '150' && spr.lbl === 'Toplam sıkım (puf)' && spr.form === 'Sprey', JSON.stringify(spr));

/* 3) Demir ve B12 şablonları */
await p.evaluate(() => { openAddSupplementModal(); document.querySelector('#vspTplChips [data-tpl="Demir"]').click(); }); await sleep(150);
const fe = await p.evaluate(f => ({ forms: eval(f)(), hunger: manualSupHungerNote.value, unit: manualSupDoseUnit.value }), '(' + forms.toString() + ')');
log('Demir (Fe): yalnızca Saşe, Kapsül, Tablet; aç karnına önerisi işlenir', fe.forms === 'Saşe*,Kapsül,Tablet' && fe.hunger === 'Aç karnına' && fe.unit === 'saşe', JSON.stringify(fe));
await p.evaluate(() => { openAddSupplementModal(); document.querySelector('#vspTplChips [data-tpl="B12"]').click(); }); await sleep(150);
const b12 = await p.evaluate(f => eval(f)(), '(' + forms.toString() + ')');
log('B12: yalnızca Dilaltı Tablet, Dilaltı Sprey, Kapsül', b12 === 'Dilaltı Tablet*,Dilaltı Sprey,Kapsül', b12);

/* 4) Elle yazılan ad da aynı alanları besler; genel ürünlerde sık formlar */
await p.evaluate(() => { openAddSupplementModal(); manualSupName.value = 'Solgar Ferro Demir'; manualSupName.dispatchEvent(new Event('input')); }); await sleep(100);
const typed = await p.evaluate(f => ({ forms: eval(f)(), hunger: manualSupHungerNote.value, advice: vspAdvice.innerText }), '(' + forms.toString() + ')');
log('Elle "…Demir" yazınca da Demir çipleri, aç karnına ve öneri gelir', typed.forms === 'Saşe,Kapsül,Tablet' && typed.hunger === 'Aç karnına' && /Aç karnına/.test(typed.advice), JSON.stringify(typed));
await p.evaluate(() => { openAddSupplementModal(); manualSupName.value = 'Bilinmeyen Bitki Özütü'; manualSupName.dispatchEvent(new Event('input')); });
const gen = await p.evaluate(f => eval(f)(), '(' + forms.toString() + ')');
log('Genel ürün: Tablet, Kapsül, Damla, Saşe, Sprey, Ölçek / mL', gen === 'Tablet,Kapsül,Damla,Saşe,Sprey,Ölçek / mL', gen);
await p.evaluate(() => { document.querySelector('#vspForms [data-form="Ölçek / mL"]').click(); manualSupDailyDose.value = '5'; manualSupDailyDose.dispatchEvent(new Event('input')); });
const ml = await p.evaluate(() => ({ unit: manualSupDoseUnit.value, box: manualSupBoxCount.value, lbl: vspBoxLbl.textContent, badge: modalMisanthaDaysPreviewBadge.innerText }));
log('Ölçek / mL: birim mL, şişe 250 mL, günde 5 mL → 50 gün', ml.unit === 'mL' && ml.box === '250' && ml.lbl === 'Şişedeki mL' && /^50 gün yetecek \(250 mL\)$/.test(ml.badge), JSON.stringify(ml));
await p.evaluate(() => { manualSupBoxCount.value = '500'; manualSupBoxCount.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#vspForms [data-form="Damla"]').click(); });
const kept = await p.evaluate(() => ({ unit: manualSupDoseUnit.value, box: manualSupBoxCount.value }));
log('Kullanıcı stoğu kendisi değiştirdiyse form değişince varsayılanla ezilmez', kept.unit === 'damla' && kept.box === '500', JSON.stringify(kept));

/* 5) Dijital SS:DD saat girişi */
await p.evaluate(() => openAddSupplementModal()); await sleep(150);
const dig = await p.evaluate(() => ({ hh: document.querySelectorAll('#vspClocks .vsp-hh').length, mm: document.querySelectorAll('#vspClocks .vsp-mm').length, native: document.querySelectorAll('#vspClocks input[type=time]').length, mode: VitaSupPage.getTimeMode() }));
log('Varsayılan saat girişi dijital [SS] : [DD] kutucukları (saat tekerleği yok)', dig.hh === 1 && dig.mm === 1 && dig.native === 0 && dig.mode === 'digital', JSON.stringify(dig));
await p.click('#vspClocks .vsp-hh'); await p.keyboard.type('09'); await p.keyboard.type('45');
const typedClock = await p.evaluate(() => ({ plan: VitaSupPage.getPlan().vakits[0].clock, focusMm: document.activeElement.classList.contains('vsp-mm'), preview: manualSupDosePreview.innerText }));
log('Saat yazılınca dakikaya kendiliğinden geçer ve 09:45 işlenir', typedClock.plan === '09:45' && typedClock.focusMm && /Sabah 09:45/.test(typedClock.preview), JSON.stringify(typedClock));
await p.click('#vspClocks .vsp-hh'); await p.keyboard.type('27'); await p.click('#manualSupName'); await sleep(100);
const clamped = await p.evaluate(() => ({ plan: VitaSupPage.getPlan().vakits[0].clock, hh: document.querySelector('#vspClocks .vsp-hh').value }));
log('Geçersiz saat (27) kutudan çıkınca 23\'e düzeltilir', clamped.plan === '23:45' && clamped.hh === '23', JSON.stringify(clamped));
await p.evaluate(() => closeAddSupplementModal());

/* 6) Ayarlar > Araçlar: buzdolabı çizelgesi kalktı, "Saat seçim düzeni" eklendi */
await p.evaluate(() => navigateToView('view-settings')); await sleep(200);
const tools = await p.evaluate(() => { const s = document.getElementById('settingsSectionTools'); return { fridge: /Buzdolabı|Çizelgeyi Yazdır/.test(s.textContent), row: !!s.querySelector('#settingsTimeModeRow'), btns: Array.from(s.querySelectorAll('[data-timemode]')).map(x => x.innerText.trim() + (x.getAttribute('aria-checked') === 'true' ? '*' : '')) }; });
log('Ayarlar > Araçlar: "Buzdolabı çizelgesi" yok, "Saat seçim düzeni" (Dijital varsayılan) var', !tools.fridge && tools.row && tools.btns.join('|') === 'Dijital kutucuk (SS : DD)*|Klasik saat tekerleği', JSON.stringify(tools));
await p.evaluate(() => document.querySelector('[data-timemode="dial"]').click()); await sleep(100);
await p.evaluate(() => openAddSupplementModal()); await sleep(150);
const dial = await p.evaluate(() => ({ native: document.querySelectorAll('#vspClocks input[type=time]').length, hh: document.querySelectorAll('#vspClocks .vsp-hh').length, stored: localStorage.getItem('vitatakip_time_input_mode') }));
log('"Klasik saat tekerleği" seçilince Takviye Ekle saatleri tekerlekli saat alanına döner', dial.native === 1 && dial.hh === 0 && dial.stored === 'dial', JSON.stringify(dial));
await p.evaluate(() => { VitaSupPage.setTimeMode('digital'); closeAddSupplementModal(); });

/* 7) Aç/tok: kart, bildirim, çakışma */
await p.evaluate(() => { openAddSupplementModal(); manualSupName.value = 'Ferro Demir'; manualSupName.dispatchEvent(new Event('input')); document.querySelector('#vspForms [data-form="Kapsül"]').click(); commitManualSupplement(); }); await sleep(300);
const card = await p.evaluate(() => { const c = Array.from(document.querySelectorAll('#supplementChecklistContainer .vsc-card')).find(x => /Ferro Demir/.test(x.innerText)); return c ? (c.querySelector('.vsc-hunger') || {}).innerText : null; });
log('Kart özet satırında aç/tok bilgisi görünür', card === 'Aç karnına', card);
const nt = await p.evaluate(async () => {
  localStorage.setItem('vitatakip_notifications_enabled', 'true');
  const now = new Date(); const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  state.supplements.find(s => s.name === 'Ferro Demir').scheduleTime = hm;
  Object.keys(localStorage).filter(k => k.startsWith('vitatakip_notif_fired_')).forEach(k => localStorage.removeItem(k));
  window.__notifs.length = 0; checkAndFireScheduledNotifications(); await new Promise(r => setTimeout(r, 200));
  return window.__notifs.map(n => n.t + ' | ' + n.body).join(' || ');
});
log('Bildirim: "Ferro Demir alma zamanı — Aç karnına 1 kapsül"', /Ferro Demir alma zamanı — Aç karnına 1 kapsül/.test(nt), nt);
await p.evaluate(() => {
  state.supplements = state.supplements.filter(s => s.name !== 'Ferro Demir');
  state.supplements.push({ id: 'ca2', name: 'Kalsiyum 600', timing: 'Sabah', scheduleTime: '08:30', aclikDurumu: 'Tok karnına', toplamKutuAdedi: 30, kalanAdet: 30, gunlukDoz: 1, taken: false, scheduleDays: [0,1,2,3,4,5,6], addedDate: Date.now() });
  state.supplements.push({ id: 'om2', name: 'Omega Kahvaltı', timing: 'Sabah', scheduleTime: '08:00', aclikDurumu: 'Tok karnına', toplamKutuAdedi: 30, kalanAdet: 30, gunlukDoz: 1, taken: false, scheduleDays: [0,1,2,3,4,5,6], addedDate: Date.now() });
  saveState();
  openAddSupplementModal(); manualSupName.value = 'Ferro Demir'; manualSupName.dispatchEvent(new Event('input'));
});
const cf = await p.evaluate(() => document.getElementById('vspConflict').innerText.replace(/\s+/g, ' '));
log('Aç karnına Demir ↔ tok karnına Kalsiyum: çakışma metninde aç/tok bilgisi', /Kalsiyum 600/.test(cf) && /aç karnına/.test(cf) && /tok karnına/.test(cf) && /en az 2 saat/.test(cf), cf.slice(0, 220));
log('Mineral olmasa da aç karnına ↔ tok karnına aynı saat çakışması bildirilir (Omega Kahvaltı)', /Omega Kahvaltı/.test(cf), cf.slice(0, 300));
await p.evaluate(() => { manualSupHungerNote.value = 'Tok karnına'; manualSupHungerNote.dispatchEvent(new Event('change')); VitaSupPage.refresh(); });
const cf3 = await p.evaluate(() => ({ cf: document.getElementById('vspConflict').innerText.replace(/\s+/g, ' '), advice: vspAdvice.innerText }));
log('Demir için "Tok karnına" seçilirse öneri kutusu uyarır, aç/tok çakışması kalkar', !/Omega Kahvaltı/.test(cf3.cf) && /önerilen “Aç karnına” ile uyuşmuyor/.test(cf3.advice), JSON.stringify(cf3).slice(0, 300));
await p.evaluate(() => closeAddSupplementModal());

const diag = await p.evaluate(() => VitaTakipDiagnostics.run());
const failed = diag.results.filter(r => !r.passed).map(r => r.name);
log(`Uygulama içi tanılama (${diag.passed}/${diag.results.length})`, failed.length === 0, failed.join(', '));
log('Sayfa hatası yok', errs.length === 0, errs.join(' | '));
console.log(`ÖZET ${results.filter(Boolean).length}/${results.length}`);
await b.close();
