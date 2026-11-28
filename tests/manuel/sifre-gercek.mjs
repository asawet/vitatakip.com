/* MANUEL — gerçek Supabase'de takma ad hesabının kurtarma koduyla şifre sıfırlaması (sifre-kurtar Edge Function).
   Kayıt → kod gösterilir → çıkış → yanlış kod reddedilir → doğru kodla yeni şifre + yeni kod → aynı hesaba giriş →
   eski kod ve eski şifre geçersiz → istemci deneme kayıtlarını / başkasının kodunu okuyamaz → hesap silinir.
   E-posta bağlantısı (Resend SMTP gerektirir) ayrı ve elle test edilir.
   Çalıştırma: VT_PORT=8090 node tests/manuel/sifre-gercek.mjs */
import { boot, sleep } from '../lib.mjs';

const { b, p, errs } = await boot({ register: false });
await p.setViewport({ width: 390, height: 844 }); p.setDefaultTimeout(60000);
p.on('dialog', d => (d.type() === 'prompt' ? d.accept('SİL') : d.accept()));
const results = []; const log = (n, ok, d) => { results.push(ok); console.log((ok ? 'OK   ' : 'FAIL ') + n + (d ? ' -> ' + d : '')); };
const fill = (id, v) => p.evaluate((id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, id, v);
const txt = id => p.evaluate(id => (document.getElementById(id) || {}).textContent || '', id);
const close = () => p.evaluate(() => { try { closeProfileModal(); } catch (e) {} try { finishVitaSpotlightTour(true); } catch (e) {} });
const user = 'vt_sk_' + Date.now().toString(36).slice(-6);

// 1) Kayıt → kurtarma kodu
await p.evaluate(() => { VitaAuthUI.showCloud(); VitaAuthUI.setAcct('patient'); VitaAuthUI.setMode('register'); });
await fill('cloudInputFullName', 'Sifre Test'); await fill('cloudInputIdentifier', user); await fill('cloudInputPassword', 'ilksifre123'); await fill('cloudInputPasswordConfirm', 'ilksifre123');
await p.evaluate(() => { cloudConsentCheckbox.checked = true; });
await p.click('#cloudSubmitBtn'); await sleep(8000);
const code1 = await txt('recoveryCodeValue');
log('Gerçek kayıt: kurtarma kodu gösterildi', /^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/.test(code1), code1 ? 'XXXX-…' : 'yok');
const st = await p.evaluate(() => VitaCloud.recoveryCodeStatus());
log('Gerçek DB: kod özeti kaydedildi (RLS: kendi satırı)', st.ok && st.exists, JSON.stringify(st));
const leak = await p.evaluate(async () => {
  const c = await VitaCloud.getClient();
  const a = await c.from('recovery_attempts').select('*'); // istemciye kapalı
  const r = await c.from('recovery_codes').select('user_id');
  return { attempts: a.error ? 'erişim yok' : (a.data || []).length, codesSeen: (r.data || []).length };
});
log('İstemci deneme kayıtlarını okuyamaz; yalnız kendi kod satırını görür', (leak.attempts === 'erişim yok' || leak.attempts === 0) && leak.codesSeen === 1, JSON.stringify(leak));
await p.click('#recoveryAckCheckbox'); await p.click('#recoveryContinueBtn'); await sleep(3000); await close();
const uid = await p.evaluate(() => activeUserId);
await p.evaluate(() => handleLogout()); await sleep(1500);

// 2) Yanlış kod
await p.evaluate(() => { VitaAuthUI.showCloud(); VitaAuthUI.setMode('login'); });
await fill('cloudInputIdentifier', user); await p.click('#cloudForgotBtn'); await sleep(300);
await fill('resetCodeInput', 'AAAA-BBBB-CCCC-DDDD'); await fill('resetNewPassword', 'yenisifre456'); await fill('resetNewPassword2', 'yenisifre456');
await p.click('#resetSubmitBtn'); await sleep(5000);
log('Gerçek sunucu: yanlış kod reddedilir', (await txt('resetErrorMsg')) === 'Takma ad veya kurtarma kodu hatalı.', await txt('resetErrorMsg'));

// 3) Doğru kod → yeni şifre + yeni kod → giriş
await fill('resetCodeInput', code1.toLowerCase()); await p.click('#resetSubmitBtn'); await sleep(6000);
const code2 = await txt('recoveryCodeValue');
log('Gerçek sunucu: doğru kodla şifre değişti, yeni kod verildi', /^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/.test(code2) && code2 !== code1, await txt('resetErrorMsg'));
await p.click('#recoveryAckCheckbox'); await p.click('#recoveryContinueBtn'); await sleep(7000); await close();
log('Yeni şifreyle aynı hesaba girildi', (await p.evaluate(() => activeUserId)) === uid);
await p.evaluate(() => handleLogout()); await sleep(1500);

// 4) Eski şifre ve eski kod geçersiz
await p.evaluate(() => { VitaAuthUI.showCloud(); VitaAuthUI.setMode('login'); });
await fill('cloudInputIdentifier', user); await fill('cloudInputPassword', 'ilksifre123'); await p.click('#cloudSubmitBtn'); await sleep(5000);
log('Eski şifre çalışmaz', /hatalı/.test(await p.evaluate(() => cloudErrorMsg.textContent)));
await p.click('#cloudForgotBtn'); await sleep(300);
await fill('resetIdentifier', user); await fill('resetCodeInput', code1); await fill('resetNewPassword', 'ucuncusifre9'); await fill('resetNewPassword2', 'ucuncusifre9');
await p.click('#resetSubmitBtn'); await sleep(5000);
log('Kullanılmış kod tekrar çalışmaz', (await txt('resetErrorMsg')) === 'Takma ad veya kurtarma kodu hatalı.', await txt('resetErrorMsg'));

// 5) Temizlik: yeni şifreyle gir, hesabı sil
await p.click('#resetBackBtn'); await sleep(300);
await fill('cloudInputIdentifier', user); await fill('cloudInputPassword', 'yenisifre456'); await p.click('#cloudSubmitBtn'); await sleep(7000); await close();
await p.evaluate(() => deleteMyAccountData()); await sleep(7000);
log('Test hesabı silindi', (await p.evaluate(() => activeUserId)) === null);
log('Sayfa hatası yok', errs.length === 0, errs.join(' | '));
console.log('TAKMA AD (deneme kaydı temizliği için): ' + user);
console.log(`ÖZET ${results.filter(Boolean).length}/${results.length}`);
await b.close();
