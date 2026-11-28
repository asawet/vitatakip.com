/* Şifre sıfırlama + kurtarma kodu (js/bulut-sifre.js, js/bulut.js), sahte bulutla (tests/bulut-sahte.mjs).
   Takma ad: kayıtta kurtarma kodu (yalnız özeti saklanır) → Ayarlar'dan yenileme → "Şifremi unuttum" ile kodla sıfırlama
   → yeni kod → deneme sınırı. E-posta: sıfırlama bağlantısı isteği → e-postadaki bağlantıyla "yeni şifre" → giriş;
   süresi dolmuş bağlantı. Gerçek sunucu: tests/manuel/sifre-gercek.mjs
   Çalıştırma: VT_PORT=8090 node tests/sifre-sifirlama.mjs  (VT_SHOTS=<klasör> ekran görüntüsü) */
import { boot, sleep } from './lib.mjs';
import { fakeCloudPreload } from './bulut-sahte.mjs';

const { b, p, errs } = await boot({ register: false, preload: fakeCloudPreload });
await p.setViewport({ width: 390, height: 844 });
p.setDefaultTimeout(20000);
p.on('dialog', d => d.accept());
const BASE = 'http://localhost:' + (process.env.VT_PORT || 8080) + '/index.html';
const results = []; const log = (n, ok, d) => { results.push(ok); console.log((ok ? 'OK   ' : 'FAIL ') + n + (d ? ' -> ' + d : '')); };
const vis = id => p.evaluate(id => { const e = document.getElementById(id); return !!e && e.getClientRects().length > 0; }, id);
const txt = id => p.evaluate(id => (document.getElementById(id) || {}).textContent || '', id);
const fill = (id, v) => p.evaluate((id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, id, v);
const shot = async name => { if (process.env.VT_SHOTS) await p.screenshot({ path: process.env.VT_SHOTS + '/' + name + '.png' }); };
const closeExtras = () => p.evaluate(() => { try { closeProfileModal(); } catch (e) {} try { finishVitaSpotlightTour(true); } catch (e) {} });
const CODE_RE = /^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/;
const errMsg = () => txt('resetErrorMsg'), infoMsg = () => txt('resetNoticeMsg');

/* 1) Takma adla kayıt → kurtarma kodu bir kez gösterilir; "kaydettim" onayı olmadan devam edilemez */
await p.evaluate(() => { window.__autoAckRecovery = false; });
await p.evaluate(() => { VitaAuthUI.showCloud(); VitaAuthUI.setAcct('patient'); VitaAuthUI.setMode('register'); });
await fill('cloudInputFullName', 'Kaan Kod'); await fill('cloudInputIdentifier', 'kaan_k'); await fill('cloudInputPassword', 'eskisifre1'); await fill('cloudInputPasswordConfirm', 'eskisifre1');
await p.evaluate(() => { cloudConsentCheckbox.checked = true; });
await p.click('#cloudSubmitBtn'); await sleep(900);
const s1 = await p.evaluate(() => ({ box: document.getElementById('recoveryCodeBox').getClientRects().length > 0, code: document.getElementById('recoveryCodeValue').textContent, cont: document.getElementById('recoveryContinueBtn').disabled, uid: activeUserId, sub: authSubtitle.textContent }));
log('Takma adla kayıttan sonra kurtarma kodu gösterilir (XXXX-XXXX-XXXX-XXXX), "Devam et" onaysız kapalı', s1.box && CODE_RE.test(s1.code) && s1.cont && !s1.uid && /kurtarma kodunuz/.test(s1.sub), JSON.stringify(s1));
const store1 = await p.evaluate(async code => {
  const all = Object.keys(localStorage).map(k => localStorage.getItem(k)).join('|') + Object.keys(sessionStorage).map(k => sessionStorage.getItem(k)).join('|');
  const rec = JSON.parse(localStorage.getItem('__fakeRecovery') || '{}');
  return { hashOk: Object.values(rec)[0] === await VitaCloud.hashRecoveryCode(code), plain: all.includes(code) || all.includes(code.replace(/-/g, '')) };
}, s1.code);
log('Sunucuya yalnız SHA-256 özeti gider; kodun kendisi cihazda/bulutta saklanmaz', store1.hashOk && !store1.plain, JSON.stringify(store1));
await shot('sifre-1-kod-kayit');
await p.click('#recoveryAckCheckbox'); await sleep(100);
await p.click('#recoveryContinueBtn'); await sleep(800);
const s1b = await p.evaluate(() => ({ uid: activeUserId, profile: !document.getElementById('profileModal').classList.contains('hidden'), code: document.getElementById('recoveryCodeValue').textContent }));
log('Onaydan sonra hesap açılır (profil adımı), kod ekrandan silinir', !!s1b.uid && s1b.profile && s1b.code === '', JSON.stringify(s1b));
const uid = s1b.uid;
await closeExtras();

/* 2) Ayarlar > Veriler ve yedek: kurtarma kodu satırı; yeni kod eskisini geçersiz kılar */
await p.evaluate(() => navigateToView('view-settings')); await sleep(700);
await p.evaluate(() => { const r = document.getElementById('settingsRecoveryRow'); if (window.openSettingsSectionFor) window.openSettingsSectionFor(r); r.scrollIntoView(); }); await sleep(300);
const s2 = { row: await vis('settingsRecoveryRow'), st: await txt('settingsRecoveryStatus') };
log('Ayarlar: takma ad hesabında "Kurtarma kodu" satırı, "Oluşturuldu: …"', s2.row && /Oluşturuldu:/.test(s2.st), JSON.stringify(s2));
await p.click('#settingsRecoveryNewBtn'); await sleep(700);
const code2 = await txt('settingsRecoveryCodeValue');
const s2b = await p.evaluate(async (a, b) => { const h = Object.values(JSON.parse(localStorage.getItem('__fakeRecovery') || '{}'))[0]; return { newOk: h === await VitaCloud.hashRecoveryCode(b), oldValid: h === await VitaCloud.hashRecoveryCode(a) }; }, s1.code, code2);
log('"Yeni kod oluştur": yeni kod bir kez gösterilir, eski kod geçersiz', CODE_RE.test(code2) && code2 !== s1.code && (await vis('settingsRecoveryCodeBox')) && s2b.newOk && !s2b.oldValid, JSON.stringify({ code2, ...s2b }));
await shot('sifre-2-ayarlar');

/* 3) Çıkış → "Şifremi unuttum": takma ad yazılınca kod + yeni şifre alanları */
await p.evaluate(() => handleLogout()); await sleep(400);
await p.evaluate(() => { VitaAuthUI.showCloud(); VitaAuthUI.setMode('login'); });
await fill('cloudInputIdentifier', 'kaan_k');
await p.click('#cloudForgotBtn'); await sleep(200);
const s3 = { card: await vis('authResetCard'), cloud: await vis('authCloudCard'), pre: await p.evaluate(() => resetIdentifier.value), code: await vis('resetCodeFields'), btn: await txt('resetSubmitBtn'), sub: await txt('authSubtitle') };
log('"Şifremi unuttum" sıfırlama ekranını açar; yazılan takma ad aktarılır, kod + yeni şifre alanları görünür', s3.card && !s3.cloud && s3.pre === 'kaan_k' && s3.code && /Şifreyi sıfırla/.test(s3.btn) && s3.sub === 'Şifre sıfırlama', JSON.stringify(s3));
await shot('sifre-3-kodla-sifirlama');

/* 4) Yanlış kod reddedilir (hangi parçanın yanlış olduğu söylenmez); eski (yenilenmiş) kod da geçersiz */
await fill('resetCodeInput', s1.code); await fill('resetNewPassword', 'yenisifre22'); await fill('resetNewPassword2', 'yenisifre22');
await p.click('#resetSubmitBtn'); await sleep(600);
const e4 = await errMsg();
log('Geçersiz/eski kod: "Takma ad veya kurtarma kodu hatalı."', e4 === 'Takma ad veya kurtarma kodu hatalı.', e4);
await fill('resetNewPassword2', 'baska12345'); await fill('resetCodeInput', code2); await p.click('#resetSubmitBtn'); await sleep(200);
log('Yeni şifreler eşleşmezse sunucuya gitmez', /eşleşmiyor/.test(await errMsg()));

/* 5) Doğru kod (küçük harf/boşlukla da) → şifre değişir, YENİ kod gösterilir → "Giriş yap" ile aynı hesaba girilir */
await fill('resetCodeInput', code2.toLowerCase().replace(/-/g, ' ')); await fill('resetNewPassword2', 'yenisifre22');
await p.click('#resetSubmitBtn'); await sleep(900);
const s5 = await p.evaluate(() => ({ box: document.getElementById('recoveryCodeBox').getClientRects().length > 0, code: document.getElementById('recoveryCodeValue').textContent, sub: authSubtitle.textContent, cont: document.getElementById('recoveryContinueBtn').textContent.trim() }));
log('Kodla sıfırlama: "Şifreniz değiştirildi" + yeni kurtarma kodu, "Giriş yap"', s5.box && CODE_RE.test(s5.code) && s5.code !== code2 && s5.sub === 'Şifreniz değiştirildi' && s5.cont === 'Giriş yap', JSON.stringify(s5));
await p.click('#recoveryAckCheckbox'); await p.click('#recoveryContinueBtn'); await sleep(1200);
const s5b = await p.evaluate(() => ({ uid: activeUserId, body: document.body.innerText }));
log('Yeni şifreyle aynı hesaba giriş yapılır', s5b.uid === uid && /Şifreniz değiştirildi/.test(s5b.body), String(s5b.uid));
await closeExtras();
await p.evaluate(() => handleLogout()); await sleep(400);
await p.evaluate(() => { VitaAuthUI.showCloud(); VitaAuthUI.setMode('login'); });
await fill('cloudInputIdentifier', 'kaan_k'); await fill('cloudInputPassword', 'eskisifre1'); await p.click('#cloudSubmitBtn'); await sleep(500);
const e5 = await p.evaluate(() => cloudErrorMsg.textContent.trim());
log('Eski şifre artık çalışmaz', /hatalı/.test(e5), e5);

/* 6) Deneme sınırı: art arda hatalı kodlar → kilit */
await p.click('#cloudForgotBtn'); await sleep(150);
await fill('resetIdentifier', 'kaan_k'); await fill('resetNewPassword', 'baskasifre9'); await fill('resetNewPassword2', 'baskasifre9');
let e6 = '';
for (let i = 0; i < 6; i++) { await fill('resetCodeInput', 'AAAA-BBBB-CCCC-DDD' + 'EFGHJ'[i % 5]); await p.click('#resetSubmitBtn'); await sleep(250); e6 = await errMsg(); }
log('Art arda hatalı denemeden sonra "Çok fazla hatalı deneme… 15 dakika"', /Çok fazla hatalı deneme/.test(e6) && /15 dakika/.test(e6), e6);
await p.click('#resetBackBtn'); await sleep(150);
log('"Girişe dön" giriş ekranına döner', (await vis('authCloudCard')) && !(await vis('authResetCard')));

/* 7) E-posta hesabı: kurtarma kodu yok; "Şifremi unuttum" bağlantı ister (hesap var/yok aynı yanıt) */
/* 7a) Şifre alt sınırı 6 karakter: 5 karakter reddedilir, 6 karakter kabul edilir */
await p.evaluate(() => { VitaAuthUI.setMode('register'); });
await fill('cloudInputFullName', 'Altı Karakter'); await fill('cloudInputIdentifier', 'alti_k'); await fill('cloudInputPassword', 'abc12'); await fill('cloudInputPasswordConfirm', 'abc12');
await p.evaluate(() => { cloudConsentCheckbox.checked = true; });
await p.click('#cloudSubmitBtn'); await sleep(400);
const e7a = await p.evaluate(() => cloudErrorMsg.textContent.trim());
await fill('cloudInputPassword', 'abc123'); await fill('cloudInputPasswordConfirm', 'abc123'); await p.click('#cloudSubmitBtn'); await sleep(900);
await p.click('#recoveryAckCheckbox'); await p.click('#recoveryContinueBtn'); await sleep(600); // takma ad: kurtarma kodu adımı
const s7a = await p.evaluate(() => ({ uid: activeUserId, ph: cloudInputPasswordConfirm.placeholder }));
log('Şifre en az 6 karakter: 5 karakter reddedilir, 6 karakterle hesap açılır', /en az 6 karakter/.test(e7a) && !!s7a.uid && /en az 6/.test(s7a.ph), JSON.stringify({ e7a, ...s7a }));
await closeExtras(); await p.evaluate(() => handleLogout()); await sleep(400);
await p.evaluate(() => { VitaAuthUI.showCloud(); VitaAuthUI.setMode('login'); });
await p.evaluate(() => { VitaAuthUI.setMode('register'); });
await fill('cloudInputFullName', 'Eda Posta'); await fill('cloudInputIdentifier', 'eda@ornek.com'); await fill('cloudInputPassword', 'edasifre11'); await fill('cloudInputPasswordConfirm', 'edasifre11');
await p.evaluate(() => { cloudConsentCheckbox.checked = true; });
await p.click('#cloudSubmitBtn'); await sleep(900);
const s7 = await p.evaluate(() => ({ uid: activeUserId, box: document.getElementById('recoveryCodeBox').getClientRects().length > 0 }));
await closeExtras();
await p.evaluate(() => navigateToView('view-settings')); await sleep(700);
log('E-posta hesabında kurtarma kodu adımı ve Ayarlar satırı yok', !!s7.uid && !s7.box && !(await vis('settingsRecoveryRow')), JSON.stringify(s7));
const emailUid = s7.uid;
await p.evaluate(() => handleLogout()); await sleep(400);
await p.evaluate(() => { VitaAuthUI.showCloud(); VitaAuthUI.setMode('login'); });
await p.click('#cloudForgotBtn'); await sleep(150);
await fill('resetIdentifier', 'Eda@Ornek.com');
const s7f = { code: await vis('resetCodeFields'), btn: await txt('resetSubmitBtn') };
await p.click('#resetSubmitBtn'); await sleep(500);
const i7 = await infoMsg();
const call7 = await p.evaluate(() => window.__calls.filter(c => c[0] === 'resetPasswordForEmail').pop());
await fill('resetIdentifier', 'yok@ornek.com'); await p.click('#resetSubmitBtn'); await sleep(500);
const i7b = await infoMsg();
log('E-posta yazılınca kod alanları gizli, "Sıfırlama bağlantısı gönder"', !s7f.code && /bağlantısı gönder/.test(s7f.btn), JSON.stringify(s7f));
log('Bağlantı isteği: küçük harfli e-posta, dönüş adresi uygulama; "bir hesap varsa… gönderildi"', call7 && call7[1] === 'eda@ornek.com' && call7[2] === BASE && /bir hesap varsa sıfırlama bağlantısı gönderildi/.test(i7), JSON.stringify({ call7, i7 }));
await p.evaluate(() => { window.__smtpFails = true; }); await p.click('#resetSubmitBtn'); await sleep(500);
const e7s = await errMsg(); await p.evaluate(() => { window.__smtpFails = false; });
log('E-posta gönderilemezse (SMTP hatası) genel hata yerine "e-postası şu an gönderilemedi"', /Sıfırlama e-postası şu an gönderilemedi/.test(e7s), e7s);
log('Kayıtlı olmayan e-posta için de aynı yanıt (hangi e-postanın kayıtlı olduğu öğrenilemez)', i7b === i7, i7b);
await shot('sifre-4-eposta-istek');
const token = await p.evaluate(() => window.__lastResetToken);

/* 8) E-postadaki bağlantı: adres çubuğundan belirteç silinir, "Yeni şifre" formu açılır */
await p.goto(BASE + '?type=recovery&token_hash=' + token, { waitUntil: 'networkidle2' }); await sleep(1200);
const s8 = { href: await p.evaluate(() => location.href), form: await vis('resetLinkForm'), sub: await txt('authSubtitle'), back: await vis('resetBackBtn') };
log('Bağlantıyla açılış: belirteç adresten silinir, "Yeni şifre belirleyin" formu', !/token_hash|type=recovery/.test(s8.href) && s8.form && s8.sub === 'Yeni şifre belirleyin', JSON.stringify(s8));
await shot('sifre-5-yeni-sifre');
await fill('resetLinkPassword', 'edasifre11'); await fill('resetLinkPassword2', 'edasifre11'); await p.click('#resetLinkSubmitBtn'); await sleep(600);
const e8 = await errMsg();
log('Eski şifreyle aynı olamaz (bağlantı tekrar istenmeden düzeltilebilir)', /eski şifrenizle aynı/.test(e8), e8);
await fill('resetLinkPassword', 'edayeni2026'); await fill('resetLinkPassword2', 'edayeni2026'); await p.click('#resetLinkSubmitBtn'); await sleep(1200);
const s8b = await p.evaluate(() => ({ uid: activeUserId, auth: getComputedStyle(document.getElementById('authModal')).display !== 'none', body: document.body.innerText }));
log('Yeni şifre kaydedilir ve kullanıcı giriş yapmış olur', s8b.uid === emailUid && !s8b.auth && /Şifreniz değiştirildi/.test(s8b.body), JSON.stringify({ uid: s8b.uid, auth: s8b.auth }));
await closeExtras();
await p.evaluate(() => handleLogout()); await sleep(400);
await p.evaluate(() => { VitaAuthUI.showCloud(); VitaAuthUI.setMode('login'); });
await fill('cloudInputIdentifier', 'eda@ornek.com'); await fill('cloudInputPassword', 'edayeni2026'); await p.click('#cloudSubmitBtn'); await sleep(900);
log('Yeni şifreyle tekrar giriş yapılır', (await p.evaluate(() => activeUserId)) === emailUid);
await closeExtras();
await p.evaluate(() => handleLogout()); await sleep(400);

/* 9) Kullanılmış/süresi dolmuş bağlantı: açıklama + "Yeni bağlantı iste" */
await p.goto(BASE + '?type=recovery&token_hash=' + token, { waitUntil: 'networkidle2' }); await sleep(1200);
await fill('resetLinkPassword', 'baskayeni99'); await fill('resetLinkPassword2', 'baskayeni99'); await p.click('#resetLinkSubmitBtn'); await sleep(600);
const e9 = await errMsg();
log('Kullanılmış bağlantı: "süresi dolmuş ya da … kullanılmış", "Yeni bağlantı iste" görünür', /süresi dolmuş/.test(e9) && (await vis('resetLinkExpiredBtn')), e9);
await p.click('#resetLinkExpiredBtn'); await sleep(150);
log('"Yeni bağlantı iste" sıfırlama isteği ekranını açar', (await vis('resetRequestForm')) && !(await vis('resetLinkForm')));

/* 10) Simgeler, koyu tema taşma, sayfa hatası */
const icons = await p.evaluate(() => [...document.querySelectorAll('#authResetCard i[class*="fa-"], #settingsRecoveryRow i[class*="fa-"]')].map(i => ({ c: [...i.classList].find(x => x.startsWith('fa-') && x !== 'fa-solid'), ok: (getComputedStyle(i, '::before').content || '').replace(/"/g, '').trim().length === 1 })).filter(x => !x.ok).map(x => x.c));
log('Sıfırlama ekranı simgeleri tanımlı', icons.length === 0, icons.join(', '));
const ov = await p.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, iw: innerWidth }));
log('Telefonda yatay taşma yok', ov.sw <= ov.iw + 1, JSON.stringify(ov));
log('Sayfa hatası yok', errs.length === 0, errs.join(' | '));
console.log(`ÖZET ${results.filter(Boolean).length}/${results.length}`);
await b.close();
