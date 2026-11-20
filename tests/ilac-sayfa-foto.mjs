/* Tam ekran İlaç Ekle sayfası, kamera açılış düzeltmesi, galeriden "Barkod fotoğrafı yükle" (barkodsuz görsel reddedilir)
   ve "Kutu fotoğrafı yükle", profil fotoğrafı çözücü (büyük / türü boş / HEIC yolu). */
import { boot, sleep } from './lib.mjs';
const { b, p, errs } = await boot({ preload: () => {
  window.__notifs = [];
  try { Object.defineProperty(Notification, 'permission', { get: () => 'granted' }); } catch (e) {}
  if (navigator.serviceWorker) navigator.serviceWorker.getRegistration = async () => ({ showNotification: async (t, o) => { window.__notifs.push({ t, body: o && o.body }); } });
} });
await p.setViewport({ width: 390, height: 844 });
p.setDefaultTimeout(30000); p.on('dialog', d => d.accept());
const results = []; const log = (n, ok, d) => { results.push(ok); console.log((ok ? 'OK   ' : 'FAIL ') + n + (d ? ' -> ' + d : '')); };
await p.evaluate(() => { try { closeProfileModal(); } catch (e) {} try { finishVitaSpotlightTour(true); } catch (e) {} navigateToView('view-home'); });
await sleep(400);

/* Sayfada gerçek bir EAN-13 barkod görseli (PNG) üretir: L/G/R kodlaması + koruma çubukları */
await p.evaluate(() => {
  window.__ean13Png = async (code, w = 760, h = 360) => {
    const L = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
    const G = ['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
    const R = ['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100'];
    const P = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];
    const d = code.split('').map(Number); let bits = '101';
    for (let i = 1; i <= 6; i++) bits += (P[d[0]][i - 1] === 'L' ? L : G)[d[i]];
    bits += '01010'; for (let i = 7; i <= 12; i++) bits += R[d[i]]; bits += '101';
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.fillStyle = '#000';
    const mod = Math.floor((w - 80) / bits.length);
    for (let i = 0; i < bits.length; i++) if (bits[i] === '1') x.fillRect(40 + i * mod, 30, mod, h - 60);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    return new File([blob], 'barkod.png', { type: 'image/png' });
  };
  window.__plainPng = async (name = 'manzara.png', type = 'image/png', w = 400, h = 300) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#38bdf8'); g.addColorStop(1, '#f59e0b'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    const blob = await new Promise(r => c.toBlob(r, type === 'image/jpeg' || /jpe?g$/.test(name) ? 'image/jpeg' : 'image/png', 0.9));
    return new File([blob], name, { type });
  };
  window.__feed = (id, file) => { const input = document.getElementById(id); const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); };
});

/* 1) Tam ekran İlaç Ekle */
await p.evaluate(() => document.getElementById('btnOpenAddMedication').click()); await sleep(400);
const pg = await p.evaluate(() => ({ tab: state.activeTab, visible: !document.getElementById('view-add-medication').classList.contains('hidden'), bar: !document.getElementById('viewHeaderBar').classList.contains('hidden'), back: document.querySelector('#viewHeaderBar .vbh-back').innerText.trim(), title: document.getElementById('currentViewTitle').innerText, overlay: getComputedStyle(document.getElementById('addMedicationModal')).position === 'fixed', home: document.getElementById('view-home').classList.contains('hidden') }));
log('"+ İlaç Ekle" tam ekran sayfa açar: üstte "← Ana Sayfa" ve "İlaç Ekle" (açılır pencere değil)', pg.tab === 'view-add-medication' && pg.visible && pg.bar && pg.back === 'Ana Sayfa' && pg.title === 'İlaç Ekle' && !pg.overlay && pg.home, JSON.stringify(pg));
const lay = await p.evaluate(() => { const y = id => document.getElementById(id).getBoundingClientRect().top; return { order: y('addMedSearchInput') < y('btnAddMedStartCamera') && y('btnAddMedStartCamera') < y('addMedName') && y('addMedName') < y('addMedDoseFieldset'), btns: [document.getElementById('btnAddMedStartCamera').innerText.trim(), document.getElementById('btnAddMedPhoto').innerText.replace(/\s+/g, ' ').trim()], digital: document.querySelectorAll('#addMedClocks .vsp-hm').length, hunger: document.getElementById('addMedHunger').tagName, forms: document.querySelectorAll('#vamForms .vsp-fchip').length }; });
log('Düzen: arama → Barkod Tara / Yapay Zekâ ile Tanı → Ürün bilgisi → Nasıl alacaksınız? (dijital SS:DD, aç/tok, form çipleri)', lay.order && lay.btns[0] === 'Barkod Tara' && /Yapay Zekâ ile Tanı/.test(lay.btns[1]) && lay.digital === 1 && lay.hunger === 'SELECT' && lay.forms >= 6, JSON.stringify(lay));
await p.evaluate(() => document.querySelector('#viewHeaderBar .vbh-back').click()); await sleep(300);
const back = await p.evaluate(() => state.activeTab);
log('"← Ana Sayfa" geri götürür', back === 'view-home', back);

