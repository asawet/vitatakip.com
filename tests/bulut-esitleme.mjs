/* Bulut eşitleme (js/bulut-esitleme.js). Gerçek Supabase'e BAĞLANMAZ: sahte istemci + sahte user_stores tablosu
   (sunucu zaman damgası, RLS: yalnız kendi satırı). "Başka cihaz" sahte tabloyu doğrudan değiştirerek canlandırılır.
   Çalıştırma: VT_PORT=8090 node tests/bulut-esitleme.mjs */
import { boot, sleep } from './lib.mjs';

import { fakeCloudPreload as fakePreload } from './bulut-sahte.mjs';

const { b, p, errs } = await boot({ register: false, preload: fakePreload });
await p.setViewport({ width: 390, height: 844 });
p.setDefaultTimeout(20000);
let lastDialog = ''; p.on('dialog', d => { lastDialog = d.message(); d.accept(); });
const results = []; const log = (n, ok, d) => { results.push(ok); console.log((ok ? 'OK   ' : 'FAIL ') + n + (d ? ' -> ' + d : '')); };
const fill = (id, v) => p.evaluate((id, v) => { document.getElementById(id).value = v; }, id, v);
const settle = (ms = 2200) => sleep(ms); // debounce 1,5 sn + gönderim
const upserts = () => p.evaluate(() => window.__calls.filter(c => c[0] === 'upsert'));
const dbStore = (store) => p.evaluate(s => { const r = window.__db().find(x => x.user_id === activeUserId && x.store === s); return r ? r.data : null; }, store);

async function cloudSignup(username, pass) {
  await p.evaluate(() => { VitaAuthUI.showCloud(); VitaAuthUI.setMode('register'); VitaAuthUI.setKind('username'); });
  await fill('cloudInputFullName', 'Esitleme Test'); await fill('cloudInputIdentifier', username); await fill('cloudInputPassword', pass); await fill('cloudInputPasswordConfirm', pass);
  await p.evaluate(() => { cloudConsentCheckbox.checked = true; cloudRememberMeCheckbox.checked = true; });
  await p.click('#cloudSubmitBtn'); await sleep(600);
  await p.evaluate(() => { try { closeProfileModal(); } catch (e) {} try { finishVitaSpotlightTour(true); } catch (e) {} });
}
async function cloudLogin(username, pass) {
  await p.evaluate(() => { VitaAuthUI.showCloud(); VitaAuthUI.setMode('login'); });
  await fill('cloudInputIdentifier', username); await fill('cloudInputPassword', pass);
  await p.click('#cloudSubmitBtn'); await sleep(600);
  await p.evaluate(() => { try { closeProfileModal(); } catch (e) {} try { finishVitaSpotlightTour(true); } catch (e) {} });
}

/* 1) Yeni bulut hesabı: ilk çekme (boş) sonrası cihazdaki veri buluta gider */
await cloudSignup('esit_test', 'sifre1234'); await settle();
const s1 = await p.evaluate(() => ({ uid: activeUserId, stores: window.__db().filter(r => r.user_id === activeUserId).map(r => r.store).sort(), pending: VitaSync.pendingCount(), firstSelect: window.__calls.findIndex(c => c[0] === 'select'), firstUpsert: window.__calls.findIndex(c => c[0] === 'upsert') }));
log('Yeni hesap: önce bulut çekilir, sonra cihazdaki kayıtlar gönderilir (user, supplements, labhistory …)', s1.firstSelect >= 0 && s1.firstUpsert > s1.firstSelect && ['user', 'supplements', 'labhistory', 'hydration'].every(s => s1.stores.includes(s)) && s1.pending === 0, JSON.stringify(s1));
const user1 = await dbStore('user');
log('Bulut biçimi {"v": JSON} ve okunabilir (ad soyad)', user1 && user1.v && user1.v.name === 'Esitleme Test', JSON.stringify(user1 && user1.v && user1.v.name));

/* 2) Yalnız değişen tür gönderilir; değişmeyen saveState hiçbir şey göndermez */
await p.evaluate(() => { window.__calls.length = 0; state.supplements.push({ id: 'sync1', name: 'Bulut D3', timing: 'Sabah', scheduleTime: '08:00', toplamKutuAdedi: 30, kalanAdet: 30, gunlukDoz: 1, taken: false, scheduleDays: [0,1,2,3,4,5,6], addedDate: Date.now() }); saveState(); });
await settle();
const u2 = await upserts();
const sup2 = await dbStore('supplements');
await p.evaluate(() => { window.__calls.length = 0; saveState(); saveState(); }); await settle();
const u2b = await upserts();
log('Takviye eklenince yalnız "supplements" gönderilir', u2.length === 1 && u2[0][1].join() === 'supplements' && sup2.v.some(s => s.name === 'Bulut D3'), JSON.stringify(u2));
log('Değişiklik yokken saveState buluta istek göndermez', u2b.length === 0, JSON.stringify(u2b));

