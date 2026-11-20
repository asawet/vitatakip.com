/* Takviye Ekle sayfası eklentileri: (1) aynı sayfada düzenleme, (2) hızlı ekleme kısayolları,
   (3) kutu bitmeden uyarı + "Yeni kutu açtım", (4) "Bugün atla", (5) katlanır stok bölümü (barkodla kendiliğinden açılır). */
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

/* 5) Katlanır stok */
await p.evaluate(() => openAddSupplementModal()); await sleep(200);
const st1 = await p.evaluate(() => { const d = document.getElementById('modalMisanthaStockBox'); return { tag: d.tagName, open: d.open, badgeVisible: document.getElementById('modalMisanthaDaysPreviewBadge').getBoundingClientRect().height > 0, inputVisible: document.getElementById('manualSupBoxCount').checkVisibility() }; });
log('Stok bölümü kapalı açılır; "kaç gün yetecek" rozeti başlıkta görünür kalır', st1.tag === 'DETAILS' && !st1.open && st1.badgeVisible && !st1.inputVisible, JSON.stringify(st1));
await p.evaluate(() => handleAddSupBarcodeDecoded('0339840330085')); await sleep(900);
const st2 = await p.evaluate(() => ({ open: document.getElementById('modalMisanthaStockBox').open, box: manualSupBoxCount.value }));
log('Barkod okununca stok bölümü kendiliğinden açılır (kutudaki adet kontrol edilsin)', st2.open && Number(st2.box) > 0, JSON.stringify(st2));
await p.evaluate(() => openAddSupplementModal());
const st3 = await p.evaluate(() => document.getElementById('modalMisanthaStockBox').open);
log('Sayfa yeniden açılınca stok bölümü yine kapalı başlar', st3 === false);

/* Kayıt: 2 vakitli takviye */
await p.evaluate(() => {
  manualSupName.value = 'Düzenle Omega-3'; manualSupName.dispatchEvent(new Event('input'));
  manualSupFormText.value = 'Kapsül'; manualSupFormText.dispatchEvent(new Event('input'));
  manualSupDose.value = '1000 mg';
  document.querySelector('#vspVakits [data-vakit="Akşam"]').click();
  VitaSupPage.setClock('Akşam', '21:00');
  manualSupHungerNote.value = 'Tok karnına'; manualSupHungerNote.dispatchEvent(new Event('change'));
  manualSupBoxCount.value = '60'; manualSupBoxCount.dispatchEvent(new Event('input'));
  commitManualSupplement();
}); await sleep(400);
const ids0 = await p.evaluate(() => state.supplements.filter(s => s.name === 'Düzenle Omega-3').map(s => s.id));

/* 2) Hızlı ekleme */
await p.evaluate(() => openAddSupplementModal()); await sleep(200);
const q = await p.evaluate(() => { const box = document.getElementById('vspQuick'); return { shown: !box.classList.contains('hidden'), chips: Array.from(box.querySelectorAll('.vsp-qchip')).map(c => c.innerText.trim()), belowSearch: box.getBoundingClientRect().top > document.getElementById('addSupBarcodeInput').getBoundingClientRect().top } });
log('Arama kutusunun altında "Hızlı ekle" kısayolları (son eklenen en başta)', q.shown && q.chips[0] === 'Düzenle Omega-3' && q.belowSearch, JSON.stringify(q));
await p.evaluate(() => document.querySelector('#vspQuick .vsp-qchip').click()); await sleep(200);
const qf = await p.evaluate(() => ({ name: manualSupName.value, form: manualSupFormText.value, dose: manualSupDose.value, unit: manualSupDoseUnit.value, hunger: manualSupHungerNote.value, plan: VitaSupPage.getPlan().vakits.map(v => v.vakit + ' ' + v.clock).join(','), box: manualSupBoxCount.value, rem: manualSupRemainingCount.value }));
log('Kısayola dokununca form tek dokunuşla dolar (ad, form, miktar, vakit/saat, aç-tok, yeni kutu)', qf.name === 'Düzenle Omega-3' && qf.form === 'Kapsül' && qf.dose === '1000 mg' && qf.unit === 'kapsül' && qf.hunger === 'Tok karnına' && qf.plan === 'Sabah 08:00,Akşam 21:00' && qf.box === '60' && qf.rem === '60', JSON.stringify(qf));
const n0 = await p.evaluate(() => state.supplements.length);
log('Kısayol kendiliğinden kaydetmez (önce kontrol)', n0 === await p.evaluate(() => state.supplements.length));
await p.evaluate(() => closeAddSupplementModal()); await sleep(200);

