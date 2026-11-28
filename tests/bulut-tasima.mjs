/* Yerel hesaptan bulut hesabına taşıma (js/bulut-tasima.js). Sahte bulut (tests/bulut-sahte.mjs); gerçek Supabase'e bağlanmaz.
   Çalıştırma: VT_PORT=8090 node tests/bulut-tasima.mjs */
import { boot, sleep } from './lib.mjs';
import { fakeCloudPreload } from './bulut-sahte.mjs';

const { b, p, errs } = await boot({ register: false, preload: fakeCloudPreload });
await p.setViewport({ width: 390, height: 844 });
p.setDefaultTimeout(20000);
p.on('dialog', d => d.accept());
const results = []; const log = (n, ok, d) => { results.push(ok); console.log((ok ? 'OK   ' : 'FAIL ') + n + (d ? ' -> ' + d : '')); };
const fill = (id, v) => p.evaluate((id, v) => { document.getElementById(id).value = v; }, id, v);
const modalOpen = () => p.evaluate(() => !!document.getElementById('vtMigrateModal'));
const closeOverlays = () => p.evaluate(() => { try { closeProfileModal(); } catch (e) {} try { finishVitaSpotlightTour(true); } catch (e) {} });

async function localRegister(name, pass) {
  await p.evaluate(() => { VitaAuthUI.showLocal(); switchAuthMode('register'); const cb = document.getElementById('authRememberMeCheckbox'); cb.checked = false; syncRememberMeButtonUI(false); });
  await fill('authInputFullName', name); await fill('authInputPassword', pass); await fill('authInputPasswordConfirm', pass);
  await p.click('#authSubmitBtn'); await sleep(1500); await closeOverlays();
}
async function cloudSignup(username, pass) {
  await p.evaluate(() => { VitaAuthUI.showCloud(); VitaAuthUI.setMode('register'); VitaAuthUI.setKind('username'); });
  await fill('cloudInputFullName', 'Bulut Ayse'); await fill('cloudInputIdentifier', username); await fill('cloudInputPassword', pass); await fill('cloudInputPasswordConfirm', pass);
  await p.evaluate(() => { cloudConsentCheckbox.checked = true; cloudRememberMeCheckbox.checked = false; });
  await p.click('#cloudSubmitBtn'); await sleep(800); await closeOverlays();
}
async function cloudLogin(username, pass) {
  await p.evaluate(() => { VitaAuthUI.showCloud(); VitaAuthUI.setMode('login'); });
  await fill('cloudInputIdentifier', username); await fill('cloudInputPassword', pass);
  await p.click('#cloudSubmitBtn'); await sleep(800); await closeOverlays();
}

/* 0) Hazırlık: yerel hesap + veriler (2 takviye, 1 tahlil, 2 belirti, not) */
await localRegister('Yerel Ayse', 'yerel12345');
const localId = await p.evaluate(() => {
  state.user = { ...state.user, weight: 62, height: 165, gender: 'K', age: 30 };
  state.supplements.push({ id: 'ls1', name: 'Yerel D3', timing: 'Sabah', scheduleTime: '08:00', toplamKutuAdedi: 30, kalanAdet: 30, gunlukDoz: 1, scheduleDays: [] });
  state.supplements.push({ id: 'ls2', name: 'Yerel B12', timing: 'Sabah', scheduleTime: '09:00', toplamKutuAdedi: 30, kalanAdet: 30, gunlukDoz: 1, scheduleDays: [] });
  state.labHistory.push({ id: 'll1', date: '2026-10-01', timestamp: Date.parse('2026-10-01T09:00:00'), vitD: 18, references: {} });
  state.selectedSymptoms = new Set(['yorgunluk', 'sac_dokulmesi']);
  saveState();
  safeLocalStorageSetItem('vitatakip_notes_' + activeUserId, 'Yerel not: D3 sabah');
  return activeUserId;
});
await p.evaluate(() => handleLogout()); await sleep(400);

/* 1) Yeni cihazda yerel hesabı OLMAYAN bulut girişinde soru çıkmaz — (aday listesi) */
/* 2) Bulut kaydı → ilk çekmeden sonra taşıma sorusu */
await cloudSignup('tasima_test', 'bulut1234'); await sleep(2500);
const s2 = await p.evaluate(() => ({ open: !!document.getElementById('vtMigrateModal'), items: [...document.querySelectorAll('.vt-migrate-item')].map(x => x.innerText.replace(/\s+/g, ' ').trim()), pulled: VitaSync.isInitialPullDone() }));
log('Bulut girişinde (ilk çekmeden sonra) taşıma sorusu: "Yerel Ayse — 2 takviye, 1 tahlil, 2 belirti"', s2.open && s2.pulled && s2.items.length === 1 && /Yerel Ayse/.test(s2.items[0]) && /2 takviye, 1 tahlil, 2 belirti/.test(s2.items[0]), JSON.stringify(s2));
if (process.env.VT_SHOTS) await p.screenshot({ path: process.env.VT_SHOTS + '/tasima-pencere.png' });

