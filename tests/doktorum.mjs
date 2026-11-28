/* Doktor paneli 3. adım: Ayarlar > "Doktorum" (hasta tarafı). Sahte bulut (tests/bulut-sahte.mjs): __fakeDoctors, bağlantı ve notlar.
   Erişim kurallarının kendisi veritabanında test edilir: supabase/tests/doktor_rls_test.sql
   Çalıştırma: VT_PORT=8090 node tests/doktorum.mjs */
import { boot, sleep } from './lib.mjs';
import { fakeCloudPreload } from './bulut-sahte.mjs';

const { b, p, errs } = await boot({ register: false, preload: fakeCloudPreload });
await p.setViewport({ width: 390, height: 844 });
p.setDefaultTimeout(20000);
let dialogs = [], answer = true;
p.on('dialog', d => { dialogs.push(d.message()); answer ? d.accept() : d.dismiss(); });
const results = []; const log = (n, ok, d) => { results.push(ok); console.log((ok ? 'OK   ' : 'FAIL ') + n + (d ? ' -> ' + d : '')); };
const vis = id => p.evaluate(id => { const e = document.getElementById(id); return !!e && e.getClientRects().length > 0; }, id);
const fill = (id, v) => p.evaluate((id, v) => { document.getElementById(id).value = v; }, id, v);
const msg = () => p.evaluate(() => ({ text: document.getElementById('doctorAddMsg').textContent, tone: document.getElementById('doctorAddMsg').getAttribute('data-tone') }));
const openSettings = async () => { await p.evaluate(() => { navigateToView('view-settings'); window.openSettingsSectionFor(document.getElementById('doctorCodeInput') || document.getElementById('doctorsLocalNote')); }); await sleep(300); };
const add = async code => { await fill('doctorCodeInput', code); await p.click('#doctorAddBtn'); await sleep(500); };

/* 0) Yerel hesapta "bulut hesabı gerekir" notu */
await p.evaluate(() => { VitaAuthUI.showLocal(); switchAuthMode('register'); const cb = document.getElementById('authRememberMeCheckbox'); cb.checked = false; syncRememberMeButtonUI(false); });
await fill('authInputFullName', 'Yerel Kisi'); await fill('authInputPassword', 'yerel12345'); await fill('authInputPasswordConfirm', 'yerel12345');
await p.click('#authSubmitBtn'); await sleep(1500);
await p.evaluate(() => { try { closeProfileModal(); } catch (e) {} try { finishVitaSpotlightTour(true); } catch (e) {} });
await openSettings();
const s0 = { card: await vis('settingsSectionDoctors'), local: await vis('doctorsLocalNote'), body: await vis('doctorsCloudBody') };
log('Yerel hesapta Doktorum kartı "bulut hesabı gerekir" der, form yok', s0.card && s0.local && !s0.body, JSON.stringify(s0));
await p.evaluate(() => handleLogout()); await sleep(300);

/* Hazırlık: bulut hasta hesabı + iki sahte doktor (biri onaylı) + bir not */
await p.evaluate(() => {
  window.__fakeDoctors = { 'DR-4829': { id: 'd0000000-0000-4000-8000-00000000000d', full_name: 'Dr. Deniz Ak', verified: true }, 'DR-5555': { id: 'e0000000-0000-4000-8000-00000000000e', full_name: 'Dr. Onaysız', verified: false } };
  VitaAuthUI.showCloud(); VitaAuthUI.setMode('register'); VitaAuthUI.setAcct('patient');
});
await fill('cloudInputFullName', 'Hasta Pelin'); await fill('cloudInputIdentifier', 'pelin'); await fill('cloudInputPassword', 'hasta1234'); await fill('cloudInputPasswordConfirm', 'hasta1234');
await p.evaluate(() => { cloudConsentCheckbox.checked = true; });
await p.click('#cloudSubmitBtn'); await sleep(1500);
await p.evaluate(() => { try { closeProfileModal(); } catch (e) {} try { finishVitaSpotlightTour(true); } catch (e) {} });
await openSettings();