/* 1) Aynı sayfada düzenleme */
await p.evaluate(() => { const c = Array.from(document.querySelectorAll('#supplementChecklistContainer .vsc-card')).find(x => /Düzenle Omega-3/.test(x.innerText)); c.querySelector('.vsc-chev').click(); });
await p.evaluate(() => { const c = Array.from(document.querySelectorAll('#supplementChecklistContainer .vsc-card')).find(x => /Düzenle Omega-3/.test(x.innerText)); Array.from(c.querySelectorAll('.vsc-act')).find(x => /Düzenle/.test(x.innerText)).click(); });
await sleep(300);
const ed = await p.evaluate(() => ({ tab: state.activeTab, title: document.getElementById('currentViewTitle').innerText, btn: btnCommitSupplement.innerText.trim(), findHidden: document.getElementById('addSupBoxBarcodeSection').classList.contains('hidden'), quickHidden: document.getElementById('vspQuick').classList.contains('hidden'), name: manualSupName.value, plan: VitaSupPage.getPlan().vakits.map(v => v.vakit + ' ' + v.clock).join(','), daily: manualSupDailyDose.value, rem: manualSupRemainingCount.value, stockOpen: document.getElementById('modalMisanthaStockBox').open }));
log('Karttaki "Düzenle" aynı sayfayı dolu açar: başlık "Takviyeyi Düzenle", düğme "Değişiklikleri kaydet"', ed.tab === 'view-add-supplement' && ed.title === 'Takviyeyi Düzenle' && ed.btn === 'Değişiklikleri kaydet' && ed.findHidden && ed.quickHidden, JSON.stringify(ed));
log('Düzenlemede tüm vakitler/saatler, günlük adet ve kalan stok yüklenir', ed.name === 'Düzenle Omega-3' && ed.plan === 'Sabah 08:00,Akşam 21:00' && ed.daily === '2' && ed.rem === '60' && ed.stockOpen, JSON.stringify(ed));
await p.evaluate(() => {
  VitaSupPage.setClock('Akşam', '20:30');
  manualSupRemainingCount.value = '40'; manualSupRemainingCount.dispatchEvent(new Event('input'));
  commitManualSupplement();
}); await sleep(400);
const after = await p.evaluate(() => ({ recs: state.supplements.filter(s => s.name === 'Düzenle Omega-3').map(s => ({ id: s.id, t: s.timing, c: s.scheduleTime, r: s.kalanAdet, g: s.groupId })), tab: state.activeTab, title: document.getElementById('vsaTitle').innerText }));
log('Kaydedince kopya oluşmaz: aynı kimlikler, yeni saat (Akşam 20:30) ve yeni stok (40)', after.recs.length === 2 && after.recs.map(r => r.id).join() === ids0.join() && after.recs[1].c === '20:30' && after.recs.reduce((a, r) => a + r.r, 0) === 40 && after.recs[0].g && after.tab === 'view-home', JSON.stringify(after));
await p.evaluate(id => { VitaSupPage.startEdit(id); document.querySelector('#vspVakits [data-vakit="Akşam"]').click(); manualSupDailyDose.value = '1'; manualSupDailyDose.dispatchEvent(new Event('input')); commitManualSupplement(); }, ids0[0]); await sleep(300);
const one = await p.evaluate(() => state.supplements.filter(s => s.name === 'Düzenle Omega-3').map(s => ({ id: s.id, t: s.timing, g: s.groupId, r: s.kalanAdet })));
log('Düzenlemede bir vakit kaldırılınca tek kayıt kalır (grup çözülür, stok korunur)', one.length === 1 && one[0].id === ids0[0] && one[0].t === 'Sabah' && !one[0].g && one[0].r === 40, JSON.stringify(one));
await p.evaluate(id => VitaSupPage.startEdit(id), ids0[0]); await sleep(150);
await p.evaluate(() => document.querySelector('#viewHeaderBar .vbh-back').click()); await sleep(200);
await p.evaluate(() => { openAppDrawer(); document.getElementById('drawer-add-supplement').click(); }); await sleep(300);
const fresh = await p.evaluate(() => ({ title: document.getElementById('currentViewTitle').innerText, name: manualSupName.value, find: !document.getElementById('addSupBoxBarcodeSection').classList.contains('hidden'), edit: VitaSupPage.getEditIds() }));
log('Düzenlemeden kaydetmeden çıkılırsa sonraki açılış boş "Takviye Ekle" olur', fresh.title === 'Takviye Ekle' && fresh.name === '' && fresh.find && fresh.edit === null, JSON.stringify(fresh));
await p.evaluate(() => closeAddSupplementModal()); await sleep(200);

