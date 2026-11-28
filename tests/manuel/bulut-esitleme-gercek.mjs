/* MANUEL — gerçek Supabase projesine karşı eşitleme doğrulaması (normal test turlarında çalıştırılmaz).
   Kayıt → cihazdaki veriler buluta gider → yalnız değişen tür gider → "başka cihaz" (ayrı istemci, aynı hesap)
   buluttaki satırı değiştirir → bu cihaz çeker → yeni cihaz girişinde bulut boş veriyle ezilmez.
   Çalıştırma: VT_PORT=8090 node tests/manuel/bulut-esitleme-gercek.mjs
   SONRA test kullanıcısını silin (Supabase SQL):
     delete from auth.users where email like 'vt\_sync\_%@hesap.vitatakip.com.tr'; */
import { boot, sleep } from '../lib.mjs';
const { b, p, errs } = await boot({ register: false });
await p.setViewport({ width: 390, height: 844 });
p.setDefaultTimeout(30000);
p.on('dialog', d => d.accept());
const results = []; const log = (n, ok, d) => { results.push(ok); console.log((ok ? 'OK   ' : 'FAIL ') + n + (d ? ' -> ' + d : '')); };
const uname = 'vt_sync_' + Date.now().toString(36).slice(-6);
const fill = (id, v) => p.evaluate((id, v) => { document.getElementById(id).value = v; }, id, v);

/* 1) Gerçek kayıt (arayüzden) */
await p.evaluate(() => { VitaAuthUI.showCloud(); VitaAuthUI.setMode('register'); VitaAuthUI.setKind('username'); });
await fill('cloudInputFullName', 'Gercek Esitleme'); await fill('cloudInputIdentifier', uname); await fill('cloudInputPassword', 'testpass123'); await fill('cloudInputPasswordConfirm', 'testpass123');
await p.evaluate(() => { cloudConsentCheckbox.checked = true; cloudRememberMeCheckbox.checked = false; });
await p.click('#cloudSubmitBtn'); await sleep(6000);
await p.evaluate(() => { try { closeProfileModal(); } catch (e) {} try { finishVitaSpotlightTour(true); } catch (e) {} });
const s1 = await p.evaluate(async () => {
  const c = await VitaCloud.getClient();
  const r = await c.from('user_stores').select('store, data, updated_at').eq('user_id', activeUserId);
  return { uid: activeUserId, err: r.error && r.error.message, stores: (r.data || []).map(x => x.store).sort(), name: ((r.data || []).find(x => x.store === 'user') || {}).data, pending: VitaSync.pendingCount(), status: document.querySelector('[data-cloud-sync-status]').textContent.trim() };
});
log('Gerçek kayıt: cihazdaki kayıtlar buluta gitti (user, supplements, …)', !s1.err && s1.stores.includes('user') && s1.stores.includes('supplements') && s1.pending === 0, JSON.stringify({ ...s1, name: s1.name && s1.name.v && s1.name.v.name }));
log('Durum: "Bulutla eşitlendi"', /^Bulutla eşitlendi/.test(s1.status), s1.status);

/* 2) Takviye ekle → yalnız supplements güncellenir */
const before = await p.evaluate(async () => { const c = await VitaCloud.getClient(); const r = await c.from('user_stores').select('store, updated_at').eq('user_id', activeUserId); return Object.fromEntries((r.data || []).map(x => [x.store, x.updated_at])); });
await p.evaluate(() => { state.supplements.push({ id: 'real1', name: 'Gerçek D3', timing: 'Sabah', scheduleTime: '08:00', toplamKutuAdedi: 30, kalanAdet: 30, gunlukDoz: 1, taken: false, scheduleDays: [0,1,2,3,4,5,6], addedDate: Date.now() }); saveState(); });
await sleep(5000);
const after = await p.evaluate(async () => { const c = await VitaCloud.getClient(); const r = await c.from('user_stores').select('store, data, updated_at').eq('user_id', activeUserId); return (r.data || []).map(x => ({ s: x.store, u: x.updated_at, d: x.data })); });
const changed = after.filter(x => before[x.s] !== x.u).map(x => x.s);
const sup = after.find(x => x.s === 'supplements');
log('Yalnız "supplements" satırı güncellendi ve takviye bulutta', changed.join() === 'supplements' && sup.d.v.some(s => s.name === 'Gerçek D3'), JSON.stringify(changed));

