/* Doktor paneli 2. adım: kayıt ekranında "Hasta / Doktor" hesap türü, hekim taahhüdü, doktor kodu bildirimi, profil önbelleği.
   Sahte bulut (tests/bulut-sahte.mjs). Çalıştırma: VT_PORT=8090 node tests/doktor-hesap.mjs */
import { boot, sleep } from './lib.mjs';
import { fakeCloudPreload } from './bulut-sahte.mjs';

const { b, p, errs } = await boot({ register: false, preload: fakeCloudPreload });
await p.setViewport({ width: 390, height: 844 });
p.setDefaultTimeout(20000);
p.on('dialog', d => d.accept());
const results = []; const log = (n, ok, d) => { results.push(ok); console.log((ok ? 'OK   ' : 'FAIL ') + n + (d ? ' -> ' + d : '')); };
const vis = id => p.evaluate(id => { const e = document.getElementById(id); return !!e && e.getClientRects().length > 0; }, id);
const fill = (id, v) => p.evaluate((id, v) => { document.getElementById(id).value = v; }, id, v);
const msg = () => p.evaluate(() => document.getElementById('cloudErrorMsg').textContent.trim());
const toasts = () => p.evaluate(() => document.body.innerText);

/* 1) Kayıt formu: hesap türü; varsayılan Hasta */
await p.evaluate(() => { VitaAuthUI.showCloud(); VitaAuthUI.setMode('register'); });
const s1 = { row: (await vis('cloudTabPatient')) && (await vis('cloudTabDoctor')), consent: await vis('cloudConsentRow'), dinfo: await vis('cloudDoctorInfo'), dpledge: await vis('cloudDoctorConsentRow'), sel: await p.evaluate(() => cloudTabPatient.getAttribute('aria-selected')), local: await vis('authShowLocalBtn') };
log('Üstte "Hasta | Doktor" sekmeleri; varsayılan Hasta, sağlık verisi açık rızası ve yerel hesap seçeneği görünür', s1.row && s1.consent && !s1.dinfo && !s1.dpledge && s1.sel === 'true' && s1.local, JSON.stringify(s1));

/* 2) Doktor seçilince: onay bilgisi + hekim taahhüdü, hasta açık rızası gizli */
await p.click('[data-cloud-acct="doctor"]'); await sleep(100);
const s2 = { sub: await p.evaluate(() => authSubtitle.textContent), local: await vis('authShowLocalBtn'), sel: await p.evaluate(() => cloudTabDoctor.getAttribute('aria-selected')), consent: await vis('cloudConsentRow'), dinfo: await vis('cloudDoctorInfo'), dpledge: await vis('cloudDoctorConsentRow'), ph: await p.evaluate(() => cloudInputFullName.placeholder), info: await p.evaluate(() => cloudDoctorInfo.innerText) };
log('Doktor sekmesi: "Doktor hesabı oluşturun", onay bilgisi + hekim taahhüdü; hasta açık rızası ve yerel hesap gizli', s2.sub === 'Doktor hesabı oluşturun' && s2.sel === 'true' && !s2.local && !s2.consent && s2.dinfo && s2.dpledge && /Dr\./.test(s2.ph) && /onay bekliyor/.test(s2.info), JSON.stringify(s2));
if (process.env.VT_SHOTS) await p.screenshot({ path: process.env.VT_SHOTS + '/doktor-kayit.png', fullPage: false });

/* 3) Taahhüt olmadan doktor kaydı reddedilir */
await fill('cloudInputFullName', 'Dr. Deniz Ak'); await fill('cloudInputIdentifier', 'dr_deniz'); await fill('cloudInputPassword', 'doktor123'); await fill('cloudInputPasswordConfirm', 'doktor123');
await p.click('#cloudSubmitBtn'); await sleep(300);
const e3 = await msg();
log('Taahhüt işaretlenmeden doktor kaydı yapılmaz', /hekim taahhüdünü/.test(e3) && (await p.evaluate(() => window.__calls.filter(c => c[0] === 'signUp').length)) === 0, e3);

