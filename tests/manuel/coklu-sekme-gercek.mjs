/* MANUEL — gerçek Supabase'de iki sekme, iki hesap (sekme başına oturum). Hesaplar sonda uygulama içinden silinir.
   Çalıştırma: VT_PORT=8090 node tests/manuel/coklu-sekme-gercek.mjs */
import puppeteer from 'puppeteer-core';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const URL = 'http://localhost:' + (process.env.VT_PORT || 8090) + '/index.html';
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
const errs = []; const results = []; const log = (n, ok, d) => { results.push(ok); console.log((ok ? 'OK   ' : 'FAIL ') + n + (d ? ' -> ' + d : '')); };
async function tab() {
  const p = await b.newPage(); await p.setViewport({ width: 390, height: 844 }); p.setDefaultTimeout(60000);
  p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => (d.type() === 'prompt' ? d.accept('SİL') : d.accept()));
  await p.evaluateOnNewDocument(() => localStorage.setItem('vitatakip_legal_accepted', 'true'));
  await p.goto(URL, { waitUntil: 'networkidle2' }); await sleep(1500); return p;
}
const fill = (p, id, v) => p.evaluate((id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, id, v);
async function signup(p, acct, name, user) {
  await p.evaluate(a => { openAuthModal(); VitaAuthUI.showCloud(); VitaAuthUI.setAcct(a); VitaAuthUI.setMode('register'); }, acct);
  await fill(p, 'cloudInputFullName', name); await fill(p, 'cloudInputIdentifier', user); await fill(p, 'cloudInputPassword', 'gecici12'); await fill(p, 'cloudInputPasswordConfirm', 'gecici12');
  await p.evaluate(a => { if (a === 'doctor') cloudDoctorConsentCheckbox.checked = true; else cloudConsentCheckbox.checked = true; cloudRememberMeCheckbox.checked = true; }, acct);
  await p.evaluate(() => cloudSubmitBtn.click()); await sleep(7000);
  await p.evaluate(() => { const b = document.getElementById('recoveryContinueBtn'); if (b && !document.getElementById('recoveryCodeBox').classList.contains('hidden')) { recoveryAckCheckbox.checked = true; b.disabled = false; b.click(); } });
  await sleep(3000); await p.evaluate(() => { try { closeProfileModal(); } catch (e) {} try { finishVitaSpotlightTour(true); } catch (e) {} try { VitaMigrate.close(); } catch (e) {} });
  return p.evaluate(() => activeUserId);
}
const who = p => p.evaluate(async () => { const c = await VitaCloud.getClient(); const r = await c.rpc('my_profile'); const pr = r.data && r.data[0]; return { app: activeUserId, server: pr && pr.id, type: pr && pr.account_type }; });
const T = Date.now().toString(36).slice(-5);
const A = await tab();
const hasta = await signup(A, 'patient', 'Sekme Hasta', 'vt_sa_' + T);
const B = await tab(); // hatırlanan oturumla (hasta) açılır — A ile aynı sunucu oturumu
await B.evaluate(() => handleLogout()); await sleep(2500);
const fo = await A.evaluate(() => ({ app: activeUserId, msg: document.getElementById('cloudErrorMsg').textContent }));
log('Gerçek: ortak oturumda B çıkınca A da açıklamayla çıkar', fo.app === null && /başka bir sekmede çıkış yapıldı/.test(fo.msg), JSON.stringify(fo));
await A.evaluate(() => { VitaAuthUI.showCloud(); VitaAuthUI.setMode('login'); });
await fill(A, 'cloudInputIdentifier', 'vt_sa_' + T); await fill(A, 'cloudInputPassword', 'gecici12');
await A.evaluate(() => { cloudRememberMeCheckbox.checked = true; cloudSubmitBtn.click(); }); await sleep(7000);
await A.evaluate(() => { try { closeProfileModal(); } catch (e) {} try { VitaMigrate.close(); } catch (e) {} });
const doktor = await signup(B, 'doctor', 'Dr. Sekme', 'vt_sb_' + T);
await A.bringToFront(); await sleep(500);
const a = await who(A); const bb = await who(B);
log('Gerçek: B\'de doktor girişinden sonra A sekmesi hasta olarak çalışır', a.app === hasta && a.server === hasta && a.type === 'patient', JSON.stringify(a));
log('Gerçek: B sekmesi doktor olarak çalışır', bb.app === doktor && bb.server === doktor && bb.type === 'doctor', JSON.stringify(bb));
await A.evaluate(() => { state.supplements.push({ id: 'gs1', name: 'Sekme D3', timing: 'Sabah', scheduleTime: '08:00', scheduleDays: [] }); saveState(); });
await A.evaluate(() => VitaSync.flush()); await sleep(4000);
const sync = await A.evaluate(async id => { const c = await VitaCloud.getClient(); const r = await c.from('user_stores').select('data').eq('user_id', id).eq('store', 'supplements'); return JSON.stringify((r.data || [])[0] || {}); }, hasta);
log('Gerçek: A\'da eklenen takviye hastanın bulutuna yazılır', /Sekme D3/.test(sync), sync.slice(0, 80));
await A.evaluate(() => deleteMyAccountData()); await sleep(7000);
await B.evaluate(() => deleteMyAccountData()); await sleep(7000);
log('Test hesapları silindi', (await A.evaluate(() => activeUserId)) === null && (await B.evaluate(() => activeUserId)) === null);
log('Sayfa hatası yok', errs.length === 0, errs.join(' | '));
console.log(`ÖZET ${results.filter(Boolean).length}/${results.length}`);
await b.close();