/* 2) Canlı arama + otomatik doldurma */
await p.evaluate(() => openAddMedicationModal()); await sleep(200);
await p.type('#addMedSearchInput', 'euth'); await sleep(300);
const sg = await p.evaluate(() => Array.from(document.querySelectorAll('#addMedSuggest [data-med-pick] b')).map(x => x.textContent));
log('Yazmaya başlayınca eşleşen ilaçlar anında aşağıda listelenir', sg.length > 0 && sg.every(x => /Euthyrox/i.test(x)), JSON.stringify(sg));
await p.evaluate(() => document.querySelector('#addMedSuggest [data-med-pick]').click()); await sleep(200);
const picked = await p.evaluate(() => ({ name: addMedName.value, active: addMedActive.value, hunger: addMedHunger.value }));
log('Seçilen ilacın adı ve etken maddesi alanlara işlenir', /Euthyrox/.test(picked.name) && /Levotiroksin/i.test(picked.active), JSON.stringify(picked));
await p.evaluate(() => { openAddMedicationModal(); VitaMedPage.applyProduct({ urunAdi: 'Parol 500 mg Tablet' }); });
const fm = await p.evaluate(() => ({ on: (document.querySelector('#vamForms .is-on') || {}).innerText, unit: addMedUnit.value }));
document: await p.evaluate(() => document.querySelector('#vamForms [data-medform="Şurup"]').click());
const fm2 = await p.evaluate(() => ({ on: (document.querySelector('#vamForms .is-on') || {}).innerText, unit: addMedUnit.value, lbl: document.getElementById('addMedPreview').innerText }));
log('Form addan tanınır (Tablet) ve form çipleri birimi değiştirir (Şurup → mL)', fm.on === 'Tablet' && fm.unit === 'tablet' && fm2.on === 'Şurup' && fm2.unit === 'mL' && /Her dozda 1 mL/.test(fm2.lbl), JSON.stringify({ fm, fm2 }));

/* 3) Plan: belirli günler + 2 vakit + aç karnına + doz 2 → kayıt, bugünkü liste ve bildirim */
const TODAY = await p.evaluate(() => new Date().getDay());
await p.evaluate(today => {
  openAddMedicationModal();
  addMedName.value = 'Planlı Test İlacı 10 mg';
  document.querySelector('#vamForms [data-medform="Tablet"]').click();
  document.querySelector('[data-target="addMedDose"][data-step="1"]').click();
  document.querySelector('[data-medfreq="days"]').click();
  document.querySelector(`#vamDays [data-day="${today}"]`).click();
  document.querySelector(`#vamDays [data-day="${(today + 2) % 7}"]`).click();
  document.querySelector('#vamVakits [data-vakit="Akşam"]').click();
  addMedHunger.value = 'Aç karnına'; addMedHunger.dispatchEvent(new Event('change'));
}, TODAY);
await p.click('#addMedClocks .vsp-hh'); await p.keyboard.type('0745');
const pv = await p.evaluate(() => document.getElementById('addMedPreview').innerText);
log('Özet: "Her dozda 2 tablet · Sabah 07:45, Akşam 20:00 · <günler> · Aç karnına" (dijital saat yazılır)', /^Her dozda 2 tablet · Sabah 07:45, Akşam 20:00 · .+ · Aç karnına$/.test(pv), pv);
await p.evaluate(() => commitAddMedication()); await sleep(400);
const med = await p.evaluate(() => { const m = state.medications.find(x => x.name === 'Planlı Test İlacı 10 mg'); return m && { f: m.frequency, clocks: m.clocks, days: m.days, dose: m.dose, unit: m.unit, hunger: m.aclikDurumu, form: m.form, tab: state.activeTab }; });
log('Kayıt: plan (saatler + seçili günler), her dozda 2 tablet, aç karnına, form', med && med.f === 'plan' && med.clocks.join() === '07:45,20:00' && med.days.length === 2 && med.days.includes(TODAY) && med.dose === 2 && med.unit === 'tablet' && med.hunger === 'Aç karnına' && med.form === 'Tablet' && med.tab === 'view-home', JSON.stringify(med));
const row = await p.evaluate(() => Array.from(document.querySelectorAll('#todayMedsList .vtm-row')).filter(r => /Planlı Test/.test(r.innerText)).map(r => r.innerText.replace(/\s+/g, ' ')));
log('Bugünkü ilaçlarım: iki doz, "2 tablet" ve "Aç karnına" etiketi ile', row.length === 2 && row.every(t => /2 tablet/.test(t) && /Aç karnına/.test(t)), JSON.stringify(row));
const nt = await p.evaluate(async () => {
  localStorage.setItem('vitatakip_notifications_enabled', 'true');
  const now = new Date(); const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const m = state.medications.find(x => x.name === 'Planlı Test İlacı 10 mg'); m.clocks = [hm];
  Object.keys(localStorage).filter(k => k.startsWith('vitatakip_med_notif_fired_')).forEach(k => localStorage.removeItem(k));
  window.__notifs.length = 0; checkAndFireScheduledNotifications(); await new Promise(r => setTimeout(r, 200));
  return window.__notifs.map(n => n.body).join(' | ');
});
log('İlaç bildirimi aç/tok ve miktarı içerir ("— Aç karnına 2 tablet")', /Planlı Test İlacı 10 mg alma zamanınız geldi \(\d\d:\d\d\) — Aç karnına 2 tablet/.test(nt), nt);
const other = await p.evaluate(today => { const m = normalizeVitaMedication({ name: 'X', frequency: 'plan', clocks: ['09:00'], days: [(today + 3) % 7] }); return getVitaMedicationDoses(m).length; }, TODAY);
log('Belirli günlerdeki ilaç o gün değilse bugünkü listede yer almaz', other === 0);