/* 3) Durum göstergesi (yan menü) */
const st3 = await p.evaluate(() => { const el = document.querySelector('#appDrawer [data-cloud-sync-status]') || document.querySelector('[data-cloud-sync-status]'); return el ? { text: el.textContent.trim(), tone: el.getAttribute('data-tone'), hidden: el.classList.contains('hidden') } : null; });
if (process.env.VT_SHOTS) { await p.evaluate(() => { openAppDrawer(); }); await sleep(400); await p.screenshot({ path: process.env.VT_SHOTS + '/esitleme-cekmece.png', clip: { x: 0, y: 0, width: 390, height: 260 } }); await p.evaluate(() => { closeAppDrawer(); navigateToView('view-settings'); document.getElementById('settingsSectionBackup').scrollIntoView(); }); await sleep(300); await (await p.$('#settingsSectionBackup')).screenshot({ path: process.env.VT_SHOTS + '/esitleme-ayarlar.png' }); await p.evaluate(() => navigateToView('view-home')); }
log('Durum göstergesi: "Bulutla eşitlendi · …"', st3 && !st3.hidden && st3.tone === 'ok' && /^Bulutla eşitlendi/.test(st3.text), JSON.stringify(st3));

/* 4) Çevrimdışı: değişiklik bekler, internet gelince gönderilir */
await p.setOfflineMode(true); await sleep(200);
await p.evaluate(() => { window.__calls.length = 0; state.hydration.current = 750; saveState(); }); await settle();
const s4 = await p.evaluate(() => ({ pending: VitaSync.pendingCount(), text: document.querySelector('[data-cloud-sync-status]').textContent.trim(), ups: window.__calls.filter(c => c[0] === 'upsert').length }));
await p.setOfflineMode(false); await sleep(2500);
const s4b = await p.evaluate(() => ({ pending: VitaSync.pendingCount(), hyd: (window.__db().find(r => r.user_id === activeUserId && r.store === 'hydration') || {}).data }));
log('Çevrimdışı: veri cihaza yazılır, "Çevrimdışı · 1 değişiklik bekliyor", istek gitmez', s4.pending === 1 && /Çevrimdışı · 1 değişiklik bekliyor/.test(s4.text) && s4.ups === 0, JSON.stringify(s4));
log('İnternet gelince bekleyen değişiklik gönderilir', s4b.pending === 0 && s4b.hyd && s4b.hyd.v.current === 750, JSON.stringify(s4b));

/* 5) Başka cihazdaki değişiklik alınır; sayfa yenilense de (IndexedDB eski kopyası ezmez) kalır */
const uid = s1.uid;
await p.evaluate(uid => { const cur = JSON.parse(localStorage.getItem('vitatakip_supplements_' + uid)); cur.push({ id: 'sync2', name: 'Telefondan Magnezyum', timing: 'Akşam', scheduleTime: '21:00', toplamKutuAdedi: 30, kalanAdet: 30, gunlukDoz: 1, taken: false, scheduleDays: [0,1,2,3,4,5,6], addedDate: Date.now() }); window.__serverWrite(uid, 'supplements', cur); }, uid);
await p.evaluate(() => VitaSync.pull({ force: true })); await sleep(500);
const s5 = await p.evaluate(() => state.supplements.map(s => s.name));
await p.reload({ waitUntil: 'networkidle2' }); await sleep(3500);
const s5b = await p.evaluate(() => ({ uid: activeUserId, names: state.supplements.map(s => s.name) }));
log('Başka cihazda eklenen takviye bu cihaza gelir', s5.includes('Telefondan Magnezyum') && s5.includes('Bulut D3'), JSON.stringify(s5));
log('Yenilemeden sonra da kalır (IndexedDB eski kopyası üstüne yazmaz)', s5b.uid === uid && s5b.names.includes('Telefondan Magnezyum'), JSON.stringify(s5b));

/* 6) Çakışma: iki tarafta da değişiklik → en son değiştiren kazanır */
await p.evaluate(() => { window.__netDown = true; state.hydration.current = 1000; saveState(); }); await settle(400);
await p.evaluate(uid => window.__serverWrite(uid, 'hydration', { current: 111, target: 2450 }, 60000), uid); // bulut değişikliği 1 dk ÖNCE
await p.evaluate(() => { window.__netDown = false; return VitaSync.pull({ force: true }); }); await settle();
const s6a = await p.evaluate(() => ({ local: state.hydration.current, cloud: window.__db().find(r => r.user_id === activeUserId && r.store === 'hydration').data.v.current }));
await p.evaluate(() => { window.__netDown = true; state.hydration.current = 1200; saveState(); }); await settle(400);
await p.evaluate(uid => { window.__clockSkew = 60000; window.__serverWrite(uid, 'hydration', { current: 2222, target: 2450 }); window.__clockSkew = 0; }, uid); // bulut değişikliği DAHA YENİ
await p.evaluate(() => { window.__netDown = false; return VitaSync.pull({ force: true }); }); await settle();
const s6b = await p.evaluate(() => ({ local: state.hydration.current, pending: VitaSync.pendingCount() }));
log('Çakışma: cihazdaki değişiklik daha yeniyse cihaz kazanır ve buluta gider', s6a.local === 1000 && s6a.cloud === 1000, JSON.stringify(s6a));
log('Çakışma: buluttaki değişiklik daha yeniyse bulut kazanır', s6b.local === 2222 && s6b.pending === 0, JSON.stringify(s6b));

