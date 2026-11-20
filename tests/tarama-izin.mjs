/* Tarama motoru, katalog eşleme ve izinler:
   - GS1 karekod (DataMatrix) çözümü, kontrol hanesi ile yanlış okumanın reddi, kamera kapandıktan sonra gelen okumanın yok sayılması
   - Barkod numarasından yapay zekâ TAHMİNİ yok (Arveles → Concerta gibi yanlış eşleşme); bulunamayan barkodda "Yapay Zekâ ile Bul" + Ayarlar bağlantısı
   - "Kutu fotoğrafı yükle" barkod aramadan doğrudan yapay zekâya gider; bulunamayan barkod tanınan ürünle otomatik eşlenir
   - Ayarlar: mikrofon izni, engellenmiş bildirim izni için yönlendirme kartı + "İzni Yeniden Doğrula"
   - Ana sayfa: "Bugünkü ilaçlarım" gün rozeti, "+ Ekle" düğmeleri açıklamanın sağında; Tahliller: ALT yarım genişlik, CRP yanında */
import { boot, sleep } from './lib.mjs';
const { b, p, errs } = await boot({ preload: () => {
  window.__notifPerm = 'denied';
  try { Object.defineProperty(Notification, 'permission', { get: () => window.__notifPerm }); } catch (e) {}
  try { Notification.requestPermission = async () => window.__notifPerm; } catch (e) {}
  if (navigator.serviceWorker) navigator.serviceWorker.getRegistration = async () => ({ showNotification: async () => {} });
} });
await p.setViewport({ width: 390, height: 844 });
p.setDefaultTimeout(30000); p.on('dialog', d => d.accept());
const results = []; const log = (n, ok, d) => { results.push(ok); console.log((ok ? 'OK   ' : 'FAIL ') + n + (d ? ' -> ' + d : '')); };
await p.evaluate(() => { try { closeProfileModal(); } catch (e) {} try { finishVitaSpotlightTour(true); } catch (e) {} navigateToView('view-home'); });
await sleep(400);
await p.evaluate(() => {
  window.__withCheck = base => { const d = base.split('').map(Number); const s = d.reverse().reduce((a, x, i) => a + x * (i % 2 === 0 ? 3 : 1), 0); return base + ((10 - (s % 10)) % 10); };
  window.__plainPng = async () => { const c = document.createElement('canvas'); c.width = 400; c.height = 300; const x = c.getContext('2d'); x.fillStyle = '#f59e0b'; x.fillRect(0, 0, 400, 300); const blob = await new Promise(r => c.toBlob(r, 'image/png')); return new File([blob], 'kutu.png', { type: 'image/png' }); };
  window.__feed = (id, file) => { const input = document.getElementById(id); const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); };
});

/* 1) Karekod ve kontrol hanesi */
const gs = await p.evaluate(() => ({
  raw: vitaAcceptScannedCode('0108699514010050211234567890\u001d17270131\u001d10LOT42'),
  sym: vitaAcceptScannedCode(']d2010869951401005021ABC\u001d17270131'),
  human: vitaAcceptScannedCode('(01)08699514010050(21)XYZ'),
  ean: vitaAcceptScannedCode('8699514010050'),
  bad: vitaAcceptScannedCode('8699514010051'),
  url: vitaAcceptScannedCode('https://example.com/ilac')
}));
log('İlaç karekodu (GS1 DataMatrix: ham, ]d2 önekli, insan okunur) → GTIN 8699514010050', gs.raw === '8699514010050' && gs.sym === '8699514010050' && gs.human === '8699514010050' && gs.ean === '8699514010050', JSON.stringify(gs));
log('Kontrol hanesi tutmayan (yanlış okunmuş) barkod ve ürün barkodu olmayan kod reddedilir', gs.bad === '' && gs.url === '', JSON.stringify(gs));
const fmt = await p.evaluate(async () => { await loadHtml5QrCodeLibrary(); const c = vitaHtml5ReaderConfig(); const F = window.Html5QrcodeSupportedFormats; return { dm: c.formatsToSupport.includes(F.DATA_MATRIX), qr: c.formatsToSupport.includes(F.QR_CODE), ean: c.formatsToSupport.includes(F.EAN_13), native: c.experimentalFeatures.useBarCodeDetectorIfSupported }; });
log('Kamera okuyucu: EAN-13 + DataMatrix + QR, varsa cihazın yerel okuyucusu', fmt.dm && fmt.qr && fmt.ean && fmt.native, JSON.stringify(fmt));