/* 3) Yanlış şifre: hata, hiçbir şey taşınmaz */
await fill('vtMigratePassword', 'yanlis999'); await p.click('#vtMigrateGo'); await sleep(1500);
const s3 = await p.evaluate(() => ({ err: document.getElementById('vtMigrateError').textContent, sup: state.supplements.length, open: !!document.getElementById('vtMigrateModal') }));
log('Yanlış yerel şifre: "Yerel hesabın şifresi hatalı.", veri taşınmaz', s3.err === 'Yerel hesabın şifresi hatalı.' && s3.sup === 0 && s3.open, JSON.stringify(s3));

/* 4) Doğru şifre: veriler bulut hesabına kopyalanır ve buluta gider; yerel hesap aynen kalır */
await fill('vtMigratePassword', 'yerel12345'); await p.click('#vtMigrateGo'); await sleep(4000);
const s4 = await p.evaluate(localId => ({
  open: !!document.getElementById('vtMigrateModal'), uid: activeUserId,
  sups: state.supplements.map(s => s.name), labs: state.labHistory.length, sym: Array.from(state.selectedSymptoms).sort(), name: state.user.name, weight: state.user.weight,
  notes: localStorage.getItem('vitatakip_notes_' + activeUserId),
  cloudSup: ((window.__db().find(r => r.user_id === activeUserId && r.store === 'supplements') || {}).data || {}).v,
  pending: VitaSync.pendingCount(),
  localKept: JSON.parse(localStorage.getItem('vitatakip_supplements_' + localId)).length, localAcct: getUsersDb().some(u => u.id === localId),
  done: JSON.parse(localStorage.getItem('vitatakip_bulut_tasindi_' + localId) || 'null')
}), localId);
log('Doğru şifre: takviye, tahlil, belirti, profil (ad bulut hesabının) bulut hesabına kopyalanır', !s4.open && s4.sups.join() === 'Yerel D3,Yerel B12' && s4.labs === 1 && s4.sym.join() === 'sac_dokulmesi,yorgunluk' && s4.name === 'Bulut Ayse' && s4.weight === 62 && s4.notes === 'Yerel not: D3 sabah', JSON.stringify(s4));
log('Taşınan veri buluta gönderilir', Array.isArray(s4.cloudSup) && s4.cloudSup.length === 2 && s4.pending === 0, JSON.stringify({ cloud: s4.cloudSup && s4.cloudSup.length, pending: s4.pending }));
log('Yerel hesap ve verileri cihazda aynen kalır; taşındı işareti yazılır', s4.localKept === 2 && s4.localAcct && s4.done && s4.done.cloudUid === s4.uid, JSON.stringify({ localKept: s4.localKept, done: s4.done }));
const s4r = await p.evaluate(() => !document.getElementById('settingsCloudImportRow').classList.contains('hidden'));
log('Taşındıktan sonra Ayarlar\'daki "Buluta taşı" satırı gizlenir', s4r === false);

/* 5) Tekrar taşıma kopya oluşturmaz */
const s5 = await p.evaluate(async localId => { const r = await VitaMigrate.migrate(localId, 'yerel12345'); return { ok: r.ok, changed: r.moved.stores, sups: state.supplements.length, labs: state.labHistory.length }; }, localId);
log('Aynı yerel hesap ikinci kez taşınınca kopya oluşmaz', s5.ok && s5.changed.length === 0 && s5.sups === 2 && s5.labs === 1, JSON.stringify(s5));

