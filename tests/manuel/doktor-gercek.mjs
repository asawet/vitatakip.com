/* MANUEL — gerçek Supabase'de doktor paneli uçtan uca. İki aşama (doktor onayı yalnız yöneticide):
     1) VT_PORT=8090 node tests/manuel/doktor-gercek.mjs hazirla   → gerçek doktor hesabı açar, kodu yazar
        Sonra Supabase SQL:  update public.profiles set doctor_verified = true where doctor_code = '<kod>';
     2) VT_PORT=8090 node tests/manuel/doktor-gercek.mjs dogrula   → hasta: veri + izin; doktor: liste, ayrıntı, not;
        hasta: notu okur, izni geri alır; doktor: erişim biter. SONDA İKİ HESAP DA UYGULAMA İÇİNDEN SİLİNİR.
   Durum dosyası: işletim sisteminin geçici klasörü (vitatakip-doktor-gercek.json). */
import { boot, sleep } from '../lib.mjs';
import fs from 'fs'; import os from 'os'; import path from 'path';
const STATE = path.join(os.tmpdir(), 'vitatakip-doktor-gercek.json');
const mode = process.argv[2];
const results = []; const log = (n, ok, d) => { results.push(ok); console.log((ok ? 'OK   ' : 'FAIL ') + n + (d ? ' -> ' + d : '')); };

async function page() {
  const r = await boot({ register: false });
  await r.p.setViewport({ width: 390, height: 844 }); r.p.setDefaultTimeout(60000);
  r.p.on('dialog', d => (d.type() === 'prompt' ? d.accept('SİL') : d.accept()));
  return r;
}
const fill = (p, id, v) => p.evaluate((id, v) => { document.getElementById(id).value = v; }, id, v);
async function signup(p, acct, name, user) {
  await p.evaluate(a => { VitaAuthUI.showCloud(); VitaAuthUI.setMode('register'); VitaAuthUI.setAcct(a); VitaAuthUI.setKind('username'); }, acct);
  await fill(p, 'cloudInputFullName', name); await fill(p, 'cloudInputIdentifier', user); await fill(p, 'cloudInputPassword', 'testpass123'); await fill(p, 'cloudInputPasswordConfirm', 'testpass123');
  await p.evaluate(a => { if (a === 'doctor') cloudDoctorConsentCheckbox.checked = true; else cloudConsentCheckbox.checked = true; }, acct);
  await p.click('#cloudSubmitBtn'); await sleep(7000);
  // Takma adla kayıt: kurtarma kodu adımı onaylanır (js/bulut-sifre.js)
  if (await p.evaluate(() => !document.getElementById('recoveryCodeBox').classList.contains('hidden'))) { await p.click('#recoveryAckCheckbox'); await p.click('#recoveryContinueBtn'); await sleep(3000); }
  await p.evaluate(() => { try { closeProfileModal(); } catch (e) {} try { finishVitaSpotlightTour(true); } catch (e) {} });
}
async function login(p, user) {
  await p.evaluate(() => { VitaAuthUI.showCloud(); VitaAuthUI.setMode('login'); });
  await fill(p, 'cloudInputIdentifier', user); await fill(p, 'cloudInputPassword', 'testpass123'); await p.click('#cloudSubmitBtn'); await sleep(7000);
  await p.evaluate(() => { try { closeProfileModal(); } catch (e) {} try { finishVitaSpotlightTour(true); } catch (e) {} });
}

