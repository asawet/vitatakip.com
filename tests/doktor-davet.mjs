/* Doktor rehberi (hasta: Rapor > Doktorum) + doktordan hastaya erişim isteği (Doktor Paneli), sahte bulutla.
   Gerçek kurallar: supabase/migrations/20261128200000_doktor_rehberi_davet.sql (SQL davranış testi oturumda: 21/21).
   Çalıştırma: VT_PORT=8090 node tests/doktor-davet.mjs  (VT_SHOTS=<klasör> ekran görüntüsü) */
import { boot, sleep } from './lib.mjs';
import { fakeCloudPreload } from './bulut-sahte.mjs';

const { b, p, errs } = await boot({ register: false, preload: fakeCloudPreload });
await p.setViewport({ width: 390, height: 844 });
p.setDefaultTimeout(20000);
const dialogs = []; p.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
const results = []; const log = (n, ok, d) => { results.push(ok); console.log((ok ? 'OK   ' : 'FAIL ') + n + (d ? ' -> ' + d : '')); };
const vis = id => p.evaluate(id => { const e = document.getElementById(id); return !!e && e.getClientRects().length > 0; }, id);
const txt = id => p.evaluate(id => (document.getElementById(id) || {}).innerText || '', id);
const fill = (id, v) => p.evaluate((id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, id, v);
const shot = async name => { if (process.env.VT_SHOTS) await p.screenshot({ path: process.env.VT_SHOTS + '/' + name + '.png', fullPage: true }); };
const close = () => p.evaluate(() => { try { closeProfileModal(); } catch (e) {} try { finishVitaSpotlightTour(true); } catch (e) {} });
async function signup(acct, name, id, pass) {
  await p.evaluate(a => { VitaAuthUI.showCloud(); VitaAuthUI.setAcct(a); VitaAuthUI.setMode('register'); }, acct);
  await fill('cloudInputFullName', name); await fill('cloudInputIdentifier', id); await fill('cloudInputPassword', pass); await fill('cloudInputPasswordConfirm', pass);
  await p.evaluate(a => { if (a === 'doctor') cloudDoctorConsentCheckbox.checked = true; else cloudConsentCheckbox.checked = true; }, acct);
  await p.click('#cloudSubmitBtn'); await sleep(1500); await close();
  const id2 = await p.evaluate(() => activeUserId);
  await p.evaluate(() => handleLogout()); await sleep(300);
  return id2;
}
async function login(id, pass) {
  await p.evaluate(() => { VitaAuthUI.showCloud(); VitaAuthUI.setMode('login'); });
  await fill('cloudInputIdentifier', id); await fill('cloudInputPassword', pass); await p.click('#cloudSubmitBtn'); await sleep(2200); await close();
}
const logout = async () => { await p.evaluate(() => handleLogout()); await sleep(400); };
const openDoctors = async () => { await p.evaluate(() => VitaDoctors.open()); await sleep(900); };
const openPanel = async () => { await p.evaluate(() => { if (state.activeTab !== 'view-doctor') navigateToView('view-doctor'); }); await sleep(900); };
const invite = async who => { await fill('vdpInviteInput', who); await p.click('#vdpInviteBtn'); await sleep(600); return txt('vdpInviteMsg'); };

/* Hesaplar: 3 doktor (Ayşe ve Mehmet onaylı, Can onaysız), 2 hasta (takma adlı Pelin, e-postalı Eda) */
const ayse = await signup('doctor', 'Dr. Ayşe Kaya', 'dr_ayse', 'doktor1');
const mehmet = await signup('doctor', 'Dr. Mehmet Er', 'dr_mehmet', 'doktor2');
await signup('doctor', 'Dr. Can Onaysız', 'dr_can', 'doktor3');
await signup('patient', 'Pelin Hasta', 'pelin', 'hasta11');
await signup('patient', 'Eda Hasta', 'eda@ornek.com', 'hasta22');
await p.evaluate((a, m) => { window.__verifiedDoctors = [a, m]; }, ayse, mehmet);

/* 1) Hasta: onaylı doktor rehberi (yalnız ad + kod; onaysız yok), arama, listeden izin */
await login('pelin', 'hasta11'); await openDoctors();
const d1 = await txt('doctorDirList');
log('Rehber: yalnız onaylı doktorlar (Ayşe, Mehmet), onaysız Can yok', /Dr\. Ayşe Kaya/.test(d1) && /Dr\. Mehmet Er/.test(d1) && !/Can/.test(d1) && (d1.match(/İzin ver/g) || []).length === 2, d1.replace(/\n/g, ' | '));
await fill('doctorDirSearch', 'MEHMET'); await sleep(100);
const d1s = await txt('doctorDirList');
const code = await p.evaluate(() => { const m = document.getElementById('doctorDirList').innerText.match(/DR-\d+/); return m && m[0]; });
await fill('doctorDirSearch', code); await sleep(100);
const d1c = await txt('doctorDirList');
await fill('doctorDirSearch', 'zzz'); await sleep(100);
const d1z = await txt('doctorDirList');
await fill('doctorDirSearch', '');
log('Rehberde arama: ad (büyük harf), kod; eşleşme yoksa açıklama', /Mehmet/.test(d1s) && !/Ayşe/.test(d1s) && /Mehmet/.test(d1c) && /eşleşen onaylı doktor yok/.test(d1z), JSON.stringify({ code }));
await shot('davet-1-rehber');
await p.evaluate(() => { const li = [...document.querySelectorAll('#doctorDirList li')].find(x => x.innerText.includes('Ayşe')); li.querySelector('[data-doctor-grant]').click(); }); await sleep(900);
const s1 = { dir: await txt('doctorDirList'), mine: await txt('doctorList'), dlg: dialogs.pop() || '' };
log('Listeden "İzin ver": onay penceresi, Ayşe "İzin verildi" olur ve izin listesine girer', /yalnızca okuyabilir/.test(s1.dlg) && /Dr\. Ayşe Kaya\s*\S*\s*İzin verildi/.test(s1.dir.replace(/\n/g, ' ')) && /Dr\. Ayşe Kaya/.test(s1.mine), JSON.stringify({ dir: s1.dir.replace(/\n/g, ' | ') }));
await logout();

/* 2) Onaysız doktor: davet kutusu yok */
await login('dr_can', 'doktor3'); await openPanel();
log('Onaysız doktor davet gönderemez (kutu gizli)', !(await vis('vdpInviteBox')));
await logout();

/* 3) Onaylı doktor Mehmet: davet gönderir; hatalı / tekrarlı istekler açıklanır; kabul edilmeden hasta listede yok */
await login('dr_mehmet', 'doktor2'); await openPanel();
const v3 = await vis('vdpInviteBox');
const m3a = await invite('yok_kimse');
const m3b = await invite('Ayşe K');
const m3c = await invite('@pelin');
const m3d = await invite('pelin');
const m3e = await invite('EDA@ornek.com');
await p.evaluate(() => { document.getElementById('vdpRequestsDetails').open = true; }); await sleep(100);
const r3 = await txt('vdpRequestList');
const pts3 = await txt('vdpPatientList');
log('Onaylı doktor: davet kutusu görünür', v3);
log('Bulunamayan / hatalı takma ad açıklanır', /hasta hesabı bulunamadı/.test(m3a) && /doğru yazın/.test(m3b), JSON.stringify({ m3a, m3b }));
log('"@pelin" ile istek gider; aynı hastaya ikinci istek "bekleyen bir isteğiniz var"', /İstek gönderildi/.test(m3c) && /bekleyen bir isteğiniz var/.test(m3d), JSON.stringify({ m3c, m3d }));
log('E-postayla istek (büyük harf); gönderilen istekler "Bekliyor"', /İstek gönderildi/.test(m3e) && /pelin/.test(r3) && /eda@ornek\.com/.test(r3) && (r3.match(/Bekliyor/g) || []).length === 2, r3.replace(/\n/g, ' | '));
log('Kabul edilmeden hasta "Hastalarım"da yok (veri görünmez)', !/Pelin/.test(pts3), pts3);
await shot('davet-2-doktor-istekler');
await p.evaluate(() => { const li = [...document.querySelectorAll('#vdpRequestList li')].find(x => x.innerText.includes('eda@')); li.querySelector('[data-request-cancel]').click(); }); await sleep(700);
log('Bekleyen istek geri çekilir ("Geri çekildi")', /eda@ornek\.com[\s\S]*Geri çekildi/.test(await txt('vdpRequestList')) && /geri çekildi/.test(await txt('vdpInviteMsg')));
await logout();

/* 4) Hasta Pelin: bildirim + "Erişim istekleri"; kabul = izin */
await login('pelin', 'hasta11');
const toast4 = await p.evaluate(() => document.body.innerText);
await openDoctors();
const s4 = { box: await vis('doctorRequestsBox'), list: await txt('doctorRequestList') };
log('Hastaya bildirim ve "Erişim istekleri": "Dr. Mehmet Er (DR-…) … izin istiyor"', /kayıtlarınızı görmek için izin istiyor/.test(toast4) && s4.box && /Dr\. Mehmet Er \(DR-\d+\)/.test(s4.list), s4.list.replace(/\n/g, ' | '));
await shot('davet-3-hasta-istek');
await p.evaluate(() => document.querySelector('[data-request-accept]').click()); await sleep(900);
const s4b = { box: await vis('doctorRequestsBox'), mine: await txt('doctorList'), dlg: dialogs.pop() || '' };
log('Kabul et: onay penceresi, istek kutusu kapanır, Mehmet izin listesine girer', /Kabul ediyor musunuz/.test(s4b.dlg) && !s4b.box && /Dr\. Mehmet Er/.test(s4b.mine), JSON.stringify({ box: s4b.box, mine: s4b.mine.replace(/\n/g, ' | ') }));
await logout();

/* 5) Doktor Mehmet: hasta artık "Hastalarım"da, istek "Kabul edildi"; tekrar istek "zaten izin vermiş" */
await login('dr_mehmet', 'doktor2'); await openPanel();
const pts5 = await txt('vdpPatientList');
await p.evaluate(() => { document.getElementById('vdpRequestsDetails').open = true; });
const r5 = await txt('vdpRequestList');
const m5 = await invite('pelin');
log('Kabul sonrası hasta "Hastalarım"da; istek "Kabul edildi"; yeni istek "zaten erişim izni vermiş"', /Pelin Hasta/.test(pts5) && /pelin[\s\S]*Kabul edildi/.test(r5) && /zaten erişim izni vermiş/.test(m5), JSON.stringify({ m5 }));

/* 6) Reddetme: Eda reddeder → doktor 7 gün yeni istek gönderemez */
const m6 = await invite('eda@ornek.com');
await logout();
await login('eda@ornek.com', 'hasta22'); await openDoctors();
await p.evaluate(() => document.querySelector('[data-request-decline]').click()); await sleep(800);
const s6 = { box: await vis('doctorRequestsBox'), msg: await txt('doctorAddMsg'), mine: await txt('doctorList') };
await logout();
await login('dr_mehmet', 'doktor2'); await openPanel();
const m6b = await invite('eda@ornek.com');
log('Reddet: kutu kapanır, izin verilmez; doktor 7 gün yeni istek gönderemez', /İstek gönderildi/.test(m6) && !s6.box && /reddedildi/.test(s6.msg) && !/Mehmet/.test(s6.mine) && /7 gün içinde yeni istek gönderilemez/.test(m6b), JSON.stringify({ s6, m6b }));

/* 7) Taşma, simgeler, sayfa hatası */
const ov = await p.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, iw: innerWidth }));
log('Telefonda yatay taşma yok', ov.sw <= ov.iw + 1, JSON.stringify(ov));
const icons = await p.evaluate(() => [...document.querySelectorAll('#vdpInviteBox i[class*="fa-"], #doctorsPanel i[class*="fa-"]')].map(i => ({ c: [...i.classList].find(x => x.startsWith('fa-') && x !== 'fa-solid'), ok: (getComputedStyle(i, '::before').content || '').replace(/"/g, '').trim().length === 1 })).filter(x => !x.ok).map(x => x.c));
log('Simgeler tanımlı', icons.length === 0, icons.join(', '));
log('Sayfa hatası yok', errs.length === 0, errs.join(' | '));
console.log(`ÖZET ${results.filter(Boolean).length}/${results.length}`);
await b.close();