/* 4) Doktor kaydı: hesap türü sunucuya gider, profil adımı açılmaz, doktor kodu bildirilir, profil saklanır */
await p.evaluate(() => { cloudDoctorConsentCheckbox.checked = true; });
await p.click('#cloudSubmitBtn'); await sleep(1500);
const s4 = await p.evaluate(() => ({
  uid: activeUserId, meta: (window.__calls.find(c => c[0] === 'signUp') || [])[2],
  profileModal: !document.getElementById('profileModal').classList.contains('hidden'),
  cache: JSON.parse(localStorage.getItem('vitatakip_bulut_profil_' + activeUserId) || 'null')
}));
const t4 = await toasts();
log('Doktor kaydı: account_type=doctor ve taahhüt zamanı sunucuya gider (hasta açık rızası yok)', s4.meta && s4.meta.account_type === 'doctor' && /^\d{4}-/.test(s4.meta.doctor_pledge_at || '') && !s4.meta.consent_at, JSON.stringify(s4.meta));
log('Doktorda hastaya özgü profil adımı açılmaz; "Doktor kodunuz: DR-…, onay bekliyor" bildirimi', !s4.profileModal && /Doktor kodunuz: DR-\d+/.test(t4) && /onay bekliyor/.test(t4), JSON.stringify({ profileModal: s4.profileModal }));
log('Profil (hesap türü, kod, onay) cihazda saklanır', s4.cache && s4.cache.account_type === 'doctor' && /^DR-\d+$/.test(s4.cache.doctor_code) && s4.cache.doctor_verified === false, JSON.stringify(s4.cache));

/* 5) Hasta kaydı: hesap türü gönderilmez, profil adımı açılır */
await p.evaluate(() => handleLogout()); await sleep(300);
await p.evaluate(() => { VitaAuthUI.showCloud(); VitaAuthUI.setMode('register'); VitaAuthUI.setAcct('patient'); });
await fill('cloudInputFullName', 'Hasta Pelin'); await fill('cloudInputIdentifier', 'hasta_pelin'); await fill('cloudInputPassword', 'hasta1234'); await fill('cloudInputPasswordConfirm', 'hasta1234');
await p.evaluate(() => { cloudConsentCheckbox.checked = true; });
await p.click('#cloudSubmitBtn'); await sleep(1500);
const s5 = await p.evaluate(() => ({ meta: (window.__calls.filter(c => c[0] === 'signUp').pop() || [])[2], profileModal: !document.getElementById('profileModal').classList.contains('hidden'), cache: JSON.parse(localStorage.getItem('vitatakip_bulut_profil_' + activeUserId) || 'null') }));
log('Hasta kaydı: account_type gönderilmez (hasta), açık rıza zamanı gider, profil adımı açılır', s5.meta && !s5.meta.account_type && /^\d{4}-/.test(s5.meta.consent_at || '') && s5.profileModal && s5.cache && s5.cache.account_type === 'patient', JSON.stringify(s5));

/* 6) Giriş sekmesinde hesap türü seçimi görünmez; doktor tekrar girince profil tazelenir (onaylandıysa) */
await p.evaluate(() => { try { closeProfileModal(); } catch (e) {} handleLogout(); }); await sleep(300);
await p.evaluate(() => { VitaAuthUI.showCloud(); VitaAuthUI.setMode('login'); });
await p.click('#cloudTabDoctor'); await sleep(100);
const s6row = { row: await vis('cloudTabDoctor'), sub: await p.evaluate(() => authSubtitle.textContent), dinfo: await vis('cloudDoctorInfo'), dpledge: await vis('cloudDoctorConsentRow'), name: await vis('cloudFullNameField') };
await p.click('#cloudForgotBtn'); await sleep(150);
const forgot = { reset: await vis('authResetCard'), sub: await p.evaluate(() => authSubtitle.textContent) };
await p.click('#resetBackBtn'); await sleep(150);
forgot.back = await vis('authCloudCard');
await p.evaluate(uid => { window.__verifiedDoctors = [uid]; }, s4.uid);
await fill('cloudInputIdentifier', 'dr_deniz'); await fill('cloudInputPassword', 'doktor123'); await p.click('#cloudSubmitBtn'); await sleep(1500);
const s6 = await p.evaluate(() => JSON.parse(localStorage.getItem('vitatakip_bulut_profil_' + activeUserId) || 'null'));
log('Girişte de sekmeler görünür ("Doktor girişi"); doktor kayıt alanları gizli', s6row.row && s6row.sub === 'Doktor girişi' && !s6row.dinfo && !s6row.dpledge && !s6row.name, JSON.stringify(s6row));
log('"Şifremi unuttum" sıfırlama ekranını açar, "Girişe dön" geri getirir', forgot.reset && forgot.sub === 'Şifre sıfırlama' && forgot.back, JSON.stringify(forgot));
log('Doktor tekrar girince profil sunucudan tazelenir (yönetici onayı görünür)', s6 && s6.doctor_verified === true, JSON.stringify(s6));

const diag = await p.evaluate(() => VitaTakipDiagnostics.run());
const failed = diag.results.filter(x => !x.passed).map(x => x.name);
log(`Uygulama içi tanılama (${diag.passed}/${diag.results.length})`, failed.length === 0, failed.join(', '));
log('Sayfa hatası yok', errs.length === 0, errs.join(' | '));
console.log(`ÖZET ${results.filter(Boolean).length}/${results.length}`);
await b.close();