if (mode === 'hazirla') {
  const { b, p, errs } = await page();
  const tag = Date.now().toString(36).slice(-5);
  const doctor = 'vt_drg_' + tag, patient = 'vt_hst_' + tag;
  await signup(p, 'doctor', 'Dr. Gercek Test', doctor);
  const code = await p.evaluate(() => (VitaCloud.cachedProfile(activeUserId) || {}).doctor_code);
  fs.writeFileSync(STATE, JSON.stringify({ doctor, patient, code }));
  log('Gerçek doktor hesabı açıldı, kod atandı', /^DR-\d+$/.test(code || ''), code);
  console.log("ŞİMDİ: update public.profiles set doctor_verified = true where doctor_code = '" + code + "';");
  await b.close();
} else if (mode === 'dogrula') {
  const st = JSON.parse(fs.readFileSync(STATE, 'utf8'));
  const { b, p, errs } = await page();
  // Hasta: veri + izin
  await signup(p, 'patient', 'Hasta Gercek', st.patient);
  await p.evaluate(() => { state.supplements.push({ id: 'g1', name: 'Gerçek D3', timing: 'Sabah', scheduleTime: '08:00', scheduleDays: [] }); state.labHistory.push({ id: 'gl1', date: '2026-11-20', timestamp: Date.parse('2026-11-20T09:00:00'), d3: 19, references: {} }); state.hydration.current = 900; saveState(); });
  await sleep(5000);
  await p.evaluate(() => VitaDoctors.open()); await sleep(500);
  await fill(p, 'doctorCodeInput', st.code); await p.evaluate(() => doctorAddBtn.scrollIntoView({ block: 'center' })); await p.click('#doctorAddBtn'); await sleep(4000);
  const g = await p.evaluate(() => document.getElementById('doctorAddMsg').textContent);
  log('Hasta gerçek doktora kodla izin verdi', /Dr\. Gercek Test artık kayıtlarınızı görebilir/.test(g), g);
  await p.evaluate(() => handleLogout()); await sleep(1500);
  // Doktor: liste, ayrıntı, su takibi görünmez, not
  await login(p, st.doctor);
  await p.evaluate(() => { if (state.activeTab !== 'view-doctor') navigateToView('view-doctor'); }); await sleep(4000);
  const lst = await p.evaluate(() => ({ badge: document.getElementById('vdpVerifiedBadge').textContent, list: document.getElementById('vdpPatientList').innerText }));
  log('Onaylı doktor (gerçek): hasta listede', lst.badge === 'Onaylı' && /Hasta Gercek/.test(lst.list), JSON.stringify(lst));
  await p.evaluate(() => document.querySelector('[data-patient-id]').click()); await sleep(5000);
  const det = await p.evaluate(async () => {
    const c = await VitaCloud.getClient();
    const pid = document.querySelector('[data-patient-id]').getAttribute('data-patient-id');
    const r = await c.from('user_stores').select('store').eq('user_id', pid);
    return { t: document.getElementById('vdpDetail').innerText, stores: (r.data || []).map(x => x.store).sort(), pid };
  });
  log('Doktor (gerçek RLS): takviye ve tahlil görünür', /Gerçek D3/.test(det.t) && /19 ng\/mL/.test(det.t), det.t.slice(0, 80));
  log('Doktor (gerçek RLS): su takibi ve alım işaretleri GELMEZ', !det.stores.includes('hydration') && !det.stores.includes('med_taken') && det.stores.includes('supplements'), det.stores.join(','));
  const upd = await p.evaluate(async pid => { const c = await VitaCloud.getClient(); const r = await c.from('user_stores').update({ data: { v: [] } }).eq('user_id', pid).select('store'); return (r.data || []).length; }, det.pid);
  log('Doktor (gerçek RLS): hasta verisini değiştiremez (0 satır)', upd === 0, String(upd));
  await fill(p, 'vdpNoteInput', 'Gerçek not: D3 kontrolü 3 ay sonra.'); await p.click('#vdpNoteSave'); await sleep(4000);
  log('Doktor not yazdı (gerçek)', /Gerçek not: D3 kontrolü/.test(await p.evaluate(() => document.getElementById('vdpNoteList').innerText)));
  await p.evaluate(() => handleLogout()); await sleep(1500);
  // Hasta: notu okur, izni geri alır
  await login(p, st.patient);
  await p.evaluate(() => VitaDoctors.open()); await sleep(5000);
  log('Hasta doktor notunu okur (gerçek)', /Gerçek not: D3 kontrolü/.test(await p.evaluate(() => document.getElementById('doctorNotesList').innerText)));
  await p.evaluate(() => document.querySelector('[data-doctor-revoke]').click()); await sleep(4000);
  log('Hasta izni geri aldı (gerçek)', /Henüz bir doktora erişim izni vermediniz/.test(await p.evaluate(() => document.getElementById('doctorList').innerText)));
  await p.evaluate(() => deleteMyAccountData()); await sleep(6000);
  log('Hasta hesabı silindi', await p.evaluate(() => activeUserId === null));
  // Doktor: erişim bitti, notu anonim olarak kalır; sonra doktor hesabı silinir
  await login(p, st.doctor);
  await p.evaluate(() => { if (state.activeTab !== 'view-doctor') navigateToView('view-doctor'); }); await sleep(4000);
  log('İzin geri alınıp hasta silinince doktor listesi boş (gerçek)', /Henüz size erişim izni veren hasta yok/.test(await p.evaluate(() => document.getElementById('vdpPatientList').innerText)));
  await p.evaluate(() => deleteMyAccountData()); await sleep(6000);
  log('Doktor hesabı silindi', await p.evaluate(() => activeUserId === null));
  log('Sayfa hatası yok', errs.length === 0, errs.join(' | '));
  fs.unlinkSync(STATE);
  await b.close();
} else { console.log('Kullanım: node tests/manuel/doktor-gercek.mjs hazirla | dogrula'); process.exit(1); }
console.log(`ÖZET ${results.filter(Boolean).length}/${results.length}`);