/* 1) Bulut hasta: form + boş listeler */
const s1 = { body: await vis('doctorsCloudBody'), local: await vis('doctorsLocalNote'), empty: await p.evaluate(() => document.getElementById('doctorList').innerText + ' | ' + document.getElementById('doctorNotesList').innerText) };
log('Bulut hasta: kod formu, "henüz izin vermediniz" ve "henüz not yok"', s1.body && !s1.local && /Henüz bir doktora erişim izni vermediniz/.test(s1.empty) && /henüz not yazmadı/.test(s1.empty), JSON.stringify(s1));

/* 2) Hatalı kod / olmayan / onaysız */
await add('XYZ'); const m1 = await msg();
await add('DR-0001'); const m2 = await msg();
await add('DR-5555'); const m3 = await msg();
log('Hatalı kod, olmayan kod, onaysız doktor: anlaşılır uyarı', /biçimi hatalı/.test(m1.text) && /bulunamadı/.test(m2.text) && /henüz onaylanmadı/.test(m3.text) && m3.tone === 'error', JSON.stringify([m1.text, m2.text, m3.text]));

/* 3) Onay sorusu reddedilirse izin verilmez */
answer = false; dialogs = []; await add('dr4829'); answer = true;
const s3 = await p.evaluate(() => JSON.parse(localStorage.getItem('__fakeLinks') || '[]').length);
log('Onay sorusu (ne paylaşılacağını söyler) reddedilince izin verilmez', s3 === 0 && /profil, takviye, ilaç, tahlil, belirti/.test(dialogs[0] || '') && /yalnızca okuyabilir/.test(dialogs[0] || ''), (dialogs[0] || '').slice(0, 90));

/* 4) İzin ver (küçük harf, tiresiz kod) */
dialogs = []; await add('dr4829'); await sleep(300);
const s4 = await p.evaluate(() => ({ list: document.getElementById('doctorList').innerText.replace(/\s+/g, ' '), input: document.getElementById('doctorCodeInput').value, summary: document.getElementById('settingsDoctorsSummary').textContent, links: JSON.parse(localStorage.getItem('__fakeLinks') || '[]') }));
const m4 = await msg();
log('İzin verildi: "Dr. Deniz Ak artık kayıtlarınızı görebilir", listede ad + kod + tarih', /Dr\. Deniz Ak artık kayıtlarınızı görebilir/.test(m4.text) && /Dr\. Deniz Ak/.test(s4.list) && /DR-4829/.test(s4.list) && /İzin:/.test(s4.list) && s4.input === '' && s4.links[0].status === 'active', JSON.stringify(s4));
log('Bölüm başlığı özeti: "1 doktor erişebiliyor"', /^1 doktor erişebiliyor/.test(s4.summary), s4.summary);

/* 5) Doktor notu görünür; HTML olarak değil düz metin (XSS yok) */
await p.evaluate(() => {
  const uid = activeUserId;
  localStorage.setItem('__fakeNotes', JSON.stringify([
    { id: 'n1', patient_id: uid, doctor_label: 'Dr. Deniz Ak', body: 'D3 dozunu 3 ay sonra kontrol edelim.', created_at: '2026-11-20T10:00:00Z' },
    { id: 'n2', patient_id: uid, doctor_label: '<img src=x onerror="window.__xss=1">Dr', body: '<script>window.__xss=2</script><b>kalın</b>', created_at: '2026-11-21T10:00:00Z' }
  ]));
  return VitaDoctors.refresh();
}); await sleep(400);
const s5 = await p.evaluate(() => ({ text: document.getElementById('doctorNotesList').innerText, xss: window.__xss || 0, tags: document.getElementById('doctorNotesList').querySelectorAll('img,script,b').length }));
log('Doktor notları listelenir (yeni üstte)', /D3 dozunu 3 ay sonra kontrol edelim\./.test(s5.text) && s5.text.indexOf('<script>') < s5.text.indexOf('D3 dozunu'), s5.text.slice(0, 80));
log('Not ve doktor adı HTML olarak işlenmez (betik çalışmaz, etiket oluşmaz)', s5.xss === 0 && s5.tags === 0 && /<script>window\.__xss=2<\/script>/.test(s5.text), JSON.stringify({ xss: s5.xss, tags: s5.tags }));