/* 2) Kamera: yanlış okuma atlanır (tarama sürer), kamera kapandıktan sonra gelen okuma yok sayılır */
await p.evaluate(() => {
  openAddMedicationModal();
  window.ensureCameraPermissionForFeature = async () => true;
  window.__cb = null;
  window.Html5Qrcode = class { constructor() {} async start(cam, cfg, onOk) { window.__cb = onOk; } stop() { return Promise.resolve(); } clear() {} };
});
await p.evaluate(() => startVitaMedCamera()); await sleep(600);
const cam1 = await p.evaluate(async () => { window.__cb('8699514010051'); await new Promise(r => setTimeout(r, 300)); return { name: addMedName.value, open: !document.getElementById('addMedCamera').classList.contains('hidden'), status: addMedCameraStatus.textContent }; });
log('Canlı taramada kontrol hanesi tutmayan okuma kabul edilmez, kamera açık kalır', cam1.name === '' && cam1.open && /net okunamadı/.test(cam1.status), JSON.stringify(cam1));
const cam2 = await p.evaluate(async () => { const cb = window.__cb; stopVitaMedCamera(); cb('8699514010050'); await new Promise(r => setTimeout(r, 600)); return { name: addMedName.value, status: document.getElementById('addMedStatus').innerText }; });
log('Kamera kapatıldıktan sonra gelen gecikmeli okuma hiçbir şey tetiklemez', cam2.name === '' && !/Levotiron/.test(cam2.status), JSON.stringify(cam2));

/* 3) Bulunamayan barkod: numaradan yapay zekâ tahmini YOK; "Yapay Zekâ ile Bul" + "Elle yaz" + Ayarlar bağlantısı */
const UNKNOWN = await p.evaluate(() => __withCheck('869000012345'));
await p.evaluate(code => { window.__gem = 0; const orig = window.callGeminiWithFallback; window.callGeminiWithFallback = async (...a) => { window.__gem++; return orig ? orig(...a) : {}; }; return lookupAddMedBarcode(code); }, UNKNOWN); await sleep(400);
const nf = await p.evaluate(() => ({ status: document.getElementById('addMedStatus').innerText.replace(/\s+/g, ' '), ai: !!document.querySelector('#addMedStatus .vam-act-ai'), set: !!document.querySelector('#addMedStatus .vita-set-link'), gem: window.__gem, name: addMedName.value }));
log('Bulunamayan ilaç barkodu: ürün uydurulmaz; "Yapay Zekâ ile Bul" ve "Elle yaz" sunulur', /ilaç listesinde yok/.test(nf.status) && nf.ai && /Elle yaz/.test(nf.status) && nf.gem === 0 && nf.name === '', JSON.stringify(nf));
log('Anahtar / onay yokken mesajda doğrudan "Ayarlar" bağlantısı', nf.set && /Gemini API anahtarı/.test(nf.status), nf.status.slice(0, 200));
await p.evaluate(() => document.querySelector('#addMedStatus .vita-set-link').click()); await sleep(600);
const toSet = await p.evaluate(() => ({ tab: state.activeTab, focus: document.activeElement && document.activeElement.id }));
log('"Ayarlar" bağlantısı Ayarlar > Yapay zekâ (API anahtarı) alanına götürür', toSet.tab === 'view-settings' && toSet.focus === 'drawerGeminiApiKeyInput', JSON.stringify(toSet));

