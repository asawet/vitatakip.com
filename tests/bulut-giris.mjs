/* Giriş ekranı — bulut hesabı paneli (js/bulut-giris.js). Gerçek Supabase'e BAĞLANMAZ: VitaCloud.setClientForTests ile
   bellek içi sahte istemci (kayıt, giriş, çıkış, oturum doğrulama). Gerçek proje doğrulaması: tests/manuel/bulut-gercek.mjs
   Çalıştırma: VT_PORT=8090 node tests/bulut-giris.mjs */
import { boot, sleep } from './lib.mjs';

const fakePreload = () => {
  const KEY = 'vitatakip-bulut-oturum';
  const users = JSON.parse(sessionStorage.getItem('__fakeUsers') || localStorage.getItem('__fakeUsers') || '{}');
  const persist = () => { localStorage.setItem('__fakeUsers', JSON.stringify(users)); };
  window.__calls = [];
  const mkSession = u => ({ access_token: 'tok_' + u.id, refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: u.id, email: u.email, user_metadata: u.meta } });
  const fake = {
    auth: {
      async signUp({ email, password, options }) {
        window.__calls.push(['signUp', email, options && options.data]);
        if (users[email]) return { data: { user: null, session: null }, error: { code: 'user_already_exists', status: 422, message: 'User already registered' } };
        const u = { id: crypto.randomUUID(), email, password, meta: (options && options.data) || {} };
        users[email] = u; persist();
        const s = mkSession(u); VitaCloud.authStorage.setItem(KEY, JSON.stringify(s));
        return { data: { user: { ...s.user, identities: [{}] }, session: s }, error: null };
      },
      async signInWithPassword({ email, password }) {
        window.__calls.push(['signIn', email]);
        const u = users[email];
        if (!u || u.password !== password) return { data: { user: null, session: null }, error: { code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' } };
        const s = mkSession(u); VitaCloud.authStorage.setItem(KEY, JSON.stringify(s));
        return { data: { user: s.user, session: s }, error: null };
      },
      async signOut() { window.__calls.push(['signOut']); VitaCloud.authStorage.removeItem(KEY); return { error: null }; },
      async getSession() { const raw = VitaCloud.authStorage.getItem(KEY); return { data: { session: raw ? JSON.parse(raw) : null }, error: null }; },
      async getUser() {
        if (window.__netDown) throw new TypeError('Failed to fetch');
        if (window.__revoked) return { data: { user: null }, error: { status: 403, code: 'session_not_found', message: 'Session not found' } };
        const raw = VitaCloud.authStorage.getItem(KEY); return { data: { user: raw ? JSON.parse(raw).user : null }, error: null };
      }
    }
  };
  // VitaCloud tanımlandığı anda sahte istemci kurulur (açılış, DOMContentLoaded'dan önce çalışır)
  let vc; Object.defineProperty(window, 'VitaCloud', { configurable: true, get: () => vc, set: v => { vc = v; v.setClientForTests(fake); } });
};

const { b, p, errs } = await boot({ register: false, preload: fakePreload });
await p.setViewport({ width: 390, height: 844 });
p.setDefaultTimeout(20000);
p.on('dialog', d => d.accept());
const results = []; const log = (n, ok, d) => { results.push(ok); console.log((ok ? 'OK   ' : 'FAIL ') + n + (d ? ' -> ' + d : '')); };
// Gerçek görünürlük (sınıfa değil hesaplanan stile bakar: .hidden'ı ezen bir CSS kuralını da yakalar)
const vis = id => p.evaluate(id => { const e = document.getElementById(id); return !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden'; }, id);
const msg = () => p.evaluate(() => document.getElementById('cloudErrorMsg').textContent.trim());
const fill = (id, v) => p.evaluate((id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, id, v);
const submit = async () => { await p.click('#cloudSubmitBtn'); await sleep(500); };
// Giriş ↔ kayıt: formun altındaki bağlantı (data-cloud-mode = gideceği mod)
const toMode = async m => { if ((await p.evaluate(() => cloudModeToggle.getAttribute('data-cloud-mode'))) === m) await p.click('#cloudModeToggle'); await sleep(150); };

/* 1) Yeni cihaz: bulut paneli açılır */
const s1 = { cloud: await vis('authCloudCard'), local: await vis('authLocalMethodCard'), note: await vis('authCloudDataNotice'), localNote: await vis('authLocalDataNotice'), sub: await p.evaluate(() => authSubtitle.textContent), label: await p.evaluate(() => cloudIdentifierLabel.textContent) };
s1.tabs = await p.evaluate(() => [...document.querySelectorAll('#authCloudCard [role=tab]')].map(t => t.textContent.trim() + ':' + t.getAttribute('aria-selected')).join(','));
s1.links = (await vis('cloudForgotBtn')) && (await vis('cloudModeToggle')) && (await p.evaluate(() => cloudModeToggle.textContent.trim()));
log('Yeni cihazda bulut paneli: üstte Hasta | Doktor sekmeleri, "Hasta girişi", tek kutu, altta Şifremi unuttum / Hesap oluştur', s1.cloud && !s1.local && s1.note && !s1.localNote && s1.sub === 'Hasta girişi' && s1.label === 'E-posta veya takma ad' && s1.tabs === 'Hasta:true,Doktor:false' && s1.links === 'Hesap oluştur', JSON.stringify(s1));
const s1h = { warn: await vis('cloudUsernameWarning'), consent: await vis('cloudConsentRow'), name: await vis('cloudFullNameField'), confirm: await vis('cloudConfirmField'), hint: await vis('cloudIdentifierHint'), err: await vis('cloudErrorMsg') };
log('Girişte kayıt alanları gerçekten gizli (uyarı, açık rıza, ad, şifre tekrar)', Object.values(s1h).every(v => v === false), JSON.stringify(s1h));

/* 1b) Bulut panelindeki simgeler çizilir (Font Awesome alt kümesinde tanımlı; boş/bozuk glif yok) */
const icons = await p.evaluate(() => [...document.querySelectorAll('#authCloudCard i[class*="fa-"], #authCloudDataNotice i[class*="fa-"], #authLocalMethodCard i.fa-cloud')].map(i => {
  const c = getComputedStyle(i, '::before').content; const cls = [...i.classList].find(x => x.startsWith('fa-') && x !== 'fa-solid');
  return { cls, ok: c && c !== 'none' && c !== '""' && c.replace(/"/g, '').trim().length === 1 && c.charCodeAt(1) > 32 };
}));
const badIcons = icons.filter(x => !x.ok).map(x => x.cls);
log('Bulut paneli simgeleri çizilir (' + icons.length + ' simge)', icons.length >= 8 && badIcons.length === 0, badIcons.join(', '));

/* 2) Kayıt sekmesi alanları */
await toMode('register');
const s2 = { name: await vis('cloudFullNameField'), confirm: await vis('cloudConfirmField'), consent: await vis('cloudConsentRow'), hint: await vis('cloudIdentifierHint'), warn: await vis('cloudUsernameWarning'), forgot: await vis('cloudForgotBtn'), sub: await p.evaluate(() => authSubtitle.textContent), back: await p.evaluate(() => cloudModeToggle.textContent.trim()), btn: await p.evaluate(() => cloudSubmitBtn.textContent.trim()) };
await fill('cloudInputIdentifier', 'ayse_k');
const s2u = { warn: await vis('cloudUsernameWarning'), icon: await p.evaluate(() => cloudIdentifierIcon.className) };
await fill('cloudInputIdentifier', 'ayse@ornek.com');
const s2e = { warn: await vis('cloudUsernameWarning'), icon: await p.evaluate(() => cloudIdentifierIcon.className), hint: await vis('cloudIdentifierHint') };
await fill('cloudInputIdentifier', '');
log('Kayıt: ad soyad, şifre tekrar, açık rıza, "Hesap Oluştur"; geri dönüş bağlantısı; Şifremi unuttum gizli', s2.name && s2.confirm && s2.consent && s2.hint && !s2.forgot && s2.sub === 'Hasta hesabı oluşturun' && /Giriş yap/.test(s2.back) && s2.btn === 'Hesap Oluştur', JSON.stringify(s2));
log('Tür yazılandan anlaşılır: takma adda kural + şifre uyarısı; "@" yazınca e-posta (uyarı yok)', !s2.warn && s2u.warn && /fa-at/.test(s2u.icon) && !s2e.warn && !s2e.hint && /fa-envelope/.test(s2e.icon), JSON.stringify({ s2u, s2e }));

/* 3) Doğrulama hataları (sunucuya gitmeden) */
await fill('cloudInputFullName', 'Ayşe Bulut'); await fill('cloudInputIdentifier', 'Ayşe K'); await fill('cloudInputPassword', 'sifre1234'); await fill('cloudInputPasswordConfirm', 'sifre1234');
await submit(); const e1 = await msg();
await fill('cloudInputIdentifier', 'ayse_bulut'); await fill('cloudInputPasswordConfirm', 'farkli123');
await submit(); const e2 = await msg();
await fill('cloudInputPasswordConfirm', 'sifre1234');
await submit(); const e3 = await msg();
const calls0 = await p.evaluate(() => window.__calls.length);
log('Geçersiz takma ad, eşleşmeyen şifre ve açık rıza eksikliği sunucuya gitmeden reddedilir', /Türkçe karakter/.test(e1) && /eşleşmiyor/.test(e2) && /açık rıza/.test(e3) && calls0 === 0, JSON.stringify({ e1, e2, e3, calls0 }));

/* 4) Takma adla kayıt ("Beni hatırla" kapalı) */
await p.evaluate(() => { cloudConsentCheckbox.checked = true; cloudRememberMeCheckbox.checked = false; });
await submit(); await sleep(400);
const s4 = await p.evaluate(() => ({
  uid: activeUserId, authOpen: getComputedStyle(document.getElementById('authModal')).display !== 'none',
  profileOpen: !document.getElementById('profileModal')?.classList.contains('hidden'), name: state.user && state.user.name,
  tokSession: sessionStorage.getItem('vitatakip-bulut-oturum') !== null, tokLocal: localStorage.getItem('vitatakip-bulut-oturum') !== null,
  activeLocal: localStorage.getItem('vitatakip_active_session_id'), call: window.__calls.find(c => c[0] === 'signUp'),
  saved: localStorage.getItem('vitatakip_user_' + activeUserId) !== null
}));
log('Takma adla kayıt: uuid oturum, ekran kapanır, profil adımı açılır, ad kaydedilir', VitaUuid(s4.uid) && !s4.authOpen && s4.profileOpen && s4.name === 'Ayşe Bulut' && s4.saved, JSON.stringify(s4));
log('Sunucuya takma ad adresi, ad soyad ve açık rıza zamanı gider', s4.call && s4.call[1] === 'ayse_bulut@hesap.vitatakip.com.tr' && s4.call[2].full_name === 'Ayşe Bulut' && s4.call[2].username === 'ayse_bulut' && /^\d{4}-\d\d-\d\dT/.test(s4.call[2].consent_at), JSON.stringify(s4.call));
log('"Beni hatırla" kapalı: oturum yalnız bu sekmede', s4.tokSession && !s4.tokLocal && s4.activeLocal === null, JSON.stringify(s4));
const uid = s4.uid;
await p.evaluate(() => { try { closeProfileModal(); } catch (e) {} try { finishVitaSpotlightTour(true); } catch (e) {} });

/* 5) Başka sekmede yerel hesap listesi değişse de bulut oturumu kapanmaz */
await p.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'vitatakip_users_db' }))); await sleep(200);
log('Başka sekmede yerel hesap listesi değişince bulut oturumu kapanmaz', (await p.evaluate(() => activeUserId)) === uid);

/* 6) Çıkış */
await p.evaluate(() => handleLogout()); await sleep(400);
const s6 = await p.evaluate(() => ({ uid: activeUserId, signOut: window.__calls.some(c => c[0] === 'signOut'), tok: sessionStorage.getItem('vitatakip-bulut-oturum') || localStorage.getItem('vitatakip-bulut-oturum') }));
const s6v = { cloud: await vis('authCloudCard'), local: await vis('authLocalMethodCard') };
log('Çıkış: bulut oturumu kapanır, belirteç silinir, ekran bulut paneliyle açılır', s6.uid === null && s6.signOut && !s6.tok && s6v.cloud && !s6v.local, JSON.stringify({ s6, s6v }));

/* 7) Giriş: yanlış şifre, sonra büyük harfli takma ad + doğru şifre ("Beni hatırla" açık) */
await toMode('login');
await fill('cloudInputIdentifier', 'AYSE_BULUT'); await fill('cloudInputPassword', 'yanlis999'); await submit();
const e7 = await msg();
await fill('cloudInputPassword', 'sifre1234'); await p.evaluate(() => { cloudRememberMeCheckbox.checked = true; }); await submit(); await sleep(400);
const s7 = await p.evaluate(() => ({ uid: activeUserId, name: state.user && state.user.name, tokLocal: localStorage.getItem('vitatakip-bulut-oturum') !== null, tokSession: sessionStorage.getItem('vitatakip-bulut-oturum') !== null, active: localStorage.getItem('vitatakip_active_session_id') }));
log('Yanlış şifre → "Takma ad / e-posta veya şifre hatalı."', e7 === 'Takma ad / e-posta veya şifre hatalı.', e7);
log('Büyük harfli takma adla giriş: aynı hesap, veriler (ad) cihazdan yüklenir', s7.uid === uid && s7.name === 'Ayşe Bulut', JSON.stringify(s7));
// Oturum sekme başınadır (sessionStorage); "Beni hatırla" açıkken ayrıca kalıcı kopya tutulur (js/bulut.js authStorage, tests/coklu-sekme.mjs)
log('"Beni hatırla" açık: oturum bu sekmede + kalıcı kopya', s7.tokLocal && s7.tokSession && s7.active === uid, JSON.stringify(s7));

/* 8) Sayfa yenilenince oturum geri gelir (ağ isteği gerekmeden) */
await p.reload({ waitUntil: 'networkidle2' }); await sleep(1500);
const s8 = await p.evaluate(() => ({ uid: activeUserId, authOpen: getComputedStyle(document.getElementById('authModal')).display !== 'none', name: state.user && state.user.name }));
log('Yenilemede bulut oturumu geri yüklenir (giriş ekranı açılmaz)', s8.uid === uid && !s8.authOpen && s8.name === 'Ayşe Bulut', JSON.stringify(s8));

/* 9) Arka plan doğrulaması: ağ hatası oturumu kapatmaz; iptal edilmiş oturum güvenli çıkış yapar */
await p.evaluate(async uid => { window.__netDown = true; await VitaAuthUI.verifySessionInBackground(uid); window.__netDown = false; }, uid);
const s9a = await p.evaluate(() => activeUserId);
await p.evaluate(async uid => { window.__revoked = true; await VitaAuthUI.verifySessionInBackground(uid); window.__revoked = false; }, uid); await sleep(200);
const s9b = { uid: await p.evaluate(() => activeUserId), cloud: await vis('authCloudCard'), msg: await msg(), keptData: await p.evaluate(uid => localStorage.getItem('vitatakip_user_' + uid) !== null, uid) };
log('Ağ hatasında oturum açık kalır (çevrimdışı çalışma)', s9a === uid, String(s9a));
log('Sunucuda iptal edilmiş oturum: güvenli çıkış, açıklama, cihazdaki veri silinmez', s9b.uid === null && s9b.cloud && /Oturumunuz sona erdi/.test(s9b.msg) && s9b.keptData, JSON.stringify(s9b));

/* 10) E-postayla kayıt; aynı e-postayla ikinci kayıt reddedilir */
await toMode('register');
await fill('cloudInputFullName', 'Bora Eposta'); await fill('cloudInputIdentifier', 'Bora@Ornek.com'); await fill('cloudInputPassword', 'sifre5678'); await fill('cloudInputPasswordConfirm', 'sifre5678');
await p.evaluate(() => { cloudConsentCheckbox.checked = true; }); await submit(); await sleep(300);
const s10 = await p.evaluate(() => ({ uid: activeUserId, email: (window.__calls.filter(c => c[0] === 'signUp').pop() || [])[1] }));
await p.evaluate(() => { try { closeProfileModal(); } catch (e) {} handleLogout(); }); await sleep(300);
await toMode('register');
await fill('cloudInputFullName', 'Kopya Kişi'); await fill('cloudInputIdentifier', 'bora@ornek.com'); await fill('cloudInputPassword', 'sifre5678'); await fill('cloudInputPasswordConfirm', 'sifre5678');
await p.evaluate(() => { cloudConsentCheckbox.checked = true; }); await submit();
const e10 = await msg();
log('E-postayla kayıt (küçük harfe çevrilir); aynı e-postayla ikinci kayıt Türkçe hatayla reddedilir', VitaUuid(s10.uid) && s10.uid !== uid && s10.email === 'bora@ornek.com' && /zaten var/.test(e10), JSON.stringify({ s10, e10 }));

/* 11) Yerel hesap kaldırıldı (2026-11-28): düğme yok; eski kayıt/tercih olsa da giriş ekranı hesap paneliyle açılır */
const s11 = { btn: await p.evaluate(() => !!document.getElementById('authShowLocalBtn')) };
await p.evaluate(() => { safeLocalStorageSetItem('vitatakip_auth_panel', 'local'); safeLocalStorageSetItem('vitatakip_users_db', JSON.stringify([{ id: 'usr_1_x', fullName: 'Yerel Kişi', password: 'x' }])); openAuthModal(); }); await sleep(100);
s11.cloud = await vis('authCloudCard'); s11.local = await vis('authLocalMethodCard');
log('"Yerel hesap" seçeneği yok; cihazda eski yerel kayıt olsa da giriş ekranı hesap paneliyle açılır', !s11.btn && s11.cloud && !s11.local, JSON.stringify(s11));

/* 12) Koyu tema + dar ekranda kayıt formu taşmaz */
await p.evaluate(() => { VitaTheme.set('dark'); VitaAuthUI.showCloud(); VitaAuthUI.setMode('register'); }); await sleep(200);
const s12 = await p.evaluate(() => { const c = document.querySelector('#authModal .vta-card'); return { sw: document.scrollingElement.scrollWidth, iw: innerWidth, cardW: c.getBoundingClientRect().width }; });
if (process.env.VT_SHOTS) await p.screenshot({ path: process.env.VT_SHOTS + '/bulut-kayit-koyu.png', fullPage: true });
await p.evaluate(() => VitaTheme.set('light'));
log('Kayıt formu dar ekranda yatay taşmaz', s12.sw <= s12.iw + 1, JSON.stringify(s12));

const ext = await p.evaluate(() => performance.getEntriesByType('resource').map(r => r.name).filter(u => !u.startsWith(location.origin)));
log('Sahte istemciyle hiçbir dış adrese istek gitmez', ext.length === 0, ext.join(', '));
log('Sayfa hatası yok', errs.length === 0, errs.join(' | '));
console.log(`ÖZET ${results.filter(Boolean).length}/${results.length}`);
await b.close();

function VitaUuid(x) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(x || '')); }