/* 7) Çıkışta gönderilmemiş değişiklik uyarısı */
await p.evaluate(() => { window.__netDown = true; state.hydration.current = 1300; saveState(); }); await settle(400);
await p.evaluate(() => handleLogout()); await sleep(400);
log('Çıkışta "1 değişiklik henüz buluta gönderilmedi" uyarısı', /1 değişiklik henüz buluta gönderilmedi/.test(lastDialog), lastDialog.slice(0, 120));
await p.evaluate(() => { window.__netDown = false; });

/* 8) YENİ CİHAZ KORUMASI: cihazda hiç veri yokken girişte boş varsayılanlar buluttaki verinin üstüne yazılmaz */
const before8 = await p.evaluate(uid => window.__db().find(r => r.user_id === uid && r.store === 'supplements').data.v.length, uid);
await p.evaluate(uid => { Object.keys(localStorage).filter(k => k.includes(uid)).forEach(k => safeLocalStorageRemoveItem(k)); }, uid); // cihazı sıfırla (bulut kaydı kalır)
await cloudLogin('esit_test', 'sifre1234'); await settle(3000);
const s8 = await p.evaluate(uid => ({ uid: activeUserId, local: state.supplements.map(s => s.name), cloud: window.__db().find(r => r.user_id === uid && r.store === 'supplements').data.v.length, hyd: state.hydration.current }), uid);
log('Yeni cihazda giriş: buluttaki takviyeler gelir, bulut boş veriyle ezilmez', s8.uid === uid && s8.local.includes('Telefondan Magnezyum') && s8.cloud === before8 && before8 >= 2, JSON.stringify({ before8, s8 }));
log('Yeni cihazda bekleyen eski kuyruk yok: önceki oturumdaki gönderilmemiş değişiklik bu cihazdan silinmişti (bulut değeri geçerli)', s8.hyd === 2222, String(s8.hyd));

/* 9) Yerel hesap buluta hiçbir şey göndermez */
await p.evaluate(() => { handleLogout(); }); await sleep(300);
// "Beni hatırla" cihaz düzeyinde ortak tercihtir; yerel kayıtta kapatılır (tanılama: oturum yalnız sekmede)
await p.evaluate(() => { window.__calls.length = 0; VitaAuthUI.showLocal(); switchAuthMode('register'); const cb = document.getElementById('authRememberMeCheckbox'); cb.checked = false; if (typeof syncRememberMeButtonUI === 'function') syncRememberMeButtonUI(false); });
await p.type('#authInputFullName', 'Yerel Kisi'); await fill('authInputPassword', 'yerel12345'); await fill('authInputPasswordConfirm', 'yerel12345');
await p.click('#authSubmitBtn'); await sleep(1200);
await p.evaluate(() => { try { closeProfileModal(); } catch (e) {} state.supplements.push({ id: 'loc1', name: 'Yerel C', timing: 'Sabah', toplamKutuAdedi: 30, kalanAdet: 30, gunlukDoz: 1, scheduleDays: [] }); saveState(); }); await settle();
const s9 = await p.evaluate(() => ({ uid: activeUserId, calls: window.__calls.length, queueKeys: Object.keys(localStorage).filter(k => k.startsWith('vitatakip_bulut_kuyruk_' + activeUserId)).length, status: (document.querySelector('[data-cloud-sync-status]') || {}).className }));
log('Yerel hesap: buluta istek yok, kuyruk yok, durum göstergesi gizli', /^usr_/.test(s9.uid) && s9.calls === 0 && s9.queueKeys === 0 && /hidden/.test(s9.status), JSON.stringify(s9));

const diag = await p.evaluate(() => VitaTakipDiagnostics.run());
const failed = diag.results.filter(x => !x.passed).map(x => x.name);
log(`Uygulama içi tanılama (${diag.passed}/${diag.results.length})`, failed.length === 0, failed.join(', '));
log('Sayfa hatası yok', errs.length === 0, errs.join(' | '));
console.log(`ÖZET ${results.filter(Boolean).length}/${results.length}`);
await b.close();