/* 3) "Başka cihaz": ayrı Supabase istemcisi (aynı hesap) buluttaki satırı değiştirir; bu cihaz çeker */
const other = await p.evaluate(async (uname) => {
  const c2 = window.supabase.createClient(VitaCloud.config.url, VitaCloud.config.publishableKey, { auth: { persistSession: false, autoRefreshToken: false, storageKey: 'vt-test-ikinci-cihaz' } });
  const li = await c2.auth.signInWithPassword({ email: VitaCloud.usernameToEmail(uname), password: 'testpass123' });
  if (li.error) return { err: li.error.message };
  const cur = JSON.parse(localStorage.getItem('vitatakip_supplements_' + activeUserId));
  cur.push({ id: 'real2', name: 'Telefondan Çinko', timing: 'Akşam', scheduleTime: '21:00', toplamKutuAdedi: 30, kalanAdet: 30, gunlukDoz: 1, taken: false, scheduleDays: [0,1,2,3,4,5,6], addedDate: Date.now() });
  const up = await c2.from('user_stores').upsert({ user_id: li.data.user.id, store: 'supplements', data: { v: cur } }, { onConflict: 'user_id,store' }).select('updated_at');
  await c2.auth.signOut({ scope: 'local' });
  return { err: up.error && up.error.message };
}, uname);
await p.evaluate(() => VitaSync.pull({ force: true })); await sleep(2500);
const s3 = await p.evaluate(() => state.supplements.map(s => s.name));
log('Başka cihazda eklenen takviye bu cihaza geldi', !other.err && s3.includes('Telefondan Çinko') && s3.includes('Gerçek D3'), JSON.stringify({ other, s3 }));

/* 4) Yeni cihaz: cihazdaki her şey silinir, aynı hesapla giriş → bulut boş veriyle ezilmez */
const uid = await p.evaluate(() => activeUserId);
await p.evaluate(() => handleLogout()); await sleep(1500);
await p.evaluate(uid => { Object.keys(localStorage).filter(k => k.includes(uid)).forEach(k => safeLocalStorageRemoveItem(k)); }, uid);
await p.evaluate(() => { VitaAuthUI.showCloud(); VitaAuthUI.setMode('login'); });
await fill('cloudInputIdentifier', uname); await fill('cloudInputPassword', 'testpass123');
await p.click('#cloudSubmitBtn'); await sleep(7000);
await p.evaluate(() => { try { closeProfileModal(); } catch (e) {} });
const s4 = await p.evaluate(async () => {
  const c = await VitaCloud.getClient(); const r = await c.from('user_stores').select('store, data').eq('user_id', activeUserId).eq('store', 'supplements');
  return { local: state.supplements.map(s => s.name), cloud: ((r.data || [])[0] || {}).data ? r.data[0].data.v.map(s => s.name) : null, name: state.user && state.user.name };
});
log('Yeni cihaz girişi: veriler buluttan geldi, bulut boş veriyle ezilmedi', s4.local.includes('Telefondan Çinko') && s4.cloud && s4.cloud.length === 2 && s4.name === 'Gercek Esitleme', JSON.stringify(s4));

log('Sayfa hatası yok', errs.length === 0, errs.join(' | '));
console.log(`ÖZET ${results.filter(Boolean).length}/${results.length}`);
console.log('Temizlik: delete from auth.users where email = \'' + uname + '@hesap.vitatakip.com.tr\';');
await b.close();