/* 4) Kutu fotoğrafı doğrudan yapay zekâya; önceki bulunamayan barkod tanınan ilaçla otomatik eşlenir */
await p.evaluate(() => {
  window.__origKey = window.getGeminiApiKey; window.getGeminiApiKey = () => 'AIzaSyA1b2C3d4E5f6G7h8I9j0K-L_mNoPqRsTu';
  localStorage.setItem(`vita_ai_consent_${activeUserId}`, 'true');
  window.__aiCalls = 0; window.__aiImage = null;
  window.callGeminiWithFallback = async (prompt, base64, mime) => { window.__aiCalls++; window.__aiImage = mime; return { text: JSON.stringify({ urunAdi: 'Arveles 25 mg 20 Film Tablet', etkenMadde: 'Deksketoprofen', form: 'Film Tablet', tur: 'ilac' }) }; };
});
await p.evaluate(code => { openAddMedicationModal(); return lookupAddMedBarcode(code); }, UNKNOWN); await sleep(300);
await p.evaluate(async () => __feed('addMedAiGalleryInput', await __plainPng()));
let ai = null; for (let i = 0; i < 20 && !ai; i++) { await sleep(400); ai = await p.evaluate(() => addMedName.value ? { name: addMedName.value, calls: window.__aiCalls, mime: window.__aiImage, bc: addMedBarcode.value } : null); }
const learned = await p.evaluate(async code => ({ cache: (readVitaBarcodeCache('medication')[code] || {}).urunAdi, again: (await lookupVitaBarcode('medication', code)).item?.urunAdi }), UNKNOWN);
log('"Kutu fotoğrafı yükle" barkod aramadan doğrudan yapay zekâya gider (JPEG)', ai && ai.calls === 1 && ai.mime === 'image/jpeg' && /Arveles/.test(ai.name), JSON.stringify(ai));
log('Hemen önce bulunamayan barkod tanınan ilaçla otomatik eşlenir; bir dahaki sefere doğrudan tanınır', /Arveles/.test(learned.cache) && /Arveles/.test(learned.again) && ai && ai.bc === UNKNOWN, JSON.stringify(learned));
const UNKNOWN_S = await p.evaluate(() => __withCheck('869000054321'));
await p.evaluate(code => { window.callGeminiWithFallback = async () => ({ text: JSON.stringify({ urunAdi: 'Deneme Magnezyum Sitrat', marka: 'Deneme', form: 'Tablet', tur: 'takviye' }) }); openAddSupplementModal(); return handleAddSupBarcodeDecoded(code); }, UNKNOWN_S); await sleep(500);
const sfb = await p.evaluate(() => ({ box: !document.getElementById('addSupFallbackConfirmBox').classList.contains('hidden'), btn: document.getElementById('addSupFallbackConfirmBox').innerText.replace(/\s+/g, ' ') }));
log('Takviye: bulunamayan barkodda "Yapay Zekâ ile Bul" / "Elle yaz" seçenekleri', sfb.box && /Yapay Zekâ ile Bul/.test(sfb.btn) && /Elle yaz/.test(sfb.btn), sfb.btn.slice(0, 160));
await p.evaluate(async () => __feed('addSupAiGalleryInput', await __plainPng()));
let sai = null; for (let i = 0; i < 20 && !sai; i++) { await sleep(400); sai = await p.evaluate(() => manualSupName.value || null); }
const sl = await p.evaluate(code => (readVitaBarcodeCache('supplement')[code] || {}).urunAdi, UNKNOWN_S);
log('Takviye: yapay zekâ ile tanınan ürün bulunamayan barkoda otomatik eşlenir', /Deneme Magnezyum/.test(sai || '') && /Deneme Magnezyum/.test(sl || ''), `${sai} / ${sl}`);
await p.evaluate(() => { window.getGeminiApiKey = window.__origKey; localStorage.removeItem(`vita_ai_consent_${activeUserId}`); closeAddSupplementModal(); });

