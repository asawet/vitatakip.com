/* Doktor paneli 4. adım: view-doctor (doktor tarafı) uçtan uca, sahte bulutla (tests/bulut-sahte.mjs; RLS taklidi).
   Doktor kaydı → onay → hasta veri girer ve izin verir → doktor hastayı görür (yalnız okuma), not yazar/siler →
   izin geri alınınca erişim kesilir. Gerçek RLS: supabase/tests/doktor_rls_test.sql
   Çalıştırma: VT_PORT=8090 node tests/doktor-paneli.mjs  (VT_SHOTS=<klasör> ekran görüntüsü) */
import { boot, sleep } from './lib.mjs';
import { fakeCloudPreload } from './bulut-sahte.mjs';

const { b, p, errs } = await boot({ register: false, preload: fakeCloudPreload });
await p.setViewport({ width: 390, height: 844 });
p.setDefaultTimeout(20000);
p.on('dialog', d => d.accept());
const results = []; const log = (n, ok, d) => { results.push(ok); console.log((ok ? 'OK   ' : 'FAIL ') + n + (d ? ' -> ' + d : '')); };
const vis = id => p.evaluate(id => { const e = document.getElementById(id); return !!e && e.getClientRects().length > 0; }, id);
const fill = (id, v) => p.evaluate((id, v) => { document.getElementById(id).value = v; }, id, v);
const shot = async name => { if (process.env.VT_SHOTS) await p.screenshot({ path: process.env.VT_SHOTS + '/' + name + '.png', fullPage: true }); };
const close = () => p.evaluate(() => { try { closeProfileModal(); } catch (e) {} try { finishVitaSpotlightTour(true); } catch (e) {} });
async function signup(acct, name, user, pass) {
  await p.evaluate(a => { VitaAuthUI.showCloud(); VitaAuthUI.setMode('register'); VitaAuthUI.setAcct(a); VitaAuthUI.setKind('username'); }, acct);
  await fill('cloudInputFullName', name); await fill('cloudInputIdentifier', user); await fill('cloudInputPassword', pass); await fill('cloudInputPasswordConfirm', pass);
  await p.evaluate(a => { if (a === 'doctor') cloudDoctorConsentCheckbox.checked = true; else cloudConsentCheckbox.checked = true; }, acct);
  await p.click('#cloudSubmitBtn'); await sleep(1500); await close();
}
async function login(user, pass) {
  await p.evaluate(() => { VitaAuthUI.showCloud(); VitaAuthUI.setMode('login'); });
  await fill('cloudInputIdentifier', user); await fill('cloudInputPassword', pass); await p.click('#cloudSubmitBtn'); await sleep(2500); await close();
}

/* 1) Doktor kaydı: panel açılış ekranı, kod, "onay bekliyor" */
await signup('doctor', 'Dr. Deniz Ak', 'dr_deniz', 'doktor123');
const s1 = await p.evaluate(() => ({ tab: state.activeTab, drawer: !document.getElementById('drawerSectionDoctor').classList.contains('hidden'), code: document.getElementById('vdpDoctorCode').textContent, badge: document.getElementById('vdpVerifiedBadge').textContent, uid: activeUserId, empty: document.getElementById('vdpPatientList').innerText }));
const pending = await vis('vdpPendingNote');
log('Doktor girişinde Doktor Paneli açılır; yan menüde "Doktor Paneli"; kod ve "Onay bekliyor"', s1.tab === 'view-doctor' && s1.drawer && /^DR-\d+$/.test(s1.code) && s1.badge === 'Onay bekliyor' && pending, JSON.stringify(s1));
log('Onaysız doktor: "onaylanınca hastalarınız burada görünecek"', /onaylanınca hastalarınız burada görünecek/.test(s1.empty), s1.empty);
await shot('doktor-onay-bekliyor');
const code = s1.code, doctorUid = s1.uid;
await p.evaluate(() => handleLogout()); await sleep(300);

