/* Bulut hesabını silme (hesap-sil Edge Function üzerinden) + Adım 5 metinleri + profil fotoğrafının buluta gitmemesi.
   Sahte bulut (tests/bulut-sahte.mjs); gerçek Supabase'e bağlanmaz. Çalıştırma: VT_PORT=8090 node tests/bulut-silme.mjs */
import { boot, sleep } from './lib.mjs';
import { fakeCloudPreload } from './bulut-sahte.mjs';

const { b, p, errs } = await boot({ register: false, preload: fakeCloudPreload });
await p.setViewport({ width: 390, height: 844 });
p.setDefaultTimeout(20000);
let dialogs = []; p.on('dialog', d => { dialogs.push(d.message()); d.type() === 'prompt' ? d.accept('SİL') : d.accept(); });
const results = []; const log = (n, ok, d) => { results.push(ok); console.log((ok ? 'OK   ' : 'FAIL ') + n + (d ? ' -> ' + d : '')); };
const fill = (id, v) => p.evaluate((id, v) => { document.getElementById(id).value = v; }, id, v);
const toastText = () => p.evaluate(() => [...document.querySelectorAll('#toastContainer > *, .vita-toast, [id^="toast"]')].map(t => t.innerText.replace(/\s+/g, ' ')).join(' | '));

/* Hazırlık: bulut hesabı + veri */
await p.evaluate(() => { VitaAuthUI.showCloud(); VitaAuthUI.setMode('register'); VitaAuthUI.setKind('username'); });
await fill('cloudInputFullName', 'Silinecek Kisi'); await fill('cloudInputIdentifier', 'silinecek'); await fill('cloudInputPassword', 'sifre1234'); await fill('cloudInputPasswordConfirm', 'sifre1234');
await p.evaluate(() => { cloudConsentCheckbox.checked = true; cloudRememberMeCheckbox.checked = true; });
await p.click('#cloudSubmitBtn'); await sleep(800);
await p.evaluate(() => { try { closeProfileModal(); } catch (e) {} try { finishVitaSpotlightTour(true); } catch (e) {} state.supplements.push({ id: 'd1', name: 'Silinecek D3', timing: 'Sabah', scheduleDays: [] }); saveState(); });
await sleep(2500);
const uid = await p.evaluate(() => activeUserId);
const rows0 = await p.evaluate(uid => window.__db().filter(r => r.user_id === uid).length, uid);

/* 1) Profil fotoğrafı buluta gönderilmez */
const s1 = await p.evaluate(async uid => { window.__calls.length = 0; safeLocalStorageSetItem('vitatakip_avatar_' + uid, 'data:image/webp;base64,AAAA'); await new Promise(r => setTimeout(r, 2200)); return { pending: VitaSync.pendingCount(), ups: window.__calls.filter(c => c[0] === 'upsert').length, inCloud: window.__db().some(r => r.user_id === uid && r.store === 'avatar') }; }, uid);
log('Profil fotoğrafı buluta gönderilmez (cihazda kalır)', s1.pending === 0 && s1.ups === 0 && !s1.inCloud, JSON.stringify(s1));

/* 2) Ayarlar'daki silme açıklaması bulut hesabına göre */
const desc = await p.evaluate(() => document.getElementById('settingsDeleteAccountDesc').textContent);
log('Ayarlar: bulut hesabında silme açıklaması "giriş bilgileri, buluttaki tüm kayıtlar" der', /Bulut hesabınızı tamamen siler/.test(desc), desc);

/* 3) Çevrimdışıyken silinmez */
await p.setOfflineMode(true); await sleep(150);
dialogs = []; await p.evaluate(() => deleteMyAccountData()); await sleep(400);
const s3 = await p.evaluate(uid => ({ uid: activeUserId, local: localStorage.getItem('vitatakip_supplements_' + uid) !== null, cloud: window.__db().filter(r => r.user_id === uid).length, invoked: window.__calls.some(c => c[0] === 'invoke') }), uid);
await p.setOfflineMode(false); await sleep(300);
log('Çevrimdışı: "İnternet Gerekli", hiçbir şey silinmez, onay bile sorulmaz', s3.uid === uid && s3.local && s3.cloud === rows0 && !s3.invoked && dialogs.length === 0, JSON.stringify({ s3, dialogs }));

/* 4) Sunucu silemezse yerel veriye dokunulmaz */
dialogs = []; await p.evaluate(() => { window.__deleteFails = true; return deleteMyAccountData(); }); await sleep(600);
const s4 = await p.evaluate(uid => ({ uid: activeUserId, local: localStorage.getItem('vitatakip_supplements_' + uid) !== null, users: getUsersDb().length, cloud: window.__db().filter(r => r.user_id === uid).length }), uid);
await p.evaluate(() => { window.__deleteFails = false; });
log('Sunucu hatası: "Hesap Silinemedi", oturum ve yerel veri korunur', s4.uid === uid && s4.local && s4.cloud === rows0 && /bulut hesabı TAMAMEN silinecek/.test(dialogs[0] || ''), JSON.stringify({ s4, d: (dialogs[0] || '').slice(0, 70) }));