/* 5) Ayarlar > izinler: mikrofon + engellenmiş bildirim için yönlendirme */
await p.evaluate(() => navigateToView('view-settings')); await sleep(300);
const perm = await p.evaluate(() => ({ mic: !!document.getElementById('settingsMicPermissionRow'), badge: document.getElementById('settingsMicPermBadge')?.innerText, inSection: !!document.querySelector('#settingsSectionNotifications #settingsMicPermissionRow') }));
log('Mikrofon izni bildirim ve kamera ile aynı panelde (rozetiyle)', perm.mic && perm.inSection && /^Mikrofon İzni:/.test(perm.badge), JSON.stringify(perm));
const mic = await p.evaluate(async () => { navigator.mediaDevices.getUserMedia = async c => { window.__micAsked = !!c.audio; return { getTracks: () => [{ stop() { window.__micStopped = true; } }] }; }; return { ok: await VitaPermissions.testMicrophone(), asked: window.__micAsked, stopped: window.__micStopped }; });
log('"Mikrofon İznini Ver" mikrofonu test eder ve hemen kapatır (kayıt yok)', mic.ok && mic.asked && mic.stopped, JSON.stringify(mic));
await p.evaluate(() => toggleBrowserNotifications()); await sleep(400);
const blk = await p.evaluate(() => { const h = document.getElementById('permHelp_notifications'); return { shown: !h.classList.contains('hidden'), text: h.innerText.replace(/\s+/g, ' '), enabled: localStorage.getItem('vitatakip_notifications_enabled') }; });
log('Bildirim izni engelliyken: kilit simgesi adımları ve "İzni Yeniden Doğrula" kartı', blk.shown && /kilit/.test(blk.text) && /İzni Yeniden Doğrula/.test(blk.text) && blk.enabled === 'false', blk.text.slice(0, 160));
await p.evaluate(() => { window.__notifPerm = 'granted'; document.querySelector('#permHelp_notifications [data-perm-recheck]').click(); }); await sleep(400);
const rc = await p.evaluate(() => ({ hidden: document.getElementById('permHelp_notifications').classList.contains('hidden'), enabled: localStorage.getItem('vitatakip_notifications_enabled'), btn: document.getElementById('drawerNotifToggleBtn').innerText.trim() }));
log('"İzni Yeniden Doğrula": izin açıldıysa bildirimler etkinleşir ve kart kapanır', rc.hidden && rc.enabled === 'true' && /Açık/.test(rc.btn), JSON.stringify(rc));

/* 6) Ana sayfa kartları ve Tahliller ızgarası */
await p.evaluate(() => { navigateToView('view-home'); renderDailyTab(); }); await sleep(300);
const hc = await p.evaluate(() => {
  const r = id => document.getElementById(id).getBoundingClientRect();
  const sup = r('btnOpenAddSupplementModal'), med = r('btnOpenAddMedication');
  const supP = document.querySelector('#guideDailyProtocolTarget').parentElement.querySelector('.vcard-sub p').getBoundingClientRect();
  const medP = document.querySelector('#todayMedsTitle').parentElement.querySelector('.vcard-sub p').getBoundingClientRect();
  return { day: document.getElementById('medDayBadge').innerText, expect: new Date().toLocaleDateString('tr-TR', { weekday: 'long' }),
    supRight: sup.left > supP.right - 2 && Math.abs((sup.top + sup.bottom) / 2 - (supP.top + supP.bottom) / 2) < 14,
    medRight: med.left > medP.right - 2 && Math.abs((med.top + med.bottom) / 2 - (medP.top + medP.bottom) / 2) < 14,
    sym: (() => { const sc = document.getElementById('todaySupsCard').getBoundingClientRect(), mc = document.getElementById('todayMedsCard').getBoundingClientRect(); return Math.abs(sup.width - med.width) < 6 && Math.abs((sc.right - sup.right) - (mc.right - med.right)) < 4; })() };
});
log('"Bugünkü ilaçlarım" başlığında da gün rozeti', hc.day === hc.expect, JSON.stringify(hc));
log('"+ Takviye Ekle" ve "+ İlaç Ekle" açıklama metninin sağında, iki kartta simetrik', hc.supRight && hc.medRight && hc.sym, JSON.stringify(hc));
await p.evaluate(() => navigateToView('view-labs')); await sleep(400);
const lab = await p.evaluate(() => { const a = document.getElementById('labCardAlt').getBoundingClientRect(), c = document.getElementById('labCardCrp').getBoundingClientRect(), z = document.getElementById('inputLabZinc').closest('div.bg-slate-50').getBoundingClientRect(); return { altW: Math.round(a.width), zincW: Math.round(z.width), sameRow: Math.abs(a.top - c.top) < 2, crpRight: c.left > a.left }; });
log('Tahliller: ALT kartı diğerleri gibi yarım genişlik, CRP aynı satırda yanında', Math.abs(lab.altW - lab.zincW) < 3 && lab.sameRow && lab.crpRight, JSON.stringify(lab));

const diag = await p.evaluate(() => VitaTakipDiagnostics.run());
const failed = diag.results.filter(r => !r.passed).map(r => r.name);
log(`Uygulama içi tanılama (${diag.passed}/${diag.results.length})`, failed.length === 0, failed.join(', '));
log('Sayfa hatası yok', errs.length === 0, errs.join(' | '));
console.log(`ÖZET ${results.filter(Boolean).length}/${results.length}`);
await b.close();