/* 2) Yönetici onayı (sunucuda doctor_verified=true) + hasta kaydı, verileri ve izin */
await p.evaluate(id => { window.__verifiedDoctors = [id]; }, doctorUid);
await signup('patient', 'Hasta Pelin', 'pelin', 'hasta1234');
await p.evaluate(() => {
  state.user = { ...state.user, age: 34, gender: 'K', height: 165, weight: 62, profileCompleted: true };
  state.supplements.push({ id: 's1', name: 'D3 Damla', timing: 'Sabah', scheduleTime: '08:00', doseText: 'Günde 1 damla', aclikDurumu: 'Tok karnına', scheduleDays: [] });
  state.supplements.push({ id: 's2', name: '<img src=x onerror="window.__xss=1">Kötü Ad', timing: 'Akşam', scheduleTime: '21:00', scheduleDays: [] });
  state.labHistory.push({ id: 'l1', date: '2026-10-01', timestamp: Date.parse('2026-10-01T09:00:00'), d3: 14, b12: 310, references: { d3: '30–100 ng/mL' } });
  state.labHistory.push({ id: 'l2', date: '2026-11-15', timestamp: Date.parse('2026-11-15T09:00:00'), d3: 22, b12: 330, references: { d3: '30–100 ng/mL' } });
  state.selectedSymptoms = new Set(['numbness', 'brain_fog']);
  state.hydration.current = 1500;
  saveState();
  safeLocalStorageSetItem('vitatakip_notes_' + activeUserId, 'Sabahları yorgunum, D3 dozumu sormak istiyorum.');
});
if (typeof addVitaMedicationPlaceholder === 'undefined') await p.evaluate(() => { if (typeof addVitaMedication === 'function') addVitaMedication({ name: 'Euthyrox 50 mcg', frequency: 'gunde1', clocks: ['07:00'] }); });
await sleep(2500);
await p.evaluate(() => { navigateToView('view-settings'); window.openSettingsSectionFor(document.getElementById('doctorCodeInput')); }); await sleep(300);
await fill('doctorCodeInput', code); await p.evaluate(() => doctorAddBtn.scrollIntoView({ block: 'center' })); await p.click('#doctorAddBtn'); await sleep(800);
const s2 = await p.evaluate(() => ({ drawer: !document.getElementById('drawerSectionDoctor').classList.contains('hidden'), msg: document.getElementById('doctorAddMsg').textContent, links: JSON.parse(localStorage.getItem('__fakeLinks') || '[]').length }));
log('Hasta kodla izin verdi; hasta hesabında "Doktor Paneli" menüsü görünmez', /Dr\. Deniz Ak artık kayıtlarınızı görebilir/.test(s2.msg) && s2.links === 1 && !s2.drawer, JSON.stringify(s2));
await p.evaluate(() => handleLogout()); await sleep(300);

/* 3) Onaylı doktor: hastalarım listesi */
await login('dr_deniz', 'doktor123');
await p.evaluate(() => { if (state.activeTab !== 'view-doctor') navigateToView('view-doctor'); }); await sleep(800);
const s3 = await p.evaluate(() => ({ badge: document.getElementById('vdpVerifiedBadge').textContent, list: document.getElementById('vdpPatientList').innerText.replace(/\s+/g, ' '), pend: !document.getElementById('vdpPendingNote').classList.contains('hidden') }));
log('Onaylı doktor: "Onaylı" rozeti, hasta listesinde "Hasta Pelin · … güncellendi"', s3.badge === 'Onaylı' && !s3.pend && /Hasta Pelin/.test(s3.list) && /güncellendi/.test(s3.list), JSON.stringify(s3));
await shot('doktor-hasta-listesi');

/* 4) Hasta ayrıntısı (yalnız okuma) */
await p.click('[data-patient-id]'); await sleep(1200);
const s4 = await p.evaluate(() => {
  const t = document.getElementById('vdpDetail').innerText;
  return { t, listHidden: document.getElementById('vdpListPanel').getClientRects().length === 0, xss: window.__xss || 0, imgs: document.getElementById('vdpDetail').querySelectorAll('img').length };
});
log('Ayrıntı: profil (34 yaş, Kadın, 165 cm · 62 kg)', /34 yaş/.test(s4.t) && /Kadın/.test(s4.t) && /165 cm · 62 kg/.test(s4.t), s4.t.slice(0, 120));
log('Ayrıntı: takviyeler (saat, doz, aç/tok) ve ilaç', /D3 Damla/.test(s4.t) && /08:00 · Günde 1 damla · Tok karnına/.test(s4.t) && /Euthyrox 50 mcg/.test(s4.t), '');
log('Ayrıntı: son tahlil tablosu (değer, önceki değer, laboratuvar referansı) — en yeni kayıt', /Son tahlil: 15 Kasım 2026 · toplam 2 kayıt/.test(s4.t) && /25-OH D Vitamini\s*22 ng\/mL \(önceki 14\)/.test(s4.t) && /30–100 ng\/mL/.test(s4.t), (s4.t.match(/Son tahlil[^\n]*/) || [''])[0]);
log('Ayrıntı: belirtiler okunur adlarla, hastanın doktora notu', !/numbness|brain_fog/.test(s4.t) && /Sabahları yorgunum/.test(s4.t), '');
log('Hastadan gelen metin HTML olarak işlenmez (betik çalışmaz)', s4.xss === 0 && s4.imgs === 0 && /<img src=x/.test(s4.t), JSON.stringify({ xss: s4.xss, imgs: s4.imgs }));
log('Telefonda ayrıntı açılınca liste gizlenir ("Hastalar" ile geri dönülür)', s4.listHidden, String(s4.listHidden));
await shot('doktor-hasta-ayrinti');