/* 6) İzni geri al */
// Doğrudan tıklama: ekranın altındaki bildirim (toast) koordinatla tıklamayı karşılayabilir
dialogs = []; await p.evaluate(() => document.querySelector('[data-doctor-revoke]').click()); await sleep(500);
const s6 = await p.evaluate(() => ({ list: document.getElementById('doctorList').innerText, links: JSON.parse(localStorage.getItem('__fakeLinks') || '[]'), notes: document.getElementById('doctorNotesList').innerText }));
log('İzni geri al: onay sorusu, liste boşalır, bağlantı "revoked", notlar hastada kalır', /artık kayıtlarınızı göremeyecek/.test(dialogs[0] || '') && /Henüz bir doktora erişim izni vermediniz/.test(s6.list) && s6.links[0].status === 'revoked' && /D3 dozunu/.test(s6.notes), JSON.stringify({ d: (dialogs[0] || '').slice(0, 60), status: s6.links[0].status }));

/* 7) Doktor hesabında Doktorum kartı görünmez */
await p.evaluate(() => handleLogout()); await sleep(300);
await p.evaluate(() => { VitaAuthUI.showCloud(); VitaAuthUI.setMode('register'); VitaAuthUI.setAcct('doctor'); });
await fill('cloudInputFullName', 'Dr. Kendi'); await fill('cloudInputIdentifier', 'dr_kendi'); await fill('cloudInputPassword', 'doktor123'); await fill('cloudInputPasswordConfirm', 'doktor123');
await p.evaluate(() => { cloudDoctorConsentCheckbox.checked = true; }); await p.click('#cloudSubmitBtn'); await sleep(1500);
await p.evaluate(() => navigateToView('view-settings')); await sleep(300);
log('Doktor hesabında "Doktorum" kartı görünmez', !(await vis('settingsSectionDoctors')));

if (process.env.VT_SHOTS) {
  await p.evaluate(() => handleLogout()); await sleep(300);
  await p.evaluate(() => { VitaAuthUI.showCloud(); VitaAuthUI.setMode('login'); });
  await fill('cloudInputIdentifier', 'pelin'); await fill('cloudInputPassword', 'hasta1234'); await p.click('#cloudSubmitBtn'); await sleep(1200);
  await p.evaluate(() => { try { closeProfileModal(); } catch (e) {} window.__dialogsOff = 1; }); dialogs = [];
  await openSettings(); await add('DR-4829'); await sleep(400);
  await (await p.$('#settingsSectionDoctors')).screenshot({ path: process.env.VT_SHOTS + '/doktorum.png' });
}

/* 8) KVKK metni: doktor paylaşımı, yalnız onaylı doktor, salt okuma, izni geri alma, notların akıbeti */
const kv = await p.evaluate(() => document.getElementById('kvkkInfoBody').innerText.replace(/\s+/g, ' '));
log('KVKK: doktorla paylaşım (yalnız okuma, onaylı doktor, geri alma) ve notların anonimleşmesi yazılı', /Doktorunuzla paylaşım/.test(kv) && /yalnızca okuyabilir/.test(kv) && /onaylanmış doktor/.test(kv) && /geri alırsınız/.test(kv) && /Anonim hasta/.test(kv), kv.slice(kv.indexOf('Doktorunuzla'), kv.indexOf('Doktorunuzla') + 80));

const diag = await p.evaluate(() => VitaTakipDiagnostics.run());
const failed = diag.results.filter(x => !x.passed).map(x => x.name);
log(`Uygulama içi tanılama (${diag.passed}/${diag.results.length})`, failed.length === 0, failed.join(', '));
log('Sayfa hatası yok', errs.length === 0, errs.join(' | '));
console.log(`ÖZET ${results.filter(Boolean).length}/${results.length}`);
await b.close();