/* 4) Kamera: html5-qrcode başlatması askıda kalırsa 9 sn içinde yedek yönteme geçer ve barkodu okur */
await p.evaluate(() => {
  openAddMedicationModal();
  window.ensureCameraPermissionForFeature = async () => true;
  window.Html5Qrcode = class { constructor() {} start() { return new Promise(() => {}); } stop() { return Promise.resolve(); } clear() {} };
  const c = document.createElement('canvas'); c.width = 320; c.height = 240; c.getContext('2d').fillRect(0, 0, 320, 240);
  navigator.mediaDevices.getUserMedia = async () => c.captureStream(5);
  window.BarcodeDetector = class { constructor() {} async detect() { return [{ rawValue: '8699514010050' }]; } };
});
const t0 = Date.now();
await p.evaluate(() => { startVitaMedCamera(); });
let camOk = null;
for (let i = 0; i < 30 && !camOk; i++) { await sleep(500); camOk = await p.evaluate(() => /Levotiron/.test(addMedName.value) ? addMedName.value : null); }
const camState = await p.evaluate(() => ({ hidden: document.getElementById('addMedCamera').classList.contains('hidden'), start: !document.getElementById('btnAddMedStartCamera').classList.contains('hidden') }));
log('Kamera askıda kalmaz: başlatma takılırsa yedek kamera akışına geçip barkodu okur ve kamerayı kapatır', !!camOk && camState.hidden && camState.start, `${camOk} · ${Date.now() - t0} ms · ${JSON.stringify(camState)}`);
await p.evaluate(() => { delete window.BarcodeDetector; });

