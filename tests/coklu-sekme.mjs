/* Aynı tarayıcıda birden çok sekme, farklı bulut hesapları (videodaki hata: son giriş yapılan hesap diğer sekmelerin
   isteklerini ele geçiriyordu). Sekmeler localStorage'ı paylaşır, sessionStorage'ı paylaşmaz (gerçek tarayıcı gibi).
   Beklenen: her sekme kendi hesabıyla çalışır; yeni sekme son "hatırlanan" hesapla açılır; oturum bir şekilde başka
   hesaba kayarsa istek yapılmaz, güvenli çıkış olur; doktor hesabına yerel (hasta) verisi taşıma sorusu sorulmaz.
   Çalıştırma: VT_PORT=8090 node tests/coklu-sekme.mjs */
import { boot, sleep } from './lib.mjs';
import { fakeCloudPreload } from './bulut-sahte.mjs';

const URL = 'http://localhost:' + (process.env.VT_PORT || 8080) + '/index.html';
const { b, p: A, errs } = await boot({ preload: fakeCloudPreload }); // yerel hesap "Test Kullanici" açılır
await A.setViewport({ width: 390, height: 844 });
A.on('dialog', d => d.accept()); A.setDefaultTimeout(20000);
const results = []; const log = (n, ok, d) => { results.push(ok); console.log((ok ? 'OK   ' : 'FAIL ') + n + (d ? ' -> ' + d : '')); };
const KEY = 'vitatakip-bulut-oturum';
const fill = (pg, id, v) => pg.evaluate((id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, id, v);
const close = pg => pg.evaluate(() => { try { closeProfileModal(); } catch (e) {} try { finishVitaSpotlightTour(true); } catch (e) {} });
async function signup(pg, acct, name, id, pass) {
  await pg.evaluate(a => { openAuthModal(); VitaAuthUI.showCloud(); VitaAuthUI.setAcct(a); VitaAuthUI.setMode('register'); }, acct);
  await fill(pg, 'cloudInputFullName', name); await fill(pg, 'cloudInputIdentifier', id); await fill(pg, 'cloudInputPassword', pass); await fill(pg, 'cloudInputPasswordConfirm', pass);
  await pg.evaluate(a => { if (a === 'doctor') cloudDoctorConsentCheckbox.checked = true; else cloudConsentCheckbox.checked = true; cloudRememberMeCheckbox.checked = true; }, acct);
  await pg.evaluate(() => document.getElementById('cloudSubmitBtn').click()); await sleep(1500); await close(pg);
  return pg.evaluate(() => activeUserId);
}
async function newTab() {
  const pg = await b.newPage(); await pg.setViewport({ width: 390, height: 844 });
  pg.on('pageerror', e => errs.push('PAGEERR(yeni sekme) ' + e.message)); pg.on('dialog', d => d.accept());
  await pg.evaluateOnNewDocument(() => { localStorage.setItem('vitatakip_legal_accepted', 'true'); });
  await pg.evaluateOnNewDocument(fakeCloudPreload);
  await pg.goto(URL, { waitUntil: 'networkidle2' }); await sleep(2500);
  return pg;
}
const who = pg => pg.evaluate(async () => {
  const c = await VitaCloud.getClient().catch(e => null);
  const r = c ? await c.rpc('my_profile') : null;
  const prof = r && r.data && r.data[0];
  return { app: activeUserId, session: VitaCloud.storedUserId(), server: prof ? prof.id : null, type: prof ? prof.account_type : null };
});

/* 0) Yerel hesapta veri var (taşıma adayı), sonra çıkış */
await A.evaluate(() => { state.supplements.push({ id: 'yerel1', name: 'Yerel Takviye', timing: 'Sabah', scheduleTime: '08:00', scheduleDays: [] }); saveState(); });
await A.evaluate(() => handleLogout()); await sleep(400);

/* 1) Sekme A: hasta Pelin ("Beni hatırla" açık) */
const pelin = await signup(A, 'patient', 'Pelin Hasta', 'pelin', 'hasta11');
await sleep(2500);
const migA = await A.evaluate(() => !!document.getElementById('vtMigrateModal'));
await A.evaluate(() => { if (window.VitaMigrate) VitaMigrate.close(); });
log('Hasta hesabında yerel veriyi taşıma sorusu çıkar (beklenen)', !!pelin && migA, String(pelin));

/* 2) Sekme B açılır: son hatırlanan hesapla (Pelin) başlar; B'de çıkış A'yı etkilemez */
const B = await newTab();
const b2 = await who(B);
log('Yeni sekme hatırlanan hesapla açılır (Pelin)', !!pelin && b2.app === pelin && b2.session === pelin && b2.server === pelin, JSON.stringify(b2));
// B, A ile AYNI sunucu oturumunu paylaşıyor (hatırlanan kopya): B'de çıkış oturumu kapatır → A da açıklamayla çıkar
await B.evaluate(() => handleLogout()); await sleep(800);
const a2 = await A.evaluate(() => ({ app: activeUserId, auth: getComputedStyle(document.getElementById('authModal')).display !== 'none', msg: document.getElementById('cloudErrorMsg').textContent }));
log('Aynı oturumu paylaşan B’de çıkış: A da giriş ekranına döner ve nedenini söyler', !!pelin && a2.app === null && a2.auth && /başka bir sekmede çıkış yapıldı/.test(a2.msg), JSON.stringify(a2));
// A, Pelin olarak yeniden girer (ayrı oturum)
await A.evaluate(() => { VitaAuthUI.showCloud(); VitaAuthUI.setMode('login'); });
await fill(A, 'cloudInputIdentifier', 'pelin'); await fill(A, 'cloudInputPassword', 'hasta11');
await A.evaluate(() => { cloudRememberMeCheckbox.checked = true; document.getElementById('cloudSubmitBtn').click(); }); await sleep(1500); await close(A);
await A.evaluate(() => { try { VitaMigrate.close(); } catch (e) {} });
const a2b = await who(A);
log('A yeniden Pelin olarak girer', a2b.app === pelin && a2b.server === pelin, JSON.stringify(a2b));

/* 3) Sekme B: doktor Ali ("Beni hatırla" açık) → doktora taşıma sorusu YOK */
const ali = await signup(B, 'doctor', 'Dr. Ali Er', 'dr_ali', 'doktor1');
await sleep(3000);
const migB = await B.evaluate(() => ({ modal: !!document.getElementById('vtMigrateModal'), row: !document.getElementById('settingsCloudImportRow').classList.contains('hidden') }));
log('Doktor hesabında yerel (hasta) verisi taşıma sorusu ve Ayarlar satırı çıkmaz', !migB.modal && !migB.row, JSON.stringify(migB));

/* 4) Asıl hata: B'de doktor girişinden sonra A hâlâ Pelin adına çalışır */
await A.bringToFront();
const a4 = await who(A);
log('A sekmesi Pelin olarak kalır; sunucuya giden kimlik Pelin (doktor değil)', a4.app === pelin && a4.session === pelin && a4.server === pelin && a4.type === 'patient', JSON.stringify(a4));
await A.evaluate(() => { state.supplements.push({ id: 'b12', name: 'B12 Vitamini', timing: 'Sabah', scheduleTime: '08:00', scheduleDays: [] }); saveState(); });
await A.evaluate(() => VitaSync.flush()); await sleep(1500);
const a4db = await A.evaluate(id => { const r = window.__db().find(x => x.user_id === id && x.store === 'supplements'); return r ? JSON.stringify(r.data) : ''; }, pelin);
log('A sekmesinde eklenen takviye Pelin hesabına eşitlenir (videoda doktor göremiyordu)', /B12 Vitamini/.test(a4db), a4db.slice(0, 120));
await B.bringToFront();
const b4 = await who(B);
log('B sekmesi doktor Ali olarak çalışır', b4.app === ali && b4.server === ali && b4.type === 'doctor', JSON.stringify(b4));

/* 5) Üçüncü sekme: son hatırlanan hesap (Ali) ile açılır; uygulama ve oturum aynı kişi */
const C = await newTab();
const c5 = await who(C);
log('Yeni sekme son hatırlanan hesapla (Ali) açılır; uygulama = oturum', c5.app === ali && c5.session === ali && c5.server === ali, JSON.stringify(c5));
await C.close();

/* 6) Güvenlik ağı: A'nın oturumu bir şekilde başka hesaba kayarsa istek yapılmaz, A güvenli çıkış yapar, B etkilenmez */
await A.bringToFront();
await A.evaluate(k => { sessionStorage.setItem(k, localStorage.getItem(k)); }, KEY); // A'ya Ali'nin belirteci (eski sürümdeki durum)
const a6 = await A.evaluate(async () => { try { await VitaCloud.getClient(); return 'İSTEK YAPILDI'; } catch (e) { return e.code; } });
await sleep(600);
const a6b = await A.evaluate(() => ({ app: activeUserId, auth: getComputedStyle(document.getElementById('authModal')).display !== 'none', msg: document.getElementById('cloudErrorMsg').textContent }));
log('Kimlik uyuşmazlığında istek yapılmaz ("identity_mismatch")', a6 === 'identity_mismatch', a6);
log('A sekmesi güvenli çıkış yapar, açıklama gösterir; yerel veri silinmez', a6b.app === null && a6b.auth && /başka bir hesapla değişti/.test(a6b.msg) && (await A.evaluate(id => localStorage.getItem('vitatakip_user_' + id) !== null, pelin)), JSON.stringify(a6b));
const b6 = await who(B);
log('B sekmesindeki doktor oturumu kapanmaz', b6.app === ali && b6.server === ali, JSON.stringify(b6));

/* 6b) Ayrı girişli sekmeler birbirini etkilemez: D sekmesinde Ali yeniden (ayrı oturumla) girip çıkarsa B açık kalır */
const loginAs = async (pg, id, pass, remember) => {
  await pg.evaluate(() => { openAuthModal(); VitaAuthUI.showCloud(); VitaAuthUI.setMode('login'); });
  await fill(pg, 'cloudInputIdentifier', id); await fill(pg, 'cloudInputPassword', pass);
  await pg.evaluate(r => { cloudRememberMeCheckbox.checked = r; document.getElementById('cloudSubmitBtn').click(); }, remember); await sleep(1500); await close(pg);
};
await B.evaluate(() => handleLogout()); await sleep(500);
await loginAs(B, 'dr_ali', 'doktor1', true); // hatırlanan kopya = B'nin oturumu
const D = await newTab();
const d6 = await who(D);
await D.evaluate(() => handleLogout()); await sleep(600); // D, B ile aynı (hatırlanan) oturumu paylaşıyordu → B de çıkar
const b6c = await B.evaluate(() => activeUserId);
log('Hatırlanan oturumu paylaşan D’de çıkış B’yi de çıkarır (aynı sunucu oturumu)', d6.app === ali && b6c === null, JSON.stringify({ d6: d6.app, b6c }));
await loginAs(B, 'dr_ali', 'doktor1', false); // ayrı oturum
await loginAs(D, 'dr_ali', 'doktor1', false); // ayrı oturum
await D.evaluate(() => handleLogout()); await sleep(600);
const b6d = await who(B);
log('Ayrı girişli iki sekmeden birinde çıkış diğerini etkilemez', b6d.app === ali && b6d.server === ali, JSON.stringify(b6d));
await D.close();

/* 7) Aynı hesabın başka sekmede yenilenmiş belirteci kullanılır (yenileme belirteci çakışmasın) */
const b7 = await B.evaluate(k => {
  const s = JSON.parse(sessionStorage.getItem(k)); const fresh = { ...s, access_token: 'yeni', expires_at: s.expires_at + 1000 };
  localStorage.setItem(k, JSON.stringify(fresh));
  const got = JSON.parse(VitaCloud.authStorage.getItem(k));
  return { used: got.access_token, copied: JSON.parse(sessionStorage.getItem(k)).access_token };
}, KEY);
log('Aynı hesabın daha yeni belirteci (başka sekmeden) benimsenir', b7.used === 'yeni' && b7.copied === 'yeni', JSON.stringify(b7));
const b7b = await B.evaluate(k => {
  const other = { access_token: 'baskasi', refresh_token: 'r', expires_at: 9e12, user: { id: '00000000-0000-4000-8000-000000000000' } };
  localStorage.setItem(k, JSON.stringify(other));
  return JSON.parse(VitaCloud.authStorage.getItem(k)).user.id;
}, KEY);
log('Başka hesabın (daha yeni de olsa) belirteci bu sekmeye geçmez', b7b === ali, b7b);

log('Sayfa hatası yok', errs.length === 0, errs.join(' | '));
console.log(`ÖZET ${results.filter(Boolean).length}/${results.length}`);
await b.close();