/* 5) Başarılı silme: sunucuda hesap + satırlar, cihazda tüm anahtarlar; sonrasında buluta istek yok */
dialogs = []; await p.evaluate(() => { window.__calls.length = 0; return deleteMyAccountData(); }); await sleep(2500);
const s5 = await p.evaluate(uid => ({
  uid: activeUserId, cloudRows: window.__db().filter(r => r.user_id === uid).length,
  accountGone: !Object.values(JSON.parse(localStorage.getItem('__fakeUsers') || '{}')).some(u => u.id === uid),
  leftKeys: Object.keys(localStorage).filter(k => k.includes(uid)),
  token: localStorage.getItem('vitatakip-bulut-oturum') || sessionStorage.getItem('vitatakip-bulut-oturum'),
  callsAfter: window.__calls.filter(c => c[0] !== 'invoke').map(c => c[0]),
  authOpen: getComputedStyle(document.getElementById('authModal')).display !== 'none',
  cloudPanel: !document.getElementById('authCloudCard').classList.contains('hidden')
}), uid);
log('Silme: bulut hesabı ve buluttaki tüm satırlar silinir', s5.uid === null && s5.cloudRows === 0 && s5.accountGone, JSON.stringify(s5));
log('Silme: cihazda bu hesaba ait hiçbir anahtar kalmaz (kuyruk/eşitleme kaydı dahil), oturum belirteci silinir', s5.leftKeys.length === 0 && !s5.token, JSON.stringify(s5.leftKeys));
log('Silmeden sonra buluta artık istek gitmez; giriş ekranı bulut paneliyle açılır', s5.callsAfter.length === 0 && s5.authOpen && s5.cloudPanel, JSON.stringify(s5));

/* 6) Silinen hesapla giriş yapılamaz */
await p.evaluate(() => { VitaAuthUI.showCloud(); VitaAuthUI.setMode('login'); });
await fill('cloudInputIdentifier', 'silinecek'); await fill('cloudInputPassword', 'sifre1234'); await p.click('#cloudSubmitBtn'); await sleep(500);
const e6 = await p.evaluate(() => document.getElementById('cloudErrorMsg').textContent);
log('Silinen hesapla giriş: "Takma ad / e-posta veya şifre hatalı."', /hatalı/.test(e6), e6);

/* 7) Metinler: KVKK, ilk açılış onayı, alt bilgi */
const t7 = await p.evaluate(() => ({
  kvkk: document.getElementById('kvkkInfoBody').innerText.replace(/\s+/g, ' '),
  footer: document.querySelector('footer').innerText.replace(/\s+/g, ' '),
  localNote: document.getElementById('authLocalDataNotice').innerText
}));
log('KVKK: iki hesap türü, Frankfurt/AB, RLS, buluta gitmeyenler, silme yolu, otomatik yedek yok, Google Gemini', /Yerel hesap:/.test(t7.kvkk) && /Bulut hesabı/.test(t7.kvkk) && /Frankfurt/.test(t7.kvkk) && /RLS/.test(t7.kvkk) && /profil fotoğrafı/.test(t7.kvkk) && /Hesabımı ve verilerimi sil/.test(t7.kvkk) && /otomatik yedekleme yoktur/.test(t7.kvkk) && /Google Gemini/.test(t7.kvkk) && !/Uygulamanın kendi sunucusu yoktur/.test(t7.kvkk), t7.kvkk.slice(0, 120));
log('Alt bilgi "Önce cihazda · isteğe bağlı bulut"; yerel panel notu "Yerel hesapta …"', /Önce cihazda · isteğe bağlı bulut/.test(t7.footer) && /^Yerel hesapta/.test(t7.localNote.trim()), JSON.stringify({ f: t7.footer.slice(-60), n: t7.localNote.slice(0, 40) }));
const legal = await p.evaluate(async () => { const r = await fetch('./js/legal-onboarding.js'); return r.ok ? await r.text() : ''; });
const bundle = await p.evaluate(async () => (await Promise.all([1, 2, 3, 4].map(i => fetch('./js/app.' + i + '.js').then(r => r.text())))).join('\n'));
log('İlk açılış KVKK kutusu bulut seçeneğini ve Frankfurt\'u anlatır', /isteğe bağlı bulut hesabında/.test(bundle) && /Frankfurt/.test(bundle), legal ? 'kaynak okundu' : 'paketten');

const diag = await p.evaluate(() => VitaTakipDiagnostics.run());
const failed = diag.results.filter(x => !x.passed).map(x => x.name);
log(`Uygulama içi tanılama (${diag.passed}/${diag.results.length})`, failed.length === 0, failed.join(', '));
log('Sayfa hatası yok', errs.length === 0, errs.join(' | '));
console.log(`ÖZET ${results.filter(Boolean).length}/${results.length}`);
await b.close();