/* 5) Galeriden "Barkod fotoğrafı yükle": barkodsuz görsel reddedilir, barkodlu görsel eşleşir (ZXing, cihazda) */
await p.evaluate(async () => { openAddMedicationModal(); __feed('addMedBarcodeGalleryInput', await __plainPng()); }); await sleep(2500);
const rej = await p.evaluate(() => ({ status: document.getElementById('addMedStatus').innerText, name: addMedName.value }));
log('İlaç: barkodsuz fotoğraf "Geçersiz görsel: Barkod tespit edilemedi" ile reddedilir', /Geçersiz görsel: Barkod tespit edilemedi/.test(rej.status) && rej.name === '', JSON.stringify(rej));
await p.evaluate(async () => { __feed('addMedBarcodeGalleryInput', await __ean13Png('8699514010050')); });
let acc = null; for (let i = 0; i < 20 && !acc; i++) { await sleep(400); acc = await p.evaluate(() => /Levotiron/.test(addMedName.value) ? { name: addMedName.value, bc: addMedBarcode.value } : null); }
log('İlaç: barkodlu fotoğraf kabul edilir ve ilaç eşleşir (8699514010050 → Levotiron)', !!acc && acc.bc === '8699514010050', JSON.stringify(acc));
await p.evaluate(async () => { openAddSupplementModal(); __feed('addSupBarcodeGalleryInput', await __plainPng()); }); await sleep(2500);
const rejS = await p.evaluate(() => ({ fb: document.getElementById('addSupBarcodeFeedbackBox').innerText, name: manualSupName.value, aiCard: !document.getElementById('addSupAiResultCard').classList.contains('hidden') }));
log('Takviye: barkodsuz fotoğraf reddedilir; yapay zekâya geçilmez', /Geçersiz görsel: Barkod tespit edilemedi/.test(rejS.fb) && rejS.name === '' && !rejS.aiCard, JSON.stringify(rejS));
await p.evaluate(async () => { __feed('addSupBarcodeGalleryInput', await __ean13Png('0339840330085')); });
let accS = null; for (let i = 0; i < 20 && !accS; i++) { await sleep(400); accS = await p.evaluate(() => manualSupName.value ? { name: manualSupName.value, bc: addSupBarcodeInput.value } : null); }
log('Takviye: barkodlu fotoğraf kabul edilir ve ürün eşleşir', !!accS && /339840330085/.test(accS.bc), JSON.stringify(accS));
const inputs = await p.evaluate(() => ['addSupBarcodeGalleryInput', 'addSupAiGalleryInput', 'addMedBarcodeGalleryInput', 'addMedAiGalleryInput', 'addSupAiPhotoInput', 'addMedPhotoInput'].map(id => { const el = document.getElementById(id); return id + ':' + (el.hasAttribute('capture') ? 'kamera' : 'galeri'); }));
log('"Kutu fotoğrafı yükle" ve "Barkod fotoğrafı yükle" galeriden seçer; "Yapay Zekâ ile Tanı" kamerayla çeker', inputs.join() === 'addSupBarcodeGalleryInput:galeri,addSupAiGalleryInput:galeri,addMedBarcodeGalleryInput:galeri,addMedAiGalleryInput:galeri,addSupAiPhotoInput:kamera,addMedPhotoInput:kamera', inputs.join());
await p.evaluate(() => closeAddMedicationModal());

/* 6) Profil fotoğrafı: büyük JPEG, türü boş galeri dosyası, bozuk dosya için anlaşılır hata, HEIC dönüştürücü yerelde */
const pf = await p.evaluate(async () => {
  const big = await __plainPng('buyuk.jpg', 'image/jpeg', 4000, 3000);
  const r1 = await VitaProfilePhoto.processFile(big).then(d => d.slice(0, 15)).catch(e => 'ERR ' + e.message);
  const noType = await __plainPng('galeri.jpg', '', 800, 600);
  const r2 = await VitaProfilePhoto.processFile(noType).then(d => d.slice(0, 15)).catch(e => 'ERR ' + e.message);
  const bad = new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], 'bozuk.jpg', { type: 'image/jpeg' });
  const r3 = await VitaProfilePhoto.processFile(bad).then(() => 'OK?').catch(e => e.message);
  const heicName = VitaImage.isImageFile(new File([new Uint8Array([1])], 'IMG_0001.HEIC', { type: '' }));
  const h = await VitaImage.loadHeic2any().then(fn => typeof fn).catch(e => 'ERR ' + e.message);
  return { r1, r2, r3, heicName, h };
});
log('Profil fotoğrafı: 12 MP büyük JPEG sorunsuz eklenir', /^data:image\/(webp|jpeg)/.test(pf.r1), pf.r1);
log('Profil fotoğrafı: türü boş gelen galeri dosyası (.jpg) da eklenir', /^data:image\/(webp|jpeg)/.test(pf.r2), pf.r2);
log('Bozuk dosyada "Görsel okunamadı" yerine anlaşılır açıklama', /açılamadı/.test(pf.r3) && !/^Görsel okunamadı\.$/.test(pf.r3), pf.r3);
log('HEIC dosyası tanınır ve HEIC dönüştürücü cihazda (yerel kopyadan) yüklenir', pf.heicName && pf.h === 'function', JSON.stringify({ heicName: pf.heicName, h: pf.h }));
await p.evaluate(() => { document.querySelector('[data-timemode="dial"]').click(); openAddMedicationModal(); });
const dial = await p.evaluate(() => document.querySelectorAll('#addMedClocks input[type=time]').length);
await p.evaluate(() => { VitaSupPage.setTimeMode('digital'); closeAddMedicationModal(); });
log('Ayarlar\'daki "Saat seçim düzeni" İlaç Ekle sayfasında da geçerli', dial === 1, String(dial));

const diag = await p.evaluate(() => VitaTakipDiagnostics.run());
const failed = diag.results.filter(r => !r.passed).map(r => r.name);
log(`Uygulama içi tanılama (${diag.passed}/${diag.results.length})`, failed.length === 0, failed.join(', '));
log('Sayfa hatası yok', errs.length === 0, errs.join(' | '));
console.log(`ÖZET ${results.filter(Boolean).length}/${results.length}`);
await b.close();