/* 6) Birleştirme: bulutta başka cihazdan eklenmiş veri varken taşıma onun üstüne yazmaz */
await p.evaluate(() => handleLogout()); await sleep(300);
await p.evaluate(localId => {
  // yerel hesaba yeni bir takviye ekle (ikinci taşıma için), taşındı işaretini kaldır
  const k = 'vitatakip_supplements_' + localId; const v = JSON.parse(localStorage.getItem(k)); v.push({ id: 'ls3', name: 'Yerel Omega', timing: 'Akşam', scheduleDays: [] }); safeLocalStorageSetItem(k, JSON.stringify(v));
  safeLocalStorageRemoveItem('vitatakip_bulut_tasindi_' + localId);
  // Uygulama yazarken damgayı ilerletir (saveState); burada elle yazıldığı için ilerletilir — yoksa IndexedDB kopyası daha yeni sayılır
  safeLocalStorageSetItem('vitatakip_extended_updated_' + localId, String(Date.now() + 1000));
}, localId);
await cloudLogin('tasima_test', 'bulut1234'); await sleep(1500);
await p.evaluate(() => VitaMigrate.close());
const uid = await p.evaluate(() => activeUserId);
await p.evaluate(uid => { const cur = JSON.parse(localStorage.getItem('vitatakip_supplements_' + uid)); cur.push({ id: 'phone1', name: 'Telefondan Magnezyum', timing: 'Akşam', scheduleDays: [] }); window.__serverWrite(uid, 'supplements', cur); }, uid);
await p.evaluate(() => VitaSync.pull({ force: true })); await sleep(800);
const s6 = await p.evaluate(async localId => { const r = await VitaMigrate.migrate(localId, 'yerel12345'); await new Promise(x => setTimeout(x, 2500)); return { changed: r.moved.stores, sups: state.supplements.map(s => s.name), cloud: window.__db().find(r => r.user_id === activeUserId && r.store === 'supplements').data.v.map(s => s.name) }; }, localId);
log('Birleştirme: buluttaki "Telefondan Magnezyum" korunur, yalnız yeni yerel kayıt ("Yerel Omega") eklenir', s6.changed.includes('supplements') && s6.sups.length === 4 && s6.sups.includes('Telefondan Magnezyum') && s6.sups.includes('Yerel Omega') && s6.cloud.length === 4, JSON.stringify(s6));

/* 7) "Bir daha sorma" */
await p.evaluate(localId => safeLocalStorageRemoveItem('vitatakip_bulut_tasindi_' + localId), localId);
await p.evaluate(() => { VitaMigrate.open(); }); await sleep(200);
await p.evaluate(() => { document.getElementById('vtMigrateSkip').checked = true; document.getElementById('vtMigrateLater').click(); });
await p.evaluate(() => handleLogout()); await sleep(300);
await cloudLogin('tasima_test', 'bulut1234'); await sleep(2000);
const s7 = { open: await modalOpen(), row: await p.evaluate(() => !document.getElementById('settingsCloudImportRow').classList.contains('hidden')) };
log('"Bir daha sorma" sonrası girişte soru çıkmaz; Ayarlar\'dan elle açılabilir', !s7.open && s7.row, JSON.stringify(s7));
await p.evaluate(() => document.getElementById('settingsCloudImportBtn').click()); await sleep(200);
log('Ayarlar > "Buluta taşı" pencereyi açar', await modalOpen());
await p.evaluate(() => VitaMigrate.close());

/* 8) Başka bir bulut hesabı da yerel şifre olmadan taşıyamaz (ortak cihaz) */
await p.evaluate(() => handleLogout()); await sleep(300);
await cloudSignup('baska_kisi', 'baska1234'); await sleep(2500);
const s8 = await p.evaluate(async localId => { const open = !!document.getElementById('vtMigrateModal'); VitaMigrate.close(); const r = await VitaMigrate.migrate(localId, ''); return { open, ok: r.ok, err: r.error, sups: state.supplements.length }; }, localId);
log('Başka bulut hesabı: soru görür ama yerel şifre olmadan taşıyamaz', s8.open && !s8.ok && s8.sups === 0, JSON.stringify(s8));

/* 9) Yerel hesabı olmayan cihazda soru çıkmaz */
const s9 = await p.evaluate(() => { const users = getUsersDb(); safeLocalStorageSetItem('vitatakip_users_db', '[]'); const c = VitaMigrate.candidates(activeUserId).length; safeLocalStorageSetItem('vitatakip_users_db', JSON.stringify(users)); return c; });
log('Cihazda yerel hesap yoksa taşınacak aday yok', s9 === 0, String(s9));

const diag = await p.evaluate(() => VitaTakipDiagnostics.run());
const failed = diag.results.filter(x => !x.passed).map(x => x.name);
log(`Uygulama içi tanılama (${diag.passed}/${diag.results.length})`, failed.length === 0, failed.join(', '));
log('Sayfa hatası yok', errs.length === 0, errs.join(' | '));
console.log(`ÖZET ${results.filter(Boolean).length}/${results.length}`);
await b.close();
