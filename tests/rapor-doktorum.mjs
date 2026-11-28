/* Yerel hesabın kaldırılması + eski yerel verinin temizlenmesi, Ayarlar > Hesap ve güvenlik (şifre değiştirme),
   Rapor | Doktorum sekmeleri, yeni not / istek rozeti ve doktor notlarına yanıt (yazışma). Sahte bulutla.
   Gerçek kurallar: supabase/migrations/20261128220000_not_yanitlari.sql (SQL davranış testi oturumda: 12/12).
   Çalıştırma: VT_PORT=8090 node tests/rapor-doktorum.mjs  (VT_SHOTS=<klasör> ekran görüntüsü) */
import { boot, sleep } from './lib.mjs';
import { fakeCloudPreload } from './bulut-sahte.mjs';

const { b, p, errs } = await boot({ register: false, preload: fakeCloudPreload });
await p.setViewport({ width: 390, height: 844 });
p.setDefaultTimeout(20000);
const dialogs = []; p.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
const results = []; const log = (n, ok, d) => { results.push(ok); console.log((ok ? 'OK   ' : 'FAIL ') + n + (d ? ' -> ' + d : '')); };
const vis = id => p.evaluate(id => { const e = document.getElementById(id); return !!e && e.getClientRects().length > 0; }, id);
const txt = id => p.evaluate(id => (document.getElementById(id) || {}).textContent || '', id);
const fill = (id, v) => p.evaluate((id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, id, v);
const shot = async name => { if (process.env.VT_SHOTS) await p.screenshot({ path: process.env.VT_SHOTS + '/' + name + '.png', fullPage: true }); };
const close = () => p.evaluate(() => { try { closeProfileModal(); } catch (e) {} try { finishVitaSpotlightTour(true); } catch (e) {} });
async function signup(acct, name, id, pass) {
  await p.evaluate(a => { openAuthModal(); VitaAuthUI.showCloud(); VitaAuthUI.setAcct(a); VitaAuthUI.setMode('register'); }, acct);
  await fill('cloudInputFullName', name); await fill('cloudInputIdentifier', id); await fill('cloudInputPassword', pass); await fill('cloudInputPasswordConfirm', pass);
  await p.evaluate(a => { if (a === 'doctor') cloudDoctorConsentCheckbox.checked = true; else cloudConsentCheckbox.checked = true; document.getElementById('cloudSubmitBtn').click(); }, acct);
  await sleep(1500); await close(); return p.evaluate(() => activeUserId);
}
async function login(id, pass) {
  await p.evaluate(() => { openAuthModal(); VitaAuthUI.showCloud(); VitaAuthUI.setMode('login'); });
  await fill('cloudInputIdentifier', id); await fill('cloudInputPassword', pass);
  await p.evaluate(() => document.getElementById('cloudSubmitBtn').click()); await sleep(2000); await close();
  return p.evaluate(() => ({ uid: activeUserId, err: cloudErrorMsg.textContent }));
}
const logout = async () => { await p.evaluate(() => handleLogout()); await sleep(400); };

/* 1) Yerel hesap kaldırıldı: giriş ekranında seçenek yok; eski yerel veri silindi, bulut kopyası korundu */
// Güncelleme öncesi cihaz: bir YEREL hesap (+ verisi) ve bir BULUT hesabının cihaz kopyası; temizlik bayrağı yok
await p.evaluate(() => {
  localStorage.removeItem('vitatakip_local_accounts_purged_v1');
  localStorage.setItem('vitatakip_users_db', JSON.stringify([{ id: 'usr_eski_yerel', fullName: 'Eski Yerel', passwordHash: 'x' }]));
  localStorage.setItem('vitatakip_user_usr_eski_yerel', JSON.stringify({ name: 'Eski Yerel', age: 40 }));
  localStorage.setItem('vitatakip_supplements_usr_eski_yerel', JSON.stringify([{ id: 's', name: 'Eski Takviye' }]));
  localStorage.setItem('vitatakip_remembered_user_id', 'usr_eski_yerel');
  localStorage.setItem('vitatakip_auth_panel', 'local');
  localStorage.setItem('vitatakip_user_11111111-2222-4333-8444-555555555555', JSON.stringify({ name: 'Bulut Kopyası' }));
});
await p.reload({ waitUntil: 'networkidle2' }); await sleep(1500);
const s1 = await p.evaluate(() => ({
  localBtn: !!document.getElementById('authShowLocalBtn'), panel: VitaAuthUI.currentPanel(),
  users: localStorage.getItem('vitatakip_users_db'), localData: localStorage.getItem('vitatakip_user_usr_eski_yerel'), localSup: localStorage.getItem('vitatakip_supplements_usr_eski_yerel'),
  remembered: localStorage.getItem('vitatakip_remembered_user_id'), cloudCopy: localStorage.getItem('vitatakip_user_11111111-2222-4333-8444-555555555555'),
  flag: localStorage.getItem('vitatakip_local_accounts_purged_v1'), localCardShown: document.getElementById('authLocalMethodCard').getClientRects().length > 0
}));
log('Giriş ekranında "yerel hesap" seçeneği yok; ekran hesap paneliyle açılır', !s1.localBtn && s1.panel === 'cloud' && !s1.localCardShown, JSON.stringify({ localBtn: s1.localBtn, panel: s1.panel }));
log('Eski yerel hesap ve verileri silindi; bulut hesabının cihaz kopyası korundu', s1.flag === '1' && !/usr_eski_yerel/.test(s1.users || '') && s1.localData === null && s1.localSup === null && s1.remembered === null && /Bulut Kopyası/.test(s1.cloudCopy || ''), JSON.stringify(s1).slice(0, 300));
await shot('rd-1-giris');

/* Hesaplar: onaylı doktor Ayşe, hasta Pelin (Ayşe'ye izin verir) */
const ayse = await signup('doctor', 'Dr. Ayşe Kaya', 'dr_ayse', 'doktor1'); await logout();
await p.evaluate(a => { window.__verifiedDoctors = [a]; }, ayse);
const pelin = await signup('patient', 'Pelin Hasta', 'pelin', 'hasta11');

/* 2) Ayarlar: Doktorum yok; "Hesap ve güvenlik" kartında giriş bilgisi, şifre, kurtarma kodu, hesabı silme */
await p.evaluate(() => navigateToView('view-settings')); await sleep(600);
const s2 = await p.evaluate(() => ({
  doctorsInSettings: !!document.querySelector('#view-settings #doctorsPanel, #view-settings #doctorCodeInput'),
  acc: !!document.getElementById('settingsSectionAccount'),
  inAcc: ['settingsPasswordForm', 'settingsRecoveryRow', 'settingsDeleteAccountDesc'].map(id => !!document.querySelector('#settingsSectionAccount #' + id)),
  login: document.getElementById('settingsAccountLogin').textContent, type: document.getElementById('settingsAccountType').textContent,
  summary: (document.getElementById('settingsSectionAccountSummary') || {}).textContent || ''
}));
log('Ayarlar: Doktorum kartı yok; "Hesap ve güvenlik" kartı var', !s2.doctorsInSettings && s2.acc, JSON.stringify(s2));
log('Hesap ve güvenlik: şifre değiştir, kurtarma kodu ve hesabı silme aynı kartta; giriş "@pelin · Hasta hesabı"', s2.inAcc.every(Boolean) && s2.login === '@pelin' && /Hasta hesabı/.test(s2.type) && /@pelin/.test(s2.summary), JSON.stringify({ inAcc: s2.inAcc, login: s2.login, summary: s2.summary }));
await p.evaluate(() => { window.openSettingsSectionFor && window.openSettingsSectionFor(document.getElementById('settingsPasswordRow')); document.getElementById('settingsPasswordRow').open = true; }); await sleep(200);
await shot('rd-2-hesap-guvenlik');

/* 3) Şifre değiştirme */
const pw = async (cur, n1, n2) => { await fill('settingsPwCurrent', cur); await fill('settingsPwNew', n1); await fill('settingsPwNew2', n2); await p.evaluate(() => document.getElementById('settingsPwSave').click()); await sleep(700); return txt('settingsPwMsg'); };
const m3a = await pw('yanlis11', 'yenisifre1', 'yenisifre1');
const m3b = await pw('hasta11', 'yenisifre1', 'baska1234');
const m3c = await pw('hasta11', 'abc', 'abc');
const m3d = await pw('hasta11', 'yenisifre1', 'yenisifre1');
log('Şifre değiştir: mevcut şifre hatalı / eşleşmeyen / kısa şifre reddedilir', /Mevcut şifreniz hatalı/.test(m3a) && /eşleşmiyor/.test(m3b) && /en az 6/.test(m3c), JSON.stringify({ m3a, m3b, m3c }));
log('Doğru mevcut şifreyle yeni şifre kaydedilir; alanlar temizlenir', /Şifreniz değiştirildi/.test(m3d) && (await p.evaluate(() => settingsPwCurrent.value + settingsPwNew.value)) === '', m3d);
await logout();
const l3a = await login('pelin', 'hasta11');
const l3b = await login('pelin', 'yenisifre1');
log('Eski şifreyle giriş olmaz, yeni şifreyle olur', l3a.uid === null && /hatalı/.test(l3a.err) && l3b.uid === pelin, JSON.stringify({ l3a, l3b: l3b.uid }));

/* 4) Rapor | Doktorum sekmeleri: varsayılan Rapor; Doktorum sekmesinde izin verilir */
await p.evaluate(() => navigateToView('view-report')); await sleep(500);
const s4 = { tabs: await p.evaluate(() => [...document.querySelectorAll('[data-report-tab]')].map(b => b.textContent.trim() + ':' + b.getAttribute('aria-selected')).join(' | ')), rep: await vis('reportTab-report'), doc: await vis('reportTab-doctors') };
log('Rapor sayfası iki sekmeli: "Rapor" seçili, Doktorum gizli', /Rapor:true/.test(s4.tabs) && /Doktorum.*:false/.test(s4.tabs) && s4.rep && !s4.doc, JSON.stringify(s4));
await p.click('[data-report-tab="doctors"]'); await sleep(700);
const s4b = { rep: await vis('reportTab-report'), doc: await vis('reportTab-doctors'), dir: await txt('doctorDirList') };
log('"Doktorum" sekmesi: rapor gizlenir, onaylı doktorlar listelenir', !s4b.rep && s4b.doc && /Dr\. Ayşe Kaya/.test(s4b.dir), JSON.stringify({ rep: s4b.rep, doc: s4b.doc }));
await p.evaluate(() => { const li = [...document.querySelectorAll('#doctorDirList li')].find(x => x.textContent.includes('Ayşe')); li.querySelector('[data-doctor-grant]').click(); }); await sleep(800);
await p.click('[data-report-tab="report"]'); await sleep(200);
await logout();

/* 5) Doktor not yazar → hastada rozet (sekme, yan menü, alt menü); Doktorum açılınca not rozeti sıfırlanır */
await login('dr_ayse', 'doktor1');
await p.evaluate(() => { if (state.activeTab !== 'view-doctor') navigateToView('view-doctor'); }); await sleep(900);
await p.evaluate(() => document.querySelector('[data-patient-id]').click()); await sleep(900);
await fill('vdpNoteInput', 'D3 dozunu artıralım.'); await p.evaluate(() => document.getElementById('vdpNoteSave').click()); await sleep(800);
await logout();
await login('pelin', 'yenisifre1'); await sleep(800);
const s5 = await p.evaluate(() => ({ tab: document.getElementById('reportDoctorsBadge').textContent, tabShown: !document.getElementById('reportDoctorsBadge').classList.contains('hidden'),
  drawer: (document.querySelector('#drawer-nav-view-report .vt-nav-badge') || {}).textContent || '', mobile: (document.querySelector('#mobile-nav-view-report .vt-nav-badge') || {}).textContent || '' }));
log('Yeni doktor notu: Doktorum sekmesinde, yan menüde ve alt menüde "1" rozeti', s5.tabShown && s5.tab === '1' && s5.drawer === '1' && s5.mobile === '1', JSON.stringify(s5));
await shot('rd-3-rozet');
await p.evaluate(() => VitaDoctors.open()); await sleep(900);
const s5b = await p.evaluate(() => ({ tabShown: !document.getElementById('reportDoctorsBadge').classList.contains('hidden'), drawer: !!document.querySelector('#drawer-nav-view-report .vt-nav-badge'), notes: document.getElementById('doctorNotesList').textContent }));
log('Doktorum açılınca rozet kalkar; not görünür', !s5b.tabShown && !s5b.drawer && /D3 dozunu artıralım/.test(s5b.notes), JSON.stringify({ tabShown: s5b.tabShown, drawer: s5b.drawer }));

/* 6) Hasta nota yanıt yazar → doktor görür ve yanıtlar → hasta görür; rozet doktor yanıtında yine çıkar */
await p.evaluate(() => { const f = document.querySelector('[data-reply-note]'); f.querySelector('input').value = 'Aç karnına mı alayım?'; f.querySelector('button').click(); }); await sleep(900);
const s6 = await p.evaluate(() => document.getElementById('doctorNotesList').textContent);
log('Hasta yanıtı not altında "Siz" olarak görünür', /Siz · .*Aç karnına mı alayım\?/.test(s6), s6.slice(0, 160));
await shot('rd-4-yazisma');
await logout();
await login('dr_ayse', 'doktor1');
await p.evaluate(() => { if (state.activeTab !== 'view-doctor') navigateToView('view-doctor'); }); await sleep(900);
await p.evaluate(() => document.querySelector('[data-patient-id]').click()); await sleep(1000);
const s6b = await p.evaluate(() => document.getElementById('vdpNoteList').textContent);
await p.evaluate(() => { const f = document.querySelector('[data-vdp-reply-note]'); f.querySelector('input').value = 'Evet, sabah aç karnına.'; f.querySelector('button').click(); }); await sleep(1000);
const s6c = await p.evaluate(() => document.getElementById('vdpNoteList').textContent);
log('Doktor panelinde hastanın yanıtı görünür; doktor yanıt yazar', /Pelin Hasta · .*Aç karnına mı alayım\?/.test(s6b) && /Siz · .*Evet, sabah aç karnına\./.test(s6c), s6c.slice(0, 200));
await logout();
await login('pelin', 'yenisifre1'); await sleep(800);
const s6d = await p.evaluate(() => document.getElementById('reportDoctorsBadge').textContent);
await p.evaluate(() => VitaDoctors.open()); await sleep(900);
const s6e = await p.evaluate(() => document.getElementById('doctorNotesList').textContent);
log('Doktorun yanıtı rozet çıkarır ve yazışmada görünür', s6d === '1' && /Dr\. Ayşe Kaya \(?.*Evet, sabah aç karnına\./.test(s6e), JSON.stringify({ s6d, s6e: s6e.slice(0, 200) }));

/* 7) İzin geri alınınca yazışma salt okunur */
await p.evaluate(() => document.querySelector('[data-doctor-revoke]').click()); await sleep(900);
const s7 = await p.evaluate(() => ({ form: !!document.querySelector('[data-reply-note]'), closed: document.getElementById('doctorNotesList').textContent }));
const s7b = await p.evaluate(async () => { const c = await VitaCloud.getClient(); const n = JSON.parse(localStorage.getItem('__fakeNotes'))[0]; const r = await c.from('note_replies').insert({ note_id: n.id, author_id: activeUserId, author_role: 'patient', body: 'izinsiz' }); return r.error ? r.error.code : 'YAZILDI'; });
log('İzin geri alınınca yanıt formu kalkar ("yanıt yazılamaz"); sunucu da reddeder', !s7.form && /yanıt yazılamaz/.test(s7.closed) && /Aç karnına mı alayım/.test(s7.closed) && s7b === '42501', JSON.stringify({ form: s7.form, s7b }));

/* 8) Doktor hesabında Rapor sayfasında Doktorum sekmesi yok */
await logout();
await login('dr_ayse', 'doktor1');
await p.evaluate(() => navigateToView('view-report')); await sleep(400);
log('Doktor hesabında "Doktorum" sekmesi görünmez', !(await vis('reportTabBtnDoctors')) && (await vis('reportTab-report')));

/* 9) Görünüm */
const ov = await p.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, iw: innerWidth }));
log('Telefonda yatay taşma yok', ov.sw <= ov.iw + 1, JSON.stringify(ov));
const icons = await p.evaluate(() => [...document.querySelectorAll('#reportTabs i[class*="fa-"], #settingsSectionAccount i[class*="fa-"]')].map(i => ({ c: [...i.classList].find(x => x.startsWith('fa-') && x !== 'fa-solid'), ok: (getComputedStyle(i, '::before').content || '').replace(/"/g, '').trim().length === 1 })).filter(x => !x.ok).map(x => x.c));
log('Simgeler tanımlı', icons.length === 0, icons.join(', '));
log('Sayfa hatası yok', errs.length === 0, errs.join(' | '));
console.log(`ÖZET ${results.filter(Boolean).length}/${results.length}`);
await b.close();
