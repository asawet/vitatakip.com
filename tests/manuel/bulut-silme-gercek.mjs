/* MANUEL — gerçek Supabase projesine karşı "Hesabımı ve verilerimi sil" (hesap-sil Edge Function) doğrulaması.
   Kendi kendini temizler: oluşturduğu hesabı uygulama içinden siler. Çalıştırma: VT_PORT=8090 node tests/manuel/bulut-silme-gercek.mjs
   Not: Edge Function CORS listesinde http://localhost:8090 bulunur (supabase/functions/hesap-sil). */
import { boot, sleep } from '../lib.mjs';
const { b, p, errs } = await boot({ register: false });
await p.setViewport({ width: 390, height: 844 });
p.setDefaultTimeout(30000);
p.on('dialog', d => (d.type() === 'prompt' ? d.accept('SİL') : d.accept()));
const results = []; const log = (n, ok, d) => { results.push(ok); console.log((ok ? 'OK   ' : 'FAIL ') + n + (d ? ' -> ' + d : '')); };
const uname = 'vt_sil_' + Date.now().toString(36).slice(-6);
const fill = (id, v) => p.evaluate((id, v) => { document.getElementById(id).value = v; }, id, v);

await p.evaluate(() => { VitaAuthUI.showCloud(); VitaAuthUI.setMode('register'); VitaAuthUI.setKind('username'); });
await fill('cloudInputFullName', 'Gercek Silme'); await fill('cloudInputIdentifier', uname); await fill('cloudInputPassword', 'testpass123'); await fill('cloudInputPasswordConfirm', 'testpass123');
await p.evaluate(() => { cloudConsentCheckbox.checked = true; cloudRememberMeCheckbox.checked = false; });
await p.click('#cloudSubmitBtn'); await sleep(6000);
await p.evaluate(() => { try { closeProfileModal(); } catch (e) {} });
const before = await p.evaluate(async () => { const c = await VitaCloud.getClient(); const r = await c.from('user_stores').select('store').eq('user_id', activeUserId); return { uid: activeUserId, rows: (r.data || []).length }; });
log('Hazırlık: gerçek bulut hesabı ve buluttaki satırlar', before.rows > 5, JSON.stringify(before));

await p.evaluate(() => deleteMyAccountData()); await sleep(6000);
const after = await p.evaluate(async (uname) => {
  const r = await VitaCloud.signIn(uname, 'testpass123');
  return { uid: activeUserId, login: r.ok ? 'ACIK: giriş yapıldı' : r.code, left: Object.keys(localStorage).filter(k => /[0-9a-f]{8}-[0-9a-f]{4}-/.test(k)).length };
}, uname);
log('Silme sonrası: oturum kapandı, aynı bilgilerle giriş yapılamıyor (hesap sunucuda silindi)', after.uid === null && after.login === 'invalid_credentials', JSON.stringify(after));
log('Cihazda bu hesaba ait anahtar kalmadı', after.left === 0, String(after.left));
log('Sayfa hatası yok', errs.length === 0, errs.join(' | '));
console.log(`ÖZET ${results.filter(Boolean).length}/${results.length}`);
console.log('Kontrol (Supabase SQL): select count(*) from auth.users where email = \'' + uname + '@hesap.vitatakip.com.tr\';  -- 0 olmalı');
await b.close();