/* 5) Not yaz ve sil */
await fill('vdpNoteInput', 'D3 dozunu 2000 IU yapalım; 3 ay sonra kontrol.'); await p.click('#vdpNoteSave'); await sleep(900);
const s5 = await p.evaluate(() => ({ list: document.getElementById('vdpNoteList').innerText, msg: document.getElementById('vdpNoteMsg').textContent, notes: JSON.parse(localStorage.getItem('__fakeNotes') || '[]') }));
log('Not gönderilir: listede görünür, hasta tarafında Dr. adıyla', /D3 dozunu 2000 IU/.test(s5.list) && /Not gönderildi/.test(s5.msg) && s5.notes.length === 1 && s5.notes[0].doctor_label === 'Dr. Deniz Ak', JSON.stringify({ msg: s5.msg, n: s5.notes.length }));
await p.evaluate(() => document.querySelector('[data-note-delete]').click()); await sleep(800);
const s5b = await p.evaluate(() => ({ list: document.getElementById('vdpNoteList').innerText, notes: JSON.parse(localStorage.getItem('__fakeNotes') || '[]').length }));
log('Not silinir', s5b.notes === 0 && /henüz not yazmadınız/.test(s5b.list), JSON.stringify(s5b));

/* 6) Hasta izni geri alınca: liste yenilemesinde ayrıntı kapanır, erişim biter */
await p.evaluate(() => { const l = JSON.parse(localStorage.getItem('__fakeLinks')); l.forEach(x => x.status = 'revoked'); localStorage.setItem('__fakeLinks', JSON.stringify(l)); });
await p.evaluate(() => VitaDoctorPanel.refresh()); await sleep(800);
const s6 = await p.evaluate(() => ({ detail: !document.getElementById('vdpDetailPanel').classList.contains('hidden'), list: document.getElementById('vdpPatientList').innerText, body: document.body.innerText }));
log('İzin geri alınınca ayrıntı kapanır, "Erişim sona erdi", liste boş', !s6.detail && /Henüz size erişim izni veren hasta yok/.test(s6.list) && /Erişim sona erdi/.test(s6.body), JSON.stringify({ detail: s6.detail, list: s6.list }));
const s6b = await p.evaluate(async () => { const c = await VitaCloud.getClient(); const r = await c.from('doctor_notes').insert({ doctor_id: activeUserId, patient_id: JSON.parse(localStorage.getItem('__fakeLinks'))[0].patient_id, body: 'x' }).select('id'); return r.error ? r.error.code : 'ACIK'; });
log('İzin geri alındıktan sonra not yazılamaz (RLS)', s6b === '42501', s6b);

/* 7) Masaüstü düzeni + yatay taşma yok */
await p.setViewport({ width: 1200, height: 900 }); await sleep(300);
const s7 = await p.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, iw: innerWidth }));
await p.setViewport({ width: 390, height: 844 }); await sleep(300);
const s7m = await p.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, iw: innerWidth }));
log('Doktor panelinde yatay taşma yok (telefon ve masaüstü)', s7.sw <= s7.iw + 1 && s7m.sw <= s7m.iw + 1, JSON.stringify({ s7, s7m }));

/* 8) Çıkışta menü gizlenir */
await p.evaluate(() => handleLogout()); await sleep(300);
log('Çıkışta "Doktor Paneli" menüsü gizlenir', await p.evaluate(() => document.getElementById('drawerSectionDoctor').classList.contains('hidden')));

const icons = await p.evaluate(() => [...document.querySelectorAll('#view-doctor i[class*="fa-"], #drawerSectionDoctor i[class*="fa-"]')].map(i => ({ c: [...i.classList].find(x => x.startsWith('fa-') && x !== 'fa-solid'), ok: (getComputedStyle(i, '::before').content || '').replace(/"/g, '').trim().length === 1 })).filter(x => !x.ok).map(x => x.c));
log('Doktor paneli simgeleri tanımlı', icons.length === 0, icons.join(', '));
const diag = await p.evaluate(() => VitaTakipDiagnostics.run());
const failed = diag.results.filter(x => !x.passed).map(x => x.name);
log(`Uygulama içi tanılama (${diag.passed}/${diag.results.length})`, failed.length === 0, failed.join(', '));
log('Sayfa hatası yok', errs.length === 0, errs.join(' | '));
console.log(`ÖZET ${results.filter(Boolean).length}/${results.length}`);
await b.close();