/* 3) Kutu bitmeden uyarı */
await p.evaluate(() => { state.supplements.push({ id: 'low1', name: 'Az Kalan Çinko', timing: 'Öğle', scheduleTime: '13:00', toplamKutuAdedi: 30, kalanAdet: 4, gunlukDoz: 1, taken: false, scheduleDays: [0,1,2,3,4,5,6], addedDate: Date.now() }); saveState(); renderDailyTab(); });
const low = await p.evaluate(() => { const c = document.querySelector('#supplementChecklistContainer .vsc-card[data-sup-id="low1"]'); const s = c.querySelector('.vsc-low'); return { shown: !!s && s.getBoundingClientRect().height > 0, text: s ? s.innerText.replace(/\s+/g, ' ') : '' }; });
log('Stok ≤ 5 gün: kartta (akordeon açmadan) "Kutu bitmek üzere" ve "Yeni kutu açtım" görünür', low.shown && /4 gün yetecek/.test(low.text) && /Yeni kutu açtım/.test(low.text), low.text);
await p.evaluate(() => document.querySelector('.vsc-card[data-sup-id="low1"] .vsc-low button').click()); await sleep(200);
const refilled = await p.evaluate(() => ({ rem: state.supplements.find(s => s.id === 'low1').kalanAdet, strip: !!document.querySelector('.vsc-card[data-sup-id="low1"] .vsc-low') }));
log('"Yeni kutu açtım" stoğa bir kutu ekler ve şerit kalkar', refilled.rem === 34 && !refilled.strip, JSON.stringify(refilled));
const ln = await p.evaluate(async () => {
  localStorage.setItem('vitatakip_notifications_enabled', 'true');
  state.supplements.find(s => s.id === 'low1').kalanAdet = 3; saveState();
  Object.keys(localStorage).filter(k => k.startsWith('vitatakip_notif_fired_')).forEach(k => localStorage.removeItem(k));
  window.__notifs.length = 0; checkAndFireScheduledNotifications(); await new Promise(r => setTimeout(r, 200));
  const first = window.__notifs.filter(n => /Az Kalan Çinko/.test(n.t)).length;
  checkAndFireScheduledNotifications(); await new Promise(r => setTimeout(r, 200));
  const second = window.__notifs.filter(n => /Az Kalan Çinko/.test(n.t)).length;
  return { first, second, hour: new Date().getHours(), body: (window.__notifs.find(n => /Az Kalan Çinko/.test(n.t)) || {}).body || '' };
});
log('Stok azalınca günde bir kez "bitmek üzere" bildirimi (09:00 sonrası)', ln.hour < 9 ? ln.first === 0 : (ln.first === 1 && ln.second === 1 && /3 gün/.test(ln.body)), JSON.stringify(ln));

/* 4) Bugün atla */
await p.evaluate(() => { state.supplements.push({ id: 'sk1', name: 'Atlanacak B12', timing: 'Sabah', scheduleTime: '08:00', toplamKutuAdedi: 30, kalanAdet: 30, gunlukDoz: 1, taken: false, scheduleDays: [0,1,2,3,4,5,6], addedDate: Date.now() }); saveState(); renderDailyTab(); });
const c0 = await p.evaluate(() => document.getElementById('dashMorningCount').innerText);
await p.evaluate(() => { const c = document.querySelector('.vsc-card[data-sup-id="sk1"]'); c.querySelector('.vsc-chev').click(); Array.from(document.querySelector('.vsc-card[data-sup-id="sk1"]').querySelectorAll('.vsc-act')).find(x => /Bugün atla/.test(x.innerText)).click(); }); await sleep(200);
const sk = await p.evaluate(() => { const c = document.querySelector('.vsc-card[data-sup-id="sk1"]'); return { skipped: c.classList.contains('is-skipped'), strip: (c.querySelector('.vsc-skipped') || {}).innerText || '', count: document.getElementById('dashMorningCount').innerText, stock: state.supplements.find(s => s.id === 'sk1').kalanAdet }; });
const tot = s => Number(String(s).split('/')[1]);
log('"Bugün atla": kart "Bugün atlandı" olur, sayaçtan düşer, stoktan düşmez', sk.skipped && /Bugün atlandı/.test(sk.strip) && tot(sk.count) === tot(c0) - 1 && sk.stock === 30, JSON.stringify({ c0, ...sk }));
const skn = await p.evaluate(async () => {
  const now = new Date(); const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  state.supplements.find(s => s.id === 'sk1').scheduleTime = hm;
  Object.keys(localStorage).filter(k => k.startsWith('vitatakip_notif_fired_')).forEach(k => localStorage.removeItem(k));
  window.__notifs.length = 0; checkAndFireScheduledNotifications(); await new Promise(r => setTimeout(r, 200));
  return window.__notifs.map(n => n.body).join(' | ');
});
log('Atlanan takviye için o gün hatırlatma gelmez', !/Atlanacak B12/.test(skn), skn.slice(0, 120));
await p.evaluate(() => document.querySelector('.vsc-card[data-sup-id="sk1"] .vsc-skipped button').click()); await sleep(200);
const un = await p.evaluate(() => ({ skipped: document.querySelector('.vsc-card[data-sup-id="sk1"]').classList.contains('is-skipped'), count: document.getElementById('dashMorningCount').innerText }));
log('"Geri al" atlamayı kaldırır, sayaç eski haline döner', !un.skipped && un.count === c0, JSON.stringify(un));
const nextDay = await p.evaluate(() => { const it = state.supplements.find(s => s.id === 'sk1'); it.skippedOn = '2000-01-01'; return isSupplementSkippedToday(it); });
log('Atlama yalnızca o güne özeldir (ertesi gün geçersiz)', nextDay === false);

const diag = await p.evaluate(() => VitaTakipDiagnostics.run());
const failed = diag.results.filter(r => !r.passed).map(r => r.name);
log(`Uygulama içi tanılama (${diag.passed}/${diag.results.length})`, failed.length === 0, failed.join(', '));
log('Sayfa hatası yok', errs.length === 0, errs.join(' | '));
console.log(`ÖZET ${results.filter(Boolean).length}/${results.length}`);
await b.close();
